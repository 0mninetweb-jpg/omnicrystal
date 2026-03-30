# Crystal domain quality matrix

Generated at: 2026-03-28T18:19:12.922Z
Domains covered: 43
Rows scanned: 86
Top-1 hit rate: 85%
Top-3 miss count: 8
Silent A.0 fallback count: 0
Canonical publishable domains: 42
Domains with blocker reason: 1
Domains ready for preservation: 42
Domains needing provider work: 0
Domains in quality follow-up: 1
Thin evidence blockers: 0
Edge publishable rows: 15
Edge quality follow-up rows: 27
Edge top-1 hit rate: 72%
Verdict: sprint_matrix_ready

## Week 1 Targets
Baseline date: 2026-03-28
Top-1 hit rate: 85% (target 65%, delta vs baseline 26 pts)
Canonical publishable domains: 42 (target 8, delta 38)
Provider gap domains: 0 (target <= 24, delta -30)
Thin evidence blockers: 0 (target materially below 18)
Batch 2 gate verdict: week1_batch2_on_track

## Batch 3 Targets
Baseline date: 2026-03-28
Top-1 hit rate: 85% (target 74%, delta vs baseline 14 pts)
Canonical publishable domains: 42 (target 36, delta 10)
Thin evidence blockers: 0 (target <= 4, delta -10)
Provider gap domains: 0 (target 0, delta 0)
Batch 3 gate verdict: week1_batch3_on_track

## Week 2 Edge Targets
Baseline date: 2026-03-28
Edge publishable rows: 15 (target >= 6, delta 13)
Edge quality follow-up rows: 27 (target <= 35, delta -14)
Edge top-1 hit rate: 72% (target 67%, delta vs baseline 9 pts)
Edge thin evidence blockers: 7 (target <= 10, delta -8)
Edge thin signal convergence blockers: 13 (target <= 14, delta -6)
Week 2 gate verdict: week2_provider_depth_on_track

## Current Wave
Week 4 canary posture: defer_until_after_prediction_quality_sprint
Hard blockers: A.29.sports_performance_and_outcomes

## Cluster Summary
- general_and_other: 4 domains | canonical publishable 4 | edge publishable 0 | ready 4 | provider gaps 0 | quality follow-up 0 | edge quality follow-up 4 | routing blockers 0
  - blocker none: 4
- weather_climate_water_environment: 6 domains | canonical publishable 6 | edge publishable 1 | ready 6 | provider gaps 0 | quality follow-up 0 | edge quality follow-up 5 | routing blockers 0
  - blocker none: 6
- city_mobility_travel_infrastructure: 5 domains | canonical publishable 5 | edge publishable 3 | ready 5 | provider gaps 0 | quality follow-up 0 | edge quality follow-up 2 | routing blockers 0
  - blocker none: 5
- macro_cost_housing_jobs_trade_industry: 8 domains | canonical publishable 8 | edge publishable 4 | ready 8 | provider gaps 0 | quality follow-up 0 | edge quality follow-up 3 | routing blockers 0
  - blocker none: 8
- markets_policy_geopolitics: 4 domains | canonical publishable 4 | edge publishable 1 | ready 4 | provider gaps 0 | quality follow-up 0 | edge quality follow-up 3 | routing blockers 0
  - blocker none: 4
- health_safety_sports_culture: 4 domains | canonical publishable 4 | edge publishable 1 | ready 4 | provider gaps 0 | quality follow-up 0 | edge quality follow-up 3 | routing blockers 0
  - blocker none: 4
- derived_personal_and_meta: 12 domains | canonical publishable 11 | edge publishable 5 | ready 11 | provider gaps 0 | quality follow-up 1 | edge quality follow-up 7 | routing blockers 0
  - blocker none: 11
  - blocker below_publish_confidence: 1

## Top Blockers

- none: 42
- below_publish_confidence: 1

## Edge Blockers

- none: 16
- thin_signal_convergence: 13
- thin_evidence_coverage: 7
- directional_signal_not_publish_ready: 4
- provider_required_no_pick: 2
- below_publish_confidence: 1

## Week 2 Focus Rows

