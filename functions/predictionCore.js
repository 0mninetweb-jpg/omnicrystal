const { GENERAL_FORECAST_DOMAIN, SPORTS_MATCH_OUTCOMES_DOMAIN, CATALOG_DOMAINS, getDomain } = require("./catalogRegistry");

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
    "renting",
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
    "affittare",
    "casa",
    "apartment",
    "property",
    "rome",
    "roma",
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
    "affittare",
    "aspettare",
    "should i buy now",
    "dovrei affittare",
    "tradeoff",
    "decision",
    "wait before",
  ],
  [SPORTS_MATCH_OUTCOMES_DOMAIN]: [
    "partita",
    "calcio",
    "football",
    "soccer",
    "serie a",
    "champions",
    "europa league",
    "conference league",
    "goal",
    "fixture",
    "match",
    "vs",
    "versus",
    "contro",
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

const POLICY_JURISDICTION_HINTS = [
  { label: "Italy", patterns: [/\bitaly\b/i, /\bitalia\b/i, /\bitalian\b/i] },
  { label: "France", patterns: [/\bfrance\b/i, /\bfrancia\b/i, /\bfrench\b/i] },
  { label: "European Union", patterns: [/\beuropean union\b/i, /\beu\b/i, /\beu ai\b/i] },
  { label: "Europe", patterns: [/\beurope\b/i, /\beurozone\b/i, /\beuropean\b/i] },
  { label: "Germany", patterns: [/\bgermany\b/i, /\bgerman\b/i] },
  { label: "United Kingdom", patterns: [/\bunited kingdom\b/i, /\buk\b/i, /\bbritain\b/i, /\bbritish\b/i] },
  { label: "United States", patterns: [/\bunited states\b/i, /\busa\b/i, /\bu\.s\.\b/i, /\bamerican\b/i] },
];

const POLICY_GOVERNING_ENTITY_HINTS = [
  { label: "Coalition government", patterns: [/\bcoalition government\b/i, /\bcoalition\b/i] },
  { label: "Government", patterns: [/\bgovernment\b/i, /\bgoverno\b/i] },
  { label: "Parliament", patterns: [/\bparliament\b/i, /\bparlamento\b/i] },
  { label: "Senate", patterns: [/\bsenate\b/i, /\bsenato\b/i] },
  { label: "European Commission", patterns: [/\beuropean commission\b/i, /\bcommission\b/i] },
  { label: "EU institutions", patterns: [/\beuropean union\b/i, /\beu ai\b/i, /\beu regulation\b/i] },
  { label: "Voters", patterns: [/\breferendum\b/i, /\belection\b/i, /\bballot\b/i, /\bvote\b/i] },
];

const POLICY_EVENT_DATE_HINTS = [
  { label: "March", patterns: [/\bmarch\b/i, /\bmarzo\b/i] },
  { label: "April", patterns: [/\bapril\b/i, /\baprile\b/i] },
  { label: "May", patterns: [/\bmay\b/i, /\bmaggio\b/i] },
  { label: "June", patterns: [/\bjune\b/i, /\bgiugno\b/i] },
  { label: "Autumn", patterns: [/\bautumn\b/i, /\bfall\b/i, /\bautunno\b/i] },
  { label: "Spring", patterns: [/\bspring\b/i, /\bprimavera\b/i] },
  { label: "Summer", patterns: [/\bsummer\b/i, /\bestate\b/i] },
  { label: "Winter", patterns: [/\bwinter\b/i, /\binverno\b/i] },
  { label: "This quarter", patterns: [/\bthis quarter\b/i, /\bquesto trimestre\b/i] },
  { label: "Next quarter", patterns: [/\bnext quarter\b/i, /\bprossimo trimestre\b/i] },
  { label: "Next 90 days", patterns: [/\bnext 90 days\b/i, /\bprossimi 90 giorni\b/i] },
  { label: "Next 6 months", patterns: [/\bnext 6 months\b/i, /\bprossimi 6 mesi\b/i] },
  { label: "Within 12 months", patterns: [/\bwithin 12 months\b/i, /\bentro 12 mesi\b/i, /\bnext 12 months\b/i] },
];

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

function normalizeDisplayLabel(value = "") {
  return safeText(value)
    .replace(/[?!.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function buildEntity(entityId, entityType, label) {
  return {
    entity_id: safeText(entityId, labelToKey(label) || entityType || "entity"),
    entity_type: safeText(entityType, "entity"),
    label: safeText(label),
  };
}

function findPolicyHintLabel(queryText, hintMap = []) {
  for (const item of hintMap) {
    if ((item.patterns || []).some((pattern) => pattern.test(queryText))) {
      return item.label;
    }
  }
  return "";
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
  if (looksLikeSportsFixtureQuery(queryText)) return "binary_outcome";
  if (/\b(compare|comparison|meglio di|better than)\b/.test(normalized)) return "comparison";
  if (/\b(vs|versus)\b/.test(normalized)) return "comparison";
  if (/\b(top|best|worst|ranking|rank|classifica)\b/.test(normalized)) return "ranking";
  if (
    BINARY_YES_NO_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    /\b(should i|dovrei|buy|sell|wait|rent|surviv\w*|sopravviv\w*|pass|approve|reject|win|lose|vincer\w*|cambio di governo|government change|change of government|snap election|elezioni anticipate|governo|outperform|underperform|break higher|break lower|breakout|break down|break below|break above|rise above|fall below)\b/.test(
      normalized
    )
  ) {
    return "binary_outcome";
  }
  if (/\b(best time|quando|when|timing|window|visit)\b/.test(normalized)) return "timing";
  return "directional_range";
}

function inferResolutionFrame(queryText, intentShape) {
  const normalized = normalizeText(queryText);
  if (looksLikeSportsFixtureQuery(queryText)) {
    return "event";
  }
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

function isPolicyGovernanceQuery(queryText = "", resolutionFrame = "") {
  const normalized = normalizeText(queryText);
  return (
    safeText(resolutionFrame) === "policy" ||
    /\b(referendum|election|elezioni|policy|constitutional|constitution|government|governo|parliament|senate|law|regulation|decree|legge|riforma|coalition|public timeline|budget vote)\b/.test(
      normalized
    )
  );
}

function isGeopoliticalPolicyQuery(queryText = "") {
  const normalized = normalizeText(queryText);
  return /\b(war|conflict|ceasefire|sanction|military|ukraine|russia|taiwan|middle east|nato)\b/.test(normalized);
}

function inferPolicyEventDate(queryText = "") {
  return findPolicyHintLabel(queryText, POLICY_EVENT_DATE_HINTS);
}

function inferPolicyJurisdiction(queryText = "") {
  return findPolicyHintLabel(queryText, POLICY_JURISDICTION_HINTS);
}

function inferPolicyGoverningEntity(queryText = "", jurisdiction = "") {
  const explicit = findPolicyHintLabel(queryText, POLICY_GOVERNING_ENTITY_HINTS);
  if (explicit) return explicit;
  if (/\b(elezioni anticipate|snap election|change of government|government change)\b/i.test(queryText)) {
    return "Government";
  }
  if (safeText(jurisdiction) === "European Union") return "EU institutions";
  return "";
}

function extractPolicyContext(queryText = "", resolutionFrame = "", binaryFrame = {}) {
  if (!isPolicyGovernanceQuery(queryText, resolutionFrame)) {
    return {
      policyLike: false,
      eventDate: "",
      jurisdiction: "",
      governingEntity: "",
      entities: [],
    };
  }

  const jurisdiction = inferPolicyJurisdiction(queryText);
  const governingEntity = inferPolicyGoverningEntity(queryText, jurisdiction);
  const eventDate = inferPolicyEventDate(queryText);
  const entities = [];

  if (jurisdiction) {
    entities.push(buildEntity(`${labelToKey(jurisdiction)}_jurisdiction`, "jurisdiction", jurisdiction));
  }
  if (governingEntity) {
    entities.push(buildEntity(`${labelToKey(governingEntity)}_institution`, "institution", governingEntity));
  }
  if (/\breferendum\b/i.test(queryText)) {
    entities.push(buildEntity("referendum_event", "event", /\bconstitution|constitutional\b/i.test(queryText) ? "Constitutional referendum" : "Referendum"));
  }
  if (binaryFrame?.asks_binary_question && binaryFrame?.question_side_a && binaryFrame?.question_side_b) {
    entities.push(buildEntity("binary_outcome_frame", "outcome_frame", `${binaryFrame.question_side_a} vs ${binaryFrame.question_side_b}`));
  }

  return {
    policyLike: true,
    eventDate,
    jurisdiction,
    governingEntity,
    entities: entities.filter((entity) => safeText(entity.label)),
  };
}

function inferMarketBinaryFrame(queryText = "") {
  const normalized = normalizeText(queryText);
  const cleanedQuery = normalizeDisplayLabel(queryText);
  if (!normalized) return null;

  const outperformMatch = cleanedQuery.match(/^will\s+(.+?)\s+outperform\s+(.+?)(?:\s+(?:this|next)\b.*)?\??$/i);
  if (outperformMatch) {
    const asset = normalizeDisplayLabel(outperformMatch[1]);
    return {
      asks_binary_question: true,
      question_side_a: `${asset} outperforms`,
      question_side_b: `${asset} does not outperform`,
    };
  }

  if (/\bbitcoin\b/.test(normalized) && /\b(break higher|breakout|break above|rise above)\b/.test(normalized)) {
    return {
      asks_binary_question: true,
      question_side_a: "Breaks higher",
      question_side_b: "Holds range",
    };
  }

  if (/\bbitcoin\b/.test(normalized) && /\b(break lower|break down|break below|fall below)\b/.test(normalized)) {
    return {
      asks_binary_question: true,
      question_side_a: "Breaks lower",
      question_side_b: "Holds range",
    };
  }

  if (/\b(gold|oil|bitcoin|ethereum|nasdaq|s&p 500|sp500|eurusd|eur\/usd)\b/.test(normalized) && /\b(rise|higher|up)\b/.test(normalized)) {
    return {
      asks_binary_question: true,
      question_side_a: "Rises",
      question_side_b: "Does not rise",
    };
  }

  if (/\b(gold|oil|bitcoin|ethereum|nasdaq|s&p 500|sp500|eurusd|eur\/usd)\b/.test(normalized) && /\b(fall|lower|down)\b/.test(normalized)) {
    return {
      asks_binary_question: true,
      question_side_a: "Falls",
      question_side_b: "Does not fall",
    };
  }

  return null;
}

function extractBinaryFrame(queryText) {
  const normalized = normalizeText(queryText);
  const fixtureSides = extractFixtureSides(queryText);
  if (fixtureSides) {
    return {
      asks_binary_question: true,
      question_side_a: fixtureSides.question_side_a,
      question_side_b: fixtureSides.question_side_b,
    };
  }

  const marketBinaryFrame = inferMarketBinaryFrame(queryText);
  if (marketBinaryFrame) {
    return marketBinaryFrame;
  }

  if (/\b(wait|buy now|buy|rent now|affittare|comprare|spostarmi|move now)\b/.test(normalized) && /\b(should i|dovrei)\b/.test(normalized)) {
    return {
      asks_binary_question: true,
      question_side_a: "Act now",
      question_side_b: "Wait",
    };
  }

  if (/\b(startup|business|company|saa[sn]|runway)\b/.test(normalized) && /\b(surviv\w*|sopravviv\w*)\b/.test(normalized)) {
    return {
      asks_binary_question: true,
      question_side_a: "Survive",
      question_side_b: "Fail",
    };
  }

  if (/\b(coalition|government|governo)\b/.test(normalized) && /\b(surviv\w*|budget vote|confidence vote|fiducia|collapse|fall)\b/.test(normalized)) {
    return {
      asks_binary_question: true,
      question_side_a: "Government survives",
      question_side_b: "Government falls",
    };
  }

  if (/\b(approve|approved|approval|pass|passes|ratify|ratified|adopt|adopted|reform package|regulation|law|decree|legge|riforma)\b/.test(normalized) && !/\breferendum\b/.test(normalized)) {
    return {
      asks_binary_question: true,
      question_side_a: "Approved",
      question_side_b: "Blocked",
    };
  }

  if (/\b(cambio di governo|change of government|government change|snap election|elezioni anticipate)\b/.test(normalized)) {
    return {
      asks_binary_question: true,
      question_side_a: "Government changes",
      question_side_b: "Government holds",
    };
  }

  const asksYesNo =
    BINARY_YES_NO_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    /\b(dovrei|sopravviv\w*|cambio di governo|governo|elezioni anticipate)\b/.test(normalized);
  if (asksYesNo || /\breferendum\b/.test(normalized)) {
    const italian = /\b(italia|italy|si o no|sì o no|referendum)\b/.test(normalized);
    return {
      asks_binary_question: true,
      question_side_a: italian ? "Si" : "Yes",
      question_side_b: "No",
    };
  }

  return {
    asks_binary_question: false,
    question_side_a: "",
    question_side_b: "",
  };
}

function looksLikeSportsFixtureQuery(queryText = "") {
  const normalized = normalizeText(queryText);
  if (!normalized) return false;
  if (!/\b(vs|versus|contro)\b/.test(normalized) && !/\b(partita|calcio|serie a|champions|goal|fixture|match)\b/.test(normalized)) {
    return false;
  }
  if (/\b(compare|comparison|meglio di|better than|bitcoin|crypto|stock|stocks|market|markets|gold|oil)\b/.test(normalized)) {
    return false;
  }
  return true;
}

function extractFixtureSides(queryText = "") {
  if (!looksLikeSportsFixtureQuery(queryText)) return null;
  const raw = normalizeDisplayLabel(queryText);
  if (!raw) return null;
  const match = raw.match(/^(.+?)\s+(?:vs\.?|versus|contro)\s+(.+)$/i);
  if (!match) return null;
  const sideA = normalizeDisplayLabel(match[1]);
  const sideB = normalizeDisplayLabel(match[2]);
  if (!sideA || !sideB || normalizeText(sideA) === normalizeText(sideB)) return null;
  return {
    question_side_a: sideA,
    question_side_b: sideB,
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

function getSpecialDomainBonus(domain, queryText = "", intentShape = "", resolutionFrame = "") {
  const domainId = safeText(domain?.domain_id);
  if (domainId === SPORTS_MATCH_OUTCOMES_DOMAIN && looksLikeSportsFixtureQuery(queryText)) {
    return intentShape === "binary_outcome" || resolutionFrame === "event" ? 0.28 : 0.18;
  }
  return 0;
}

function scoreDomainCandidate(domain, queryText, intentShape, resolutionFrame) {
  const normalizedQuery = normalizeText(queryText);
  const queryTokens = tokenize(queryText);
  const domainTokens = getDomainTokens(domain);
  const lexicalScore = getTokenOverlapScore(queryTokens, domainTokens);
  const manualHintScore = getManualHintScore(domain.domain_id, normalizedQuery);
  const resolutionBonus = getResolutionBonus(domain, resolutionFrame);
  const specialDomainBonus = getSpecialDomainBonus(domain, queryText, intentShape, resolutionFrame);
  const routeActivated = lexicalScore > 0.04 || manualHintScore > 0 || resolutionBonus >= 0.16 || specialDomainBonus > 0;
  const intentBonus = routeActivated ? getIntentBonus(domain, intentShape) : 0;
  const stateScore = routeActivated ? DOMAIN_STATE_SCORE[domain.current_state] || 0 : 0;
  const total = clamp01(lexicalScore * 0.55 + manualHintScore + resolutionBonus + specialDomainBonus + intentBonus + stateScore, 0);

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
      specialDomainBonus > 0 ? `${domain.short_label} matches a head-to-head fixture pattern.` : "",
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
  const policyContext = extractPolicyContext(queryText, resolutionFrame, binaryFrame);
  let candidateDomains = buildDomainCandidates(queryText);
  if (policyContext.policyLike) {
    const preferredPolicyDomain = isGeopoliticalPolicyQuery(queryText)
      ? "A.25.geopolitics_and_conflict_dynamics"
      : "A.24.governance_policy_and_public_timeline";
    const hasPolicyDomainInTopThree = candidateDomains
      .slice(0, 3)
      .some((candidate) => ["A.24.governance_policy_and_public_timeline", "A.25.geopolitics_and_conflict_dynamics"].includes(candidate.domain_id));
    if (!hasPolicyDomainInTopThree) {
      const policyDomain = getDomain(preferredPolicyDomain, preferredPolicyDomain);
      candidateDomains = candidateDomains
        .concat({
          domain_id: policyDomain.domain_id,
          title: policyDomain.title,
          short_label: policyDomain.short_label,
          current_state: policyDomain.current_state,
          score: 0.28,
          reason: "Policy heuristics identified an institutional or governance outcome, so Crystal keeps a policy route in the top candidates.",
        })
        .sort((left, right) => right.score - left.score)
        .slice(0, 6);
    }
  }
  const topCandidate = candidateDomains[0];
  const preferredPolicyFallback =
    policyContext.policyLike && (policyContext.jurisdiction || policyContext.governingEntity || binaryFrame.asks_binary_question)
      ? isGeopoliticalPolicyQuery(queryText)
        ? "A.25.geopolitics_and_conflict_dynamics"
        : "A.24.governance_policy_and_public_timeline"
      : GENERAL_FORECAST_DOMAIN;
  const primaryDomainId =
    topCandidate && topCandidate.domain_id !== GENERAL_FORECAST_DOMAIN && topCandidate.score >= 0.18
      ? topCandidate.domain_id
      : preferredPolicyFallback;

  return {
    primaryDomainId,
    candidateDomains,
    supportingDomains: getSupportingDomains(primaryDomainId),
    intentShape,
    resolutionFrame,
    confidenceMode: "balanced",
    binaryFrame,
    eventDate: policyContext.eventDate,
    jurisdiction: policyContext.jurisdiction,
    governingEntity: policyContext.governingEntity,
    entities: policyContext.entities,
    policyLike: policyContext.policyLike,
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

  const entities = normalizeEntities(payload.entities || payload.entity_set || routingHints.entities, "Entity 1");
  const binaryFrame = routingHints.binaryFrame || {};
  const mergedIntentShape =
    binaryFrame.asks_binary_question && safeText(payload.intent_shape) === "comparison"
      ? safeText(routingHints.intentShape, "binary_outcome")
      : safeText(payload.intent_shape, routingHints.intentShape || "directional_range");

  return {
    ...payload,
    primary_domain_id: primaryDomainId,
    candidate_domains: candidateDomains,
    intent_shape: mergedIntentShape,
    resolution_frame: safeText(payload.resolution_frame, routingHints.resolutionFrame || "trend"),
    confidence_mode: safeText(payload.confidence_mode, routingHints.confidenceMode || "balanced"),
    entity_set: entities,
    entities,
    question_side_a: binaryFrame.asks_binary_question
      ? safeText(binaryFrame.question_side_a, safeText(payload.question_side_a))
      : safeText(payload.question_side_a, ""),
    question_side_b: binaryFrame.asks_binary_question
      ? safeText(binaryFrame.question_side_b, safeText(payload.question_side_b))
      : safeText(payload.question_side_b, ""),
    event_date: safeText(payload.event_date, safeText(routingHints.eventDate)),
    governing_entity: safeText(payload.governing_entity, safeText(routingHints.governingEntity)),
    jurisdiction: safeText(payload.jurisdiction, safeText(routingHints.jurisdiction)),
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
  const missingRequiredSources = Array.isArray(evidenceBundle?.source_usage?.missing_required_sources)
    ? evidenceBundle.source_usage.missing_required_sources.length
    : 0;
  const missingOptionalSources = Array.isArray(evidenceBundle?.source_usage?.missing_optional_sources)
    ? evidenceBundle.source_usage.missing_optional_sources.length
    : 0;
  const requiredSourcePenalty = Math.min(0.18, missingRequiredSources * 0.08);
  const optionalSourcePenalty = Math.min(0.06, missingOptionalSources * 0.02);

  const coverageScore = clamp01(
    0.16 +
      (hasHistoricalBaseline ? 0.22 : 0) +
      Math.min(0.28, liveSignals.length * 0.08) +
      Math.min(0.16, sourceLedger.length * 0.03) +
      (entityResolved ? 0.08 : 0) +
      (eventResolved ? 0.06 : 0) +
      (DOMAIN_STATE_SCORE[domainState] || 0) +
      engineBonus -
      requiredSourcePenalty -
      optionalSourcePenalty,
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
    missing_required_source_count: missingRequiredSources,
    missing_optional_source_count: missingOptionalSources,
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

const BINARY_BAND_RANGES = {
  limited: { min: 0.52, max: 0.64, label: "Lean" },
  lean: { min: 0.55, max: 0.62, label: "Lean" },
  tilted: { min: 0.63, max: 0.72, label: "Tilted" },
  strong: { min: 0.73, max: 0.84, label: "Strong" },
};

function normalizeBinaryLabel(value) {
  return normalizeText(value).replace(/\bsì\b/g, "si");
}

function binaryLabelsMatch(left, right) {
  return Boolean(normalizeBinaryLabel(left) && normalizeBinaryLabel(left) === normalizeBinaryLabel(right));
}

function extractProbabilityFromCandidate(candidate) {
  if (!Number.isFinite(Number(candidate))) return null;
  return clamp01(candidate, NaN);
}

function inferSideAProbabilityFromRawSplit(rawProbabilitySplit, sideA, sideB) {
  if (!rawProbabilitySplit || typeof rawProbabilitySplit !== "object") return null;

  const winningProbability = extractProbabilityFromCandidate(rawProbabilitySplit.winning_probability);
  const explicitWinner = safeText(rawProbabilitySplit.winning_side);
  if (Number.isFinite(winningProbability) && explicitWinner) {
    if (binaryLabelsMatch(explicitWinner, sideA)) {
      return winningProbability;
    }
    if (binaryLabelsMatch(explicitWinner, sideB)) {
      return clamp01(1 - winningProbability, 0.5);
    }
  }

  const directSideA =
    extractProbabilityFromCandidate(rawProbabilitySplit.question_side_a_probability) ??
    extractProbabilityFromCandidate(rawProbabilitySplit.side_a_probability);
  if (Number.isFinite(directSideA)) {
    return directSideA;
  }

  const directSideB =
    extractProbabilityFromCandidate(rawProbabilitySplit.question_side_b_probability) ??
    extractProbabilityFromCandidate(rawProbabilitySplit.side_b_probability);
  if (Number.isFinite(directSideB)) {
    return clamp01(1 - directSideB, 0.5);
  }

  const primaryLabel = safeText(rawProbabilitySplit.primary_label);
  const secondaryLabel = safeText(rawProbabilitySplit.secondary_label);
  const primaryProbability = extractProbabilityFromCandidate(rawProbabilitySplit.primary_probability);
  const secondaryProbability = extractProbabilityFromCandidate(rawProbabilitySplit.secondary_probability);

  if (binaryLabelsMatch(primaryLabel, sideA) && Number.isFinite(primaryProbability)) {
    return primaryProbability;
  }
  if (binaryLabelsMatch(primaryLabel, sideB) && Number.isFinite(primaryProbability)) {
    return clamp01(1 - primaryProbability, 0.5);
  }
  if (binaryLabelsMatch(secondaryLabel, sideA) && Number.isFinite(secondaryProbability)) {
    return secondaryProbability;
  }
  if (binaryLabelsMatch(secondaryLabel, sideB) && Number.isFinite(secondaryProbability)) {
    return clamp01(1 - secondaryProbability, 0.5);
  }

  const genericProbability = extractProbabilityFromCandidate(rawProbabilitySplit.probability);
  if (Number.isFinite(genericProbability)) {
    return genericProbability;
  }

  return null;
}

function inferSideMentionFromCall(rawPrimaryCall, sideA, sideB) {
  const normalizedPrimaryCall = normalizeText(rawPrimaryCall);
  if (!normalizedPrimaryCall) return null;

  const mentionsSideA = sideA && normalizedPrimaryCall.includes(normalizeBinaryLabel(sideA));
  const mentionsSideB = sideB && normalizedPrimaryCall.includes(normalizeBinaryLabel(sideB));

  if (mentionsSideA && !mentionsSideB) return "a";
  if (mentionsSideB && !mentionsSideA) return "b";
  return null;
}

function selectBinaryBand(rawWinningProbability, publicationState, confidenceScore, evidenceQuality = {}) {
  const probability = clamp01(rawWinningProbability, 0.56);
  if (publicationState !== "published") {
    return "limited";
  }

  if (
    probability >= 0.73 &&
    confidenceScore >= 0.8 &&
    Number(evidenceQuality.coverage_score || 0) >= 0.72 &&
    Number(evidenceQuality.agreement_score || 0) >= 0.62 &&
    Number(evidenceQuality.conflict_score || 0) <= 0.28
  ) {
    return "strong";
  }

  if (probability >= 0.63 && confidenceScore >= 0.67) {
    return "tilted";
  }

  return "lean";
}

function boundWinningProbability(rawWinningProbability, band = "limited") {
  const config = BINARY_BAND_RANGES[band] || BINARY_BAND_RANGES.limited;
  return Number(Math.max(config.min, Math.min(config.max, clamp01(rawWinningProbability, config.min))).toFixed(3));
}

function buildCompatibleProbabilitySplit(binaryContract) {
  if (!binaryContract || !safeText(binaryContract.winning_side)) return null;
  const losingSide = binaryLabelsMatch(binaryContract.winning_side, binaryContract.question_side_a)
    ? safeText(binaryContract.question_side_b, "Alternative")
    : safeText(binaryContract.question_side_a, "Alternative");
  const winningProbability = Number(clamp01(binaryContract.winning_probability, 0.56).toFixed(3));
  return {
    primary_label: safeText(binaryContract.winning_side, "Primary"),
    primary_probability: winningProbability,
    secondary_label: losingSide,
    secondary_probability: Number((1 - winningProbability).toFixed(3)),
  };
}

function resolveExplicitBinaryWinner(rawBinaryContract = {}, rawProbabilitySplit = null, sideA = "", sideB = "") {
  const candidates = [safeText(rawBinaryContract?.winning_side), safeText(rawProbabilitySplit?.winning_side)].filter(Boolean);
  for (const candidate of candidates) {
    if (binaryLabelsMatch(candidate, sideA)) return sideA;
    if (binaryLabelsMatch(candidate, sideB)) return sideB;
  }
  return "";
}

function isBinaryContractReady(binaryContract = {}) {
  const sideA = safeText(binaryContract?.question_side_a);
  const sideB = safeText(binaryContract?.question_side_b);
  const winner = safeText(binaryContract?.winning_side);
  const displayCall = safeText(binaryContract?.display_call);
  const band = safeText(binaryContract?.band);
  const sideAProbability = extractProbabilityFromCandidate(binaryContract?.question_side_a_probability);
  const sideBProbability = extractProbabilityFromCandidate(binaryContract?.question_side_b_probability);
  const winningProbability = extractProbabilityFromCandidate(binaryContract?.winning_probability);

  if (!sideA || !sideB || !winner || !displayCall || !band) return false;
  if (!binaryLabelsMatch(winner, sideA) && !binaryLabelsMatch(winner, sideB)) return false;
  if (!Number.isFinite(sideAProbability) || !Number.isFinite(sideBProbability) || !Number.isFinite(winningProbability)) return false;
  if (Math.abs(sideAProbability + sideBProbability - 1) > 0.02) return false;
  const expectedWinningProbability = binaryLabelsMatch(winner, sideA) ? sideAProbability : sideBProbability;
  if (Math.abs(expectedWinningProbability - winningProbability) > 0.02) return false;
  return ["limited", "lean", "tilted", "strong"].includes(band);
}

function buildBinaryContract(rawBinaryContract = {}, queryPlan = {}, rawProbabilitySplit = null, rawPrimaryCall = "", options = {}) {
  const sideA = safeText(queryPlan?.question_side_a, safeText(rawBinaryContract?.question_side_a));
  const sideB = safeText(queryPlan?.question_side_b, safeText(rawBinaryContract?.question_side_b));
  if (!sideA || !sideB) return null;

  let sideAProbability =
    inferSideAProbabilityFromRawSplit(rawBinaryContract, sideA, sideB) ??
    inferSideAProbabilityFromRawSplit(rawProbabilitySplit, sideA, sideB);

  const fallbackProbability = extractProbabilityFromCandidate(options?.fallbackProbability);
  const sideMention = inferSideMentionFromCall(rawPrimaryCall, sideA, sideB);
  const explicitWinner = resolveExplicitBinaryWinner(rawBinaryContract, rawProbabilitySplit, sideA, sideB);

  if (!Number.isFinite(sideAProbability) && Number.isFinite(fallbackProbability)) {
    if (explicitWinner && binaryLabelsMatch(explicitWinner, sideB)) {
      sideAProbability = clamp01(1 - fallbackProbability, 0.42);
    } else {
      sideAProbability = sideMention === "b" ? clamp01(1 - fallbackProbability, 0.42) : fallbackProbability;
    }
  }

  if (!Number.isFinite(sideAProbability)) {
    if (explicitWinner && binaryLabelsMatch(explicitWinner, sideB)) {
      sideAProbability = 0.42;
    } else if (explicitWinner && binaryLabelsMatch(explicitWinner, sideA)) {
      sideAProbability = 0.58;
    } else {
      sideAProbability = sideMention === "b" ? 0.42 : sideMention === "a" ? 0.58 : 0.56;
    }
  }

  let winningSide = sideAProbability >= 0.5 ? sideA : sideB;
  if (explicitWinner) {
    winningSide = explicitWinner;
  } else if (sideMention === "a") {
    winningSide = sideA;
  } else if (sideMention === "b") {
    winningSide = sideB;
  }

  let rawWinningProbability = winningSide === sideA ? sideAProbability : clamp01(1 - sideAProbability, 0.44);
  if (rawWinningProbability < 0.5) {
    rawWinningProbability = clamp01(1 - rawWinningProbability, 0.56);
    sideAProbability = winningSide === sideA ? rawWinningProbability : Number((1 - rawWinningProbability).toFixed(3));
  }
  const band = selectBinaryBand(
    rawWinningProbability,
    safeText(options?.publicationState, "limited"),
    clamp01(options?.confidenceScore, 0.58),
    options?.evidenceQuality || {}
  );
  const winningProbability = boundWinningProbability(rawWinningProbability, band);
  const questionSideAProbability = Number(
    (winningSide === sideA ? winningProbability : 1 - winningProbability).toFixed(3)
  );
  const questionSideBProbability = Number((1 - questionSideAProbability).toFixed(3));
  const bandLabel = BINARY_BAND_RANGES[band]?.label || "Lean";
  const displayCall = `${bandLabel} ${winningSide} ${Math.round(winningProbability * 100)}/${Math.round(
    (1 - winningProbability) * 100
  )}`;

  const contract = {
    question_side_a: sideA,
    question_side_b: sideB,
    question_side_a_probability: questionSideAProbability,
    question_side_b_probability: questionSideBProbability,
    winning_side: winningSide,
    winning_probability: winningProbability,
    band,
    display_call: displayCall,
    flip_conditions: normalizeTextList(rawBinaryContract?.flip_conditions || rawBinaryContract?.what_would_flip, 4),
  };
  return isBinaryContractReady(contract) ? contract : null;
}

function normalizeProbabilitySplit(rawProbabilitySplit, queryPlan = {}, rawPrimaryCall = "", fallbackProbability = null, options = {}) {
  if (options?.binaryContract) {
    return buildCompatibleProbabilitySplit(options.binaryContract);
  }
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

  const provisionalProbabilitySplit = normalizeProbabilitySplit(
    rawScorecard.probability_split,
    queryPlan,
    rawScorecard.primary_call || rawScorecard.directional_hypothesis || rawScorecard.verdict,
    fallbackProbability
  );

  const keyDrivers = normalizeTextList(rawScorecard.key_drivers || rawScorecard.drivers, 4);
  const historicalAnchors = normalizeTextList(rawScorecard.historical_anchors, 4);

  const computedConfidence = clamp01(
    0.24 +
      evidenceQuality.coverage_score * 0.28 +
      evidenceQuality.freshness_score * 0.16 +
      evidenceQuality.agreement_score * 0.16 -
      evidenceQuality.conflict_score * 0.1 +
      (safeText(rawScorecard.primary_call || rawScorecard.directional_hypothesis || rawScorecard.verdict) ? 0.08 : 0) +
      (provisionalProbabilitySplit ? 0.04 : 0),
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
  const requiredSourceGap = Boolean(
    evidenceBundle?.required_source_gap ||
      (Array.isArray(evidenceBundle?.source_usage?.missing_required_sources) &&
        evidenceBundle.source_usage.missing_required_sources.length > 0)
  );
  const providerRequiredNoPick =
    hardStop &&
    Boolean(evidenceBundle?.sports_grounding?.provider_required) &&
    !Boolean(evidenceBundle?.sports_grounding?.parity_ready);
  let publicationState = "limited";
  if (hardStop) {
    publicationState = "blocked";
  } else if (
    confidenceScore >= 0.67 &&
    evidenceQuality.coverage_score >= 0.64 &&
    evidenceQuality.agreement_score >= 0.55 &&
    evidenceQuality.conflict_score <= 0.44
  ) {
    publicationState = "published";
  }

  const binaryContract = buildBinaryContract(
    rawScorecard.binary_contract || {},
    queryPlan,
    rawScorecard.probability_split,
    rawScorecard.primary_call || rawScorecard.directional_hypothesis || rawScorecard.verdict,
    {
      fallbackProbability,
      publicationState,
      confidenceScore,
      evidenceQuality,
    }
  );
  const binaryQuestion = Boolean(queryPlan?.binary_frame?.asks_binary_question || (queryPlan?.question_side_a && queryPlan?.question_side_b));
  const probabilitySplit = normalizeProbabilitySplit(
    rawScorecard.probability_split,
    queryPlan,
    rawScorecard.primary_call || rawScorecard.directional_hypothesis || rawScorecard.verdict,
    fallbackProbability,
    {
      binaryContract,
    }
  );

  let primaryCall = safeText(rawScorecard.primary_call || rawScorecard.directional_hypothesis || rawScorecard.verdict);
  if (!providerRequiredNoPick && binaryContract?.display_call) {
    primaryCall = binaryContract.display_call;
  } else if (!primaryCall) {
    primaryCall = inferPrimaryCallFromSplit(probabilitySplit);
  }

  let counterSignals = normalizeTextList(rawScorecard.counter_signals, 4);
  if (binaryContract && counterSignals.length === 0) {
    counterSignals = normalizeTextList(
      evidenceBundle?.conflict_map?.map((item) => safeText(item?.issue || item?.note)) || [],
      4
    );
  }
  if (binaryContract && counterSignals.length === 0) {
    counterSignals = ["Counter-signals remain active and could still compress the edge."];
  }

  let invalidators = normalizeTextList(rawScorecard.invalidators || rawScorecard.what_would_flip, 4);
  if (binaryContract?.flip_conditions?.length) {
    invalidators = uniqueStrings(binaryContract.flip_conditions.concat(invalidators)).slice(0, 4);
  }
  if (binaryContract && invalidators.length === 0) {
    invalidators = ["A late reversal in the strongest live signals would flip this call."];
  }

  let whyThisSide = safeText(rawScorecard.why_this_side || rawScorecard.why_this_outcome);
  if (binaryContract && !whyThisSide) {
    whyThisSide = keyDrivers.length
      ? `Crystal leans ${binaryContract.winning_side} because ${keyDrivers.slice(0, 2).join(" and ")} are currently setting the edge.`
      : `Crystal leans ${binaryContract.winning_side} because the verified evidence stack still points to that side.`;
  }

  let recommendedPosture = safeText(rawScorecard.recommended_posture || rawScorecard.recommended_action);
  if (binaryContract && !recommendedPosture) {
    recommendedPosture = "Treat this as a bounded directional read and monitor the flip conditions before acting more aggressively.";
  }

  if (!primaryCall) {
    publicationState = "blocked";
  }
  if (binaryQuestion && !binaryContract) {
    publicationState = publicationState === "blocked" ? "blocked" : "limited";
  }
  if (
    !providerRequiredNoPick &&
    binaryContract &&
    publicationState === "published" &&
    (!safeText(binaryContract.question_side_a) ||
      !safeText(binaryContract.question_side_b) ||
      !safeText(binaryContract.winning_side) ||
      !whyThisSide ||
      counterSignals.length === 0 ||
      invalidators.length === 0)
  ) {
    publicationState = "limited";
  }
  if (requiredSourceGap && publicationState === "published") {
    publicationState = "limited";
  }

  return {
    primary_call: primaryCall,
    binary_contract: providerRequiredNoPick ? null : binaryContract,
    probability_split: providerRequiredNoPick ? null : probabilitySplit,
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
      missing_required_source_count: evidenceQuality.missing_required_source_count,
      missing_optional_source_count: evidenceQuality.missing_optional_source_count,
      domain_state: domainConfig.current_state || "limited",
      notes: uniqueStrings([
        safeText(domainConfig.status_reason),
        safeText(evidenceBundle.notes?.[0]),
        requiredSourceGap
          ? "At least one required shared provider was missing, so Crystal downgraded this forecast out of published state."
          : "",
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
  buildBinaryContract,
  buildCompatibleProbabilitySplit,
  isBinaryContractReady,
  inferIntentShape,
  inferResolutionFrame,
  extractBinaryFrame,
  getSupportingDomains,
  safeText,
  clamp01,
};
