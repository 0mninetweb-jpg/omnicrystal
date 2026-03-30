const DEFAULT_SPORTS_PROVIDER = "thesportsdb";
const DEFAULT_THESPORTSDB_BASE_URL = "https://www.thesportsdb.com/api/v1/json";
const DEFAULT_API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const DEFAULT_THESPORTSDB_FREE_KEY = "123";

const {
  GENERAL_FORECAST_DOMAIN,
  SPORTS_MATCH_OUTCOMES_DOMAIN,
  resolveDomainId,
} = require("./catalogRegistry");
const SPORTS_FIXTURE_CARD_TYPE = "sports_fixture_board";

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

function splitFixtureLabel(label) {
  const normalized = normalizeWhitespace(label);
  if (!normalized) return null;

  const explicit = normalized.split(/\s+(?:vs?|contro)\s+/i);
  if (explicit.length === 2) {
    return {
      homeTeam: explicit[0].trim(),
      awayTeam: explicit[1].trim(),
    };
  }

  const dashed = normalized.split(/\s[-–]\s/);
  if (dashed.length === 2) {
    return {
      homeTeam: dashed[0].trim(),
      awayTeam: dashed[1].trim(),
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
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  return `${baseUrl}/${encodeURIComponent(config.theSportsDbApiKey)}/${endpoint}${params.toString() ? `?${params.toString()}` : ""}`;
}

function getSportsConfig() {
  const provider = normalizeProvider(process.env.SPORTS_PROVIDER);
  const apiFootballKey = readRuntimeCredential(process.env.API_FOOTBALL_KEY);
  const theSportsDbApiKey = readRuntimeCredential(process.env.THE_SPORTS_DB_API_KEY) || DEFAULT_THESPORTSDB_FREE_KEY;
  const defaultBaseUrl = provider === "api-football" ? DEFAULT_API_FOOTBALL_BASE_URL : DEFAULT_THESPORTSDB_BASE_URL;
  const baseUrl = safeText(process.env.SPORTS_PROVIDER_BASE_URL, defaultBaseUrl) || defaultBaseUrl;
  const configured = provider === "api-football" ? Boolean(apiFootballKey) : true;
  return {
    provider,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiFootballKey,
    theSportsDbApiKey,
    configured,
    primarySourceId: provider === "api-football" ? "api_football_optional" : "thesportsdb_public",
    primaryProviderLabel: provider === "api-football" ? "API-Football" : "TheSportsDB",
  };
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
      base_url: config.provider === "thesportsdb" ? config.baseUrl : DEFAULT_THESPORTSDB_BASE_URL,
      notes: config.provider === "thesportsdb" ? ["Using TheSportsDB free tier (key 123) as the primary sports runtime source."] : [],
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
      base_url: config.provider === "api-football" ? config.baseUrl : DEFAULT_API_FOOTBALL_BASE_URL,
      notes: config.apiFootballKey ? [] : ["API_FOOTBALL_KEY is optional now and only used as a sports enhancer when configured."],
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
    base_url: config.baseUrl,
    mode: config.provider === "thesportsdb" ? "free-tier-live" : config.configured ? "live" : "preview",
    coverage: config.provider === "thesportsdb" ? ["fixtures", "recent-form", "league-table"] : ["fixtures", "recent-form", "odds"],
    enhancers: getSportsProviderStates().filter((provider) => provider.source_id !== config.primarySourceId && provider.available).map((provider) => provider.source_id),
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

  const url = `${DEFAULT_API_FOOTBALL_BASE_URL}${path}${params.toString() ? `?${params.toString()}` : ""}`;
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
  const directEvent = await searchHeadToHeadEventTheSportsDb(fetchJson, homeTeam, awayTeam, date);
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
  let fixture = directEvent ? normalizeTheSportsDbEvent(directEvent) : null;

  if (!fixture) {
    const [homeNext, awayNext, homeLast, awayLast] = await Promise.all([
      fetchTeamScheduleTheSportsDb(fetchJson, homeId, "next"),
      fetchTeamScheduleTheSportsDb(fetchJson, awayId, "next"),
      fetchTeamScheduleTheSportsDb(fetchJson, homeId, "last"),
      fetchTeamScheduleTheSportsDb(fetchJson, awayId, "last"),
    ]);
    fixture =
      selectMutualFixture(homeNext, homeId, awayId, true) ||
      selectMutualFixture(awayNext, homeId, awayId, false) ||
      selectMutualFixture(homeLast, homeId, awayId, true) ||
      selectMutualFixture(awayLast, homeId, awayId, false);
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
  const config = getSportsConfig();
  if (config.provider === "api-football") {
    return searchTeamApiFootball(fetchJson, name);
  }
  return searchTeamTheSportsDb(fetchJson, name);
}

async function findFixture(fetchJson, homeTeam, awayTeam, date) {
  const config = getSportsConfig();
  if (config.provider === "api-football") {
    return findFixtureApiFootball(fetchJson, homeTeam, awayTeam, date);
  }
  return findFixtureTheSportsDb(fetchJson, homeTeam, awayTeam, date);
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
  if (config.provider === "api-football") {
    return fetchRecentFixturesApiFootball(fetchJson, teamId, leagueId, season);
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
  if (config.provider !== "api-football" || !config.apiFootballKey || !fixtureId) {
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
  if (config.provider === "api-football") {
    return [];
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
    providerSourceId: config.primarySourceId,
    providerLabel: config.primaryProviderLabel,
  });
  const lines = [
    `Fixture: ${fixtureLabel}`,
    `Competition: ${leagueName}${venue ? ` at ${venue}` : ""}.`,
    kickoffUtc ? `Kickoff UTC: ${kickoffUtc}.` : "",
    formatFormSummary("Home recent form", homeForm),
    formatFormSummary("Away recent form", awayForm),
    formatStandingSummary("Home table snapshot", homeStanding),
    formatStandingSummary("Away table snapshot", awayStanding),
    Array.isArray(odds?.summary) && odds.summary.length > 0 ? `Indicative 1X2 odds snapshot: ${odds.summary.join(" | ")}.` : "",
  ].filter(Boolean);

  const usedSourceIds = uniqueStrings([
    config.primarySourceId,
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
    odds_snapshot: Array.isArray(odds?.summary) ? odds.summary : [],
    odds_market: odds?.market || null,
    grounded_read: groundedRead,
    parity_ready: Boolean(groundedRead?.parity_ready),
    used_source_ids: usedSourceIds,
  };
}

async function buildSportsForecastContext({ queryText, queryPlan, fetchJson }) {
  const config = getSportsConfig();
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
  const primaryGroundedRead = primaryFixture?.grounded_read || null;
  const parityReady = Boolean(primaryGroundedRead?.parity_ready);

  return {
    provider: config.provider,
    provider_required: true,
    provider_configured: true,
    configured: true,
    available: fixtures.some((fixture) => fixture.resolved),
    source_id: config.primarySourceId,
    used_source_ids: uniqueStrings(fixtures.flatMap((fixture) => fixture?.used_source_ids || [])),
    parity_ready: parityReady,
    fixtures,
    notes: fixtures.filter((fixture) => !fixture.resolved).map((fixture) => `${fixture.label}: ${safeText(fixture.note)}`),
    contextText: contextLines.length > 0 ? `SPORTS DATA\n${contextLines.join("\n")}` : "",
    grounded_read: primaryGroundedRead,
    signals: Array.isArray(primaryGroundedRead?.signals) ? primaryGroundedRead.signals : [],
  };
}

module.exports = {
  GENERAL_FORECAST_DOMAIN,
  SPORTS_MATCH_OUTCOMES_DOMAIN,
  SPORTS_FIXTURE_CARD_TYPE,
  buildSportsForecastContext,
  buildSportsGroundedRead,
  getSportsRuntimeHealth,
  getSportsConfig,
  getSportsProviderStates,
  isSportsDomain: (domain) => resolveDomainId(safeText(domain), "") === SPORTS_MATCH_OUTCOMES_DOMAIN,
  looksLikeSportsMatchQuery,
};
