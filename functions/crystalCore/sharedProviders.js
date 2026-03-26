const AdmZip = require("adm-zip");
const gtfsRealtimeBindings = require("gtfs-realtime-bindings");
const Papa = require("papaparse");

const { clamp01, safeText } = require("../predictionCore");
const { getSportsRuntimeHealth } = require("../sportsData");

const DEFAULT_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const DEFAULT_OVERPASS_BASE_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_WORLDBANK_BASE_URL = "https://api.worldbank.org/v2";
const DEFAULT_EUROSTAT_BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const DEFAULT_OECD_BASE_URL = "https://stats.oecd.org/SDMX-JSON/data";
const DEFAULT_OPENSKY_BASE_URL = "https://opensky-network.org/api";
const DEFAULT_OPENAQ_BASE_URL = "https://api.openaq.org/v3";
const DEFAULT_EIA_BASE_URL = "https://api.eia.gov/v2";

const SHARED_IMPLEMENTED_SOURCE_IDS = [
  "open_meteo",
  "polymarket_public",
  "wikidata",
  "gdelt",
  "rss_allowlist",
  "google_trends",
  "yahoo_finance",
  "fred_api",
  "nominatim",
  "overpass",
  "gtfs_static",
  "gtfs_realtime",
  "opensky",
  "openaq",
  "world_bank_api",
  "eurostat_api",
  "oecd_api",
  "eia_api",
  "api_football_optional",
];

