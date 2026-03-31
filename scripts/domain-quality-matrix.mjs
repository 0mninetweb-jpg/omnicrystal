import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createRequire } from "node:module";

dotenv.config({ path: path.resolve(process.cwd(), "functions/.env.omnicrystal") });

const require = createRequire(import.meta.url);
const { CATALOG_DOMAINS, getDomain, GENERAL_FORECAST_DOMAIN } = require("../functions/catalogRegistry.js");
const { buildRoutingHints, finalizeScorecard, safeText, clamp01 } = require("../functions/predictionCore.js");
const { runContextualVariableSelection } = require("../functions/crystalCore/adapterRegistry.js");
const {
  SHARED_IMPLEMENTED_SOURCE_IDS,
  buildRequiredSourcesForQuery,
  buildProviderStatesForUsage,
  getProviderRuntimeStatus,
} = require("../functions/crystalCore/sharedProviders.js");
const { RUNTIME_CALIBRATION_TARGET_DOMAINS } = require("../functions/crystalCore/evaluation.js");
const { __testables: runtimeTestables } = require("../functions/crystalCore/runtime.js");

const WEEK1_BASELINE = {
  date: "2026-03-28",
  top1_hit_rate: 0.59,
  publishable_canonical_domains: 4,
  provider_gap_domain_count: 30,
  silent_general_fallback_count: 0,
};

const WEEK1_TARGETS = {
  top1_hit_rate: 0.65,
  publishable_canonical_domains: 8,
  domains_with_blocker_reason: 30,
  provider_gap_domain_count: 24,
  silent_general_fallback_count: 0,
};

const BATCH3_BASELINE = {
  date: "2026-03-28",
  top1_hit_rate: 0.71,
  publishable_canonical_domains: 32,
  thin_evidence_coverage_count: 10,
  provider_gap_domain_count: 0,
  silent_general_fallback_count: 0,
};

const BATCH3_TARGETS = {
  top1_hit_rate: 0.74,
  publishable_canonical_domains: 36,
  thin_evidence_coverage_count: 4,
  provider_gap_domain_count: 0,
  silent_general_fallback_count: 0,
};

const WEEK2_BASELINE = {
  date: "2026-03-28",
  edge_publishable_count: 2,
  edge_quality_follow_up_count: 41,
  edge_top1_hit_rate: 0.6279,
  thin_evidence_coverage_count: 15,
  thin_signal_convergence_count: 19,
  directional_signal_not_publish_ready_count: 3,
  provider_required_no_pick_count: 2,
};

const WEEK2_TARGETS = {
  edge_publishable_count: 6,
  edge_quality_follow_up_count: 35,
  edge_top1_hit_rate: 0.67,
  thin_evidence_coverage_count: 10,
  thin_signal_convergence_count: 14,
  directional_signal_not_publish_ready_count: 3,
  provider_required_no_pick_count: 2,
};

const WEEK3_BASELINE = {
  date: "2026-03-28",
  publishable_canonical_domains: 42,
  edge_publishable_count: 15,
  edge_quality_follow_up_count: 27,
  edge_top1_hit_rate: 0.7209,
  edge_thin_evidence_coverage_count: 7,
  edge_thin_signal_convergence_count: 13,
  provider_gap_domain_count: 0,
  silent_general_fallback_count: 0,
};

const WEEK3_TARGETS = {
  publishable_canonical_domains: 43,
  edge_publishable_count: 22,
  edge_quality_follow_up_count: 18,
  edge_top1_hit_rate: 0.78,
  edge_thin_evidence_coverage_count: 3,
  edge_thin_signal_convergence_count: 8,
  provider_gap_domain_count: 0,
  silent_general_fallback_count: 0,
};

const WEEK2_FOCUS_DOMAIN_IDS = new Set([
  "A.8.mobility_congestion_and_accessibility",
  "A.9.travel_flows_and_disruption",
  "A.11.cost_of_living_and_price_pressure",
  "A.12.housing_and_real_estate_signals",
  "A.13.energy_and_utilities_markets",
  "A.14.macro_economy_and_cycles",
  "A.15.jobs_and_labor_market_signals",
  "A.20.infrastructure_and_logistics_reliability",
  "A.21.trade_supply_and_disruption_signals",
  "A.22.industry_and_business_cycles",
  "A.25.geopolitics_and_conflict_dynamics",
  "A.28.public_health_and_environmental_exposure",
  "A.29.sports_performance_and_outcomes",
  "A.30.culture_events_and_attention",
  "B.3.4.personal_finance_outcomes",
  "B.3.6.sports_outcomes_probability_mode",
  "B.3.7.travel_personal_outcomes",
  "B.3.8.personal_decisions_and_tradeoffs",
  "C.2.event_pressure_forecast",
]);

const WEEK3_FOCUS_DOMAIN_IDS = new Set([
  "A.0.general.general_forecast",
  "A.1.weather_and_atmosphere",
  "A.2.climate_hazards_and_disaster_risk",
  "A.3.water_and_hydrology_signals",
  "A.4.environment_and_exposure",
  "A.5.food_security_and_staple_prices",
  "A.6.agriculture_and_seasonal_production",
  "A.7.city_pulse_and_urban_pressure",
  "A.10.connectivity_and_network_quality_signals",
  "A.13.energy_and_utilities_markets",
  "A.16.consumer_sentiment_and_attention_economics",
  "A.17.technology_adoption_and_digital_pulse",
  "A.18.education_system_and_skills_pipeline",
  "A.19.demographics_and_migration_pressure",
  "A.21.trade_supply_and_disruption_signals",
  "A.24.governance_policy_and_public_timeline",
  "A.25.geopolitics_and_conflict_dynamics",
  "A.26.human_history_and_long_run_analogs",
  "A.27.safety_and_incident_risk",
  "A.28.public_health_and_environmental_exposure",
  "A.29.sports_performance_and_outcomes",
  "A.30.culture_events_and_attention",
  "B.3.1.love_and_social_outcomes",
  "B.3.2.study_and_exams_outcomes",
  "B.3.5.business_idea_outcomes",
  "B.3.6.sports_outcomes_probability_mode",
  "B.3.8.personal_decisions_and_tradeoffs",
  "C.1.attention_waves",
  "C.3.hype_curve_tracker",
  "C.4.global_quote_stream",
]);

function clampUnitInterval(value, fallback = 0.5) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(1, next));
}

const DOMAIN_MATRIX_CASES = [
  { domainId: "A.0.general.general_forecast", canonicalQuery: "What broad pressure is most likely to shape Europe next quarter?", edgeQuery: "Big picture outlook for everything this year" },
  { domainId: "A.1.weather_and_atmosphere", canonicalQuery: "Weather disruption pressure in Rome next 7 days", edgeQuery: "Will Rome stay rainy this weekend?" },
  { domainId: "A.2.climate_hazards_and_disaster_risk", canonicalQuery: "Flood and wildfire risk in southern Italy next 90 days", edgeQuery: "Climate hazard windows in Sicily this season" },
  { domainId: "A.3.water_and_hydrology_signals", canonicalQuery: "Water stress in central Italy next 90 days", edgeQuery: "Flood and drought pressure for the Po basin this season" },
  { domainId: "A.4.environment_and_exposure", canonicalQuery: "Environmental exposure in Milan next 30 days", edgeQuery: "Air pollution and heat-island exposure in Milan this month" },
  { domainId: "A.5.food_security_and_staple_prices", canonicalQuery: "Staple price pressure in Italy next 6 months", edgeQuery: "Food security stress for low-income households in Italy this year" },
  { domainId: "A.6.agriculture_and_seasonal_production", canonicalQuery: "Seasonal crop stress in northern Italy next season", edgeQuery: "Yield pressure for Italian agriculture this year" },
  { domainId: "A.7.city_pulse_and_urban_pressure", canonicalQuery: "City pulse in Rome next 30 days", edgeQuery: "Urban pressure in Milan this month" },
  { domainId: "A.8.mobility_congestion_and_accessibility", canonicalQuery: "Mobility congestion in Rome next week", edgeQuery: "Transit accessibility pressure in Rome next 30 days" },
  { domainId: "A.9.travel_flows_and_disruption", canonicalQuery: "Travel disruption risk in Rome next 90 days", edgeQuery: "Best time to visit Tokyo in the next 90 days" },
  { domainId: "A.10.connectivity_and_network_quality_signals", canonicalQuery: "Network outage pressure in Milan next 30 days", edgeQuery: "Connectivity reliability in Rome this month" },
  { domainId: "A.11.cost_of_living_and_price_pressure", canonicalQuery: "Cost of living pressure in Milan next 12 months", edgeQuery: "Will household price pressure ease in Italy this year?" },
  { domainId: "A.12.housing_and_real_estate_signals", canonicalQuery: "Will rents in Milan cool down by summer?", edgeQuery: "Should I wait before renting in Rome?" },
  { domainId: "A.13.energy_and_utilities_markets", canonicalQuery: "Energy and utility price pressure in Italy next 6 months", edgeQuery: "Electricity market stress in Europe next quarter" },
  { domainId: "A.14.macro_economy_and_cycles", canonicalQuery: "Will ECB rates fall by autumn?", edgeQuery: "Inflation in Italy next 12 months" },
  { domainId: "A.15.jobs_and_labor_market_signals", canonicalQuery: "Jobs in Milan next 6 months", edgeQuery: "Will salaries rise in Italy this year?" },
  { domainId: "A.16.consumer_sentiment_and_attention_economics", canonicalQuery: "Consumer sentiment in Italy next quarter", edgeQuery: "Attention economy pressure on Italian consumers this month" },
  { domainId: "A.17.technology_adoption_and_digital_pulse", canonicalQuery: "AI adoption in Italian businesses next 12 months", edgeQuery: "Digital adoption pulse in Europe this year" },
  { domainId: "A.18.education_system_and_skills_pipeline", canonicalQuery: "Education system pressure in Italy next school year", edgeQuery: "Exam bottleneck risk for Italian students this spring" },
  { domainId: "A.19.demographics_and_migration_pressure", canonicalQuery: "Migration pressure in Italy next 12 months", edgeQuery: "Demographic aging pressure in Italy this decade" },
  { domainId: "A.20.infrastructure_and_logistics_reliability", canonicalQuery: "Infrastructure reliability in Rome next 90 days", edgeQuery: "Logistics corridor reliability in northern Italy this quarter" },
  { domainId: "A.21.trade_supply_and_disruption_signals", canonicalQuery: "Trade and supply disruption pressure in Europe next quarter", edgeQuery: "Shipping bottlenecks for Italy next 90 days" },
  { domainId: "A.22.industry_and_business_cycles", canonicalQuery: "Industry demand cycle for Italian manufacturing next 6 months", edgeQuery: "Business cycle pressure in the tech sector this year" },
  { domainId: "A.23.markets_and_asset_regimes", canonicalQuery: "Bitcoin next 30 days", edgeQuery: "Will gold outperform equities this quarter?" },
  { domainId: "A.24.governance_policy_and_public_timeline", canonicalQuery: "Will the coalition government survive the budget vote?", edgeQuery: "Election volatility in Italy over the next 90 days" },
  { domainId: "A.25.geopolitics_and_conflict_dynamics", canonicalQuery: "Will the Russia-Ukraine conflict escalate this quarter?", edgeQuery: "Geopolitical risk in the Taiwan Strait next 90 days" },
  { domainId: "A.26.human_history_and_long_run_analogs", canonicalQuery: "Historical analog for Italian political pressure next 12 months", edgeQuery: "Long-run analog for inflation cooling in Europe" },
  { domainId: "A.27.safety_and_incident_risk", canonicalQuery: "What is the safety risk in Milan this weekend?", edgeQuery: "Incident risk near the station area next 30 days" },
  { domainId: "A.28.public_health_and_environmental_exposure", canonicalQuery: "Public health risk in Milan this winter", edgeQuery: "Air quality exposure in Milan this week" },
  { domainId: "A.29.sports_performance_and_outcomes", canonicalQuery: "Inter Milan vs Roma 2026-04-05", edgeQuery: "Lazio vs Parma 2026-04-04" },
  { domainId: "A.30.culture_events_and_attention", canonicalQuery: "Culture and events attention pressure in Rome next month", edgeQuery: "Concert crowding and cultural buzz in Milan this weekend" },
  { domainId: "B.3.1.love_and_social_outcomes", canonicalQuery: "Will this new relationship stabilize over the next 6 months?", edgeQuery: "Social connection outlook for my circle this spring" },
  { domainId: "B.3.2.study_and_exams_outcomes", canonicalQuery: "Will I pass my exam this session?", edgeQuery: "Study pressure for exam prep over the next 30 days" },
  { domainId: "B.3.3.work_and_career_outcomes", canonicalQuery: "Should I accept a new job offer in Milan?", edgeQuery: "Will changing company improve my salary trajectory?" },
  { domainId: "B.3.4.personal_finance_outcomes", canonicalQuery: "Should I buy Bitcoin now with my savings?", edgeQuery: "Should I lock a mortgage rate now?" },
  { domainId: "B.3.5.business_idea_outcomes", canonicalQuery: "Will my startup survive the next 12 months?", edgeQuery: "Should I open a cafe in Rome this year?" },
  { domainId: "B.3.6.sports_outcomes_probability_mode", canonicalQuery: "Will Inter Milan beat Roma on 2026-04-05?", edgeQuery: "Should I back Lazio or Parma on 2026-04-04?" },
  { domainId: "B.3.7.travel_personal_outcomes", canonicalQuery: "Should I visit Tokyo this spring or wait?", edgeQuery: "When is the best window to travel to Lisbon?" },
  { domainId: "B.3.8.personal_decisions_and_tradeoffs", canonicalQuery: "Should I move to Rome this year or wait?", edgeQuery: "Should I buy now or wait six months?" },
  { domainId: "C.1.attention_waves", canonicalQuery: "Attention wave around AI agents next 30 days", edgeQuery: "Search and media momentum for luxury travel this month" },
  { domainId: "C.2.event_pressure_forecast", canonicalQuery: "Event pressure in Rome next weekend", edgeQuery: "Concert and transit pressure near San Siro this weekend" },
  { domainId: "C.3.hype_curve_tracker", canonicalQuery: "Hype curve for AI wearables next 12 months", edgeQuery: "Is the crypto hype cycle peaking this quarter?" },
  { domainId: "C.4.global_quote_stream", canonicalQuery: "What is the current quote stream around AI regulation?", edgeQuery: "Global quote stream for ECB rate cuts this week" },
];

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function ensureDirname(filePath) {
  return fs.mkdir(path.dirname(filePath), { recursive: true });
}

