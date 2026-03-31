const DEFAULT_SPORTS_PROVIDER = "thesportsdb";
const DEFAULT_THESPORTSDB_BASE_URL = "https://www.thesportsdb.com/api/v1/json";
const DEFAULT_API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const DEFAULT_THESPORTSDB_FREE_KEY = "123";
const DEFAULT_SPORTS_SEMANTIC_OVERLAY_MODE = "observe";
const googleTrends = require("google-trends-api");

const {
  GENERAL_FORECAST_DOMAIN,
  SPORTS_MATCH_OUTCOMES_DOMAIN,
  resolveDomainId,
} = require("./catalogRegistry");
const { getPolymarketPulse } = require("./polymarket");
const SPORTS_FIXTURE_CARD_TYPE = "sports_fixture_board";
const SPORTS_PROBABILITY_MODE_DOMAIN = "B.3.6.sports_outcomes_probability_mode";

const ITALIAN_MONTHS = {
  gen: 1,
  gennaio: 1,
  feb: 2,
  febbraio: 2,
  mar: 3,
  marzo: 3,
  apr: 4,
  aprile: 4,
  mag: 5,
  maggio: 5,
  giu: 6,
  giugno: 6,
  lug: 7,
  luglio: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  settembre: 9,
  ott: 10,
  ottobre: 10,
  nov: 11,
  novembre: 11,
  dic: 12,
  dicembre: 12,
};

const TEAM_ALIAS_MAP = {
  inter: ["Inter Milan", "Inter", "Internazionale"],
  internazionale: ["Inter Milan", "Internazionale"],
  juve: ["Juventus"],
  juventus: ["Juventus"],
  milan: ["AC Milan", "Milan"],
  roma: ["Roma", "AS Roma"],
  napoli: ["Napoli"],
  lazio: ["Lazio", "SS Lazio"],
  fiorentina: ["Fiorentina", "ACF Fiorentina"],
  torino: ["Torino", "Torino FC"],
  arsenal: ["Arsenal"],
  "man city": ["Manchester City", "Man City"],
  "manchester city": ["Manchester City"],
  "man utd": ["Manchester United", "Man Utd"],
  "manchester united": ["Manchester United"],
  psg: ["Paris SG", "Paris Saint-Germain"],
  "real madrid": ["Real Madrid"],
  barca: ["Barcelona", "FC Barcelona"],
  barcellona: ["Barcelona", "FC Barcelona"],
};

const SPORTS_RSS_ALLOWLIST = [
  { source_id: "sports_rss_reuters", label: "Reuters Sports", url: "https://feeds.reuters.com/reuters/sportsNews" },
  { source_id: "sports_rss_bbc", label: "BBC Football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml" },
];

const SPORTS_SEARCH_ALLOWLIST = [
  { source_id: "sports_search_bbc", labels: ["BBC Sport", "BBC"], domains: ["bbc.com", "bbc.co.uk"] },
  { source_id: "sports_search_reuters", labels: ["Reuters"], domains: ["reuters.com"] },
  { source_id: "sports_search_espn", labels: ["ESPN"], domains: ["espn.com"] },
  { source_id: "sports_search_sky", labels: ["Sky Sports"], domains: ["skysports.com"] },
  { source_id: "sports_search_guardian", labels: ["The Guardian", "Guardian"], domains: ["theguardian.com"] },
  { source_id: "sports_search_football_italia", labels: ["Football Italia"], domains: ["football-italia.net"] },
];

const SPORTS_OFFICIAL_DOMAIN_MAP = {
  inter: ["inter.it"],
  "inter milan": ["inter.it"],
  internazionale: ["inter.it"],
  juventus: ["juventus.com"],
  juve: ["juventus.com"],
  liverpool: ["liverpoolfc.com"],
  arsenal: ["arsenal.com"],
  milan: ["acmilan.com"],
  "ac milan": ["acmilan.com"],
  roma: ["asroma.com"],
  napoli: ["sscnapoli.it"],
  lazio: ["sslazio.it"],
  fiorentina: ["acffiorentina.com"],
  torino: ["torinofc.it"],
  "manchester city": ["mancity.com"],
  "man city": ["mancity.com"],
  "manchester united": ["manutd.com"],
  "man utd": ["manutd.com"],
  psg: ["psg.fr"],
  "paris sg": ["psg.fr"],
  "real madrid": ["realmadrid.com"],
  barcelona: ["fcbarcelona.com"],
  barca: ["fcbarcelona.com"],
};

const SPORTS_COMPETITION_OFFICIAL_DOMAINS = {
  "serie a": ["legaseriea.it"],
  "premier league": ["premierleague.com"],
  "la liga": ["laliga.com"],
  "ligue 1": ["ligue1.com"],
  "champions league": ["uefa.com"],
  "uefa champions league": ["uefa.com"],
  "europa league": ["uefa.com"],
  "conference league": ["uefa.com"],
};

const SPORTS_SEMANTIC_PATTERNS = {
  injury_pressure: [
    /\binjur(?:y|ies)\b/iu,
    /\bfitness doubt\b/iu,
    /\bfitness concern\b/iu,
    /\bruled out\b/iu,
    /\bset to miss\b/iu,
    /\bsuspend(?:ed|sion)\b/iu,
    /\bunavailable\b/iu,
    /\babsence\b/iu,
  ],
  lineup_uncertainty: [
    /\blineup\b/iu,
    /\bstarting xi\b/iu,
    /\bexpected xi\b/iu,
    /\bselection\b/iu,
    /\brotation\b/iu,
    /\brest(?:ed|ing)?\b/iu,
    /\bdoubtful starter\b/iu,
  ],
  managerial_disruption: [
    /\bmanager\b/iu,
    /\bcoach\b/iu,
    /\bcaretaker\b/iu,
    /\bsacked\b/iu,
    /\bsacking\b/iu,
    /\bunder pressure\b/iu,
    /\bdressing room\b/iu,
    /\bturmoil\b/iu,
  ],
  travel_fatigue: [
    /\btravel\b/iu,
    /\blong trip\b/iu,
    /\bshort turnaround\b/iu,
    /\bquick turnaround\b/iu,
    /\bmidweek\b/iu,
    /\bfatigue\b/iu,
    /\bextra time\b/iu,
    /\brest advantage\b/iu,
  ],
  motivation_context: [
    /\bmust win\b/iu,
    /\btitle race\b/iu,
    /\brelegation\b/iu,
    /\bderby\b/iu,
    /\bknockout\b/iu,
    /\bsemi[- ]final\b/iu,
    /\bfinal\b/iu,
    /\bqualification\b/iu,
    /\btop four\b/iu,
  ],
};

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readRuntimeCredential(value) {
  const normalized = safeText(value);
  if (!normalized) return "";
  if (/^-[A-Za-z][A-Za-z0-9-]*:?$/.test(normalized)) {
    return "";
  }
  return normalized;
}

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num > 1) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function normalizeWhitespace(value) {
  return safeText(value).replace(/\s+/g, " ").trim();
}