- A.8.mobility_congestion_and_accessibility: edge publishable/published | blocker  | top-1 A.8.mobility_congestion_and_accessibility | pack aligned | targeted provider yes
- A.9.travel_flows_and_disruption: edge publishable/published | blocker  | top-1 A.9.travel_flows_and_disruption | pack aligned | targeted provider yes
- A.11.cost_of_living_and_price_pressure: edge watchlist/limited | blocker  | top-1 A.11.cost_of_living_and_price_pressure | pack aligned | targeted provider yes
- A.12.housing_and_real_estate_signals: edge publishable/published | blocker  | top-1 B.3.8.personal_decisions_and_tradeoffs | pack strong | targeted provider yes
- A.13.energy_and_utilities_markets: edge watchlist/limited | blocker directional_signal_not_publish_ready | top-1 A.13.energy_and_utilities_markets | pack aligned | targeted provider yes
- A.14.macro_economy_and_cycles: edge publishable/published | blocker  | top-1 A.14.macro_economy_and_cycles | pack aligned | targeted provider yes
- A.15.jobs_and_labor_market_signals: edge publishable/published | blocker  | top-1 A.15.jobs_and_labor_market_signals | pack aligned | targeted provider yes
- A.20.infrastructure_and_logistics_reliability: edge publishable/published | blocker  | top-1 A.20.infrastructure_and_logistics_reliability | pack strong | targeted provider yes
- A.21.trade_supply_and_disruption_signals: edge watchlist/limited | blocker directional_signal_not_publish_ready | top-1 A.21.trade_supply_and_disruption_signals | pack strong | targeted provider yes
- A.22.industry_and_business_cycles: edge publishable/published | blocker  | top-1 A.22.industry_and_business_cycles | pack strong | targeted provider yes
- A.25.geopolitics_and_conflict_dynamics: edge watchlist/limited | blocker directional_signal_not_publish_ready | top-1 A.25.geopolitics_and_conflict_dynamics | pack focused | targeted provider yes
- A.28.public_health_and_environmental_exposure: edge watchlist/limited | blocker directional_signal_not_publish_ready | top-1 A.4.environment_and_exposure | pack strong | targeted provider yes
- A.29.sports_performance_and_outcomes: edge blocked_no_pick/blocked | blocker provider_required_no_pick | top-1 A.29.sports_performance_and_outcomes | pack  | targeted provider no
- A.30.culture_events_and_attention: edge publishable/published | blocker  | top-1 C.2.event_pressure_forecast | pack aligned | targeted provider yes
- B.3.4.personal_finance_outcomes: edge publishable/published | blocker  | top-1 B.3.4.personal_finance_outcomes | pack aligned | targeted provider yes
- B.3.6.sports_outcomes_probability_mode: edge blocked_no_pick/blocked | blocker provider_required_no_pick | top-1 B.3.3.work_and_career_outcomes | pack  | targeted provider no
- B.3.7.travel_personal_outcomes: edge publishable/published | blocker  | top-1 A.9.travel_flows_and_disruption | pack  | targeted provider yes
- B.3.8.personal_decisions_and_tradeoffs: edge publishable/published | blocker  | top-1 B.3.8.personal_decisions_and_tradeoffs | pack aligned | targeted provider yes
- C.2.event_pressure_forecast: edge publishable/published | blocker  | top-1 C.2.event_pressure_forecast | pack aligned | targeted provider yes

## Domain Matrix

