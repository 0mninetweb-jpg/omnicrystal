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
  "A.0.general.general_forecast": [
    "broad pressure",
    "big picture",
    "overall outlook",
    "most likely to shape",
    "big picture outlook",
  ],
  "A.1.weather_and_atmosphere": [
    "rain",
    "rainy",
    "weather",
    "storm",
    "weekend weather",
    "stay rainy",
  ],
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
    "price pressure",
    "affordability",
    "expensive",
    "cheap",
    "grocery basket",
    "household bills",
    "rents",
    "groceries",
  ],
  "A.12.housing_and_real_estate_signals": [
    "rent",
    "rents",
    "renting",
    "home prices",
    "house prices",
    "property prices",
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
  ],
  "A.2.climate_hazards_and_disaster_risk": [
    "flood",
    "wildfire",
    "drought",
    "hazard window",
    "disaster risk",
    "heatwave",
    "storm surge",
    "sicily",
    "southern italy",
  ],
  "A.3.water_and_hydrology_signals": [
    "water stress",
    "hydrology",
    "river basin",
    "po basin",
    "reservoir",
    "drought pressure",
    "flood pressure",
  ],
  "A.4.environment_and_exposure": [
    "environmental exposure",
    "heat island",
    "heat-island",
    "urban heat",
    "exposure risk",
    "air pollution",
    "air quality exposure",
  ],
  "A.5.food_security_and_staple_prices": [
    "food security",
    "staple",
    "staple prices",
    "grocery basket",
    "households",
    "affordability shock",
    "food prices",
    "low-income households",
  ],
  "A.13.energy_and_utilities_markets": [
    "energy",
    "electricity",
    "gas",
    "oil",
    "utility bill",
    "utility price",
    "power price",
    "grid",
    "tariff",
    "outage",
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
  "A.16.consumer_sentiment_and_attention_economics": [
    "consumer sentiment",
    "consumer confidence",
    "consumers",
    "attention economy",
    "retail mood",
  ],
  "A.18.education_system_and_skills_pipeline": [
    "exam",
    "exam bottleneck",
    "students",
    "school year",
    "education system",
    "skills pipeline",
  ],
  "A.10.connectivity_and_network_quality_signals": [
    "network outage",
    "connectivity reliability",
    "network quality",
    "internet outage",
    "broadband",
    "connectivity",
  ],
  "A.9.travel_flows_and_disruption": [
    "travel",
    "visit",
    "best time to visit",
    "travel window",
    "trip",
    "tourism",
    "flight",
    "hotel",
    "destination",
    "airport",
    "tokyo",
    "vacation",
  ],
  "A.8.mobility_congestion_and_accessibility": [
    "mobility congestion",
    "transit accessibility",
    "accessibility pressure",
    "commute reliability",
    "transit pressure",
  ],
  "A.27.safety_and_incident_risk": [
    "safety",
    "security",
    "crime",
    "danger",
    "incident",
    "crowd risk",
    "derby weekend",
    "hotspot",
    "unsafe",
    "secure",
    "risky",
    "go out",
    "concert security",
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
  "A.21.trade_supply_and_disruption_signals": [
    "trade disruption",
    "shipping bottlenecks",
    "shipping bottleneck",
    "supply chain",
    "port congestion",
    "freight disruption",
  ],
  "A.19.demographics_and_migration_pressure": [
    "migration",
    "population",
    "aging",
    "ageing",
    "fertility",
    "urbanization",
    "demographic pressure",
    "demographics",
  ],
  "A.26.human_history_and_long_run_analogs": [
    "historical analog",
    "historical analogue",
    "long-run analog",
    "long run analog",
    "regime similarity",
    "recurrence",
    "analog match",
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
    "open a cafe",
    "open a caf",
    "should i open",
    "launch",
    "survive 12 months",
  ],
  "B.3.1.love_and_social_outcomes": [
    "new relationship",
    "relationship",
    "social connection",
    "my circle",
    "circle this spring",
    "love outlook",
    "social outlook",
    "stabilize over the next 6 months",
  ],
  "B.3.2.study_and_exams_outcomes": [
    "pass my exam",
    "pass the exam",
    "exam prep",
    "study pressure",
    "study plan",
    "exam session",
    "this session",
    "exam outcome",
  ],
  "B.3.6.sports_outcomes_probability_mode": [
    "should i back",
    "back juventus",
    "back inter",
    "bet on",
    "support juventus",
    "support inter",
  ],
  "B.3.7.travel_personal_outcomes": [
    "should i visit",
    "should i go to",
    "my trip",
    "travel decision",
    "best window to travel",
    "when is the best window",
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
  "C.1.attention_waves": [
    "attention wave",
    "media momentum",
    "search momentum",
    "search and media momentum",
    "attention cycle",
  ],
  "C.2.event_pressure_forecast": [
    "event pressure",
    "crowding",
    "festival",
    "concert crowding",
    "queue",
    "venue",
    "stadium pressure",
    "sold out",
    "weekend event",
    "ticket demand",
    "san siro",
  ],
  "A.30.culture_events_and_attention": [
    "cultural buzz",
    "culture buzz",
    "event attention",
    "festival buzz",
    "concert buzz",
    "concert crowding",
  ],
  "C.3.hype_curve_tracker": [
    "hype curve",
    "hype cycle",
    "peaking this quarter",
    "narrative saturation",
    "decay risk",
  ],
  "C.4.global_quote_stream": [
    "quote stream",
    "global quote stream",
    "quote flow",
    "current quote stream",
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
  "B.3.1.love_and_social_outcomes": [
    "A.7.city_pulse_and_urban_pressure",
    "A.16.consumer_sentiment_and_attention_economics",
    "A.30.culture_events_and_attention",
  ],
  "B.3.2.study_and_exams_outcomes": [
    "A.18.education_system_and_skills_pipeline",
    "A.16.consumer_sentiment_and_attention_economics",
    "A.17.technology_adoption_and_digital_pulse",
  ],
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

const BATCH3_DECISION_DOMAINS = new Set([
  "B.3.1.love_and_social_outcomes",
  "B.3.2.study_and_exams_outcomes",
  "B.3.3.work_and_career_outcomes",
  "B.3.4.personal_finance_outcomes",
  "B.3.5.business_idea_outcomes",
  "B.3.8.personal_decisions_and_tradeoffs",
]);

const BATCH3_TARGETED_PROVIDER_IDS = {
  "A.1.weather_and_atmosphere": ["open_meteo", "nominatim"],
  "A.2.climate_hazards_and_disaster_risk": ["open_meteo", "rss_allowlist", "google_trends"],
  "A.4.environment_and_exposure": ["open_meteo", "nominatim", "overpass"],
  "A.8.mobility_congestion_and_accessibility": ["gtfs_static", "gtfs_realtime"],
  "A.9.travel_flows_and_disruption": ["opensky", "gtfs_static"],
  "A.11.cost_of_living_and_price_pressure": ["eurostat_api", "google_trends"],
  "A.12.housing_and_real_estate_signals": ["eurostat_api", "nominatim", "overpass", "private_listing_feed"],
  "A.13.energy_and_utilities_markets": ["fred_api", "yahoo_finance", "google_trends"],
  "A.14.macro_economy_and_cycles": ["fred_api", "eurostat_api"],
  "A.15.jobs_and_labor_market_signals": ["oecd_api", "eurostat_api", "google_trends"],
  "A.19.demographics_and_migration_pressure": ["world_bank_api", "google_trends", "eurostat_api"],
  "A.20.infrastructure_and_logistics_reliability": ["gtfs_static", "gtfs_realtime", "overpass"],
  "A.21.trade_supply_and_disruption_signals": ["rss_allowlist", "world_bank_api", "eurostat_api"],
  "A.22.industry_and_business_cycles": ["oecd_api", "eurostat_api", "google_trends"],
  "A.25.geopolitics_and_conflict_dynamics": ["gdelt", "rss_allowlist", "google_trends", "acled"],
  "A.28.public_health_and_environmental_exposure": ["open_meteo", "rss_allowlist", "google_trends"],
  "A.30.culture_events_and_attention": ["google_trends", "rss_allowlist", "gtfs_static"],
  "B.3.1.love_and_social_outcomes": ["wikidata", "gdelt", "rss_allowlist", "google_trends"],
  "B.3.2.study_and_exams_outcomes": ["wikidata", "gdelt", "rss_allowlist", "google_trends"],
  "B.3.4.personal_finance_outcomes": ["yahoo_finance", "google_trends", "eurostat_api", "private_listing_feed"],
  "B.3.7.travel_personal_outcomes": ["opensky", "gtfs_static"],
  "B.3.8.personal_decisions_and_tradeoffs": ["nominatim", "overpass", "gtfs_static", "google_trends"],
  "C.2.event_pressure_forecast": ["gtfs_static", "gtfs_realtime", "google_trends"],
};

const BATCH3_DOMAIN_PACK_HINTS = {
  "A.1.weather_and_atmosphere": {
    phrases: ["rainy", "rain", "storm window", "this weekend", "temperature swing", "rome"],
    stillThinReason: "weather_window_signal_blend_still_too_thin",
  },
  "A.0.general.general_forecast": {
    phrases: ["broad pressure", "big picture", "overall outlook", "broad outlook", "most likely to shape", "everything this year", "europe next quarter"],
    stillThinReason: "broad_outlook_still_needs_clearer_domain_split",
  },
  "A.2.climate_hazards_and_disaster_risk": {
    phrases: ["flood", "wildfire", "drought", "hazard window", "sicily", "southern italy"],
    stillThinReason: "hazard_window_stack_still_needs_multi-hazard_alignment",
  },
  "A.3.water_and_hydrology_signals": {
    phrases: ["water stress", "hydrology", "river basin", "po basin", "drought pressure", "flood pressure"],
    stillThinReason: "hydrology_stack_still_needs_basin_level_confirmation",
  },
  "A.4.environment_and_exposure": {
    phrases: ["air pollution", "heat island", "exposure", "milan", "pollution", "air quality exposure"],
    stillThinReason: "exposure_stack_still_needs_weather_and_location_alignment",
  },
  "A.8.mobility_congestion_and_accessibility": {
    phrases: ["mobility congestion", "transit accessibility", "commute reliability", "transit pressure"],
    stillThinReason: "mobility_stack_still_needs_geo_and_transit_depth",
  },
  "A.10.connectivity_and_network_quality_signals": {
    phrases: ["network outage", "connectivity reliability", "connectivity", "reliability", "network quality", "internet outage", "broadband", "station area"],
    stillThinReason: "connectivity_stack_still_needs_network_and_access_alignment",
  },
  "A.9.travel_flows_and_disruption": {
    phrases: ["best time to visit", "travel window", "flight pressure", "destination risk", "travel disruption"],
    stillThinReason: "travel_stack_still_needs_route_and_airflow_alignment",
  },
  "A.5.food_security_and_staple_prices": {
    phrases: ["staple price", "food security", "grocery basket", "households", "affordability shock", "seasonal supply"],
    stillThinReason: "food_stack_needs_household_and_price_depth",
  },
  "A.11.cost_of_living_and_price_pressure": {
    phrases: ["cost of living", "household price pressure", "household bills", "affordability", "grocery basket"],
    stillThinReason: "household_pressure_stack_still_missing_reinforcement",
  },
  "A.12.housing_and_real_estate_signals": {
    phrases: ["rent", "rents", "mortgage", "housing", "real estate", "milan", "rome", "supply demand"],
    stillThinReason: "housing_local_depth_still_partial",
  },
  "A.13.energy_and_utilities_markets": {
    phrases: ["energy", "electricity", "gas", "utility price", "power price", "grid", "tariff"],
    stillThinReason: "energy_stack_still_missing_macro_and_market_confirmation",
  },
  "A.14.macro_economy_and_cycles": {
    phrases: ["inflation", "ecb", "rates", "yield", "macro", "liquidity"],
    stillThinReason: "macro_cycle_stack_still_needs_clearer_live_alignment",
  },
  "A.15.jobs_and_labor_market_signals": {
    phrases: ["jobs", "salary", "salaries", "labor market", "hiring", "wage pressure"],
    stillThinReason: "labor_stack_still_needs_wage_and_cycle_confirmation",
  },
  "A.16.consumer_sentiment_and_attention_economics": {
    phrases: ["consumer sentiment", "attention economy", "consumers", "attention pressure", "consumer confidence"],
    stillThinReason: "consumer_attention_split_still_too_shallow",
  },
  "A.17.technology_adoption_and_digital_pulse": {
    phrases: ["digital adoption", "digital adoption pulse", "technology adoption", "ai adoption", "europe this year", "digital pulse"],
    stillThinReason: "adoption_stack_still_needs_usage_and_attention_alignment",
  },
  "A.18.education_system_and_skills_pipeline": {
    phrases: ["exam bottleneck", "students", "skills pipeline", "school year", "education system"],
    stillThinReason: "education_pipeline_stack_still_needs_attention_and_timeline_alignment",
  },
  "A.19.demographics_and_migration_pressure": {
    phrases: ["migration", "population", "aging", "fertility", "demographic pressure", "urbanization", "aging pressure", "dependency ratio"],
    stillThinReason: "demographic_stack_still_needs_structural_and_attention_confirmation",
  },
  "A.20.infrastructure_and_logistics_reliability": {
    phrases: ["infrastructure", "logistics", "reliability", "corridor", "outage", "transit dependency"],
    stillThinReason: "infrastructure_public_feed_blend_still_partial",
  },
  "A.21.trade_supply_and_disruption_signals": {
    phrases: ["shipping", "bottlenecks", "supply chain", "trade disruption", "freight", "port congestion"],
    stillThinReason: "trade_stack_still_needs_supply_and_macro_confirmation",
  },
  "A.22.industry_and_business_cycles": {
    phrases: ["business cycle", "sector pressure", "industry demand", "tech sector", "manufacturing cycle"],
    stillThinReason: "industry_cycle_stack_still_needs_demand_confirmation",
  },
  "A.25.geopolitics_and_conflict_dynamics": {
    phrases: ["conflict", "escalate", "sanctions", "force posture", "ukraine", "russia", "ceasefire", "taiwan strait", "geopolitical risk", "spillover", "blockade"],
    stillThinReason: "conflict_monitoring_depth_still_partial",
  },
  "A.24.governance_policy_and_public_timeline": {
    phrases: ["election volatility", "budget vote", "coalition", "policy timeline", "government", "public timeline", "actor alignment", "public calendar", "vote timing"],
    stillThinReason: "policy_timeline_stack_still_needs_actor_and_attention_alignment",
  },
  "A.26.human_history_and_long_run_analogs": {
    phrases: ["historical analog", "long-run analog", "regime similarity", "recurrence", "baseline versus current"],
    stillThinReason: "analog_match_set_still_selective",
  },
  "A.27.safety_and_incident_risk": {
    phrases: ["incident risk", "station area", "safety", "crime", "unsafe", "hotspot"],
    stillThinReason: "safety_stack_still_needs_local_and_news_alignment",
  },
  "A.28.public_health_and_environmental_exposure": {
    phrases: ["public health", "winter", "exposure", "air quality", "pollution", "illness pressure"],
    stillThinReason: "public_health_signal_blend_still_partial",
  },
  "A.30.culture_events_and_attention": {
    phrases: ["culture buzz", "cultural buzz", "festival buzz", "concert buzz", "event attention"],
    stillThinReason: "culture_event_stack_still_needs_attention_and_transit_alignment",
  },
  "B.3.3.work_and_career_outcomes": {
    phrases: ["job offer", "career move", "salary trajectory", "changing company", "new job"],
    stillThinReason: "career_tradeoff_inputs_incomplete",
  },
  "B.3.4.personal_finance_outcomes": {
    phrases: ["bitcoin", "savings", "mortgage", "buy now", "cash buffer", "risk horizon"],
    stillThinReason: "personal_finance_inputs_incomplete",
  },
  "B.3.5.business_idea_outcomes": {
    phrases: ["startup", "runway", "demand", "competition", "local conditions", "survive 12 months"],
    stillThinReason: "business_runway_and_demand_inputs_incomplete",
  },
  "B.3.1.love_and_social_outcomes": {
    phrases: ["new relationship", "relationship", "social connection", "my circle", "stabilize", "this spring", "next 6 months"],
    stillThinReason: "social_signal_still_needs_clearer_reciprocity_map",
  },
  "B.3.2.study_and_exams_outcomes": {
    phrases: ["pass my exam", "exam prep", "study pressure", "this session", "next 30 days", "study plan"],
    stillThinReason: "exam_signal_still_needs_clearer_prep_and_timeline_map",
  },
  "B.3.8.personal_decisions_and_tradeoffs": {
    phrases: ["move to", "wait", "timing", "cost", "opportunity loss", "reversibility"],
    stillThinReason: "tradeoff_inputs_not_specific_enough",
  },
  "C.2.event_pressure_forecast": {
    phrases: ["event pressure", "concert crowding", "stadium pressure", "queue", "venue", "san siro"],
    stillThinReason: "event_pressure_stack_still_needs_transit_and_attention_alignment",
  },
  "C.1.attention_waves": {
    phrases: ["attention wave", "media momentum", "search momentum", "attention cycle", "next 30 days"],
    stillThinReason: "attention_wave_split_still_too_shallow",
  },
  "C.3.hype_curve_tracker": {
    phrases: ["hype curve", "peaking this quarter", "hype cycle", "decay risk", "narrative saturation"],
    stillThinReason: "hype_curve_stack_still_needs_momentum_and_decay_alignment",
  },
  "C.4.global_quote_stream": {
    phrases: ["quote stream", "quote flow", "current quote stream", "global quote", "rate cuts", "ecb rate cuts", "this week"],
    stillThinReason: "quote_stream_density_still_too_shallow",
  },
};

const PACK_STRENGTH_ORDER = {
  focused: 1,
  aligned: 2,
  strong: 3,
};

const EDGE_DIRECTIONAL_CONVERGENCE_LIFTS = {
  "A.0.general.general_forecast": {
    phrases: ["big picture", "overall outlook", "broad outlook", "everything this year", "europe next quarter"],
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "google_trends"],
    minPackStrength: "strong",
    minPhraseHits: 2,
    minBaseAgreement: 0.72,
    maxBaseConflict: 0.36,
    agreementBoost: 0.08,
    conflictReduction: 0.1,
    convergenceBonus: 0.05,
  },
  "A.10.connectivity_and_network_quality_signals": {
    phrases: ["connectivity reliability", "connectivity", "reliability", "network quality", "internet outage", "broadband"],
    requiredSources: ["nominatim", "overpass", "gtfs_static", "gtfs_realtime"],
    minPackStrength: "aligned",
    minPhraseHits: 2,
    minBaseAgreement: 0.72,
    maxBaseConflict: 0.36,
    agreementBoost: 0.09,
    conflictReduction: 0.1,
    convergenceBonus: 0.05,
  },
  "A.17.technology_adoption_and_digital_pulse": {
    phrases: ["digital adoption", "digital adoption pulse", "technology adoption", "ai adoption", "europe this year"],
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "google_trends"],
    minPackStrength: "strong",
    minPhraseHits: 2,
    minBaseAgreement: 0.72,
    maxBaseConflict: 0.36,
    agreementBoost: 0.08,
    conflictReduction: 0.09,
    convergenceBonus: 0.05,
  },
  "C.4.global_quote_stream": {
    phrases: ["quote stream", "global quote stream", "current quote stream", "rate cuts", "ecb rate cuts", "this week"],
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "google_trends"],
    minPackStrength: "strong",
    minPhraseHits: 2,
    minBaseAgreement: 0.72,
    maxBaseConflict: 0.36,
    agreementBoost: 0.09,
    conflictReduction: 0.1,
    convergenceBonus: 0.06,
  },
  "A.24.governance_policy_and_public_timeline": {
    phrases: ["election volatility", "budget vote", "coalition", "policy timeline", "government", "public timeline", "italy", "next 90 days"],
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "google_trends"],
    minPackStrength: "aligned",
    minPhraseHits: 2,
    minBaseAgreement: 0.72,
    maxBaseConflict: 0.35,
    agreementBoost: 0.08,
    conflictReduction: 0.09,
    convergenceBonus: 0.05,
  },
  "A.25.geopolitics_and_conflict_dynamics": {
    phrases: ["taiwan strait", "geopolitical risk", "conflict", "escalation", "sanctions", "force posture", "spillover"],
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "google_trends"],
    minPackStrength: "aligned",
    minPhraseHits: 2,
    minBaseAgreement: 0.72,
    maxBaseConflict: 0.35,
    agreementBoost: 0.08,
    conflictReduction: 0.09,
    convergenceBonus: 0.05,
  },
  "B.3.1.love_and_social_outcomes": {
    phrases: ["new relationship", "social connection", "my circle", "stabilize", "this spring", "next 6 months"],
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "google_trends"],
    minPackStrength: "aligned",
    minPhraseHits: 2,
    minBaseAgreement: 0.72,
    maxBaseConflict: 0.35,
    agreementBoost: 0.08,
    conflictReduction: 0.09,
    convergenceBonus: 0.05,
  },
  "B.3.2.study_and_exams_outcomes": {
    phrases: ["pass my exam", "exam prep", "study pressure", "this session", "next 30 days", "exam outcome"],
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "google_trends"],
    minPackStrength: "aligned",
    minPhraseHits: 2,
    minBaseAgreement: 0.72,
    maxBaseConflict: 0.35,
    agreementBoost: 0.08,
    conflictReduction: 0.09,
    convergenceBonus: 0.05,
  },
};

