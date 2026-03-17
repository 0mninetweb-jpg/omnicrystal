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

export interface PredictionMarketFrame {
  outcome: string;
  horizon: string;
  resolution_criteria: string;
  reference_market?: string;
  prior_probability?: number | null;
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
}

export interface CardData {
  card_id: string;
  card_type: string;
  domain: string;
  stakes_level: 'low' | 'medium' | 'high' | 'imminent';
  risk_band?: 'low' | 'medium' | 'high' | 'extreme';
  title: string;
  summary: string;
  verdict?: string;
  personal_output?: string;
  scenario_set?: Scenario[];
  so_what?: Option[];
  drivers?: Driver[];
  ranked_list?: {
    item_id: string;
    label: string;
    score: number;
    rank: number;
    note?: string;
  }[];
  trust_layer: TrustLayer;
  world_sim?: WorldSimDigest;
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
