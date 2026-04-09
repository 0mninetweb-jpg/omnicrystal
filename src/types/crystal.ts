import type { WorldSimJobRef } from './worldSimJob';

export interface TrustLayer {
  confidence_score: number;
  confidence_tier: 'low' | 'medium' | 'high';
  data_sufficiency_flag: 'insufficient' | 'partial' | 'sufficient';
  freshness: {
    staleness_bucket: 'fresh' | 'stale' | 'unknown';
    as_of_utc: string;
  };
  provenance_summary: {
    verification_level: 'unverified' | 'partially_verified' | 'verified' | 'official';
    license_summary: string[];
  };
}

export interface EvidenceDrawer {
  metrics_provenance: string[];
  freshness_summary: {
    as_of_utc: string;
    cadence: string;
    staleness_bucket: string;
  };
  coverage_notes: string[];
  gating_reason: string;
}

export interface Scenario {
  scenario_id: string;
  label: string;
  probability: number;
}

export interface Option {
  option_id: string;
  label: string;
  tradeoff_note: string;
}

export interface Driver {
  feature_key: string;
  direction: 'up' | 'down' | 'flat';
  contribution: number;
  historical_trend?: { year: number; value: number }[];
}

export interface FixtureRead {
  fixture_id: string;
  label: string;
  primary_call: string;
  confidence: number;
  rationale: string;
  evidence: string[];
  caution?: string;
}

export interface PredictionMarketFrame {
  outcome: string;
  horizon: string;
  resolution_criteria: string;
  reference_market?: string;
  prior_probability?: number | null;
  market_id?: string | null;
  market_slug?: string | null;
  market_question?: string;
  market_url?: string | null;
  implied_probability?: number | null;
  match_confidence?: number | null;
  market_quality?: number | null;
  open_interest?: number | null;
  volume_24h?: number | null;
  liquidity?: number | null;
  price_updated_at?: string | null;
  divergence_vs_crystal?: number | null;
  calibration_applied?: boolean;
  calibration_note?: string;
  crystal_probability?: number | null;
  calibrated_probability?: number | null;
  price_change_7d?: number | null;
}

export interface ProbabilitySplit {
  primary_label: string;
  primary_probability: number;
  secondary_label: string;
  secondary_probability: number;
}

export interface BinaryContract {
  question_side_a: string;
  question_side_b: string;
  question_side_a_probability: number;
  question_side_b_probability: number;
  winning_side: string;
  winning_probability: number;
  band: 'limited' | 'lean' | 'tilted' | 'strong' | string;
  display_call: string;
  flip_conditions?: string[];
}

export interface SportsOutcomeProbabilities {
  home?: number | null;
  draw?: number | null;
  away?: number | null;
  home_label?: string | null;
  draw_label?: string | null;
  away_label?: string | null;
}

export interface SportsEdgeDelta {
  home?: number | null;
  draw?: number | null;
  away?: number | null;
  best_key?: string | null;
  best_label?: string | null;
  best_delta?: number | null;
}

export interface SportsDecisionDigest {
  market_ready?: boolean;
  sharp_market_available?: boolean;
  proxy_market_available?: boolean;
  market_source?: string | null;
  market_source_class?: 'sharp' | 'proxy' | 'retail' | 'none' | string | null;
  market_quality_tier?: string | null;
  market_truth_confidence?: number | null;
  retail_sentiment_pressure?: number | null;
  retail_bias_risk?: number | null;
  decision_state?: 'hold' | 'grounded_lean' | 'no_bet' | 'lean' | 'edge' | string | null;
  decision_reason?: string | null;
  no_bet_reason?: string | null;
  model_probabilities?: SportsOutcomeProbabilities | null;
  market_probabilities?: SportsOutcomeProbabilities | null;
  fair_prices?: SportsOutcomeProbabilities | null;
  edge_delta?: SportsEdgeDelta | null;
  upset_rate?: number | null;
  draw_volatility?: number | null;
  fragility_score?: number | null;
  flip_conditions?: string[] | null;
  simulation_confidence?: number | null;
  model_favorite?: string | null;
  market_favorite?: string | null;
  favorite_but_no_bet?: boolean;
  notes?: string[] | null;
}