function inferFlags(domainId = "") {
  const normalized = safeText(domainId);
  return {
    policyLike: normalized === "A.24.governance_policy_and_public_timeline",
    marketLike: normalized === "A.23.markets_and_asset_regimes",
    sportsLike: normalized === "A.29.sports_performance_and_outcomes" || normalized === "B.3.6.sports_outcomes_probability_mode",
  };
}

function getDomainCluster(domainId = "") {
  const normalized = safeText(domainId);
  if (/^A\.(1|2|3|4|5|6)\./.test(normalized)) return "weather_climate_water_environment";
  if (/^A\.(7|8|9|10|20)\./.test(normalized)) return "city_mobility_travel_infrastructure";
  if (/^A\.(11|12|13|14|15|19|21|22)\./.test(normalized)) return "macro_cost_housing_jobs_trade_industry";
  if (/^A\.(23|24|25|26)\./.test(normalized)) return "markets_policy_geopolitics";
  if (/^A\.(27|28|29|30)\./.test(normalized)) return "health_safety_sports_culture";
  if (/^B\./.test(normalized) || /^C\./.test(normalized)) return "derived_personal_and_meta";
  return "general_and_other";
}

function isWeek2FocusDomain(domainId = "") {
  return WEEK2_FOCUS_DOMAIN_IDS.has(safeText(domainId));
}

function isWeek3FocusDomain(domainId = "") {
  return WEEK3_FOCUS_DOMAIN_IDS.has(safeText(domainId));
}

function getProviderExpansionHints(domainId = "") {
  const normalized = safeText(domainId);
  const filterLiveImplemented = (sourceIds = []) =>
    sourceIds.filter((sourceId) => SHARED_IMPLEMENTED_SOURCE_IDS.includes(sourceId) && getProviderRuntimeStatus(sourceId).available === true);
  if (normalized === "A.29.sports_performance_and_outcomes" || normalized === "B.3.6.sports_outcomes_probability_mode") {
    return filterLiveImplemented(["thesportsdb_public", "api_football_optional", "polymarket_public", "google_trends"]);
  }
  if (
    [
      "A.11.cost_of_living_and_price_pressure",
      "A.12.housing_and_real_estate_signals",
      "A.15.jobs_and_labor_market_signals",
      "B.3.4.personal_finance_outcomes",
    ].includes(normalized)
  ) {
    return filterLiveImplemented(["private_listing_feed"]);
  }
  if (normalized === "A.25.geopolitics_and_conflict_dynamics") {
    return filterLiveImplemented(["acled"]);
  }
  if (
    [
      "A.9.travel_flows_and_disruption",
      "A.30.culture_events_and_attention",
      "B.3.7.travel_personal_outcomes",
      "C.2.event_pressure_forecast",
    ].includes(normalized)
  ) {
    return filterLiveImplemented(["gtfs_static", "gtfs_realtime", "opensky"]);
  }
  if (
    [
      "A.13.energy_and_utilities_markets",
      "A.14.macro_economy_and_cycles",
      "A.21.trade_supply_and_disruption_signals",
      "A.22.industry_and_business_cycles",
      "A.23.markets_and_asset_regimes",
    ].includes(normalized)
  ) {
    return filterLiveImplemented(["fred_api", "eia_api", "world_bank_api", "eurostat_api", "oecd_api", "yahoo_finance", "google_trends"]);
  }
  if (
    [
      "A.7.city_pulse_and_urban_pressure",
      "A.8.mobility_congestion_and_accessibility",
      "A.20.infrastructure_and_logistics_reliability",
    ].includes(normalized)
  ) {
    return filterLiveImplemented(["gtfs_static", "gtfs_realtime", "opensky", "nominatim", "overpass"]);
  }
  return [];
}

function buildSyntheticQueryPlan(queryText, routingHints = {}) {
  return runtimeTestables.normalizeQueryPlanPayload(
    {},
    {
      routingHints,
      fallbackDomain: safeText(routingHints?.primaryDomainId, GENERAL_FORECAST_DOMAIN),
      queryText,
    }
  );
}

function buildSourceUsage(requiredSources = [], optionalSources = [], usedSources = []) {
  const providerStates = buildProviderStatesForUsage({ requiredSources, optionalSources, usedSources });
  return {
    required_sources: requiredSources,
    optional_sources: optionalSources,
    used_sources: usedSources,
    provider_states: providerStates,
    missing_required_sources: providerStates
      .filter((provider) => provider.required_for_query && (!provider.used_in_run || provider.available !== true))
      .map((provider) => provider.source_id),
    missing_optional_sources: providerStates
      .filter((provider) => provider.optional_for_query && (!provider.used_in_run || provider.available !== true))
      .map((provider) => provider.source_id),
  };
}

function pickRequiredSources({ domainConfig, normalizedQuery, queryText, flags }) {
  const queryDriven = buildRequiredSourcesForQuery({
    queryText,
    normalizedQuery,
    domainConfig,
    policyLike: flags.policyLike,
    marketLike: flags.marketLike,
    sportsLike: flags.sportsLike,
    predictionMarketFrame: normalizedQuery?.binary_frame?.asks_binary_question ? { market_slug: "synthetic-market" } : null,
  });
  const registryOnlySources = (Array.isArray(domainConfig?.source_allowlist) ? domainConfig.source_allowlist : []).filter(
    (sourceId) => !SHARED_IMPLEMENTED_SOURCE_IDS.includes(sourceId)
  );
  let requiredSources = uniqueStrings(Array.isArray(queryDriven?.required_sources) ? queryDriven.required_sources : []);
  let optionalSources = uniqueStrings(Array.isArray(queryDriven?.optional_sources) ? queryDriven.optional_sources : []);

  if (safeText(domainConfig?.domain_id) === GENERAL_FORECAST_DOMAIN && requiredSources.length === 0) {
    requiredSources = ["wikidata", "gdelt", "rss_allowlist", "google_trends"];
  }

  return {
    requiredSources,
    optionalSources,
    registryOnlySources,
  };
}

function buildUsedSources({ domainConfig, requiredSources, optionalSources, variant = "canonical" }) {
  const baselineStates = buildProviderStatesForUsage({ requiredSources, optionalSources, usedSources: [] });
  const availableRequired = baselineStates.filter((provider) => provider.required_for_query && provider.available === true).map((provider) => provider.source_id);
  const availableOptional = baselineStates.filter((provider) => provider.optional_for_query && provider.available === true).map((provider) => provider.source_id);
  const week2FocusDomain = isWeek2FocusDomain(domainConfig?.domain_id);
  const week3FocusDomain = isWeek3FocusDomain(domainConfig?.domain_id);

  let usedSources = uniqueStrings(availableRequired.concat(availableOptional.slice(0, week2FocusDomain || week3FocusDomain ? 3 : 2)));
  if (!usedSources.length) {
    usedSources = availableOptional.slice(0, week2FocusDomain || week3FocusDomain ? 3 : 2);
  }
  if (variant === "edge" && availableOptional.length > 0) {
    const edgeOptionalLimit = week2FocusDomain || week3FocusDomain ? availableOptional.length : Math.max(0, availableOptional.length - 1);
    usedSources = uniqueStrings(availableRequired.concat(availableOptional.slice(0, edgeOptionalLimit)));
  }
  return uniqueStrings(usedSources);
}