const COUNTRY_CODE_MAP = {
  italy: { iso2: "IT", iso3: "ITA", oecd: "ITA", eurostat: "IT", worldBank: "ITA" },
  italia: { iso2: "IT", iso3: "ITA", oecd: "ITA", eurostat: "IT", worldBank: "ITA" },
  france: { iso2: "FR", iso3: "FRA", oecd: "FRA", eurostat: "FR", worldBank: "FRA" },
  francia: { iso2: "FR", iso3: "FRA", oecd: "FRA", eurostat: "FR", worldBank: "FRA" },
  germany: { iso2: "DE", iso3: "DEU", oecd: "DEU", eurostat: "DE", worldBank: "DEU" },
  deutschland: { iso2: "DE", iso3: "DEU", oecd: "DEU", eurostat: "DE", worldBank: "DEU" },
  spain: { iso2: "ES", iso3: "ESP", oecd: "ESP", eurostat: "ES", worldBank: "ESP" },
  spagna: { iso2: "ES", iso3: "ESP", oecd: "ESP", eurostat: "ES", worldBank: "ESP" },
  "united states": { iso2: "US", iso3: "USA", oecd: "USA", eurostat: null, worldBank: "USA" },
  usa: { iso2: "US", iso3: "USA", oecd: "USA", eurostat: null, worldBank: "USA" },
  us: { iso2: "US", iso3: "USA", oecd: "USA", eurostat: null, worldBank: "USA" },
  japan: { iso2: "JP", iso3: "JPN", oecd: "JPN", eurostat: null, worldBank: "JPN" },
  giappone: { iso2: "JP", iso3: "JPN", oecd: "JPN", eurostat: null, worldBank: "JPN" },
  "european union": { iso2: null, iso3: null, oecd: null, eurostat: "EU27_2020", worldBank: null },
  eu: { iso2: null, iso3: null, oecd: null, eurostat: "EU27_2020", worldBank: null },
  "euro area": { iso2: null, iso3: null, oecd: null, eurostat: "EA20", worldBank: null },
};

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function normalizeText(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildQueryCorpus(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  return normalizeText(
    [
      queryText,
      normalizedQuery?.original_query,
      normalizedQuery?.primary_domain_id,
      normalizedQuery?.resolution_frame,
      normalizedQuery?.jurisdiction,
      normalizedQuery?.governing_entity,
      domainConfig?.domain_id,
      domainConfig?.summary,
      ...(Array.isArray(normalizedQuery?.entities) ? normalizedQuery.entities.map((entity) => safeText(entity?.label)) : []),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function getPrimaryLocation(normalizedQuery = {}) {
  return (
    safeText(normalizedQuery?.filters?.location) ||
    safeText(normalizedQuery?.jurisdiction) ||
    safeText(
      (Array.isArray(normalizedQuery?.entities) ? normalizedQuery.entities : []).find((entity) =>
        ["city", "country", "region", "zone", "location"].includes(safeText(entity?.entity_type))
      )?.label
    )
  );
}

function getPrimaryEntity(normalizedQuery = {}) {
  return safeText((Array.isArray(normalizedQuery?.entities) ? normalizedQuery.entities[0] : null)?.label);
}

function getCountryProfile(queryText = "", normalizedQuery = {}, fallback = "IT") {
  const corpus = buildQueryCorpus(queryText, normalizedQuery);
  for (const [token, profile] of Object.entries(COUNTRY_CODE_MAP)) {
    if (corpus.includes(token)) {
      return profile;
    }
  }
  if (safeText(fallback).toUpperCase() === "US") {
    return COUNTRY_CODE_MAP.usa;
  }
  return COUNTRY_CODE_MAP.italy;
}

function normalizeCountryCodes(profile = {}) {
  return {
    worldBank: safeText(profile?.worldBank),
    eurostat: safeText(profile?.eurostat),
    oecd: safeText(profile?.oecd),
  };
}

function parseJsonEnvArray(value = "") {
  const raw = safeText(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function readConfiguredCredential(value = "") {
  const normalized = safeText(value);
  if (!normalized) return "";
  if (/^-[A-Za-z][A-Za-z0-9-]*:?$/.test(normalized)) {
    return "";
  }
  return normalized;
}

function fetchJsonWithHeaders(url, headers = {}) {
  return fetch(url, {
    headers: {
      "user-agent": "CrystalCore/1.0",
      accept: "application/json,text/plain;q=0.8,*/*;q=0.2",
      ...headers,
    },
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.json();
  });
}

function fetchBuffer(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      "user-agent": "CrystalCore/1.0",
      ...(options.headers || {}),
    },
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  });
}

function buildPublicProviderStatus(sourceId, overrides = {}) {
  const categoryMap = {
    nominatim: "geography",
    overpass: "geography",
    opensky: "travel",
    world_bank_api: "macro",
    eurostat_api: "macro",
    oecd_api: "macro",
    open_meteo: "weather",
    google_trends: "attention",
    yahoo_finance: "markets",
    gdelt: "news_attention",
    rss_allowlist: "news_attention",
    wikidata: "entity_resolution",
    polymarket_public: "prediction_market",
  };
  return {
    source_id: sourceId,
    title: safeText(sourceId.replace(/_/g, " ")),
    category: safeText(categoryMap[sourceId], "runtime"),
    access_profile: "public",
    implementation_status: "implemented",
    configured: true,
    available: true,
    status: "available",
    ...overrides,
  };
}

function getProviderRuntimeStatus(sourceId) {
  if (sourceId === "api_football_optional") {
    const sportsHealth = getSportsRuntimeHealth();
    return {
      source_id: sourceId,
      title: "API-Football",
      category: "sports",
      access_profile: "optional_non_default",
      implementation_status: "implemented",
      configured: sportsHealth.configured === true,
      available: sportsHealth.available === true,
      status: sportsHealth.configured ? "available" : "config_missing",
      provider: safeText(sportsHealth.provider),
      base_url: safeText(sportsHealth.base_url),
      notes: sportsHealth.configured ? [] : ["API_FOOTBALL_KEY is not configured in this runtime."],
    };
  }

  if (sourceId === "fred_api") {
    const configured = Boolean(readConfiguredCredential(process.env.FRED_API_KEY));
    return {
      source_id: sourceId,
      title: "FRED API",
      category: "macro",
      access_profile: "public",
      implementation_status: "implemented",
      configured,
      available: configured,
      status: configured ? "available" : "config_missing",
      notes: configured ? [] : ["FRED_API_KEY is required to activate FRED in runtime."],
    };
  }

  if (sourceId === "openaq") {
    const configured = Boolean(readConfiguredCredential(process.env.OPENAQ_API_KEY));
    return {
      source_id: sourceId,
      title: "OpenAQ",
      category: "environment",
      access_profile: "public",
      implementation_status: "implemented",
      configured,
      available: configured,
      status: configured ? "available" : "config_missing",
      notes: configured ? [] : ["OPENAQ_API_KEY is required by the current OpenAQ v3 runtime path."],
    };
  }

  if (sourceId === "eia_api") {
    const configured = Boolean(readConfiguredCredential(process.env.EIA_API_KEY));
    return {
      source_id: sourceId,
      title: "EIA API",
      category: "energy",
      access_profile: "public",
      implementation_status: "implemented",
      configured,
      available: configured,
      status: configured ? "available" : "config_missing",
      notes: configured ? [] : ["EIA_API_KEY is required to activate EIA in runtime."],
    };
  }

  if (sourceId === "gtfs_static") {
    const feeds = parseJsonEnvArray(process.env.GTFS_STATIC_FEEDS_JSON);
    return {
      source_id: sourceId,
      title: "GTFS Static",
      category: "mobility",
      access_profile: "public",
      implementation_status: "implemented",
      configured: feeds.length > 0,
      available: feeds.length > 0,
      status: feeds.length > 0 ? "available" : "optional_source_missing",
      feed_count: feeds.length,
      notes: feeds.length > 0 ? [] : ["GTFS_STATIC_FEEDS_JSON is empty, so GTFS Static is implemented but not configured."],
    };
  }

  if (sourceId === "gtfs_realtime") {
    const feeds = parseJsonEnvArray(process.env.GTFS_REALTIME_FEEDS_JSON);
    return {
      source_id: sourceId,
      title: "GTFS Realtime",
      category: "mobility",
      access_profile: "public",
      implementation_status: "implemented",
      configured: feeds.length > 0,
      available: feeds.length > 0,
      status: feeds.length > 0 ? "available" : "optional_source_missing",
      feed_count: feeds.length,
      notes: feeds.length > 0 ? [] : ["GTFS_REALTIME_FEEDS_JSON is empty, so GTFS Realtime is implemented but not configured."],
    };
  }

  if (sourceId === "opensky") {
    return buildPublicProviderStatus(sourceId, {
      title: "OpenSky",
      auth_mode: safeText(process.env.OPENSKY_USERNAME) && safeText(process.env.OPENSKY_PASSWORD) ? "credentialed" : "anonymous_public",
      base_url: safeText(process.env.OPENSKY_BASE_URL, DEFAULT_OPENSKY_BASE_URL),
    });
  }

  if (sourceId === "nominatim") {
    return buildPublicProviderStatus(sourceId, {
      title: "Nominatim",
      base_url: safeText(process.env.NOMINATIM_BASE_URL, DEFAULT_NOMINATIM_BASE_URL),
    });
  }

  if (sourceId === "overpass") {
    return buildPublicProviderStatus(sourceId, {
      title: "Overpass API",
      base_url: safeText(process.env.OVERPASS_BASE_URL, DEFAULT_OVERPASS_BASE_URL),
    });
  }

  if (sourceId === "world_bank_api") {
    return buildPublicProviderStatus(sourceId, {
      title: "World Bank Indicators API",
      base_url: safeText(process.env.WORLD_BANK_BASE_URL, DEFAULT_WORLDBANK_BASE_URL),
    });
  }

  if (sourceId === "eurostat_api") {
    return buildPublicProviderStatus(sourceId, {
      title: "Eurostat API",
      base_url: safeText(process.env.EUROSTAT_BASE_URL, DEFAULT_EUROSTAT_BASE_URL),
    });
  }

  if (sourceId === "oecd_api") {
    return buildPublicProviderStatus(sourceId, {
      title: "OECD SDMX-JSON API",
      base_url: safeText(process.env.OECD_BASE_URL, DEFAULT_OECD_BASE_URL),
    });
  }

  return buildPublicProviderStatus(sourceId);
}

function getAllProviderRuntimeStatuses(sourceIds = SHARED_IMPLEMENTED_SOURCE_IDS) {
  return sourceIds.map((sourceId) => getProviderRuntimeStatus(sourceId));
}

function buildProviderStatesForUsage({ requiredSources = [], optionalSources = [], usedSources = [] }) {
  const requiredSet = new Set(uniqueStrings(requiredSources));
  const optionalSet = new Set(uniqueStrings(optionalSources));
  const usedSet = new Set(uniqueStrings(usedSources));
  const relevantIds = uniqueStrings([...requiredSet, ...optionalSet, ...usedSet]);

  return relevantIds.map((sourceId) => {
    const base = getProviderRuntimeStatus(sourceId);
    const requiredForQuery = requiredSet.has(sourceId);
    const optionalForQuery = optionalSet.has(sourceId);
    const usedInRun = usedSet.has(sourceId);
    let status = base.status;
    if (requiredForQuery && !usedInRun && !base.available) {
      status = "missing_required";
    } else if (requiredForQuery && !usedInRun) {
      status = "required_not_used";
    } else if (optionalForQuery && !usedInRun && !base.available) {
      status = "optional_source_missing";
    } else if (usedInRun) {
      status = "used";
    }
    return {
      ...base,
      required_for_query: requiredForQuery,
      optional_for_query: optionalForQuery,
      used_in_run: usedInRun,
      status,
    };
  });
}

function isGeoLikeQuery(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildQueryCorpus(queryText, normalizedQuery, domainConfig);
  return /city|housing|travel|mobility|tourism|rome|roma|milan|tokyo|neighborhood|zone|district|urban|visit|trip|airport/.test(corpus);
}

function isMobilityLikeQuery(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildQueryCorpus(queryText, normalizedQuery, domainConfig);
  return /mobility|traffic|congestion|commute|transit|metro|bus|tram|train|gtfs|airport|flight|travel|corridor|accessibility/.test(corpus);
}

function isTravelLikeQuery(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildQueryCorpus(queryText, normalizedQuery, domainConfig);
  return /travel|trip|visit|tourism|airport|flight|hotel|destination|crowding|delay/.test(corpus);
}

function isMacroPublicDataQuery(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildQueryCorpus(queryText, normalizedQuery, domainConfig);
  return /macro|inflation|jobs|labor|unemployment|cost of living|housing|demographics|migration|industry|economy|gdp|wages|affordability/.test(corpus);
}

function isEnergyLikeQuery(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildQueryCorpus(queryText, normalizedQuery, domainConfig);
  return /energy|oil|gas|electricity|utility|utilities|power|grid/.test(corpus);
}

function isEnvironmentLikeQuery(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildQueryCorpus(queryText, normalizedQuery, domainConfig);
  return /air quality|pollution|pm2|pm10|exposure|public health|heat|allergen|smog|environment/.test(corpus);
}

function buildRequiredSourcesForQuery({
  queryText = "",
  normalizedQuery = {},
  domainConfig = {},
  policyLike = false,
  marketLike = false,
  sportsLike = false,
  predictionMarketFrame = null,
}) {
  const requiredSources = [];
  const optionalSources = [];
  const geoLike = isGeoLikeQuery(queryText, normalizedQuery, domainConfig);
  const mobilityLike = isMobilityLikeQuery(queryText, normalizedQuery, domainConfig);
  const travelLike = isTravelLikeQuery(queryText, normalizedQuery, domainConfig);
  const macroLike = isMacroPublicDataQuery(queryText, normalizedQuery, domainConfig);
  const energyLike = isEnergyLikeQuery(queryText, normalizedQuery, domainConfig);
  const environmentLike = isEnvironmentLikeQuery(queryText, normalizedQuery, domainConfig);
  const corpus = buildQueryCorpus(queryText, normalizedQuery, domainConfig);

  if (policyLike) {
    requiredSources.push("wikidata", "gdelt", "rss_allowlist");
    if (normalizedQuery?.binary_frame?.asks_binary_question) {
      requiredSources.push("polymarket_public");
    }
  }

  if (marketLike) {
    requiredSources.push("yahoo_finance", "google_trends");
    if (predictionMarketFrame) {
      requiredSources.push("polymarket_public");
    }
    if (/rates|inflation|ecb|fed|macro|eurusd|fx|yield|liquidity/.test(corpus)) {
      if (readConfiguredCredential(process.env.FRED_API_KEY)) {
        requiredSources.push("fred_api");
      } else {
        optionalSources.push("fred_api");
      }
    }
  }

  if (geoLike) {
    requiredSources.push("nominatim", "overpass");
  }

  if (mobilityLike) {
    optionalSources.push("gtfs_static", "gtfs_realtime");
  }

  if (travelLike) {
    requiredSources.push("opensky");
    optionalSources.push("gtfs_static", "gtfs_realtime");
  }

  if (macroLike) {
    requiredSources.push("world_bank_api", "eurostat_api", "oecd_api");
    if (readConfiguredCredential(process.env.FRED_API_KEY)) {
      requiredSources.push("fred_api");
    } else {
      optionalSources.push("fred_api");
    }
  }

  if (energyLike) {
    if (safeText(process.env.EIA_API_KEY)) {
      requiredSources.push("eia_api");
    } else {
      optionalSources.push("eia_api");
    }
  }

  if (environmentLike) {
    if (readConfiguredCredential(process.env.OPENAQ_API_KEY)) {
      requiredSources.push("openaq");
    } else {
      optionalSources.push("openaq");
    }
  }

  if (sportsLike) {
    requiredSources.push("api_football_optional");
  }

  return {
    geo_like: geoLike,
    mobility_like: mobilityLike,
    travel_like: travelLike,
    macro_public_like: macroLike,
    energy_like: energyLike,
    environment_like: environmentLike,
    required_sources: uniqueStrings(requiredSources),
    optional_sources: uniqueStrings(optionalSources),
  };
}

function buildLocationFocus(queryText = "", normalizedQuery = {}) {
  return getPrimaryLocation(normalizedQuery) || getPrimaryEntity(normalizedQuery) || safeText(queryText).split(/\s+/).slice(0, 5).join(" ");
}

async function fetchNominatimLocationSignal(queryText = "", normalizedQuery = {}) {
  const locationFocus = buildLocationFocus(queryText, normalizedQuery);
  if (!locationFocus) return null;
  const baseUrl = safeText(process.env.NOMINATIM_BASE_URL, DEFAULT_NOMINATIM_BASE_URL);

  try {
    const payload = await fetchJsonWithHeaders(
      `${baseUrl.replace(/\/+$/, "")}/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(locationFocus)}`
    );
    const match = Array.isArray(payload) ? payload[0] : null;
    if (!match?.place_id) return null;
    return {
      signals: [
        {
          source_id: "nominatim",
          label: "Place resolution",
          summary: `${locationFocus} resolves to ${safeText(match.display_name, locationFocus)} (${safeText(match.type, "location")}) at ${safeText(match.lat)}, ${safeText(match.lon)}.`,
          lean: "flat",
          freshness_score: 0.56,
          trust_score: 0.82,
        },
      ],
      source_trust_map: [
        {
          source_id: "nominatim",
          trust_score: 0.82,
          note: `Resolved ${locationFocus} to a concrete OpenStreetMap place.`,
        },
      ],
      conflict_map: [],
      location_metrics: {
        place_id: Number(match.place_id),
        display_name: safeText(match.display_name),
        lat: Number(match.lat),
        lon: Number(match.lon),
        boundingbox: Array.isArray(match.boundingbox) ? match.boundingbox.map((item) => Number(item)) : [],
        class: safeText(match.class),
        type: safeText(match.type),
        importance: Number(match.importance || 0),
      },
    };
  } catch (_error) {
    return null;
  }
}

function buildBoundingBox(locationMetrics = {}) {
  const bbox = Array.isArray(locationMetrics?.boundingbox) ? locationMetrics.boundingbox.map((item) => Number(item)) : [];
  if (bbox.length === 4 && bbox.every((item) => Number.isFinite(item))) {
    return {
      south: bbox[0],
      north: bbox[1],
      west: bbox[2],
      east: bbox[3],
    };
  }
  const lat = Number(locationMetrics?.lat);
  const lon = Number(locationMetrics?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    south: lat - 0.08,
    north: lat + 0.08,
    west: lon - 0.08,
    east: lon + 0.08,
  };
}

function buildOverpassProfile(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildQueryCorpus(queryText, normalizedQuery, domainConfig);
  if (/mobility|traffic|commute|metro|bus|tram|train|airport|transit/.test(corpus)) {
    return {
      label: "Transit infrastructure",
      query: 'nwr["public_transport"](bbox);nwr["railway"~"station|halt|tram_stop"](bbox);nwr["amenity"~"bus_station|ferry_terminal"](bbox);',
    };
  }
  if (/hotel|tourism|visit|trip|travel|culture|event/.test(corpus)) {
    return {
      label: "Tourism and hospitality pressure",
      query: 'nwr["tourism"](bbox);nwr["amenity"~"restaurant|cafe|bar"](bbox);nwr["shop"](bbox);',
    };
  }
  if (/housing|rent|real estate|apartment|home|city|urban/.test(corpus)) {
    return {
      label: "Urban density proxies",
      query: 'nwr["amenity"~"restaurant|school|hospital|pharmacy"](bbox);nwr["shop"](bbox);',
    };
  }
  return {
    label: "Local points of interest",
    query: 'nwr["amenity"](bbox);nwr["tourism"](bbox);',
  };
}

async function fetchOverpassContextSignal(queryText = "", normalizedQuery = {}, domainConfig = {}, locationPack = null) {
  const locationMetrics = locationPack?.location_metrics || null;
  const bbox = buildBoundingBox(locationMetrics);
  if (!bbox) return null;
  const profile = buildOverpassProfile(queryText, normalizedQuery, domainConfig);
  const baseUrl = safeText(process.env.OVERPASS_BASE_URL, DEFAULT_OVERPASS_BASE_URL);
  const query = `[out:json][timeout:15];(${profile.query.replace(/bbox/g, `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`)});out count;`;
  try {
    const payload = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "user-agent": "CrystalCore/1.0",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: `data=${encodeURIComponent(query)}`,
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response.json();
    });
    const count = Number(payload?.elements?.[0]?.tags?.total || payload?.elements?.[0]?.tags?.nodes || 0);
    return {
      signals: [
        {
          source_id: "overpass",
          label: profile.label,
          summary: `${profile.label} around ${safeText(locationMetrics?.display_name, "the resolved place")} shows ${count} mapped OSM elements in the sampled area.`,
          lean: count >= 500 ? "up" : count <= 40 ? "down" : "flat",
          freshness_score: 0.58,
          trust_score: 0.72,
        },
      ],
      source_trust_map: [
        {
          source_id: "overpass",
          trust_score: 0.72,
          note: `${profile.label} built from OpenStreetMap/Overpass around the resolved location.`,
        },
      ],
      conflict_map: [],
      poi_metrics: {
        profile: profile.label,
        count,
        bbox,
      },
    };
  } catch (_error) {
    return null;
  }
}

function parseObservationArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && Number.isFinite(Number(item?.value)))
    .map((item) => ({
      date: safeText(item?.date),
      value: Number(item.value),
    }));
}