export interface DecisionKernelDigest {
  family?: string | null;
  decision_state?: 'hold' | 'grounded_lean' | 'no_action' | 'lean' | 'edge' | string | null;
  decision_reason?: string | null;
  reference_source_class?: 'sharp' | 'proxy' | 'retail' | 'baseline' | 'none' | string | null;
  reference_probability?: number | null;
  edge_delta?: number | null;
  fragility_score?: number | null;
  no_action_reason?: string | null;
  flip_conditions?: string[] | null;
  simulation_confidence?: number | null;
  model_probability?: number | null;
  reference_source?: string | null;
  reference_note?: string | null;
}

export interface CoordinationPass {
  capability_id: string;
  title?: string | null;
  family?: string | null;
  runtime_context?: string | null;
  allowed?: boolean;
  allowed_runtime_contexts?: string[] | null;
  read_only?: boolean;
  mutating?: boolean;
  concurrency_safe?: boolean;
  requires_grounding?: boolean;
  allowed_reference_source_classes?: string[] | null;
  preconditions?: string[] | null;
  timeout_class?: string | null;
  retry_policy?: string | null;
  side_effect_class?: string | null;
  external_side_effect?: boolean;
  status?: string | null;
  reason?: string | null;
  handler_module?: string | null;
}

export interface CoordinationTrace {
  coordinator_mode?: string | null;
  family?: string | null;
  runtime_context?: string | null;
  truth_grounded?: boolean;
  reference_source_class?: string | null;
  semantic_ready?: boolean;
  decision_state?: string | null;
  passes?: CoordinationPass[] | null;
}

export interface PublicationBasis {
  coverage_score: number;
  freshness_score: number;
  agreement_score: number;
  conflict_score: number;
  source_count?: number;
  domain_state?: string;
  notes?: string[];
  blocker_reason?: string | null;
  quality_verdict?: string | null;
  provider_required_no_pick?: boolean;
  sports_pick_state?: string | null;
  sports_grounded?: boolean;
  fixture_window_state?: string | null;
  fixture_window_open?: boolean;
  sports_extraction_provenance?: string[] | null;
  sports_confidence_tier?: string | null;
  sports_semantic_ready?: boolean;
  sports_overlay_confidence?: number | null;
  sports_overlay_blocker_reason?: string | null;
  sports_publish_gate_ready?: boolean;
  market_consensus_strength?: number | null;
  market_disagreement_score?: number | null;
  price_move_pressure?: number | null;
  narrative_hype_score?: number | null;
  sportsbook_readiness_state?: string | null;
  sports_decision_state?: string | null;
  sports_decision_reason?: string | null;
  sports_no_bet_reason?: string | null;
  sports_model_probabilities?: SportsOutcomeProbabilities | null;
  sports_market_probabilities?: SportsOutcomeProbabilities | null;
  sports_edge_delta?: SportsEdgeDelta | null;
  sports_fair_prices?: SportsOutcomeProbabilities | null;
  sports_fragility_score?: number | null;
  sports_simulation_confidence?: number | null;
  sports_model_favorite?: string | null;
  sports_market_favorite?: string | null;
  sports_favorite_but_no_bet?: boolean;
  sports_fixture_kind?: string | null;
  sports_fixture_candidate_score?: number | null;
  sports_fixture_resolution_reason?: string | null;
  sports_fixture_date_match?: boolean;
  sports_fixture_competition_match?: boolean | null;
  sports_market_source?: string | null;
  sports_market_source_class?: string | null;
  sports_market_quality_tier?: string | null;
  sports_market_snapshot?: {
    snapshot_time?: string | null;
    open_snapshot?: unknown;
    latest_snapshot?: unknown;
  } | null;
  sports_market_overround?: number | null;
  decision_state?: string | null;
  decision_reason?: string | null;
  reference_source_class?: string | null;
  reference_probability?: number | null;
  edge_delta?: number | null;
  fragility_score?: number | null;
  no_action_reason?: string | null;
  flip_conditions?: string[] | null;
  simulation_confidence?: number | null;
}