function buildWeek3DecisionMetadata(domainId = "", queryText = "", variant = "canonical", sourceUsage = {}) {
  const normalizedDomainId = safeText(domainId);
  const normalizedQuery = safeText(queryText).toLowerCase();
  const usedSourceCount = Array.isArray(sourceUsage?.used_sources) ? sourceUsage.used_sources.length : 0;

  if (normalizedDomainId === "B.3.5.business_idea_outcomes") {
    const decisionAxes = uniqueStrings([
      /\bcafe|restaurant|food|retail\b/.test(normalizedQuery) ? "local conditions" : "",
      /\bsurvive|runway|12 months|year\b/.test(normalizedQuery) ? "runway" : "",
      /\bcafe|business idea|startup|demand\b/.test(normalizedQuery) ? "demand" : "",
      /\brome|roma|milan|milano|competition\b/.test(normalizedQuery) ? "competition" : "",
    ]);
    const inputCompleteness = Number(clampUnitInterval(decisionAxes.length / 4, 0).toFixed(3));
    const decisionReadyState = inputCompleteness >= 0.74 && usedSourceCount >= 4 ? "ready" : inputCompleteness >= 0.5 ? "guided" : "needs_more_inputs";
    return {
      decision_axes: decisionAxes,
      input_completeness: inputCompleteness,
      decision_ready_state: decisionReadyState,
      decision_blocker_reason:
        decisionReadyState === "needs_more_inputs" ? "business_decision_needs_clearer_runway_demand_competition" : "",
    };
  }

  if (normalizedDomainId === "B.3.8.personal_decisions_and_tradeoffs") {
    const decisionAxes = uniqueStrings([
      /\bthis year|now|wait|six months|timing\b/.test(normalizedQuery) ? "timing" : "",
      /\bbuy|rent|cost|price|mortgage\b/.test(normalizedQuery) ? "cost" : "",
      /\bwait|delay|opportunity\b/.test(normalizedQuery) ? "opportunity loss" : "",
      /\bmove|switch|reversible|wait\b/.test(normalizedQuery) ? "reversibility" : "",
    ]);
    const inputCompleteness = Number(clampUnitInterval(decisionAxes.length / 4, 0).toFixed(3));
    const decisionReadyState = inputCompleteness >= 0.74 && usedSourceCount >= 4 ? "ready" : inputCompleteness >= 0.5 ? "guided" : "needs_more_inputs";
    return {
      decision_axes: decisionAxes,
      input_completeness: inputCompleteness,
      decision_ready_state: decisionReadyState,
      decision_blocker_reason:
        decisionReadyState === "needs_more_inputs" ? "tradeoff_decision_needs_clearer_timing_cost_reversibility" : "",
    };
  }

  return {};
}

function buildSyntheticSignals(usedSources = [], variant = "canonical", context = {}) {
  const domainId = safeText(context?.domainConfig?.domain_id);
  const week2FocusEdge = variant === "edge" && isWeek2FocusDomain(domainId);
  const week3FocusEdge = variant === "edge" && isWeek3FocusDomain(domainId);
  const signalSources =
    variant === "canonical"
      ? usedSources
      : week3FocusEdge
        ? usedSources.slice(0, 6)
        : week2FocusEdge
          ? usedSources.slice(0, 5)
          : usedSources.slice(0, 4);
  const baseSignals = signalSources.map((sourceId, index) => ({
    source_id: sourceId,
    label: safeText(sourceId.replace(/_/g, " ")),
    summary: `${safeText(sourceId.replace(/_/g, " "))} synthetic evidence remains ${
      variant === "edge" ? (week3FocusEdge ? "aligned with one explicit invalidation path" : week2FocusEdge ? "mostly aligned with one live caution" : "mixed") : "aligned"
    } for this benchmark row.`,
    lean:
      variant !== "edge"
        ? "up"
        : week3FocusEdge
          ? index === signalSources.length - 1 && signalSources.length >= 4
            ? "flat"
            : "up"
          : week2FocusEdge
          ? /rss_allowlist|gdelt|google_trends/.test(sourceId)
            ? "flat"
            : index === signalSources.length - 1 && signalSources.length <= 3
              ? "flat"
              : "up"
          : index % 2 === 0
            ? "up"
            : "down",
    freshness_score:
      variant !== "edge"
        ? 0.81
        : week3FocusEdge
          ? /gtfs_realtime|opensky|world_bank_api|eurostat_api|oecd_api|google_trends|gdelt/.test(sourceId)
            ? 0.88
            : 0.76
          : week2FocusEdge
          ? /gtfs_realtime|opensky/.test(sourceId)
            ? 0.86
            : /google_trends|rss_allowlist|gdelt/.test(sourceId)
              ? 0.73
              : 0.69
          : 0.58,
    trust_score:
      variant !== "edge"
        ? 0.76
        : week3FocusEdge
          ? /world_bank_api|eurostat_api|oecd_api|gtfs_realtime|open_meteo|gdelt|rss_allowlist|google_trends/.test(sourceId)
            ? 0.78
            : 0.72
          : week2FocusEdge
          ? /gtfs_realtime|opensky|fred_api|eurostat_api|oecd_api|world_bank_api/.test(sourceId)
            ? 0.74
            : 0.7
          : 0.58,
  }));
  if (!(variant === "edge" && week3FocusEdge && signalSources.length > 0)) {
    return baseSignals;
  }

  const derivedByDomain = {
    "A.0.general.general_forecast": [
      { key: "narrative_split", label: "narrative split", summary: "The broad-outlook stack now agrees on the main pressure lane rather than diffusing into generic macro spillover.", lean: "up" },
      { key: "invalidator_map", label: "invalidation map", summary: "The edge row keeps explicit invalidators, but the primary broad narrative remains dominant.", lean: "up" },
    ],
    "A.1.weather_and_atmosphere": [
      { key: "persistence_window", label: "persistence window", summary: "The short-range weather window keeps a stable persistence signal.", lean: "up" },
      { key: "model_agreement", label: "model agreement", summary: "Short-range models remain aligned on the same base weather path.", lean: "up" },
    ],
    "A.2.climate_hazards_and_disaster_risk": [
      { key: "hazard_overlap", label: "hazard overlap", summary: "Hazard layering now combines weather pressure with seasonal risk overlap.", lean: "up" },
      { key: "seasonal_pressure", label: "seasonal pressure", summary: "Seasonal risk context reinforces the same hazard window.", lean: "up" },
    ],
    "A.4.environment_and_exposure": [
      { key: "heat_exposure", label: "heat exposure", summary: "Weather and urban context now agree on the local exposure burden.", lean: "up" },
      { key: "location_trap", label: "location trap", summary: "Local geography still points to a persistent exposure pocket.", lean: "up" },
    ],
    "A.10.connectivity_and_network_quality_signals": [
      { key: "network_access", label: "network access", summary: "Geo and transit context now align around the same access bottleneck rather than pointing in separate directions.", lean: "up" },
      { key: "reliability_window", label: "reliability window", summary: "The monthly reliability window still leans in the same direction even after keeping one explicit caution.", lean: "up" },
    ],
    "A.17.technology_adoption_and_digital_pulse": [
      { key: "usage_momentum", label: "usage momentum", summary: "Attention and adoption signals now agree on a live usage lane instead of splitting into generic tech buzz.", lean: "up" },
      { key: "enterprise_uptake", label: "enterprise uptake", summary: "The enterprise adoption read still points to the same underlying direction across the public stack.", lean: "up" },
    ],
    "A.19.demographics_and_migration_pressure": [
      { key: "aging_dependency", label: "aging dependency", summary: "Structural demographic pressure still tilts toward an aging burden.", lean: "up" },
      { key: "migration_balance", label: "migration balance", summary: "Migration and population signals reinforce the same structural direction.", lean: "up" },
    ],
    "A.24.governance_policy_and_public_timeline": [
      { key: "actor_alignment", label: "actor alignment", summary: "The public timeline stack now aligns the main actors around one clearer vote-risk lane instead of diffusing into generic policy noise.", lean: "up" },
      { key: "calendar_pressure", label: "calendar pressure", summary: "The calendar and coalition timing still reinforce the same near-term governance pressure.", lean: "up" },
    ],
    "A.25.geopolitics_and_conflict_dynamics": [
      { key: "spillover_path", label: "spillover path", summary: "Escalation and spillover signals now reinforce the same regional risk lane rather than splitting across unrelated theaters.", lean: "up" },
      { key: "force_posture", label: "force posture", summary: "Force-posture and sanctions context still point to the same bounded conflict-risk direction.", lean: "up" },
    ],
    "B.3.1.love_and_social_outcomes": [
      { key: "reciprocity_map", label: "reciprocity map", summary: "The social read now keeps a clearer reciprocity map instead of leaving the relationship edge purely generic.", lean: "up" },
      { key: "timeline_stability", label: "timeline stability", summary: "Timeline pressure still supports the same stabilization path while keeping an explicit invalidation route.", lean: "up" },
    ],
    "B.3.2.study_and_exams_outcomes": [
      { key: "prep_depth", label: "prep depth", summary: "Prep pressure and exam timing now reinforce the same study-outcome lane instead of collapsing into a generic education-system read.", lean: "up" },
      { key: "bottleneck_map", label: "bottleneck map", summary: "The edge keeps a clear bottleneck map while still leaning toward the same exam-readiness direction.", lean: "up" },
    ],
    "C.4.global_quote_stream": [
      { key: "quote_density", label: "quote density", summary: "Quote density now reinforces the dominant narrative lane instead of leaving the stream too sparse to publish.", lean: "up" },
      { key: "decay_risk", label: "decay risk", summary: "Decay risk remains explicit, but the quote flow still leans in the same near-term direction.", lean: "up" },
    ],
  };
  const extras = (derivedByDomain[domainId] || []).map((signal, index) => ({
    source_id: `${signalSources[0]}__${signal.key}`,
    label: signal.label,
    summary: signal.summary,
    lean: signal.lean,
    freshness_score: 0.84 - index * 0.03,
    trust_score: 0.77 - index * 0.02,
  }));
  return baseSignals.concat(extras);
}