async function fetchWorldBankSignal(queryText = "", normalizedQuery = {}) {
  const country = normalizeCountryCodes(getCountryProfile(queryText, normalizedQuery));
  if (!country.worldBank) return null;
  const corpus = buildQueryCorpus(queryText, normalizedQuery);
  let indicator = "FP.CPI.TOTL.ZG";
  let label = "Inflation";
  if (/population|migration|demograph/.test(corpus)) {
    indicator = "SP.POP.GROW";
    label = "Population growth";
  } else if (/unemployment|jobs|labor/.test(corpus)) {
    indicator = "SL.UEM.TOTL.ZS";
    label = "Unemployment";
  } else if (/gdp|growth|economy|recession|industry/.test(corpus)) {
    indicator = "NY.GDP.MKTP.KD.ZG";
    label = "GDP growth";
  } else if (/air quality|pollution|pm2|pm10/.test(corpus)) {
    indicator = "EN.ATM.PM25.MC.M3";
    label = "PM2.5 exposure";
  }
  const baseUrl = safeText(process.env.WORLD_BANK_BASE_URL, DEFAULT_WORLDBANK_BASE_URL).replace(/\/+$/, "");
  try {
    const payload = await fetchJsonWithHeaders(
      `${baseUrl}/country/${encodeURIComponent(country.worldBank)}/indicator/${encodeURIComponent(indicator)}?format=json&per_page=6`
    );
    const series = Array.isArray(payload?.[1]) ? parseObservationArray(payload[1]) : [];
    if (series.length < 2) return null;
    const latest = series[0];
    const previous = series[1];
    const delta = latest.value - previous.value;
    const lean = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return {
      signals: [
        {
          source_id: "world_bank_api",
          label: `${label} public baseline`,
          summary: `${label} for ${country.worldBank} moved from ${previous.value.toFixed(2)} to ${latest.value.toFixed(2)} in the latest World Bank window.`,
          lean,
          freshness_score: 0.68,
          trust_score: 0.78,
        },
      ],
      source_trust_map: [
        {
          source_id: "world_bank_api",
          trust_score: 0.78,
          note: `${label} via World Bank Indicators API.`,
        },
      ],
      conflict_map: [],
      public_data_metrics: {
        source_id: "world_bank_api",
        label,
        country: country.worldBank,
        latest_value: Number(latest.value.toFixed(4)),
        previous_value: Number(previous.value.toFixed(4)),
        latest_date: latest.date,
      },
    };
  } catch (_error) {
    return null;
  }
}