export interface SportsGrounding {
  provider_required: boolean;
  provider_configured: boolean;
  fixture_resolved: boolean;
  parity_ready: boolean;
  fixture_id?: number | null;
  sports_pick_state?: string | null;
  sports_grounded?: boolean;
  fixture_window_state?: string | null;
  fixture_window_open?: boolean;
  sports_fixture_kind?: string | null;
  sports_fixture_candidate_score?: number | null;
  sports_fixture_resolution_reason?: string | null;
  sports_fixture_date_match?: boolean;
  sports_fixture_competition_match?: boolean | null;
  sports_extraction_provenance?: string[] | null;
  sports_confidence_tier?: string | null;
  semantic_ready?: boolean;
  overlay_confidence?: number | null;
  overlay_blocker_reason?: string | null;
  publish_gate_ready?: boolean;
  question_side_a?: string | null;
  question_side_b?: string | null;
  winning_side?: string | null;
  winning_probability?: number | null;
  model_probabilities?: SportsOutcomeProbabilities | null;
  market_probabilities?: SportsOutcomeProbabilities | null;
  fair_prices?: SportsOutcomeProbabilities | null;
  model_favorite?: string | null;
  market_favorite?: string | null;
  sports_market_source?: string | null;
  sports_market_source_class?: string | null;
  sports_market_quality_tier?: string | null;
  sports_market_snapshot?: {
    snapshot_time?: string | null;
    open_snapshot?: unknown;
    latest_snapshot?: unknown;
  } | null;
  sports_market_overround?: number | null;
  market_frame?: {
    source?: string | null;
    source_class?: string | null;
    market_type?: string | null;
    selection_probabilities?: SportsOutcomeProbabilities | null;
    fair_probabilities?: SportsOutcomeProbabilities | null;
    overround?: number | null;
    snapshot_time?: string | null;
    open_snapshot?: unknown;
    latest_snapshot?: unknown;
    market_quality_tier?: string | null;
  } | null;
  key_drivers?: string[];
  counter_signals?: string[];
  invalidators?: string[];
  reason?: string | null;
  market_consensus_strength?: number | null;
  market_disagreement_score?: number | null;
  price_move_pressure?: number | null;
  narrative_hype_score?: number | null;
  sportsbook_readiness_state?: string | null;
}

export interface SportsSemanticOverlay {
  enabled: boolean;
  mode?: string;
  ready?: boolean;
  publish_gate_ready?: boolean;
  confidence?: number | null;
  blocker_reason?: string | null;
  source_count?: number;
  freshness_hours?: number | null;
  entity_alignment_score?: number;
  contradiction_score?: number;
  injury_pressure?: number;
  lineup_uncertainty?: number;
  managerial_disruption?: number;
  travel_fatigue?: number;
  motivation_context?: number;
  narrative_consensus?: string | null;
  used_source_ids?: string[];
  extraction_provenance?: string[];
  notes?: string[];
}

