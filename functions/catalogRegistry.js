const GENERAL_FORECAST_DOMAIN = "A.0.general.general_forecast";
const SPORTS_MATCH_OUTCOMES_DOMAIN = "A.29.sports_performance_and_outcomes";

const CATALOG_VERSION_ID = "crystal-b2c-blueprint-v1.2";
const POLICY_PROFILE = "public-only";
const GENERATED_AT = "2026-03-18T12:00:00Z";

const STANDARD_CARD_TYPES = [
  {
    card_type_id: "now_snapshot",
    title: "Now Snapshot",
    order: 1,
    description: "Current state, regime, or level with drivers and confidence.",
  },
  {
    card_type_id: "forecast_band",
    title: "Forecast Band",
    order: 2,
    description: "Forecast with ranges or low/base/high bands on a defined horizon.",
  },
  {
    card_type_id: "risk_band",
    title: "Risk Band",
    order: 3,
    description: "Probability and severity of a risk within a time window.",
  },
  {
    card_type_id: "scenario_set",
    title: "Scenario Set",
    order: 4,
    description: "Three to five scenarios with probabilities and measurable drivers.",
  },
  {
    card_type_id: "rank_compare",
    title: "Rank and Compare",
    order: 5,
    description: "Ranking and comparison across entities or options.",
  },
  {
    card_type_id: "anomaly_spike",
    title: "Anomaly Spike",
    order: 6,
    description: "Spike detection with severity, expected duration, and propagation risk.",
  },
  {
    card_type_id: "timeline_calendar",
    title: "Timeline and Calendar",
    order: 7,
    description: "Windows, events, and timing relevance with impact risk.",
  },
  {
    card_type_id: "hotspot_map_object",
    title: "Hotspot Map Object",
    order: 8,
    description: "Zone or cell level hotspot surface with severity and confidence.",
  },
  {
    card_type_id: "analog_evidence",
    title: "Analog Evidence",
    order: 9,
    description: "Historical analogs, pattern retrieval, and similarity confidence.",
  },
  {
    card_type_id: "decision_tradeoff",
    title: "Decision Tradeoff",
    order: 10,
    description: "Action layer with alternatives, tradeoffs, and triggers to watch.",
  },
];

function createDomain(
  domainId,
  block,
  macroAreaId,
  title,
  shortLabel,
  summary,
  allowedEntityTypes,
  supportedHorizons,
  allowedCardTypes,
  refreshCadence,
  computeTier,
  targetWave,
  currentState,
  statusReason,
  sourceAllowlist
) {
  return {
    domain_id: domainId,
    block,
    macro_area_id: macroAreaId,
    title,
    short_label: shortLabel,
    summary,
    allowed_entity_types: allowedEntityTypes,
    supported_horizons: supportedHorizons,
    allowed_card_types: allowedCardTypes,
    refresh_cadence: refreshCadence,
    compute_tier: computeTier,
    target_wave: targetWave,
    current_state: currentState,
    status_reason: statusReason,
    source_allowlist: sourceAllowlist,
  };
}

