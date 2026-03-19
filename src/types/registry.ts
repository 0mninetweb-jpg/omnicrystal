export interface RegistrySource {
  source_id: string;
  title: string;
  status: string;
  access_profile?: string;
  implementation_status?: string;
}

export interface RegistryDomain {
  domain_id: string;
  block: 'system' | 'A' | 'B' | 'C' | string;
  macro_area_id: string;
  title: string;
  short_label?: string;
  summary?: string;
  allowed_card_types?: string[];
  supported_horizons?: string[];
  target_wave?: string;
  current_state?: 'published' | 'limited' | 'blocked' | string;
  source_registry?: RegistrySource[];
}

export interface CatalogRegistryPayload {
  catalog_version_id: string;
  policy_profile: string;
  generated_at?: string;
  standard_card_types?: Array<{
    card_type_id: string;
    title: string;
    order?: number;
    description?: string;
  }>;
  domains: RegistryDomain[];
  candidate_paid_or_restricted_sources?: RegistrySource[];
}

export interface SourceRegistryPayload {
  catalog_version_id: string;
  policy_profile: string;
  generated_at?: string;
  approved_sources: RegistrySource[];
  candidate_paid_or_restricted_sources?: RegistrySource[];
}

export interface CoverageSnapshot {
  catalog_version_id: string;
  policy_profile: string;
  generated_at?: string;
  totals: {
    coverage_units: number;
    domains: number;
    published_domains: number;
    limited_domains: number;
    blocked_domains: number;
  };
  scores: {
    coverage_score: number;
    depth_score: number;
    freshness_score: number;
  };
  availability: {
    available: number;
    limited: number;
    blocked: number;
  };
}