function normalizeTeamName(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(fc|cf|ac|as|ssc|us|afc|cfc|sv|fk|sk|club|calcio)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function normalizeSignalText(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeSourceHost(value = "") {
  const raw = safeText(value).toLowerCase();
  if (!raw) return "";
  const withoutProtocol = raw.replace(/^https?:\/\//, "");
  return withoutProtocol.replace(/^www\./, "").split("/")[0].trim();
}

function getSourceHost(item = {}) {
  return normalizeSourceHost(safeText(item?.source_url || item?.link));
}

function sourceHostMatchesDomain(host = "", domain = "") {
  const normalizedHost = normalizeSourceHost(host);
  const normalizedDomain = normalizeSourceHost(domain);
  if (!normalizedHost || !normalizedDomain) return false;
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function dedupeSportsSemanticItems(items = []) {
  const seen = new Set();
  const deduped = [];
  for (const item of Array.isArray(items) ? items : []) {
    const key = `${normalizeSignalText(safeText(item?.title))}|${normalizeSignalText(safeText(item?.source_label))}|${normalizeSignalText(safeText(item?.description).slice(0, 120))}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function formatIsoDate(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function hoursSince(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return Number(((Date.now() - parsed.getTime()) / (1000 * 60 * 60)).toFixed(1));
}

function average(numbers = []) {
  const values = (Array.isArray(numbers) ? numbers : []).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toUtcDateKey(value = "") {
  const normalized = safeText(value);
  if (!normalized) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function buildUtcDateKeyFromOffset(offsetDays = 0) {
  const anchor = new Date();
  anchor.setUTCHours(0, 0, 0, 0);
  anchor.setUTCDate(anchor.getUTCDate() + Number(offsetDays || 0));
  return anchor.toISOString().slice(0, 10);
}

function buildSportsFixtureSearchDates(daysAhead = 7) {
  const horizon = Math.max(0, Math.min(21, Number(daysAhead || 0)));
  const dates = [];
  for (let offset = 0; offset <= horizon; offset += 1) {
    dates.push(buildUtcDateKeyFromOffset(offset));
  }
  return dates;
}

function buildSportsFixtureWindow({ kickoffUtc = "", queryDate = "" } = {}) {
  const normalizedKickoffUtc = safeText(kickoffUtc);
  const kickoff = normalizedKickoffUtc ? new Date(normalizedKickoffUtc) : null;
  const explicitDate = safeText(queryDate);
  if (!kickoff || Number.isNaN(kickoff.getTime())) {
    return {
      state: "unanchored",
      window_open: false,
      hours_to_kickoff: null,
      note: "Crystal grounded the teams, but it could not anchor this matchup to a live fixture window yet.",
    };
  }

  const kickoffDateKey = toUtcDateKey(kickoff.toISOString());
  if (explicitDate && kickoffDateKey && kickoffDateKey !== explicitDate) {
    return {
      state: "date_mismatch",
      window_open: false,
      hours_to_kickoff: Number((((kickoff.getTime() - Date.now()) / (1000 * 60 * 60))).toFixed(1)),
      note: "Crystal grounded the matchup, but the resolved fixture does not match the requested date yet.",
    };
  }

  const hoursToKickoff = Number((((kickoff.getTime() - Date.now()) / (1000 * 60 * 60))).toFixed(1));
  const preMatchWindowHours = explicitDate ? 24 * 14 : 24 * 7;
  let state = "upcoming";
  let note = "Crystal is reading this matchup inside the active fixture window.";

  if (hoursToKickoff < -6) {
    state = "past";
    note = "Crystal grounded the rivalry, but the resolved fixture window has already passed.";
  } else if (hoursToKickoff <= 6) {
    state = "live";
    note = "Crystal is reading this matchup inside the active kickoff window.";
  } else if (hoursToKickoff <= preMatchWindowHours) {
    state = "upcoming";
    note = explicitDate
      ? "Crystal matched the requested fixture and it is close enough to kickoff for match-specific signals."
      : "Crystal matched the next live fixture window for this matchup.";
  } else {
    state = "scheduled_far";
    note = explicitDate
      ? "Crystal found the requested fixture, but it is still too far from kickoff for match-specific preview signals."
      : "Crystal grounded the teams, but there is no live fixture window yet for this generic matchup.";
  }

  return {
    state,
    window_open: state === "live" || state === "upcoming",
    hours_to_kickoff: hoursToKickoff,
    note,
  };
}

function formatSportsFixtureWindowSummary(windowInfo = {}) {
  const state = safeText(windowInfo?.state).replace(/_/g, " ");
  if (!state) return "";
  const hoursToKickoff = Number(windowInfo?.hours_to_kickoff);
  const timing =
    Number.isFinite(hoursToKickoff)
      ? hoursToKickoff > 24
        ? `${Math.round(hoursToKickoff / 24)}d to kickoff`
        : `${hoursToKickoff}h to kickoff`
      : "";
  return `Fixture window: ${state}${timing ? ` (${timing})` : ""}.`;
}

function normalizeSportsSemanticOverlayMode(value = "") {
  const normalized = safeText(value, DEFAULT_SPORTS_SEMANTIC_OVERLAY_MODE).toLowerCase();
  if (["off", "observe", "a29"].includes(normalized)) return normalized;
  return DEFAULT_SPORTS_SEMANTIC_OVERLAY_MODE;
}

function getSportsSemanticOverlayMode() {
  return normalizeSportsSemanticOverlayMode(process.env.SPORTS_SEMANTIC_OVERLAY_MODE);
}

function safeNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function looksLikeFixtureLabel(label) {
  const normalized = normalizeWhitespace(label);
  if (!normalized) return false;
  return /\b(vs?|contro)\b/i.test(normalized) || /\s[-–]\s/.test(normalized);
}

function looksLikeSportsMatchQuery(queryText = "") {
  const normalized = normalizeWhitespace(queryText).toLowerCase();
  if (!normalized) return false;
  if (/\b(partit[ae]|calcio|serie a|champions|europa|conference|scommett|risultat[io]|vinc|goal|under|over|1x|x2|segno)\b/.test(normalized)) {
    return true;
  }
  if (/\b\d{1,2}:\d{2}\b/.test(normalized)) {
    return true;
  }
  if (/\b(vs?|contro)\b/.test(normalized) || /\s[-–]\s/.test(normalized)) {
    return true;
  }
  return false;
}

function extractFixtureDate(queryText = "", queryPlan = {}) {
  const source = `${safeText(queryText)} ${JSON.stringify(queryPlan?.entities || [])}`;
  const match = source.match(/\b(\d{1,2})\s+(gen(?:naio)?|feb(?:braio)?|mar(?:zo)?|apr(?:ile)?|mag(?:gio)?|giu(?:gno)?|lug(?:lio)?|ago(?:sto)?|set(?:tembre)?|ott(?:obre)?|nov(?:embre)?|dic(?:embre)?)(?:\s+(\d{4}))?/i);
  if (!match) return null;

  const day = Number(match[1]);
  const monthToken = match[2].toLowerCase();
  const month = ITALIAN_MONTHS[monthToken];
  if (!month || !Number.isFinite(day)) return null;
  const year = Number(match[3]) || new Date().getUTCFullYear();
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function stripFixtureDateNoise(label = "") {
  return normalizeWhitespace(label)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/giu, " ")
    .replace(/\b\d{1,2}\s+(gen(?:naio)?|feb(?:braio)?|mar(?:zo)?|apr(?:ile)?|mag(?:gio)?|giu(?:gno)?|lug(?:lio)?|ago(?:sto)?|set(?:tembre)?|ott(?:obre)?|nov(?:embre)?|dic(?:embre)?)(?:\s+\d{4})?\b/giu, " ")
    .replace(/\b(?:oggi|domani|today|tomorrow|stasera|tonight|this week|this weekend|next week|questa settimana|questo weekend|la prossima settimana)\b/giu, " ")
    .replace(/\b(?:alle|ore|at)\s*\d{1,2}:\d{2}\b/giu, " ")
    .replace(/\b\d{1,2}:\d{2}\b/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,\-–:\s]+|[,\-–:\s]+$/g, "")
    .trim();
}

function splitFixtureLabel(label) {
  const normalized = normalizeWhitespace(label);
  if (!normalized) return null;

  const explicit = normalized.split(/\s+(?:vs?|contro)\s+/i);
  if (explicit.length === 2) {
    const homeTeam = stripFixtureDateNoise(explicit[0]);
    const awayTeam = stripFixtureDateNoise(explicit[1]);
    if (!homeTeam || !awayTeam) return null;
    return {
      homeTeam,
      awayTeam,
    };
  }

  const dashed = normalized.split(/\s[-–]\s/);
  if (dashed.length === 2) {
    const homeTeam = stripFixtureDateNoise(dashed[0]);
    const awayTeam = stripFixtureDateNoise(dashed[1]);
    if (!homeTeam || !awayTeam) return null;
    return {
      homeTeam,
      awayTeam,
    };
  }

  return null;
}

function normalizeProvider(value = "") {
  const normalized = safeText(value, DEFAULT_SPORTS_PROVIDER).toLowerCase();
  if (["thesportsdb", "the-sports-db", "sportsdb"].includes(normalized)) return "thesportsdb";
  if (["api-football", "api_football", "apisports"].includes(normalized)) return "api-football";
  return DEFAULT_SPORTS_PROVIDER;
}

function getTeamSearchCandidates(name = "") {
  const label = normalizeWhitespace(name);
  if (!label) return [];
  const normalized = normalizeTeamName(label);
  const aliasTerms = TEAM_ALIAS_MAP[normalized] || [];
  return uniqueStrings([label].concat(aliasTerms));
}

function buildTheSportsDbUrl(config, endpoint, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const baseUrl = safeText(config.theSportsDbBaseUrl, DEFAULT_THESPORTSDB_BASE_URL).replace(/\/+$/, "");
  return `${baseUrl}/${encodeURIComponent(config.theSportsDbApiKey)}/${endpoint}${params.toString() ? `?${params.toString()}` : ""}`;
}

function getSportsConfig() {
  const runtimeProvider = "thesportsdb";
  const configuredProvider = normalizeProvider(process.env.SPORTS_PROVIDER);
  const apiFootballKey = readRuntimeCredential(process.env.API_FOOTBALL_KEY);
  const theSportsDbApiKey = readRuntimeCredential(process.env.THE_SPORTS_DB_API_KEY) || DEFAULT_THESPORTSDB_FREE_KEY;
  const providerBaseUrl = safeText(process.env.SPORTS_PROVIDER_BASE_URL);
  const theSportsDbBaseUrl =
    configuredProvider === "thesportsdb" && providerBaseUrl ? providerBaseUrl : DEFAULT_THESPORTSDB_BASE_URL;
  const apiFootballBaseUrl =
    configuredProvider === "api-football" && providerBaseUrl ? providerBaseUrl : DEFAULT_API_FOOTBALL_BASE_URL;
  return {
    provider: runtimeProvider,
    configured_provider: configuredProvider,
    configured: true,
    theSportsDbBaseUrl: theSportsDbBaseUrl.replace(/\/+$/, ""),
    apiFootballBaseUrl: apiFootballBaseUrl.replace(/\/+$/, ""),
    apiFootballKey,
    theSportsDbApiKey,
    primarySourceId: "thesportsdb_public",
    primaryProviderLabel: "TheSportsDB",
  };
}

function shouldUseApiFootballEnhancer(config = getSportsConfig()) {
  return Boolean(config?.apiFootballKey);
}

function getSportsProviderStates() {
  const config = getSportsConfig();
  return [
    {
      source_id: "thesportsdb_public",
      title: "TheSportsDB",
      category: "sports",
      access_profile: "public",
      implementation_status: "implemented",
      configured: true,
      available: true,
      status: "available",
      provider: "thesportsdb",
      base_url: config.theSportsDbBaseUrl,
      notes: ["Using TheSportsDB as the live sports backbone for fixture grounding, recent form, and table context."],
    },
    {
      source_id: "api_football_optional",
      title: "API-Football",
      category: "sports",
      access_profile: "optional_non_default",
      implementation_status: "implemented",
      configured: Boolean(config.apiFootballKey),
      available: Boolean(config.apiFootballKey),
      status: config.apiFootballKey ? "available" : "config_missing",
      provider: "api-football",
      base_url: config.apiFootballBaseUrl,
      notes: config.apiFootballKey
        ? ["API-Football is configured as optional sports context only (history, odds, standings) and never drives live fixture unlock."]
        : ["API_FOOTBALL_KEY is optional now and only used as a sports enhancer when configured."],
    },
  ];
}

function getSportsRuntimeHealth() {
  const config = getSportsConfig();
  const primaryState = getSportsProviderStates().find((provider) => provider.source_id === config.primarySourceId);
  return {
    available: primaryState?.available === true,
    configured: config.configured,
    source_id: config.primarySourceId,
    provider: config.provider,
    title: config.primaryProviderLabel,
    base_url: config.theSportsDbBaseUrl,
    mode: "free-tier-live",
    coverage: ["fixtures", "recent-form", "league-table"],
    enhancers: getSportsProviderStates().filter((provider) => provider.source_id !== config.primarySourceId && provider.available).map((provider) => provider.source_id),
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "CrystalCore/1.0",
      accept: "text/xml,application/rss+xml,application/xml,text/plain;q=0.8,*/*;q=0.2",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function extractRssItems(xmlText = "") {
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  const titlePattern = /<title>([\s\S]*?)<\/title>/i;
  const descriptionPattern = /<description>([\s\S]*?)<\/description>/i;
  const pubDatePattern = /<pubDate>([\s\S]*?)<\/pubDate>/i;
  const linkPattern = /<link>([\s\S]*?)<\/link>/i;
  const sourcePattern = /<source(?:\s+url="([^"]*)")?>([\s\S]*?)<\/source>/i;
  const items = [];
  let match = null;
  while ((match = itemPattern.exec(xmlText))) {
    const chunk = match[1] || "";
    const title = safeText((titlePattern.exec(chunk)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " "));
    const description = safeText(
      (descriptionPattern.exec(chunk)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ")
    );
    const publishedAt = safeText(pubDatePattern.exec(chunk)?.[1]);
    const link = safeText((linkPattern.exec(chunk)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " "));
    const sourceMatch = sourcePattern.exec(chunk);
    const sourceUrl = safeText(sourceMatch?.[1]);
    const sourceLabel = safeText((sourceMatch?.[2] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " "));
    if (title) {
      items.push({
        title,
        description,
        published_at: formatIsoDate(publishedAt),
        link,
        source_url: sourceUrl,
        source_label: sourceLabel,
      });
    }
  }
  return items;
}

function buildSportsSemanticTags(text = "") {
  const corpus = normalizeSignalText(text);
  return {
    injury_pressure: SPORTS_SEMANTIC_PATTERNS.injury_pressure.some((pattern) => pattern.test(corpus)),
    lineup_uncertainty: SPORTS_SEMANTIC_PATTERNS.lineup_uncertainty.some((pattern) => pattern.test(corpus)),
    managerial_disruption: SPORTS_SEMANTIC_PATTERNS.managerial_disruption.some((pattern) => pattern.test(corpus)),
    travel_fatigue: SPORTS_SEMANTIC_PATTERNS.travel_fatigue.some((pattern) => pattern.test(corpus)),
    motivation_context: SPORTS_SEMANTIC_PATTERNS.motivation_context.some((pattern) => pattern.test(corpus)),
  };
}

function buildSportsSemanticFixtureTerms(fixture = {}) {
  const homeTeamLabel = safeText(fixture?.homeTeamLabel);
  const awayTeamLabel = safeText(fixture?.awayTeamLabel);
  const leagueName = safeText(fixture?.leagueName);
  return {
    home_terms: getTeamSearchCandidates(homeTeamLabel).map((term) => normalizeSignalText(term)),
    away_terms: getTeamSearchCandidates(awayTeamLabel).map((term) => normalizeSignalText(term)),
    league_terms: uniqueStrings([leagueName, leagueName.replace(/\bfc\b/gi, ""), "football", "soccer"])
      .map((term) => normalizeSignalText(term))
      .filter(Boolean),
    matchup_terms: uniqueStrings([
      `${homeTeamLabel} vs ${awayTeamLabel}`,
      `${awayTeamLabel} vs ${homeTeamLabel}`,
      `${homeTeamLabel} ${awayTeamLabel}`,
      `${awayTeamLabel} ${homeTeamLabel}`,
      `${homeTeamLabel} - ${awayTeamLabel}`,
      `${awayTeamLabel} - ${homeTeamLabel}`,
    ])
      .map((term) => normalizeSignalText(term))
      .filter(Boolean),
  };
}

function computeFixtureAlignmentParts(corpus = "", fixtureTerms = {}) {
  const homeMatch = Array.isArray(fixtureTerms?.home_terms) && fixtureTerms.home_terms.some((term) => term && corpus.includes(term));
  const awayMatch = Array.isArray(fixtureTerms?.away_terms) && fixtureTerms.away_terms.some((term) => term && corpus.includes(term));
  const leagueMatch = Array.isArray(fixtureTerms?.league_terms) && fixtureTerms.league_terms.some((term) => term && corpus.includes(term));
  const matchupMatch = Array.isArray(fixtureTerms?.matchup_terms) && fixtureTerms.matchup_terms.some((term) => term && corpus.includes(term));
  return {
    homeMatch,
    awayMatch,
    leagueMatch,
    matchupMatch,
    fixtureSpecific: Boolean(matchupMatch || (homeMatch && awayMatch)),
  };
}

function computeFixtureAlignment(corpus = "", fixtureTerms = {}) {
  const parts = computeFixtureAlignmentParts(corpus, fixtureTerms);
  if (parts.matchupMatch) return parts.leagueMatch ? 1 : 0.96;
  if (parts.homeMatch && parts.awayMatch) return parts.leagueMatch ? 0.94 : 0.86;
  if ((parts.homeMatch || parts.awayMatch) && parts.leagueMatch) return 0.58;
  return 0;
}

function getSportsSourceWeight(sourceTier = "") {
  if (sourceTier === "official") return 1.24;
  if (sourceTier === "allowlist_search") return 1.12;
  if (sourceTier === "allowlist_feed") return 1;
  if (sourceTier === "gdelt") return 0.82;
  return 1;
}

function weightedAverageBy(items = [], valueSelector = () => null, weightSelector = () => 1) {
  let totalWeight = 0;
  let weightedTotal = 0;
  for (const item of Array.isArray(items) ? items : []) {
    const value = Number(valueSelector(item));
    const weight = Number(weightSelector(item));
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    weightedTotal += value * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return null;
  return weightedTotal / totalWeight;
}

function parseGdeltPublishedAt(article = {}) {
  const raw = safeText(article?.seendate || article?.seendateu || article?.date || article?.publicationDate);
  if (!raw) return "";
  if (/^\d{14}$/.test(raw)) {
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}Z`;
    return formatIsoDate(iso);
  }
  return formatIsoDate(raw);
}

async function fetchSportsGdeltItems(fetchJson, fixture = {}) {
  const homeTeamLabel = safeText(fixture?.homeTeamLabel);
  const awayTeamLabel = safeText(fixture?.awayTeamLabel);
  if (!homeTeamLabel || !awayTeamLabel) return [];

  const attempts = [
    [`"${homeTeamLabel}"`, `"${awayTeamLabel}"`, "football"],
    [`"${homeTeamLabel}"`, `"${awayTeamLabel}"`, safeText(fixture?.leagueName)],
  ];

  for (const parts of attempts) {
    const query = parts.filter(Boolean).join(" AND ");
    try {
      const payload = await fetchJson(
        `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=8&format=json&sort=DateDesc`
      );
      const articles = Array.isArray(payload?.articles) ? payload.articles : [];
      if (!articles.length) continue;
      return articles.map((article) => ({
        source_id: "gdelt",
        source_label: "GDELT",
        title: safeText(article?.title),
        summary: safeText(article?.domain || article?.sourcecountry),
        description: safeText(article?.snippet || article?.description || article?.title),
        published_at: parseGdeltPublishedAt(article),
        source_tier: "gdelt",
      }));
    } catch (_error) {
      continue;
    }
  }

  return [];
}

function getOfficialDomainsForFixture(fixture = {}) {
  const domains = [];
  const leagueName = normalizeTeamName(safeText(fixture?.leagueName));
  for (const label of [safeText(fixture?.homeTeamLabel), safeText(fixture?.awayTeamLabel)]) {
    for (const candidate of getTeamSearchCandidates(label)) {
      const key = normalizeTeamName(candidate);
      if (SPORTS_OFFICIAL_DOMAIN_MAP[key]) {
        domains.push(...SPORTS_OFFICIAL_DOMAIN_MAP[key]);
      }
    }
  }
  for (const [competitionKey, competitionDomains] of Object.entries(SPORTS_COMPETITION_OFFICIAL_DOMAINS)) {
    if (leagueName && (leagueName.includes(competitionKey) || competitionKey.includes(leagueName))) {
      domains.push(...competitionDomains);
    }
  }
  return uniqueStrings(domains.map((domain) => normalizeSourceHost(domain)).filter(Boolean)).slice(0, 5);
}

function getOfficialLabelsForFixture(fixture = {}) {
  return uniqueStrings([safeText(fixture?.homeTeamLabel), safeText(fixture?.awayTeamLabel), safeText(fixture?.leagueName)])
    .map((label) => normalizeSignalText(label))
    .filter(Boolean);
}

function buildGoogleNewsSearchUrl(query = "") {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

async function fetchGoogleNewsSearchItems(query = "", sourceId = "sports_google_news_search", sourceTier = "allowlist_search") {
  const normalizedQuery = safeText(query);
  if (!normalizedQuery) return [];
  try {
    const xml = await fetchText(buildGoogleNewsSearchUrl(normalizedQuery));
    return extractRssItems(xml).map((item) => ({
      ...item,
      source_id: sourceId,
      source_tier: sourceTier,
      source_label: safeText(item.source_label, "Google News Sports"),
    }));
  } catch (_error) {
    return [];
  }
}

function matchesOfficialSource(item = {}, allowedDomains = [], officialLabels = []) {
  const host = getSourceHost(item);
  const label = normalizeSignalText(safeText(item?.source_label));
  return (
    allowedDomains.some((domain) => sourceHostMatchesDomain(host, domain)) ||
    officialLabels.some((candidate) => candidate && label.includes(candidate))
  );
}

function matchesSportsAllowlist(item = {}) {
  const host = getSourceHost(item);
  const label = normalizeSignalText(safeText(item?.source_label));
  return SPORTS_SEARCH_ALLOWLIST.some(
    (rule) =>
      rule.labels.some((candidate) => label.includes(normalizeSignalText(candidate))) ||
      rule.domains.some((domain) => sourceHostMatchesDomain(host, domain))
  );
}

async function fetchSportsOfficialItems(fixture = {}) {
  const homeTeamLabel = safeText(fixture?.homeTeamLabel);
  const awayTeamLabel = safeText(fixture?.awayTeamLabel);
  if (!homeTeamLabel || !awayTeamLabel) return [];

  const officialDomains = getOfficialDomainsForFixture(fixture);
  const officialLabels = getOfficialLabelsForFixture(fixture);
  const fixtureTerms = buildSportsSemanticFixtureTerms(fixture);
  const leagueName = safeText(fixture?.leagueName);
  const collected = [];

  for (const domain of officialDomains) {
    const query = [`site:${domain}`, `"${homeTeamLabel}"`, `"${awayTeamLabel}"`, leagueName ? `"${leagueName}"` : ""]
      .filter(Boolean)
      .join(" ");
    const items = await fetchGoogleNewsSearchItems(query, "sports_official_search", "official");
    const matches = items
      .map((item) => {
        const corpus = normalizeSignalText(`${item.title} ${item.description}`);
        const alignmentParts = computeFixtureAlignmentParts(corpus, fixtureTerms);
        const alignment = computeFixtureAlignment(corpus, fixtureTerms);
        if (!alignmentParts.fixtureSpecific || alignment < 0.84) return null;
        if (!matchesOfficialSource(item, [domain], officialLabels)) return null;
        return {
          ...item,
          source_label: safeText(item.source_label, `Official ${domain}`),
          entity_alignment: alignment,
          source_tier: "official",
        };
      })
      .filter(Boolean)
      .slice(0, 2);
    collected.push(...matches);
    if (collected.length >= 4) break;
  }

  return dedupeSportsSemanticItems(collected).slice(0, 4);
}

async function fetchSportsAllowlistSearchItems(fixture = {}) {
  const homeTeamLabel = safeText(fixture?.homeTeamLabel);
  const awayTeamLabel = safeText(fixture?.awayTeamLabel);
  if (!homeTeamLabel || !awayTeamLabel) return [];

  const fixtureTerms = buildSportsSemanticFixtureTerms(fixture);
  const query = [`"${homeTeamLabel}"`, `"${awayTeamLabel}"`, safeText(fixture?.leagueName) || "football"]
    .filter(Boolean)
    .join(" ");
  const items = await fetchGoogleNewsSearchItems(query, "sports_allowlist_search", "allowlist_search");
  return dedupeSportsSemanticItems(
    items
      .map((item) => {
        const corpus = normalizeSignalText(`${item.title} ${item.description}`);
        const alignmentParts = computeFixtureAlignmentParts(corpus, fixtureTerms);
        const alignment = computeFixtureAlignment(corpus, fixtureTerms);
        if (!alignmentParts.fixtureSpecific || alignment < 0.84) return null;
        if (!matchesSportsAllowlist(item)) return null;
        return {
          ...item,
          entity_alignment: alignment,
          source_tier: "allowlist_search",
        };
      })
      .filter(Boolean)
      .slice(0, 4)
  ).slice(0, 4);
}

async function fetchSportsRssItems(fixture = {}) {
  const fixtureTerms = buildSportsSemanticFixtureTerms(fixture);
  const items = [];

  for (const feed of SPORTS_RSS_ALLOWLIST) {
    try {
      const xml = await fetchText(feed.url);
      const matches = extractRssItems(xml)
        .map((item) => {
          const corpus = normalizeSignalText(`${item.title} ${item.description}`);
          const alignmentParts = computeFixtureAlignmentParts(corpus, fixtureTerms);
          const alignment = computeFixtureAlignment(corpus, fixtureTerms);
          if (!alignmentParts.fixtureSpecific || alignment < 0.84) return null;
          return {
            source_id: feed.source_id,
            source_label: feed.label,
            title: item.title,
            description: item.description,
            published_at: item.published_at,
            source_tier: "allowlist_feed",
            link: item.link,
            source_url: item.source_url,
          };
        })
        .filter(Boolean)
        .slice(0, 3);
      items.push(...matches);
    } catch (_error) {
      continue;
    }
  }

  return items;
}

function buildSportsSemanticOverlaySummary(metrics = {}) {
  const notes = [];
  if (metrics.injury_pressure >= 0.45) notes.push("injury and availability pressure is active in public coverage");
  if (metrics.lineup_uncertainty >= 0.45) notes.push("lineup uncertainty remains live close to kickoff");
  if (metrics.motivation_context >= 0.45) notes.push("motivation and stakes context is reinforcing the matchup narrative");
  if (metrics.managerial_disruption >= 0.45) notes.push("managerial context is adding volatility");
  if (metrics.travel_fatigue >= 0.45) notes.push("travel and turnaround pressure is part of the public read");
  return notes;
}

function buildSportsSemanticInvalidators(metrics = {}, winningSide = "") {
  const losingSide = safeText(metrics?.losing_side);
  return uniqueStrings([
    winningSide ? `If confirmed lineups materially improve ${losingSide || "the other side"}, the current sports edge should compress fast.` : "",
    metrics.lineup_uncertainty >= 0.45 ? "Confirmed team news can still invalidate the current matchup lean." : "",
    metrics.injury_pressure >= 0.45 ? "Late injury or suspension updates can still flip the final read." : "",
    metrics.contradiction_score >= 0.34 ? "If the next public previews keep splitting across both sides, Crystal should stand down instead of forcing a pick." : "",
  ]).slice(0, 4);
}

function buildSportsTrendKeyword({ queryText = "", fixture = {}, groundedRead = null }) {
  const homeTeam = safeText(fixture?.homeTeamLabel, safeText(groundedRead?.question_side_a));
  const awayTeam = safeText(fixture?.awayTeamLabel, safeText(groundedRead?.question_side_b));
  const leagueName = safeText(fixture?.leagueName, safeText(groundedRead?.league_name));
  if (homeTeam && awayTeam) {
    return uniqueStrings([`${homeTeam} vs ${awayTeam}`, leagueName]).join(" ").trim();
  }
  return safeText(queryText)
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
}

async function buildSportsTrendOverlay({ queryText = "", fixture = {}, groundedRead = null }) {
  const keyword = buildSportsTrendKeyword({ queryText, fixture, groundedRead });
  if (!keyword) return null;

  try {
    const trendRaw = await googleTrends.interestOverTime({
      keyword,
      startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });
    const trend = JSON.parse(trendRaw);
    const values = (trend?.default?.timelineData || [])
      .map((item) => Number(item.value?.[0] || 0))
      .filter((value) => Number.isFinite(value));

    if (values.length < 3) return null;

    const latest = values[values.length - 1];
    const previous = values[Math.max(0, values.length - 4)] ?? latest;
    const peak = Math.max(...values);
    const averageInterest = average(values);
    const momentumScore = Number(clamp01(0.5 + (latest - previous) / 160, 0.5).toFixed(3));
    const narrativeHypeScore = Number(
      clamp01((latest / 100) * 0.52 + (peak / 100) * 0.18 + (averageInterest / 100) * 0.2 + momentumScore * 0.1, 0.12).toFixed(3)
    );

    return {
      source_id: "google_trends",
      keyword,
      latest_interest: latest,
      peak_interest: peak,
      average_interest: Number(averageInterest.toFixed(1)),
      momentum_score: momentumScore,
      narrative_hype_score: narrativeHypeScore,
      note:
        narrativeHypeScore >= 0.64
          ? `Public search attention around ${keyword} is elevated into the match window.`
          : `Public search attention around ${keyword} is present but not unusually hot.`,
      signal: {
        source_id: "google_trends",
        label: "Sports attention overlay",
        summary:
          narrativeHypeScore >= 0.64
            ? `Search attention is reinforcing the public match narrative around ${keyword}.`
            : `Search attention is present, but it is not adding a major extra push to this fixture.`,
        lean: "flat",
        freshness_score: 0.74,
        trust_score: Number(clamp01(narrativeHypeScore * 0.82, 0.42).toFixed(3)),
      },
    };
  } catch (_error) {
    return null;
  }
}

async function buildSportsPolymarketOverlay({ db, admin, fetchJson, queryText = "", queryPlan = {} }) {
  if (typeof fetchJson !== "function") return null;

  try {
    const frame = await getPolymarketPulse({
      db,
      admin,
      fetchJson,
      queryText,
      queryPlan,
    });
    if (!frame || !safeText(frame.market_id) || frame.implied_probability == null) {
      return null;
    }

    const marketConsensusStrength = Number(
      clamp01((Number(frame.match_confidence || 0) * 0.54) + (Number(frame.market_quality || 0) * 0.46), 0.08).toFixed(3)
    );
    const marketDisagreementScore =
      frame.divergence_vs_crystal == null ? null : Number(clamp01(Math.abs(Number(frame.divergence_vs_crystal)) * 2.4, 0).toFixed(3));
    const priceMovePressure =
      frame.price_change_7d == null ? null : Number(clamp01(Math.abs(Number(frame.price_change_7d)) / 0.18, 0).toFixed(3));

    return {
      source_id: "polymarket_public",
      market_question: safeText(frame.market_question, safeText(frame.outcome)),
      market_url: safeText(frame.market_url) || null,
      implied_probability: Number.isFinite(Number(frame.implied_probability)) ? Number(frame.implied_probability) : null,
      match_confidence: Number.isFinite(Number(frame.match_confidence)) ? Number(frame.match_confidence) : null,
      market_quality: Number.isFinite(Number(frame.market_quality)) ? Number(frame.market_quality) : null,
      divergence_vs_crystal:
        frame.divergence_vs_crystal == null ? null : Number(Number(frame.divergence_vs_crystal).toFixed(3)),
      price_change_7d: frame.price_change_7d == null ? null : Number(Number(frame.price_change_7d).toFixed(3)),
      market_consensus_strength: marketConsensusStrength,
      market_disagreement_score: marketDisagreementScore,
      price_move_pressure: priceMovePressure,
      note:
        marketConsensusStrength >= 0.6
          ? "Prediction-market pricing is aligned enough to count as a real sports market reference."
          : "Prediction-market pricing is present, but the match or liquidity quality is still only partial.",
      signal: {
        source_id: "polymarket_public",
        label: "Sports market overlay",
        summary:
          marketDisagreementScore != null && marketDisagreementScore >= 0.28
            ? "Prediction-market pricing is pulling away from the current Crystal lean and should stay in the invalidation map."
            : "Prediction-market pricing is broadly aligned with the current match read.",
        lean:
          marketDisagreementScore != null && marketDisagreementScore >= 0.28
            ? "flat"
            : Number(frame.divergence_vs_crystal) > 0.05
              ? "up"
              : Number(frame.divergence_vs_crystal) < -0.05
                ? "down"
                : "flat",
        freshness_score: 0.86,
        trust_score: Number(clamp01(marketConsensusStrength * 0.88, 0.42).toFixed(3)),
      },
    };
  } catch (_error) {
    return null;
  }
}

function buildSportsMarketInvalidators(marketOverlay = {}) {
  return uniqueStrings([
    marketOverlay?.market_disagreement_score != null && marketOverlay.market_disagreement_score >= 0.32
      ? "If prediction-market pricing keeps widening away from Crystal, the sports lean should move back to watchlist mode."
      : "",
    marketOverlay?.price_move_pressure != null && marketOverlay.price_move_pressure >= 0.5
      ? "Fast market repricing can invalidate the current read if it keeps moving after confirmed team news."
      : "",
    marketOverlay?.narrative_hype_score != null && marketOverlay.narrative_hype_score >= 0.72
      ? "Attention spikes can exaggerate the narrative if lineup news does not confirm it."
      : "",
  ]).slice(0, 4);
}

async function buildSportsMarketOverlay({ db, admin, fetchJson, queryText = "", queryPlan = {}, fixture = {}, groundedRead = null, domainId = "" }) {
  const [trendOverlay, polymarketOverlay] = await Promise.all([
    buildSportsTrendOverlay({ queryText, fixture, groundedRead }),
    buildSportsPolymarketOverlay({ db, admin, fetchJson, queryText, queryPlan }),
  ]);

  const usedSourceIds = uniqueStrings([trendOverlay?.source_id, polymarketOverlay?.source_id]);
  const marketConsensusStrength =
    polymarketOverlay?.market_consensus_strength != null
      ? polymarketOverlay.market_consensus_strength
      : trendOverlay?.narrative_hype_score != null
        ? Number(clamp01(Number(trendOverlay.narrative_hype_score) * 0.58, 0).toFixed(3))
        : null;
  const marketDisagreementScore = polymarketOverlay?.market_disagreement_score ?? null;
  const priceMovePressure = polymarketOverlay?.price_move_pressure ?? null;
  const narrativeHypeScore = trendOverlay?.narrative_hype_score ?? null;
  const overlayConfidence = Number(
    clamp01(
      (marketConsensusStrength || 0) * 0.42 +
        (narrativeHypeScore || 0) * 0.23 +
        (Number(polymarketOverlay?.match_confidence) || 0) * 0.2 +
        (usedSourceIds.length > 0 ? 0.12 : 0),
      0.08
    ).toFixed(3)
  );
  const isProbabilityMode = resolveDomainId(domainId, GENERAL_FORECAST_DOMAIN) === SPORTS_PROBABILITY_MODE_DOMAIN;
  const sportsbookReadinessState = isProbabilityMode
    ? usedSourceIds.length > 0
      ? "benchmark_only"
      : "market_context_thin"
    : usedSourceIds.length === 0
      ? "forecast_only"
      : marketConsensusStrength != null && marketConsensusStrength >= 0.42
        ? "forecast_betting_aware"
        : "forecast_context_only";
  const notes = uniqueStrings([trendOverlay?.note, polymarketOverlay?.note]).slice(0, 4);
  const signals = []
    .concat(trendOverlay?.signal ? [trendOverlay.signal] : [])
    .concat(polymarketOverlay?.signal ? [polymarketOverlay.signal] : []);

  return {
    enabled: true,
    available: usedSourceIds.length > 0,
    used_source_ids: usedSourceIds,
    source_count: usedSourceIds.length,
    confidence: overlayConfidence,
    notes,
    key_drivers: uniqueStrings(notes).slice(0, 3),
    invalidators: buildSportsMarketInvalidators({
      market_disagreement_score: marketDisagreementScore,
      price_move_pressure: priceMovePressure,
      narrative_hype_score: narrativeHypeScore,
    }),
    signals,
    google_trends: trendOverlay || null,
    polymarket_public: polymarketOverlay || null,
    market_consensus_strength: marketConsensusStrength,
    market_disagreement_score: marketDisagreementScore,
    price_move_pressure: priceMovePressure,
    narrative_hype_score: narrativeHypeScore,
    sportsbook_readiness_state: sportsbookReadinessState,
  };
}

async function buildSportsSemanticOverlay({ fetchJson, queryText = "", fixture = {}, groundedRead = null, domainId = SPORTS_MATCH_OUTCOMES_DOMAIN }) {
  const overlayMode = getSportsSemanticOverlayMode();
  if (overlayMode === "off") {
    return {
      enabled: false,
      mode: overlayMode,
      ready: false,
      publish_gate_ready: false,
      blocker_reason: "sports_semantic_overlay_disabled",
      notes: ["Sports semantic overlay is disabled in the current runtime mode."],
      signals: [],
    };
  }

  const fixtureWindow = buildSportsFixtureWindow({
    kickoffUtc: safeText(fixture?.kickoffUtc, safeText(groundedRead?.kickoff_utc)),
    queryDate: safeText(fixture?.queryDate),
  });

  if (!fixture?.resolved || !groundedRead?.fixture_resolved) {
    return {
      enabled: true,
      mode: overlayMode,
      ready: false,
      publish_gate_ready: false,
      blocker_reason: "sports_fixture_not_resolved",
      fixture_window_state: fixtureWindow.state,
      fixture_window_open: false,
      fixture_window_hours_to_kickoff: fixtureWindow.hours_to_kickoff,
      notes: ["Crystal needs a resolved sports fixture before it can evaluate the semantic overlay."],
      signals: [],
    };
  }

  if (fixtureWindow.window_open !== true) {
    return {
      enabled: true,
      mode: overlayMode,
      ready: false,
      publish_gate_ready: false,
      confidence: 0.18,
      blocker_reason: "sports_fixture_window_not_live",
      source_count: 0,
      freshness_hours: null,
      entity_alignment_score: 0,
      contradiction_score: 0,
      narrative_consensus: "window_closed",
      fixture_window_state: fixtureWindow.state,
      fixture_window_open: false,
      fixture_window_hours_to_kickoff: fixtureWindow.hours_to_kickoff,
      notes: [fixtureWindow.note],
      key_drivers: [],
      counter_signals: [],
      invalidators: [
        "Re-run this matchup inside the week before kickoff so lineup and injury signals become match-specific.",
      ],
      signals: [],
    };
  }

  const fixtureTerms = buildSportsSemanticFixtureTerms(fixture);
  const officialItems = await fetchSportsOfficialItems(fixture);
  const allowlistSearchItems = await fetchSportsAllowlistSearchItems(fixture);
  const feedItems =
    officialItems.length + allowlistSearchItems.length < 3
      ? await fetchSportsRssItems(fixture)
      : [];
  const gdeltItems =
    officialItems.length + allowlistSearchItems.length + feedItems.length < 3
      ? await fetchSportsGdeltItems(fetchJson, fixture)
      : [];

  const snippets = dedupeSportsSemanticItems(
    []
      .concat(officialItems)
      .concat(allowlistSearchItems)
      .concat(feedItems)
      .concat(gdeltItems)
  )
    .map((item) => {
      const corpus = normalizeSignalText(`${item.title} ${item.description}`);
      const tags = buildSportsSemanticTags(corpus);
      const alignment = Number.isFinite(Number(item.entity_alignment))
        ? Number(item.entity_alignment)
        : computeFixtureAlignment(corpus, fixtureTerms);
      const alignmentParts = computeFixtureAlignmentParts(corpus, fixtureTerms);
      return {
        ...item,
        tags,
        entity_alignment: alignment,
        fixture_specific: alignmentParts.fixtureSpecific,
        hours_old: hoursSince(item.published_at),
        source_weight: getSportsSourceWeight(safeText(item.source_tier)),
      };
    })
    .filter((item) => item.fixture_specific === true && item.entity_alignment >= 0.84)
    .slice(0, 6);

  const sourceCount = snippets.length;
  const entityAlignmentScore = Number(
    clamp01(weightedAverageBy(snippets, (item) => item.entity_alignment, (item) => item.source_weight), 0).toFixed(3)
  );
  const freshnessHours = weightedAverageBy(
    snippets.filter((item) => Number.isFinite(item.hours_old)),
    (item) => item.hours_old,
    (item) => item.source_weight
  );
  const freshnessScore =
    freshnessHours == null ? 0.3 : freshnessHours <= 18 ? 0.94 : freshnessHours <= 36 ? 0.84 : freshnessHours <= 72 ? 0.72 : 0.46;
  const metricValue = (key) =>
    Number(clamp01(snippets.filter((item) => item.tags?.[key]).length / Math.max(1, sourceCount), 0).toFixed(3));
  const injuryPressure = metricValue("injury_pressure");
  const lineupUncertainty = metricValue("lineup_uncertainty");
  const managerialDisruption = metricValue("managerial_disruption");
  const travelFatigue = metricValue("travel_fatigue");
  const motivationContext = metricValue("motivation_context");
  const contradictionScore = Number(
    clamp01(
      (sourceCount < 3 ? 0.32 : 0.12) +
        Math.max(0, 0.72 - entityAlignmentScore) * 0.55 +
        (sourceCount > 0 && injuryPressure === 0 && lineupUncertainty === 0 && motivationContext === 0 ? 0.12 : 0),
      0.28
    ).toFixed(3)
  );
  const narrativeConsensus =
    sourceCount < 3 ? "thin" : contradictionScore <= 0.28 && entityAlignmentScore >= 0.72 ? "aligned" : contradictionScore <= 0.42 ? "mixed" : "conflicted";
  const overlayConfidence = Number(
    clamp01(0.18 + Math.min(0.36, sourceCount * 0.08) + freshnessScore * 0.22 + entityAlignmentScore * 0.2 - contradictionScore * 0.25, 0.18).toFixed(3)
  );

  let blockerReason = "";
  if (sourceCount < 3) blockerReason = "sports_semantic_source_count_thin";
  else if ((freshnessHours ?? 999) > 72) blockerReason = "sports_semantic_stale";
  else if (entityAlignmentScore < 0.72) blockerReason = "sports_semantic_entity_alignment_thin";
  else if (contradictionScore > 0.32) blockerReason = "sports_semantic_conflicted";

  const ready = !blockerReason;
  const publishGateReady =
    ready && overlayMode === "a29" && resolveDomainId(domainId, GENERAL_FORECAST_DOMAIN) === SPORTS_MATCH_OUTCOMES_DOMAIN;
  const structuredLean =
    safeText(groundedRead?.winning_side) && safeText(groundedRead?.winning_side) === safeText(groundedRead?.question_side_a) ? "up" : "down";
  const overlayNotes = buildSportsSemanticOverlaySummary({
    injury_pressure: injuryPressure,
    lineup_uncertainty: lineupUncertainty,
    managerial_disruption: managerialDisruption,
    travel_fatigue: travelFatigue,
    motivation_context: motivationContext,
  });
  const overlaySignals = sourceCount
    ? [
        {
          source_id: "sports_semantic_overlay",
          label: "Sports semantic overlay",
          summary:
            overlayNotes.length > 0
              ? `Public sports coverage is reinforcing the structured lean because ${overlayNotes.slice(0, 2).join(" and ")}.`
              : "Public sports coverage is thin but still aligned enough to describe the current match narrative.",
          lean: ready ? structuredLean : "flat",
          freshness_score: Number(freshnessScore.toFixed(3)),
          trust_score: overlayConfidence,
        },
      ]
    : [];

  return {
    enabled: true,
    mode: overlayMode,
    ready,
    publish_gate_ready: publishGateReady,
    confidence: overlayConfidence,
    blocker_reason: blockerReason || "",
    source_count: sourceCount,
    freshness_hours: freshnessHours != null ? Number(freshnessHours.toFixed(1)) : null,
    entity_alignment_score: entityAlignmentScore,
    contradiction_score: contradictionScore,
    fixture_window_state: fixtureWindow.state,
    fixture_window_open: fixtureWindow.window_open,
    fixture_window_hours_to_kickoff: fixtureWindow.hours_to_kickoff,
    injury_pressure: injuryPressure,
    lineup_uncertainty: lineupUncertainty,
    managerial_disruption: managerialDisruption,
    travel_fatigue: travelFatigue,
    motivation_context: motivationContext,
    narrative_consensus: narrativeConsensus,
    notes: uniqueStrings(
      snippets
        .map((item) => safeText(item.title))
        .filter(Boolean)
        .slice(0, 4)
        .concat(
          blockerReason === "sports_semantic_source_count_thin" ? ["Crystal still has too few corroborating public sports sources for this fixture."] : [],
          blockerReason === "sports_semantic_stale" ? ["The available public sports previews are too stale for a publish-ready pick."] : [],
          blockerReason === "sports_semantic_entity_alignment_thin"
            ? ["The public sports coverage is not aligned tightly enough with this exact fixture yet."]
            : [],
          blockerReason === "sports_semantic_conflicted" ? ["The public sports narrative is still too split to promote the current lean into a pick."] : []
        )
    ).slice(0, 4),
    key_drivers: overlayNotes.slice(0, 4),
    counter_signals: uniqueStrings([
      contradictionScore >= 0.34 ? "Public previews are still splitting across both sides of the fixture." : "",
      lineupUncertainty >= 0.45 ? "Expected lineups still carry enough uncertainty to keep the pick fragile." : "",
      injuryPressure >= 0.45 ? "Late availability news still has room to alter the matchup balance." : "",
    ]).slice(0, 4),
    invalidators: buildSportsSemanticInvalidators(
      {
        lineup_uncertainty: lineupUncertainty,
        injury_pressure: injuryPressure,
        contradiction_score: contradictionScore,
        losing_side:
          safeText(groundedRead?.winning_side) === safeText(groundedRead?.question_side_a)
            ? safeText(groundedRead?.question_side_b)
            : safeText(groundedRead?.question_side_a),
      },
      safeText(groundedRead?.winning_side)
    ),
    signals: overlaySignals,
  };
}

async function callTheSportsDbApi(fetchJson, endpoint, query = {}) {
  const config = getSportsConfig();
  const url = buildTheSportsDbUrl(config, endpoint, query);
  return fetchJson(url, { method: "GET" });
}

async function callApiFootball(fetchJson, path, query = {}) {
  const config = getSportsConfig();
  if (!config.apiFootballKey) {
    return null;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  const url = `${config.apiFootballBaseUrl}${path}${params.toString() ? `?${params.toString()}` : ""}`;
  return fetchJson(url, {
    method: "GET",
    headers: {
      "x-apisports-key": config.apiFootballKey,
    },
  });
}

function normalizeTheSportsDbTeamRecord(team = {}) {
  const teamId = safeNumber(team?.idTeam);
  if (!teamId) return null;

  const leagues = [];
  for (let index = 1; index <= 7; index += 1) {
    const nameKey = index === 1 ? "strLeague" : `strLeague${index}`;
    const idKey = index === 1 ? "idLeague" : `idLeague${index}`;
    const leagueId = safeNumber(team?.[idKey]);
    const leagueName = safeText(team?.[nameKey]);
    if (leagueId || leagueName) {
      leagues.push({
        id: leagueId,
        name: leagueName,
      });
    }
  }

  return {
    team: {
      id: teamId,
      name: safeText(team?.strTeam),
      alternate_name: safeText(team?.strTeamAlternate),
      country: safeText(team?.strCountry),
      league_id: safeNumber(team?.idLeague),
      league_name: safeText(team?.strLeague),
    },
    leagues,
    raw: team,
  };
}

function toApiFootballStyleStatus(event = {}) {
  const statusLabel = safeText(event?.strStatus).toLowerCase();
  const hasScores = Number.isFinite(safeNumber(event?.intHomeScore)) || Number.isFinite(safeNumber(event?.intAwayScore));
  if (statusLabel.includes("finished") || hasScores) return "FT";
  if (statusLabel.includes("not started")) return "NS";
  if (statusLabel.includes("postponed")) return "PST";
  return safeText(event?.strStatus, "NS").slice(0, 3).toUpperCase();
}

function normalizeTheSportsDbEvent(event = {}) {
  const fixtureId = safeNumber(event?.idEvent);
  if (!fixtureId) return null;
  return {
    fixture: {
      id: fixtureId,
      date: safeText(event?.strTimestamp) || [safeText(event?.dateEvent), safeText(event?.strTime)].filter(Boolean).join("T"),
      status: {
        short: toApiFootballStyleStatus(event),
      },
      venue: {
        name: safeText(event?.strVenue),
      },
    },
    league: {
      id: safeNumber(event?.idLeague),
      name: safeText(event?.strLeague),
      season: safeText(event?.strSeason),
    },
    teams: {
      home: {
        id: safeNumber(event?.idHomeTeam),
        name: safeText(event?.strHomeTeam),
      },
      away: {
        id: safeNumber(event?.idAwayTeam),
        name: safeText(event?.strAwayTeam),
      },
    },
    goals: {
      home: safeNumber(event?.intHomeScore),
      away: safeNumber(event?.intAwayScore),
    },
    provider: "thesportsdb_public",
    raw: event,
  };
}

function normalizeTheSportsDbTableRow(row = {}) {
  const teamId = safeNumber(row?.idTeam);
  if (!teamId) return null;
  return {
    teamId,
    teamName: safeText(row?.strTeam),
    rank: safeNumber(row?.intRank),
    points: safeNumber(row?.intPoints, 0),
    games: safeNumber(row?.intPlayed, 0),
    wins: safeNumber(row?.intWin, 0),
    draws: safeNumber(row?.intDraw, 0),
    losses: safeNumber(row?.intLoss, 0),
    goalsFor: safeNumber(row?.intGoalsFor, 0),
    goalsAgainst: safeNumber(row?.intGoalsAgainst, 0),
    goalDifference: safeNumber(row?.intGoalDifference, 0),
    form: safeText(row?.strForm),
    season: safeText(row?.strSeason),
  };
}

function teamRecordMatchesTerm(teamRecord, term) {
  const normalizedTerm = normalizeTeamName(term);
  if (!normalizedTerm) return false;
  const allNames = uniqueStrings([
    safeText(teamRecord?.team?.name),
    safeText(teamRecord?.team?.alternate_name),
  ]);
  return allNames.some((name) => normalizeTeamName(name).includes(normalizedTerm) || normalizedTerm.includes(normalizeTeamName(name)));
}

async function searchTeamTheSportsDb(fetchJson, name) {
  const candidates = getTeamSearchCandidates(name);
  for (const term of candidates) {
    try {
      const payload = await callTheSportsDbApi(fetchJson, "searchteams.php", { t: term });
      const items = Array.isArray(payload?.teams) ? payload.teams : [];
      if (!items.length) continue;
      const normalized = items.map(normalizeTheSportsDbTeamRecord).filter(Boolean);
      const exact = normalized.find((item) => teamRecordMatchesTerm(item, name));
      if (exact) return exact;
      if (normalized.length) return normalized[0];
    } catch (_error) {
      continue;
    }
  }
  return null;
}

function eventMatchesHeadToHead(event = {}, homeLabel = "", awayLabel = "") {
  const left = normalizeTeamName(event?.strHomeTeam);
  const right = normalizeTeamName(event?.strAwayTeam);
  const home = normalizeTeamName(homeLabel);
  const away = normalizeTeamName(awayLabel);
  if (!home || !away) return false;
  return (left === home && right === away) || (left === away && right === home);
}

function sortEventsByRelevance(events = [], date = null) {
  const targetDate = safeText(date);
  return events
    .slice()
    .sort((left, right) => {
      const leftDate = Date.parse(safeText(left?.strTimestamp) || safeText(left?.dateEvent) || "");
      const rightDate = Date.parse(safeText(right?.strTimestamp) || safeText(right?.dateEvent) || "");
      if (targetDate) {
        const targetMs = Date.parse(targetDate);
        const leftDistance = Number.isFinite(leftDate) ? Math.abs(leftDate - targetMs) : Number.MAX_SAFE_INTEGER;
        const rightDistance = Number.isFinite(rightDate) ? Math.abs(rightDate - targetMs) : Number.MAX_SAFE_INTEGER;
        if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      }
      return (rightDate || 0) - (leftDate || 0);
    });
}

async function searchHeadToHeadEventTheSportsDb(fetchJson, homeTeam, awayTeam, date) {
  const attempts = uniqueStrings([
    `${homeTeam} vs ${awayTeam}`,
    `${awayTeam} vs ${homeTeam}`,
    `${homeTeam}_${awayTeam}`,
    `${awayTeam}_${homeTeam}`,
  ]);

  for (const term of attempts) {
    try {
      const payload = await callTheSportsDbApi(fetchJson, "searchevents.php", { e: term });
      const events = (Array.isArray(payload?.event) ? payload.event : []).filter((event) => eventMatchesHeadToHead(event, homeTeam, awayTeam));
      if (!events.length) continue;
      return sortEventsByRelevance(events, date)[0] || null;
    } catch (_error) {
      continue;
    }
  }

  return null;
}

async function fetchEventsByDayTheSportsDb(fetchJson, date) {
  const day = toUtcDateKey(date);
  if (!day) return [];
  try {
    const payload = await callTheSportsDbApi(fetchJson, "eventsday.php", { d: day, s: "Soccer" });
    const list = Array.isArray(payload?.events) ? payload.events : Array.isArray(payload?.results) ? payload.results : [];
    return list.filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function sortUpcomingEvents(events = [], preferredDate = "") {
  const targetMs = preferredDate ? Date.parse(preferredDate) : Date.now();
  return events
    .slice()
    .sort((left, right) => {
      const leftDate = Date.parse(safeText(left?.strTimestamp) || safeText(left?.dateEvent) || "");
      const rightDate = Date.parse(safeText(right?.strTimestamp) || safeText(right?.dateEvent) || "");
      const leftDistance = Number.isFinite(leftDate) ? Math.abs(leftDate - targetMs) : Number.MAX_SAFE_INTEGER;
      const rightDistance = Number.isFinite(rightDate) ? Math.abs(rightDate - targetMs) : Number.MAX_SAFE_INTEGER;
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return (leftDate || 0) - (rightDate || 0);
    });
}

async function findFixtureByDateWindowTheSportsDb(fetchJson, homeTeam, awayTeam, date) {
  const searchDates = date ? [toUtcDateKey(date)] : buildSportsFixtureSearchDates(7);
  const matches = [];
  for (const day of searchDates) {
    const events = await fetchEventsByDayTheSportsDb(fetchJson, day);
    const filtered = events.filter((event) => eventMatchesHeadToHead(event, homeTeam, awayTeam));
    if (filtered.length) {
      matches.push(...filtered);
      if (date) break;
    }
  }
  if (!matches.length) return null;
  return sortUpcomingEvents(matches, date || searchDates[0])[0] || null;
}

async function fetchTeamScheduleTheSportsDb(fetchJson, teamId, direction = "next") {
  if (!teamId) return [];
  const endpoint = direction === "last" ? "eventslast.php" : "eventsnext.php";
  try {
    const payload = await callTheSportsDbApi(fetchJson, endpoint, { id: teamId });
    const list = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.events)
        ? payload.events
        : [];
    return list.map(normalizeTheSportsDbEvent).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function selectMutualFixture(events = [], homeId, awayId, strictHomeAway = true) {
  return (
    events.find((event) => {
      const left = safeNumber(event?.teams?.home?.id);
      const right = safeNumber(event?.teams?.away?.id);
      if (strictHomeAway) {
        return left === homeId && right === awayId;
      }
      return (left === homeId && right === awayId) || (left === awayId && right === homeId);
    }) || null
  );
}

function buildDirectTeamRecordFromEvent(event = {}, preferredSide = "home") {
  const useHome = preferredSide === "home";
  return {
    team: {
      id: safeNumber(useHome ? event?.idHomeTeam : event?.idAwayTeam),
      name: safeText(useHome ? event?.strHomeTeam : event?.strAwayTeam),
      alternate_name: "",
      country: safeText(event?.strCountry),
      league_id: safeNumber(event?.idLeague),
      league_name: safeText(event?.strLeague),
    },
    leagues: [{ id: safeNumber(event?.idLeague), name: safeText(event?.strLeague) }],
    raw: null,
  };
}

async function findFixtureTheSportsDb(fetchJson, homeTeam, awayTeam, date) {
  const datedOrWindowEvent = await findFixtureByDateWindowTheSportsDb(fetchJson, homeTeam, awayTeam, date);
  const directEvent = datedOrWindowEvent || (await searchHeadToHeadEventTheSportsDb(fetchJson, homeTeam, awayTeam, date));
  const directEventHome = normalizeTeamName(directEvent?.strHomeTeam);
  const queryHome = normalizeTeamName(homeTeam);
  const directEventMatchesQueryOrder =
    directEvent &&
    queryHome &&
    (directEventHome === queryHome || directEventHome.includes(queryHome) || queryHome.includes(directEventHome));

  const homeRecord =
    directEvent && safeNumber(directEvent?.idHomeTeam)
      ? buildDirectTeamRecordFromEvent(directEvent, directEventMatchesQueryOrder ? "home" : "away")
      : await searchTeamTheSportsDb(fetchJson, homeTeam);
  const awayRecord =
    directEvent && safeNumber(directEvent?.idAwayTeam)
      ? buildDirectTeamRecordFromEvent(directEvent, directEventMatchesQueryOrder ? "away" : "home")
      : await searchTeamTheSportsDb(fetchJson, awayTeam);

  if (!homeRecord?.team?.id || !awayRecord?.team?.id) {
    return null;
  }

  const homeId = safeNumber(homeRecord.team.id);
  const awayId = safeNumber(awayRecord.team.id);
  const [homeNext, awayNext, homeLast, awayLast] = await Promise.all([
    fetchTeamScheduleTheSportsDb(fetchJson, homeId, "next"),
    fetchTeamScheduleTheSportsDb(fetchJson, awayId, "next"),
    fetchTeamScheduleTheSportsDb(fetchJson, homeId, "last"),
    fetchTeamScheduleTheSportsDb(fetchJson, awayId, "last"),
  ]);
  const nextFixture =
    selectMutualFixture(homeNext, homeId, awayId, true) ||
    selectMutualFixture(awayNext, homeId, awayId, false);
  const lastFixture =
    selectMutualFixture(homeLast, homeId, awayId, true) ||
    selectMutualFixture(awayLast, homeId, awayId, false);
  let fixture = null;

  if (datedOrWindowEvent) {
    fixture = normalizeTheSportsDbEvent(datedOrWindowEvent);
  } else if (date && directEvent) {
    fixture = normalizeTheSportsDbEvent(directEvent);
  }

  if (!fixture) {
    fixture = nextFixture || lastFixture || (directEvent ? normalizeTheSportsDbEvent(directEvent) : null);
  }

  return {
    fixture,
    homeTeam: homeRecord,
    awayTeam: awayRecord,
  };
}

async function searchTeamApiFootball(fetchJson, name) {
  const term = normalizeWhitespace(name);
  if (!term) return null;
  const payload = await callApiFootball(fetchJson, "/teams", { search: term });
  const items = Array.isArray(payload?.response) ? payload.response : [];
  if (items.length === 0) return null;

  const exact = items.find((item) => normalizeTeamName(item?.team?.name) === normalizeTeamName(term));
  return exact || items[0];
}

async function findFixtureApiFootball(fetchJson, homeTeam, awayTeam, date) {
  const home = await searchTeamApiFootball(fetchJson, homeTeam);
  const away = await searchTeamApiFootball(fetchJson, awayTeam);
  if (!home?.team?.id || !away?.team?.id) {
    return null;
  }

  const homeId = Number(home.team.id);
  const awayId = Number(away.team.id);

  const listCandidates = [];
  if (date) {
    listCandidates.push({
      path: "/fixtures",
      query: {
        date,
        team: homeId,
        season: Number(date.slice(0, 4)),
      },
      strictHomeAway: true,
    });
  }
  listCandidates.push(
    {
      path: "/fixtures",
      query: {
        team: homeId,
        next: 10,
      },
      strictHomeAway: true,
    },
    {
      path: "/fixtures",
      query: {
        team: awayId,
        next: 10,
      },
      strictHomeAway: true,
    },
    {
      path: "/fixtures",
      query: {
        h2h: `${homeId}-${awayId}`,
        next: 10,
      },
      strictHomeAway: false,
    },
    {
      path: "/fixtures",
      query: {
        h2h: `${homeId}-${awayId}`,
        last: 10,
      },
      strictHomeAway: false,
    },
    {
      path: "/fixtures/headtohead",
      query: {
        h2h: `${homeId}-${awayId}`,
        last: 10,
      },
      strictHomeAway: false,
    }
  );

  let match = null;
  for (const candidate of listCandidates) {
    try {
      const payload = await callApiFootball(fetchJson, candidate.path, candidate.query);
      const fixtures = Array.isArray(payload?.response) ? payload.response : [];
      match = fixtures.find((fixture) => {
        const left = Number(fixture?.teams?.home?.id);
        const right = Number(fixture?.teams?.away?.id);
        if (candidate.strictHomeAway) {
          return left === homeId && right === awayId;
        }
        return (left === homeId && right === awayId) || (left === awayId && right === homeId);
      });
      if (match) break;
    } catch (_error) {
      continue;
    }
  }

  return {
    fixture: match || null,
    homeTeam: home,
    awayTeam: away,
  };
}

async function searchTeam(fetchJson, name) {
  return searchTeamTheSportsDb(fetchJson, name);
}

async function findFixture(fetchJson, homeTeam, awayTeam, date) {
  const config = getSportsConfig();
  const sportsDbResult = await findFixtureTheSportsDb(fetchJson, homeTeam, awayTeam, date);
  if (sportsDbResult?.fixture && sportsDbResult?.homeTeam?.team?.id && sportsDbResult?.awayTeam?.team?.id) {
    return sportsDbResult;
  }
  if (shouldUseApiFootballEnhancer(config)) {
    return (await findFixtureApiFootball(fetchJson, homeTeam, awayTeam, date).catch(() => null)) || sportsDbResult;
  }
  return sportsDbResult;
}

function summarizeForm(fixtures = [], teamId) {
  const summary = {
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  };

  for (const fixture of fixtures) {
    if (fixture?.fixture?.status?.short !== "FT") continue;

    const isHome = Number(fixture?.teams?.home?.id) === Number(teamId);
    const goalsFor = Number(isHome ? fixture?.goals?.home : fixture?.goals?.away);
    const goalsAgainst = Number(isHome ? fixture?.goals?.away : fixture?.goals?.home);
    if (!Number.isFinite(goalsFor) || !Number.isFinite(goalsAgainst)) continue;

    summary.games += 1;
    summary.goalsFor += goalsFor;
    summary.goalsAgainst += goalsAgainst;
    if (goalsFor > goalsAgainst) summary.wins += 1;
    else if (goalsFor === goalsAgainst) summary.draws += 1;
    else summary.losses += 1;
  }

  return summary;
}

async function fetchRecentFixturesApiFootball(fetchJson, teamId, leagueId, season) {
  if (!teamId) return [];
  try {
    const payload = await callApiFootball(fetchJson, "/fixtures", {
      team: teamId,
      league: leagueId,
      season,
      last: 5,
      status: "FT",
    });
    return Array.isArray(payload?.response) ? payload.response : [];
  } catch (_error) {
    return [];
  }
}

async function fetchRecentFixturesTheSportsDb(fetchJson, teamId, leagueId) {
  if (!teamId) return [];
  try {
    const payload = await callTheSportsDbApi(fetchJson, "eventslast.php", { id: teamId });
    const list = Array.isArray(payload?.results) ? payload.results : [];
    const normalized = list
      .map(normalizeTheSportsDbEvent)
      .filter(Boolean)
      .slice(0, 8);
    const filtered = normalized.filter((fixture) => !leagueId || safeNumber(fixture?.league?.id) === safeNumber(leagueId));
    return (filtered.length ? filtered : normalized).slice(0, 5);
  } catch (_error) {
    return [];
  }
}

async function fetchRecentFixtures(fetchJson, teamId, leagueId, season) {
  const config = getSportsConfig();
  if (shouldUseApiFootballEnhancer(config)) {
    const apiFootballFixtures = await fetchRecentFixturesApiFootball(fetchJson, teamId, leagueId, season).catch(() => []);
    if (Array.isArray(apiFootballFixtures) && apiFootballFixtures.length > 0) {
      return apiFootballFixtures;
    }
  }
  return fetchRecentFixturesTheSportsDb(fetchJson, teamId, leagueId, season);
}

function buildOddsSummary(payload) {
  const items = Array.isArray(payload?.response) ? payload.response : [];
  const first = items[0];
  const firstBookmaker = Array.isArray(first?.bookmakers) ? first.bookmakers[0] : null;
  const matchWinner = Array.isArray(firstBookmaker?.bets)
    ? firstBookmaker.bets.find((bet) => safeText(bet?.name).toLowerCase().includes("match winner")) || firstBookmaker.bets[0]
    : null;
  const values = Array.isArray(matchWinner?.values) ? matchWinner.values : [];
  const market = {
    bookmaker: safeText(firstBookmaker?.name),
    home_decimal_odd: null,
    away_decimal_odd: null,
    draw_decimal_odd: null,
    home_implied_probability: null,
    away_implied_probability: null,
    draw_implied_probability: null,
  };
  const summary = values
    .map((item) => `${safeText(item?.value)} ${safeText(item?.odd)}`.trim())
    .filter(Boolean)
    .slice(0, 3);

  for (const item of values) {
    const label = normalizeWhitespace(item?.value).toLowerCase();
    const odd = Number(item?.odd);
    if (!Number.isFinite(odd) || odd <= 1) continue;
    const implied = Number((1 / odd).toFixed(3));
    if (label === "home" || label === "1") {
      market.home_decimal_odd = odd;
      market.home_implied_probability = implied;
    } else if (label === "away" || label === "2") {
      market.away_decimal_odd = odd;
      market.away_implied_probability = implied;
    } else if (label === "draw" || label === "x") {
      market.draw_decimal_odd = odd;
      market.draw_implied_probability = implied;
    }
  }

  return {
    summary,
    market,
  };
}

async function fetchFixtureOdds(fetchJson, fixtureId) {
  const config = getSportsConfig();
  if (!config.apiFootballKey || !fixtureId) {
    return {
      summary: [],
      market: null,
    };
  }
  try {
    const payload = await callApiFootball(fetchJson, "/odds", { fixture: fixtureId });
    return buildOddsSummary(payload);
  } catch (_error) {
    return {
      summary: [],
      market: null,
    };
  }
}

function normalizeApiFootballTableRow(row = {}) {
  const teamId = safeNumber(row?.team?.id);
  if (!teamId) return null;
  return {
    teamId,
    teamName: safeText(row?.team?.name),
    rank: safeNumber(row?.rank),
    points: safeNumber(row?.points, 0),
    games: safeNumber(row?.all?.played, 0),
    wins: safeNumber(row?.all?.win, 0),
    draws: safeNumber(row?.all?.draw, 0),
    losses: safeNumber(row?.all?.lose, 0),
    goalsFor: safeNumber(row?.all?.goals?.for, 0),
    goalsAgainst: safeNumber(row?.all?.goals?.against, 0),
    goalDifference: safeNumber(row?.goalsDiff, 0),
    form: safeText(row?.form),
    season: safeText(row?.season),
  };
}

async function fetchLeagueTableApiFootball(fetchJson, leagueId, season) {
  if (!leagueId || !season) return [];
  try {
    const payload = await callApiFootball(fetchJson, "/standings", {
      league: leagueId,
      season,
    });
    const blocks = Array.isArray(payload?.response?.[0]?.league?.standings) ? payload.response[0].league.standings : [];
    const flatRows = blocks.flatMap((group) => (Array.isArray(group) ? group : []));
    return flatRows.map(normalizeApiFootballTableRow).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

async function fetchLeagueTableTheSportsDb(fetchJson, leagueId, season) {
  if (!leagueId) return [];
  const attempts = [
    { l: leagueId, s: season || undefined },
    { l: leagueId },
  ];
  for (const query of attempts) {
    try {
      const payload = await callTheSportsDbApi(fetchJson, "lookuptable.php", query);
      const rows = Array.isArray(payload?.table) ? payload.table.map(normalizeTheSportsDbTableRow).filter(Boolean) : [];
      if (rows.length) return rows;
    } catch (_error) {
      continue;
    }
  }
  return [];
}

async function fetchLeagueTable(fetchJson, leagueId, season) {
  const config = getSportsConfig();
  if (shouldUseApiFootballEnhancer(config)) {
    const apiFootballRows = await fetchLeagueTableApiFootball(fetchJson, leagueId, season).catch(() => []);
    if (Array.isArray(apiFootballRows) && apiFootballRows.length > 0) {
      return apiFootballRows;
    }
  }
  return fetchLeagueTableTheSportsDb(fetchJson, leagueId, season);
}

function summarizeStanding(tableRows = [], teamId) {
  if (!Array.isArray(tableRows) || !teamId) return null;
  return tableRows.find((row) => safeNumber(row?.teamId) === safeNumber(teamId)) || null;
}

function calculateFormStrength(summary = {}) {
  const games = Number(summary?.games || 0);
  if (!Number.isFinite(games) || games <= 0) return 0;
  const wins = Number(summary?.wins || 0);
  const draws = Number(summary?.draws || 0);
  const goalsFor = Number(summary?.goalsFor || 0);
  const goalsAgainst = Number(summary?.goalsAgainst || 0);
  const pointsRate = (wins * 3 + draws) / Math.max(1, games * 3);
  const goalDiffPerGame = (goalsFor - goalsAgainst) / Math.max(1, games);
  return pointsRate * 0.7 + goalDiffPerGame * 0.1;
}

function calculateStandingStrength(standing = {}) {
  if (!standing) return 0;
  const games = Math.max(1, Number(standing.games || 0));
  const pointsRate = Number(standing.points || 0) / Math.max(1, games * 3);
  const goalDiffPerGame = Number(standing.goalDifference || 0) / games;
  const rank = Math.max(1, Number(standing.rank || 20));
  const rankScore = clamp01(1 - (rank - 1) / 19, 0.2);
  return pointsRate * 0.55 + goalDiffPerGame * 0.15 + rankScore * 0.3;
}

function buildSportsGroundedRead({
  fixtureLabel = "",
  homeTeamLabel = "",
  awayTeamLabel = "",
  homeForm = {},
  awayForm = {},
  homeStanding = null,
  awayStanding = null,
  oddsMarket = null,
  leagueName = "",
  kickoffUtc = "",
  venue = "",
  providerSourceId = "thesportsdb_public",
  providerLabel = "TheSportsDB",
}) {
  const questionSideA = safeText(homeTeamLabel);
  const questionSideB = safeText(awayTeamLabel);
  if (!questionSideA || !questionSideB) {
    return {
      provider_required: true,
      provider_configured: true,
      fixture_resolved: false,
      parity_ready: false,
      provider_source_id: providerSourceId,
      provider_label: providerLabel,
      reason: "Fixture resolution did not return stable home and away teams.",
    };
  }

  const homeFormStrength = calculateFormStrength(homeForm);
  const awayFormStrength = calculateFormStrength(awayForm);
  const homeStandingStrength = calculateStandingStrength(homeStanding);
  const awayStandingStrength = calculateStandingStrength(awayStanding);
  const homeConsensus = Number(oddsMarket?.home_implied_probability);
  const awayConsensus = Number(oddsMarket?.away_implied_probability);
  const hasTableEdge = Boolean(homeStanding && awayStanding);
  const hasProviderEdge =
    Number(homeForm?.games || 0) > 0 ||
    Number(awayForm?.games || 0) > 0 ||
    hasTableEdge ||
    (Number.isFinite(homeConsensus) && Number.isFinite(awayConsensus));

  if (!hasProviderEdge) {
    return {
      provider_required: true,
      provider_configured: true,
      fixture_resolved: true,
      parity_ready: false,
      provider_source_id: providerSourceId,
      provider_label: providerLabel,
      question_side_a: questionSideA,
      question_side_b: questionSideB,
      reason: `The fixture resolved, but ${providerLabel} did not return enough structured edge data to support a parity-ready pick.`,
    };
  }

  const formDelta = homeFormStrength - awayFormStrength;
  const standingDelta = homeStandingStrength - awayStandingStrength;
  const consensusDelta =
    Number.isFinite(homeConsensus) && Number.isFinite(awayConsensus) ? homeConsensus - awayConsensus : 0;
  const combinedEdge = formDelta * 0.6 + standingDelta * 0.3 + consensusDelta * 0.1;
  const winningSide = combinedEdge >= 0 ? questionSideA : questionSideB;
  const losingSide = winningSide === questionSideA ? questionSideB : questionSideA;
  const edgeStrength = Math.abs(combinedEdge);
  const winningProbability = edgeStrength >= 0.22 ? 0.66 : edgeStrength >= 0.12 ? 0.62 : 0.58;
  const sideALean = winningSide === questionSideA ? "up" : "down";
  const recentFormSummary = `${questionSideA} recent form ${homeForm.wins || 0}W-${homeForm.draws || 0}D-${homeForm.losses || 0}L versus ${questionSideB} ${awayForm.wins || 0}W-${awayForm.draws || 0}D-${awayForm.losses || 0}L.`;
  const tableSummary =
    hasTableEdge
      ? `${questionSideA} stands ${homeStanding.rank}${homeStanding.points !== null ? ` on ${homeStanding.points} pts` : ""}; ${questionSideB} stands ${awayStanding.rank}${awayStanding.points !== null ? ` on ${awayStanding.points} pts` : ""}.`
      : `${providerLabel} did not return a stable league table snapshot for this pairing.`;
  const consensusSummary =
    Number.isFinite(homeConsensus) && Number.isFinite(awayConsensus)
      ? `Optional market odds lean ${winningSide} at roughly ${Math.round(
          (winningSide === questionSideA ? homeConsensus : awayConsensus) * 100
        )}% implied win probability.`
      : "No stable 1X2 odds snapshot was available, so Crystal leans on provider-grounded recent form and table context.";
  const venueSummary = uniqueStrings([
    safeText(leagueName) ? `Competition: ${safeText(leagueName)}.` : "",
    safeText(venue) ? `Venue: ${safeText(venue)}.` : "",
    safeText(kickoffUtc) ? `Kickoff UTC: ${safeText(kickoffUtc)}.` : "",
  ]).join(" ");
  const invalidators = uniqueStrings([
    `If the structured provider signals swing toward ${losingSide}, this edge disappears.`,
    `If confirmed lineups materially weaken ${winningSide}, Crystal should stand down.`,
    "Late injury or availability news can break the current read.",
  ]).slice(0, 4);
  const counterSignals = uniqueStrings([
    edgeStrength < 0.1 ? "The provider edge is still narrow and vulnerable to match volatility." : "",
    hasTableEdge ? "League-table context can lag sudden team-level changes." : "Without a stable table snapshot, the edge leans more heavily on recent form.",
    Number.isFinite(homeConsensus) && Number.isFinite(awayConsensus)
      ? "The odds market still leaves room for draw volatility and late repricing."
      : "No live odds enhancer is active, so this read stays anchored to public provider data only.",
  ]).slice(0, 4);

  const signals = [
    {
      source_id: providerSourceId,
      label: `${winningSide} recent form edge`,
      summary: recentFormSummary,
      lean: sideALean,
      freshness_score: 0.82,
      trust_score: 0.77,
    },
  ];

  if (hasTableEdge) {
    signals.push({
      source_id: providerSourceId,
      label: `${safeText(leagueName, "League")} table snapshot`,
      summary: tableSummary,
      lean: sideALean,
      freshness_score: 0.78,
      trust_score: 0.75,
    });
  }

  if (Number.isFinite(homeConsensus) && Number.isFinite(awayConsensus)) {
    signals.push({
      source_id: "api_football_optional",
      label: `${safeText(leagueName, "Fixture")} odds snapshot`,
      summary: consensusSummary,
      lean: sideALean,
      freshness_score: 0.76,
      trust_score: 0.73,
    });
  }

  return {
    provider_required: true,
    provider_configured: true,
    fixture_resolved: true,
    parity_ready: true,
    provider_source_id: providerSourceId,
    provider_label: providerLabel,
    fixture_label: safeText(fixtureLabel),
    question_side_a: questionSideA,
    question_side_b: questionSideB,
    winning_side: winningSide,
    winning_probability: winningProbability,
    reason: `${providerLabel} grounding leans ${winningSide} over ${losingSide}.`,
    key_drivers: uniqueStrings([
      recentFormSummary,
      tableSummary,
      consensusSummary,
      venueSummary,
    ]).slice(0, 4),
    counter_signals: counterSignals,
    invalidators,
    signals,
  };
}

function formatFormSummary(label, summary) {
  if (!summary?.games) return `${label}: form unavailable.`;
  return `${label}: ${summary.wins}W ${summary.draws}D ${summary.losses}L in the last ${summary.games}, goals ${summary.goalsFor}:${summary.goalsAgainst}.`;
}

function formatStandingSummary(label, standing) {
  if (!standing) return `${label}: league-table snapshot unavailable.`;
  return `${label}: rank ${standing.rank}, ${standing.points} pts, GD ${standing.goalDifference >= 0 ? "+" : ""}${standing.goalDifference}.`;
}

function mergeSportsGroundedReadWithOverlay(groundedRead = {}, semanticOverlay = {}, marketOverlay = {}, overlayState = {}) {
  if (!groundedRead || typeof groundedRead !== "object") return groundedRead;
  const semanticEnabled = semanticOverlay && typeof semanticOverlay === "object" && semanticOverlay.enabled === true;
  const marketEnabled = marketOverlay && typeof marketOverlay === "object" && marketOverlay.enabled === true;
  if (!semanticEnabled && !marketEnabled) {
    return groundedRead;
  }

  const mergedSignals = []
    .concat(Array.isArray(groundedRead?.signals) ? groundedRead.signals : [])
    .concat(Array.isArray(semanticOverlay?.signals) ? semanticOverlay.signals : [])
    .concat(Array.isArray(marketOverlay?.signals) ? marketOverlay.signals : []);

  return {
    ...groundedRead,
    key_drivers: uniqueStrings(
      []
        .concat(Array.isArray(groundedRead?.key_drivers) ? groundedRead.key_drivers : [])
        .concat(Array.isArray(semanticOverlay?.key_drivers) ? semanticOverlay.key_drivers : [])
        .concat(Array.isArray(marketOverlay?.key_drivers) ? marketOverlay.key_drivers : [])
    ).slice(0, 4),
    counter_signals: uniqueStrings(
      []
        .concat(Array.isArray(groundedRead?.counter_signals) ? groundedRead.counter_signals : [])
        .concat(Array.isArray(semanticOverlay?.counter_signals) ? semanticOverlay.counter_signals : [])
        .concat(
          marketOverlay?.market_disagreement_score != null && marketOverlay.market_disagreement_score >= 0.28
            ? ["Prediction-market pricing is not fully aligned with the current Crystal lean."]
            : []
        )
    ).slice(0, 4),
    invalidators: uniqueStrings(
      []
        .concat(Array.isArray(groundedRead?.invalidators) ? groundedRead.invalidators : [])
        .concat(Array.isArray(semanticOverlay?.invalidators) ? semanticOverlay.invalidators : [])
        .concat(Array.isArray(marketOverlay?.invalidators) ? marketOverlay.invalidators : [])
    ).slice(0, 4),
    signals: mergedSignals.slice(0, 6),
    semantic_overlay: semanticEnabled ? semanticOverlay : null,
    market_overlay: marketEnabled ? marketOverlay : null,
    semantic_ready: overlayState?.semantic_ready === true || semanticOverlay.ready === true,
    overlay_confidence:
      Number.isFinite(Number(overlayState?.overlay_confidence))
        ? Number(overlayState.overlay_confidence)
        : Number.isFinite(Number(semanticOverlay.confidence))
          ? Number(semanticOverlay.confidence)
          : null,
    overlay_blocker_reason: safeText(overlayState?.overlay_blocker_reason, safeText(semanticOverlay.blocker_reason)),
    publish_gate_ready: overlayState?.publish_gate_ready === true || semanticOverlay.publish_gate_ready === true,
    market_consensus_strength:
      marketOverlay?.market_consensus_strength == null ? null : Number(marketOverlay.market_consensus_strength),
    market_disagreement_score:
      marketOverlay?.market_disagreement_score == null ? null : Number(marketOverlay.market_disagreement_score),
    price_move_pressure: marketOverlay?.price_move_pressure == null ? null : Number(marketOverlay.price_move_pressure),
    narrative_hype_score: marketOverlay?.narrative_hype_score == null ? null : Number(marketOverlay.narrative_hype_score),
    sportsbook_readiness_state: safeText(marketOverlay?.sportsbook_readiness_state),
  };
}

async function resolveFixtureContext(fetchJson, fixtureLabel, date) {
  const split = splitFixtureLabel(fixtureLabel);
  if (!split) {
    return {
      label: fixtureLabel,
      resolved: false,
      note: "The fixture label could not be split into home and away teams.",
    };
  }

  const config = getSportsConfig();
  const resolved = await findFixture(fetchJson, split.homeTeam, split.awayTeam, date);
  if (!resolved?.homeTeam?.team?.id || !resolved?.awayTeam?.team?.id) {
    return {
      label: fixtureLabel,
      resolved: false,
      note: "The sports provider could not map both teams confidently.",
    };
  }

  const fixture = resolved.fixture;
  const fixtureProvider = safeText(fixture?.provider, "thesportsdb_public");
  const providerSourceId = fixtureProvider === "api-football" ? "api_football_optional" : "thesportsdb_public";
  const providerLabel = fixtureProvider === "api-football" ? "API-Football" : "TheSportsDB";
  const leagueId =
    safeNumber(fixture?.league?.id) ||
    safeNumber(resolved.homeTeam?.team?.league_id) ||
    safeNumber(resolved.awayTeam?.team?.league_id) ||
    null;
  const fallbackLeagueId =
    safeNumber(resolved.homeTeam?.team?.league_id) ||
    safeNumber(resolved.awayTeam?.team?.league_id) ||
    leagueId;
  const season = safeText(fixture?.league?.season) || (date ? String(date).slice(0, 4) : null);
  let [homeRecent, awayRecent, odds, tableRows] = await Promise.all([
    fetchRecentFixtures(fetchJson, resolved.homeTeam.team.id, leagueId, season),
    fetchRecentFixtures(fetchJson, resolved.awayTeam.team.id, leagueId, season),
    fetchFixtureOdds(fetchJson, fixture?.fixture?.id),
    fetchLeagueTable(fetchJson, leagueId, season),
  ]);

  if ((!Array.isArray(tableRows) || tableRows.length === 0) && fallbackLeagueId && fallbackLeagueId !== leagueId) {
    tableRows = await fetchLeagueTable(fetchJson, fallbackLeagueId, season);
  }

  const homeForm = summarizeForm(homeRecent, resolved.homeTeam.team.id);
  const awayForm = summarizeForm(awayRecent, resolved.awayTeam.team.id);
  const homeStanding = summarizeStanding(tableRows, resolved.homeTeam.team.id);
  const awayStanding = summarizeStanding(tableRows, resolved.awayTeam.team.id);
  const leagueName = safeText(fixture?.league?.name, safeText(resolved.homeTeam?.team?.league_name, "Competition not resolved"));
  const kickoffUtc = safeText(fixture?.fixture?.date);
  const fixtureWindow = buildSportsFixtureWindow({ kickoffUtc, queryDate: date });
  const venue = safeText(fixture?.fixture?.venue?.name);
  const homeTeamLabel = safeText(resolved.homeTeam?.team?.name, split.homeTeam);
  const awayTeamLabel = safeText(resolved.awayTeam?.team?.name, split.awayTeam);
  const groundedRead = buildSportsGroundedRead({
    fixtureLabel,
    homeTeamLabel,
    awayTeamLabel,
    homeForm,
    awayForm,
    homeStanding,
    awayStanding,
    oddsMarket: odds?.market || null,
    leagueName,
    kickoffUtc,
    venue,
    providerSourceId,
    providerLabel,
  });
  const groundedReadWithWindow = {
    ...groundedRead,
    kickoff_utc: kickoffUtc || null,
    fixture_window_state: fixtureWindow.state,
    fixture_window_open: fixtureWindow.window_open,
    fixture_window_hours_to_kickoff: fixtureWindow.hours_to_kickoff,
  };
  const lines = [
    `Fixture: ${fixtureLabel}`,
    `Competition: ${leagueName}${venue ? ` at ${venue}` : ""}.`,
    kickoffUtc ? `Kickoff UTC: ${kickoffUtc}.` : "",
    formatSportsFixtureWindowSummary(fixtureWindow),
    fixtureWindow.window_open === false ? fixtureWindow.note : "",
    formatFormSummary("Home recent form", homeForm),
    formatFormSummary("Away recent form", awayForm),
    formatStandingSummary("Home table snapshot", homeStanding),
    formatStandingSummary("Away table snapshot", awayStanding),
    Array.isArray(odds?.summary) && odds.summary.length > 0 ? `Indicative 1X2 odds snapshot: ${odds.summary.join(" | ")}.` : "",
  ].filter(Boolean);

  const usedSourceIds = uniqueStrings([
    providerSourceId,
    Array.isArray(odds?.summary) && odds.summary.length > 0 ? "api_football_optional" : "",
  ]);

  return {
    label: fixtureLabel,
    resolved: true,
    lines,
    homeTeamLabel,
    awayTeamLabel,
    homeForm,
    awayForm,
    homeStanding,
    awayStanding,
    homeTeamId: resolved.homeTeam.team.id,
    awayTeamId: resolved.awayTeam.team.id,
    fixtureId: fixture?.fixture?.id || null,
    leagueName,
    kickoffUtc: kickoffUtc || null,
    queryDate: date || null,
    fixtureWindowState: fixtureWindow.state,
    fixtureWindowOpen: fixtureWindow.window_open,
    fixtureWindowHoursToKickoff: fixtureWindow.hours_to_kickoff,
    fixtureWindowNote: fixtureWindow.note,
    odds_snapshot: Array.isArray(odds?.summary) ? odds.summary : [],
    odds_market: odds?.market || null,
    grounded_read: groundedReadWithWindow,
    parity_ready: Boolean(groundedReadWithWindow?.parity_ready),
    used_source_ids: usedSourceIds,
  };
}

async function buildSportsForecastContext({ queryText, queryPlan, fetchJson, db, admin }) {
  const config = getSportsConfig();
  const domainId = resolveDomainId(
    safeText(queryPlan?.primary_domain_id || queryPlan?.domain_id || queryPlan?.domain),
    SPORTS_MATCH_OUTCOMES_DOMAIN
  );
  const date = extractFixtureDate(queryText, queryPlan);
  const entities = Array.isArray(queryPlan?.entities)
    ? queryPlan.entities.filter((entity) => entity?.entity_type === "fixture" || looksLikeFixtureLabel(entity?.label))
    : [];
  const fixtureCandidates = entities.length
    ? entities
    : looksLikeFixtureLabel(queryText)
      ? [
          {
            entity_type: "fixture",
            label: safeText(queryText),
          },
        ]
      : [];

  if (!config.configured) {
    return {
      provider: config.provider,
      provider_required: true,
      provider_configured: false,
      configured: false,
      available: false,
      source_id: config.primarySourceId,
      used_source_ids: [],
      parity_ready: false,
      contextText: "",
      notes: ["Sports provider not configured. Crystal should stay conservative and avoid invented match edges."],
      grounded_read: null,
      signals: [],
      fixtures: fixtureCandidates.map((entity) => ({
        label: safeText(entity?.label, safeText(entity?.entity_id)),
        resolved: false,
      })),
    };
  }

  const fixtures = [];
  for (const entity of fixtureCandidates) {
    const label = safeText(entity?.label, safeText(entity?.entity_id));
    if (!label) continue;
    try {
      fixtures.push(await resolveFixtureContext(fetchJson, label, date));
    } catch (_error) {
      fixtures.push({
        label,
        resolved: false,
        note: "The sports provider lookup failed for this fixture.",
      });
    }
  }

  const contextLines = fixtures.flatMap((fixture, index) => {
    const base = [`MATCH ${index + 1}`];
    if (fixture.resolved && Array.isArray(fixture.lines)) {
      return base.concat(fixture.lines);
    }
    return base.concat(`${fixture.label}: ${safeText(fixture.note, "No structured sports data available.")}`);
  });

  const primaryFixture = fixtures.find((fixture) => fixture?.grounded_read?.parity_ready) || fixtures[0] || null;
  const semanticOverlay =
    primaryFixture?.resolved && primaryFixture?.grounded_read
      ? await buildSportsSemanticOverlay({
          fetchJson,
          queryText,
          fixture: primaryFixture,
          groundedRead: primaryFixture.grounded_read,
          domainId,
        }).catch(() => null)
      : null;
  const marketOverlay =
    primaryFixture?.resolved && primaryFixture?.grounded_read
      ? await buildSportsMarketOverlay({
          db,
          admin,
          fetchJson,
          queryText,
          queryPlan,
          fixture: primaryFixture,
          groundedRead: primaryFixture.grounded_read,
          domainId,
        }).catch(() => null)
      : null;
  const resolvedSportsDomain = resolveDomainId(domainId, GENERAL_FORECAST_DOMAIN);
  const controlledA29Mode = getSportsSemanticOverlayMode() === "a29" && resolvedSportsDomain === SPORTS_MATCH_OUTCOMES_DOMAIN;
  const fixtureWindowOpen = semanticOverlay?.fixture_window_open !== false;
  const semanticSupportReady =
    fixtureWindowOpen &&
    (semanticOverlay?.ready === true ||
      (semanticOverlay?.enabled === true &&
        Number(semanticOverlay?.source_count || 0) >= 2 &&
        Number(semanticOverlay?.entity_alignment_score || 0) >= 0.72 &&
        Number(semanticOverlay?.contradiction_score || 1) <= 0.34 &&
        Number(semanticOverlay?.freshness_hours ?? 999) <= 36 &&
        ((Number(marketOverlay?.market_consensus_strength || 0) >= 0.54 && Number(marketOverlay?.market_disagreement_score || 0) <= 0.38) ||
          Number(marketOverlay?.narrative_hype_score || 0) >= 0.68)) ||
      (controlledA29Mode &&
        semanticOverlay?.enabled === true &&
        Number(semanticOverlay?.source_count || 0) >= 3 &&
        Number(semanticOverlay?.entity_alignment_score || 0) >= 0.44 &&
        Number(semanticOverlay?.contradiction_score || 1) <= 0.28 &&
        Number(semanticOverlay?.freshness_hours ?? 999) <= 24 &&
        Boolean(primaryFixture?.grounded_read?.parity_ready)));
  let overlayBlockerReason = safeText(semanticOverlay?.blocker_reason);
  if (semanticSupportReady) {
    overlayBlockerReason = "";
  } else if (!overlayBlockerReason && marketOverlay?.available !== true) {
    overlayBlockerReason = "sports_market_context_thin";
  } else if (!semanticSupportReady && Number(marketOverlay?.market_disagreement_score || 0) > 0.38) {
    overlayBlockerReason = "sports_market_context_conflicted";
  }
  const overlayConfidence = Number(
    clamp01(
      Math.max(Number(semanticOverlay?.confidence || 0), Number(marketOverlay?.confidence || 0)) +
        (semanticSupportReady && marketOverlay?.available ? 0.06 : 0),
      0.12
    ).toFixed(3)
  );
  const publishGateReady =
    semanticSupportReady &&
    controlledA29Mode;
  const primaryGroundedRead = mergeSportsGroundedReadWithOverlay(primaryFixture?.grounded_read || null, semanticOverlay || null, marketOverlay || null, {
    semantic_ready: semanticSupportReady,
    overlay_confidence: overlayConfidence,
    overlay_blocker_reason: overlayBlockerReason,
    publish_gate_ready: publishGateReady,
  });
  const parityReady = Boolean(primaryGroundedRead?.parity_ready);
  const semanticReady = Boolean(semanticSupportReady);
  const sportsbookReadinessState =
    resolvedSportsDomain === SPORTS_PROBABILITY_MODE_DOMAIN
      ? safeText(marketOverlay?.sportsbook_readiness_state, "benchmark_only")
      : publishGateReady
        ? "forecast_betting_aware"
        : safeText(marketOverlay?.sportsbook_readiness_state, semanticReady ? "forecast_context_only" : "forecast_only");
  const semanticContextLines =
    semanticOverlay?.enabled
      ? [
          "SPORTS SEMANTIC OVERLAY",
          `Mode: ${safeText(semanticOverlay.mode, "observe")}.`,
          `Source count: ${Number.isFinite(Number(semanticOverlay.source_count)) ? Number(semanticOverlay.source_count) : 0}.`,
          semanticOverlay.freshness_hours != null ? `Freshness hours: ${semanticOverlay.freshness_hours}.` : "",
          semanticOverlay.entity_alignment_score != null ? `Entity alignment: ${semanticOverlay.entity_alignment_score}.` : "",
          semanticOverlay.contradiction_score != null ? `Contradiction score: ${semanticOverlay.contradiction_score}.` : "",
          safeText(semanticOverlay.fixture_window_state) ? `Fixture window: ${safeText(semanticOverlay.fixture_window_state).replace(/_/g, " ")}.` : "",
          semanticOverlay.narrative_consensus ? `Narrative consensus: ${semanticOverlay.narrative_consensus}.` : "",
          ...(Array.isArray(semanticOverlay.notes) ? semanticOverlay.notes.slice(0, 3).map((note) => `- ${note}`) : []),
        ].filter(Boolean)
      : [];
  const marketContextLines =
    marketOverlay?.available
      ? [
          "SPORTS MARKET OVERLAY",
          marketOverlay.market_consensus_strength != null ? `Market consensus strength: ${marketOverlay.market_consensus_strength}.` : "",
          marketOverlay.market_disagreement_score != null ? `Market disagreement score: ${marketOverlay.market_disagreement_score}.` : "",
          marketOverlay.price_move_pressure != null ? `Price move pressure: ${marketOverlay.price_move_pressure}.` : "",
          marketOverlay.narrative_hype_score != null ? `Narrative hype score: ${marketOverlay.narrative_hype_score}.` : "",
          safeText(marketOverlay.sportsbook_readiness_state) ? `Sportsbook readiness: ${marketOverlay.sportsbook_readiness_state}.` : "",
          ...(Array.isArray(marketOverlay.notes) ? marketOverlay.notes.slice(0, 2).map((note) => `- ${note}`) : []),
        ].filter(Boolean)
      : [];

  return {
    provider: config.provider,
    provider_required: true,
    provider_configured: true,
    configured: true,
    available: fixtures.some((fixture) => fixture.resolved),
    source_id: config.primarySourceId,
    used_source_ids: uniqueStrings(
      fixtures
        .flatMap((fixture) => fixture?.used_source_ids || [])
        .concat(semanticOverlay?.enabled ? ["sports_semantic_overlay"] : [])
        .concat(Array.isArray(marketOverlay?.used_source_ids) ? marketOverlay.used_source_ids : [])
    ),
    parity_ready: parityReady,
    semantic_overlay: semanticOverlay || null,
    market_overlay: marketOverlay || null,
    semantic_ready: semanticReady,
    overlay_confidence: overlayConfidence,
    overlay_blocker_reason: overlayBlockerReason,
    publish_gate_ready: publishGateReady,
    market_consensus_strength:
      marketOverlay?.market_consensus_strength == null ? null : Number(marketOverlay.market_consensus_strength),
    market_disagreement_score:
      marketOverlay?.market_disagreement_score == null ? null : Number(marketOverlay.market_disagreement_score),
    price_move_pressure: marketOverlay?.price_move_pressure == null ? null : Number(marketOverlay.price_move_pressure),
    narrative_hype_score: marketOverlay?.narrative_hype_score == null ? null : Number(marketOverlay.narrative_hype_score),
    sportsbook_readiness_state: sportsbookReadinessState,
    fixtures,
    notes: uniqueStrings(
      fixtures
        .filter((fixture) => !fixture.resolved)
        .map((fixture) => `${fixture.label}: ${safeText(fixture.note)}`)
        .concat(Array.isArray(semanticOverlay?.notes) ? semanticOverlay.notes : [])
        .concat(Array.isArray(marketOverlay?.notes) ? marketOverlay.notes : [])
    ).slice(0, 6),
    contextText:
      contextLines.length > 0 || semanticContextLines.length > 0 || marketContextLines.length > 0
        ? ["SPORTS DATA", ...contextLines, ...semanticContextLines, ...marketContextLines].join("\n")
        : "",
    grounded_read: primaryGroundedRead,
    signals: Array.isArray(primaryGroundedRead?.signals) ? primaryGroundedRead.signals : [],
  };
}

module.exports = {
  GENERAL_FORECAST_DOMAIN,
  SPORTS_MATCH_OUTCOMES_DOMAIN,
  SPORTS_FIXTURE_CARD_TYPE,
  buildSportsForecastContext,
  buildSportsFixtureWindow,
  buildSportsGroundedRead,
  getSportsRuntimeHealth,
  getSportsConfig,
  getSportsProviderStates,
  getSportsSemanticOverlayMode,
  isSportsDomain: (domain) => resolveDomainId(safeText(domain), "") === SPORTS_MATCH_OUTCOMES_DOMAIN,
  looksLikeSportsMatchQuery,
};
