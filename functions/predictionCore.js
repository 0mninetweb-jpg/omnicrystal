const { GENERAL_FORECAST_DOMAIN, CATALOG_DOMAINS, getDomain } = require("./catalogRegistry");

const DOMAIN_STATE_SCORE = {
  published: 0.05,
  limited: 0.03,
  blocked: 0.01,
};

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
  "come",
  "con",
  "cosa",
  "da",
  "dei",
  "del",
  "della",
  "delle",
  "di",
  "do",
  "e",
  "entro",
  "for",
  "gli",
  "how",
  "i",
  "il",
  "in",
  "is",
  "la",
  "le",
  "lo",
  "ma",
  "mesi",
  "month",
  "months",
  "nei",
  "nel",
  "nella",
  "nelle",
  "next",
  "of",
  "oggi",
  "or",
  "per",
  "poi",
  "prossimi",
  "prossimo",
  "quanto",
  "quarter",
  "same",
  "se",
  "su",
  "summer",
  "the",
  "this",
  "tra",
  "un",
  "una",
  "will",
  "year",
    "years",
]);

const DOMAIN_KEYWORD_HINTS = {
  "A.24.governance_policy_and_public_timeline": [
    "referendum",
    "constitution",
    "constitutional",
    "election",
    "elezioni",
    "ballot",
    "vote",
    "voting",
    "senate",
    "parliament",
    "government",
    "governo",
    "coalition",
    "minister",
    "policy",
    "regulation",
    "regolazione",
    "legge",
    "riforma",
    "decree",
    "campaign",
    "italy",
    "italia",
    "francia",
    "france",
  ],
  "A.25.geopolitics_and_conflict_dynamics": [
    "war",
    "conflict",
    "ceasefire",
    "sanction",
    "geopolitics",
    "military",
    "nato",
    "ukraine",
    "russia",
    "china",
    "taiwan",
    "border",
    "escalation",
  ],
  "A.23.markets_and_asset_regimes": [
    "bitcoin",
    "crypto",
    "ethereum",
    "stock",
    "stocks",
    "market",
    "markets",
    "nasdaq",
    "sp500",
    "s&p",
    "gold",
    "oil",
    "eurusd",
    "asset",
    "volatility",
  ],
  "A.14.macro_economy_and_cycles": [
    "inflation",
    "rate",
    "rates",
    "rate pressure",
    "interest rates",
    "gdp",
    "recession",
    "economy",
    "macro",
    "central bank",
    "ecb",
    "fed",
    "unemployment",
    "growth",
  ],
  "A.11.cost_of_living_and_price_pressure": [
    "cost of living",
    "prices",
    "price pressure",
    "affordability",
    "expensive",
    "cheap",
    "basket",
    "rents",
    "rent",
    "groceries",
    "utilities",
  ],
  "A.12.housing_and_real_estate_signals": [
    "rent",
    "rents",
    "house",
    "home",
    "housing",
    "real estate",
    "mortgage",
    "buy a house",
    "buy house",
    "dovrei comprare",
    "comprare casa",
    "affitto",
    "affitti",
    "casa",
    "apartment",
    "property",
    "rome",
    "milan",
  ],
  "A.15.jobs_and_labor_market_signals": [
    "job",
    "jobs",
    "career",
    "salary",
    "salaries",
    "stipendi",
    "layoff",
    "hiring",
    "labor",
    "wage",
    "employment",
  ],
  "A.9.travel_flows_and_disruption": [
    "travel",
    "visit",
    "trip",
    "tourism",
    "flight",
    "hotel",
    "destination",
    "airport",
    "tokyo",
    "vacation",
  ],
  "A.27.safety_and_incident_risk": [
    "safety",
    "crime",
    "danger",
    "incident",
    "risk",
    "hotspot",
    "unsafe",
    "secure",
    "milan",
    "weekend",
  ],
  "A.28.public_health_and_environmental_exposure": [
    "health",
    "virus",
    "flu",
    "hospital",
    "pandemic",
    "air quality",
    "pollution",
    "exposure",
  ],
  "A.22.industry_and_business_cycles": [
    "startup",
    "business",
    "company",
    "sector",
    "demand",
    "sales",
    "industry",
    "survive",
    "runway",
  ],
  "B.3.3.work_and_career_outcomes": [
    "should i change my job",
    "change my job",
    "changing company",
    "salary trajectory",
    "career move",
    "take this role",
    "accept this offer",
    "promotion",
    "resign",
  ],
  "B.3.4.personal_finance_outcomes": [
    "should i buy",
    "should i sell",
    "dovrei comprare",
    "dovrei vendere",
    "my savings",
    "my budget",
    "personal finance",
    "should i invest",
    "my mortgage",
  ],
  "B.3.5.business_idea_outcomes": [
    "my startup",
    "my business",
    "business idea",
    "product market fit",
    "product-market fit",
    "open a business",
    "launch",
    "survive 12 months",
  ],
  "B.3.7.travel_personal_outcomes": [
    "best time to visit",
    "should i go to",
    "my trip",
    "travel decision",
  ],
  "B.3.8.personal_decisions_and_tradeoffs": [
    "should i wait",
    "dovrei",
    "should i move",
    "should i rent",
    "should i buy now",
    "dovrei affittare",
    "tradeoff",
    "decision",
    "wait before",
  ],
};