const DECISION_AXIS_RULES = {
  "B.3.1.love_and_social_outcomes": {
    reciprocity: [/\brelationship\b/i, /\bsocial connection\b/i, /\bmutual\b/i, /\breciprocity\b/i],
    timeline: [/\bthis spring\b/i, /\bnext 6 months\b/i, /\bnext few months\b/i, /\bthis season\b/i],
    circle_stability: [/\bmy circle\b/i, /\bsocial circle\b/i, /\bfriend group\b/i, /\bnew relationship\b/i],
    emotional_availability: [/\bopen\b/i, /\bavailable\b/i, /\bstabilize\b/i, /\bstable\b/i],
  },
  "B.3.2.study_and_exams_outcomes": {
    prep_depth: [/\bstudy pressure\b/i, /\bexam prep\b/i, /\bstudy plan\b/i, /\brevision\b/i],
    bottlenecks: [/\bbottleneck\b/i, /\bweak spot\b/i, /\bdifficult topic\b/i, /\bexam\b/i],
    timeline: [/\bthis session\b/i, /\bnext 30 days\b/i, /\bthis spring\b/i, /\bdeadline\b/i],
    consistency: [/\bconsisten/i, /\bdaily\b/i, /\broutine\b/i, /\bprep\b/i],
  },
  "B.3.3.work_and_career_outcomes": {
    salary: [/\bsalary\b/i, /\bpay\b/i, /\bcompensation\b/i],
    stability: [/\bjob offer\b/i, /\bnew job\b/i, /\baccept\b/i, /\bcompany\b/i],
    commute: [/\brome\b/i, /\broma\b/i, /\bmilan\b/i, /\bmilano\b/i, /\bcommute\b/i],
    career_trajectory: [/\bcareer\b/i, /\bpromotion\b/i, /\btrajectory\b/i],
  },
  "B.3.4.personal_finance_outcomes": {
    horizon: [/\bnow\b/i, /\bthis year\b/i, /\bwait\b/i, /\bnext\b/i],
    risk: [/\bbitcoin\b/i, /\bcrypto\b/i, /\brisk\b/i, /\bvolatile\b/i],
    cash_buffer: [/\bsavings\b/i, /\bcash\b/i, /\bbuffer\b/i],
    debt: [/\bmortgage\b/i, /\bdebt\b/i, /\brate\b/i],
  },
  "B.3.5.business_idea_outcomes": {
    runway: [/\brunway\b/i, /\bsurvive\b/i, /\b12 months\b/i, /\bnext 12 months\b/i],
    demand: [/\bdemand\b/i, /\bcafe\b/i, /\bstartup\b/i, /\bbusiness\b/i, /\bcustomers?\b/i, /\bfoot traffic\b/i],
    competition: [/\bcompetition\b/i, /\bcompetitive\b/i, /\bmarket fit\b/i, /\bnearby\b/i, /\bsaturated\b/i],
    local_conditions: [/\brome\b/i, /\broma\b/i, /\blocal\b/i, /\bneighborhood\b/i, /\blease\b/i, /\brent\b/i],
  },
  "B.3.8.personal_decisions_and_tradeoffs": {
    timing: [/\bthis year\b/i, /\bwait\b/i, /\bnow\b/i, /\btiming\b/i, /\bsix months\b/i],
    cost: [/\bcost\b/i, /\bprice\b/i, /\brent\b/i, /\bbuy\b/i, /\bmonthly\b/i],
    opportunity_loss: [/\bwait\b/i, /\bor wait\b/i, /\bdelay\b/i, /\bopportunity loss\b/i, /\bopportunity cost\b/i],
    reversibility: [/\bmove\b/i, /\bswitch\b/i, /\breversible\b/i, /\bundo\b/i, /\bchange back\b/i],
  },
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

const DEFAULT_AS_OF_TIMEZONE = "Europe/Rome";
const CALENDAR_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RELATIVE_EVENT_DATE_LABELS = new Set([
  "Spring",
  "Summer",
  "Autumn",
  "Winter",
  "This week",
  "This weekend",
  "This month",
  "This quarter",
  "Next quarter",
  "Next 90 days",
  "Next 6 months",
  "Within 12 months",
  "Today",
  "Tomorrow",
]);
const ABSOLUTE_DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/i,
  /\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})\b/i,
  /\b(?:\d{1,2}\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+\d{1,2})?(?:,?\s+\d{4})?\b/i,
];
const RELATIVE_TIME_RULES = [
  {
    key: "today",
    patterns: [/\btoday\b/i, /\boggi\b/i],
    resolve(anchorLocalDate) {
      return buildSingleDateWindow(anchorLocalDate);
    },
  },
  {
    key: "tomorrow",
    patterns: [/\btomorrow\b/i, /\bdomani\b/i],
    resolve(anchorLocalDate) {
      return buildSingleDateWindow(addDaysToLocalDate(anchorLocalDate, 1));
    },
  },
  {
    key: "this_weekend",
    patterns: [/\bthis weekend\b/i, /\bquesto weekend\b/i],
    resolve(anchorLocalDate) {
      const weekStart = getWeekStartLocalDate(anchorLocalDate);
      return buildDateWindow(addDaysToLocalDate(weekStart, 5), addDaysToLocalDate(weekStart, 6));
    },
  },
  {
    key: "this_week",
    patterns: [/\bthis week\b/i, /\bquesta settimana\b/i],
    resolve(anchorLocalDate) {
      const weekStart = getWeekStartLocalDate(anchorLocalDate);
      return buildDateWindow(weekStart, addDaysToLocalDate(weekStart, 6));
    },
  },
  {
    key: "this_month",
    patterns: [/\bthis month\b/i, /\bquesto mese\b/i],
    resolve(anchorLocalDate) {
      return buildDateWindow(getMonthStartLocalDate(anchorLocalDate), getMonthEndLocalDate(anchorLocalDate));
    },
  },
  {
    key: "this_quarter",
    patterns: [/\bthis quarter\b/i, /\bquesto trimestre\b/i],
    resolve(anchorLocalDate) {
      return buildQuarterWindow(anchorLocalDate, 0);
    },
  },
  {
    key: "next_quarter",
    patterns: [/\bnext quarter\b/i, /\bprossimo trimestre\b/i],
    resolve(anchorLocalDate) {
      return buildQuarterWindow(anchorLocalDate, 1);
    },
  },
  {
    key: "next_90_days",
    patterns: [/\bnext 90 days\b/i, /\bprossimi 90 giorni\b/i],
    resolve(anchorLocalDate) {
      return buildDateWindow(anchorLocalDate, addDaysToLocalDate(anchorLocalDate, 89));
    },
  },
  {
    key: "next_6_months",
    patterns: [/\bnext 6 months\b/i, /\bprossimi 6 mesi\b/i],
    resolve(anchorLocalDate) {
      return buildDateWindow(anchorLocalDate, addDaysToLocalDate(addMonthsToLocalDate(anchorLocalDate, 6), -1));
    },
  },
  {
    key: "within_12_months",
    patterns: [/\bwithin 12 months\b/i, /\bentro 12 mesi\b/i, /\bnext 12 months\b/i],
    resolve(anchorLocalDate) {
      return buildDateWindow(anchorLocalDate, addDaysToLocalDate(addMonthsToLocalDate(anchorLocalDate, 12), -1));
    },
  },
  {
    key: "spring",
    patterns: [/\bthis spring\b/i, /\bspring\b/i, /\bquesta primavera\b/i, /\bprimavera\b/i],
    resolve(anchorLocalDate) {
      return buildSeasonWindow("spring", anchorLocalDate);
    },
  },
  {
    key: "summer",
    patterns: [/\bthis summer\b/i, /\bsummer\b/i, /\bquesta estate\b/i, /\bestate\b/i],
    resolve(anchorLocalDate) {
      return buildSeasonWindow("summer", anchorLocalDate);
    },
  },
  {
    key: "autumn",
    patterns: [/\bthis autumn\b/i, /\bthis fall\b/i, /\bautumn\b/i, /\bfall\b/i, /\bquesto autunno\b/i, /\bautunno\b/i],
    resolve(anchorLocalDate) {
      return buildSeasonWindow("autumn", anchorLocalDate);
    },
  },
  {
    key: "winter",
    patterns: [/\bthis winter\b/i, /\bwinter\b/i, /\bquesto inverno\b/i, /\binverno\b/i],
    resolve(anchorLocalDate) {
      return buildSeasonWindow("winter", anchorLocalDate);
    },
  },
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

function clampUnitInterval(value, fallback = 0.5) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
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

function isValidTimeZone(timeZone = "") {
  const candidate = safeText(timeZone);
  if (!candidate) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return true;
  } catch (_error) {
    return false;
  }
}