function extractEurostatLatestValue(payload) {
  const rawValues = payload?.value && typeof payload.value === "object" ? Object.entries(payload.value) : [];
  const ordered = rawValues
    .map(([key, value]) => ({
      index: Number(key),
      value: Number(value),
    }))
    .filter((item) => Number.isFinite(item.index) && Number.isFinite(item.value))
    .sort((left, right) => left.index - right.index);
  if (!ordered.length) return null;
  const latest = ordered[ordered.length - 1];
  const previous = ordered.length >= 2 ? ordered[ordered.length - 2] : ordered[ordered.length - 1];
  return {
    latest: latest.value,
    previous: previous.value,
  };
}

async function fetchEurostatSignal(queryText = "", normalizedQuery = {}) {
  const country = normalizeCountryCodes(getCountryProfile(queryText, normalizedQuery));
  if (!country.eurostat) return null;
  const corpus = buildQueryCorpus(queryText, normalizedQuery);
  let dataset = "prc_hicp_manr";
  let label = "HICP inflation";
  let query = `geo=${encodeURIComponent(country.eurostat)}&coicop=CP00&unit=RCH_A`;
  if (/unemployment|jobs|labor/.test(corpus)) {
    dataset = "une_rt_m";
    label = "Unemployment rate";
    query = `geo=${encodeURIComponent(country.eurostat)}&s_adj=SA&sex=T&age=TOTAL&unit=PC_ACT`;
  }
  const baseUrl = safeText(process.env.EUROSTAT_BASE_URL, DEFAULT_EUROSTAT_BASE_URL).replace(/\/+$/, "");
  try {
    const payload = await fetchJsonWithHeaders(`${baseUrl}/${dataset}?${query}`);
    const values = extractEurostatLatestValue(payload);
    if (!values) return null;
    const delta = values.latest - values.previous;
    const lean = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return {
      signals: [
        {
          source_id: "eurostat_api",
          label: `${label} EU baseline`,
          summary: `${label} for ${country.eurostat} moved from ${values.previous.toFixed(2)} to ${values.latest.toFixed(2)} in the latest Eurostat window.`,
          lean,
          freshness_score: 0.72,
          trust_score: 0.8,
        },
      ],
      source_trust_map: [
        {
          source_id: "eurostat_api",
          trust_score: 0.8,
          note: `${label} via Eurostat.`,
        },
      ],
      conflict_map: [],
      public_data_metrics: {
        source_id: "eurostat_api",
        label,
        geography: country.eurostat,
        latest_value: Number(values.latest.toFixed(4)),
        previous_value: Number(values.previous.toFixed(4)),
      },
    };
  } catch (_error) {
    return null;
  }
}

