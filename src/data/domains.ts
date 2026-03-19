export type BlueprintStaticDomain = {
  domain_id: string;
  block: 'system' | 'A' | 'B' | 'C';
  macro_area_id: string;
  title: string;
  current_state: 'published' | 'limited' | 'blocked';
  target_wave: 'bridge' | 'wave_1' | 'wave_2' | 'wave_3' | 'wave_4';
};

export const BLUEPRINT_STATIC_DOMAINS: BlueprintStaticDomain[] = [
  { domain_id: 'A.0.general.general_forecast', block: 'system', macro_area_id: 'A.0', title: 'General Forecast Router', current_state: 'limited', target_wave: 'bridge' },
  { domain_id: 'A.1.weather_and_atmosphere', block: 'A', macro_area_id: 'A.1', title: 'Weather and Atmosphere', current_state: 'published', target_wave: 'wave_1' },
  { domain_id: 'A.2.climate_hazards_and_disaster_risk', block: 'A', macro_area_id: 'A.2', title: 'Climate Hazards and Disaster Risk', current_state: 'limited', target_wave: 'wave_2' },
  { domain_id: 'A.3.water_and_hydrology_signals', block: 'A', macro_area_id: 'A.3', title: 'Water and Hydrology Signals', current_state: 'limited', target_wave: 'wave_2' },
  { domain_id: 'A.4.environment_and_exposure', block: 'A', macro_area_id: 'A.4', title: 'Environment and Exposure', current_state: 'limited', target_wave: 'wave_2' },
  { domain_id: 'A.5.food_security_and_staple_prices', block: 'A', macro_area_id: 'A.5', title: 'Food Security and Staple Prices', current_state: 'limited', target_wave: 'wave_2' },
  { domain_id: 'A.6.agriculture_and_seasonal_production', block: 'A', macro_area_id: 'A.6', title: 'Agriculture and Seasonal Production', current_state: 'blocked', target_wave: 'wave_2' },
  { domain_id: 'A.7.city_pulse_and_urban_pressure', block: 'A', macro_area_id: 'A.7', title: 'City Pulse and Urban Pressure', current_state: 'published', target_wave: 'wave_1' },
  { domain_id: 'A.8.mobility_congestion_and_accessibility', block: 'A', macro_area_id: 'A.8', title: 'Mobility, Congestion and Accessibility', current_state: 'limited', target_wave: 'wave_1' },
  { domain_id: 'A.9.travel_flows_and_disruption', block: 'A', macro_area_id: 'A.9', title: 'Travel Flows and Disruption', current_state: 'published', target_wave: 'wave_1' },
  { domain_id: 'A.10.connectivity_and_network_quality_signals', block: 'A', macro_area_id: 'A.10', title: 'Connectivity and Network Quality Signals', current_state: 'blocked', target_wave: 'wave_2' },
  { domain_id: 'A.11.cost_of_living_and_price_pressure', block: 'A', macro_area_id: 'A.11', title: 'Cost of Living and Price Pressure', current_state: 'published', target_wave: 'wave_1' },
  { domain_id: 'A.12.housing_and_real_estate_signals', block: 'A', macro_area_id: 'A.12', title: 'Housing and Real Estate Signals', current_state: 'limited', target_wave: 'wave_1' },
  { domain_id: 'A.13.energy_and_utilities_markets', block: 'A', macro_area_id: 'A.13', title: 'Energy and Utilities Markets', current_state: 'published', target_wave: 'wave_1' },
  { domain_id: 'A.14.macro_economy_and_cycles', block: 'A', macro_area_id: 'A.14', title: 'Macro Economy and Cycles', current_state: 'published', target_wave: 'wave_1' },
  { domain_id: 'A.15.jobs_and_labor_market_signals', block: 'A', macro_area_id: 'A.15', title: 'Jobs and Labor Market Signals', current_state: 'limited', target_wave: 'wave_2' },
  { domain_id: 'A.16.consumer_sentiment_and_attention_economics', block: 'A', macro_area_id: 'A.16', title: 'Consumer Sentiment and Attention Economics', current_state: 'limited', target_wave: 'wave_1' },
  { domain_id: 'A.17.technology_adoption_and_digital_pulse', block: 'A', macro_area_id: 'A.17', title: 'Technology Adoption and Digital Pulse', current_state: 'limited', target_wave: 'wave_1' },
  { domain_id: 'A.18.education_system_and_skills_pipeline', block: 'A', macro_area_id: 'A.18', title: 'Education System and Skills Pipeline', current_state: 'blocked', target_wave: 'wave_2' },
  { domain_id: 'A.19.demographics_and_migration_pressure', block: 'A', macro_area_id: 'A.19', title: 'Demographics and Migration Pressure', current_state: 'limited', target_wave: 'wave_2' },
  { domain_id: 'A.20.infrastructure_and_logistics_reliability', block: 'A', macro_area_id: 'A.20', title: 'Infrastructure and Logistics Reliability', current_state: 'limited', target_wave: 'wave_1' },
  { domain_id: 'A.21.trade_supply_and_disruption_signals', block: 'A', macro_area_id: 'A.21', title: 'Trade, Supply and Disruption Signals', current_state: 'limited', target_wave: 'wave_1' },
  { domain_id: 'A.22.industry_and_business_cycles', block: 'A', macro_area_id: 'A.22', title: 'Industry and Business Cycles', current_state: 'limited', target_wave: 'wave_2' },
  { domain_id: 'A.23.markets_and_asset_regimes', block: 'A', macro_area_id: 'A.23', title: 'Markets and Asset Regimes', current_state: 'published', target_wave: 'wave_1' },
  { domain_id: 'A.24.governance_policy_and_public_timeline', block: 'A', macro_area_id: 'A.24', title: 'Governance, Policy and Public Timeline', current_state: 'limited', target_wave: 'wave_1' },
  { domain_id: 'A.25.geopolitics_and_conflict_dynamics', block: 'A', macro_area_id: 'A.25', title: 'Geopolitics and Conflict Dynamics', current_state: 'published', target_wave: 'wave_1' },
  { domain_id: 'A.26.human_history_and_long_run_analogs', block: 'A', macro_area_id: 'A.26', title: 'Human History and Long-Run Analogs', current_state: 'limited', target_wave: 'wave_2' },
  { domain_id: 'A.27.safety_and_incident_risk', block: 'A', macro_area_id: 'A.27', title: 'Safety and Incident Risk', current_state: 'blocked', target_wave: 'wave_2' },
  { domain_id: 'A.28.public_health_and_environmental_exposure', block: 'A', macro_area_id: 'A.28', title: 'Public Health and Environmental Exposure', current_state: 'limited', target_wave: 'wave_1' },
  { domain_id: 'A.29.sports_performance_and_outcomes', block: 'A', macro_area_id: 'A.29', title: 'Sports Performance and Outcomes', current_state: 'published', target_wave: 'wave_1' },
  { domain_id: 'A.30.culture_events_and_attention', block: 'A', macro_area_id: 'A.30', title: 'Culture, Events and Attention', current_state: 'limited', target_wave: 'wave_1' },
  { domain_id: 'B.3.1.love_and_social_outcomes', block: 'B', macro_area_id: 'B.3.1', title: 'Love and Social Outcomes', current_state: 'blocked', target_wave: 'wave_3' },
  { domain_id: 'B.3.2.study_and_exams_outcomes', block: 'B', macro_area_id: 'B.3.2', title: 'Study and Exams Outcomes', current_state: 'blocked', target_wave: 'wave_3' },
  { domain_id: 'B.3.3.work_and_career_outcomes', block: 'B', macro_area_id: 'B.3.3', title: 'Work and Career Outcomes', current_state: 'blocked', target_wave: 'wave_3' },
  { domain_id: 'B.3.4.personal_finance_outcomes', block: 'B', macro_area_id: 'B.3.4', title: 'Personal Finance Outcomes', current_state: 'blocked', target_wave: 'wave_3' },
  { domain_id: 'B.3.5.business_idea_outcomes', block: 'B', macro_area_id: 'B.3.5', title: 'Business Idea Outcomes', current_state: 'blocked', target_wave: 'wave_3' },
  { domain_id: 'B.3.6.sports_outcomes_probability_mode', block: 'B', macro_area_id: 'B.3.6', title: 'Sports Outcomes (Probability Mode)', current_state: 'blocked', target_wave: 'wave_3' },
  { domain_id: 'B.3.7.travel_personal_outcomes', block: 'B', macro_area_id: 'B.3.7', title: 'Travel Personal Outcomes', current_state: 'blocked', target_wave: 'wave_3' },
  { domain_id: 'B.3.8.personal_decisions_and_tradeoffs', block: 'B', macro_area_id: 'B.3.8', title: 'Personal Decisions and Tradeoffs', current_state: 'blocked', target_wave: 'wave_3' },
  { domain_id: 'C.1.attention_waves', block: 'C', macro_area_id: 'C.1', title: 'Attention Waves', current_state: 'blocked', target_wave: 'wave_4' },
  { domain_id: 'C.2.event_pressure_forecast', block: 'C', macro_area_id: 'C.2', title: 'Event Pressure Forecast', current_state: 'blocked', target_wave: 'wave_4' },
  { domain_id: 'C.3.hype_curve_tracker', block: 'C', macro_area_id: 'C.3', title: 'Hype Curve Tracker', current_state: 'blocked', target_wave: 'wave_4' },
  { domain_id: 'C.4.global_quote_stream', block: 'C', macro_area_id: 'C.4', title: 'Global Quote Stream', current_state: 'blocked', target_wave: 'wave_4' },
];

export const SUPPORTED_DOMAINS = BLUEPRINT_STATIC_DOMAINS.map((domain) => domain.domain_id);