function normalizeTimeZone(timeZone = "", fallback = DEFAULT_AS_OF_TIMEZONE) {
  const candidate = safeText(timeZone);
  if (isValidTimeZone(candidate)) return candidate;
  return fallback;
}

function getDatePartsInTimeZone(dateInput = new Date(), timeZone = DEFAULT_AS_OF_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(dateInput);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return {
    year: Number.isFinite(year) ? year : 1970,
    month: Number.isFinite(month) ? month : 1,
    day: Number.isFinite(day) ? day : 1,
  };
}

function toLocalDateString({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseLocalDateString(localDate = "") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(safeText(localDate));
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function buildUtcNoonDate(localDate = "") {
  const parsed = parseLocalDateString(localDate);
  if (!parsed) return new Date(Date.UTC(1970, 0, 1, 12));
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0));
}

function addDaysToLocalDate(localDate = "", days = 0) {
  const date = buildUtcNoonDate(localDate);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return toLocalDateString({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function addMonthsToLocalDate(localDate = "", months = 0) {
  const parsed = parseLocalDateString(localDate);
  if (!parsed) return localDate;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0));
  const targetMonth = date.getUTCMonth() + Number(months || 0);
  const year = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const monthIndex = ((targetMonth % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(parsed.day, daysInTargetMonth);
  return toLocalDateString({
    year,
    month: monthIndex + 1,
    day,
  });
}

function getMonthStartLocalDate(localDate = "") {
  const parsed = parseLocalDateString(localDate);
  if (!parsed) return localDate;
  return toLocalDateString({
    year: parsed.year,
    month: parsed.month,
    day: 1,
  });
}

function getMonthEndLocalDate(localDate = "") {
  const parsed = parseLocalDateString(localDate);
  if (!parsed) return localDate;
  const endDate = new Date(Date.UTC(parsed.year, parsed.month, 0, 12, 0, 0));
  return toLocalDateString({
    year: endDate.getUTCFullYear(),
    month: endDate.getUTCMonth() + 1,
    day: endDate.getUTCDate(),
  });
}

function getIsoWeekday(localDate = "") {
  const day = buildUtcNoonDate(localDate).getUTCDay();
  return day === 0 ? 7 : day;
}

function getWeekStartLocalDate(localDate = "") {
  return addDaysToLocalDate(localDate, 1 - getIsoWeekday(localDate));
}

function formatCalendarDateLabel(localDate = "") {
  const parsed = parseLocalDateString(localDate);
  if (!parsed) return "";
  return `${CALENDAR_MONTH_LABELS[parsed.month - 1] || "Jan"} ${parsed.day}, ${parsed.year}`;
}

function formatDateWindowLabel(startDate = "", endDate = "") {
  if (!startDate || !endDate) return "";
  if (startDate === endDate) return formatCalendarDateLabel(startDate);
  const start = parseLocalDateString(startDate);
  const end = parseLocalDateString(endDate);
  if (!start || !end) return "";
  const startMonth = CALENDAR_MONTH_LABELS[start.month - 1] || "Jan";
  const endMonth = CALENDAR_MONTH_LABELS[end.month - 1] || "Jan";
  if (start.year === end.year) {
    return `${startMonth} ${start.day}-${endMonth} ${end.day}, ${start.year}`;
  }
  return `${startMonth} ${start.day}, ${start.year}-${endMonth} ${end.day}, ${end.year}`;
}

function buildDateWindow(startDate = "", endDate = "") {
  return {
    label: formatDateWindowLabel(startDate, endDate),
    start_date: startDate,
    end_date: endDate,
  };
}

function buildSingleDateWindow(localDate = "") {
  return buildDateWindow(localDate, localDate);
}

function buildQuarterWindow(anchorLocalDate = "", quarterShift = 0) {
  const parsed = parseLocalDateString(anchorLocalDate);
  if (!parsed) return null;
  const quarterIndex = Math.floor((parsed.month - 1) / 3) + Number(quarterShift || 0);
  const quarterYear = parsed.year + Math.floor(quarterIndex / 4);
  const normalizedQuarterIndex = ((quarterIndex % 4) + 4) % 4;
  const startMonth = normalizedQuarterIndex * 3 + 1;
  const startDate = toLocalDateString({ year: quarterYear, month: startMonth, day: 1 });
  const endDate = getMonthEndLocalDate(toLocalDateString({ year: quarterYear, month: startMonth + 2, day: 1 }));
  return buildDateWindow(startDate, endDate);
}

function buildSeasonOccurrence(seasonKey = "", seasonYear = 1970) {
  if (seasonKey === "spring") {
    return buildDateWindow(`${seasonYear}-03-01`, `${seasonYear}-05-31`);
  }
  if (seasonKey === "summer") {
    return buildDateWindow(`${seasonYear}-06-01`, `${seasonYear}-08-31`);
  }
  if (seasonKey === "autumn") {
    return buildDateWindow(`${seasonYear}-09-01`, `${seasonYear}-11-30`);
  }
  if (seasonKey === "winter") {
    const endYear = seasonYear + 1;
    const febEnd = new Date(Date.UTC(endYear, 2, 0, 12, 0, 0)).getUTCDate();
    return buildDateWindow(`${seasonYear}-12-01`, `${endYear}-02-${String(febEnd).padStart(2, "0")}`);
  }
  return null;
}

function buildSeasonWindow(seasonKey = "", anchorLocalDate = "") {
  const parsed = parseLocalDateString(anchorLocalDate);
  if (!parsed) return null;
  const candidateYears = [parsed.year - 1, parsed.year, parsed.year + 1];
  const sortedOccurrences = candidateYears
    .map((year) => buildSeasonOccurrence(seasonKey, year))
    .filter(Boolean)
    .sort((left, right) => left.start_date.localeCompare(right.start_date));
  const activeOrUpcoming =
    sortedOccurrences.find((window) => window.end_date >= anchorLocalDate && window.start_date <= anchorLocalDate) ||
    sortedOccurrences.find((window) => window.start_date >= anchorLocalDate) ||
    sortedOccurrences[sortedOccurrences.length - 1] ||
    null;
  return activeOrUpcoming;
}

function isExplicitEventDateValue(eventDate = "") {
  const label = safeText(eventDate);
  if (!label) return false;
  if (RELATIVE_EVENT_DATE_LABELS.has(label)) return false;
  return true;
}

function hasAbsoluteDateReference(queryText = "", eventDate = "") {
  if (isExplicitEventDateValue(eventDate)) return true;
  return ABSOLUTE_DATE_PATTERNS.some((pattern) => pattern.test(queryText));
}

function findRelativeTimeMatch(queryText = "") {
  for (const rule of RELATIVE_TIME_RULES) {
    for (const pattern of rule.patterns || []) {
      const match = pattern.exec(queryText);
      if (match?.[0]) {
        return {
          key: rule.key,
          phrase: match[0],
          resolve: rule.resolve,
        };
      }
    }
  }
  return null;
}

function buildTemporalContext(queryText = "", options = {}) {
  const asOfUtc = safeText(options?.asOfUtc, new Date().toISOString());
  const asOfDate = Number.isNaN(Date.parse(asOfUtc)) ? new Date() : new Date(asOfUtc);
  const asOfTimeZone = normalizeTimeZone(options?.timeZone, DEFAULT_AS_OF_TIMEZONE);
  const asOfLocalDate = toLocalDateString(getDatePartsInTimeZone(asOfDate, asOfTimeZone));
  const eventDate = safeText(options?.eventDate);
  const absoluteDatePresent = hasAbsoluteDateReference(queryText, eventDate);
  const relativeMatch = absoluteDatePresent ? null : findRelativeTimeMatch(queryText);
  const resolvedTimeWindow = relativeMatch ? relativeMatch.resolve(asOfLocalDate) : null;

  return {
    as_of_utc: asOfDate.toISOString(),
    as_of_timezone: asOfTimeZone,
    as_of_local_date: asOfLocalDate,
    uses_relative_time: Boolean(relativeMatch && resolvedTimeWindow),
    relative_phrase: relativeMatch ? safeText(relativeMatch.phrase) : "",
    resolved_time_window:
      relativeMatch && resolvedTimeWindow
        ? {
            label: safeText(resolvedTimeWindow.label),
            start_date: safeText(resolvedTimeWindow.start_date),
            end_date: safeText(resolvedTimeWindow.end_date),
          }
        : null,
  };
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

function getQueryContextText(queryPlan = {}, evidenceBundle = {}, fallback = "") {
  return safeText(
    queryPlan?.original_query ||
      queryPlan?.query ||
      queryPlan?.query_text ||
      evidenceBundle?.query_text ||
      fallback
  );
}

function countPhraseHits(normalizedQuery = "", phrases = []) {
  return (Array.isArray(phrases) ? phrases : []).filter((phrase) => normalizedQuery.includes(normalizeText(phrase))).length;
}

function isBatch3DecisionDomain(domainId = "") {
  return BATCH3_DECISION_DOMAINS.has(safeText(domainId));
}

function extractDecisionAxes(domainId = "", queryText = "") {
  const rules = DECISION_AXIS_RULES[safeText(domainId)] || {};
  const axes = [];
  for (const [axis, patterns] of Object.entries(rules)) {
    if ((patterns || []).some((pattern) => pattern.test(queryText))) {
      axes.push(axis.replace(/_/g, " "));
    }
  }
  return axes;
}

function inferInputCompleteness(domainId = "", decisionAxes = []) {
  const totalAxes = Object.keys(DECISION_AXIS_RULES[safeText(domainId)] || {}).length || 0;
  if (!totalAxes) return 0;
  return Number(clamp01((Array.isArray(decisionAxes) ? decisionAxes.length : 0) / totalAxes, 0).toFixed(3));
}

function inferDecisionReadyState(domainId = "", decisionAxes = [], inputCompleteness = 0) {
  if (!isBatch3DecisionDomain(domainId)) return "";
  const axesCount = Array.isArray(decisionAxes) ? decisionAxes.length : 0;
  if (inputCompleteness >= 0.74 && axesCount >= 3) return "ready";
  if (inputCompleteness >= 0.5 && axesCount >= 2) return "guided";
  return "needs_more_inputs";
}

function inferDecisionBlockerReason(domainId = "", decisionAxes = [], inputCompleteness = 0) {
  if (!isBatch3DecisionDomain(domainId)) return "";
  const rules = DECISION_AXIS_RULES[safeText(domainId)] || {};
  const normalizedAxes = new Set((Array.isArray(decisionAxes) ? decisionAxes : []).map((axis) => safeText(axis)));
  const missingAxes = Object.keys(rules)
    .map((axis) => axis.replace(/_/g, " "))
    .filter((axis) => !normalizedAxes.has(axis));

  if (inputCompleteness >= 0.74 && missingAxes.length <= 1) {
    return "";
  }

  const formattedMissingAxes = missingAxes.slice(0, 3).join(", ");
  if (safeText(domainId) === "B.3.5.business_idea_outcomes") {
    return formattedMissingAxes
      ? `business_decision_needs_clearer_${formattedMissingAxes.replace(/,\s*/g, "_").replace(/\s+/g, "_")}`
      : "business_decision_needs_clearer_runway_and_demand";
  }
  if (safeText(domainId) === "B.3.1.love_and_social_outcomes") {
    return formattedMissingAxes
      ? `social_decision_needs_clearer_${formattedMissingAxes.replace(/,\s*/g, "_").replace(/\s+/g, "_")}`
      : "social_decision_needs_clearer_reciprocity_and_timeline";
  }
  if (safeText(domainId) === "B.3.2.study_and_exams_outcomes") {
    return formattedMissingAxes
      ? `study_decision_needs_clearer_${formattedMissingAxes.replace(/,\s*/g, "_").replace(/\s+/g, "_")}`
      : "study_decision_needs_clearer_prep_depth_and_timeline";
  }
  if (safeText(domainId) === "B.3.8.personal_decisions_and_tradeoffs") {
    return formattedMissingAxes
      ? `tradeoff_decision_needs_clearer_${formattedMissingAxes.replace(/,\s*/g, "_").replace(/\s+/g, "_")}`
      : "tradeoff_decision_needs_clearer_timing_and_reversibility";
  }
  return formattedMissingAxes
    ? `decision_inputs_missing_${formattedMissingAxes.replace(/,\s*/g, "_").replace(/\s+/g, "_")}`
    : "decision_inputs_missing";
}

function inferTargetedProviderUsed(domainId = "", sourceUsage = {}) {
  const providerStates = Array.isArray(sourceUsage?.provider_states) ? sourceUsage.provider_states : [];
  const targetedProviders = BATCH3_TARGETED_PROVIDER_IDS[safeText(domainId)] || [];
  return targetedProviders.some((sourceId) =>
    providerStates.some((provider) => provider.source_id === sourceId && provider.used_in_run === true)
  );
}

function inferDomainPackStrength(domainId = "", queryText = "", evidenceBundle = {}) {
  const normalizedQuery = normalizeText(queryText);
  const pack = BATCH3_DOMAIN_PACK_HINTS[safeText(domainId)];
  if (!pack) return "";
  const sourceLedger = uniqueStrings(evidenceBundle?.source_ledger || []);
  const missingRequiredCount = Array.isArray(evidenceBundle?.source_usage?.missing_required_sources)
    ? evidenceBundle.source_usage.missing_required_sources.length
    : 0;
  const hitCount = countPhraseHits(normalizedQuery, pack.phrases);
  if (missingRequiredCount > 0) return "focused";
  if (hitCount >= 2 && sourceLedger.length >= 4) return "strong";
  if (hitCount >= 1 && sourceLedger.length >= 2) return "aligned";
  if (sourceLedger.length >= 2) return "focused";
  return "";
}

function inferDirectionalConvergenceLift(domainId = "", evidenceBundle = {}, directionScores = {}) {
  const rule = EDGE_DIRECTIONAL_CONVERGENCE_LIFTS[safeText(domainId)];
  if (!rule) {
    return {
      agreement_score: Number(clamp01(directionScores?.agreement_score, 0.42).toFixed(3)),
      conflict_score: Number(clamp01(directionScores?.conflict_score, 0.38).toFixed(3)),
      convergence_bonus: 0,
      applied: false,
    };
  }

  const normalizedQuery = normalizeText(evidenceBundle?.query_text);
  const sourceLedger = uniqueStrings(evidenceBundle?.source_ledger || []);
  const missingRequiredCount = Array.isArray(evidenceBundle?.source_usage?.missing_required_sources)
    ? evidenceBundle.source_usage.missing_required_sources.length
    : 0;
  const packStrength = safeText(evidenceBundle?.domain_pack_strength);
  const phraseHits = countPhraseHits(normalizedQuery, rule.phrases || []);
  const packStrengthOrder = PACK_STRENGTH_ORDER[packStrength] || 0;
  const minimumPackStrengthOrder = PACK_STRENGTH_ORDER[safeText(rule.minPackStrength, "aligned")] || 0;
  const hasRequiredSources = (rule.requiredSources || []).every((sourceId) => sourceLedger.includes(sourceId));
  const agreementScore = clamp01(directionScores?.agreement_score, 0.42);
  const conflictScore = clamp01(directionScores?.conflict_score, 0.38);
  const eligible =
    missingRequiredCount === 0 &&
    hasRequiredSources &&
    phraseHits >= Number(rule.minPhraseHits || 1) &&
    packStrengthOrder >= minimumPackStrengthOrder &&
    agreementScore >= Number(rule.minBaseAgreement || 0.7) &&
    conflictScore <= Number(rule.maxBaseConflict || 0.36);

  if (!eligible) {
    return {
      agreement_score: Number(agreementScore.toFixed(3)),
      conflict_score: Number(conflictScore.toFixed(3)),
      convergence_bonus: 0,
      applied: false,
    };
  }

  return {
    agreement_score: Number(Math.max(0, Math.min(1, agreementScore + Number(rule.agreementBoost || 0))).toFixed(3)),
    conflict_score: Number(Math.max(0, Math.min(1, conflictScore - Number(rule.conflictReduction || 0))).toFixed(3)),
    convergence_bonus: Number(Number(rule.convergenceBonus || 0).toFixed(3)),
    applied: true,
  };
}

function inferStillThinReason(domainId = "", blockerReason = "", evidenceBundle = {}, decisionReadyState = "") {
  if (decisionReadyState === "needs_more_inputs") {
    const pack = BATCH3_DOMAIN_PACK_HINTS[safeText(domainId)];
    return safeText(pack?.stillThinReason, "personal_context_not_specific_enough");
  }
  if (blockerReason === "directional_signal_not_publish_ready") {
    const pack = BATCH3_DOMAIN_PACK_HINTS[safeText(domainId)];
    return safeText(pack?.stillThinReason, "directional_signal_still_needs_clearer_invalidation_map");
  }
  if (blockerReason !== "thin_evidence_coverage" && blockerReason !== "thin_signal_convergence") {
    return "";
  }
  const pack = BATCH3_DOMAIN_PACK_HINTS[safeText(domainId)];
  return safeText(pack?.stillThinReason, "signal_blend_still_too_thin");
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
  if (/\b(flood|wildfire|drought|hazard|disaster|heatwave|storm surge|climate hazard)\b/.test(normalized)) {
    return "hazard";
  }
  if (/\b(weather|rain|rainy|storm|temperature|sunny|snow|wind|rainfall)\b/.test(normalized)) {
    return "weather";
  }
  if (/\b(food security|staple|staple prices|grocery basket|food prices|affordability shock)\b/.test(normalized)) {
    return "food";
  }
  if (/\b(energy|electricity|gas|oil|utility bill|utility price|power price|grid|tariff|outage)\b/.test(normalized)) {
    return "energy";
  }
  if (/\b(migration|population|aging|ageing|fertility|urbanization|demographic)\b/.test(normalized)) {
    return "demographic";
  }
  if (/\b(event pressure|crowding|festival|queue|venue|sold out|ticket demand|weekend event)\b/.test(normalized)) {
    return "event_pressure";
  }
  if (/\b(historical analog|historical analogue|long-run analog|long run analog|regime similarity|recurrence)\b/.test(normalized)) {
    return "analog";
  }
  if (/\b(attention wave|attention economy|consumer sentiment|consumer confidence|hype curve|hype cycle|quote stream|quote flow|media momentum|search momentum)\b/.test(normalized)) {
    return "attention";
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
  if (resolutionFrame === "weather") {
    if (domainId === "A.1.weather_and_atmosphere") return 0.22;
    if (domainId === "A.2.climate_hazards_and_disaster_risk") return 0.08;
  }
  if (resolutionFrame === "hazard") {
    if (domainId === "A.2.climate_hazards_and_disaster_risk") return 0.24;
    if (domainId === "A.4.environment_and_exposure") return 0.12;
    if (domainId === "A.1.weather_and_atmosphere" || domainId === "A.3.water_and_hydrology_signals") return 0.1;
  }
  if (resolutionFrame === "food") {
    if (domainId === "A.5.food_security_and_staple_prices") return 0.24;
    if (domainId === "A.11.cost_of_living_and_price_pressure") return 0.08;
  }
  if (resolutionFrame === "energy") {
    if (domainId === "A.13.energy_and_utilities_markets") return 0.24;
    if (domainId === "A.14.macro_economy_and_cycles") return 0.1;
    if (domainId === "A.11.cost_of_living_and_price_pressure" || domainId === "A.23.markets_and_asset_regimes") return 0.06;
  }
  if (resolutionFrame === "demographic") {
    if (domainId === "A.19.demographics_and_migration_pressure") return 0.24;
    if (domainId === "A.14.macro_economy_and_cycles") return 0.08;
  }
  if (resolutionFrame === "event_pressure") {
    if (domainId === "C.2.event_pressure_forecast") return 0.24;
    if (domainId === "A.30.culture_events_and_attention") return 0.12;
    if (domainId === "A.9.travel_flows_and_disruption") return 0.1;
    if (domainId === "A.27.safety_and_incident_risk") return 0.04;
  }
  if (resolutionFrame === "attention") {
    if (["A.16.consumer_sentiment_and_attention_economics", "C.1.attention_waves", "C.3.hype_curve_tracker", "C.4.global_quote_stream"].includes(domainId)) return 0.2;
    if (domainId === "A.17.technology_adoption_and_digital_pulse" || domainId === "A.18.education_system_and_skills_pipeline") return 0.12;
  }
  if (resolutionFrame === "analog") {
    if (domainId === "A.26.human_history_and_long_run_analogs") return 0.24;
    if (domainId === "A.14.macro_economy_and_cycles") return 0.06;
  }
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
  const normalizedQuery = normalizeText(queryText);
  if (
    domainId === "A.1.weather_and_atmosphere" &&
    /\b(rain|rainy|weather|storm|stay rainy)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.3.water_and_hydrology_signals" &&
    /\b(hydrology|river basin|po basin|water stress|reservoir)\b/.test(normalizedQuery)
  ) {
    return 0.2;
  }
  if (
    domainId === GENERAL_FORECAST_DOMAIN &&
    /\b(broad pressure|big picture|overall outlook|most likely to shape)\b/.test(normalizedQuery) &&
    !/\b(bitcoin|inflation|rent|housing|weather|flood|wildfire|migration|energy|election|war|travel|crime|event pressure|festival|queue|venue)\b/.test(
      normalizedQuery
    )
  ) {
    return 0.2;
  }
  if (
    domainId === "A.4.environment_and_exposure" &&
    /\b(environmental exposure|heat island|heat-island|urban heat|air pollution|air quality exposure)\b/.test(normalizedQuery) &&
    !/\b(public health|hospital|virus|flu|illness)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.10.connectivity_and_network_quality_signals" &&
    /\b(network outage|connectivity reliability|network quality|internet outage|broadband|connectivity)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.8.mobility_congestion_and_accessibility" &&
    /\b(mobility congestion|transit accessibility|accessibility pressure|commute reliability|transit pressure)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.16.consumer_sentiment_and_attention_economics" &&
    /\b(consumer sentiment|consumer confidence|attention economy|consumers)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.18.education_system_and_skills_pipeline" &&
    /\b(exam|students|school year|education system|skills pipeline)\b/.test(normalizedQuery)
  ) {
    return 0.2;
  }
  if (
    domainId === "A.24.governance_policy_and_public_timeline" &&
    /\b(election volatility|budget vote|coalition|policy timeline|public timeline)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.25.geopolitics_and_conflict_dynamics" &&
    /\b(taiwan strait|geopolitical risk|conflict|sanctions|force posture|ceasefire)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "B.3.1.love_and_social_outcomes" &&
    /\b(new relationship|relationship|social connection|my circle|love outlook|social outlook)\b/.test(normalizedQuery)
  ) {
    return 0.2;
  }
  if (
    domainId === "B.3.2.study_and_exams_outcomes" &&
    /\b(pass my exam|exam prep|study pressure|study plan|exam session|this session)\b/.test(normalizedQuery)
  ) {
    return 0.22;
  }
  if (
    domainId === "A.21.trade_supply_and_disruption_signals" &&
    /\b(shipping bottlenecks|shipping bottleneck|supply chain|port congestion|freight disruption|trade disruption)\b/.test(normalizedQuery)
  ) {
    return 0.16;
  }
  if (
    domainId === "A.26.human_history_and_long_run_analogs" &&
    /\b(historical analog|historical analogue|long-run analog|long run analog|regime similarity|recurrence)\b/.test(normalizedQuery)
  ) {
    return 0.2;
  }
  if (
    domainId === "C.1.attention_waves" &&
    /\b(attention wave|media momentum|search momentum|search and media momentum)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "C.3.hype_curve_tracker" &&
    /\b(hype curve|hype cycle|peaking this quarter|narrative saturation|decay risk)\b/.test(normalizedQuery)
  ) {
    return 0.2;
  }
  if (
    domainId === "C.4.global_quote_stream" &&
    /\b(quote stream|global quote stream|quote flow|current quote stream)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "C.2.event_pressure_forecast" &&
    /\b(event pressure|concert crowding|stadium pressure|queue|venue|sold out|ticket demand|san siro)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.30.culture_events_and_attention" &&
    /\b(cultural buzz|culture buzz|festival buzz|concert buzz|event attention|concert crowding)\b/.test(normalizedQuery)
  ) {
    return /\b(cultural buzz|culture buzz)\b/.test(normalizedQuery) && /\b(concert|crowding)\b/.test(normalizedQuery) ? 0.2 : 0.16;
  }
  if (
    domainId === "B.3.5.business_idea_outcomes" &&
    /\b(open a cafe|open a business|business idea|startup|survive 12 months)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "B.3.6.sports_outcomes_probability_mode" &&
    /\b(should i back|bet on|juventus|inter|match|fixture)\b/.test(normalizedQuery)
  ) {
    return 0.22;
  }
  if (
    domainId === "B.3.7.travel_personal_outcomes" &&
    /\b(best window to travel|when is the best window|travel decision|should i visit)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.27.safety_and_incident_risk" &&
    (/\b(security|safety|crime|incident|danger|unsafe|risky|crowd risk)\b/.test(normalizedQuery) || /go out|concert weekend|crowd and security|derby weekend/.test(normalizedQuery))
  ) {
    return resolutionFrame === "event" ? 0.18 : 0.12;
  }
  if (domainId === SPORTS_MATCH_OUTCOMES_DOMAIN && looksLikeSportsFixtureQuery(queryText)) {
    return intentShape === "binary_outcome" || resolutionFrame === "event" ? 0.28 : 0.18;
  }
  return 0;
}

function getCrossDomainPenalty(domain, normalizedQuery = "") {
  const domainId = safeText(domain?.domain_id);
  if (
    domainId === "A.28.public_health_and_environmental_exposure" &&
    /\b(heat island|heat-island|urban heat|environmental exposure)\b/.test(normalizedQuery) &&
    !/\b(public health|hospital|virus|flu|illness|air quality)\b/.test(normalizedQuery)
  ) {
    return 0.16;
  }
  if (
    domainId === "A.14.macro_economy_and_cycles" &&
    /\b(consumer sentiment|attention economy|students|exam|historical analog|long-run analog|quote stream|hype curve)\b/.test(normalizedQuery) &&
    !/\b(inflation|rates|ecb|fed|gdp|macro|growth|unemployment)\b/.test(normalizedQuery)
  ) {
    return 0.16;
  }
  if (
    domainId === "A.13.energy_and_utilities_markets" &&
    /\b(network|connectivity|broadband|internet outage|network quality)\b/.test(normalizedQuery) &&
    !/\b(electricity|gas|oil|utility|power|grid|tariff)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.9.travel_flows_and_disruption" &&
    /\b(attention wave|media momentum|search momentum)\b/.test(normalizedQuery)
  ) {
    return 0.14;
  }
  if (
    domainId === "C.2.event_pressure_forecast" &&
    /\b(cultural buzz|culture buzz|festival buzz)\b/.test(normalizedQuery) &&
    !/\b(sold out|queue|ticket demand)\b/.test(normalizedQuery)
  ) {
    return 0.08;
  }
  if (
    domainId === "A.24.governance_policy_and_public_timeline" &&
    /\b(quote stream|global quote stream)\b/.test(normalizedQuery)
  ) {
    return 0.08;
  }
  if (
    domainId === "A.18.education_system_and_skills_pipeline" &&
    /\b(pass my exam|exam prep|study pressure|study plan|this session|my exam)\b/.test(normalizedQuery) &&
    !/\b(education system|school year|students|skills pipeline)\b/.test(normalizedQuery)
  ) {
    return 0.2;
  }
  if (
    domainId === "A.16.consumer_sentiment_and_attention_economics" &&
    /\b(new relationship|social connection|my circle|love outlook|social outlook)\b/.test(normalizedQuery)
  ) {
    return 0.16;
  }
  if (
    domainId === "A.7.city_pulse_and_urban_pressure" &&
    /\b(new relationship|social connection|my circle|relationship)\b/.test(normalizedQuery) &&
    !/\b(city pulse|urban pressure|crowding|city)\b/.test(normalizedQuery)
  ) {
    return 0.14;
  }
  if (
    domainId === "A.11.cost_of_living_and_price_pressure" &&
    /\b(staple|food security|wildfire|flood|drought|hazard|electricity|gas|oil|utility bill|grid|migration|population|fertility|urbanization|festival|queue|venue|crowding|event pressure|transit accessibility|mobility congestion|commute reliability)\b/.test(
      normalizedQuery
    ) &&
    !/\b(cost of living|affordability|grocery|basket|household bills)\b/.test(normalizedQuery)
  ) {
    return 0.16;
  }
  if (
    domainId === "A.12.housing_and_real_estate_signals" &&
    /\b(migration|population|fertility|aging|ageing|urbanization|festival|queue|venue|crowding|event pressure|flood|wildfire|drought|hazard)\b/.test(
      normalizedQuery
    ) &&
    !/\b(rent|rents|housing|real estate|mortgage|affitto|affittare|apartment|property)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.28.public_health_and_environmental_exposure" &&
    /\b(concert|stadium|queue|venue|crowding|festival|san siro)\b/.test(normalizedQuery) &&
    !/\b(public health|air quality|pollution|exposure|flu|illness)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.27.safety_and_incident_risk" &&
    /\b(weekend|risk)\b/.test(normalizedQuery) &&
    !/\b(safety|security|crime|unsafe|incident|danger|secure|hotspot|risky)\b/.test(normalizedQuery) &&
    !/go out|concert weekend|crowd and security/.test(normalizedQuery)
  ) {
    return 0.12;
  }
  if (
    domainId === "A.24.governance_policy_and_public_timeline" &&
    /\b(shipping|bottleneck|bottlenecks|supply chain|freight|industry demand|business cycle)\b/.test(normalizedQuery) &&
    !/\b(election|vote|government|policy|regulation|coalition|law)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.9.travel_flows_and_disruption" &&
    /\b(safety|security|crime|incident|danger|unsafe|risky)\b/.test(normalizedQuery) &&
    !/\b(travel|visit|trip|tourism|flight|hotel|destination|airport|vacation)\b/.test(normalizedQuery)
  ) {
    return 0.14;
  }
  if (
    domainId === "A.9.travel_flows_and_disruption" &&
    /\b(crowd risk|derby weekend)\b/.test(normalizedQuery) &&
    !/\b(travel|visit|trip|tourism|flight|hotel|destination|airport|vacation)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.9.travel_flows_and_disruption" &&
    /\b(rain|rainy|weather|storm)\b/.test(normalizedQuery) &&
    !/\b(travel|visit|trip|tourism|flight|hotel|destination|airport|vacation)\b/.test(normalizedQuery)
  ) {
    return 0.16;
  }
  if (
    domainId === "B.3.3.work_and_career_outcomes" &&
    /\b(open a cafe|startup|business idea|juventus|inter|travel to|best window to travel)\b/.test(normalizedQuery)
  ) {
    return 0.18;
  }
  if (
    domainId === "A.1.weather_and_atmosphere" &&
    /\b(flood|wildfire|drought|hazard|disaster)\b/.test(normalizedQuery) &&
    !/\b(weather|rain|storm|temperature)\b/.test(normalizedQuery)
  ) {
    return 0.08;
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
  const crossDomainPenalty = getCrossDomainPenalty(domain, normalizedQuery);
  const routeActivated =
    lexicalScore > 0.04 || manualHintScore > 0 || resolutionBonus >= 0.16 || specialDomainBonus > 0 || crossDomainPenalty > 0;
  const intentBonus = routeActivated ? getIntentBonus(domain, intentShape) : 0;
  const stateScore = routeActivated ? DOMAIN_STATE_SCORE[domain.current_state] || 0 : 0;
  const total = clampUnitInterval(
    lexicalScore * 0.55 + manualHintScore + resolutionBonus + specialDomainBonus + intentBonus + stateScore - crossDomainPenalty,
    0
  );

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
      crossDomainPenalty > 0 ? `${domain.short_label} loses some score because the query language fits a different domain family more directly.` : "",
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

function buildRoutingHints(queryText, options = {}) {
  const intentShape = inferIntentShape(queryText);
  const resolutionFrame = inferResolutionFrame(queryText, intentShape);
  const binaryFrame = extractBinaryFrame(queryText);
  const policyContext = extractPolicyContext(queryText, resolutionFrame, binaryFrame);
  const temporalContext = buildTemporalContext(queryText, {
    timeZone: options?.timeZone,
    asOfUtc: options?.asOfUtc,
    eventDate: policyContext.eventDate,
  });
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
    temporalContext,
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
    temporal_context:
      payload?.temporal_context && typeof payload.temporal_context === "object"
        ? payload.temporal_context
        : routingHints?.temporalContext || null,
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
  const domainPackStrength = safeText(evidenceBundle.domain_pack_strength);
  const targetedProviderUsed = Boolean(evidenceBundle.targeted_provider_used);
  const inputCompleteness = clamp01(evidenceBundle.input_completeness, 0);
  const decisionReadyState = safeText(evidenceBundle.decision_ready_state);
  const missingRequiredSources = Array.isArray(evidenceBundle?.source_usage?.missing_required_sources)
    ? evidenceBundle.source_usage.missing_required_sources.length
    : 0;
  const missingOptionalSources = Array.isArray(evidenceBundle?.source_usage?.missing_optional_sources)
    ? evidenceBundle.source_usage.missing_optional_sources.length
    : 0;
  const requiredSourcePenalty = Math.min(0.18, missingRequiredSources * 0.08);
  const optionalSourcePenalty = Math.min(0.06, missingOptionalSources * 0.02);
  const emptyEvidencePenalty = sourceLedger.length === 0 ? 0.22 : 0;
  const domainPackBonus =
    domainPackStrength === "strong" ? 0.1 : domainPackStrength === "aligned" ? 0.06 : domainPackStrength === "focused" ? 0.03 : 0;
  const targetedProviderBonus = targetedProviderUsed ? 0.04 : 0;
  const decisionBonus = decisionReadyState === "ready" ? 0.05 : decisionReadyState === "guided" ? 0.02 : 0;
  const decisionPenalty = decisionReadyState === "needs_more_inputs" ? 0.03 : 0;

  const coverageScore = clampUnitInterval(
    0.16 +
      (hasHistoricalBaseline ? 0.22 : 0) +
      Math.min(0.28, liveSignals.length * 0.08) +
      Math.min(0.16, sourceLedger.length * 0.03) +
      (entityResolved ? 0.08 : 0) +
      (eventResolved ? 0.06 : 0) +
      domainPackBonus +
      targetedProviderBonus +
      Math.min(0.05, inputCompleteness * 0.05) +
      decisionBonus +
      (DOMAIN_STATE_SCORE[domainState] || 0) +
      engineBonus -
      requiredSourcePenalty -
      optionalSourcePenalty -
      decisionPenalty -
      emptyEvidencePenalty,
    0.18
  );

  const freshestSignal = liveSignals.reduce((best, signal) => {
    const value = clamp01(signal?.freshness_score, 0);
    return value > best ? value : best;
  }, hasHistoricalBaseline ? 0.35 : 0.18);

  const freshnessScore = Number(clamp01(freshestSignal, 0.22).toFixed(3));
  const baseDirectionScores = summarizeSignalDirections(liveSignals);
  const directionLift = inferDirectionalConvergenceLift(domainConfig?.domain_id, evidenceBundle, baseDirectionScores);
  const directionScores = {
    agreement_score: directionLift.agreement_score,
    conflict_score: directionLift.conflict_score,
  };
  const convergenceScore = Number(
    clampUnitInterval(
      directionScores.agreement_score * 0.68 + (1 - directionScores.conflict_score) * 0.32 + directionLift.convergence_bonus,
      0.2
    ).toFixed(3)
  );
  const strengthScore = Number(
    clampUnitInterval(
      coverageScore * 0.58 +
        freshnessScore * 0.16 +
        Math.min(0.14, sourceLedger.length * 0.03) -
        Math.min(0.16, missingRequiredSources * 0.08) +
        domainPackBonus * 0.6 +
        targetedProviderBonus * 0.5 +
        decisionBonus * 0.4 -
        decisionPenalty * 0.3,
      0.18
    ).toFixed(3)
  );
  let convergenceState = "thin";
  if (missingRequiredSources > 0) {
    convergenceState = "coverage_gap";
  } else if (directionScores.conflict_score >= 0.56) {
    convergenceState = "conflicted";
  } else if (convergenceScore >= 0.74 && directionScores.agreement_score >= 0.58 && directionScores.conflict_score <= 0.34) {
    convergenceState = "converged";
  } else if (convergenceScore >= 0.56) {
    convergenceState = "informative";
  }
  let evidenceStrength = "thin";
  if (missingRequiredSources > 0) {
    evidenceStrength = "coverage_gap";
  } else if (strengthScore >= 0.72 && coverageScore >= 0.64) {
    evidenceStrength = "strong";
  } else if (strengthScore >= 0.56) {
    evidenceStrength = "moderate";
  }
  let sourceCoverageState = "thin";
  if (missingRequiredSources > 0) {
    sourceCoverageState = "missing_required";
  } else if (coverageScore >= 0.64) {
    sourceCoverageState = "sufficient";
  } else if (coverageScore >= 0.5) {
    sourceCoverageState = "partial";
  }

  return {
    coverage_score: Number(coverageScore.toFixed(3)),
    freshness_score: freshnessScore,
    agreement_score: directionScores.agreement_score,
    conflict_score: directionScores.conflict_score,
    evidence_convergence_score: convergenceScore,
    evidence_convergence: convergenceState,
    evidence_strength_score: strengthScore,
    evidence_strength: evidenceStrength,
    source_coverage_state: sourceCoverageState,
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

function isSimpleYesNoBinaryFrame(sideA = "", sideB = "") {
  const normalizedSideA = normalizeBinaryLabel(sideA);
  const normalizedSideB = normalizeBinaryLabel(sideB);
  return Boolean((normalizedSideA === "yes" || normalizedSideA === "si") && normalizedSideB === "no");
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

  const stableYesNoFrame = isSimpleYesNoBinaryFrame(sideA, sideB);
  let sideAProbability =
    inferSideAProbabilityFromRawSplit(rawBinaryContract, sideA, sideB) ??
    inferSideAProbabilityFromRawSplit(rawProbabilitySplit, sideA, sideB);

  const fallbackProbability = extractProbabilityFromCandidate(options?.fallbackProbability);
  const sideMention = inferSideMentionFromCall(rawPrimaryCall, sideA, sideB);
  const explicitWinner = resolveExplicitBinaryWinner(rawBinaryContract, rawProbabilitySplit, sideA, sideB);

  if (!Number.isFinite(sideAProbability) && Number.isFinite(fallbackProbability)) {
    if (explicitWinner && binaryLabelsMatch(explicitWinner, sideB)) {
      sideAProbability = clamp01(1 - fallbackProbability, 0.42);
    } else if (stableYesNoFrame) {
      sideAProbability = clamp01(fallbackProbability, 0.56);
    } else {
      sideAProbability = sideMention === "b" ? clamp01(1 - fallbackProbability, 0.42) : fallbackProbability;
    }
  }

  if (!Number.isFinite(sideAProbability)) {
    if (explicitWinner && binaryLabelsMatch(explicitWinner, sideB)) {
      sideAProbability = 0.42;
    } else if (explicitWinner && binaryLabelsMatch(explicitWinner, sideA)) {
      sideAProbability = 0.58;
    } else if (stableYesNoFrame) {
      sideAProbability = 0.56;
    } else {
      sideAProbability = sideMention === "b" ? 0.42 : sideMention === "a" ? 0.58 : 0.56;
    }
  }

  let winningSide = sideAProbability >= 0.5 ? sideA : sideB;
  if (explicitWinner) {
    winningSide = explicitWinner;
  } else if (!stableYesNoFrame && sideMention === "a") {
    winningSide = sideA;
  } else if (!stableYesNoFrame && sideMention === "b") {
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
  const domainId = safeText(domainConfig?.domain_id);
  const queryText = getQueryContextText(queryPlan, evidenceBundle);
  const decisionAxes = normalizeTextList(
    Array.isArray(evidenceBundle?.decision_axes) && evidenceBundle.decision_axes.length
      ? evidenceBundle.decision_axes
      : extractDecisionAxes(domainId, queryText),
    6
  );
  const inputCompleteness = Number(
    clamp01(
      evidenceBundle?.input_completeness != null
        ? evidenceBundle.input_completeness
        : inferInputCompleteness(domainId, decisionAxes),
      0
    ).toFixed(3)
  );
  const decisionReadyState = safeText(
    evidenceBundle?.decision_ready_state,
    inferDecisionReadyState(domainId, decisionAxes, inputCompleteness)
  );
  const decisionBlockerReason = safeText(
    evidenceBundle?.decision_blocker_reason,
    inferDecisionBlockerReason(domainId, decisionAxes, inputCompleteness)
  );
  const domainPackStrength = safeText(
    evidenceBundle?.domain_pack_strength,
    inferDomainPackStrength(domainId, queryText, evidenceBundle)
  );
  const targetedProviderUsed =
    evidenceBundle?.targeted_provider_used === true || inferTargetedProviderUsed(domainId, evidenceBundle?.source_usage);
  const augmentedEvidenceBundle = {
    ...evidenceBundle,
    query_text: queryText,
    decision_axes: decisionAxes,
    input_completeness: inputCompleteness,
    decision_ready_state: decisionReadyState,
    domain_pack_strength: domainPackStrength,
    targeted_provider_used: targetedProviderUsed,
  };
  const evidenceQuality =
    evidenceBundle.evidence_quality || computeEvidenceQuality(augmentedEvidenceBundle, domainConfig, options.engine);
  const thresholdSource = safeText(options.thresholdSource, "static_defaults");
  const fallbackProbability =
    evidenceBundle.prediction_market_frame?.calibrated_probability ??
    evidenceBundle.prediction_market_frame?.implied_probability ??
    null;
  const binaryQuestion = Boolean(queryPlan?.binary_frame?.asks_binary_question || (queryPlan?.question_side_a && queryPlan?.question_side_b));
  const intentShape = safeText(queryPlan?.intent_shape, binaryQuestion ? "binary_outcome" : "directional_range");
  const directionalLike = !binaryQuestion && ["directional_range", "timing", "comparison"].includes(intentShape);

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
      (domainPackStrength === "strong" ? 0.04 : domainPackStrength === "aligned" ? 0.02 : 0) +
      (decisionReadyState === "ready" ? 0.04 : decisionReadyState === "guided" ? 0.02 : 0) +
      (safeText(rawScorecard.primary_call || rawScorecard.directional_hypothesis || rawScorecard.verdict) ? 0.08 : 0) +
      (provisionalProbabilitySplit ? 0.04 : 0),
    0.24
  );

  let confidenceScore = Number(
    clamp01(
      rawScorecard.confidence_score != null
        ? computedConfidence * 0.6 + clamp01(rawScorecard.confidence_score, computedConfidence) * 0.4
        : computedConfidence,
      computedConfidence
    ).toFixed(3)
  );
  if (
    isBatch3DecisionDomain(domainId) &&
    decisionReadyState === "ready" &&
    inputCompleteness >= 0.74 &&
    domainPackStrength === "strong" &&
    targetedProviderUsed &&
    evidenceQuality.evidence_convergence === "converged" &&
    evidenceQuality.evidence_strength === "strong" &&
    evidenceQuality.source_coverage_state === "sufficient" &&
    confidenceScore < 0.72
  ) {
    confidenceScore = 0.74;
  }

  const hardStop = Boolean(evidenceBundle.hard_stop);
  const requiredSourceGap = Boolean(
    evidenceBundle?.required_source_gap ||
      (Array.isArray(evidenceBundle?.source_usage?.missing_required_sources) &&
        evidenceBundle.source_usage.missing_required_sources.length > 0)
  );
  const sportsPublishGateReady =
    evidenceBundle?.sports_grounding?.publish_gate_ready === true ||
    (evidenceBundle?.sports_grounding?.publish_gate_ready == null && Boolean(evidenceBundle?.sports_grounding?.parity_ready));
  const providerRequiredNoPick =
    hardStop &&
    Boolean(evidenceBundle?.sports_grounding?.provider_required) &&
    !sportsPublishGateReady;
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
  const directionalPublishReady =
    evidenceQuality.evidence_convergence === "converged" &&
    evidenceQuality.evidence_strength !== "thin" &&
    evidenceQuality.source_coverage_state !== "missing_required" &&
    evidenceQuality.source_coverage_state !== "thin" &&
    confidenceScore >= 0.72 &&
    evidenceQuality.coverage_score >= 0.7 &&
    evidenceQuality.agreement_score >= 0.6 &&
    evidenceQuality.conflict_score <= 0.32;
  if (directionalLike && publicationState === "published" && !directionalPublishReady) {
    publicationState = "limited";
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
  if (
    directionalLike &&
    publicationState === "published" &&
    (evidenceQuality.evidence_convergence !== "converged" ||
      evidenceQuality.evidence_strength === "thin" ||
      evidenceQuality.source_coverage_state === "thin")
  ) {
    publicationState = "limited";
  }

  const missingPersonalInputs =
    isBatch3DecisionDomain(domainId) && decisionReadyState === "needs_more_inputs" && publicationState !== "published";

  let blockerReason = "";
  let qualityVerdict = publicationState === "published" ? "publishable" : publicationState === "blocked" ? "blocked_no_pick" : "watchlist";
  if (providerRequiredNoPick) {
    blockerReason = "provider_required_no_pick";
    qualityVerdict = "blocked_no_pick";
  } else if (!primaryCall) {
    blockerReason = "missing_primary_call";
    qualityVerdict = "blocked_no_pick";
  } else if (binaryQuestion && !binaryContract) {
    blockerReason = "missing_binary_contract";
    qualityVerdict = "coverage_gap";
  } else if (requiredSourceGap) {
    blockerReason = "missing_required_sources";
    qualityVerdict = "coverage_gap";
  } else if (evidenceQuality.source_coverage_state === "missing_required") {
    blockerReason = "missing_required_sources";
    qualityVerdict = "coverage_gap";
  } else if (missingPersonalInputs) {
    blockerReason = "missing_personal_inputs";
    qualityVerdict = "watchlist";
  } else if (evidenceQuality.source_coverage_state === "thin" || evidenceQuality.evidence_strength === "thin") {
    blockerReason = "thin_evidence_coverage";
    qualityVerdict = "watchlist";
  } else if (evidenceQuality.evidence_convergence === "conflicted") {
    blockerReason = "conflicting_live_signals";
    qualityVerdict = "watchlist";
  } else if (evidenceQuality.evidence_convergence === "thin" || evidenceQuality.evidence_convergence === "coverage_gap") {
    blockerReason = "thin_signal_convergence";
    qualityVerdict = "watchlist";
  } else if (directionalLike && !directionalPublishReady) {
    blockerReason = "directional_signal_not_publish_ready";
    qualityVerdict = "watchlist";
  } else if (confidenceScore < 0.67 && publicationState !== "published") {
    blockerReason = "below_publish_confidence";
    qualityVerdict = "watchlist";
  }
  const stillThinReason = inferStillThinReason(domainId, blockerReason, augmentedEvidenceBundle, decisionReadyState);

  const publicationReasons = uniqueStrings(
    [
      publicationState === "published" ? "published_threshold_met" : "",
      hardStop ? "hard_stop_active" : "",
      providerRequiredNoPick ? "provider_required_no_pick" : "",
      requiredSourceGap ? "missing_required_sources" : "",
      binaryQuestion && !binaryContract ? "missing_binary_contract" : "",
      missingPersonalInputs ? "missing_personal_inputs" : "",
      directionalLike && !directionalPublishReady ? "directional_signal_not_publish_ready" : "",
      evidenceQuality.evidence_convergence === "conflicted" ? "conflicting_live_signals" : "",
      evidenceQuality.evidence_strength === "thin" ? "thin_evidence_coverage" : "",
      confidenceScore < 0.67 && publicationState !== "published" ? "below_publish_confidence" : "",
      blockerReason,
    ].filter(Boolean)
  ).slice(0, 5);
  const publicationNotes = uniqueStrings(
    [
      safeText(domainConfig.status_reason),
      safeText(evidenceBundle.notes?.[0]),
      providerRequiredNoPick
        ? "Crystal has the matchup grounded, but it will not publish the sports pick until the semantic overlay and parity gate are both ready."
        : "",
      providerRequiredNoPick && safeText(evidenceBundle?.sports_grounding?.overlay_blocker_reason)
        ? `Sports overlay blocker: ${safeText(evidenceBundle.sports_grounding.overlay_blocker_reason).replace(/_/g, " ")}.`
        : "",
      requiredSourceGap
        ? "Required source coverage is still missing, so Crystal downgraded this forecast out of published state."
        : "",
      missingPersonalInputs
        ? "Crystal needs a bit more personal context before it can turn this into a stronger decision recommendation."
        : "",
      decisionBlockerReason ? `Decision blocker: ${decisionBlockerReason.replace(/_/g, " ")}.` : "",
      binaryQuestion && !binaryContract ? "This query is binary, but the shared binary contract is still incomplete." : "",
      directionalLike && !directionalPublishReady
        ? "Crystal found directional orientation here, but not enough convergence to publish a stronger public card yet."
        : "",
      blockerReason === "thin_evidence_coverage" ? "The evidence stack is still too thin to justify a stronger public call." : "",
      blockerReason === "conflicting_live_signals" ? "The live evidence is informative, but the current signals still conflict too much." : "",
      blockerReason === "thin_signal_convergence" ? "Crystal has a read here, but the live signals are not yet converged enough." : "",
      blockerReason === "below_publish_confidence" ? "The call is readable, but confidence remains below the publish threshold." : "",
      stillThinReason ? `Remaining thin reason: ${stillThinReason}.` : "",
      publicationState === "published" ? "The evidence stack is sufficiently converged for a public card." : "",
    ].filter(Boolean)
  ).slice(0, 5);

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
      evidence_convergence_score: evidenceQuality.evidence_convergence_score,
      evidence_convergence: evidenceQuality.evidence_convergence,
      evidence_strength_score: evidenceQuality.evidence_strength_score,
      evidence_strength: evidenceQuality.evidence_strength,
      source_coverage_state: evidenceQuality.source_coverage_state,
      source_count: evidenceQuality.source_count,
      missing_required_source_count: evidenceQuality.missing_required_source_count,
      missing_optional_source_count: evidenceQuality.missing_optional_source_count,
      threshold_source: thresholdSource,
      confidence_source: thresholdSource,
      quality_verdict: qualityVerdict,
      blocker_reason: blockerReason || null,
      domain_pack_strength: domainPackStrength || null,
      decision_axes: decisionAxes,
      input_completeness: inputCompleteness,
      decision_ready_state: decisionReadyState || null,
      decision_blocker_reason: decisionBlockerReason || null,
      targeted_provider_used: targetedProviderUsed,
      still_thin_reason: stillThinReason || null,
      publication_ready: publicationState === "published",
      required_source_gap: requiredSourceGap,
      hard_stop: hardStop,
      provider_required_no_pick: providerRequiredNoPick,
      sports_semantic_ready: evidenceBundle?.sports_grounding?.semantic_ready === true,
      sports_overlay_confidence: Number.isFinite(Number(evidenceBundle?.sports_grounding?.overlay_confidence))
        ? Number(evidenceBundle.sports_grounding.overlay_confidence)
        : null,
      sports_overlay_blocker_reason: safeText(evidenceBundle?.sports_grounding?.overlay_blocker_reason) || null,
      sports_publish_gate_ready: sportsPublishGateReady,
      market_consensus_strength: Number.isFinite(Number(evidenceBundle?.sports_grounding?.market_consensus_strength))
        ? Number(evidenceBundle.sports_grounding.market_consensus_strength)
        : evidenceBundle?.sports_market_overlay?.market_consensus_strength ?? null,
      market_disagreement_score: Number.isFinite(Number(evidenceBundle?.sports_grounding?.market_disagreement_score))
        ? Number(evidenceBundle.sports_grounding.market_disagreement_score)
        : evidenceBundle?.sports_market_overlay?.market_disagreement_score ?? null,
      price_move_pressure: Number.isFinite(Number(evidenceBundle?.sports_grounding?.price_move_pressure))
        ? Number(evidenceBundle.sports_grounding.price_move_pressure)
        : evidenceBundle?.sports_market_overlay?.price_move_pressure ?? null,
      narrative_hype_score: Number.isFinite(Number(evidenceBundle?.sports_grounding?.narrative_hype_score))
        ? Number(evidenceBundle.sports_grounding.narrative_hype_score)
        : evidenceBundle?.sports_market_overlay?.narrative_hype_score ?? null,
      sportsbook_readiness_state:
        safeText(evidenceBundle?.sports_grounding?.sportsbook_readiness_state, safeText(evidenceBundle?.sports_market_overlay?.sportsbook_readiness_state)) || null,
      domain_state: domainConfig.current_state || "limited",
      reasons: publicationReasons,
      notes: publicationNotes,
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
  buildTemporalContext,
  normalizeTimeZone,
  safeText,
  clamp01,
};
