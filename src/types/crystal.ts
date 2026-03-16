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