| Domain | Cluster | Canonical top-1 | Edge top-1 | Canonical quality | Edge quality | Row state | Action | Blocker | Pack | Decision | Thin reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A.0.general.general_forecast | general_and_other | A.0.general.general_forecast | A.0.general.general_forecast | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence |  |  |  |
| A.1.weather_and_atmosphere | weather_climate_water_environment | A.1.weather_and_atmosphere | A.9.travel_flows_and_disruption | publishable/published | publishable/published | ready | preserve_baseline |  |  |  |  |
| A.2.climate_hazards_and_disaster_risk | weather_climate_water_environment | A.2.climate_hazards_and_disaster_risk | A.2.climate_hazards_and_disaster_risk | publishable/published | watchlist/limited | ready | preserve_baseline | thin_evidence_coverage |  |  |  |
| A.3.water_and_hydrology_signals | weather_climate_water_environment | A.3.water_and_hydrology_signals | A.2.climate_hazards_and_disaster_risk | publishable/published | watchlist/limited | ready | preserve_baseline | thin_evidence_coverage |  |  |  |
| A.4.environment_and_exposure | weather_climate_water_environment | A.4.environment_and_exposure | A.4.environment_and_exposure | publishable/published | watchlist/limited | ready | preserve_baseline | thin_evidence_coverage |  |  |  |
| A.5.food_security_and_staple_prices | weather_climate_water_environment | A.5.food_security_and_staple_prices | A.5.food_security_and_staple_prices | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence | aligned |  |  |
| A.6.agriculture_and_seasonal_production | weather_climate_water_environment | A.6.agriculture_and_seasonal_production | A.6.agriculture_and_seasonal_production | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence |  |  |  |
| A.7.city_pulse_and_urban_pressure | city_mobility_travel_infrastructure | A.7.city_pulse_and_urban_pressure | A.7.city_pulse_and_urban_pressure | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence |  |  |  |
| A.8.mobility_congestion_and_accessibility | city_mobility_travel_infrastructure | A.8.mobility_congestion_and_accessibility | A.8.mobility_congestion_and_accessibility | publishable/published | publishable/published | ready | preserve_baseline |  | aligned |  |  |
| A.9.travel_flows_and_disruption | city_mobility_travel_infrastructure | A.9.travel_flows_and_disruption | A.9.travel_flows_and_disruption | publishable/published | publishable/published | ready | preserve_baseline |  | aligned |  |  |
| A.10.connectivity_and_network_quality_signals | city_mobility_travel_infrastructure | A.10.connectivity_and_network_quality_signals | A.10.connectivity_and_network_quality_signals | publishable/published | watchlist/limited | ready | preserve_baseline | thin_evidence_coverage |  |  |  |
| A.11.cost_of_living_and_price_pressure | macro_cost_housing_jobs_trade_industry | A.11.cost_of_living_and_price_pressure | A.11.cost_of_living_and_price_pressure | publishable/published | watchlist/limited | ready | preserve_baseline |  | aligned |  |  |
| A.12.housing_and_real_estate_signals | macro_cost_housing_jobs_trade_industry | A.12.housing_and_real_estate_signals | B.3.8.personal_decisions_and_tradeoffs | publishable/published | publishable/published | ready | preserve_baseline |  | strong |  |  |
| A.13.energy_and_utilities_markets | macro_cost_housing_jobs_trade_industry | A.13.energy_and_utilities_markets | A.13.energy_and_utilities_markets | publishable/published | watchlist/limited | ready | preserve_baseline | directional_signal_not_publish_ready | aligned |  |  |
| A.14.macro_economy_and_cycles | macro_cost_housing_jobs_trade_industry | A.14.macro_economy_and_cycles | A.14.macro_economy_and_cycles | publishable/published | publishable/published | ready | preserve_baseline |  | strong |  |  |
| A.15.jobs_and_labor_market_signals | macro_cost_housing_jobs_trade_industry | A.15.jobs_and_labor_market_signals | A.15.jobs_and_labor_market_signals | publishable/published | publishable/published | ready | preserve_baseline |  | aligned |  |  |
| A.16.consumer_sentiment_and_attention_economics | general_and_other | A.16.consumer_sentiment_and_attention_economics | A.14.macro_economy_and_cycles | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence |  |  |  |
| A.17.technology_adoption_and_digital_pulse | general_and_other | A.17.technology_adoption_and_digital_pulse | A.17.technology_adoption_and_digital_pulse | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence |  |  |  |
| A.18.education_system_and_skills_pipeline | general_and_other | A.18.education_system_and_skills_pipeline | A.1.weather_and_atmosphere | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence |  |  |  |
| A.19.demographics_and_migration_pressure | macro_cost_housing_jobs_trade_industry | A.19.demographics_and_migration_pressure | A.19.demographics_and_migration_pressure | publishable/published | watchlist/limited | ready | preserve_baseline | thin_evidence_coverage |  |  |  |
| A.20.infrastructure_and_logistics_reliability | city_mobility_travel_infrastructure | A.20.infrastructure_and_logistics_reliability | A.20.infrastructure_and_logistics_reliability | publishable/published | publishable/published | ready | preserve_baseline |  | strong |  |  |
| A.21.trade_supply_and_disruption_signals | macro_cost_housing_jobs_trade_industry | A.21.trade_supply_and_disruption_signals | A.21.trade_supply_and_disruption_signals | publishable/published | watchlist/limited | ready | preserve_baseline | directional_signal_not_publish_ready | focused |  |  |
| A.22.industry_and_business_cycles | macro_cost_housing_jobs_trade_industry | A.22.industry_and_business_cycles | A.22.industry_and_business_cycles | publishable/published | publishable/published | ready | preserve_baseline |  | aligned |  |  |
| A.23.markets_and_asset_regimes | markets_policy_geopolitics | A.23.markets_and_asset_regimes | A.23.markets_and_asset_regimes | publishable/published | publishable/published | ready | preserve_baseline |  |  |  |  |
| A.24.governance_policy_and_public_timeline | markets_policy_geopolitics | A.24.governance_policy_and_public_timeline | A.24.governance_policy_and_public_timeline | publishable/published | watchlist/limited | ready | preserve_baseline | thin_evidence_coverage |  |  |  |
| A.25.geopolitics_and_conflict_dynamics | markets_policy_geopolitics | A.25.geopolitics_and_conflict_dynamics | A.25.geopolitics_and_conflict_dynamics | publishable/published | watchlist/limited | ready | preserve_baseline | directional_signal_not_publish_ready | strong |  |  |
| A.26.human_history_and_long_run_analogs | markets_policy_geopolitics | A.26.human_history_and_long_run_analogs | A.14.macro_economy_and_cycles | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence | aligned |  |  |
| A.27.safety_and_incident_risk | health_safety_sports_culture | A.27.safety_and_incident_risk | A.27.safety_and_incident_risk | publishable/published | watchlist/limited | ready | preserve_baseline | thin_evidence_coverage |  |  |  |
| A.28.public_health_and_environmental_exposure | health_safety_sports_culture | A.28.public_health_and_environmental_exposure | A.4.environment_and_exposure | publishable/published | watchlist/limited | ready | preserve_baseline | directional_signal_not_publish_ready | strong |  |  |
| A.29.sports_performance_and_outcomes | health_safety_sports_culture | A.29.sports_performance_and_outcomes | A.29.sports_performance_and_outcomes | publishable/published | blocked_no_pick/blocked | ready | preserve_baseline | provider_required_no_pick |  |  |  |
| A.30.culture_events_and_attention | health_safety_sports_culture | A.30.culture_events_and_attention | C.2.event_pressure_forecast | publishable/published | publishable/published | ready | preserve_baseline |  | focused |  |  |
| B.3.1.love_and_social_outcomes | derived_personal_and_meta | B.3.1.love_and_social_outcomes | B.3.1.love_and_social_outcomes | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence |  |  |  |
| B.3.2.study_and_exams_outcomes | derived_personal_and_meta | B.3.2.study_and_exams_outcomes | B.3.2.study_and_exams_outcomes | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence |  |  |  |
| B.3.3.work_and_career_outcomes | derived_personal_and_meta | B.3.3.work_and_career_outcomes | B.3.3.work_and_career_outcomes | publishable/published | publishable/published | ready | preserve_baseline |  | aligned | guided |  |
| B.3.4.personal_finance_outcomes | derived_personal_and_meta | B.3.4.personal_finance_outcomes | B.3.4.personal_finance_outcomes | publishable/published | publishable/published | ready | preserve_baseline |  | aligned | ready |  |
| B.3.5.business_idea_outcomes | derived_personal_and_meta | B.3.5.business_idea_outcomes | B.3.3.work_and_career_outcomes | publishable/published | watchlist/limited | ready | preserve_baseline | below_publish_confidence | aligned | guided |  |
| B.3.6.sports_outcomes_probability_mode | derived_personal_and_meta | A.29.sports_performance_and_outcomes | B.3.3.work_and_career_outcomes | publishable/published | blocked_no_pick/blocked | ready | preserve_baseline | provider_required_no_pick |  |  |  |
| B.3.7.travel_personal_outcomes | derived_personal_and_meta | B.3.7.travel_personal_outcomes | A.9.travel_flows_and_disruption | publishable/published | publishable/published | ready | preserve_baseline |  |  |  |  |
| B.3.8.personal_decisions_and_tradeoffs | derived_personal_and_meta | B.3.8.personal_decisions_and_tradeoffs | B.3.8.personal_decisions_and_tradeoffs | watchlist/limited | publishable/published | quality_follow_up | tighten_shared_quality_or_domain_pack | below_publish_confidence | strong | ready |  |
| C.1.attention_waves | derived_personal_and_meta | C.1.attention_waves | C.1.attention_waves | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence |  |  |  |
| C.2.event_pressure_forecast | derived_personal_and_meta | C.2.event_pressure_forecast | C.2.event_pressure_forecast | publishable/published | publishable/published | ready | preserve_baseline |  | aligned |  |  |
| C.3.hype_curve_tracker | derived_personal_and_meta | C.3.hype_curve_tracker | A.23.markets_and_asset_regimes | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence |  |  |  |
| C.4.global_quote_stream | derived_personal_and_meta | C.4.global_quote_stream | C.4.global_quote_stream | publishable/published | watchlist/limited | ready | preserve_baseline | thin_signal_convergence |  |  |  |

