import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createRequire } from "node:module";

dotenv.config({ path: path.resolve(process.cwd(), "functions/.env.omnicrystal") });

const require = createRequire(import.meta.url);
const { buildRoutingHints, safeText } = require("../functions/predictionCore.js");
const { runContextualVariableSelection } = require("../functions/crystalCore/adapterRegistry.js");
const { __testables: runtimeTestables } = require("../functions/crystalCore/runtime.js");

const FOUNDATION_CASES = [
  {
    cluster: "city_geo",
    query: "City pulse in Rome next 30 days",
    expectedDomains: ["A.7.city_pulse_and_urban_pressure"],
    requiredSources: ["nominatim", "overpass"],
    expectLocation: true,
  },
  {
    cluster: "mobility",
    query: "Mobility congestion in Rome next week",
    expectedDomains: ["A.8.mobility_congestion_and_accessibility", "A.7.city_pulse_and_urban_pressure"],
    requiredSources: ["nominatim", "overpass"],
    optionalSources: ["gtfs_static", "gtfs_realtime"],
    expectLocation: true,
    expectMobility: true,
  },
  {
    cluster: "travel",
    query: "Travel disruption risk in Tokyo next 90 days",
    expectedDomains: ["A.9.travel_flows_and_disruption"],
    requiredSources: ["nominatim", "overpass", "opensky"],
    optionalSources: ["gtfs_static", "gtfs_realtime"],
    expectLocation: true,
    expectMobility: true,
  },
  {
    cluster: "macro_public",
    query: "Inflation in Italy next 12 months",
    expectedDomains: ["A.14.macro_economy_and_cycles", "A.11.cost_of_living_and_price_pressure"],
    requiredSources: ["world_bank_api", "eurostat_api", "oecd_api", "fred_api"],
    expectPublicData: true,
  },
  {
    cluster: "energy",
    query: "Oil price regime next 90 days",
    expectedDomains: ["A.23.markets_and_asset_regimes", "A.13.energy_and_utilities_markets"],
    requiredSources: ["yahoo_finance", "google_trends", "eia_api"],
    expectPublicData: true,
  },
  {
    cluster: "environment",
    query: "Air quality risk in Milan next week",
    expectedDomains: ["A.28.public_health_and_environmental_exposure", "A.4.environmental_quality_and_exposure"],
    requiredSources: ["nominatim", "overpass", "openaq"],
    expectLocation: true,
    expectPublicData: true,
  },
];

const TARGET_RUNTIME_PROVIDER_IDS = [
  "wikidata",
  "gdelt",
  "rss_allowlist",
  "google_trends",
  "yahoo_finance",
  "polymarket_public",
  "open_meteo",
  "fred_api",
  "api_football_optional",
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
];

const DEFAULT_LIVE_HEALTH_URL = "https://omnicrystal.web.app/api/health";

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function safeNumber(value, fallback = null) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function ensureDirname(filePath) {
  return fs.mkdir(path.dirname(filePath), { recursive: true });
}

function normalizeSyntheticQueryPlan(queryText) {
  const routingHints = buildRoutingHints(queryText);
  return {
    routingHints,
    queryPlan: runtimeTestables.normalizeQueryPlanPayload(
      {},
      {
        routingHints,
        fallbackDomain: routingHints.primaryDomainId,
        queryText,
      }
    ),
  };
}

function computeTop3Hit(expectedDomains = [], routingHints = {}) {
  const topDomain = safeText(routingHints?.primaryDomainId);
  const topThree = Array.isArray(routingHints?.candidateDomains)
    ? routingHints.candidateDomains.slice(0, 3).map((candidate) => safeText(candidate?.domain_id)).filter(Boolean)
    : [];
  return expectedDomains.includes(topDomain) || expectedDomains.some((domainId) => topThree.includes(domainId));
}