const CATALOG_DOMAINS = [
  createDomain(
    GENERAL_FORECAST_DOMAIN,
    "system",
    "A.0",
    "General Forecast Router",
    "General",
    "Compatibility bridge for broad or mixed questions before the registry resolves them to a blueprint domain.",
    ["world", "country", "city", "entity", "theme"],
    ["7d", "30d", "90d", "6m", "12m"],
    ["forecast_band", "scenario_set", "decision_tradeoff"],
    "session-based",
    "tier_0",
    "bridge",
    "limited",
    "General questions are supported, but they should converge toward a concrete blueprint domain when possible.",
    []
  ),
  createDomain(
    "A.1.weather_and_atmosphere",
    "A",
    "A.1",
    "Weather and Atmosphere",
    "Weather",
    "Atmospheric conditions, comfort, anomalies, and weather-driven operational risk.",
    ["world", "country", "city", "zone"],
    ["now", "72h", "7d", "30d"],
    ["now_snapshot", "forecast_band", "risk_band", "timeline_calendar"],
    "event-driven",
    "tier_1",
    "wave_1",
    "published",
    "Weather can already be grounded through public forecast and archive sources.",
    ["open_meteo", "nws_api"]
  ),
  createDomain(
    "A.2.climate_hazards_and_disaster_risk",
    "A",
    "A.2",
    "Climate Hazards and Disaster Risk",
    "Hazards",
    "Natural hazard windows, disaster severity, and impact risk propagation.",
    ["world", "country", "city", "zone"],
    ["7d", "30d", "90d", "season"],
    ["risk_band", "scenario_set", "hotspot_map_object", "timeline_calendar"],
    "daily",
    "tier_2",
    "wave_2",
    "limited",
    "The registry is ready, but hazard layering still needs more source fusion and calibration.",
    ["open_meteo", "nws_api", "noaa_water"]
  ),
  createDomain(
    "A.3.water_and_hydrology_signals",
    "A",
    "A.3",
    "Water and Hydrology Signals",
    "Water",
    "Water stress, flood and drought signals, and territory-level water availability pressure.",
    ["country", "city", "zone"],
    ["7d", "30d", "90d", "season"],
    ["forecast_band", "risk_band", "hotspot_map_object"],
    "daily",
    "tier_2",
    "wave_2",
    "limited",
    "Hydrology support is scaffolded, but the operational feature bundle is still partial.",
    ["noaa_water", "open_meteo"]
  ),
  createDomain(
    "A.4.environment_and_exposure",
    "A",
    "A.4",
    "Environment and Exposure",
    "Exposure",
    "Local environmental exposure, heat island, degradation, and structural vulnerability signals.",
    ["country", "city", "zone"],
    ["7d", "30d", "90d"],
    ["risk_band", "hotspot_map_object", "rank_compare"],
    "weekly",
    "tier_2",
    "wave_2",
    "limited",
    "Environmental exposure is modeled in the registry, but public evidence fusion is still incomplete.",
    ["openaq", "open_meteo", "wikidata"]
  ),
  createDomain(
    "A.5.food_security_and_staple_prices",
    "A",
    "A.5",
    "Food Security and Staple Prices",
    "Food",
    "Staple price pressure, crop risk, and affordability shocks.",
    ["world", "country", "city"],
    ["30d", "90d", "6m", "12m"],
    ["forecast_band", "risk_band", "scenario_set", "rank_compare"],
    "weekly",
    "tier_2",
    "wave_2",
    "limited",
    "The domain is in registry with a public-source posture, but the dedicated food stack is not fully wired yet.",
    ["world_bank_api", "eurostat_api", "oecd_api"]
  ),
  createDomain(
    "A.6.agriculture_and_seasonal_production",
    "A",
    "A.6",
    "Agriculture and Seasonal Production",
    "Agriculture",
    "Agricultural seasonality, yield stress, and production pass-through risk.",
    ["world", "country", "region"],
    ["30d", "90d", "6m", "season"],
    ["forecast_band", "scenario_set", "analog_evidence"],
    "weekly",
    "tier_2",
    "wave_2",
    "blocked",
    "The blueprint domain is registered, but the agricultural evidence fabric is not operational yet.",
    ["open_meteo", "world_bank_api", "oecd_api"]
  ),
  createDomain(
    "A.7.city_pulse_and_urban_pressure",
    "A",
    "A.7",
    "City Pulse and Urban Pressure",
    "City Pulse",
    "Urban activity, crowding, neighborhood pressure, tourism load, and local capacity stress.",
    ["country", "city", "zone"],
    ["now", "7d", "30d", "90d"],
    ["now_snapshot", "rank_compare", "anomaly_spike", "hotspot_map_object"],
    "daily",
    "tier_1",
    "wave_1",
    "published",
    "City pulse can already reuse public geospatial and trend signals in a truthful coverage envelope.",
    ["wikidata", "google_trends", "rss_allowlist", "nominatim", "overpass", "open_meteo"]
  ),
  createDomain(
    "A.8.mobility_congestion_and_accessibility",
    "A",
    "A.8",
    "Mobility, Congestion and Accessibility",
    "Mobility",
    "Congestion, routing reliability, commuting stress, and accessibility friction.",
    ["country", "city", "zone", "corridor"],
    ["now", "7d", "30d"],
    ["forecast_band", "risk_band", "timeline_calendar", "hotspot_map_object"],
    "event-driven",
    "tier_2",
    "wave_1",
    "limited",
    "Mobility logic is cataloged, but real-time public feed stitching is still partial.",
    ["gtfs_static", "gtfs_realtime", "nominatim", "overpass"]
  ),
  createDomain(
    "A.9.travel_flows_and_disruption",
    "A",
    "A.9",
    "Travel Flows and Disruption",
    "Travel",
    "Travel demand, delay risk, destination crowding, and trip disruption windows.",
    ["world", "country", "city", "trip"],
    ["7d", "30d", "90d", "season"],
    ["forecast_band", "risk_band", "timeline_calendar", "rank_compare"],
    "daily",
    "tier_1",
    "wave_1",
    "published",
    "Travel can be grounded through public transport, weather, and aviation feeds.",
    ["gtfs_static", "gtfs_realtime", "opensky", "nominatim", "rss_allowlist", "open_meteo"]
  ),
  createDomain(
    "A.10.connectivity_and_network_quality_signals",
    "A",
    "A.10",
    "Connectivity and Network Quality Signals",
    "Connectivity",
    "Connectivity quality, outage pressure, and network friction signals.",
    ["country", "city", "zone", "operator"],
    ["now", "7d", "30d"],
    ["now_snapshot", "risk_band", "rank_compare"],
    "daily",
    "tier_2",
    "wave_2",
    "blocked",
    "The connectivity domain is registered, but the public telemetry layer is not connected yet.",
    ["rss_allowlist", "wikidata"]
  ),
  createDomain(
    "A.11.cost_of_living_and_price_pressure",
    "A",
    "A.11",
    "Cost of Living and Price Pressure",
    "Cost",
    "Inflation, price pressure, basket proxies, and household affordability stress.",
    ["world", "country", "city"],
    ["30d", "90d", "6m", "12m"],
    ["forecast_band", "risk_band", "scenario_set", "rank_compare"],
    "weekly",
    "tier_1",
    "wave_1",
    "published",
    "The domain can be grounded through public macro and price series, even if coverage depth varies by geography.",
    ["fred_api", "world_bank_api", "eurostat_api", "oecd_api", "eia_api"]
  ),
  createDomain(
    "A.12.housing_and_real_estate_signals",
    "A",
    "A.12",
    "Housing and Real Estate Signals",
    "Housing",
    "Housing affordability, rent and price momentum, scarcity, and migration-linked pressure.",
    ["country", "city", "zone"],
    ["30d", "90d", "6m", "12m"],
    ["forecast_band", "rank_compare", "risk_band"],
    "weekly",
    "tier_2",
    "wave_1",
    "limited",
    "Housing is registered and routable, but localized public feature depth is still uneven.",
    ["fred_api", "world_bank_api", "eurostat_api", "wikidata"]
  ),
  createDomain(
    "A.13.energy_and_utilities_markets",
    "A",
    "A.13",
    "Energy and Utilities Markets",
    "Energy",
    "Energy price pressure, outage risk, utilities stress, and shock sensitivity.",
    ["world", "country", "city", "corridor"],
    ["7d", "30d", "90d", "6m"],
    ["forecast_band", "risk_band", "scenario_set", "anomaly_spike"],
    "daily",
    "tier_1",
    "wave_1",
    "published",
    "Energy is one of the strongest public-source domains already compatible with the product.",
    ["eia_api", "fred_api", "polymarket_public", "rss_allowlist"]
  ),
  createDomain(
    "A.14.macro_economy_and_cycles",
    "A",
    "A.14",
    "Macro Economy and Cycles",
    "Macro",
    "Growth, inflation, rates, recession risk, and cross-country macro regimes.",
    ["world", "country", "region"],
    ["30d", "90d", "6m", "12m"],
    ["forecast_band", "scenario_set", "rank_compare", "analog_evidence"],
    "weekly",
    "tier_1",
    "wave_1",
    "published",
    "Macro is already compatible with public economic APIs and historic analog logic.",
    ["fred_api", "world_bank_api", "eurostat_api", "oecd_api", "polymarket_public"]
  ),
  createDomain(
    "A.15.jobs_and_labor_market_signals",
    "A",
    "A.15",
    "Jobs and Labor Market Signals",
    "Jobs",
    "Hiring momentum, wage pressure, layoffs stress, and labor attractiveness.",
    ["country", "city", "sector"],
    ["30d", "90d", "6m", "12m"],
    ["forecast_band", "rank_compare", "risk_band"],
    "weekly",
    "tier_2",
    "wave_2",
    "limited",
    "Labor market routing exists, but city and sector depth is still partial.",
    ["fred_api", "world_bank_api", "eurostat_api", "oecd_api", "google_trends"]
  ),
  createDomain(
    "A.16.consumer_sentiment_and_attention_economics",
    "A",
    "A.16",
    "Consumer Sentiment and Attention Economics",
    "Attention",
    "Collective attention, narrative shifts, hype cycles, and confidence pressure.",
    ["world", "country", "city", "theme"],
    ["now", "7d", "30d", "90d"],
    ["now_snapshot", "scenario_set", "anomaly_spike", "rank_compare"],
    "daily",
    "tier_2",
    "wave_1",
    "limited",
    "The domain is live in the registry, but attention grounding still depends on a lighter public stack.",
    ["google_trends", "gdelt", "rss_allowlist", "polymarket_public"]
  ),
  createDomain(
    "A.17.technology_adoption_and_digital_pulse",
    "A",
    "A.17",
    "Technology Adoption and Digital Pulse",
    "Tech",
    "Technology adoption, digital readiness, AI diffusion, and ecommerce intensity.",
    ["world", "country", "city", "sector"],
    ["30d", "90d", "6m", "12m"],
    ["forecast_band", "rank_compare", "scenario_set"],
    "weekly",
    "tier_2",
    "wave_1",
    "limited",
    "Technology adoption is cataloged with public evidence lanes, but feature depth is still expanding.",
    ["google_trends", "world_bank_api", "oecd_api", "gdelt", "rss_allowlist"]
  ),
  createDomain(
    "A.18.education_system_and_skills_pipeline",
    "A",
    "A.18",
    "Education System and Skills Pipeline",
    "Education",
    "Education calendars, exam pressure, skills pipeline, training demand, and talent outflow risk.",
    ["country", "city", "exam_event", "institution"],
    ["7d", "30d", "90d", "season"],
    ["timeline_calendar", "risk_band", "rank_compare", "decision_tradeoff"],
    "weekly",
    "tier_2",
    "wave_2",
    "blocked",
    "Education is in the registry, but the public scheduling and exam fabric is not production-ready yet.",
    ["rss_allowlist", "wikidata"]
  ),
  createDomain(
    "A.19.demographics_and_migration_pressure",
    "A",
    "A.19",
    "Demographics and Migration Pressure",
    "Demographics",
    "Population pressure, migration flows, youth and aging stress, and urbanization effects.",
    ["world", "country", "city", "region"],
    ["90d", "6m", "12m", "season"],
    ["forecast_band", "risk_band", "rank_compare", "analog_evidence"],
    "monthly",
    "tier_2",
    "wave_2",
    "limited",
    "Demographic and migration logic is available in the registry, with partial public-source readiness.",
    ["world_bank_api", "oecd_api", "eurostat_api"]
  ),
  createDomain(
    "A.20.infrastructure_and_logistics_reliability",
    "A",
    "A.20",
    "Infrastructure and Logistics Reliability",
    "Infrastructure",
    "Infrastructure reliability, logistics bottlenecks, outage risk, and recovery profiles.",
    ["world", "country", "city", "corridor"],
    ["7d", "30d", "90d", "6m"],
    ["risk_band", "scenario_set", "anomaly_spike", "timeline_calendar"],
    "event-driven",
    "tier_2",
    "wave_1",
    "limited",
    "Infrastructure routing is ready, but coverage remains partial while public logistics feeds are consolidated.",
    ["gtfs_realtime", "opensky", "rss_allowlist", "gdelt"]
  ),
  createDomain(
    "A.21.trade_supply_and_disruption_signals",
    "A",
    "A.21",
    "Trade, Supply and Disruption Signals",
    "Supply",
    "Supply stress, congestion, lead-time risk, scarcity, and resilience signals.",
    ["world", "country", "region", "corridor"],
    ["30d", "90d", "6m", "12m"],
    ["risk_band", "scenario_set", "anomaly_spike", "rank_compare"],
    "weekly",
    "tier_2",
    "wave_1",
    "limited",
    "Supply chain signals are represented in the registry, but the public evidence pack is still broadening.",
    ["world_bank_api", "oecd_api", "gdelt", "rss_allowlist"]
  ),
  createDomain(
    "A.22.industry_and_business_cycles",
    "A",
    "A.22",
    "Industry and Business Cycles",
    "Industry",
    "Sector momentum, retail pressure, logistics costs, construction cycles, and corporate stress.",
    ["world", "country", "city", "sector"],
    ["30d", "90d", "6m", "12m"],
    ["forecast_band", "rank_compare", "scenario_set"],
    "weekly",
    "tier_2",
    "wave_2",
    "limited",
    "Industry is routable, but the sector-specific feature library is still maturing.",
    ["fred_api", "world_bank_api", "oecd_api", "yahoo_finance", "google_trends", "gdelt"]
  ),
  createDomain(
    "A.23.markets_and_asset_regimes",
    "A",
    "A.23",
    "Markets and Asset Regimes",
    "Markets",
    "Market regimes, volatility, drawdown risk, and cross-asset scenario shifts.",
    ["world", "country", "asset_proxy", "sector"],
    ["7d", "30d", "90d", "6m"],
    ["now_snapshot", "forecast_band", "risk_band", "scenario_set", "analog_evidence"],
    "daily",
    "tier_1",
    "wave_1",
    "published",
    "Markets already have a usable public grounding stack and a meaningful trust envelope.",
    ["yahoo_finance", "google_trends", "polymarket_public", "fred_api", "eia_api", "rss_allowlist"]
  ),
  createDomain(
    "A.24.governance_policy_and_public_timeline",
    "A",
    "A.24",
    "Governance, Policy and Public Timeline",
    "Policy",
    "Election calendars, policy timelines, regulation pressure, and institutional stability.",
    ["world", "country", "city", "institution"],
    ["7d", "30d", "90d", "12m"],
    ["timeline_calendar", "risk_band", "scenario_set"],
    "event-driven",
    "tier_2",
    "wave_1",
    "limited",
    "The public timeline domain is cataloged, but event normalization is still partial.",
    ["wikidata", "gdelt", "rss_allowlist", "polymarket_public"]
  ),
  createDomain(
    "A.25.geopolitics_and_conflict_dynamics",
    "A",
    "A.25",
    "Geopolitics and Conflict Dynamics",
    "Geopolitics",
    "Escalation risk, conflict onset proxies, sanctions, spillovers, and disruption stress.",
    ["world", "country", "region", "corridor"],
    ["7d", "30d", "90d", "6m"],
    ["risk_band", "scenario_set", "anomaly_spike", "analog_evidence"],
    "event-driven",
    "tier_1",
    "wave_1",
    "published",
    "Geopolitics is one of the strongest evidence-first domains for the current stack.",
    ["gdelt", "polymarket_public", "rss_allowlist"]
  ),
  createDomain(
    "A.26.human_history_and_long_run_analogs",
    "A",
    "A.26",
    "Human History and Long-Run Analogs",
    "Analogs",
    "Historical analog retrieval, turning points, regime shifts, and recovery classes.",
    ["world", "country", "city", "theme"],
    ["30d", "90d", "6m", "12m"],
    ["analog_evidence", "scenario_set", "decision_tradeoff"],
    "weekly",
    "tier_2",
    "wave_2",
    "limited",
    "Long-run analogs can already support explanation, but the analog engine is still selective.",
    ["world_bank_api", "fred_api", "oecd_api"]
  ),
  createDomain(
    "A.27.safety_and_incident_risk",
    "A",
    "A.27",
    "Safety and Incident Risk",
    "Safety",
    "Local incident risk, hotspots, crowd risk, and seasonal safety shifts.",
    ["country", "city", "zone", "event"],
    ["now", "7d", "30d"],
    ["risk_band", "hotspot_map_object", "anomaly_spike"],
    "event-driven",
    "tier_2",
    "wave_2",
    "blocked",
    "Safety is registered, but it stays blocked until the public incident evidence fabric is production-ready.",
    ["gdelt", "rss_allowlist"]
  ),
  createDomain(
    "A.28.public_health_and_environmental_exposure",
    "A",
    "A.28",
    "Public Health and Environmental Exposure",
    "Public Health",
    "Air, heat, seasonal exposure, hospital pressure proxies, allergens, and wellbeing risk.",
    ["world", "country", "city", "zone"],
    ["7d", "30d", "90d", "season"],
    ["risk_band", "forecast_band", "rank_compare", "hotspot_map_object"],
    "daily",
    "tier_2",
    "wave_1",
    "limited",
    "Public health is cataloged with viable public inputs, but the blended signal set is still partial.",
    ["openaq", "open_meteo", "nws_api", "world_bank_api"]
  ),
  createDomain(
    SPORTS_MATCH_OUTCOMES_DOMAIN,
    "A",
    "A.29",
    "Sports Performance and Outcomes",
    "Sports",
    "Match probabilities, form, fatigue, season trajectory, upset risk, and competition context.",
    ["team", "match", "league", "fixture"],
    ["7d", "30d", "season"],
    ["rank_compare", "scenario_set", "decision_tradeoff"],
    "event-driven",
    "tier_1",
    "wave_1",
    "published",
    "Sports remains one of the clearest high-frequency use cases, even while provider depth is still improving.",
    ["api_football_optional", "rss_allowlist"]
  ),
  createDomain(
    "A.30.culture_events_and_attention",
    "A",
    "A.30",
    "Culture, Events and Attention",
    "Culture",
    "Events calendars, cultural seasonality, local spikes, and attention-driven pressure.",
    ["world", "country", "city", "event"],
    ["7d", "30d", "90d", "season"],
    ["timeline_calendar", "scenario_set", "anomaly_spike", "rank_compare"],
    "event-driven",
    "tier_2",
    "wave_1",
    "limited",
    "Culture and events are visible in the registry, but public event normalization is still ramping.",
    ["gdelt", "rss_allowlist", "wikidata"]
  ),
  createDomain(
    "B.3.1.love_and_social_outcomes",
    "B",
    "B.3.1",
    "Love and Social Outcomes",
    "Love",
    "Personal social and relationship outcomes orchestrated over blueprint domains.",
    ["person", "relationship", "goal"],
    ["7d", "30d", "90d"],
    ["decision_tradeoff", "scenario_set"],
    "session-based",
    "tier_3",
    "wave_3",
    "blocked",
    "Personal outcomes stay blocked until the upstream A-layer and boost-confidence flow are in place.",
    []
  ),
  createDomain(
    "B.3.2.study_and_exams_outcomes",
    "B",
    "B.3.2",
    "Study and Exams Outcomes",
    "Study",
    "Exam, study, and preparation outcomes layered over education and personal context.",
    ["person", "exam_event", "goal"],
    ["7d", "30d", "90d"],
    ["decision_tradeoff", "scenario_set"],
    "session-based",
    "tier_3",
    "wave_3",
    "blocked",
    "Study outcomes depend on boost inputs and upstream B orchestration that is not live yet.",
    []
  ),
  createDomain(
    "B.3.3.work_and_career_outcomes",
    "B",
    "B.3.3",
    "Work and Career Outcomes",
    "Career",
    "Personal work and career outcomes driven by labor, industry, and local conditions.",
    ["person", "goal", "sector"],
    ["30d", "90d", "6m"],
    ["decision_tradeoff", "scenario_set"],
    "session-based",
    "tier_3",
    "wave_3",
    "blocked",
    "Career outcomes are registered but depend on the multi-domain B planner.",
    []
  ),
  createDomain(
    "B.3.4.personal_finance_outcomes",
    "B",
    "B.3.4",
    "Personal Finance Outcomes",
    "Personal Finance",
    "Personal finance outcomes orchestrated over markets, macro, cost, and risk drivers.",
    ["person", "goal", "asset_proxy"],
    ["30d", "90d", "6m", "12m"],
    ["decision_tradeoff", "scenario_set"],
    "session-based",
    "tier_3",
    "wave_3",
    "blocked",
    "Personal finance remains blocked until B trust policies and high-stakes gating are fully implemented.",
    []
  ),
  createDomain(
    "B.3.5.business_idea_outcomes",
    "B",
    "B.3.5",
    "Business Idea Outcomes",
    "Business",
    "Small business or idea outcomes built over city, industry, demand, and constraint drivers.",
    ["person", "goal", "city", "sector"],
    ["30d", "90d", "6m"],
    ["decision_tradeoff", "scenario_set"],
    "session-based",
    "tier_3",
    "wave_3",
    "blocked",
    "Business idea outcomes remain pending until B orchestration and evidence packs are shipped.",
    []
  ),
  createDomain(
    "B.3.6.sports_outcomes_probability_mode",
    "B",
    "B.3.6",
    "Sports Outcomes (Probability Mode)",
    "Personal Sports",
    "Personalized sports outcome reasoning on top of the public sports stack.",
    ["person", "team", "match", "goal"],
    ["7d", "30d", "season"],
    ["decision_tradeoff", "scenario_set"],
    "session-based",
    "tier_3",
    "wave_3",
    "blocked",
    "Personalized sports outcomes stay out of the critical path until B is live.",
    []
  ),
  createDomain(
    "B.3.7.travel_personal_outcomes",
    "B",
    "B.3.7",
    "Travel Personal Outcomes",
    "Travel Personal",
    "Personal travel decisions layered over disruptions, mobility, weather, and local constraints.",
    ["person", "trip", "goal"],
    ["7d", "30d", "90d"],
    ["decision_tradeoff", "scenario_set"],
    "session-based",
    "tier_3",
    "wave_3",
    "blocked",
    "Travel personal outcomes require B orchestration and boost confidence inputs.",
    []
  ),
  createDomain(
    "B.3.8.personal_decisions_and_tradeoffs",
    "B",
    "B.3.8",
    "Personal Decisions and Tradeoffs",
    "Tradeoffs",
    "Decision cards that convert uncertainty into option tradeoffs and triggers.",
    ["person", "goal", "constraint"],
    ["7d", "30d", "90d", "6m"],
    ["decision_tradeoff"],
    "session-based",
    "tier_3",
    "wave_3",
    "blocked",
    "The tradeoff layer is designed, but it stays blocked until B goes live end-to-end.",
    []
  ),
  createDomain(
    "C.1.attention_waves",
    "C",
    "C.1",
    "Attention Waves",
    "Attention Waves",
    "Share-first attention pulses based on A16, A7, and A30 style signals.",
    ["world", "country", "city", "theme"],
    ["now", "7d", "30d"],
    ["anomaly_spike", "scenario_set", "rank_compare"],
    "daily",
    "tier_2",
    "wave_4",
    "blocked",
    "Fun Pack stays behind the core registry and trust rollout.",
    []
  ),
  createDomain(
    "C.2.event_pressure_forecast",
    "C",
    "C.2",
    "Event Pressure Forecast",
    "Event Pressure",
    "Shareable event and crowding pressure cards derived from public event signals.",
    ["city", "event", "weekend"],
    ["7d", "30d"],
    ["timeline_calendar", "risk_band", "anomaly_spike"],
    "event-driven",
    "tier_2",
    "wave_4",
    "blocked",
    "Fun Pack remains blocked until the core A surfaces are stable.",
    []
  ),
  createDomain(
    "C.3.hype_curve_tracker",
    "C",
    "C.3",
    "Hype Curve Tracker",
    "Hype Curve",
    "Hype phase, saturation, inversion, and analog-backed trend cards.",
    ["theme", "city", "category"],
    ["7d", "30d", "90d"],
    ["scenario_set", "analog_evidence", "anomaly_spike"],
    "daily",
    "tier_2",
    "wave_4",
    "blocked",
    "Fun Pack remains blocked until the core trust model is fully stabilized.",
    []
  ),
  createDomain(
    "C.4.global_quote_stream",
    "C",
    "C.4",
    "Global Quote Stream",
    "Quote Stream",
    "Share-ready quote surfaces linked back to full versioned cards.",
    ["world", "country", "city", "theme"],
    ["now", "7d", "30d"],
    ["now_snapshot", "scenario_set"],
    "daily",
    "tier_2",
    "wave_4",
    "blocked",
    "Quote stream remains behind the registry and coverage hardening work.",
    []
  ),
];