const SUPPORTING_DOMAINS = {
  "B.3.3.work_and_career_outcomes": [
    "A.15.jobs_and_labor_market_signals",
    "A.22.industry_and_business_cycles",
    "A.16.consumer_sentiment_and_attention_economics",
  ],
  "B.3.4.personal_finance_outcomes": [
    "A.11.cost_of_living_and_price_pressure",
    "A.12.housing_and_real_estate_signals",
    "A.14.macro_economy_and_cycles",
    "A.23.markets_and_asset_regimes",
  ],
  "B.3.5.business_idea_outcomes": [
    "A.22.industry_and_business_cycles",
    "A.16.consumer_sentiment_and_attention_economics",
    "A.24.governance_policy_and_public_timeline",
  ],
  "B.3.7.travel_personal_outcomes": [
    "A.9.travel_flows_and_disruption",
    "A.1.weather_and_atmosphere",
    "A.20.infrastructure_and_logistics_reliability",
  ],
  "B.3.8.personal_decisions_and_tradeoffs": [
    "A.11.cost_of_living_and_price_pressure",
    "A.12.housing_and_real_estate_signals",
    "A.15.jobs_and_labor_market_signals",
  ],
};

const BINARY_YES_NO_PATTERNS = [
  /\bsi o no\b/i,
  /\bsì o no\b/i,
  /\byes or no\b/i,
  /\bpassera\b/i,
  /\bpasser[aà]\b/i,
  /\bwill\b/i,
  /\bshould i\b/i,
  /\bwin\b/i,
  /\bloose\b/i,
];

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function normalizeTextList(values = [], limit = 4) {
  return uniqueStrings(
    (Array.isArray(values) ? values : [])
      .map((value) => {
        if (typeof value === "string") return value.trim();
        if (value && typeof value === "object") {
          return safeText(value.label || value.feature_key || value.note || value.tradeoff_note);
        }
        return "";
      })
      .filter(Boolean)
  ).slice(0, limit);
}

