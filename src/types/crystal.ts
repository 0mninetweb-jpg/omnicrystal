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

export interface PublicationBasis {
  coverage_score: number;
  freshness_score: number;
  agreement_score: number;
  conflict_score: number;
  source_count?: number;
  domain_state?: string;
  notes?: string[];
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
  primary_call?: string;
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