function extractOecdLatestValue(series = {}) {
  const observations = series?.observations && typeof series.observations === "object" ? Object.entries(series.observations) : [];
  const ordered = observations
    .map(([key, value]) => ({
      index: Number(String(key).split(":")[0]),
      value: Number(Array.isArray(value) ? value[0] : value),
    }))
    .filter((item) => Number.isFinite(item.index) && Number.isFinite(item.value))
    .sort((left, right) => left.index - right.index);
  if (!ordered.length) return null;
  const latest = ordered[ordered.length - 1];
  const previous = ordered.length >= 2 ? ordered[ordered.length - 2] : ordered[ordered.length - 1];
  return {
    latest: latest.value,
    previous: previous.value,
  };
}

async function fetchOecdSignal(queryText = "", normalizedQuery = {}) {
  const country = normalizeCountryCodes(getCountryProfile(queryText, normalizedQuery));
  if (!country.oecd) return null;
  const corpus = buildQueryCorpus(queryText, normalizedQuery);
  let dataset = `${country.oecd}.LOLITOAA.STSA.M`;
  let label = "OECD leading indicator";
  if (/consumer|confidence|sentiment/.test(corpus)) {
    dataset = `${country.oecd}.CSCICP03.STSA.M`;
    label = "Consumer confidence";
  }
  const baseUrl = safeText(process.env.OECD_BASE_URL, DEFAULT_OECD_BASE_URL).replace(/\/+$/, "");
  try {
    const payload = await fetchJsonWithHeaders(`${baseUrl}/MEI_CLI/${dataset}/all?startTime=2024-01&endTime=2026-12`);
    const seriesContainer = payload?.data?.dataSets?.[0]?.series || {};
    const firstKey = Object.keys(seriesContainer)[0];
    if (!firstKey) return null;
    const values = extractOecdLatestValue(seriesContainer[firstKey]);
    if (!values) return null;
    const delta = values.latest - values.previous;
    const lean = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return {
      signals: [
        {
          source_id: "oecd_api",
          label: `${label} OECD baseline`,
          summary: `${label} for ${country.oecd} moved from ${values.previous.toFixed(2)} to ${values.latest.toFixed(2)} in the latest OECD window.`,
          lean,
          freshness_score: 0.7,
          trust_score: 0.78,
        },
      ],
      source_trust_map: [
        {
          source_id: "oecd_api",
          trust_score: 0.78,
          note: `${label} via OECD SDMX-JSON.`,
        },
      ],
      conflict_map: [],
      public_data_metrics: {
        source_id: "oecd_api",
        label,
        geography: country.oecd,
        latest_value: Number(values.latest.toFixed(4)),
        previous_value: Number(values.previous.toFixed(4)),
      },
    };
  } catch (_error) {
    return null;
  }
}

