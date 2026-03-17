const crypto = require("node:crypto");

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DATA_API_BASE_URL = "https://data-api.polymarket.com";
const CLOB_BASE_URL = "https://clob.polymarket.com";

const POLYMARKET_SEARCH_CACHE_COLLECTION = "polymarket_search_cache";
const POLYMARKET_SIGNAL_CACHE_COLLECTION = "polymarket_signal_cache";
const POLYMARKET_SEARCH_CACHE_TTL_MINUTES = 15;
const POLYMARKET_SIGNAL_CACHE_TTL_MINUTES = 10;
const STRONG_MATCH_THRESHOLD = 0.72;
const REFERENCE_MATCH_THRESHOLD = 0.56;
const CALIBRATION_QUALITY_THRESHOLD = 0.58;
const MAX_CALIBRATION_SHIFT = 0.05;

const STOPWORDS = new Set([
  "a",
  "ad",
  "al",
  "alla",
  "alle",
  "all",
  "and",
  "by",
  "che",
  "chi",
  "con",
  "da",
  "dei",
  "del",
  "della",
  "delle",
  "di",
  "e",
  "entro",
  "for",
  "gli",
  "i",
  "il",
  "in",
  "is",
  "la",
  "le",
  "lo",
  "may",
  "nei",
  "nel",
  "nella",
  "nelle",
  "next",
  "of",
  "on",
  "or",
  "per",
  "piu",
  "possible",
  "possible?",
  "probable",
  "quanto",
  "se",
  "su",
  "that",
  "the",
  "to",
  "tra",
  "un",
  "una",
  "will",
]);

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNullableNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function clamp01(value, fallback = 0.5) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  if (next > 1) return Math.max(0, Math.min(1, next / 100));
  return Math.max(0, Math.min(1, next));
}

function normalizeText(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(value = "") {
  return [...new Set(
    normalizeText(value)
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !STOPWORDS.has(token))
  )];
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function mergeUniqueStrings(primary = [], secondary = [], limit = 8) {
  return [...new Set([...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])])]
    .filter((item) => typeof item === "string" && item.trim())
    .slice(0, limit);
}