const SOURCE_REGISTRY = [
  { source_id: "open_meteo", title: "Open-Meteo", category: "weather", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "google_trends", title: "Google Trends", category: "attention", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "yahoo_finance", title: "Yahoo Finance", category: "markets", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "nws_api", title: "National Weather Service API", category: "weather", status: "approved", access_profile: "public", implementation_status: "registry_only" },
  { source_id: "noaa_water", title: "NOAA Water API", category: "hydrology", status: "approved", access_profile: "public", implementation_status: "registry_only" },
  { source_id: "openaq", title: "OpenAQ", category: "environment", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "fred_api", title: "FRED API", category: "macro", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "world_bank_api", title: "World Bank Indicators API", category: "macro", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "eurostat_api", title: "Eurostat API", category: "macro", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "oecd_api", title: "OECD SDMX API", category: "macro", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "eia_api", title: "EIA API", category: "energy", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "polymarket_public", title: "Polymarket Public APIs", category: "prediction_market", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "nominatim", title: "Nominatim", category: "geography", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "overpass", title: "Overpass API", category: "geography", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "wikidata", title: "Wikidata", category: "entity_resolution", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "gtfs_static", title: "GTFS Static", category: "mobility", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "gtfs_realtime", title: "GTFS Realtime", category: "mobility", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "opensky", title: "OpenSky", category: "travel", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "football_data", title: "football-data.org", category: "sports", status: "approved", access_profile: "public", implementation_status: "registry_only" },
  { source_id: "gdelt", title: "GDELT", category: "news_attention", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "rss_allowlist", title: "Allowlisted RSS feeds", category: "news_attention", status: "approved", access_profile: "public", implementation_status: "implemented" },
  { source_id: "api_football_optional", title: "API-Football", category: "sports", status: "limited", access_profile: "optional_non_default", implementation_status: "implemented" },
];