async function fetchOpenSkySignal(queryText = "", normalizedQuery = {}, locationPack = null) {
  const locationMetrics = locationPack?.location_metrics || null;
  const bbox = buildBoundingBox(locationMetrics);
  if (!bbox) return null;
  const baseUrl = safeText(process.env.OPENSKY_BASE_URL, DEFAULT_OPENSKY_BASE_URL).replace(/\/+$/, "");
  const authConfigured = safeText(process.env.OPENSKY_USERNAME) && safeText(process.env.OPENSKY_PASSWORD);
  const headers = authConfigured
    ? {
        Authorization: `Basic ${Buffer.from(`${process.env.OPENSKY_USERNAME}:${process.env.OPENSKY_PASSWORD}`).toString("base64")}`,
      }
    : {};
  try {
    const payload = await fetchJsonWithHeaders(
      `${baseUrl}/states/all?lamin=${bbox.south}&lomin=${bbox.west}&lamax=${bbox.north}&lomax=${bbox.east}`,
      headers
    );
    const aircraftCount = Array.isArray(payload?.states) ? payload.states.length : 0;
    return {
      signals: [
        {
          source_id: "opensky",
          label: "Flight pressure",
          summary: `${aircraftCount} aircraft are currently visible around ${safeText(locationMetrics?.display_name, "the resolved area")} in the OpenSky sample.`,
          lean: aircraftCount >= 40 ? "up" : aircraftCount <= 8 ? "down" : "flat",
          freshness_score: 0.9,
          trust_score: 0.76,
        },
      ],
      source_trust_map: [
        {
          source_id: "opensky",
          trust_score: 0.76,
          note: `Live air-traffic sample from OpenSky${authConfigured ? " (credentialed)" : " (anonymous public mode)"}.`,
        },
      ],
      conflict_map: [],
      mobility_metrics: {
        source_id: "opensky",
        aircraft_count: aircraftCount,
        bbox,
      },
    };
  } catch (_error) {
    return null;
  }
}