function hashKey(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function getHorizonId(queryPlan = {}) {
  return (
    safeText(queryPlan?.filters?.horizon) ||
    safeText(queryPlan?.horizons?.[0]?.horizon_id) ||
    safeText(queryPlan?.constraints?.horizon) ||
    "30d"
  );
}

function horizonToTargetDays(horizonId = "30d") {
  switch (safeText(horizonId, "30d")) {
    case "now":
      return 7;
    case "7d":
      return 7;
    case "14d":
      return 14;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "6m":
      return 180;
    case "12m":
      return 365;
    default:
      return 30;
  }
}

function getDateDistanceScore(targetDays, endDate) {
  if (!endDate) return 0.45;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return 0.45;
  const deltaDays = (end.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (deltaDays < -2) return 0.05;
  const tolerance = Math.max(10, targetDays * 0.75);
  return clamp01(1 - Math.abs(deltaDays - targetDays) / tolerance, 0.2);
}

function getTokenOverlapScore(queryTokens, marketTokens) {
  if (!queryTokens.length || !marketTokens.length) return 0;
  const marketSet = new Set(marketTokens);
  const overlap = queryTokens.filter((token) => marketSet.has(token)).length;
  return clamp01(overlap / Math.max(3, Math.min(queryTokens.length, marketTokens.length)), 0);
}

function getEntityScore(queryPlan = {}, candidateText = "") {
  const entities = Array.isArray(queryPlan?.entities) ? queryPlan.entities : [];
  if (!entities.length) return 0.3;
  const haystack = normalizeText(candidateText);
  const hits = entities.filter((entity) => haystack.includes(normalizeText(entity?.label || ""))).length;
  return clamp01(hits / Math.max(1, entities.length), 0);
}

function hasBinaryYesNo(outcomes = []) {
  const normalized = outcomes.map((outcome) => normalizeText(String(outcome)));
  return normalized.length === 2 && normalized.includes("yes") && normalized.includes("no");
}

function flattenSearchResults(payload = {}) {
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (candidate) => {
    const slug = safeText(candidate.market_slug);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    candidates.push(candidate);
  };

  const events = Array.isArray(payload?.events) ? payload.events : [];
  events.forEach((event) => {
    const eventTitle = safeText(event?.title);
    const eventSlug = safeText(event?.slug);
    const eventEndDate = safeText(event?.endDate);
    const eventActive = event?.active !== false;
    const eventClosed = Boolean(event?.closed);
    const eventMarkets = Array.isArray(event?.markets) ? event.markets : [];

    eventMarkets.forEach((market) => {
      pushCandidate({
        market_id: safeText(market?.id) || null,
        market_slug: safeText(market?.slug),
        market_question: safeText(market?.question || market?.title || eventTitle),
        event_title: eventTitle,
        event_slug: eventSlug || null,
        end_date: safeText(market?.endDate || eventEndDate) || null,
        active: market?.active !== false && eventActive,
        closed: Boolean(market?.closed) || eventClosed,
        outcomes: parseJsonList(market?.outcomes).map(String),
        outcome_prices: parseJsonList(market?.outcomePrices).map(toNullableNumber).filter((item) => item != null),
        best_bid: toNullableNumber(market?.bestBid),
        best_ask: toNullableNumber(market?.bestAsk),
        last_trade_price: toNullableNumber(market?.lastTradePrice),
        spread: toNullableNumber(market?.spread),
        group_item_title: safeText(market?.groupItemTitle),
        volume_24h: toNullableNumber(market?.volume24hr || event?.volume24hr),
        liquidity: toNullableNumber(market?.liquidity || event?.liquidity),
      });
    });
  });

  const directMarkets = Array.isArray(payload?.markets) ? payload.markets : [];
  directMarkets.forEach((market) => {
    pushCandidate({
      market_id: safeText(market?.id) || null,
      market_slug: safeText(market?.slug),
      market_question: safeText(market?.question || market?.title),
      event_title: safeText(market?.title),
      event_slug: safeText(market?.eventSlug) || null,
      end_date: safeText(market?.endDate) || null,
      active: market?.active !== false,
      closed: Boolean(market?.closed),
      outcomes: parseJsonList(market?.outcomes).map(String),
      outcome_prices: parseJsonList(market?.outcomePrices).map(toNullableNumber).filter((item) => item != null),
      best_bid: toNullableNumber(market?.bestBid),
      best_ask: toNullableNumber(market?.bestAsk),
      last_trade_price: toNullableNumber(market?.lastTradePrice),
      spread: toNullableNumber(market?.spread),
      group_item_title: safeText(market?.groupItemTitle),
      volume_24h: toNullableNumber(market?.volume24hr),
      liquidity: toNullableNumber(market?.liquidity),
    });
  });

  return candidates;
}

function scoreCandidate(queryText, queryPlan, candidate) {
  const targetDays = horizonToTargetDays(getHorizonId(queryPlan));
  const queryTokens = tokenize([queryText, ...(Array.isArray(queryPlan?.entities) ? queryPlan.entities.map((entity) => entity?.label) : [])].join(" "));
  const candidateText = [
    candidate.market_question,
    candidate.event_title,
    candidate.group_item_title,
    candidate.market_slug,
  ]
    .filter(Boolean)
    .join(" ");
  const marketTokens = tokenize(candidateText);
  const lexical = getTokenOverlapScore(queryTokens, marketTokens);
  const horizon = getDateDistanceScore(targetDays, candidate.end_date);
  const entity = getEntityScore(queryPlan, candidateText);
  const structure = hasBinaryYesNo(candidate.outcomes) ? 1 : 0.35;
  const active = candidate.active && !candidate.closed ? 1 : 0.15;
  const matchConfidence = clamp01(lexical * 0.56 + horizon * 0.18 + entity * 0.16 + structure * 0.06 + active * 0.04, 0);

  return {
    ...candidate,
    match_confidence: matchConfidence,
    horizon_score: horizon,
    lexical_score: lexical,
    entity_score: entity,
    is_binary_yes_no: hasBinaryYesNo(candidate.outcomes),
  };
}

async function getCacheEntry(db, collectionName, key) {
  if (!db) return null;
  const snapshot = await db.collection(collectionName).doc(key).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  const ttl = typeof data?.ttl?.toDate === "function" ? data.ttl.toDate() : null;
  if (!ttl || ttl <= new Date()) return null;
  return data.value || null;
}

async function setCacheEntry(db, admin, collectionName, key, value, ttlMinutes) {
  if (!db || !admin) return;
  const ttl = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await db.collection(collectionName).doc(key).set(
    {
      cached_at: admin.firestore.FieldValue.serverTimestamp(),
      ttl: admin.firestore.Timestamp.fromDate(ttl),
      value,
    },
    { merge: true }
  );
}

async function searchCandidateMarkets({ db, admin, fetchJson, queryText, queryPlan }) {
  const normalizedQuery = safeText(queryText);
  if (!normalizedQuery) return [];

  const cacheKey = hashKey({
    version: "polymarket-search-v1",
    query: normalizeText(normalizedQuery),
    horizon: getHorizonId(queryPlan),
    domain: safeText(queryPlan?.domain || queryPlan?.domain_id),
  });
  const cached = await getCacheEntry(db, POLYMARKET_SEARCH_CACHE_COLLECTION, cacheKey);
  if (Array.isArray(cached)) return cached;

  const params = new URLSearchParams({
    q: normalizedQuery,
    limit_per_type: "8",
    search_profiles: "false",
    search_tags: "false",
    optimized: "true",
  });
  const payload = await fetchJson(`${GAMMA_BASE_URL}/public-search?${params.toString()}`);
  const candidates = flattenSearchResults(payload);
  await setCacheEntry(db, admin, POLYMARKET_SEARCH_CACHE_COLLECTION, cacheKey, candidates, POLYMARKET_SEARCH_CACHE_TTL_MINUTES);
  return candidates;
}

function resolveBestMarketMatch(queryText, queryPlan, candidates = []) {
  const scored = candidates
    .map((candidate) => scoreCandidate(queryText, queryPlan, candidate))
    .sort((left, right) => right.match_confidence - left.match_confidence);

  const top = scored[0];
  const second = scored[1];
  if (!top || top.match_confidence < 0.45) {
    return { status: "none", candidates: scored.slice(0, 3) };
  }

  if (second && top.match_confidence < 0.86 && top.match_confidence - second.match_confidence < 0.06) {
    return {
      status: "ambiguous",
      topCandidate: top,
      competingCandidate: second,
      candidates: scored.slice(0, 3),
    };
  }

  return {
    status: top.match_confidence >= STRONG_MATCH_THRESHOLD ? "strong" : top.match_confidence >= REFERENCE_MATCH_THRESHOLD ? "reference" : "weak",
    bestCandidate: top,
    candidates: scored.slice(0, 3),
  };
}

function parseMarketDetail(payload = {}) {
  const outcomes = parseJsonList(payload?.outcomes).map(String);
  const outcomePrices = parseJsonList(payload?.outcomePrices).map(toNullableNumber);
  const yesIndex = outcomes.findIndex((outcome) => normalizeText(outcome) === "yes");
  const impliedProbability = yesIndex >= 0 ? clamp01(outcomePrices[yesIndex], null) : null;
  const event = Array.isArray(payload?.events) ? payload.events[0] || {} : {};
  const clobTokenIds = parseJsonList(payload?.clobTokenIds).map(String);

  return {
    market_id: safeText(payload?.id) || null,
    market_slug: safeText(payload?.slug) || null,
    market_question: safeText(payload?.question || event?.title || payload?.slug),
    market_description: safeText(payload?.description || event?.description),
    market_url: safeText(payload?.slug) ? `https://polymarket.com/event/${payload.slug}` : null,
    condition_id: safeText(payload?.conditionId) || null,
    outcomes,
    outcome_prices: outcomePrices.filter((item) => item != null),
    yes_index: yesIndex,
    implied_probability: impliedProbability,
    liquidity: toNullableNumber(payload?.liquidityNum || payload?.liquidityClob || payload?.liquidity || event?.liquidity),
    volume_24h: toNullableNumber(payload?.volume24hrClob || payload?.volume24hr || event?.volume24hr),
    open_interest: toNullableNumber(event?.openInterest),
    spread: toNullableNumber(payload?.spread),
    last_trade_price: toNullableNumber(payload?.lastTradePrice),
    price_updated_at: safeText(payload?.updatedAt || event?.updatedAt) || new Date().toISOString(),
    best_bid: toNullableNumber(payload?.bestBid),
    best_ask: toNullableNumber(payload?.bestAsk),
    clob_token_ids: clobTokenIds,
    is_binary_yes_no: hasBinaryYesNo(outcomes),
    one_day_price_change: toNullableNumber(payload?.oneDayPriceChange),
  };
}

async function fetchMidpoint(fetchJson, tokenId) {
  if (!safeText(tokenId)) return null;
  try {
    const payload = await fetchJson(`${CLOB_BASE_URL}/midpoint?token_id=${encodeURIComponent(tokenId)}`);
    return clamp01(payload?.mid, null);
  } catch (_error) {
    return null;
  }
}

async function fetchOpenInterest(fetchJson, conditionId) {
  if (!safeText(conditionId)) return null;
  try {
    const payload = await fetchJson(`${DATA_API_BASE_URL}/oi?market=${encodeURIComponent(conditionId)}`);
    const values = Array.isArray(payload) ? payload : [];
    const match = values.find((item) => safeText(item?.market) === conditionId) || values[0];
    return toNullableNumber(match?.value);
  } catch (_error) {
    return null;
  }
}

async function fetchPriceHistory(fetchJson, tokenId) {
  if (!safeText(tokenId)) return [];
  try {
    const payload = await fetchJson(
      `${CLOB_BASE_URL}/prices-history?market=${encodeURIComponent(tokenId)}&interval=1w&fidelity=1440`
    );
    const history = Array.isArray(payload?.history) ? payload.history : [];
    return history
      .map((point) => ({
        t: Number(point?.t),
        p: toNullableNumber(point?.p),
      }))
      .filter((point) => Number.isFinite(point.t) && point.p != null);
  } catch (_error) {
    return [];
  }
}

function scoreMarketQuality(signal = {}) {
  const volumeScore = clamp01(Math.log10(1 + Math.max(0, Number(signal.volume_24h) || 0)) / 4, 0);
  const liquidityScore = clamp01(Math.log10(1 + Math.max(0, Number(signal.liquidity) || 0)) / 4, 0);
  const spread = toNullableNumber(signal.spread);
  const spreadScore = spread == null ? 0.45 : clamp01(1 - spread / 0.12, 0.15);
  const updatedAt = safeText(signal.price_updated_at);
  const updatedDate = updatedAt ? new Date(updatedAt) : null;
  const hoursSinceUpdate = updatedDate && !Number.isNaN(updatedDate.getTime())
    ? Math.max(0, (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60))
    : 24;
  const freshnessScore = hoursSinceUpdate <= 12 ? 1 : hoursSinceUpdate <= 48 ? 0.72 : hoursSinceUpdate <= 168 ? 0.45 : 0.2;
  const historyScore = Array.isArray(signal.price_history) && signal.price_history.length >= 4 ? 0.72 : 0.35;
  return clamp01(volumeScore * 0.3 + liquidityScore * 0.3 + spreadScore * 0.15 + freshnessScore * 0.15 + historyScore * 0.1, 0.4);
}

async function fetchMarketSignal({ db, admin, fetchJson, match }) {
  const slug = safeText(match?.bestCandidate?.market_slug || match?.market_slug);
  if (!slug) return null;

  const cacheKey = hashKey({
    version: "polymarket-signal-v1",
    slug,
  });
  const cached = await getCacheEntry(db, POLYMARKET_SIGNAL_CACHE_COLLECTION, cacheKey);
  if (cached && typeof cached === "object") {
    return cached;
  }

  const marketPayload = await fetchJson(`${GAMMA_BASE_URL}/markets/slug/${encodeURIComponent(slug)}`);
  const signal = parseMarketDetail(marketPayload);
  const yesTokenId = signal.yes_index >= 0 ? signal.clob_token_ids[signal.yes_index] : signal.clob_token_ids[0];
  const midpoint = await fetchMidpoint(fetchJson, yesTokenId);
  const openInterest = await fetchOpenInterest(fetchJson, signal.condition_id);
  const priceHistory = await fetchPriceHistory(fetchJson, yesTokenId);
  const impliedProbability = midpoint != null ? midpoint : signal.implied_probability;
  const priceChange7d =
    priceHistory.length >= 2
      ? Number((priceHistory[priceHistory.length - 1].p - priceHistory[0].p).toFixed(4))
      : signal.one_day_price_change;

  const enriched = {
    ...signal,
    implied_probability: impliedProbability,
    prior_probability: impliedProbability,
    open_interest: openInterest != null ? openInterest : signal.open_interest,
    price_history: priceHistory.slice(-8),
    price_change_7d: Number.isFinite(Number(priceChange7d)) ? Number(priceChange7d) : null,
  };
  enriched.market_quality = scoreMarketQuality(enriched);

  await setCacheEntry(db, admin, POLYMARKET_SIGNAL_CACHE_COLLECTION, cacheKey, enriched, POLYMARKET_SIGNAL_CACHE_TTL_MINUTES);
  return enriched;
}

function getPrimaryProbability(items = []) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const top = [...items]
    .map((item) => ({ probability: clamp01(item?.probability, null) }))
    .filter((item) => item.probability != null)
    .sort((left, right) => right.probability - left.probability)[0];
  return top?.probability ?? null;
}

function rebalanceScenarioProbabilities(scenarios = [], targetProbability) {
  if (!Array.isArray(scenarios) || scenarios.length === 0 || targetProbability == null) return scenarios;
  const next = scenarios.map((scenario) => ({
    ...scenario,
    probability: clamp01(scenario?.probability, 0),
  }));
  next.sort((left, right) => right.probability - left.probability);

  if (next.length === 1) {
    return [{ ...next[0], probability: 1 }];
  }

  const boundedTarget = Math.max(0.01, Math.min(0.99, targetProbability));
  const rest = next.slice(1);
  const restTotal = rest.reduce((sum, scenario) => sum + scenario.probability, 0);
  const nextRestTotal = Math.max(0.01, 1 - boundedTarget);

  next[0].probability = boundedTarget;
  if (restTotal > 0) {
    rest.forEach((scenario) => {
      scenario.probability = Math.max(0.01, nextRestTotal * (scenario.probability / restTotal));
    });
  } else {
    const even = nextRestTotal / rest.length;
    rest.forEach((scenario) => {
      scenario.probability = even;
    });
  }

  const total = next.reduce((sum, scenario) => sum + scenario.probability, 0) || 1;
  return next.map((scenario) => ({
    ...scenario,
    probability: scenario.probability / total,
  }));
}

function computeCalibration(baseForecast, marketSignal) {
  const baseProbability = getPrimaryProbability(baseForecast?.scenario_set);
  const impliedProbability = clamp01(marketSignal?.implied_probability, null);
  const matchConfidence = clamp01(marketSignal?.match_confidence, 0);
  const marketQuality = clamp01(marketSignal?.market_quality, 0);
  const divergence = baseProbability != null && impliedProbability != null ? impliedProbability - baseProbability : null;
  const eligibleForCalibration =
    baseProbability != null &&
    impliedProbability != null &&
    marketSignal?.is_binary_yes_no &&
    matchConfidence >= STRONG_MATCH_THRESHOLD &&
    marketQuality >= CALIBRATION_QUALITY_THRESHOLD;

  if (!eligibleForCalibration) {
    return {
      base_probability: baseProbability,
      calibrated_probability: baseProbability,
      divergence,
      calibration_applied: false,
      calibration_note:
        matchConfidence >= REFERENCE_MATCH_THRESHOLD && impliedProbability != null
          ? "Market signal attached as reference. Match or liquidity are not strong enough to recalibrate the number."
          : "No clean market calibration was applied.",
    };
  }

  const weight = Math.max(0.18, Math.min(0.38, ((matchConfidence + marketQuality) / 2) * 0.42));
  const shift = Math.max(-MAX_CALIBRATION_SHIFT, Math.min(MAX_CALIBRATION_SHIFT, (divergence || 0) * weight));
  const calibratedProbability = clamp01(baseProbability + shift, baseProbability);

  return {
    base_probability: baseProbability,
    calibrated_probability: calibratedProbability,
    divergence,
    calibration_applied: Math.abs(shift) >= 0.01,
    calibration_note:
      Math.abs(shift) >= 0.01
        ? `Calibration applied. Crystal moved ${Math.round(Math.abs(shift) * 100)} pts toward live market pricing.`
        : "Market and Crystal are already close enough. No adjustment was needed.",
  };
}

function buildPredictionMarketFrame({ queryPlan, match, signal, calibration }) {
  return {
    outcome: safeText(signal?.market_question),
    horizon: getHorizonId(queryPlan),
    resolution_criteria: safeText(signal?.market_description || "Resolvable by market rules and public sources."),
    reference_market: safeText(signal?.market_question),
    prior_probability: signal?.implied_probability == null ? null : clamp01(signal.implied_probability, null),
    market_id: safeText(signal?.market_id) || null,
    market_slug: safeText(signal?.market_slug) || null,
    market_question: safeText(signal?.market_question),
    market_url: safeText(signal?.market_url) || null,
    implied_probability: signal?.implied_probability == null ? null : clamp01(signal.implied_probability, null),
    match_confidence: clamp01(match?.bestCandidate?.match_confidence, 0),
    market_quality: clamp01(signal?.market_quality, 0),
    open_interest: toNullableNumber(signal?.open_interest),
    volume_24h: toNullableNumber(signal?.volume_24h),
    liquidity: toNullableNumber(signal?.liquidity),
    price_updated_at: safeText(signal?.price_updated_at) || null,
    divergence_vs_crystal: calibration?.divergence == null ? null : Number(calibration.divergence.toFixed(4)),
    calibration_applied: Boolean(calibration?.calibration_applied),
    calibration_note: safeText(calibration?.calibration_note),
    crystal_probability: calibration?.base_probability == null ? null : clamp01(calibration.base_probability, null),
    calibrated_probability: calibration?.calibrated_probability == null ? null : clamp01(calibration.calibrated_probability, null),
    price_change_7d: toNullableNumber(signal?.price_change_7d),
  };
}

function mergeLicenseSummary(card, marketFrame) {
  const current = Array.isArray(card?.trust_layer?.provenance_summary?.license_summary)
    ? card.trust_layer.provenance_summary.license_summary
    : [];
  const next = mergeUniqueStrings(current, [
    "polymarket-gamma",
    "polymarket-clob",
    marketFrame?.market_slug ? `polymarket:${marketFrame.market_slug}` : null,
  ]);
  return next;
}

async function resolvePolymarketFrameForQuery({ db, admin, fetchJson, queryText, queryPlan, baseProbability = null }) {
  const candidates = await searchCandidateMarkets({ db, admin, fetchJson, queryText, queryPlan });
  const match = resolveBestMarketMatch(queryText, queryPlan, candidates);
  if (match.status === "none" || match.status === "weak" || match.status === "ambiguous") {
    return null;
  }

  const signal = await fetchMarketSignal({ db, admin, fetchJson, match });
  if (!signal) return null;

  const calibration = computeCalibration(
    {
      scenario_set: baseProbability == null ? [] : [{ probability: baseProbability }],
    },
    {
      ...signal,
      match_confidence: match?.bestCandidate?.match_confidence,
    }
  );

  return buildPredictionMarketFrame({
    queryPlan,
    match,
    signal: {
      ...signal,
      match_confidence: match?.bestCandidate?.match_confidence,
    },
    calibration,
  });
}

async function attachPolymarketToCard({ db, admin, fetchJson, queryText, queryPlan, card }) {
  if (!card || !queryText) return card;

  const baseProbability = getPrimaryProbability(card?.scenario_set);
  const frame = await resolvePolymarketFrameForQuery({
    db,
    admin,
    fetchJson,
    queryText,
    queryPlan,
    baseProbability,
  });
  if (!frame) return card;

  const nextCard = JSON.parse(JSON.stringify(card));
  nextCard.prediction_market_frame = frame;
  if (frame.calibration_applied && frame.calibrated_probability != null) {
    nextCard.scenario_set = rebalanceScenarioProbabilities(nextCard.scenario_set, frame.calibrated_probability);
  }
  nextCard.trust_layer = {
    ...nextCard.trust_layer,
    freshness: {
      ...nextCard.trust_layer?.freshness,
      as_of_utc: frame.price_updated_at || nextCard.trust_layer?.freshness?.as_of_utc || new Date().toISOString(),
    },
    provenance_summary: {
      ...nextCard.trust_layer?.provenance_summary,
      license_summary: mergeLicenseSummary(nextCard, frame),
    },
  };
  return nextCard;
}

async function attachPolymarketToWorldSimDigest({ db, admin, fetchJson, queryText, queryPlan, digest }) {
  if (!digest || !queryText) return digest;
  const existingFrame = digest?.prediction_market_frame || null;
  const baseProbability = getPrimaryProbability(digest?.scenario_frequencies);
  const resolvedFrame = await resolvePolymarketFrameForQuery({
    db,
    admin,
    fetchJson,
    queryText,
    queryPlan,
    baseProbability,
  });

  if (!resolvedFrame && !existingFrame) return digest;

  const nextDigest = {
    ...digest,
    prediction_market_frame: {
      ...(existingFrame || {}),
      ...(resolvedFrame || {}),
      calibration_applied: false,
      calibration_note:
        safeText(resolvedFrame?.calibration_note) ||
        safeText(existingFrame?.calibration_note) ||
        "Market signal used as external reference for the simulation layer.",
    },
  };

  if (nextDigest.prediction_market_frame?.market_slug) {
    nextDigest.source_set = mergeUniqueStrings(nextDigest.source_set, [`polymarket:${nextDigest.prediction_market_frame.market_slug}`]);
  }

  return nextDigest;
}

function looksEventLikeText(text = "") {
  return /(will|election|government|coalition|market|macro|inflation|rates|war|ceasefire|tariff|sanction|border|putin|trump|europe|oil|crypto|btc|ethereum|stocks|city|tourism|roma|milano|geopolit|elezion|governo|mercati|inflazione|tassi|dazi|sanzioni|citta|turismo)/i.test(
    text
  );
}

function buildSectionQueryPlan(section = {}) {
  return {
    domain_id: "A.11.geopolitics.trade_tensions",
    horizons: [{ horizon_id: safeText(section?.horizon, "30d") }],
    entities: [],
    filters: {},
    constraints: {},
  };
}

async function attachPolymarketToNextletter({ db, admin, fetchJson, letter }) {
  if (!letter || !Array.isArray(letter.sections)) return letter;
  const nextLetter = {
    ...letter,
    sections: letter.sections.map((section) => ({ ...section })),
  };

  for (const section of nextLetter.sections.slice(0, 4)) {
    const sectionText = [
      safeText(section?.query_suggestion),
      safeText(section?.title),
      safeText(section?.topic),
      safeText(section?.content),
    ]
      .filter(Boolean)
      .join(" ");

    if (!looksEventLikeText(sectionText)) {
      continue;
    }

    const baseProbability = toNullableNumber(section?.probability) == null
      ? null
      : clamp01(Number(section.probability) / (Number(section.probability) > 1 ? 100 : 1), null);

    const frame = await resolvePolymarketFrameForQuery({
      db,
      admin,
      fetchJson,
      queryText: sectionText,
      queryPlan: buildSectionQueryPlan(section),
      baseProbability,
    });

    if (frame) {
      section.prediction_market_frame = frame;
    }
  }

  return nextLetter;
}

async function getPolymarketPulse({ db, admin, fetchJson, queryText, queryPlan }) {
  return resolvePolymarketFrameForQuery({
    db,
    admin,
    fetchJson,
    queryText,
    queryPlan,
    baseProbability: null,
  });
}

function getPolymarketRuntimeHealth() {
  return {
    publicApis: true,
    dataApiPublic: true,
    searchCacheTtlMinutes: POLYMARKET_SEARCH_CACHE_TTL_MINUTES,
    signalCacheTtlMinutes: POLYMARKET_SIGNAL_CACHE_TTL_MINUTES,
    strongMatchThreshold: STRONG_MATCH_THRESHOLD,
    referenceThreshold: REFERENCE_MATCH_THRESHOLD,
  };
}

module.exports = {
  POLYMARKET_SEARCH_CACHE_COLLECTION,
  POLYMARKET_SIGNAL_CACHE_COLLECTION,
  POLYMARKET_SEARCH_CACHE_TTL_MINUTES,
  POLYMARKET_SIGNAL_CACHE_TTL_MINUTES,
  searchCandidateMarkets,
  resolveBestMarketMatch,
  fetchMarketSignal,
  computeCalibration,
  attachPolymarketToCard,
  attachPolymarketToWorldSimDigest,
  attachPolymarketToNextletter,
  getPolymarketPulse,
  getPolymarketRuntimeHealth,
};