const CANDIDATE_RESTRICTED_SOURCES = [
  { source_id: "google_maps", title: "Google Maps Platform", status: "candidate_paid_or_restricted", access_profile: "paid_or_restricted", reason: "Outside the current public-only policy." },
  { source_id: "google_programmable_search", title: "Google Programmable Search", status: "candidate_paid_or_restricted", access_profile: "paid_or_restricted", reason: "Outside the current public-only policy and not part of the critical path." },
  { source_id: "nvidia_earth2", title: "NVIDIA Earth-2", status: "candidate_paid_or_restricted", access_profile: "paid_or_restricted", reason: "Outside the current public-only policy and not a simple public data feed." },
];

const LEGACY_DOMAIN_ALIASES = {
  "A.1.macro.gdp_growth": "A.14.macro_economy_and_cycles",
  "A.1.macro.interest_rates": "A.14.macro_economy_and_cycles",
  "A.1.macro.unemployment_rate": "A.15.jobs_and_labor_market_signals",
  "A.2.markets.equity_indices": "A.23.markets_and_asset_regimes",
  "A.2.markets.crypto_volatility": "A.23.markets_and_asset_regimes",
  "A.2.markets.commodity_prices": "A.23.markets_and_asset_regimes",
  "A.3.real_estate.residential_prices": "A.12.housing_and_real_estate_signals",
  "A.3.real_estate.commercial_rents": "A.12.housing_and_real_estate_signals",
  "A.3.real_estate.mortgage_rates": "A.12.housing_and_real_estate_signals",
  "A.4.climate.extreme_weather_risk": "A.2.climate_hazards_and_disaster_risk",
  "A.4.climate.temperature_anomalies": "A.1.weather_and_atmosphere",
  "A.4.climate.precipitation_forecast": "A.1.weather_and_atmosphere",
  "A.5.energy.gas_prices": "A.13.energy_and_utilities_markets",
  "A.5.energy.electricity_costs": "A.13.energy_and_utilities_markets",
  "A.5.energy.renewable_transition": "A.13.energy_and_utilities_markets",
  "A.6.tech.ai_adoption_rate": "A.17.technology_adoption_and_digital_pulse",
  "A.6.tech.cybersecurity_threats": "A.17.technology_adoption_and_digital_pulse",
  "A.6.tech.semiconductor_supply": "A.17.technology_adoption_and_digital_pulse",
  "A.7.city_pulse.micro_area_change": "A.7.city_pulse_and_urban_pressure",
  "A.7.city_pulse.gentrification_index": "A.7.city_pulse_and_urban_pressure",
  "A.7.city_pulse.crime_rate_trends": "A.27.safety_and_incident_risk",
  "A.8.health.pandemic_risk": "A.28.public_health_and_environmental_exposure",
  "A.8.health.healthcare_capacity": "A.28.public_health_and_environmental_exposure",
  "A.8.health.drug_shortages": "A.28.public_health_and_environmental_exposure",
  "A.9.travel.disruption_risk": "A.9.travel_flows_and_disruption",
  "A.9.travel.tourism_intensity": "A.9.travel_flows_and_disruption",
  "A.9.travel.flight_cancellations": "A.9.travel_flows_and_disruption",
  "A.10.consumer.retail_spending": "A.16.consumer_sentiment_and_attention_economics",
  "A.10.consumer.ecommerce_growth": "A.17.technology_adoption_and_digital_pulse",
  "A.10.consumer.consumer_confidence": "A.16.consumer_sentiment_and_attention_economics",
  "A.11.geopolitics.trade_tensions": "A.21.trade_supply_and_disruption_signals",
  "A.11.geopolitics.supply_chain_disruption": "A.21.trade_supply_and_disruption_signals",
  "A.11.geopolitics.election_volatility": "A.24.governance_policy_and_public_timeline",
  "A.12.cost_of_living.inflation_pressure": "A.11.cost_of_living_and_price_pressure",
  "A.12.cost_of_living.grocery_basket_cost": "A.11.cost_of_living_and_price_pressure",
  "A.12.cost_of_living.housing_affordability": "A.12.housing_and_real_estate_signals",
  "A.13.sports.match_outcomes": SPORTS_MATCH_OUTCOMES_DOMAIN,
};