function parseGtfsFeeds(envName) {
  return parseJsonEnvArray(process.env[envName]).map((item) => ({
    label: safeText(item?.label),
    region_keywords: uniqueStrings(item?.region_keywords || []).map((keyword) => normalizeText(keyword)),
    url: safeText(item?.url || item?.feed_url),
  }));
}

function matchFeedConfig(feedConfigs = [], queryText = "", normalizedQuery = {}) {
  const corpus = buildQueryCorpus(queryText, normalizedQuery);
  return feedConfigs.find((feed) => feed.region_keywords.some((keyword) => keyword && corpus.includes(keyword))) || feedConfigs[0] || null;
}

function parseGtfsCsv(text = "") {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });
  return Array.isArray(parsed?.data) ? parsed.data : [];
}

async function fetchGtfsStaticSignal(queryText = "", normalizedQuery = {}) {
  const feeds = parseGtfsFeeds("GTFS_STATIC_FEEDS_JSON");
  const feed = matchFeedConfig(feeds, queryText, normalizedQuery);
  if (!feed?.url) return null;
  try {
    const buffer = await fetchBuffer(feed.url);
    const zip = new AdmZip(buffer);
    const routes = parseGtfsCsv(zip.getEntry("routes.txt")?.getData().toString("utf8") || "");
    const stops = parseGtfsCsv(zip.getEntry("stops.txt")?.getData().toString("utf8") || "");
    const calendar = parseGtfsCsv(zip.getEntry("calendar.txt")?.getData().toString("utf8") || "");
    return {
      signals: [
        {
          source_id: "gtfs_static",
          label: "Transit network baseline",
          summary: `${safeText(feed.label, "Configured feed")} exposes ${routes.length} routes, ${stops.length} stops, and ${calendar.length} active service rows in GTFS Static.`,
          lean: routes.length >= 100 ? "up" : routes.length <= 10 ? "down" : "flat",
          freshness_score: 0.68,
          trust_score: 0.74,
        },
      ],
      source_trust_map: [
        {
          source_id: "gtfs_static",
          trust_score: 0.74,
          note: `GTFS Static parsed from ${safeText(feed.label, "configured feed")}.`,
        },
      ],
      conflict_map: [],
      mobility_metrics: {
        source_id: "gtfs_static",
        feed_label: safeText(feed.label),
        routes: routes.length,
        stops: stops.length,
        service_rows: calendar.length,
      },
    };
  } catch (_error) {
    return null;
  }
}

async function fetchGtfsRealtimeSignal(queryText = "", normalizedQuery = {}) {
  const feeds = parseGtfsFeeds("GTFS_REALTIME_FEEDS_JSON");
  const feed = matchFeedConfig(feeds, queryText, normalizedQuery);
  if (!feed?.url) return null;
  try {
    const buffer = await fetchBuffer(feed.url);
    const decoded = gtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
    const entities = Array.isArray(decoded?.entity) ? decoded.entity : [];
    const tripUpdates = entities.filter((entity) => entity.tripUpdate).length;
    const vehiclePositions = entities.filter((entity) => entity.vehicle).length;
    const alerts = entities.filter((entity) => entity.alert).length;
    return {
      signals: [
        {
          source_id: "gtfs_realtime",
          label: "Transit live operations",
          summary: `${safeText(feed.label, "Configured feed")} currently exposes ${tripUpdates} trip updates, ${vehiclePositions} vehicle positions, and ${alerts} alerts in GTFS Realtime.`,
          lean: alerts >= 10 ? "down" : vehiclePositions >= 20 ? "up" : "flat",
          freshness_score: 0.9,
          trust_score: 0.78,
        },
      ],
      source_trust_map: [
        {
          source_id: "gtfs_realtime",
          trust_score: 0.78,
          note: `GTFS Realtime parsed from ${safeText(feed.label, "configured feed")}.`,
        },
      ],
      conflict_map: [],
      mobility_metrics: {
        source_id: "gtfs_realtime",
        feed_label: safeText(feed.label),
        trip_updates: tripUpdates,
        vehicle_positions: vehiclePositions,
        alerts,
      },
    };
  } catch (_error) {
    return null;
  }
}

async function fetchOpenAqSignal(queryText = "", normalizedQuery = {}) {
  const apiKey = readConfiguredCredential(process.env.OPENAQ_API_KEY);
  if (!apiKey) return null;
  const country = getCountryProfile(queryText, normalizedQuery).iso2 || "IT";
  const baseUrl = safeText(process.env.OPENAQ_BASE_URL, DEFAULT_OPENAQ_BASE_URL).replace(/\/+$/, "");
  try {
    const payload = await fetchJsonWithHeaders(`${baseUrl}/locations?limit=3&countries=${encodeURIComponent(country)}`, {
      "X-API-Key": apiKey,
    });
    const locations = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.data) ? payload.data : [];
    if (!locations.length) return null;
    return {
      signals: [
        {
          source_id: "openaq",
          label: "Air quality station availability",
          summary: `OpenAQ returned ${locations.length} live locations for ${country}, giving Crystal a public environmental exposure baseline.`,
          lean: locations.length >= 3 ? "up" : "flat",
          freshness_score: 0.78,
          trust_score: 0.72,
        },
      ],
      source_trust_map: [
        {
          source_id: "openaq",
          trust_score: 0.72,
          note: `OpenAQ v3 runtime path for ${country}.`,
        },
      ],
      conflict_map: [],
      environment_metrics: {
        source_id: "openaq",
        country,
        location_count: locations.length,
      },
    };
  } catch (_error) {
    return null;
  }
}