export interface SportsMarketOverlay {
  enabled: boolean;
  available?: boolean;
  sharp_market_available?: boolean;
  market_frame?: SportsGrounding['market_frame'];
  sports_market_source?: string | null;
  sports_market_source_class?: string | null;
  sports_market_quality_tier?: string | null;
  sports_market_snapshot?: SportsGrounding['sports_market_snapshot'];
  sports_market_overround?: number | null;
  market_truth_confidence?: number | null;
  retail_sentiment_only?: boolean;
  retail_sentiment_pressure?: number | null;
  retail_bias_risk?: number | null;
  source_weight_profile?: string | null;
  used_source_ids?: string[];
  source_count?: number;
  confidence?: number | null;
  notes?: string[];
  key_drivers?: string[];
  invalidators?: string[];
  google_trends?: {
    keyword?: string;
    latest_interest?: number;
    peak_interest?: number;
    average_interest?: number;
    momentum_score?: number;
    narrative_hype_score?: number;
    note?: string;
  } | null;
  polymarket_public?: {
    market_question?: string;
    market_url?: string | null;
    implied_probability?: number | null;
    match_confidence?: number | null;
    market_quality?: number | null;
    divergence_vs_crystal?: number | null;
    price_change_7d?: number | null;
    market_consensus_strength?: number | null;
    market_disagreement_score?: number | null;
    price_move_pressure?: number | null;
    note?: string;
  } | null;
  market_consensus_strength?: number | null;
  market_disagreement_score?: number | null;
  price_move_pressure?: number | null;
  narrative_hype_score?: number | null;
  sportsbook_readiness_state?: string | null;
}

export interface ResolvedTimeWindow {
  label: string;
  start_date: string;
  end_date: string;
}

export interface TemporalContext {
  as_of_utc: string;
  as_of_timezone: string;
  as_of_local_date: string;
  uses_relative_time: boolean;
  relative_phrase?: string;
  resolved_time_window?: ResolvedTimeWindow | null;
}

export interface ResolutionTarget {
  resolution_id: string;
  target_type: 'binary_outcome' | 'directional_range';
  source_type: string;
  resolution_due_at: string;
  resolution_window_days?: number;
  question_side_a?: string | null;
  question_side_b?: string | null;
  market_slug?: string | null;
  market_id?: string | null;
  event_date?: string | null;
  evaluation_eligible?: boolean;
}

export interface CalibrationSnapshot {
  active: boolean;
  calibration_version?: string | null;
  raw_probability?: number;
  calibrated_probability?: number;
  raw_winning_probability?: number;
  calibrated_winning_probability?: number;
  raw_confidence?: number;
  calibrated_confidence?: number;
  band?: string;
  thresholds?: {
    published_min_confidence?: number;
    published_min_coverage?: number;
    max_conflict_for_published?: number;
  };
  updated_at?: string | null;
}

export interface WorldSimCounterfactual {
  label: string;
  outcome: string;
}

export interface WorldSimDigest {
  enabled: boolean;
  simulation_mode: 'cache_hit' | 'delta_simulation' | 'full_rebuild' | 'narrative_only' | string;
  quality_score: number;
  graph_coverage: number;
  agent_convergence: number;
  graph_age_hours: number;
  narrative_arc: string;
  pivotal_actors: string[];
  intervention_points: string[];
  counterfactuals: WorldSimCounterfactual[];
  source_set: string[];
  scenario_frequencies: {
    label: string;
    probability: number;
  }[];
  prediction_market_frame?: PredictionMarketFrame | null;
  probability_delta: number;
  confidence_delta: number;
  graph_summary?: string;
  community_summaries?: string[];
  tensions?: string[];
  simulation_id?: string | null;
  cache_status?: string;
  generated_at?: string;
  notes?: string[];
  matrix_mode?: 'observe' | 'intervene';
  matrix_branch_id?: string | null;
  sports_decision?: SportsDecisionDigest | null;
  whale_mode?: DecisionKernelDigest | null;
  coordination_trace?: CoordinationTrace | null;
}