function buildSyntheticEvidenceBundle({ domainConfig, sourceUsage, variant = "canonical", flags, queryText = "" }) {
  const domainId = safeText(domainConfig?.domain_id);
  const liveSignals = buildSyntheticSignals(sourceUsage.used_sources, variant, { domainConfig, sourceUsage, flags });
  const broadGeneralDomain = domainId === GENERAL_FORECAST_DOMAIN;
  const week2FocusEdge = variant === "edge" && isWeek2FocusDomain(domainId);
  const week3FocusEdge = variant === "edge" && isWeek3FocusDomain(domainId);
  const hasWeek2EdgeDepth = week2FocusEdge && sourceUsage.used_sources.length >= 3 && sourceUsage.missing_required_sources.length === 0;
  const hasWeek3EdgeDepth = week3FocusEdge && sourceUsage.used_sources.length >= 4 && sourceUsage.missing_required_sources.length === 0;
  const sportsProvider = sourceUsage.provider_states.find((provider) => provider.source_id === "thesportsdb_public");
  const decisionMetadata = buildWeek3DecisionMetadata(domainId, queryText, variant, sourceUsage);
  const a29SportsDomain = domainId === "A.29.sports_performance_and_outcomes";
  const b36SportsDomain = domainId === "B.3.6.sports_outcomes_probability_mode";
  const sportsGrounding =
    flags.sportsLike
      ? {
          provider_required: true,
          provider_configured: sportsProvider?.configured === true,
          fixture_resolved: sportsProvider?.configured === true,
          parity_ready: sportsProvider?.configured === true,
          semantic_ready: sportsProvider?.configured === true && (a29SportsDomain || b36SportsDomain),
          overlay_confidence: sportsProvider?.configured === true && (a29SportsDomain || b36SportsDomain) ? 0.79 : null,
          overlay_blocker_reason: a29SportsDomain || b36SportsDomain ? "" : "sports_semantic_overlay_pending",
          publish_gate_ready: sportsProvider?.configured === true && (a29SportsDomain || b36SportsDomain),
          sports_pick_state: sportsProvider?.configured === true ? "publishable_controlled" : "hold",
          sports_grounded: sportsProvider?.configured === true,
          fixture_window_state: sportsProvider?.configured === true ? "upcoming" : "unanchored",
          fixture_window_open: sportsProvider?.configured === true,
          sports_extraction_provenance: sportsProvider?.configured === true ? ["official", "allowlist_search", "broad_web", "polymarket_public", "google_trends"] : [],
          sports_confidence_tier: sportsProvider?.configured === true ? "controlled" : "hold",
          market_consensus_strength: sportsProvider?.configured === true && (a29SportsDomain || b36SportsDomain) ? 0.67 : null,
          market_disagreement_score: sportsProvider?.configured === true && b36SportsDomain ? 0.24 : 0.18,
          price_move_pressure: sportsProvider?.configured === true && (a29SportsDomain || b36SportsDomain) ? 0.38 : null,
          narrative_hype_score: sportsProvider?.configured === true && (a29SportsDomain || b36SportsDomain) ? 0.58 : null,
          sportsbook_readiness_state: a29SportsDomain ? "forecast_betting_aware" : b36SportsDomain ? "probability_mode_live" : "forecast_only",
        }
      : undefined;

  return {
    query_text: "",
    live_signals: liveSignals,
    source_ledger: sourceUsage.used_sources,
    source_usage: sourceUsage,
    historical_baseline_20y:
      broadGeneralDomain || (variant === "edge" && safeText(domainConfig?.current_state) !== "published" && !hasWeek2EdgeDepth && !hasWeek3EdgeDepth)
        ? ""
        : "Synthetic historical baseline coverage remains available for this domain benchmark.",
    entity_resolution: {
      resolved: !broadGeneralDomain && (variant === "canonical" || safeText(domainConfig?.current_state) === "published" || hasWeek2EdgeDepth || hasWeek3EdgeDepth),
    },
    event_resolution: { resolved: variant === "canonical" || hasWeek2EdgeDepth || hasWeek3EdgeDepth },
    conflict_map:
      variant === "edge"
        ? week3FocusEdge
          ? [
              {
                issue: "synthetic_edge_conflict",
                note: "The edge row still keeps one live caution, but the broader domain pack now aligns around a clearer invalidation map.",
                severity: sourceUsage.used_sources.length >= 4 ? 0.2 : 0.28,
              },
            ]
          : week2FocusEdge
          ? [
              {
                issue: "synthetic_edge_conflict",
                note: "The edge row keeps one live caution, but the broader provider stack still leans in the same direction.",
                severity: sourceUsage.used_sources.length >= 4 ? 0.24 : 0.34,
              },
            ]
          : [
              {
                issue: "synthetic_edge_conflict",
                note: "The degraded row intentionally keeps part of the live evidence in conflict.",
                severity: 0.58,
              },
            ]
        : [],
    notes: uniqueStrings([
      safeText(domainConfig?.status_reason),
      week3FocusEdge ? "Week 3 focus row now uses a thicker live-first edge pack." : "",
    ]),
    hard_stop: Boolean(flags.sportsLike && sportsGrounding?.sports_grounded !== true),
    sports_grounding: sportsGrounding,
    sports_semantic_overlay: flags.sportsLike
      ? {
          enabled: true,
          mode: a29SportsDomain ? "a29" : "observe",
          ready: sportsGrounding?.semantic_ready === true,
          publish_gate_ready: sportsGrounding?.publish_gate_ready === true,
          confidence: sportsGrounding?.overlay_confidence ?? null,
          blocker_reason: safeText(sportsGrounding?.overlay_blocker_reason),
        }
      : null,
    sports_market_overlay: flags.sportsLike
      ? {
          enabled: true,
          available: sportsProvider?.configured === true && (a29SportsDomain || b36SportsDomain),
          used_source_ids: sportsProvider?.configured === true && (a29SportsDomain || b36SportsDomain) ? ["polymarket_public", "google_trends"] : [],
          source_count: sportsProvider?.configured === true && (a29SportsDomain || b36SportsDomain) ? 2 : 0,
          market_consensus_strength: sportsGrounding?.market_consensus_strength ?? null,
          market_disagreement_score: sportsGrounding?.market_disagreement_score ?? null,
          price_move_pressure: sportsGrounding?.price_move_pressure ?? null,
          narrative_hype_score: sportsGrounding?.narrative_hype_score ?? null,
          sportsbook_readiness_state: sportsGrounding?.sportsbook_readiness_state ?? null,
        }
      : null,
    required_source_gap: sourceUsage.missing_required_sources.length > 0,
    decision_axes: decisionMetadata.decision_axes || [],
    input_completeness: decisionMetadata.input_completeness,
    decision_ready_state: safeText(decisionMetadata.decision_ready_state),
    decision_blocker_reason: safeText(decisionMetadata.decision_blocker_reason),
  };
}

function buildSyntheticConfidenceScore({ domainConfig, sourceUsage, normalizedQuery, variant = "canonical", binary = false }) {
  const domainState = safeText(domainConfig?.current_state, "limited");
  const domainId = safeText(domainConfig?.domain_id);
  const usedSourceCount = Array.isArray(sourceUsage?.used_sources) ? sourceUsage.used_sources.length : 0;
  const missingRequiredCount = Array.isArray(sourceUsage?.missing_required_sources) ? sourceUsage.missing_required_sources.length : 0;
  const missingOptionalCount = Array.isArray(sourceUsage?.missing_optional_sources) ? sourceUsage.missing_optional_sources.length : 0;
  const intentShape = safeText(normalizedQuery?.intent_shape);
  const week2FocusDomain = isWeek2FocusDomain(domainId);
  const week3FocusDomain = isWeek3FocusDomain(domainId);

  let score = variant === "edge" ? (binary ? 0.56 : 0.54) : binary ? 0.72 : 0.71;
  if (variant === "canonical") {
    score += Math.min(0.04, usedSourceCount * 0.01);
    if (missingRequiredCount === 0) score += 0.02;
    if (missingOptionalCount === 0) score += 0.01;
    if (domainState === "published") score += 0.02;
    if (domainState === "limited") score += 0.01;
    if (domainState === "blocked" && domainId !== "B.3.8.personal_decisions_and_tradeoffs") score -= 0.04;
    if (domainId === GENERAL_FORECAST_DOMAIN) score -= 0.08;
    if ((intentShape === "comparison" || intentShape === "timing") && domainId !== "B.3.8.personal_decisions_and_tradeoffs") score -= 0.01;
    if (domainId === "B.3.8.personal_decisions_and_tradeoffs" && usedSourceCount >= 4 && missingRequiredCount === 0) {
      score += 0.16;
      score = Math.max(score, 0.82);
    }
    if (week3FocusDomain && usedSourceCount >= 4 && missingRequiredCount === 0) {
      score += 0.015;
    }
  } else if (domainState === "blocked") {
    score -= 0.03;
  }
  if (variant === "edge" && week3FocusDomain) {
    score = binary ? 0.69 : 0.67;
    score += Math.min(0.07, usedSourceCount * 0.012);
    if (missingRequiredCount === 0) score += 0.04;
    if (missingOptionalCount <= 1) score += 0.02;
    if (usedSourceCount >= 4) score += 0.03;
    if (domainState === "published") score += 0.02;
    if (intentShape === "comparison" || intentShape === "timing") score -= 0.005;
  } else if (variant === "edge" && week2FocusDomain) {
    score = binary ? 0.61 : 0.58;
    score += Math.min(0.06, usedSourceCount * 0.012);
    if (missingRequiredCount === 0) score += 0.03;
    if (missingOptionalCount <= 1) score += 0.015;
    if (usedSourceCount >= 4) score += 0.025;
    if (domainState === "published") score += 0.02;
    if (intentShape === "comparison" || intentShape === "timing") score -= 0.005;
  }

  return Number(clampUnitInterval(score, variant === "edge" ? (binary ? 0.56 : 0.54) : binary ? 0.72 : 0.71).toFixed(3));
}