const COMPATIBLE_CARD_TYPE_ALIASES = {
  prediction_summary: "forecast_band",
  drivers_breakdown: "forecast_band",
  ranked_list: "rank_compare",
  tradeoff_plan: "decision_tradeoff",
  risk_band: "risk_band",
  scenario_set: "scenario_set",
  sports_fixture_board: "rank_compare",
};

const CATALOG_DOMAIN_IDS = CATALOG_DOMAINS.map((domain) => domain.domain_id);
const CATALOG_DOMAIN_INDEX = Object.fromEntries(CATALOG_DOMAINS.map((domain) => [domain.domain_id, domain]));
const SOURCE_INDEX = Object.fromEntries(SOURCE_REGISTRY.map((source) => [source.source_id, source]));

function resolveDomainId(domainId, fallback = GENERAL_FORECAST_DOMAIN) {
  const normalized = typeof domainId === "string" ? domainId.trim() : "";
  if (CATALOG_DOMAIN_INDEX[normalized]) {
    return normalized;
  }
  if (LEGACY_DOMAIN_ALIASES[normalized]) {
    return LEGACY_DOMAIN_ALIASES[normalized];
  }
  return fallback;
}

function isSupportedDomain(domainId) {
  const resolved = resolveDomainId(domainId, "");
  return Boolean(resolved && CATALOG_DOMAIN_INDEX[resolved]);
}