function withFoundationSmokeEnv(callback) {
  const overrides = {
    FRED_API_KEY: "synthetic-fred-key",
    OPENAQ_API_KEY: "synthetic-openaq-key",
    EIA_API_KEY: "synthetic-eia-key",
    GTFS_STATIC_FEEDS_JSON: JSON.stringify([
      { label: "Rome Transit", region_keywords: ["rome", "roma"], url: "https://fixtures.example/rome-static.zip" },
      { label: "Tokyo Transit", region_keywords: ["tokyo"], url: "https://fixtures.example/tokyo-static.zip" },
      { label: "Milan Transit", region_keywords: ["milan", "milano"], url: "https://fixtures.example/milan-static.zip" },
    ]),
    GTFS_REALTIME_FEEDS_JSON: JSON.stringify([
      { label: "Rome Transit Live", region_keywords: ["rome", "roma"], url: "https://fixtures.example/rome-realtime.pb" },
      { label: "Tokyo Transit Live", region_keywords: ["tokyo"], url: "https://fixtures.example/tokyo-realtime.pb" },
      { label: "Milan Transit Live", region_keywords: ["milan", "milano"], url: "https://fixtures.example/milan-realtime.pb" },
    ]),
  };
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined;
    process.env[key] = value;
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function buildSyntheticContext() {
  return {
    db: null,
    admin: null,
    ai: null,
    fetchJson: async () => ({}),
    llmRuntime: {
      async generateText({ prompt }) {
        const focusLine = safeText(prompt).split("\n")[0] || "Provider foundation baseline";
        return `${focusLine}. Crystal is grounding the read through shared public data connectors rather than a single generic evidence lane.`;
      },
    },
    async fetchTrendSignal(queryText) {
      const corpus = safeText(queryText).toLowerCase();
      const lean = /oil|inflation|air quality/.test(corpus) ? "up" : "flat";
      return {
        source_id: "google_trends",
        label: "Shared attention baseline",
        summary: `Google Trends synthetic fixture shows ${lean === "up" ? "rising" : "steady"} attention around ${safeText(queryText)}.`,
        lean,
        freshness_score: 0.76,
        trust_score: 0.64,
      };
    },
    async fetchYahooMarketSignal(queryText) {
      const corpus = safeText(queryText).toLowerCase();
      if (!/oil|inflation|rates|bitcoin|gold|nasdaq|eurusd/.test(corpus)) {
        return null;
      }
      return {
        signals: [
          {
            source_id: "yahoo_finance",
            label: "Market tape baseline",
            summary: `Yahoo Finance synthetic market tape remains live for ${safeText(queryText)}.`,
            lean: /oil|bitcoin/.test(corpus) ? "up" : "flat",
            freshness_score: 0.87,
            trust_score: 0.82,
          },
        ],
        source_trust_map: [
          {
            source_id: "yahoo_finance",
            trust_score: 0.82,
            note: "Synthetic chart regime fixture for the provider foundation benchmark.",
          },
        ],
        conflict_map: [],
        market_metrics: {
          symbol: /oil/.test(corpus) ? "CL=F" : "MARKET",
          label: /oil/.test(corpus) ? "Crude oil futures" : "Synthetic market tape",
          latest_price: 82.4,
          prior_price: 79.1,
          delta_pct: 0.0417,
          range_low: 78.1,
          range_high: 84.3,
          range_width_pct: 0.0771,
          regime_risk: "medium",
        },
      };
    },
    async fetchFredMacroSignal(_fetchJson, queryText) {
      return {
        signals: [
          {
            source_id: "fred_api",
            label: "Macro baseline",
            summary: `Synthetic FRED baseline remains live for ${safeText(queryText)}.`,
            lean: /fall|rates/.test(safeText(queryText).toLowerCase()) ? "down" : "up",
            freshness_score: 0.79,
            trust_score: 0.82,
          },
        ],
        source_trust_map: [
          {
            source_id: "fred_api",
            trust_score: 0.82,
            note: "Synthetic FRED fixture for provider-foundation smoke tests.",
          },
        ],
        conflict_map: [],
        macro_metrics: {
          series_id: "synthetic_foundation_macro",
          label: "Synthetic macro baseline",
          latest_value: 2.4,
          previous_value: 2.8,
          delta: -0.4,
          lean: "down",
        },
      };
    },
    async fetchNominatimLocationSignal(queryText) {
      const corpus = safeText(queryText).toLowerCase();
      const location =
        /tokyo/.test(corpus)
          ? { display_name: "Tokyo, Japan", lat: 35.6762, lon: 139.6503, type: "city" }
          : /milan|milano/.test(corpus)
            ? { display_name: "Milan, Italy", lat: 45.4642, lon: 9.19, type: "city" }
            : { display_name: "Rome, Italy", lat: 41.8933, lon: 12.4829, type: "city" };
      return {
        signals: [
          {
            source_id: "nominatim",
            label: "Resolved place",
            summary: `${location.display_name} resolved into a stable geographic anchor.`,
            lean: "flat",
            freshness_score: 0.92,
            trust_score: 0.81,
          },
        ],
        source_trust_map: [
          {
            source_id: "nominatim",
            trust_score: 0.81,
            note: `Synthetic geocoding fixture for ${location.display_name}.`,
          },
        ],
        conflict_map: [],
        location_metrics: location,
      };
    },
    async fetchOverpassContextSignal(queryText, _normalizedQuery, _domainConfig, locationPack) {
      const displayName = safeText(locationPack?.location_metrics?.display_name, safeText(queryText));
      return {
        signals: [
          {
            source_id: "overpass",
            label: "POI and local context",
            summary: `Overpass synthetic context found dense transport and hospitality POIs around ${displayName}.`,
            lean: "up",
            freshness_score: 0.71,
            trust_score: 0.72,
          },
        ],
        source_trust_map: [
          {
            source_id: "overpass",
            trust_score: 0.72,
            note: `Synthetic Overpass fixture for ${displayName}.`,
          },
        ],
        conflict_map: [],
        poi_metrics: {
          source_id: "overpass",
          display_name: displayName,
          poi_count: 128,
          transit_poi_count: 24,
          hospitality_poi_count: 38,
        },
      };
    },
    async fetchWorldBankSignal(queryText) {
      return {
        signals: [
          {
            source_id: "world_bank_api",
            label: "World Bank macro baseline",
            summary: `World Bank synthetic indicator remains available for ${safeText(queryText)}.`,
            lean: "up",
            freshness_score: 0.69,
            trust_score: 0.77,
          },
        ],
        source_trust_map: [
          {
            source_id: "world_bank_api",
            trust_score: 0.77,
            note: "Synthetic World Bank fixture for provider foundation benchmark.",
          },
        ],
        conflict_map: [],
        public_data_metrics: {
          source_id: "world_bank_api",
          label: "Synthetic World Bank indicator",
          country: "ITA",
          latest_value: 2.5,
          previous_value: 2.9,
          latest_date: "2025",
        },
      };
    },
    async fetchEurostatSignal(queryText) {
      return {
        signals: [
          {
            source_id: "eurostat_api",
            label: "Eurostat public data",
            summary: `Eurostat synthetic baseline remains available for ${safeText(queryText)}.`,
            lean: "down",
            freshness_score: 0.7,
            trust_score: 0.8,
          },
        ],
        source_trust_map: [
          {
            source_id: "eurostat_api",
            trust_score: 0.8,
            note: "Synthetic Eurostat fixture for provider foundation benchmark.",
          },
        ],
        conflict_map: [],
        public_data_metrics: {
          source_id: "eurostat_api",
          label: "Synthetic Eurostat baseline",
          geography: "IT",
          latest_value: 2.4,
          previous_value: 2.8,
        },
      };
    },
    async fetchOecdSignal(queryText) {
      return {
        signals: [
          {
            source_id: "oecd_api",
            label: "OECD public data",
            summary: `OECD synthetic leading indicator remains available for ${safeText(queryText)}.`,
            lean: "flat",
            freshness_score: 0.68,
            trust_score: 0.78,
          },
        ],
        source_trust_map: [
          {
            source_id: "oecd_api",
            trust_score: 0.78,
            note: "Synthetic OECD fixture for provider foundation benchmark.",
          },
        ],
        conflict_map: [],
        public_data_metrics: {
          source_id: "oecd_api",
          label: "Synthetic OECD baseline",
          geography: "ITA",
          latest_value: 99.3,
          previous_value: 99.1,
        },
      };
    },
    async fetchOpenSkySignal(queryText, _normalizedQuery, locationPack) {
      return {
        signals: [
          {
            source_id: "opensky",
            label: "Flight pressure",
            summary: `OpenSky synthetic traffic shows elevated aviation activity around ${safeText(locationPack?.location_metrics?.display_name, safeText(queryText))}.`,
            lean: "up",
            freshness_score: 0.88,
            trust_score: 0.76,
          },
        ],
        source_trust_map: [
          {
            source_id: "opensky",
            trust_score: 0.76,
            note: "Synthetic OpenSky fixture for provider foundation benchmark.",
          },
        ],
        conflict_map: [],
        mobility_metrics: {
          source_id: "opensky",
          aircraft_count: 47,
          bbox: {
            north: 41.99,
            south: 41.79,
            east: 12.6,
            west: 12.3,
          },
        },
      };
    },
    async fetchGtfsStaticSignal(queryText) {
      return {
        signals: [
          {
            source_id: "gtfs_static",
            label: "Transit network baseline",
            summary: `GTFS Static synthetic feed remains available for ${safeText(queryText)}.`,
            lean: "up",
            freshness_score: 0.67,
            trust_score: 0.74,
          },
        ],
        source_trust_map: [
          {
            source_id: "gtfs_static",
            trust_score: 0.74,
            note: "Synthetic GTFS Static fixture for provider foundation benchmark.",
          },
        ],
        conflict_map: [],
        mobility_metrics: {
          source_id: "gtfs_static",
          feed_label: "Synthetic GTFS Static",
          routes: 132,
          stops: 1488,
          service_rows: 28,
        },
      };
    },
    async fetchGtfsRealtimeSignal(queryText) {
      return {
        signals: [
          {
            source_id: "gtfs_realtime",
            label: "Transit live operations",
            summary: `GTFS Realtime synthetic feed remains available for ${safeText(queryText)}.`,
            lean: "flat",
            freshness_score: 0.9,
            trust_score: 0.78,
          },
        ],
        source_trust_map: [
          {
            source_id: "gtfs_realtime",
            trust_score: 0.78,
            note: "Synthetic GTFS Realtime fixture for provider foundation benchmark.",
          },
        ],
        conflict_map: [],
        mobility_metrics: {
          source_id: "gtfs_realtime",
          feed_label: "Synthetic GTFS Realtime",
          trip_updates: 18,
          vehicle_positions: 54,
          alerts: 3,
        },
      };
    },
    async fetchOpenAqSignal(queryText) {
      return {
        signals: [
          {
            source_id: "openaq",
            label: "Air quality station availability",
            summary: `OpenAQ synthetic baseline remains available for ${safeText(queryText)}.`,
            lean: "up",
            freshness_score: 0.79,
            trust_score: 0.72,
          },
        ],
        source_trust_map: [
          {
            source_id: "openaq",
            trust_score: 0.72,
            note: "Synthetic OpenAQ fixture for provider foundation benchmark.",
          },
        ],
        conflict_map: [],
        environment_metrics: {
          source_id: "openaq",
          country: "IT",
          location_count: 6,
        },
      };
    },
    async fetchEiaSignal(queryText) {
      return {
        signals: [
          {
            source_id: "eia_api",
            label: "Energy data baseline",
            summary: `EIA synthetic baseline remains available for ${safeText(queryText)}.`,
            lean: "up",
            freshness_score: 0.77,
            trust_score: 0.75,
          },
        ],
        source_trust_map: [
          {
            source_id: "eia_api",
            trust_score: 0.75,
            note: "Synthetic EIA fixture for provider foundation benchmark.",
          },
        ],
        conflict_map: [],
        public_data_metrics: {
          source_id: "eia_api",
          label: "Synthetic energy baseline",
          latest_value: 81.7,
          previous_value: 78.9,
        },
      };
    },
  };
}

function findPreviousReportPath(reportDir, currentDate) {
  return fs
    .readdir(reportDir)
    .then((entries) =>
      entries
        .filter((entry) => /^provider-foundation-report-\d{4}-\d{2}-\d{2}\.json$/.test(entry) && !entry.includes(currentDate))
        .sort()
        .pop() || ""
    )
    .catch(() => "");
}

async function fetchLiveRuntimeProviderStates(healthUrl = DEFAULT_LIVE_HEALTH_URL) {
  try {
    const response = await fetch(healthUrl, {
      headers: {
        accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const providerStates = Array.isArray(payload?.crystalCore?.provider_states) ? payload.crystalCore.provider_states : [];
    return providerStates.filter((provider) => TARGET_RUNTIME_PROVIDER_IDS.includes(safeText(provider?.source_id)));
  } catch (_error) {
    return null;
  }
}

export async function runProviderFoundationBenchmark({ currentDate = new Date().toISOString().slice(0, 10) } = {}) {
  const localRuntimeProviderStates = runtimeTestables
    .getAllProviderRuntimeStatuses()
    .filter((provider) => TARGET_RUNTIME_PROVIDER_IDS.includes(safeText(provider?.source_id)));
  const liveRuntimeProviderStates = await fetchLiveRuntimeProviderStates();
  const runtimeProviderStates = liveRuntimeProviderStates?.length ? liveRuntimeProviderStates : localRuntimeProviderStates;
  const runtimeConfigBlockers = runtimeProviderStates.filter(
    (provider) =>
      provider?.available !== true &&
      !["available_public", "available_public_anonymous", "implemented_public"].includes(safeText(provider?.status))
  );

  const syntheticContext = buildSyntheticContext();
  const cases = await withFoundationSmokeEnv(async () => {
    const rows = [];
    for (const caseItem of FOUNDATION_CASES) {
      const { routingHints, queryPlan } = normalizeSyntheticQueryPlan(caseItem.query);
      const benchmarkQueryPlan = {
        ...queryPlan,
        primary_domain_id: safeText(caseItem.expectedDomains?.[0], safeText(queryPlan?.primary_domain_id)),
      };
      const { variable_selection_pack: variableSelectionPack } = runContextualVariableSelection(benchmarkQueryPlan);
      const verifiedEvidencePack = await runtimeTestables.buildVerifiedEvidencePack(syntheticContext, {
        runId: null,
        queryText: caseItem.query,
        normalizedQuery: benchmarkQueryPlan,
        variableSelectionPack,
        engine: "extended",
      });
      const usedSources = uniqueStrings(verifiedEvidencePack?.source_ledger || []);
      const requiredSources = Array.isArray(verifiedEvidencePack?.source_usage?.required_sources)
        ? verifiedEvidencePack.source_usage.required_sources
        : [];
      const optionalSources = Array.isArray(verifiedEvidencePack?.source_usage?.optional_sources)
        ? verifiedEvidencePack.source_usage.optional_sources
        : [];
      const missingRequiredSources = (caseItem.requiredSources || []).filter((sourceId) => !usedSources.includes(sourceId));
      const missingOptionalSources = (caseItem.optionalSources || []).filter((sourceId) => !usedSources.includes(sourceId));
      const topThree = Array.isArray(routingHints?.candidateDomains)
        ? routingHints.candidateDomains.slice(0, 3).map((candidate) => safeText(candidate?.domain_id)).filter(Boolean)
        : [];
      rows.push({
        ...caseItem,
        primary_domain_id: safeText(benchmarkQueryPlan?.primary_domain_id, safeText(routingHints?.primaryDomainId)),
        candidate_domains_top3: topThree,
        top3_hit: computeTop3Hit(caseItem.expectedDomains, routingHints),
        used_sources: usedSources,
        required_sources: requiredSources,
        optional_sources: optionalSources,
        missing_required_sources: missingRequiredSources,
        missing_optional_sources: missingOptionalSources,
        location_ready: caseItem.expectLocation ? Boolean(verifiedEvidencePack?.location_structure?.resolved_place?.display_name) : true,
        mobility_ready: caseItem.expectMobility ? Boolean(verifiedEvidencePack?.mobility_structure?.summary?.length) : true,
        public_data_ready: caseItem.expectPublicData ? Boolean(verifiedEvidencePack?.public_data_structure?.signals?.length) : true,
        source_usage: verifiedEvidencePack?.source_usage || null,
        location_structure: verifiedEvidencePack?.location_structure || null,
        mobility_structure: verifiedEvidencePack?.mobility_structure || null,
        public_data_structure: verifiedEvidencePack?.public_data_structure || null,
      });
    }
    return rows;
  });

  const summary = {
    generated_at: new Date().toISOString(),
    report_date: currentDate,
    total_cases: cases.length,
    top3_miss_count: cases.filter((item) => !item.top3_hit).length,
    source_coverage_failures: cases.filter((item) => item.missing_required_sources.length > 0).length,
    location_structure_failures: cases.filter((item) => !item.location_ready).length,
    mobility_structure_failures: cases.filter((item) => !item.mobility_ready).length,
    public_data_structure_failures: cases.filter((item) => !item.public_data_ready).length,
    runtime_provider_count: runtimeProviderStates.length,
    runtime_config_blocker_count: runtimeConfigBlockers.length,
    runtime_state_source: liveRuntimeProviderStates?.length ? "live_health" : "local_env",
    synthetic_smoke_verdict:
      cases.every(
        (item) =>
          item.missing_required_sources.length === 0 &&
          item.location_ready &&
          item.mobility_ready &&
          item.public_data_ready
      )
        ? "connector-ready"
        : "needs-implementation",
    runtime_config_verdict: runtimeConfigBlockers.length === 0 ? "config-ready" : "needs-config",
  };
  summary.verdict =
    summary.synthetic_smoke_verdict === "connector-ready" && summary.runtime_config_verdict === "config-ready"
      ? "foundation-ready"
      : "needs-config";

  return {
    summary,
    runtime_provider_states: runtimeProviderStates,
    runtime_config_blockers: runtimeConfigBlockers.map((provider) => ({
      source_id: safeText(provider?.source_id),
      status: safeText(provider?.status),
      configured: provider?.configured === true,
      available: provider?.available === true,
      notes: Array.isArray(provider?.notes) ? provider.notes : [],
    })),
    cases,
  };
}

export async function writeProviderFoundationReport({
  currentDate = new Date().toISOString().slice(0, 10),
  docsDir = path.resolve(process.cwd(), "docs"),
} = {}) {
  const report = await runProviderFoundationBenchmark({ currentDate });
  const markdownPath = path.join(docsDir, `provider-foundation-report-${currentDate}.md`);
  const jsonPath = path.join(docsDir, `provider-foundation-report-${currentDate}.json`);
  const previousReportFile = await findPreviousReportPath(docsDir, currentDate);
  let regressionLines = ["- No prior provider foundation baseline report found."];

  if (previousReportFile) {
    const previousPath = path.join(docsDir, previousReportFile);
    const previousReport = JSON.parse(await fs.readFile(previousPath, "utf8"));
    const previousSummary = previousReport?.summary || {};
    regressionLines = [
      `- Previous report: \`${previousReportFile}\``,
      `- Source coverage failures: \`${previousSummary.source_coverage_failures ?? "n/a"}\` -> \`${report.summary.source_coverage_failures}\``,
      `- Location structure failures: \`${previousSummary.location_structure_failures ?? "n/a"}\` -> \`${report.summary.location_structure_failures}\``,
      `- Mobility structure failures: \`${previousSummary.mobility_structure_failures ?? "n/a"}\` -> \`${report.summary.mobility_structure_failures}\``,
      `- Public data structure failures: \`${previousSummary.public_data_structure_failures ?? "n/a"}\` -> \`${report.summary.public_data_structure_failures}\``,
      `- Runtime config blockers: \`${previousSummary.runtime_config_blocker_count ?? "n/a"}\` -> \`${report.summary.runtime_config_blocker_count}\``,
    ];
  }

  const recommendation =
    report.summary.synthetic_smoke_verdict !== "connector-ready"
      ? "fix_connector_implementation"
      : report.summary.runtime_config_verdict !== "config-ready"
        ? "configure_shared_runtime_env"
        : "shared_spine_ready_for_dark_deploy";

  const markdown = [
    `# Provider Foundation Report - ${currentDate}`,
    "",
    "## Summary",
    `- Total synthetic cases: \`${report.summary.total_cases}\``,
    `- Top-3 miss count: \`${report.summary.top3_miss_count}\``,
    `- Source coverage failures: \`${report.summary.source_coverage_failures}\``,
    `- Location structure failures: \`${report.summary.location_structure_failures}\``,
    `- Mobility structure failures: \`${report.summary.mobility_structure_failures}\``,
    `- Public data structure failures: \`${report.summary.public_data_structure_failures}\``,
    `- Runtime provider count: \`${report.summary.runtime_provider_count}\``,
    `- Runtime config blocker count: \`${report.summary.runtime_config_blocker_count}\``,
    `- Runtime state source: \`${report.summary.runtime_state_source}\``,
    `- Synthetic smoke verdict: \`${report.summary.synthetic_smoke_verdict}\``,
    `- Runtime config verdict: \`${report.summary.runtime_config_verdict}\``,
    `- Recommendation: \`${recommendation}\``,
    `- Verdict: **${report.summary.verdict}**`,
    "",
    "## Runtime Provider States",
    "| Source | Status | Configured | Available | Notes |",
    "|---|---|---|---|---|",
    ...report.runtime_provider_states.map(
      (provider) =>
        `| ${safeText(provider?.source_id)} | ${safeText(provider?.status)} | ${provider?.configured === true ? "yes" : "no"} | ${provider?.available === true ? "yes" : "no"} | ${(Array.isArray(provider?.notes) ? provider.notes : []).join("; ") || "-"} |`
    ),
    "",
    "## Synthetic Connector Smoke",
    "| Cluster | Query | Domain | Sources | Missing required | Location | Mobility | Public data |",
    "|---|---|---|---|---|---|---|---|",
    ...report.cases.map(
      (caseItem) =>
        `| ${caseItem.cluster} | ${caseItem.query} | ${caseItem.primary_domain_id} | ${(caseItem.used_sources || []).join(", ") || "-"} | ${(caseItem.missing_required_sources || []).join(", ") || "-"} | ${caseItem.location_ready ? "ready" : "missing"} | ${caseItem.mobility_ready ? "ready" : "missing"} | ${caseItem.public_data_ready ? "ready" : "missing"} |`
    ),
    "",
    "## Runtime Config Blockers",
    ...(report.runtime_config_blockers.length
      ? report.runtime_config_blockers.map(
          (provider) => `- \`${provider.source_id}\`: status=\`${provider.status}\`, notes=${provider.notes.join("; ") || "none"}`
        )
      : ["- None."]),
    "",
    "## Regression vs Previous Report",
    ...regressionLines,
    "",
  ].join("\n");

  await ensureDirname(markdownPath);
  await fs.writeFile(markdownPath, markdown, "utf8");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  return {
    markdownPath,
    jsonPath,
    report,
  };
}