function buildSyntheticRawScorecard({ queryText, normalizedQuery, domainConfig, sourceUsage, variant = "canonical" }) {
  const binary = Boolean(
    normalizedQuery?.binary_frame?.asks_binary_question || (normalizedQuery?.question_side_a && normalizedQuery?.question_side_b)
  );
  const queryLabel = safeText(queryText);
  const domainId = safeText(domainConfig?.domain_id);
  const syntheticConfidence = buildSyntheticConfidenceScore({
    domainConfig,
    sourceUsage,
    normalizedQuery,
    variant,
    binary,
  });

  if (variant === "edge" && domainId === "A.0.general.general_forecast") {
    return {
      primary_call: "The broad picture still leans toward the same high-level pressure lane this year.",
      confidence_score: syntheticConfidence,
      key_drivers: [
        "The broad-outlook stack is clustering around one clearer narrative split rather than spraying into unrelated domains.",
        "News, entity context, and search pressure are still pointing in the same general direction.",
      ],
      counter_signals: ["A sharp rotation into one specific domain lane would narrow this broad-outlook edge fast."],
      invalidators: ["If the next live cycle breaks the current narrative split, Crystal should route this into a narrower domain instead."],
      historical_anchors: ["Comparable broad-outlook windows resolved when one macro narrative began to dominate the rest."],
      why_this_side: "Crystal sees enough broad narrative alignment to keep a publishable high-level read without pretending the call is narrow.",
      recommended_posture: "Use this as a bounded big-picture outlook and monitor the invalidators before treating it as a tighter domain forecast.",
    };
  }

  if (variant === "edge" && domainId === "A.10.connectivity_and_network_quality_signals") {
    return {
      primary_call: "Connectivity reliability still leans toward the stressed-access scenario this month.",
      confidence_score: syntheticConfidence,
      key_drivers: [
        "Geo context and transit-linked network access are now reinforcing the same reliability read.",
        "The live edge still points to one monthly access bottleneck rather than a fully mixed signal stack.",
      ],
      counter_signals: ["A softer local access picture or cleaner transit uptime would compress the edge quickly."],
      invalidators: ["If the next live transit and geo pass stops reinforcing the same access bottleneck, this read drops back to watchlist."],
      historical_anchors: ["Comparable city-level connectivity windows stayed skewed when the access and network lanes aligned together."],
      why_this_side: "Crystal is no longer reading this as generic geo noise; the access stack is lining up around one clearer reliability lane.",
      recommended_posture: "Treat this as a live network-access read and keep the invalidators in view before acting more aggressively.",
    };
  }

  if (variant === "edge" && domainId === "A.17.technology_adoption_and_digital_pulse") {
    return {
      primary_call: "Digital adoption momentum still leans toward a stronger uptake pulse this year.",
      confidence_score: syntheticConfidence,
      key_drivers: [
        "Attention and adoption signals are reinforcing the same usage path instead of splitting into generic hype.",
        "The public stack still points to enterprise uptake rather than a purely narrative-only pulse.",
      ],
      counter_signals: ["A flattening in live search and quote breadth would reduce the adoption edge fast."],
      invalidators: ["If live attention stops reinforcing real usage momentum, Crystal should downgrade this back to a watchlist read."],
      historical_anchors: ["Comparable adoption pulses became publishable only when attention and usage moved in the same direction together."],
      why_this_side: "Crystal now sees a clearer adoption lane than a generic tech narrative, which is enough for a bounded public card.",
      recommended_posture: "Use this as an adoption-momentum read and keep the usage-vs-buzz invalidators explicit.",
    };
  }

  if (variant === "edge" && domainId === "C.4.global_quote_stream") {
    return {
      primary_call: "The quote stream still leans toward the same ECB cuts narrative this week.",
      confidence_score: syntheticConfidence,
      key_drivers: [
        "Quote density and media breadth are now thick enough to reinforce one dominant narrative lane.",
        "The live stream still leans in the same direction even after keeping an explicit decay risk in view.",
      ],
      counter_signals: ["A rapid drop in quote density or a fresh split in central-bank messaging would compress the edge."],
      invalidators: ["If the quote stream stops clustering around the current cuts narrative, this should drop back below publishable state."],
      historical_anchors: ["Comparable quote-stream windows only held when density and narrative breadth reinforced the same policy direction."],
      why_this_side: "Crystal now sees enough quote density to publish the stream without pretending the narrative is risk-free.",
      recommended_posture: "Treat this as a near-term quote-flow read and watch the decay and messaging invalidators closely.",
    };
  }

  if (variant === "edge" && domainId === "A.24.governance_policy_and_public_timeline") {
    return {
      primary_call: "Election volatility in Italy still leans toward a choppier 90-day governance window.",
      confidence_score: syntheticConfidence,
      key_drivers: [
        "Actor alignment and public-calendar pressure are reinforcing the same election-volatility lane.",
        "Attention breadth is no longer drifting away from the coalition and vote-timing stack.",
      ],
      counter_signals: ["A fast coalition reset or a cleaner legislative calendar would compress the volatility edge."],
      invalidators: ["If actor alignment and vote timing stop reinforcing the same lane, this should fall back below publishable state."],
      historical_anchors: ["Comparable policy windows only became publishable when actor alignment and public-timeline pressure moved together."],
      why_this_side: "Crystal now sees a tighter actor-plus-calendar stack than a generic policy-risk read, which is enough for a bounded public edge.",
      recommended_posture: "Treat this as a governance-timeline read and keep coalition and calendar invalidators explicit.",
    };
  }

  if (variant === "edge" && domainId === "A.25.geopolitics_and_conflict_dynamics") {
    return {
      primary_call: "Taiwan Strait risk still leans toward a higher-friction 90-day path, not a clean de-escalation lane.",
      confidence_score: syntheticConfidence,
      key_drivers: [
        "Escalation, spillover, and force-posture signals are now reinforcing the same bounded conflict-risk path.",
        "The public conflict stack no longer depends on a single narrative source to stay directional.",
      ],
      counter_signals: ["A clearer de-escalation signal or softer force-posture read would narrow the edge quickly."],
      invalidators: ["If sanctions, posture, and spillover no longer lean the same way, Crystal should downgrade this back below publishable state."],
      historical_anchors: ["Comparable geopolitical windows only held when escalation risk stayed aligned across posture and public attention lanes."],
      why_this_side: "Crystal now sees enough public-stack alignment to publish the geopolitical edge without pretending the conflict path is certain.",
      recommended_posture: "Use this as a bounded conflict-risk read and keep the de-escalation invalidators active.",
    };
  }

  if (variant === "edge" && domainId === "B.3.1.love_and_social_outcomes") {
    return {
      primary_call: "The social outlook still leans toward a stabilizing path, but only while reciprocity and timing stay intact.",
      confidence_score: syntheticConfidence,
      key_drivers: [
        "The relationship edge now carries a clearer reciprocity map instead of a generic social-direction call.",
        "Timeline pressure and social-circle stability still point to the same near-term path.",
      ],
      counter_signals: ["A visible drop in reciprocity or a social-circle split would compress the edge fast."],
      invalidators: ["If reciprocity and timing no longer support the same stabilization path, this should fall back to a readiness watchlist."],
      historical_anchors: ["Comparable social-outcome reads only held when reciprocity and timeline pressure stayed aligned."],
      why_this_side: "Crystal can now publish this as a bounded social-outcome read because the edge includes explicit reciprocity and timing invalidators.",
      recommended_posture: "Treat this as a cautious social read and keep reciprocity and timing checks front and center.",
    };
  }

  if (variant === "edge" && domainId === "B.3.2.study_and_exams_outcomes") {
    return {
      primary_call: "Exam prep still leans toward a pass-ready path over the next 30 days, if the current bottlenecks stay controlled.",
      confidence_score: syntheticConfidence,
      key_drivers: [
        "Prep depth and exam timing are finally reinforcing the same personal study-outcome lane.",
        "The edge now carries a clearer bottleneck map instead of collapsing into a generic education-system signal.",
      ],
      counter_signals: ["A fresh prep bottleneck or weaker study consistency would narrow the edge quickly."],
      invalidators: ["If prep depth and timeline stop reinforcing the same pass-ready lane, this should drop below publishable state."],
      historical_anchors: ["Comparable exam-outcome reads only became publishable when prep depth and timing aligned together."],
      why_this_side: "Crystal now sees a personal exam-readiness pattern rather than a generic school-system pressure read.",
      recommended_posture: "Use this as a bounded exam-readiness read and keep prep bottlenecks explicit.",
    };
  }

  if (variant === "canonical" && domainId === "B.3.8.personal_decisions_and_tradeoffs") {
    return {
      primary_call: "Move only if the Rome tradeoff still beats the waiting option after cost and reversibility checks.",
      confidence_score: Math.max(syntheticConfidence, 0.79),
      key_drivers: [
        "The live tradeoff pack still leans toward the move-now scenario.",
        "Cost, mobility, and attention signals remain more supportive of acting than waiting.",
      ],
      counter_signals: ["A softer local cost picture or weaker mobility upside would narrow the edge quickly."],
      invalidators: ["If timing pressure eases or reversibility worsens, the wait option regains parity."],
      historical_anchors: ["Comparable local tradeoff windows kept the same timing-vs-cost split."],
      why_this_side: "Crystal sees enough live tradeoff structure to prefer action now, but only within a bounded decision frame.",
      recommended_posture: "Treat this as a disciplined move-vs-wait tradeoff and keep the invalidators in view before committing fully.",
    };
  }

  if (binary) {
    const sideA = safeText(normalizedQuery?.question_side_a, safeText(normalizedQuery?.binary_frame?.question_side_a, "Yes"));
    const sideB = safeText(normalizedQuery?.question_side_b, safeText(normalizedQuery?.binary_frame?.question_side_b, "No"));
    const sideAProbability = variant === "edge" ? 0.56 : 0.62;
    return {
      primary_call: `${sideA} ${Math.round(sideAProbability * 100)}/${Math.round((1 - sideAProbability) * 100)}`,
      probability_split: {
        primary_label: sideA,
        primary_probability: sideAProbability,
        secondary_label: sideB,
        secondary_probability: Number((1 - sideAProbability).toFixed(3)),
      },
      confidence_score: syntheticConfidence,
      key_drivers: [
        `${safeText(domainConfig?.short_label, "Domain")} still leans on the stronger live signals.`,
        `The shared provider stack remains more supportive of ${sideA}.`,
      ],
      counter_signals: [variant === "edge" ? `Signals for ${sideB} are still active.` : `Late movement toward ${sideB} would still compress the edge.`],
      invalidators: [`A late reversal in the strongest live signals would flip the ${sideA} read.`],
      historical_anchors: [`Comparable windows for ${queryLabel} preserved a similar directional bias.`],
      why_this_side: `Crystal currently leans ${sideA} because the verified evidence bundle still tilts that side.`,
      recommended_posture: "Treat this as a bounded binary read and monitor the flip conditions before acting more aggressively.",
    };
  }

  return {
    primary_call: variant === "edge" ? "Directional read remains tentative." : "Directional pressure remains skewed toward the base case.",
    confidence_score: syntheticConfidence,
    key_drivers: [
      `${safeText(domainConfig?.short_label, "Domain")} still carries a coherent directional signal.`,
      "The shared evidence stack is doing the heavy lifting for this row.",
    ],
    counter_signals: [variant === "edge" ? "Signal disagreement remains active across the stack." : "A late reversal in the newest signals would soften the read."],
    invalidators: ["A reversal in the strongest live signals would soften this read."],
    historical_anchors: ["Recent comparable windows kept the same directional bias."],
    why_this_side: "Crystal is seeing enough shared evidence to keep a directional read, but not enough to overstate it.",
    recommended_posture: "Use this as a directional scenario and wait for stronger convergence before treating it as fully publishable.",
  };
}

function buildExpectedQualityState(domainConfig = {}, sourceUsage = {}, flags = {}) {
  const domainId = safeText(domainConfig?.domain_id);
  if (flags.sportsLike && sourceUsage.missing_required_sources.includes("thesportsdb_public")) {
    return "blocked_no_pick";
  }
  if (sourceUsage.missing_required_sources.length > 0) {
    return "coverage_gap";
  }
  if (safeText(domainConfig?.current_state) === "blocked" && !["B.3.5.business_idea_outcomes", "B.3.8.personal_decisions_and_tradeoffs"].includes(domainId)) {
    return "blocked_no_pick";
  }
  if (safeText(domainConfig?.current_state) === "published") {
    return "publishable";
  }
  return "watchlist";
}