function resolveCardTypeId(cardTypeId, fallback = "forecast_band") {
  const normalized = typeof cardTypeId === "string" ? cardTypeId.trim() : "";
  if (!normalized) return fallback;
  const compatible = COMPATIBLE_CARD_TYPE_ALIASES[normalized];
  if (compatible) return compatible;
  return STANDARD_CARD_TYPES.some((cardType) => cardType.card_type_id === normalized) ? normalized : fallback;
}

function getDomain(domainId, fallback = GENERAL_FORECAST_DOMAIN) {
  return CATALOG_DOMAIN_INDEX[resolveDomainId(domainId, fallback)] || CATALOG_DOMAIN_INDEX[fallback];
}

function getDomainCardTypes(domainId) {
  const domain = getDomain(domainId);
  return Array.isArray(domain?.allowed_card_types) && domain.allowed_card_types.length > 0
    ? domain.allowed_card_types
    : ["forecast_band"];
}

function summarizeSources(sourceIds = []) {
  return sourceIds
    .map((sourceId) => SOURCE_INDEX[sourceId])
    .filter(Boolean)
    .map((source) => ({
      source_id: source.source_id,
      title: source.title,
      status: source.status,
      implementation_status: source.implementation_status,
      access_profile: source.access_profile,
    }));
}