function labelToKey(label = "") {
  return safeText(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function inferIntentShape(queryText) {
  const normalized = normalizeText(queryText);
  if (/\b(vs|versus|compare|comparison|meglio di|better than)\b/.test(normalized)) return "comparison";
  if (/\b(top|best|worst|ranking|rank|classifica)\b/.test(normalized)) return "ranking";
  if (
    BINARY_YES_NO_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    /\b(should i|dovrei|buy|sell|wait|rent|survive|sopravviv|pass|approve|reject|win|lose|vincer|vincera|cambio di governo|governo)\b/.test(normalized)
  ) {
    return "binary_outcome";
  }
  if (/\b(best time|quando|when|timing|window|visit)\b/.test(normalized)) return "timing";
  return "directional_range";
}

function inferResolutionFrame(queryText, intentShape) {
  const normalized = normalizeText(queryText);
  if (/\b(referendum|election|elezioni|policy|constitution|constitutional|government|governo|parliament|senate|law|regulation|regolazione|decree|legge|riforma)\b/.test(normalized)) {
    return "policy";
  }
  if (/\b(should i|dovrei|wait|buy|sell|move|rent|visit|accept|leave|career|startup|my )\b/.test(normalized)) {
    return "decision";
  }
  if (/\b(bitcoin|crypto|market|stock|rent|rents|housing|price|inflation|rates|gdp|economy)\b/.test(normalized)) {
    return "market";
  }
  if (/\b(crime|safety|incident|danger|event|weekend|flight|travel|visit)\b/.test(normalized) || intentShape === "timing") {
    return "event";
  }
  if (/\b(personal|career|study|finance|relationship)\b/.test(normalized)) {
    return "personal";
  }
  return "trend";
}

function extractBinaryFrame(queryText) {
  const normalized = normalizeText(queryText);
  const asksYesNo =
    BINARY_YES_NO_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    /\b(dovrei|sopravviv|cambio di governo|governo|elezioni anticipate)\b/.test(normalized);
  if (asksYesNo || /\breferendum\b/.test(normalized)) {
    const italian = /\b(italia|italy|si o no|sì o no|referendum)\b/.test(normalized);
    return {
      asks_binary_question: true,
      question_side_a: italian ? "Si" : "Yes",
      question_side_b: "No",
    };
  }

  if (/\b(wait|buy now|buy|rent now)\b/.test(normalized) && /\b(should i|dovrei)\b/.test(normalized)) {
    return {
      asks_binary_question: true,
      question_side_a: "Act now",
      question_side_b: "Wait",
    };
  }

  return {
    asks_binary_question: false,
    question_side_a: "",
    question_side_b: "",
  };
}

function getManualHintScore(domainId, normalizedQuery) {
  const hints = DOMAIN_KEYWORD_HINTS[domainId] || [];
  if (!hints.length) return 0;
  const hits = hints.filter((hint) => normalizedQuery.includes(normalizeText(hint))).length;
  if (!hits) return 0;
  return Math.min(0.36, hits * 0.08);
}

function getDomainTokens(domain) {
  const values = [
    domain.domain_id,
    domain.title,
    domain.short_label,
    domain.summary,
    ...(DOMAIN_KEYWORD_HINTS[domain.domain_id] || []),
  ];
  return tokenize(values.join(" "));
}

function getTokenOverlapScore(queryTokens, domainTokens) {
  if (!queryTokens.length || !domainTokens.length) return 0;
  const domainSet = new Set(domainTokens);
  const overlap = queryTokens.filter((token) => domainSet.has(token)).length;
  return clamp01(overlap / Math.max(2, Math.min(queryTokens.length, domainTokens.length)), 0);
}

function getResolutionBonus(domain, resolutionFrame) {
  const domainId = domain.domain_id;
  const block = normalizeText(domain.block);
  if (resolutionFrame === "policy" && (domainId.includes(".24.") || domainId.includes(".25."))) return 0.18;
  if (resolutionFrame === "market" && (domainId.includes(".11.") || domainId.includes(".12.") || domainId.includes(".14.") || domainId.includes(".23."))) return 0.18;
  if (resolutionFrame === "event" && (domainId.includes(".9.") || domainId.includes(".24.") || domainId.includes(".27.") || domainId.includes(".28."))) return 0.16;
  if (resolutionFrame === "decision" && (block === "b" || domainId.includes("decision_tradeoff"))) return 0.18;
  if (resolutionFrame === "personal" && block === "b") return 0.16;
  return 0;
}

function getIntentBonus(domain, intentShape) {
  const cardTypes = Array.isArray(domain.allowed_card_types) ? domain.allowed_card_types : [];
  if (intentShape === "comparison" && cardTypes.includes("rank_compare")) return 0.08;
  if (intentShape === "ranking" && cardTypes.includes("rank_compare")) return 0.08;
  if (intentShape === "timing" && cardTypes.includes("timeline_calendar")) return 0.08;
  if (intentShape === "binary_outcome" && (cardTypes.includes("decision_tradeoff") || cardTypes.includes("risk_band") || cardTypes.includes("forecast_band"))) {
    return 0.08;
  }
  if (intentShape === "directional_range" && cardTypes.includes("forecast_band")) return 0.08;
  return 0;
}

function scoreDomainCandidate(domain, queryText, intentShape, resolutionFrame) {
  const normalizedQuery = normalizeText(queryText);
  const queryTokens = tokenize(queryText);
  const domainTokens = getDomainTokens(domain);
  const lexicalScore = getTokenOverlapScore(queryTokens, domainTokens);
  const manualHintScore = getManualHintScore(domain.domain_id, normalizedQuery);
  const resolutionBonus = getResolutionBonus(domain, resolutionFrame);
  const intentBonus = lexicalScore > 0.04 || manualHintScore > 0 || resolutionBonus >= 0.16 ? getIntentBonus(domain, intentShape) : 0;
  const stateScore = lexicalScore > 0.04 || manualHintScore > 0 || resolutionBonus >= 0.16 ? DOMAIN_STATE_SCORE[domain.current_state] || 0 : 0;
  const total = clamp01(lexicalScore * 0.55 + manualHintScore + resolutionBonus + intentBonus + stateScore, 0);

  return {
    domain_id: domain.domain_id,
    title: domain.title,
    short_label: domain.short_label,
    current_state: domain.current_state,
    score: Number(total.toFixed(3)),
    reason: uniqueStrings([
      manualHintScore > 0 ? `${domain.short_label} matches the query language directly.` : "",
      lexicalScore > 0.2 ? `${domain.short_label} overlaps with the query entities and theme.` : "",
      resolutionBonus > 0 ? `${domain.short_label} fits the ${resolutionFrame} frame.` : "",
      intentBonus > 0 ? `${domain.short_label} supports the ${intentShape} card contract.` : "",
      domain.current_state === "blocked" ? "The registry marks this domain as blocked, but it can still publish a cautious directional read." : "",
    ]).join(" "),
  };
}

function buildDomainCandidates(queryText, limit = 6) {
  const intentShape = inferIntentShape(queryText);
  const resolutionFrame = inferResolutionFrame(queryText, intentShape);
  const candidates = CATALOG_DOMAINS.map((domain) => scoreDomainCandidate(domain, queryText, intentShape, resolutionFrame))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  if (!candidates.length) {
    const fallback = getDomain(GENERAL_FORECAST_DOMAIN);
    return [
      {
        domain_id: fallback.domain_id,
        title: fallback.title,
        short_label: fallback.short_label,
        current_state: fallback.current_state,
        score: 0,
        reason: "No strong domain candidate was found.",
      },
    ];
  }

  return candidates;
}

function getSupportingDomains(primaryDomainId) {
  return (SUPPORTING_DOMAINS[primaryDomainId] || []).filter(Boolean);
}

function buildRoutingHints(queryText) {
  const intentShape = inferIntentShape(queryText);
  const resolutionFrame = inferResolutionFrame(queryText, intentShape);
  const binaryFrame = extractBinaryFrame(queryText);
  const candidateDomains = buildDomainCandidates(queryText);
  const topCandidate = candidateDomains[0];
  const primaryDomainId =
    topCandidate && topCandidate.domain_id !== GENERAL_FORECAST_DOMAIN && topCandidate.score >= 0.18
      ? topCandidate.domain_id
      : GENERAL_FORECAST_DOMAIN;

  return {
    primaryDomainId,
    candidateDomains,
    supportingDomains: getSupportingDomains(primaryDomainId),
    intentShape,
    resolutionFrame,
    confidenceMode: "balanced",
    binaryFrame,
  };
}

function normalizeCandidateDomains(rawCandidates = [], routingHints = null) {
  const map = new Map();
  const pushCandidate = (candidate) => {
    const domainId = safeText(candidate?.domain_id || candidate?.id);
    if (!domainId) return;
    const domain = getDomain(domainId, GENERAL_FORECAST_DOMAIN);
    const normalized = {
      domain_id: domain.domain_id,
      title: domain.title,
      short_label: domain.short_label,
      current_state: domain.current_state,
      score: clamp01(candidate?.score, 0),
      reason: safeText(candidate?.reason),
    };
    const current = map.get(normalized.domain_id);
    if (!current || normalized.score > current.score) {
      map.set(normalized.domain_id, normalized);
    }
  };

  (Array.isArray(rawCandidates) ? rawCandidates : []).forEach(pushCandidate);
  (routingHints?.candidateDomains || []).forEach(pushCandidate);

  if (!map.size) {
    const fallback = getDomain(GENERAL_FORECAST_DOMAIN);
    map.set(fallback.domain_id, {
      domain_id: fallback.domain_id,
      title: fallback.title,
      short_label: fallback.short_label,
      current_state: fallback.current_state,
      score: 0,
      reason: "Fallback general route.",
    });
  }

  return [...map.values()].sort((left, right) => right.score - left.score).slice(0, 6);
}

function normalizeEntities(rawEntities = [], fallbackLabel = "Entity 1") {
  const list = Array.isArray(rawEntities) ? rawEntities : [];
  const normalized = list
    .map((entity, index) => ({
      entity_id: safeText(entity?.entity_id, `entity_${index + 1}`),
      entity_type: safeText(entity?.entity_type, "entity"),
      label: safeText(entity?.label, safeText(entity?.entity_id, index === 0 ? fallbackLabel : `Entity ${index + 1}`)),
    }))
    .filter((entity) => safeText(entity.label));

  return normalized;
}

function mergeQueryPlanWithRouting(payload = {}, routingHints = {}, options = {}) {
  const fallbackDomain = safeText(options.fallbackDomain, routingHints.primaryDomainId || GENERAL_FORECAST_DOMAIN);
  const llmPrimary = safeText(payload.primary_domain_id || payload.domain_id || payload.domain, fallbackDomain);
  const candidateDomains = normalizeCandidateDomains(payload.candidate_domains, routingHints);
  const strongestCandidate = candidateDomains[0];

  let primaryDomainId = llmPrimary;
  if (!primaryDomainId || primaryDomainId === GENERAL_FORECAST_DOMAIN) {
    primaryDomainId = fallbackDomain;
  }
  if (
    primaryDomainId === GENERAL_FORECAST_DOMAIN &&
    strongestCandidate &&
    strongestCandidate.domain_id !== GENERAL_FORECAST_DOMAIN &&
    strongestCandidate.score >= 0.18
  ) {
    primaryDomainId = strongestCandidate.domain_id;
  }

  const entities = normalizeEntities(payload.entities || payload.entity_set, "Entity 1");
  const binaryFrame = routingHints.binaryFrame || {};

  return {
    ...payload,
    primary_domain_id: primaryDomainId,
    candidate_domains: candidateDomains,
    intent_shape: safeText(payload.intent_shape, routingHints.intentShape || "directional_range"),
    resolution_frame: safeText(payload.resolution_frame, routingHints.resolutionFrame || "trend"),
    confidence_mode: safeText(payload.confidence_mode, routingHints.confidenceMode || "balanced"),
    entity_set: entities,
    entities,
    question_side_a: safeText(payload.question_side_a, binaryFrame.question_side_a || ""),
    question_side_b: safeText(payload.question_side_b, binaryFrame.question_side_b || ""),
    event_date: safeText(payload.event_date),
    governing_entity: safeText(payload.governing_entity),
    jurisdiction: safeText(payload.jurisdiction),
    supporting_domains: uniqueStrings([
      ...(Array.isArray(payload.supporting_domains) ? payload.supporting_domains : []),
      ...(routingHints.supportingDomains || []),
    ]),
  };
}

function summarizeSignalDirections(liveSignals = []) {
  const directions = (Array.isArray(liveSignals) ? liveSignals : [])
    .map((signal) => safeText(signal?.lean || signal?.direction))
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  if (!directions.length) {
    return { agreement_score: 0.42, conflict_score: 0.38 };
  }

  const positive = directions.filter((value) => ["up", "positive", "yes", "bullish", "supportive"].includes(value)).length;
  const negative = directions.filter((value) => ["down", "negative", "no", "bearish", "cautious"].includes(value)).length;
  const neutral = directions.length - positive - negative;
  const dominant = Math.max(positive, negative, neutral);
  const agreement = clamp01(dominant / directions.length, 0.45);
  const conflict = clamp01(1 - agreement + (neutral > 0 ? 0.08 : 0), 0.25);
  return {
    agreement_score: Number(agreement.toFixed(3)),
    conflict_score: Number(conflict.toFixed(3)),
  };
}

function computeEvidenceQuality(evidenceBundle = {}, domainConfig = {}, engine = "standard") {
  const liveSignals = Array.isArray(evidenceBundle.live_signals) ? evidenceBundle.live_signals : [];
  const sourceLedger = uniqueStrings(evidenceBundle.source_ledger || []);
  const hasHistoricalBaseline = Boolean(safeText(evidenceBundle.historical_baseline_20y));
  const entityResolved = Boolean(evidenceBundle.entity_resolution?.resolved);
  const eventResolved = evidenceBundle.event_resolution?.resolved !== false;
  const domainState = domainConfig.current_state || "limited";
  const engineBonus = engine === "oracle" ? 0.12 : engine === "extended" ? 0.07 : 0.03;

  const coverageScore = clamp01(
    0.16 +
      (hasHistoricalBaseline ? 0.22 : 0) +
      Math.min(0.28, liveSignals.length * 0.08) +
      Math.min(0.16, sourceLedger.length * 0.03) +
      (entityResolved ? 0.08 : 0) +
      (eventResolved ? 0.06 : 0) +
      (DOMAIN_STATE_SCORE[domainState] || 0) +
      engineBonus,
    0.18
  );

  const freshestSignal = liveSignals.reduce((best, signal) => {
    const value = clamp01(signal?.freshness_score, 0);
    return value > best ? value : best;
  }, hasHistoricalBaseline ? 0.35 : 0.18);

  const freshnessScore = Number(clamp01(freshestSignal, 0.22).toFixed(3));
  const directionScores = summarizeSignalDirections(liveSignals);

  return {
    coverage_score: Number(coverageScore.toFixed(3)),
    freshness_score: freshnessScore,
    agreement_score: directionScores.agreement_score,
    conflict_score: directionScores.conflict_score,
    source_count: sourceLedger.length,
  };
}

function inferPrimaryCallFromSplit(probabilitySplit) {
  if (!probabilitySplit) return "";
  if (probabilitySplit.primary_label) {
    const probability = Math.round(clamp01(probabilitySplit.primary_probability, 0.5) * 100);
    return `${probabilitySplit.primary_label} ${probability}/${100 - probability}`;
  }
  return "";
}

function normalizeProbabilitySplit(rawProbabilitySplit, queryPlan = {}, rawPrimaryCall = "", fallbackProbability = null) {
  const sideA = safeText(queryPlan?.question_side_a);
  const sideB = safeText(queryPlan?.question_side_b);
  const binary = Boolean(sideA && sideB);
  if (!binary && !rawProbabilitySplit) return null;

  const labels = {
    primary: sideA || safeText(rawProbabilitySplit?.primary_label || rawProbabilitySplit?.side_a_label),
    secondary: sideB || safeText(rawProbabilitySplit?.secondary_label || rawProbabilitySplit?.side_b_label),
  };

  let primaryProbability = null;
  if (rawProbabilitySplit && typeof rawProbabilitySplit === "object") {
    primaryProbability = clamp01(
      rawProbabilitySplit.primary_probability ?? rawProbabilitySplit.side_a_probability ?? rawProbabilitySplit.probability,
      NaN
    );
  }

  if (!Number.isFinite(primaryProbability) && Number.isFinite(Number(fallbackProbability))) {
    primaryProbability = clamp01(fallbackProbability, 0.5);
  }

  if (!Number.isFinite(primaryProbability)) {
    const normalizedPrimaryCall = normalizeText(rawPrimaryCall);
    if (labels.secondary && normalizedPrimaryCall.includes(normalizeText(labels.secondary))) {
      primaryProbability = 0.42;
      const swapPrimary = labels.primary;
      labels.primary = labels.secondary;
      labels.secondary = swapPrimary;
    } else {
      primaryProbability = 0.58;
    }
  }

  primaryProbability = Number(clamp01(primaryProbability, 0.58).toFixed(3));
  const secondaryProbability = Number(clamp01(1 - primaryProbability, 0.42).toFixed(3));

  return {
    primary_label: safeText(labels.primary, "Primary"),
    primary_probability: primaryProbability,
    secondary_label: safeText(labels.secondary, "Alternative"),
    secondary_probability: secondaryProbability,
  };
}

function finalizeScorecard(rawScorecard = {}, evidenceBundle = {}, queryPlan = {}, domainConfig = {}, options = {}) {
  const evidenceQuality = evidenceBundle.evidence_quality || computeEvidenceQuality(evidenceBundle, domainConfig, options.engine);
  const fallbackProbability =
    evidenceBundle.prediction_market_frame?.calibrated_probability ??
    evidenceBundle.prediction_market_frame?.implied_probability ??
    null;

  const probabilitySplit = normalizeProbabilitySplit(
    rawScorecard.probability_split,
    queryPlan,
    rawScorecard.primary_call || rawScorecard.directional_hypothesis || rawScorecard.verdict,
    fallbackProbability
  );

  let primaryCall = safeText(rawScorecard.primary_call || rawScorecard.directional_hypothesis || rawScorecard.verdict);
  if (!primaryCall) {
    primaryCall = inferPrimaryCallFromSplit(probabilitySplit);
  }

  const keyDrivers = normalizeTextList(rawScorecard.key_drivers || rawScorecard.drivers, 4);
  const counterSignals = normalizeTextList(rawScorecard.counter_signals, 4);
  const invalidators = normalizeTextList(rawScorecard.invalidators || rawScorecard.what_would_flip, 4);
  const historicalAnchors = normalizeTextList(rawScorecard.historical_anchors, 4);
  const whyThisSide = safeText(rawScorecard.why_this_side || rawScorecard.why_this_outcome);
  const recommendedPosture = safeText(rawScorecard.recommended_posture || rawScorecard.recommended_action);

  const computedConfidence = clamp01(
    0.24 +
      evidenceQuality.coverage_score * 0.28 +
      evidenceQuality.freshness_score * 0.16 +
      evidenceQuality.agreement_score * 0.16 -
      evidenceQuality.conflict_score * 0.1 +
      (primaryCall ? 0.08 : 0) +
      (probabilitySplit ? 0.04 : 0),
    0.24
  );

  const confidenceScore = Number(
    clamp01(
      rawScorecard.confidence_score != null
        ? computedConfidence * 0.6 + clamp01(rawScorecard.confidence_score, computedConfidence) * 0.4
        : computedConfidence,
      computedConfidence
    ).toFixed(3)
  );

  const hardStop = Boolean(evidenceBundle.hard_stop);
  let publicationState = "limited";
  if (hardStop || !primaryCall) {
    publicationState = "blocked";
  } else if (
    confidenceScore >= 0.67 &&
    evidenceQuality.coverage_score >= 0.64 &&
    evidenceQuality.agreement_score >= 0.55 &&
    evidenceQuality.conflict_score <= 0.44
  ) {
    publicationState = "published";
  }

  return {
    primary_call: primaryCall,
    probability_split: probabilitySplit,
    confidence_score: confidenceScore,
    publication_state: publicationState,
    key_drivers: keyDrivers,
    counter_signals: counterSignals,
    invalidators,
    historical_anchors: historicalAnchors,
    why_this_side: whyThisSide,
    recommended_posture: recommendedPosture,
    publication_basis: {
      coverage_score: evidenceQuality.coverage_score,
      freshness_score: evidenceQuality.freshness_score,
      agreement_score: evidenceQuality.agreement_score,
      conflict_score: evidenceQuality.conflict_score,
      source_count: evidenceQuality.source_count,
      domain_state: domainConfig.current_state || "limited",
      notes: uniqueStrings([
        safeText(domainConfig.status_reason),
        safeText(evidenceBundle.notes?.[0]),
        publicationState === "limited" ? "Crystal has a directional read, but the evidence is still converging." : "",
      ]).slice(0, 4),
    },
  };
}

function buildDriverObjects(keyDrivers = []) {
  const drivers = normalizeTextList(keyDrivers, 4);
  const maxDrivers = drivers.length || 1;
  return drivers.map((label, index) => ({
    feature_key: labelToKey(label) || `driver_${index + 1}`,
    direction: /\b(fall|cool|down|weaker|declin|slow)\b/i.test(label)
      ? "down"
      : /\b(rise|up|increase|strong|grow|tight|support)\b/i.test(label)
        ? "up"
        : "flat",
    contribution: Number((1 - index / Math.max(2, maxDrivers + 1)).toFixed(2)),
  }));
}

module.exports = {
  GENERAL_FORECAST_DOMAIN,
  buildRoutingHints,
  buildDomainCandidates,
  mergeQueryPlanWithRouting,
  computeEvidenceQuality,
  finalizeScorecard,
  buildDriverObjects,
  normalizeTextList,
  normalizeProbabilitySplit,
  inferIntentShape,
  inferResolutionFrame,
  extractBinaryFrame,
  getSupportingDomains,
  safeText,
  clamp01,
};
