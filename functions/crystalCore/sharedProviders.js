const AdmZip = require("adm-zip");
const gtfsRealtimeBindings = require("gtfs-realtime-bindings");
const Papa = require("papaparse");

const { clamp01, safeText } = require("../predictionCore");
const { getSportsProviderStates } = require("../sportsData");

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
  "timegpt",
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
  "acled",
  "private_listing_feed",
  "thesportsdb_public",
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

function buildIntentCorpus(queryText = "", normalizedQuery = {}) {
  return normalizeText(
    [
      queryText,
      normalizedQuery?.original_query,
      normalizedQuery?.resolution_frame,
      normalizedQuery?.jurisdiction,
      normalizedQuery?.governing_entity,
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
    timegpt: "forecasting",
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
  if (sourceId === "thesportsdb_public") {
    return (
      getSportsProviderStates().find((provider) => provider.source_id === "thesportsdb_public") || {
        source_id: sourceId,
        title: "TheSportsDB",
        category: "sports",
        access_profile: "public",
        implementation_status: "implemented",
        configured: true,
        available: true,
        status: "available",
      }
    );
  }

  if (sourceId === "api_football_optional") {
    return (
      getSportsProviderStates().find((provider) => provider.source_id === "api_football_optional") || {
        source_id: sourceId,
        title: "API-Football",
        category: "sports",
        access_profile: "optional_non_default",
        implementation_status: "implemented",
        configured: false,
        available: false,
        status: "config_missing",
        notes: ["API_FOOTBALL_KEY is optional now and only used as a sports enhancer when configured."],
      }
    );
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

  if (sourceId === "timegpt") {
    const configured = Boolean(readConfiguredCredential(process.env.NIXTLA_API_KEY));
    return {
      source_id: sourceId,
      title: "TimeGPT",
      category: "forecasting",
      access_profile: "optional_private",
      implementation_status: "implemented",
      configured,
      available: configured,
      status: configured ? "available" : "optional_source_missing",
      notes: configured ? [] : ["NIXTLA_API_KEY is optional; without it Crystal records timegpt_unavailable and continues."],
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

  if (sourceId === "acled") {
    const configured = Boolean(readConfiguredCredential(process.env.ACLED_API_KEY));
    return {
      source_id: sourceId,
      title: "ACLED",
      category: "geopolitics",
      access_profile: "targeted_optional",
      implementation_status: "scaffolded",
      configured,
      available: configured,
      status: configured ? "available" : "optional_source_missing",
      notes: configured ? [] : ["ACLED_API_KEY is optional in Batch 3 and only used for geopolitics depth when configured."],
    };
  }

  if (sourceId === "private_listing_feed") {
    const configured = Boolean(
      readConfiguredCredential(process.env.PRIVATE_LISTING_FEED_TOKEN) || safeText(process.env.PRIVATE_LISTING_FEED_URL)
    );
    return {
      source_id: sourceId,
      title: "Private Listing Feed",
      category: "housing",
      access_profile: "private_optional",
      implementation_status: "scaffolded",
      configured,
      available: configured,
      status: configured ? "available" : "optional_source_missing",
      notes: configured
        ? []
        : ["PRIVATE_LISTING_FEED_TOKEN or PRIVATE_LISTING_FEED_URL can be added later for housing and personal-finance depth."],
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
  const corpus = buildIntentCorpus(queryText, normalizedQuery);
  const hasLocationToken = /\b(rome|roma|milan|tokyo|lisbon|italy|italia|france|germany|spain|europe|eu)\b/.test(corpus);
  const hasGeoIntent = /\b(city|housing|rent|rents|rental|real estate|property|travel|mobility|tourism|transit|accessibility|commute|neighborhood|zone|district|urban|visit|trip|airport|stadium|safety|incident|culture|event|crowding|venue|infrastructure|logistics|corridor|network|connectivity|public health|hydrology|watershed|river basin|basin|station area|flood plain|shoreline)\b|air quality|pollution|exposure|event pressure|san siro/.test(
    corpus
  );
  return hasGeoIntent || (hasLocationToken && (/\b(travel|mobility|tourism|transit|accessibility|commute|housing|rent|rental|real estate|urban|stadium|safety|incident|culture|event|crowding|venue|infrastructure|logistics|corridor|network|connectivity|public health|hydrology|watershed|river basin|basin|station area)\b/.test(corpus) || /air quality|pollution|exposure|event pressure|san siro/.test(corpus)));
}

function isMobilityLikeQuery(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildIntentCorpus(queryText, normalizedQuery);
  return /\b(mobility|traffic|congestion|commute|transit|metro|bus|tram|train|gtfs|airport|flight|travel|corridor|accessibility|infrastructure|logistics|reliability|network)\b|san siro/.test(corpus);
}

function isTravelLikeQuery(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildIntentCorpus(queryText, normalizedQuery);
  return /\b(travel|trip|visit|tourism|airport|flight|hotel|destination|crowding|delay|window)\b|best time/.test(corpus);
}

function isMacroPublicDataQuery(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildIntentCorpus(queryText, normalizedQuery);
  return /\b(macro|inflation|job|jobs|offer|career|labor|labour|unemployment|demographics|migration|industry|economy|gdp|wages|salary|salaries|affordability|trade|supply|manufacturing|productivity|rates|yield|liquidity|cpi|ppi|rent|rents|housing|mortgage|sector|shipping|bottleneck|bottlenecks)\b|cost of living|household price pressure|business cycle|food security|grocery basket|food prices|staple price|staple prices|central bank|supply chain/.test(
    corpus
  );
}

function isEnergyLikeQuery(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildIntentCorpus(queryText, normalizedQuery);
  return /\b(energy|oil|gas|electricity|utility|utilities|power|grid|tariff|outage)\b|utility bill|utility price|power price/.test(corpus);
}

function isEnvironmentLikeQuery(queryText = "", normalizedQuery = {}, domainConfig = {}) {
  const corpus = buildIntentCorpus(queryText, normalizedQuery);
  return /\b(pm2|pm10|exposure|heat|allergen|smog|environment)\b|air quality|pollution|public health/.test(corpus);
}

function isWeatherBackboneDomain(domainId = "") {
  return [
    "A.1.weather_and_atmosphere",
    "A.2.climate_hazards_and_disaster_risk",
    "A.3.water_and_hydrology_signals",
    "A.6.agriculture_and_seasonal_production",
  ].includes(safeText(domainId));
}

function isAttentionStackDomain(domainId = "") {
  return [
    "A.0.general.general_forecast",
    "A.16.consumer_sentiment_and_attention_economics",
    "A.17.technology_adoption_and_digital_pulse",
    "A.18.education_system_and_skills_pipeline",
    "B.3.1.love_and_social_outcomes",
    "B.3.2.study_and_exams_outcomes",
    "C.1.attention_waves",
    "C.3.hype_curve_tracker",
    "C.4.global_quote_stream",
  ].includes(safeText(domainId));
}

function isDerivedDecisionDomain(domainId = "") {
  return [
    "B.3.3.work_and_career_outcomes",
    "B.3.4.personal_finance_outcomes",
    "B.3.5.business_idea_outcomes",
    "B.3.7.travel_personal_outcomes",
    "B.3.8.personal_decisions_and_tradeoffs",
  ].includes(safeText(domainId));
}

function getMacroPrimaryPublicBackbone(corpus = "", domainId = "") {
  const normalizedDomainId = safeText(domainId);
  if (/demographic|migration|population|development|global|world|cross-country|emerging/.test(corpus) || normalizedDomainId === "A.19.demographics_and_migration_pressure") {
    return "world_bank_api";
  }
  if (/jobs|labor|labour|unemployment|salary|wage|industry|manufacturing|business cycle|productivity/.test(corpus) && !/\bitaly|italia|europe|eu|euro area|eurozone|france|germany|spain\b/.test(corpus)) {
    return "oecd_api";
  }
  if (
    /\b(italy|italia|rome|roma|milan|europe|eu|euro area|eurozone|france|germany|spain|ecb)\b/.test(corpus) ||
    [
      "A.11.cost_of_living_and_price_pressure",
      "A.12.housing_and_real_estate_signals",
      "A.14.macro_economy_and_cycles",
      "A.15.jobs_and_labor_market_signals",
      "A.21.trade_supply_and_disruption_signals",
      "A.22.industry_and_business_cycles",
    ].includes(normalizedDomainId)
  ) {
    return "eurostat_api";
  }
  if (/jobs|labor|labour|unemployment|salary|wage|industry|manufacturing|business cycle|productivity/.test(corpus)) {
    return "oecd_api";
  }
  return "world_bank_api";
}

function isLiveProviderAvailable(sourceId = "") {
  return getProviderRuntimeStatus(sourceId).available === true;
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
  const corpus = buildIntentCorpus(queryText, normalizedQuery);
  const domainId = safeText(domainConfig?.domain_id);
  const primaryLocation = getPrimaryLocation(normalizedQuery);
  const weatherBackboneDomain = isWeatherBackboneDomain(domainId);
  const attentionStackDomain = isAttentionStackDomain(domainId);
  const derivedDecisionDomain = isDerivedDecisionDomain(domainId);
  const macroPrimaryBackbone = getMacroPrimaryPublicBackbone(corpus, domainId);
  const foodLike = domainId === "A.5.food_security_and_staple_prices" || /\b(food security|staple price|staple prices|grocery basket|food prices|affordability shock|households)\b/.test(corpus);
  const housingLike = domainId === "A.12.housing_and_real_estate_signals" || /\b(rent|rents|rental|housing|real estate|property|mortgage|apartment)\b/.test(corpus);
  const infrastructureLike = domainId === "A.20.infrastructure_and_logistics_reliability" || /\b(infrastructure|logistics|corridor|freight|network outage|connectivity reliability|connectivity|network quality)\b/.test(corpus);
  const geopoliticalConflictLike = domainId === "A.25.geopolitics_and_conflict_dynamics" || /\b(conflict|war|ceasefire|sanction|military|ukraine|russia|taiwan|geopolitic|escalat)\b/.test(corpus);
  const analogLike = domainId === "A.26.human_history_and_long_run_analogs" || /\b(historical analog|historical analogue|analog for|analogue for|long-run analog|long run analog|recurrence|regime similarity)\b/.test(corpus);
  const publicHealthLike = domainId === "A.28.public_health_and_environmental_exposure" || /\b(public health|illness|hospital|virus|flu|winter risk|exposure burden)\b/.test(corpus);
  const governanceTimelineLike =
    domainId === "A.24.governance_policy_and_public_timeline" ||
    /\b(election volatility|budget vote|coalition|referendum|policy timeline|government survive|public timeline|governance)\b/.test(corpus);
  const weatherAtmosphereLike =
    domainId === "A.1.weather_and_atmosphere" ||
    /\b(rain|rainy|storm|temperature|forecast|weekend weather|wind|humidity|heatwave|cold snap)\b/.test(corpus);
  const climateHazardLike =
    domainId === "A.2.climate_hazards_and_disaster_risk" ||
    /\b(flood|wildfire|drought|hazard window|disaster risk|heatwave risk|storm surge|landslide)\b/.test(corpus);
  const waterHydrologyLike =
    domainId === "A.3.water_and_hydrology_signals" ||
    /\b(water stress|hydrology|watershed|reservoir|river basin|po basin|aquifer|runoff)\b/.test(corpus);
  const environmentExposureLike =
    domainId === "A.4.environment_and_exposure" ||
    /\b(air quality exposure|pollution exposure|heat island|environmental exposure|smog)\b/.test(corpus);
  const demographicMigrationLike =
    domainId === "A.19.demographics_and_migration_pressure" ||
    /\b(demographic|migration|population|aging|fertility|urbanization|age dependency|demographic pressure)\b/.test(corpus);
  const safetyIncidentLike =
    domainId === "A.27.safety_and_incident_risk" ||
    /\b(safety risk|incident risk|station area|crime risk|crowd safety|incident pressure)\b/.test(corpus);
  const connectivityReliabilityLike =
    domainId === "A.10.connectivity_and_network_quality_signals" ||
    /\b(connectivity reliability|network outage|network quality|signal outage|coverage reliability)\b/.test(corpus);
  const workCareerLike = domainId === "B.3.3.work_and_career_outcomes" || /\b(job offer|new job|career move|salary trajectory|accept this offer|changing company|change my job)\b/.test(corpus);
  const personalFinanceLike = domainId === "B.3.4.personal_finance_outcomes" || /\b(bitcoin|crypto|savings|mortgage|buy now|lock a mortgage|personal finance)\b/.test(corpus);
  const businessIdeaLike = domainId === "B.3.5.business_idea_outcomes" || /\b(startup|start-up|runway|open a cafe|open a business|business idea|survive the next)\b/.test(corpus);
  const personalTradeoffLike = domainId === "B.3.8.personal_decisions_and_tradeoffs" || /\b(should i move|move to|tradeoff|buy now or wait|rent now or wait|wait before)\b/.test(corpus);
  const mobilityAccessibilityLike = domainId === "A.8.mobility_congestion_and_accessibility" || /\b(transit accessibility|accessibility pressure|mobility congestion|commute reliability)\b/.test(corpus);
  const eventPressureLike = domainId === "C.2.event_pressure_forecast" || /\b(event pressure|concert crowding|stadium pressure|weekend event|queue|sold out|venue pressure|san siro)\b/.test(corpus);
  const cultureEventLike = domainId === "A.30.culture_events_and_attention" || /\b(cultural buzz|culture buzz|festival buzz|concert buzz|event attention)\b/.test(corpus);
  const householdPriceLike = domainId === "A.11.cost_of_living_and_price_pressure" || /\b(household price pressure|household bills|household affordability|cost of living)\b/.test(corpus);
  const supplyTradeLike = domainId === "A.21.trade_supply_and_disruption_signals" || /\b(shipping|bottleneck|bottlenecks|supply chain|port congestion|freight)\b/.test(corpus);
  const industryCycleLike = domainId === "A.22.industry_and_business_cycles" || /\b(business cycle|sector pressure|tech sector|industry demand)\b/.test(corpus);
  const gtfsStaticLive = isLiveProviderAvailable("gtfs_static");
  const gtfsRealtimeLive = isLiveProviderAvailable("gtfs_realtime");
  const openskyLive = isLiveProviderAvailable("opensky");
  const fredLive = isLiveProviderAvailable("fred_api");
  const eiaLive = isLiveProviderAvailable("eia_api");
  const openaqLive = isLiveProviderAvailable("openaq");
  const acledLive = isLiveProviderAvailable("acled");
  const privateListingLive = isLiveProviderAvailable("private_listing_feed");

  if (sportsLike) {
    return {
      geo_like: false,
      mobility_like: false,
      travel_like: false,
      macro_public_like: false,
      energy_like: false,
      environment_like: false,
      required_sources: ["thesportsdb_public"],
      optional_sources: ["api_football_optional", "polymarket_public", "google_trends"],
    };
  }

  if (
    weatherBackboneDomain ||
    /\b(weather|rain|storm|temperature|climate|hazard|flood|drought|seasonal|agriculture|wildfire)\b|water stress|crop stress|crop yield/.test(corpus)
  ) {
    requiredSources.push("open_meteo");
  }
  if (weatherAtmosphereLike && primaryLocation) {
    optionalSources.push("nominatim");
  }

  if (policyLike) {
    requiredSources.push("wikidata", "gdelt", "rss_allowlist");
    if (governanceTimelineLike) {
      requiredSources.push("google_trends");
    }
    if (normalizedQuery?.binary_frame?.asks_binary_question) {
      requiredSources.push("polymarket_public");
    }
  }

  if (marketLike) {
    requiredSources.push("yahoo_finance", "google_trends");
    if (predictionMarketFrame) {
      requiredSources.push("polymarket_public");
    }
    if (/\b(rates|inflation|ecb|fed|macro|eurusd|fx|yield|liquidity|cpi|ppi)\b/.test(corpus)) {
      if (fredLive) {
        requiredSources.push("fred_api");
      } else {
        optionalSources.push("fred_api");
      }
    }
  }

  if (geoLike) {
    requiredSources.push("nominatim", "overpass");
  }

  if (mobilityLike || mobilityAccessibilityLike || eventPressureLike || cultureEventLike || connectivityReliabilityLike) {
    if (gtfsStaticLive) {
      requiredSources.push("gtfs_static");
    } else {
      optionalSources.push("gtfs_static");
    }
    if ((connectivityReliabilityLike || infrastructureLike) && gtfsRealtimeLive) {
      requiredSources.push("gtfs_realtime");
    } else {
      optionalSources.push("gtfs_realtime");
    }
  }

  if (travelLike) {
    if (openskyLive) {
      requiredSources.push("opensky");
    } else {
      optionalSources.push("opensky");
    }
    if (gtfsStaticLive) {
      optionalSources.push("gtfs_static");
    }
    optionalSources.push("gtfs_realtime");
  }

  if (macroLike) {
    requiredSources.push(macroPrimaryBackbone);
    if (/\b(rates|inflation|liquidity|yield|ecb|fed|cpi|ppi|eurusd|fx|macro)\b/.test(corpus)) {
      if (fredLive) {
        requiredSources.push("fred_api");
      } else {
        optionalSources.push("fred_api");
      }
    }
    ["world_bank_api", "eurostat_api", "oecd_api"]
      .filter((sourceId) => sourceId !== macroPrimaryBackbone)
      .forEach((sourceId) => optionalSources.push(sourceId));
  }

  if (foodLike) {
    requiredSources.push("google_trends", macroPrimaryBackbone);
    optionalSources.push("rss_allowlist", "open_meteo");
  }

  if (climateHazardLike) {
    optionalSources.push("rss_allowlist", "google_trends");
    if (primaryLocation) {
      optionalSources.push("nominatim");
    }
  }

  if (householdPriceLike) {
    requiredSources.push("google_trends", macroPrimaryBackbone);
    optionalSources.push("rss_allowlist", "yahoo_finance");
  }

  if (housingLike) {
    requiredSources.push(macroPrimaryBackbone);
    if (privateListingLive) {
      optionalSources.push("private_listing_feed");
    }
  }

  if (infrastructureLike) {
    requiredSources.push("nominatim", "overpass");
    if (gtfsStaticLive) {
      requiredSources.push("gtfs_static");
    } else {
      optionalSources.push("gtfs_static");
    }
    if (gtfsRealtimeLive) {
      requiredSources.push("gtfs_realtime");
    } else {
      optionalSources.push("gtfs_realtime");
    }
  }

  if (geopoliticalConflictLike) {
    requiredSources.push("wikidata", "gdelt", "rss_allowlist", "google_trends");
    if (acledLive) {
      optionalSources.push("acled");
    }
  }

  if (analogLike) {
    requiredSources.push("wikidata", "gdelt");
    optionalSources.push("rss_allowlist", macroPrimaryBackbone);
  }

  if (publicHealthLike) {
    requiredSources.push("open_meteo", "rss_allowlist", "google_trends");
    optionalSources.push("wikidata");
    optionalSources.push("openaq");
  }

  if (energyLike) {
    requiredSources.push("yahoo_finance", "google_trends");
    if (fredLive) {
      requiredSources.push("fred_api");
    } else {
      optionalSources.push("fred_api");
    }
    if (eiaLive) {
      requiredSources.push("eia_api");
    } else {
      optionalSources.push("eia_api");
    }
  }

  if (environmentLike) {
    if (openaqLive) {
      requiredSources.push("openaq");
    } else {
      optionalSources.push("openaq");
    }
  }

  if (waterHydrologyLike || environmentExposureLike) {
    requiredSources.push("nominatim", "overpass");
  }

  if (environmentExposureLike) {
    requiredSources.push("open_meteo");
    optionalSources.push("google_trends");
  }

  if (waterHydrologyLike) {
    optionalSources.push("rss_allowlist");
  }

  if (demographicMigrationLike) {
    requiredSources.push(macroPrimaryBackbone, "google_trends");
    ["world_bank_api", "eurostat_api", "oecd_api"]
      .filter((sourceId) => sourceId !== macroPrimaryBackbone)
      .forEach((sourceId) => optionalSources.push(sourceId));
    optionalSources.push("rss_allowlist");
  }

  if (safetyIncidentLike) {
    requiredSources.push("rss_allowlist", "gdelt");
    optionalSources.push("google_trends");
  }

  if (attentionStackDomain) {
    requiredSources.push("wikidata", "gdelt", "rss_allowlist", "google_trends");
  }

  if (derivedDecisionDomain) {
    if (/\b(relationship|love|social|friend|friendship|dating|exam|study|attention|quote|hype)\b|quote stream/.test(corpus)) {
      requiredSources.push("wikidata", "gdelt", "rss_allowlist", "google_trends");
    }
  }

  if (workCareerLike) {
    requiredSources.push("google_trends", macroPrimaryBackbone);
    optionalSources.push("eurostat_api", "oecd_api", "world_bank_api");
  }

  if (personalFinanceLike) {
    requiredSources.push("yahoo_finance", "google_trends");
    optionalSources.push("eurostat_api");
    if (/\b(mortgage|housing|rent|home|property)\b/.test(corpus)) {
      if (privateListingLive) {
        optionalSources.push("private_listing_feed");
      }
    }
  }

  if (businessIdeaLike) {
    requiredSources.push("google_trends", macroPrimaryBackbone);
    optionalSources.push("eurostat_api", "oecd_api", "rss_allowlist");
  }

  if (personalTradeoffLike) {
    requiredSources.push("nominatim", "overpass");
    optionalSources.push(macroPrimaryBackbone, "google_trends");
    if (gtfsStaticLive && /\b(move|relocat|rome|roma|milan|milano)\b/.test(corpus)) {
      optionalSources.push("gtfs_static");
    }
  }

  if (supplyTradeLike) {
    requiredSources.push(macroPrimaryBackbone, "rss_allowlist");
    optionalSources.push("google_trends", "world_bank_api", "oecd_api");
  }

  if (industryCycleLike) {
    requiredSources.push(macroPrimaryBackbone, "google_trends");
    optionalSources.push("yahoo_finance", "oecd_api", "eurostat_api");
  }

  if (cultureEventLike) {
    requiredSources.push("google_trends", "rss_allowlist");
    if (gtfsStaticLive) {
      optionalSources.push("gtfs_static");
    }
    if (gtfsRealtimeLive) {
      optionalSources.push("gtfs_realtime");
    }
    if (openskyLive && /\b(travel|visit|tourism|flight|airport)\b/.test(corpus)) {
      optionalSources.push("opensky");
    }
  }

  optionalSources.push("timegpt");

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