function getCatalogRegistryPayload() {
  return {
    catalog_version_id: CATALOG_VERSION_ID,
    policy_profile: POLICY_PROFILE,
    generated_at: GENERATED_AT,
    standard_card_types: STANDARD_CARD_TYPES,
    domains: CATALOG_DOMAINS.map((domain) => ({
      ...domain,
      source_registry: summarizeSources(domain.source_allowlist),
    })),
    candidate_paid_or_restricted_sources: CANDIDATE_RESTRICTED_SOURCES,
  };
}

function getSourceRegistryPayload() {
  return {
    catalog_version_id: CATALOG_VERSION_ID,
    policy_profile: POLICY_PROFILE,
    generated_at: GENERATED_AT,
    approved_sources: SOURCE_REGISTRY,
    candidate_paid_or_restricted_sources: CANDIDATE_RESTRICTED_SOURCES,
  };
}

function toAvailabilityState(domainState) {
  if (domainState === "published") return "available";
  if (domainState === "limited") return "limited";
  return "blocked";
}

function toFreshnessState(domainState) {
  if (domainState === "published") return "ok";
  if (domainState === "limited") return "borderline";
  return "stale";
}

function toSufficiencyState(domainState) {
  if (domainState === "published") return "ok";
  if (domainState === "limited") return "partial";
  return "insufficient";
}