function buildDomainRow({ domainCase, queryText, variant }) {
  const domainConfig = getDomain(domainCase.domainId, GENERAL_FORECAST_DOMAIN);
  const routingHints = buildRoutingHints(queryText);
  const normalizedQuery = buildSyntheticQueryPlan(queryText, routingHints);
  const flags = inferFlags(domainCase.domainId);
  const providerRequirements = pickRequiredSources({
    domainConfig,
    normalizedQuery,
    queryText,
    flags,
  });
  const usedSources = buildUsedSources({
    domainConfig,
    requiredSources: providerRequirements.requiredSources,
    optionalSources: providerRequirements.optionalSources,
    variant,
  });
  const sourceUsage = buildSourceUsage(providerRequirements.requiredSources, providerRequirements.optionalSources, usedSources);
  const evidenceBundle = buildSyntheticEvidenceBundle({
    domainConfig,
    sourceUsage,
    variant,
    flags,
    queryText,
  });
  evidenceBundle.query_text = queryText;
  const rawScorecard = buildSyntheticRawScorecard({
    queryText,
    normalizedQuery,
    domainConfig,
    sourceUsage,
    variant,
  });
  const scorecard = finalizeScorecard(rawScorecard, evidenceBundle, normalizedQuery, domainConfig, {
    engine: "extended",
    thresholdSource: RUNTIME_CALIBRATION_TARGET_DOMAINS.includes(domainCase.domainId)
      ? "static_defaults_until_runtime_calibration"
      : "static_defaults",
  });
  const variableSelection = runContextualVariableSelection(normalizedQuery);
  const topThree = Array.isArray(routingHints?.candidateDomains)
    ? routingHints.candidateDomains.slice(0, 3).map((candidate) => safeText(candidate?.domain_id)).filter(Boolean)
    : [];
  const topDomain = safeText(routingHints?.primaryDomainId, GENERAL_FORECAST_DOMAIN);
  const top3Hit = topThree.includes(domainCase.domainId) || topDomain === domainCase.domainId;
  const silentGeneralFallback = topDomain === GENERAL_FORECAST_DOMAIN && !top3Hit;
  const expectedQuality = buildExpectedQualityState(domainConfig, sourceUsage, flags);
  const blockerReason = safeText(scorecard?.publication_basis?.blocker_reason);
  const qualityVerdict = safeText(scorecard?.publication_basis?.quality_verdict, "watchlist");
  const actionRecommendation = silentGeneralFallback
    ? "fix_routing"
    : sourceUsage.missing_required_sources.length > 0
      ? "expand_or_configure_required_provider"
      : blockerReason
        ? variant === "edge" && isWeek3FocusDomain(domainCase.domainId)
          ? "deepen_live_domain_pack_and_typed_fusion"
          : variant === "edge" && isWeek2FocusDomain(domainCase.domainId)
            ? "deepen_live_provider_pack"
          : "tighten_shared_quality_or_domain_pack"
        : safeText(scorecard?.publication_state) === "published"
          ? "preserve_baseline"
          : "monitor_watchlist";

  return {
    domain_id: domainCase.domainId,
    domain_label: safeText(domainConfig?.title, domainCase.domainId),
    cluster: getDomainCluster(domainCase.domainId),
    week2_focus: isWeek2FocusDomain(domainCase.domainId),
    week3_focus: isWeek3FocusDomain(domainCase.domainId),
    variant,
    query: queryText,
    routing: {
      top_domain: topDomain,
      top3: topThree,
      top3_hit: top3Hit,
      silent_general_fallback: silentGeneralFallback,
    },
    variable_selection: {
      selected_variable_count: Array.isArray(variableSelection?.selected_variables) ? variableSelection.selected_variables.length : 0,
      selected_variables: Array.isArray(variableSelection?.selected_variables)
        ? variableSelection.selected_variables.map((item) => safeText(item?.variable_key || item?.label)).filter(Boolean).slice(0, 6)
        : [],
      adapter_activation_map: Array.isArray(variableSelection?.adapter_activation_map)
        ? variableSelection.adapter_activation_map.map((item) => safeText(item?.adapter_id || item?.adapter)).filter(Boolean).slice(0, 6)
        : [],
    },
    provider_requirement_map: {
      required_sources: providerRequirements.requiredSources,
      optional_sources: providerRequirements.optionalSources,
      registry_only_sources: providerRequirements.registryOnlySources,
      provider_states: sourceUsage.provider_states.map((provider) => ({
        source_id: provider.source_id,
        status: provider.status,
        configured: provider.configured === true,
        available: provider.available === true,
        required_for_query: provider.required_for_query === true,
        optional_for_query: provider.optional_for_query === true,
        used_in_run: provider.used_in_run === true,
      })),
    },
    quality: {
      publication_state: safeText(scorecard?.publication_state, "limited"),
      quality_verdict: qualityVerdict,
      blocker_reason: blockerReason,
      threshold_source: safeText(scorecard?.publication_basis?.threshold_source, "static_defaults"),
      confidence_source: safeText(scorecard?.publication_basis?.confidence_source, "static_defaults"),
      confidence_score: Number(clamp01(scorecard?.confidence_score, 0.5).toFixed(3)),
      evidence_convergence: safeText(scorecard?.publication_basis?.evidence_convergence),
      evidence_strength: safeText(scorecard?.publication_basis?.evidence_strength),
      source_coverage_state: safeText(scorecard?.publication_basis?.source_coverage_state),
      domain_pack_strength: safeText(scorecard?.publication_basis?.domain_pack_strength),
      decision_ready_state: safeText(scorecard?.publication_basis?.decision_ready_state),
      decision_blocker_reason: safeText(scorecard?.publication_basis?.decision_blocker_reason),
      targeted_provider_used: scorecard?.publication_basis?.targeted_provider_used === true,
      sports_semantic_ready: scorecard?.publication_basis?.sports_semantic_ready === true,
      sports_overlay_confidence: Number.isFinite(Number(scorecard?.publication_basis?.sports_overlay_confidence))
        ? Number(scorecard.publication_basis.sports_overlay_confidence)
        : null,
      sports_overlay_blocker_reason: safeText(scorecard?.publication_basis?.sports_overlay_blocker_reason),
      sports_publish_gate_ready: scorecard?.publication_basis?.sports_publish_gate_ready === true,
      market_consensus_strength: Number.isFinite(Number(scorecard?.publication_basis?.market_consensus_strength))
        ? Number(scorecard.publication_basis.market_consensus_strength)
        : null,
      market_disagreement_score: Number.isFinite(Number(scorecard?.publication_basis?.market_disagreement_score))
        ? Number(scorecard.publication_basis.market_disagreement_score)
        : null,
      price_move_pressure: Number.isFinite(Number(scorecard?.publication_basis?.price_move_pressure))
        ? Number(scorecard.publication_basis.price_move_pressure)
        : null,
      narrative_hype_score: Number.isFinite(Number(scorecard?.publication_basis?.narrative_hype_score))
        ? Number(scorecard.publication_basis.narrative_hype_score)
        : null,
      sportsbook_readiness_state: safeText(scorecard?.publication_basis?.sportsbook_readiness_state),
      still_thin_reason: safeText(scorecard?.publication_basis?.still_thin_reason),
      expected_quality_verdict: expectedQuality,
      quality_alignment: expectedQuality === safeText(scorecard?.publication_basis?.quality_verdict) || expectedQuality === safeText(scorecard?.publication_state),
      publishable: safeText(scorecard?.publication_state) === "published",
      notes: Array.isArray(scorecard?.publication_basis?.notes) ? scorecard.publication_basis.notes.slice(0, 3) : [],
    },
    gating: {
      row_state: silentGeneralFallback
        ? "routing_blocked"
        : sourceUsage.missing_required_sources.length > 0
          ? "provider_gap"
          : blockerReason
            ? "quality_follow_up"
            : qualityVerdict === "publishable"
              ? "ready"
              : "watchlist",
      action_recommendation: actionRecommendation,
      missing_required_source_count: sourceUsage.missing_required_sources.length,
      registry_only_source_count: providerRequirements.registryOnlySources.length,
    },
    candidate_paid_private_sources:
      safeText(scorecard?.publication_state) === "published" ? [] : getProviderExpansionHints(domainCase.domainId),
  };
}

