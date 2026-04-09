function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num > 1) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function roundMaybe(value, digits = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(digits));
}

function normalizeProbabilityLabel(value, fallback) {
  return safeText(value, fallback);
}

function normalizeSelectionProbabilities(probabilities = {}, labels = {}) {
  const home = Number(probabilities?.home);
  const draw = Number(probabilities?.draw);
  const away = Number(probabilities?.away);
  if (![home, draw, away].every(Number.isFinite)) return null;
  if (home <= 0 || draw <= 0 || away <= 0) return null;
  const payload = {
    home: roundMaybe(clamp01(home, null)),
    draw: roundMaybe(clamp01(draw, null)),
    away: roundMaybe(clamp01(away, null)),
    home_label: normalizeProbabilityLabel(labels?.home_label, "Home"),
    draw_label: normalizeProbabilityLabel(labels?.draw_label, "Draw"),
    away_label: normalizeProbabilityLabel(labels?.away_label, "Away"),
  };
  const ranked = [
    { key: "home", label: payload.home_label, probability: payload.home },
    { key: "draw", label: payload.draw_label, probability: payload.draw },
    { key: "away", label: payload.away_label, probability: payload.away },
  ].sort((left, right) => right.probability - left.probability);
  const favorite = ranked[0];
  payload.favorite_key = favorite.key;
  payload.favorite_label = favorite.label;
  payload.favorite_probability = favorite.probability;
  return payload;
}