async function fetchEiaSignal(queryText = "", normalizedQuery = {}) {
  const apiKey = safeText(process.env.EIA_API_KEY);
  if (!apiKey) return null;
  const corpus = buildQueryCorpus(queryText, normalizedQuery);
  let facets = "facets[msn][]=TEACEUS";
  let label = "US total energy consumption";
  if (/oil|crude/.test(corpus)) {
    facets = "facets[process][]=PRS";
    label = "US oil product proxy";
  } else if (/gas/.test(corpus)) {
    facets = "facets[process][]=NG";
    label = "US natural gas proxy";
  }
  const baseUrl = safeText(process.env.EIA_BASE_URL, DEFAULT_EIA_BASE_URL).replace(/\/+$/, "");
  try {
    const payload = await fetchJsonWithHeaders(
      `${baseUrl}/total-energy/data/?api_key=${encodeURIComponent(apiKey)}&frequency=monthly&data[0]=value&${facets}&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=2`
    );
    const rows = Array.isArray(payload?.response?.data) ? payload.response.data : [];
    if (rows.length < 2) return null;
    const latest = Number(rows[0]?.value);
    const previous = Number(rows[1]?.value);
    if (!Number.isFinite(latest) || !Number.isFinite(previous)) return null;
    const delta = latest - previous;
    const lean = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return {
      signals: [
        {
          source_id: "eia_api",
          label: `${label} energy pulse`,
          summary: `${label} moved from ${previous.toFixed(2)} to ${latest.toFixed(2)} in the latest EIA window.`,
          lean,
          freshness_score: 0.74,
          trust_score: 0.8,
        },
      ],
      source_trust_map: [
        {
          source_id: "eia_api",
          trust_score: 0.8,
          note: `${label} via EIA v2.`,
        },
      ],
      conflict_map: [],
      public_data_metrics: {
        source_id: "eia_api",
        label,
        latest_value: Number(latest.toFixed(4)),
        previous_value: Number(previous.toFixed(4)),
      },
    };
  } catch (_error) {
    return null;
  }
}

function buildLocationStructure({ locationPack = null, overpassPack = null }) {
  const location = locationPack?.location_metrics || null;
  if (!location) return null;
  return {
    resolved_place: {
      display_name: safeText(location.display_name),
      lat: Number.isFinite(Number(location.lat)) ? Number(location.lat) : null,
      lon: Number.isFinite(Number(location.lon)) ? Number(location.lon) : null,
      type: safeText(location.type),
    },
    poi_context: overpassPack?.poi_metrics || null,
  };
}

function buildMobilityStructure({ openSkyPack = null, gtfsStaticPack = null, gtfsRealtimePack = null }) {
  const summary = uniqueStrings(
    []
      .concat(openSkyPack?.mobility_metrics ? [`Flights in sample: ${Number(openSkyPack.mobility_metrics.aircraft_count || 0)}`] : [])
      .concat(gtfsStaticPack?.mobility_metrics ? [`Transit routes: ${Number(gtfsStaticPack.mobility_metrics.routes || 0)}`] : [])
      .concat(gtfsRealtimePack?.mobility_metrics ? [`Live vehicles: ${Number(gtfsRealtimePack.mobility_metrics.vehicle_positions || 0)}`] : [])
  );
  if (!summary.length) return null;
  return {
    summary,
    flight_context: openSkyPack?.mobility_metrics || null,
    gtfs_static: gtfsStaticPack?.mobility_metrics || null,
    gtfs_realtime: gtfsRealtimePack?.mobility_metrics || null,
  };
}

function buildPublicDataStructure({ worldBankPack = null, eurostatPack = null, oecdPack = null, fredPack = null, eiaPack = null, openAqPack = null }) {
  const packs = [worldBankPack, eurostatPack, oecdPack, fredPack, eiaPack, openAqPack].filter(Boolean);
  if (!packs.length) return null;
  return {
    signals: packs
      .map((pack) => pack?.public_data_metrics || pack?.macro_metrics || pack?.environment_metrics || null)
      .filter(Boolean),
  };
}

module.exports = {
  SHARED_IMPLEMENTED_SOURCE_IDS,
  getProviderRuntimeStatus,
  getAllProviderRuntimeStatuses,
  buildProviderStatesForUsage,
  buildRequiredSourcesForQuery,
  isGeoLikeQuery,
  isMobilityLikeQuery,
  isTravelLikeQuery,
  isMacroPublicDataQuery,
  isEnergyLikeQuery,
  isEnvironmentLikeQuery,
  fetchNominatimLocationSignal,
  fetchOverpassContextSignal,
  fetchWorldBankSignal,
  fetchEurostatSignal,
  fetchOecdSignal,
  fetchOpenSkySignal,
  fetchGtfsStaticSignal,
  fetchGtfsRealtimeSignal,
  fetchOpenAqSignal,
  fetchEiaSignal,
  buildLocationStructure,
  buildMobilityStructure,
  buildPublicDataStructure,
};