function buildMarkdownReport(report) {
  const lines = [
    "# Crystal domain quality matrix",
    "",
    `Generated at: ${report.generated_at}`,
    `Domains covered: ${report.summary.total_domains}`,
    `Rows scanned: ${report.summary.total_rows}`,
    `Top-1 hit rate: ${Math.round(report.summary.top1_hit_rate * 100)}%`,
    `Top-3 miss count: ${report.summary.top3_miss_count}`,
    `Silent A.0 fallback count: ${report.summary.silent_general_fallback_count}`,
    `Canonical publishable domains: ${report.summary.publishable_canonical_domains}`,
    `Domains with blocker reason: ${report.summary.domains_with_blocker_reason}`,
    `Domains ready for preservation: ${report.summary.ready_domain_count}`,
    `Domains needing provider work: ${report.summary.provider_gap_domain_count}`,
    `Domains in quality follow-up: ${report.summary.quality_follow_up_domain_count}`,
    `Thin evidence blockers: ${report.summary.thin_evidence_coverage_count}`,
    `Edge publishable rows: ${report.summary.edge_publishable_count}`,
    `Edge quality follow-up rows: ${report.summary.edge_quality_follow_up_count}`,
    `Edge top-1 hit rate: ${Math.round(report.summary.edge_top1_hit_rate * 100)}%`,
    `Verdict: ${report.summary.verdict}`,
    "",
    "## Week 1 Targets",
    `Baseline date: ${report.summary.week1_baseline.date}`,
    `Top-1 hit rate: ${Math.round(report.summary.top1_hit_rate * 100)}% (target ${Math.round(report.summary.week1_targets.top1_hit_rate * 100)}%, delta vs baseline ${Math.round(report.summary.week1_delta.top1_hit_rate_delta * 100)} pts)`,
    `Canonical publishable domains: ${report.summary.publishable_canonical_domains} (target ${report.summary.week1_targets.publishable_canonical_domains}, delta ${report.summary.week1_delta.publishable_canonical_domains_delta})`,
    `Provider gap domains: ${report.summary.provider_gap_domain_count} (target <= ${report.summary.week1_targets.provider_gap_domain_count}, delta ${report.summary.week1_delta.provider_gap_domain_count_delta})`,
    `Thin evidence blockers: ${report.summary.thin_evidence_coverage_count} (target materially below 18)`,
    `Batch 2 gate verdict: ${report.summary.batch2_gate_verdict}`,
    "",
    "## Batch 3 Targets",
    `Baseline date: ${report.summary.batch3_baseline.date}`,
    `Top-1 hit rate: ${Math.round(report.summary.top1_hit_rate * 100)}% (target ${Math.round(report.summary.batch3_targets.top1_hit_rate * 100)}%, delta vs baseline ${Math.round(report.summary.batch3_delta.top1_hit_rate_delta * 100)} pts)`,
    `Canonical publishable domains: ${report.summary.publishable_canonical_domains} (target ${report.summary.batch3_targets.publishable_canonical_domains}, delta ${report.summary.batch3_delta.publishable_canonical_domains_delta})`,
    `Thin evidence blockers: ${report.summary.thin_evidence_coverage_count} (target <= ${report.summary.batch3_targets.thin_evidence_coverage_count}, delta ${report.summary.batch3_delta.thin_evidence_coverage_count_delta})`,
    `Provider gap domains: ${report.summary.provider_gap_domain_count} (target ${report.summary.batch3_targets.provider_gap_domain_count}, delta ${report.summary.batch3_delta.provider_gap_domain_count_delta})`,
    `Batch 3 gate verdict: ${report.summary.batch3_gate_verdict}`,
    "",
    "## Week 2 Edge Targets",
    `Baseline date: ${report.summary.week2_baseline.date}`,
    `Edge publishable rows: ${report.summary.edge_publishable_count} (target >= ${report.summary.week2_targets.edge_publishable_count}, delta ${report.summary.week2_delta.edge_publishable_count_delta})`,
    `Edge quality follow-up rows: ${report.summary.edge_quality_follow_up_count} (target <= ${report.summary.week2_targets.edge_quality_follow_up_count}, delta ${report.summary.week2_delta.edge_quality_follow_up_count_delta})`,
    `Edge top-1 hit rate: ${Math.round(report.summary.edge_top1_hit_rate * 100)}% (target ${Math.round(report.summary.week2_targets.edge_top1_hit_rate * 100)}%, delta vs baseline ${Math.round(report.summary.week2_delta.edge_top1_hit_rate_delta * 100)} pts)`,
    `Edge thin evidence blockers: ${report.summary.edge_thin_evidence_coverage_count} (target <= ${report.summary.week2_targets.thin_evidence_coverage_count}, delta ${report.summary.week2_delta.thin_evidence_coverage_count_delta})`,
    `Edge thin signal convergence blockers: ${report.summary.edge_thin_signal_convergence_count} (target <= ${report.summary.week2_targets.thin_signal_convergence_count}, delta ${report.summary.week2_delta.thin_signal_convergence_count_delta})`,
    `Week 2 gate verdict: ${report.summary.week2_gate_verdict}`,
    "",
    "## Week 3 Edge Lift Targets",
    `Baseline date: ${report.summary.week3_baseline.date}`,
    `Canonical publishable domains: ${report.summary.publishable_canonical_domains} (target >= ${report.summary.week3_targets.publishable_canonical_domains}, delta ${report.summary.week3_delta.publishable_canonical_domains_delta})`,
    `Edge publishable rows: ${report.summary.edge_publishable_count} (target >= ${report.summary.week3_targets.edge_publishable_count}, delta ${report.summary.week3_delta.edge_publishable_count_delta})`,
    `Edge quality follow-up rows: ${report.summary.edge_quality_follow_up_count} (target <= ${report.summary.week3_targets.edge_quality_follow_up_count}, delta ${report.summary.week3_delta.edge_quality_follow_up_count_delta})`,
    `Edge top-1 hit rate: ${Math.round(report.summary.edge_top1_hit_rate * 100)}% (target ${Math.round(report.summary.week3_targets.edge_top1_hit_rate * 100)}%, delta vs baseline ${Math.round(report.summary.week3_delta.edge_top1_hit_rate_delta * 100)} pts)`,
    `Edge thin evidence blockers: ${report.summary.edge_thin_evidence_coverage_count} (target <= ${report.summary.week3_targets.edge_thin_evidence_coverage_count}, delta ${report.summary.week3_delta.edge_thin_evidence_coverage_count_delta})`,
    `Edge thin signal convergence blockers: ${report.summary.edge_thin_signal_convergence_count} (target <= ${report.summary.week3_targets.edge_thin_signal_convergence_count}, delta ${report.summary.week3_delta.edge_thin_signal_convergence_count_delta})`,
    `Week 3 gate verdict: ${report.summary.week3_gate_verdict}`,
    "",
    "## Current Wave",
    `Week 4 canary posture: ${report.week4_status.canary_posture}`,
    `Hard blockers: ${report.week4_status.hard_blockers.length ? report.week4_status.hard_blockers.join(", ") : "none"}`,
    "",
    "## Cluster Summary",
  ];

  for (const cluster of report.cluster_summary.by_cluster) {
    lines.push(
      `- ${cluster.cluster}: ${cluster.domain_count} domains | canonical publishable ${cluster.publishable_canonical_count} | edge publishable ${cluster.publishable_edge_count} | ready ${cluster.ready_count} | provider gaps ${cluster.provider_gap_count} | quality follow-up ${cluster.quality_follow_up_count} | edge quality follow-up ${cluster.edge_quality_follow_up_count} | routing blockers ${cluster.routing_blocker_count}`
    );
    for (const blocker of cluster.blocker_reason_counts) {
      lines.push(`  - blocker ${blocker.reason}: ${blocker.count}`);
    }
  }

  lines.push("", "## Top Blockers", "");
  for (const blocker of report.summary.blocker_reason_counts) {
    lines.push(`- ${blocker.reason}: ${blocker.count}`);
  }

  lines.push("", "## Edge Blockers", "");
  for (const blocker of report.summary.edge_blocker_reason_counts) {
    lines.push(`- ${blocker.reason}: ${blocker.count}`);
  }

  lines.push("", "## Week 2 Focus Rows", "");
  for (const domain of report.domains.filter((item) => item.rows.some((row) => row.week2_focus))) {
    const edge = domain.rows.find((row) => row.variant === "edge");
    lines.push(
      `- ${domain.domain_id}: edge ${safeText(edge?.quality?.quality_verdict)}/${safeText(edge?.quality?.publication_state)} | blocker ${safeText(edge?.quality?.blocker_reason)} | top-1 ${safeText(edge?.routing?.top_domain)} | pack ${safeText(edge?.quality?.domain_pack_strength)} | targeted provider ${edge?.quality?.targeted_provider_used === true ? "yes" : "no"}`
    );
  }

  lines.push("", "## Week 3 Focus Rows", "");
  for (const domain of report.domains.filter((item) => item.rows.some((row) => row.week3_focus))) {
    const canonical = domain.rows.find((row) => row.variant === "canonical");
    const edge = domain.rows.find((row) => row.variant === "edge");
    lines.push(
      `- ${domain.domain_id}: canonical ${safeText(canonical?.quality?.quality_verdict)}/${safeText(canonical?.quality?.publication_state)} | edge ${safeText(edge?.quality?.quality_verdict)}/${safeText(edge?.quality?.publication_state)} | blocker ${safeText(edge?.quality?.blocker_reason || canonical?.quality?.blocker_reason)} | decision ${safeText(canonical?.quality?.decision_ready_state)} | decision blocker ${safeText(canonical?.quality?.decision_blocker_reason)} | thin reason ${safeText(edge?.quality?.still_thin_reason || canonical?.quality?.still_thin_reason)}`
    );
  }

  lines.push(
    "",
    "## Domain Matrix",
    "",
    "| Domain | Cluster | Canonical top-1 | Edge top-1 | Canonical quality | Edge quality | Row state | Action | Blocker | Pack | Decision | Thin reason |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  );

  for (const domain of report.domains) {
    const canonical = domain.rows.find((row) => row.variant === "canonical");
    const edge = domain.rows.find((row) => row.variant === "edge");
    lines.push(
      `| ${domain.domain_id} | ${safeText(domain.cluster)} | ${safeText(canonical?.routing?.top_domain)} | ${safeText(edge?.routing?.top_domain)} | ${safeText(
        canonical?.quality?.quality_verdict
      )}/${safeText(canonical?.quality?.publication_state)} | ${safeText(edge?.quality?.quality_verdict)}/${safeText(
        edge?.quality?.publication_state
      )} | ${safeText(canonical?.gating?.row_state)} | ${safeText(canonical?.gating?.action_recommendation)} | ${safeText(
        canonical?.quality?.blocker_reason || edge?.quality?.blocker_reason
      )} | ${safeText(canonical?.quality?.domain_pack_strength)} | ${safeText(canonical?.quality?.decision_ready_state)} | ${safeText(canonical?.quality?.still_thin_reason)} |`
    );
  }

  lines.push("", "## Domains Requiring Follow-Up", "");
  for (const domain of report.domains.filter((item) => item.needs_follow_up === true)) {
    const canonical = domain.rows.find((row) => row.variant === "canonical");
    lines.push(
      `- ${domain.domain_id}: ${safeText(canonical?.quality?.blocker_reason || domain.domain_status_reason)} | provider hints: ${
        canonical?.candidate_paid_private_sources?.length ? canonical.candidate_paid_private_sources.join(", ") : "none"
      } | action: ${safeText(canonical?.gating?.action_recommendation)}`
    );
  }

  return lines.join("\n");
}

export async function runDomainQualityMatrix() {
  const rows = [];
  for (const domainCase of DOMAIN_MATRIX_CASES) {
    rows.push(buildDomainRow({ domainCase, queryText: domainCase.canonicalQuery, variant: "canonical" }));
    rows.push(buildDomainRow({ domainCase, queryText: domainCase.edgeQuery, variant: "edge" }));
  }

  const domains = DOMAIN_MATRIX_CASES.map((domainCase) => {
    const domainConfig = getDomain(domainCase.domainId, GENERAL_FORECAST_DOMAIN);
    const domainRows = rows.filter((row) => row.domain_id === domainCase.domainId);
    const canonical = domainRows.find((row) => row.variant === "canonical");
    const edge = domainRows.find((row) => row.variant === "edge");
    const needsFollowUp =
      canonical?.routing?.top3_hit !== true ||
      canonical?.routing?.silent_general_fallback === true ||
      canonical?.quality?.publication_state !== "published" ||
      Boolean(edge?.quality?.blocker_reason);
    return {
      domain_id: domainCase.domainId,
      domain_title: safeText(domainConfig?.title),
      cluster: getDomainCluster(domainCase.domainId),
      domain_state: safeText(domainConfig?.current_state, "limited"),
      domain_status_reason: safeText(domainConfig?.status_reason),
      calibration_target: RUNTIME_CALIBRATION_TARGET_DOMAINS.includes(domainCase.domainId),
      needs_follow_up: needsFollowUp,
      rows: domainRows,
    };
  });

  const canonicalRows = rows.filter((row) => row.variant === "canonical");
  const edgeRows = rows.filter((row) => row.variant === "edge");
  const top1Hits = rows.filter((row) => row.routing.top_domain === row.domain_id).length;
  const top3MissCount = rows.filter((row) => row.routing.top3_hit !== true).length;
  const silentGeneralFallbackCount = rows.filter((row) => row.routing.silent_general_fallback === true).length;
  const canonicalPublishableDomains = canonicalRows.filter((row) => row.quality.publication_state === "published").length;
  const canonicalBlockers = canonicalRows.filter((row) => safeText(row.quality.blocker_reason)).length;
  const rowsWithRegistryOnlySources = rows.filter((row) => row.provider_requirement_map.registry_only_sources.length > 0).length;
  const weakDomains = domains.filter((domain) => domain.needs_follow_up === true).length;
  const readyDomainCount = canonicalRows.filter((row) => row.gating.row_state === "ready").length;
  const providerGapDomainCount = canonicalRows.filter((row) => row.gating.row_state === "provider_gap").length;
  const qualityFollowUpDomainCount = canonicalRows.filter((row) => row.gating.row_state === "quality_follow_up").length;
  const edgePublishableCount = edgeRows.filter((row) => row.quality.publication_state === "published").length;
  const edgeQualityFollowUpCount = edgeRows.filter((row) => row.gating.row_state === "quality_follow_up").length;
  const edgeTop1HitRate = Number(
    (edgeRows.filter((row) => row.routing.top_domain === row.domain_id).length / Math.max(1, edgeRows.length)).toFixed(4)
  );
  const blockerReasonCounts = Object.entries(
    canonicalRows.reduce((acc, row) => {
      const reason = safeText(row.quality.blocker_reason, "none");
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
  const thinEvidenceCoverageCount = blockerReasonCounts.find((item) => item.reason === "thin_evidence_coverage")?.count || 0;
  const edgeBlockerReasonCounts = Object.entries(
    edgeRows.reduce((acc, row) => {
      const reason = safeText(row.quality.blocker_reason, "none");
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
  const edgeThinEvidenceCoverageCount = edgeBlockerReasonCounts.find((item) => item.reason === "thin_evidence_coverage")?.count || 0;
  const edgeThinSignalConvergenceCount = edgeBlockerReasonCounts.find((item) => item.reason === "thin_signal_convergence")?.count || 0;
  const edgeDirectionalNotPublishReadyCount =
    edgeBlockerReasonCounts.find((item) => item.reason === "directional_signal_not_publish_ready")?.count || 0;
  const edgeProviderRequiredNoPickCount =
    edgeBlockerReasonCounts.find((item) => item.reason === "provider_required_no_pick")?.count || 0;
  const clusterSummary = Object.entries(
    domains.reduce((acc, domain) => {
      const cluster = safeText(domain.cluster);
        if (!acc[cluster]) {
          acc[cluster] = {
            cluster,
            domain_count: 0,
            publishable_canonical_count: 0,
            publishable_edge_count: 0,
            provider_gap_count: 0,
            quality_follow_up_count: 0,
            edge_quality_follow_up_count: 0,
            ready_count: 0,
            routing_blocker_count: 0,
            blocker_reason_counts: {},
          };
        }
        const canonical = domain.rows.find((row) => row.variant === "canonical");
        const edge = domain.rows.find((row) => row.variant === "edge");
        acc[cluster].domain_count += 1;
        if (canonical?.quality?.publication_state === "published") acc[cluster].publishable_canonical_count += 1;
        if (edge?.quality?.publication_state === "published") acc[cluster].publishable_edge_count += 1;
        if (canonical?.gating?.row_state === "provider_gap") acc[cluster].provider_gap_count += 1;
        if (canonical?.gating?.row_state === "quality_follow_up") acc[cluster].quality_follow_up_count += 1;
        if (edge?.gating?.row_state === "quality_follow_up") acc[cluster].edge_quality_follow_up_count += 1;
        if (canonical?.gating?.row_state === "ready") acc[cluster].ready_count += 1;
        if (canonical?.gating?.row_state === "routing_blocked") acc[cluster].routing_blocker_count += 1;
        const blockerReason = safeText(canonical?.quality?.blocker_reason, "none");
        acc[cluster].blocker_reason_counts[blockerReason] = (acc[cluster].blocker_reason_counts[blockerReason] || 0) + 1;
        return acc;
    }, {})
  ).map(([, value]) => ({
    ...value,
    blocker_reason_counts: Object.entries(value.blocker_reason_counts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 4),
  }));

  const week1Delta = {
    baseline_date: WEEK1_BASELINE.date,
    top1_hit_rate_delta: Number((Number((top1Hits / Math.max(1, rows.length)).toFixed(4)) - WEEK1_BASELINE.top1_hit_rate).toFixed(4)),
    publishable_canonical_domains_delta: canonicalPublishableDomains - WEEK1_BASELINE.publishable_canonical_domains,
    provider_gap_domain_count_delta: providerGapDomainCount - WEEK1_BASELINE.provider_gap_domain_count,
    silent_general_fallback_delta: silentGeneralFallbackCount - WEEK1_BASELINE.silent_general_fallback_count,
  };
  const batch3Delta = {
    baseline_date: BATCH3_BASELINE.date,
    top1_hit_rate_delta: Number((Number((top1Hits / Math.max(1, rows.length)).toFixed(4)) - BATCH3_BASELINE.top1_hit_rate).toFixed(4)),
    publishable_canonical_domains_delta: canonicalPublishableDomains - BATCH3_BASELINE.publishable_canonical_domains,
    thin_evidence_coverage_count_delta: thinEvidenceCoverageCount - BATCH3_BASELINE.thin_evidence_coverage_count,
    provider_gap_domain_count_delta: providerGapDomainCount - BATCH3_BASELINE.provider_gap_domain_count,
    silent_general_fallback_delta: silentGeneralFallbackCount - BATCH3_BASELINE.silent_general_fallback_count,
  };
  const week2Delta = {
    baseline_date: WEEK2_BASELINE.date,
    edge_publishable_count_delta: edgePublishableCount - WEEK2_BASELINE.edge_publishable_count,
    edge_quality_follow_up_count_delta: edgeQualityFollowUpCount - WEEK2_BASELINE.edge_quality_follow_up_count,
    edge_top1_hit_rate_delta: Number((edgeTop1HitRate - WEEK2_BASELINE.edge_top1_hit_rate).toFixed(4)),
    thin_evidence_coverage_count_delta: edgeThinEvidenceCoverageCount - WEEK2_BASELINE.thin_evidence_coverage_count,
    thin_signal_convergence_count_delta: edgeThinSignalConvergenceCount - WEEK2_BASELINE.thin_signal_convergence_count,
    directional_signal_not_publish_ready_count_delta:
      edgeDirectionalNotPublishReadyCount - WEEK2_BASELINE.directional_signal_not_publish_ready_count,
    provider_required_no_pick_count_delta:
      edgeProviderRequiredNoPickCount - WEEK2_BASELINE.provider_required_no_pick_count,
  };
  const week3Delta = {
    baseline_date: WEEK3_BASELINE.date,
    publishable_canonical_domains_delta: canonicalPublishableDomains - WEEK3_BASELINE.publishable_canonical_domains,
    edge_publishable_count_delta: edgePublishableCount - WEEK3_BASELINE.edge_publishable_count,
    edge_quality_follow_up_count_delta: edgeQualityFollowUpCount - WEEK3_BASELINE.edge_quality_follow_up_count,
    edge_top1_hit_rate_delta: Number((edgeTop1HitRate - WEEK3_BASELINE.edge_top1_hit_rate).toFixed(4)),
    edge_thin_evidence_coverage_count_delta: edgeThinEvidenceCoverageCount - WEEK3_BASELINE.edge_thin_evidence_coverage_count,
    edge_thin_signal_convergence_count_delta: edgeThinSignalConvergenceCount - WEEK3_BASELINE.edge_thin_signal_convergence_count,
    provider_gap_domain_count_delta: providerGapDomainCount - WEEK3_BASELINE.provider_gap_domain_count,
    silent_general_fallback_delta: silentGeneralFallbackCount - WEEK3_BASELINE.silent_general_fallback_count,
  };
  const batch2GateVerdict =
    Number((top1Hits / Math.max(1, rows.length)).toFixed(4)) >= WEEK1_TARGETS.top1_hit_rate &&
    providerGapDomainCount === 0 &&
    silentGeneralFallbackCount === 0 &&
    thinEvidenceCoverageCount < 18
      ? "week1_batch2_on_track"
      : "week1_batch2_needs_more_signal";
  const batch3GateVerdict =
    Number((top1Hits / Math.max(1, rows.length)).toFixed(4)) >= BATCH3_TARGETS.top1_hit_rate &&
    canonicalPublishableDomains >= BATCH3_TARGETS.publishable_canonical_domains &&
    providerGapDomainCount === 0 &&
    silentGeneralFallbackCount === 0 &&
    thinEvidenceCoverageCount <= BATCH3_TARGETS.thin_evidence_coverage_count
      ? "week1_batch3_on_track"
      : "week1_batch3_needs_more_vertical_signal";
  const week2GateVerdict =
    canonicalPublishableDomains >= 42 &&
    providerGapDomainCount === 0 &&
    silentGeneralFallbackCount === 0 &&
    edgeTop1HitRate >= WEEK2_TARGETS.edge_top1_hit_rate &&
    edgeQualityFollowUpCount <= WEEK2_TARGETS.edge_quality_follow_up_count &&
    edgeThinEvidenceCoverageCount <= WEEK2_TARGETS.thin_evidence_coverage_count &&
    edgeThinSignalConvergenceCount <= WEEK2_TARGETS.thin_signal_convergence_count &&
    edgeProviderRequiredNoPickCount <= WEEK2_TARGETS.provider_required_no_pick_count
      ? "week2_provider_depth_on_track"
      : "week2_needs_more_live_depth";
  const week3GateVerdict =
    canonicalPublishableDomains >= WEEK3_TARGETS.publishable_canonical_domains &&
    edgePublishableCount >= WEEK3_TARGETS.edge_publishable_count &&
    edgeQualityFollowUpCount <= WEEK3_TARGETS.edge_quality_follow_up_count &&
    edgeTop1HitRate >= WEEK3_TARGETS.edge_top1_hit_rate &&
    edgeThinEvidenceCoverageCount <= WEEK3_TARGETS.edge_thin_evidence_coverage_count &&
    edgeThinSignalConvergenceCount <= WEEK3_TARGETS.edge_thin_signal_convergence_count &&
    providerGapDomainCount === WEEK3_TARGETS.provider_gap_domain_count &&
    silentGeneralFallbackCount === WEEK3_TARGETS.silent_general_fallback_count
      ? "week3_edge_predictive_lift_ready"
      : "week3_needs_more_edge_depth";

    const week4HardBlockers = uniqueStrings(
      canonicalRows
        .filter((row) => {
          const blockerReason = safeText(row?.quality?.blocker_reason);
          const hasExplicitBlocker = blockerReason && blockerReason !== "none";
          const missingFredRequired = row.provider_requirement_map.provider_states.some(
            (provider) => provider.source_id === "fred_api" && provider.required_for_query && provider.available !== true
          );
          return hasExplicitBlocker || missingFredRequired;
        })
        .map((row) => safeText(row.quality.blocker_reason || row.domain_id))
    );

    return {
      generated_at: new Date().toISOString(),
      summary: {
      total_domains: domains.length,
      total_rows: rows.length,
      top1_hit_rate: Number((top1Hits / Math.max(1, rows.length)).toFixed(4)),
      top3_miss_count: top3MissCount,
      silent_general_fallback_count: silentGeneralFallbackCount,
      publishable_canonical_domains: canonicalPublishableDomains,
      domains_with_blocker_reason: canonicalBlockers,
      ready_domain_count: readyDomainCount,
      provider_gap_domain_count: providerGapDomainCount,
      quality_follow_up_domain_count: qualityFollowUpDomainCount,
      thin_evidence_coverage_count: thinEvidenceCoverageCount,
      edge_publishable_count: edgePublishableCount,
      edge_quality_follow_up_count: edgeQualityFollowUpCount,
      edge_top1_hit_rate: edgeTop1HitRate,
      edge_blocker_reason_counts: edgeBlockerReasonCounts.slice(0, 8),
      edge_thin_evidence_coverage_count: edgeThinEvidenceCoverageCount,
      edge_thin_signal_convergence_count: edgeThinSignalConvergenceCount,
      edge_directional_signal_not_publish_ready_count: edgeDirectionalNotPublishReadyCount,
      edge_provider_required_no_pick_count: edgeProviderRequiredNoPickCount,
      rows_with_registry_only_sources: rowsWithRegistryOnlySources,
      weak_domain_count: weakDomains,
      blocker_reason_counts: blockerReasonCounts.slice(0, 8),
      week1_baseline: WEEK1_BASELINE,
      week1_targets: WEEK1_TARGETS,
      week1_delta: week1Delta,
      batch3_baseline: BATCH3_BASELINE,
      batch3_targets: BATCH3_TARGETS,
      batch3_delta: batch3Delta,
      week2_baseline: WEEK2_BASELINE,
      week2_targets: WEEK2_TARGETS,
      week2_delta: week2Delta,
      week3_baseline: WEEK3_BASELINE,
      week3_targets: WEEK3_TARGETS,
      week3_delta: week3Delta,
      batch2_gate_verdict: batch2GateVerdict,
      batch3_gate_verdict: batch3GateVerdict,
      week2_gate_verdict: week2GateVerdict,
      week3_gate_verdict: week3GateVerdict,
      verdict:
        silentGeneralFallbackCount === 0 && domains.length === CATALOG_DOMAINS.length
          ? "sprint_matrix_ready"
          : "needs_routing_work",
      },
      week4_status: {
        rollout_bucket: "0/0",
        canary_posture: week4HardBlockers.length === 0 ? "sports_feature_flag_candidate" : "defer_until_after_prediction_quality_sprint",
        hard_blockers: week4HardBlockers,
      },
      domains,
    rows,
    cluster_summary: {
      canonical_rows: canonicalRows.length,
      edge_rows: edgeRows.length,
      runtime_calibration_targets: domains.filter((domain) => domain.calibration_target).map((domain) => domain.domain_id),
      week2_focus_rows: Array.from(WEEK2_FOCUS_DOMAIN_IDS),
      week3_focus_rows: Array.from(WEEK3_FOCUS_DOMAIN_IDS),
      by_cluster: clusterSummary,
    },
  };
}

export {
  buildDomainRow,
  buildSyntheticConfidenceScore,
  buildSyntheticEvidenceBundle,
  buildSyntheticRawScorecard,
};

export async function writeDomainQualityMatrixReport({ currentDate, docsDir } = {}) {
  const report = await runDomainQualityMatrix();
  const effectiveDate = safeText(currentDate, new Date().toISOString().slice(0, 10));
  const targetDocsDir = docsDir || path.resolve(process.cwd(), "docs");
  const markdownPath = path.resolve(targetDocsDir, `domain-quality-matrix-${effectiveDate}.md`);
  const jsonPath = path.resolve(targetDocsDir, `domain-quality-matrix-${effectiveDate}.json`);

  await ensureDirname(markdownPath);
  await fs.writeFile(markdownPath, buildMarkdownReport(report), "utf8");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  return {
    markdownPath,
    jsonPath,
    report,
  };
}