function computeOverround(selectionProbabilities = null) {
  if (!selectionProbabilities) return null;
  const total =
    Number(selectionProbabilities?.home || 0) +
    Number(selectionProbabilities?.draw || 0) +
    Number(selectionProbabilities?.away || 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  return roundMaybe(total - 1, 4);
}

function stripThreeWayVig(selectionProbabilities = null) {
  if (!selectionProbabilities) return null;
  const total =
    Number(selectionProbabilities?.home || 0) +
    Number(selectionProbabilities?.draw || 0) +
    Number(selectionProbabilities?.away || 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  return normalizeSelectionProbabilities(
    {
      home: Number(selectionProbabilities.home) / total,
      draw: Number(selectionProbabilities.draw) / total,
      away: Number(selectionProbabilities.away) / total,
    },
    selectionProbabilities
  );
}

function normalizeMarketSourceClass(value = "") {
  const normalized = safeText(value, "none").toLowerCase();
  if (["sharp", "proxy", "retail", "none"].includes(normalized)) return normalized;
  return "none";
}

function deriveMarketQualityTier({ sourceClass = "none", fairProbabilities = null, confidence = null } = {}) {
  const normalizedClass = normalizeMarketSourceClass(sourceClass);
  if (normalizedClass === "sharp") {
    if (fairProbabilities && clamp01(confidence, 0.74) >= 0.72) return "sharp";
    return "sharp_thin";
  }
  if (normalizedClass === "proxy") {
    return clamp01(confidence, 0.4) >= 0.56 ? "proxy" : "proxy_thin";
  }
  if (normalizedClass === "retail") return "retail";
  return "none";
}

function buildMarketSnapshot({ snapshotTime = "", openSnapshot = null, latestSnapshot = null } = {}) {
  const normalizedSnapshot = safeText(snapshotTime);
  return {
    snapshot_time: normalizedSnapshot || null,
    open_snapshot: openSnapshot || null,
    latest_snapshot: latestSnapshot || null,
  };
}

function buildNormalizedMarketFrame({
  source = "",
  sourceClass = "none",
  marketType = "1x2",
  selectionProbabilities = null,
  fairProbabilities = null,
  overround = null,
  snapshotTime = "",
  openSnapshot = null,
  latestSnapshot = null,
  confidence = null,
} = {}) {
  const normalizedSelection = selectionProbabilities ? normalizeSelectionProbabilities(selectionProbabilities, selectionProbabilities) : null;
  const normalizedFair =
    fairProbabilities ? normalizeSelectionProbabilities(fairProbabilities, normalizedSelection || fairProbabilities) : stripThreeWayVig(normalizedSelection);
  const resolvedOverround = overround == null ? computeOverround(normalizedSelection) : roundMaybe(overround, 4);
  const normalizedClass = normalizeMarketSourceClass(sourceClass);
  const snapshot = buildMarketSnapshot({ snapshotTime, openSnapshot, latestSnapshot });
  return {
    source: safeText(source, "none"),
    source_class: normalizedClass,
    market_type: safeText(marketType, "1x2"),
    selection_probabilities: normalizedSelection,
    fair_probabilities: normalizedFair,
    overround: resolvedOverround,
    snapshot_time: snapshot.snapshot_time,
    open_snapshot: snapshot.open_snapshot,
    latest_snapshot: snapshot.latest_snapshot,
    market_quality_tier: deriveMarketQualityTier({
      sourceClass: normalizedClass,
      fairProbabilities: normalizedFair,
      confidence,
    }),
  };
}

function normalizeApiFootballMarket({ market = null, snapshotTime = "", bookmaker = "", labels = {} } = {}) {
  const home = Number(market?.home_implied_probability);
  const draw = Number(market?.draw_implied_probability);
  const away = Number(market?.away_implied_probability);
  if (![home, draw, away].every(Number.isFinite)) return null;
  const selectionProbabilities = {
    home,
    draw,
    away,
    home_label: normalizeProbabilityLabel(labels?.home_label, "Home"),
    draw_label: normalizeProbabilityLabel(labels?.draw_label, "Draw"),
    away_label: normalizeProbabilityLabel(labels?.away_label, "Away"),
  };
  return buildNormalizedMarketFrame({
    source: "api_football_optional",
    sourceClass: "sharp",
    marketType: "1x2",
    selectionProbabilities,
    snapshotTime,
    latestSnapshot: {
      bookmaker: safeText(bookmaker) || null,
      home_decimal_odd: Number.isFinite(Number(market?.home_decimal_odd)) ? Number(market.home_decimal_odd) : null,
      draw_decimal_odd: Number.isFinite(Number(market?.draw_decimal_odd)) ? Number(market.draw_decimal_odd) : null,
      away_decimal_odd: Number.isFinite(Number(market?.away_decimal_odd)) ? Number(market.away_decimal_odd) : null,
    },
    confidence: 0.78,
  });
}

function normalizePolymarketProxyFrame({ polymarket = null, modelFavorite = "" } = {}) {
  if (!polymarket || polymarket.implied_probability == null) return null;
  return buildNormalizedMarketFrame({
    source: "polymarket_public",
    sourceClass: "proxy",
    marketType: "binary_side_proxy",
    selectionProbabilities: null,
    fairProbabilities: null,
    snapshotTime: safeText(polymarket?.price_updated_at),
    latestSnapshot: {
      market_question: safeText(polymarket?.market_question) || null,
      implied_probability: Number.isFinite(Number(polymarket?.implied_probability)) ? Number(polymarket.implied_probability) : null,
      favorite_label: safeText(modelFavorite) || null,
    },
    confidence:
      polymarket?.market_consensus_strength != null ? Number(polymarket.market_consensus_strength) : Number(polymarket?.match_confidence || 0),
  });
}

function normalizeRetailSentimentFrame({ narrativeHypeScore = null } = {}) {
  if (!Number.isFinite(Number(narrativeHypeScore))) return null;
  return buildNormalizedMarketFrame({
    source: "google_trends",
    sourceClass: "retail",
    marketType: "attention_proxy",
    selectionProbabilities: null,
    fairProbabilities: null,
    confidence: clamp01(narrativeHypeScore, 0),
  });
}

function choosePrimaryMarketFrame(frames = []) {
  const normalized = (Array.isArray(frames) ? frames : []).filter(Boolean);
  const score = (frame) => {
    const sourceClass = normalizeMarketSourceClass(frame?.source_class);
    if (sourceClass === "sharp") return 4;
    if (sourceClass === "proxy") return 3;
    if (sourceClass === "retail") return 2;
    return 1;
  };
  return normalized.sort((left, right) => score(right) - score(left))[0] || null;
}

module.exports = {
  buildNormalizedMarketFrame,
  choosePrimaryMarketFrame,
  computeOverround,
  deriveMarketQualityTier,
  normalizeApiFootballMarket,
  normalizeMarketSourceClass,
  normalizePolymarketProxyFrame,
  normalizeRetailSentimentFrame,
  normalizeSelectionProbabilities,
  stripThreeWayVig,
};