## Domains Requiring Follow-Up

- A.0.general.general_forecast: General questions are supported, but they should converge toward a concrete blueprint domain when possible. | provider hints: none | action: preserve_baseline
- A.2.climate_hazards_and_disaster_risk: The registry is ready, but hazard layering still needs more source fusion and calibration. | provider hints: none | action: preserve_baseline
- A.3.water_and_hydrology_signals: Hydrology support is scaffolded, but the operational feature bundle is still partial. | provider hints: none | action: preserve_baseline
- A.4.environment_and_exposure: Environmental exposure is modeled in the registry, but public evidence fusion is still incomplete. | provider hints: none | action: preserve_baseline
- A.5.food_security_and_staple_prices: The domain is in registry with a public-source posture, but the dedicated food stack is not fully wired yet. | provider hints: none | action: preserve_baseline
- A.6.agriculture_and_seasonal_production: The blueprint domain is registered, but the agricultural evidence fabric is not operational yet. | provider hints: none | action: preserve_baseline
- A.7.city_pulse_and_urban_pressure: City pulse can already reuse public geospatial and trend signals in a truthful coverage envelope. | provider hints: none | action: preserve_baseline
- A.10.connectivity_and_network_quality_signals: The connectivity domain is registered, but the public telemetry layer is not connected yet. | provider hints: none | action: preserve_baseline
- A.13.energy_and_utilities_markets: Energy is one of the strongest public-source domains already compatible with the product. | provider hints: none | action: preserve_baseline
- A.16.consumer_sentiment_and_attention_economics: The domain is live in the registry, but attention grounding still depends on a lighter public stack. | provider hints: none | action: preserve_baseline
- A.17.technology_adoption_and_digital_pulse: Technology adoption is cataloged with public evidence lanes, but feature depth is still expanding. | provider hints: none | action: preserve_baseline
- A.18.education_system_and_skills_pipeline: Education is in the registry, but the public scheduling and exam fabric is not production-ready yet. | provider hints: none | action: preserve_baseline
- A.19.demographics_and_migration_pressure: Demographic and migration logic is available in the registry, with partial public-source readiness. | provider hints: none | action: preserve_baseline
- A.21.trade_supply_and_disruption_signals: Supply chain signals are represented in the registry, but the public evidence pack is still broadening. | provider hints: none | action: preserve_baseline
- A.24.governance_policy_and_public_timeline: The public timeline domain is cataloged, but event normalization is still partial. | provider hints: none | action: preserve_baseline
- A.25.geopolitics_and_conflict_dynamics: Geopolitics is one of the strongest evidence-first domains for the current stack. | provider hints: none | action: preserve_baseline
- A.26.human_history_and_long_run_analogs: Long-run analogs can already support explanation, but the analog engine is still selective. | provider hints: none | action: preserve_baseline
- A.27.safety_and_incident_risk: Safety is registered, but it stays blocked until the public incident evidence fabric is production-ready. | provider hints: none | action: preserve_baseline
- A.28.public_health_and_environmental_exposure: Public health is cataloged with viable public inputs, but the blended signal set is still partial. | provider hints: none | action: preserve_baseline
- A.29.sports_performance_and_outcomes: Sports remains one of the clearest high-frequency use cases, even while provider depth is still improving. | provider hints: none | action: preserve_baseline
- B.3.1.love_and_social_outcomes: Personal outcomes stay blocked until the upstream A-layer and boost-confidence flow are in place. | provider hints: none | action: preserve_baseline
- B.3.2.study_and_exams_outcomes: Study outcomes depend on boost inputs and upstream B orchestration that is not live yet. | provider hints: none | action: preserve_baseline
- B.3.5.business_idea_outcomes: Business idea outcomes remain pending until B orchestration and evidence packs are shipped. | provider hints: none | action: preserve_baseline
- B.3.6.sports_outcomes_probability_mode: Personalized sports outcomes stay out of the critical path until B is live. | provider hints: none | action: preserve_baseline
- B.3.8.personal_decisions_and_tradeoffs: below_publish_confidence | provider hints: none | action: tighten_shared_quality_or_domain_pack
- C.1.attention_waves: Fun Pack stays behind the core registry and trust rollout. | provider hints: none | action: preserve_baseline
- C.3.hype_curve_tracker: Fun Pack remains blocked until the core trust model is fully stabilized. | provider hints: none | action: preserve_baseline
- C.4.global_quote_stream: Quote stream remains behind the registry and coverage hardening work. | provider hints: none | action: preserve_baseline