const DEFAULT_SPORTS_PROVIDER = "api-football";
const DEFAULT_SPORTS_BASE_URL = "https://v3.football.api-sports.io";

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

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num > 1) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function safeEncode(value) {
  return encodeURIComponent(safeText(value));
}

function normalizeWhitespace(value) {
  return safeText(value).replace(/\s+/g, " ").trim();
}

function normalizeTeamName(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(fc|cf|ac|as|ssc|us|afc|cfc|sv|fk|sk)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (/\b(vs?|contro)\b/.test(normalized) || /-\s*-/.test(normalized)) {
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

function getSportsConfig() {
  const apiKey = safeText(process.env.API_FOOTBALL_KEY);
  const provider = safeText(process.env.SPORTS_PROVIDER, DEFAULT_SPORTS_PROVIDER) || DEFAULT_SPORTS_PROVIDER;
  const baseUrl = safeText(process.env.SPORTS_PROVIDER_BASE_URL, DEFAULT_SPORTS_BASE_URL) || DEFAULT_SPORTS_BASE_URL;
  return {
    provider,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    configured: Boolean(apiKey),
  };
}

function getSportsRuntimeHealth() {
  const config = getSportsConfig();
  return {
    available: config.configured,
    configured: config.configured,
    provider: config.provider,
    mode: config.configured ? "live" : "preview",
    coverage: ["fixtures", "recent-form", "odds"],
  };
}

async function callSportsApi(fetchJson, path, query = {}) {
  const config = getSportsConfig();
  if (!config.configured) {
    return null;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  const url = `${config.baseUrl}${path}${params.toString() ? `?${params.toString()}` : ""}`;
  return fetchJson(url, {
    method: "GET",
    headers: {
      "x-apisports-key": config.apiKey,
    },
  });
}

async function searchTeam(fetchJson, name) {
  const term = normalizeWhitespace(name);
  if (!term) return null;
  const payload = await callSportsApi(fetchJson, "/teams", { search: term });
  const items = Array.isArray(payload?.response) ? payload.response : [];
  if (items.length === 0) return null;

  const exact = items.find((item) => normalizeTeamName(item?.team?.name) === normalizeTeamName(term));
  return exact || items[0];
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

async function findFixture(fetchJson, homeTeam, awayTeam, date) {
  const home = await searchTeam(fetchJson, homeTeam);
  const away = await searchTeam(fetchJson, awayTeam);
  if (!home?.team?.id || !away?.team?.id) {
    return null;
  }

  const payload = await callSportsApi(fetchJson, "/fixtures", {
    date,
    team: home.team.id,
    season: date ? Number(date.slice(0, 4)) : undefined,
  });
  const fixtures = Array.isArray(payload?.response) ? payload.response : [];
  const homeId = Number(home.team.id);
  const awayId = Number(away.team.id);
  const match = fixtures.find((fixture) => {
    const left = Number(fixture?.teams?.home?.id);
    const right = Number(fixture?.teams?.away?.id);
    return left === homeId && right === awayId;
  });

  return {
    fixture: match || null,
    homeTeam: home,
    awayTeam: away,
  };
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

async function fetchRecentFixtures(fetchJson, teamId, leagueId, season) {
  if (!teamId) return [];
  try {
    const payload = await callSportsApi(fetchJson, "/fixtures", {
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

function buildOddsSummary(payload) {
  const items = Array.isArray(payload?.response) ? payload.response : [];
  const first = items[0];
  const firstBookmaker = Array.isArray(first?.bookmakers) ? first.bookmakers[0] : null;
  const matchWinner = Array.isArray(firstBookmaker?.bets)
    ? firstBookmaker.bets.find((bet) => safeText(bet?.name).toLowerCase().includes("match winner")) || firstBookmaker.bets[0]
    : null;
  const values = Array.isArray(matchWinner?.values) ? matchWinner.values : [];
  return values
    .map((item) => `${safeText(item?.value)} ${safeText(item?.odd)}`.trim())
    .filter(Boolean)
    .slice(0, 3);
}

async function fetchFixtureOdds(fetchJson, fixtureId) {
  if (!fixtureId) return [];
  try {
    const payload = await callSportsApi(fetchJson, "/odds", { fixture: fixtureId });
    return buildOddsSummary(payload);
  } catch (_error) {
    return [];
  }
}

function formatFormSummary(label, summary) {
  if (!summary?.games) return `${label}: form unavailable.`;
  return `${label}: ${summary.wins}W ${summary.draws}D ${summary.losses}L in the last ${summary.games}, goals ${summary.goalsFor}:${summary.goalsAgainst}.`;
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

  const resolved = await findFixture(fetchJson, split.homeTeam, split.awayTeam, date);
  if (!resolved?.homeTeam?.team?.id || !resolved?.awayTeam?.team?.id) {
    return {
      label: fixtureLabel,
      resolved: false,
      note: "The sports provider could not map both teams confidently.",
    };
  }

  const fixture = resolved.fixture;
  const leagueId = fixture?.league?.id || null;
  const season = fixture?.league?.season || (date ? Number(date.slice(0, 4)) : null);
  const [homeRecent, awayRecent, odds] = await Promise.all([
    fetchRecentFixtures(fetchJson, resolved.homeTeam.team.id, leagueId, season),
    fetchRecentFixtures(fetchJson, resolved.awayTeam.team.id, leagueId, season),
    fetchFixtureOdds(fetchJson, fixture?.fixture?.id),
  ]);

  const homeForm = summarizeForm(homeRecent, resolved.homeTeam.team.id);
  const awayForm = summarizeForm(awayRecent, resolved.awayTeam.team.id);
  const leagueName = safeText(fixture?.league?.name, "Competition not resolved");
  const kickoffUtc = safeText(fixture?.fixture?.date);
  const venue = safeText(fixture?.fixture?.venue?.name);
  const lines = [
    `Fixture: ${fixtureLabel}`,
    `Competition: ${leagueName}${venue ? ` at ${venue}` : ""}.`,
    kickoffUtc ? `Kickoff UTC: ${kickoffUtc}.` : "",
    formatFormSummary("Home recent form", homeForm),
    formatFormSummary("Away recent form", awayForm),
    odds.length > 0 ? `Indicative 1X2 odds snapshot: ${odds.join(" | ")}.` : "",
  ].filter(Boolean);

  return {
    label: fixtureLabel,
    resolved: true,
    lines,
    homeTeamId: resolved.homeTeam.team.id,
    awayTeamId: resolved.awayTeam.team.id,
    fixtureId: fixture?.fixture?.id || null,
    leagueName,
    kickoffUtc: kickoffUtc || null,
  };
}

async function buildSportsForecastContext({ queryText, queryPlan, fetchJson }) {
  const config = getSportsConfig();
  const date = extractFixtureDate(queryText, queryPlan);
  const entities = Array.isArray(queryPlan?.entities)
    ? queryPlan.entities.filter((entity) => entity?.entity_type === "fixture" || looksLikeFixtureLabel(entity?.label))
    : [];

  if (!config.configured) {
    return {
      provider: config.provider,
      configured: false,
      available: false,
      contextText: "",
      notes: ["Sports provider not configured. Crystal should stay conservative and avoid invented match edges."],
      fixtures: entities.map((entity) => ({
        label: safeText(entity?.label, safeText(entity?.entity_id)),
        resolved: false,
      })),
    };
  }

  const fixtures = [];
  for (const entity of entities) {
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

  return {
    provider: config.provider,
    configured: true,
    available: fixtures.some((fixture) => fixture.resolved),
    fixtures,
    notes: fixtures.filter((fixture) => !fixture.resolved).map((fixture) => `${fixture.label}: ${safeText(fixture.note)}`),
    contextText: contextLines.length > 0 ? `SPORTS DATA\n${contextLines.join("\n")}` : "",
  };
}

module.exports = {
  GENERAL_FORECAST_DOMAIN,
  SPORTS_MATCH_OUTCOMES_DOMAIN,
  SPORTS_FIXTURE_CARD_TYPE,
  buildSportsForecastContext,
  getSportsRuntimeHealth,
  isSportsDomain: (domain) => resolveDomainId(safeText(domain), "") === SPORTS_MATCH_OUTCOMES_DOMAIN,
  looksLikeSportsMatchQuery,
};
