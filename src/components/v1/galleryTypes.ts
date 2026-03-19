import type { CardData } from '../../types/crystal';

export interface GalleryCardRecord extends CardData {
  id: string;
  lineage_id?: string;
  query_text?: string;
  entity_label?: string;
  geography_label?: string;
  horizon_label?: string;
  domain_label?: string;
  card_state_ui?: 'published' | 'limited' | 'coverage_gap';
  trust_confidence?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  savedAt?: unknown;
}

export interface GalleryVersionRecord extends GalleryCardRecord {
  parent_lineage_id?: string;
  version_saved_at?: unknown;
}