function buildCoverageLedger() {
  const nowIso = new Date().toISOString();
  return CATALOG_DOMAINS.flatMap((domain) => {
    const entityTypes = domain.allowed_entity_types.slice(0, 2);
    const horizons = domain.supported_horizons.slice(0, 3);
    const cardTypes = domain.allowed_card_types.slice(0, 3);

    return entityTypes.flatMap((entityType) =>
      horizons.flatMap((horizonBucket) =>
        cardTypes.map((cardTypeId) => ({
          coverage_unit_id: `${domain.domain_id}:${entityType}:${horizonBucket}:${cardTypeId}`,
          macro_area_id: domain.macro_area_id,
          block: domain.block,
          domain_id: domain.domain_id,
          entity_type: entityType,
          horizon_bucket: horizonBucket,
          card_type_id: cardTypeId,
          availability_status: toAvailabilityState(domain.current_state),
          freshness_cadence_expected: domain.refresh_cadence,
          freshness_status_latest: toFreshnessState(domain.current_state),
          sufficiency_status_latest: toSufficiencyState(domain.current_state),
          last_success_ts: domain.current_state === "blocked" ? null : nowIso,
          fail_reason_top: domain.current_state === "published" ? null : domain.status_reason,
          target_wave: domain.target_wave,
        }))
      )
    );
  });
}

function getCoverageSnapshot() {
  const ledger = buildCoverageLedger();
  const total = ledger.length;
  const availableCount = ledger.filter((item) => item.availability_status === "available").length;
  const limitedCount = ledger.filter((item) => item.availability_status === "limited").length;
  const blockedCount = ledger.filter((item) => item.availability_status === "blocked").length;
  const advancedCardTypes = new Set(["scenario_set", "rank_compare", "analog_evidence", "decision_tradeoff"]);
  const advancedAvailableCount = ledger.filter(
    (item) => item.availability_status === "available" && advancedCardTypes.has(item.card_type_id)
  ).length;
  const freshnessOkCount = ledger.filter((item) => item.freshness_status_latest === "ok").length;

  return {
    catalog_version_id: CATALOG_VERSION_ID,
    policy_profile: POLICY_PROFILE,
    generated_at: GENERATED_AT,
    totals: {
      coverage_units: total,
      domains: CATALOG_DOMAINS.length,
      published_domains: CATALOG_DOMAINS.filter((domain) => domain.current_state === "published").length,
      limited_domains: CATALOG_DOMAINS.filter((domain) => domain.current_state === "limited").length,
      blocked_domains: CATALOG_DOMAINS.filter((domain) => domain.current_state === "blocked").length,
    },
    scores: {
      coverage_score: total > 0 ? Number((availableCount / total).toFixed(3)) : 0,
      depth_score: total > 0 ? Number((advancedAvailableCount / total).toFixed(3)) : 0,
      freshness_score: availableCount > 0 ? Number((freshnessOkCount / availableCount).toFixed(3)) : 0,
    },
    availability: {
      available: availableCount,
      limited: limitedCount,
      blocked: blockedCount,
    },
  };
}

function getHealthSummary() {
  const snapshot = getCoverageSnapshot();
  return {
    catalogVersionId: snapshot.catalog_version_id,
    policyProfile: snapshot.policy_profile,
    generatedAt: snapshot.generated_at,
    domains: snapshot.totals.domains,
    publishedDomains: snapshot.totals.published_domains,
    limitedDomains: snapshot.totals.limited_domains,
    blockedDomains: snapshot.totals.blocked_domains,
    coverageUnits: snapshot.totals.coverage_units,
    coverageScore: snapshot.scores.coverage_score,
    depthScore: snapshot.scores.depth_score,
    freshnessScore: snapshot.scores.freshness_score,
  };
}

function getSourceHealthSummary() {
  const approvedSources = SOURCE_REGISTRY.filter((source) => source.status === "approved");
  const implementedSources = approvedSources.filter((source) => source.implementation_status === "implemented");
  const registryOnlySources = approvedSources.filter((source) => source.implementation_status !== "implemented");
  return {
    approvedSources: approvedSources.length,
    implementedSources: implementedSources.length,
    registryOnlySources: registryOnlySources.length,
    restrictedCandidates: CANDIDATE_RESTRICTED_SOURCES.length,
    policyProfile: POLICY_PROFILE,
    connectors: approvedSources.map((source) => ({
      source_id: source.source_id,
      title: source.title,
      category: source.category,
      implementation_status: source.implementation_status,
      status: source.status,
    })),
  };
}

module.exports = {
  GENERAL_FORECAST_DOMAIN,
  SPORTS_MATCH_OUTCOMES_DOMAIN,
  CATALOG_VERSION_ID,
  POLICY_PROFILE,
  STANDARD_CARD_TYPES,
  SOURCE_REGISTRY,
  CANDIDATE_RESTRICTED_SOURCES,
  CATALOG_DOMAINS,
  CATALOG_DOMAIN_IDS,
  LEGACY_DOMAIN_ALIASES,
  resolveDomainId,
  resolveCardTypeId,
  isSupportedDomain,
  getDomain,
  getDomainCardTypes,
  getCatalogRegistryPayload,
  getSourceRegistryPayload,
  buildCoverageLedger,
  getCoverageSnapshot,
  getHealthSummary,
  getSourceHealthSummary,
};