export interface CardData {
  card_id: string;
  card_type: string;
  canonical_card_type?: string;
  card_state?: 'published' | 'limited' | 'blocked';
  version_id?: string;
  domain: string;
  stakes_level: 'low' | 'medium' | 'high' | 'imminent';
  risk_band?: 'low' | 'medium' | 'high' | 'extreme';
  title: string;
  summary: string;
  verdict?: string;
  temporal_context?: TemporalContext | null;
  run_as_of_utc?: string;
  run_as_of_timezone?: string;
  run_as_of_local_date?: string;
  relative_time_phrase?: string;
  resolved_time_window?: ResolvedTimeWindow | null;
  primary_call?: string;
  binary_contract?: BinaryContract | null;
  probability_split?: ProbabilitySplit | null;
  why_this_side?: string;
  personal_output?: string;
  scenario_set?: Scenario[];
  so_what?: Option[];
  drivers?: Driver[];
  fixture_reads?: FixtureRead[];
  counter_signals?: string[];
  historical_anchors?: string[];
  invalidators?: string[];
  publication_basis?: PublicationBasis | null;
  what_to_watch?: string[];
  how_to_raise_confidence?: string[];
  evidence_drawer?: EvidenceDrawer;
  lineage_id?: string;
  ledger_ref?: string | null;
  public_forecast_ref?: string | null;
  public_slug?: string | null;
  query_origin?: string;
  ranked_list?: {
    item_id: string;
    label: string;
    score: number;
    rank: number;
    note?: string;
  }[];
  trust_layer: TrustLayer;
  prediction_market_frame?: PredictionMarketFrame | null;
  world_sim?: WorldSimDigest;
  world_sim_job?: WorldSimJobRef | null;
  pending_run?: {
    run_id: string;
    status: 'running' | 'completed' | 'failed';
    visibility: 'private' | 'public';
    access_token?: string | null;
    poll_after_ms?: number;
  };
  resolution_target?: ResolutionTarget;
  evaluation_eligible?: boolean;
  runtime_transport?: 'remote' | 'local_core' | 'local_fallback' | 'legacy_emergency' | 'local';
  rollout_bucket?: string;
  calibration_snapshot?: CalibrationSnapshot;
  sports_grounding?: SportsGrounding;
  sports_semantic_overlay?: SportsSemanticOverlay | null;
  sports_market_overlay?: SportsMarketOverlay | null;
  sports_semantic_ready?: boolean;
  sports_overlay_confidence?: number | null;
  sports_overlay_blocker_reason?: string | null;
  sports_publish_gate_ready?: boolean;
  sports_pick_state?: string | null;
  sports_grounded?: boolean;
  fixture_window_state?: string | null;
  fixture_window_open?: boolean;
  sports_extraction_provenance?: string[] | null;
  sports_confidence_tier?: string | null;
  decision_state?: string | null;
  decision_reason?: string | null;
  reference_source_class?: string | null;
  reference_probability?: number | null;
  edge_delta?: number | null;
  fragility_score?: number | null;
  no_action_reason?: string | null;
  flip_conditions?: string[] | null;
  simulation_confidence?: number | null;
  sports_decision_state?: string | null;
  sports_decision_reason?: string | null;
  sports_no_bet_reason?: string | null;
  sports_model_probabilities?: SportsOutcomeProbabilities | null;
  sports_market_probabilities?: SportsOutcomeProbabilities | null;
  sports_edge_delta?: SportsEdgeDelta | null;
  sports_fair_prices?: SportsOutcomeProbabilities | null;
  sports_fragility_score?: number | null;
  sports_simulation_confidence?: number | null;
  sports_upset_rate?: number | null;
  sports_draw_volatility?: number | null;
  sports_flip_conditions?: string[] | null;
  sports_model_favorite?: string | null;
  coordination_trace?: CoordinationTrace | null;
  sports_market_favorite?: string | null;
  sports_favorite_but_no_bet?: boolean;
  market_consensus_strength?: number | null;
  market_disagreement_score?: number | null;
  price_move_pressure?: number | null;
  narrative_hype_score?: number | null;
  sportsbook_readiness_state?: string | null;
  core_version?: string;
  _source?: string;
  _billing?: {
    action: string;
    cost: number;
    engine: 'standard' | 'extended' | 'oracle';
    plan: 'free' | 'plus' | 'pro';
  };
}

export interface CrystalQuote {
  quote_id: string;
  text: string;
  author: string;
  context: string;
  analysis: {
    title: string;
    full_text: string;
    drivers: string[];
    impact: string;
    historical_parallel: string;
  };
  date: string;
}
