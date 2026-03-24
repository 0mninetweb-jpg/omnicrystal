import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { CardData } from '../types/crystal';
import type { ForecastGeography, ForecastHorizon, ForecastResolvedContext, ForecastUiFilters } from '../types/forecastV1';

export interface PublicForecastRecord extends CardData {
  id: string;
  lineage_id?: string;
  ledger_ref?: string | null;
  public_forecast_ref?: string | null;
  public_slug?: string | null;
  query_origin?: string;
  query_text?: string;
  query_plan?: any;
  entity_label?: string;
  entity_slug?: string;
  geography_label?: string;
  geography_slug?: string;
  horizon_id?: string;
  horizon_label?: string;
  domain_label?: string;
  topic_label?: string;
  topic_slug?: string;
  card_state_ui?: 'published' | 'limited' | 'coverage_gap';
  trust_confidence?: number;
  published_at?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function mapSnapshotToPublicForecast(snapshot: { id: string; data: () => Record<string, unknown> }): PublicForecastRecord {
  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<PublicForecastRecord, 'id'>),
  };
}

export async function fetchPublicForecasts() {
  const snapshot = await getDocs(collection(db, 'public_forecasts'));
  return snapshot.docs.map(mapSnapshotToPublicForecast);
}

export async function fetchPublicForecastBySlug(slug: string) {
  const snapshot = await getDoc(doc(db, 'public_forecasts', slug));
  if (!snapshot.exists()) return null;
  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<PublicForecastRecord, 'id'>),
  };
}

export function toSortNumber(value: unknown) {
  if (!value) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object' && value !== null) {
    if ('seconds' in value && typeof (value as { seconds?: unknown }).seconds === 'number') {
      return Number((value as { seconds: number }).seconds) * 1000;
    }
    if ('toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().getTime();
    }
  }
  return 0;
}

export function getPublicForecastState(record: PublicForecastRecord) {
  if (record.card_state_ui === 'coverage_gap' || record.card_state === 'blocked') return 'coverage_gap' as const;
  if (record.card_state_ui === 'limited' || record.card_state === 'limited') return 'limited' as const;
  return 'published' as const;
}

function resolveFilterGeography(record: PublicForecastRecord): ForecastGeography {
  const geography = String(record.geography_slug || '').trim().toLowerCase();
  if (geography === 'global') return 'global';
  if (geography === 'italy') return 'italy';
  if (geography === 'rome') return 'rome';
  if (geography === 'milan') return 'milan';
  return 'auto';
}

function resolveFilterHorizon(record: PublicForecastRecord): ForecastHorizon {
  const horizon = String(record.horizon_id || '').trim().toLowerCase();
  if (horizon === 'now' || horizon === '7d' || horizon === '30d' || horizon === '90d' || horizon === '6m' || horizon === '12m') {
    return horizon;
  }
  return '30d';
}

export function resolvePublicForecastContext(record: PublicForecastRecord): ForecastResolvedContext {
  const filters: ForecastUiFilters = {
    entity: record.entity_label || '',
    geography: resolveFilterGeography(record),
    horizon: resolveFilterHorizon(record),
    confidence: 'balanced',
  };

  return {
    query: record.query_text || record.query_origin || record.title,
    domainId: record.domain,
    entity: record.entity_label || 'General',
    geography: record.geography_label || 'Auto',
    horizon: record.horizon_label || '30 days',
    entityType:
      Array.isArray(record.query_plan?.entities) && record.query_plan.entities[0]
        ? record.query_plan.entities[0]?.entity_type
        : undefined,
    versionId: record.version_id,
    queryPlan: record.query_plan,
    filters,
  };
}

export function formatPublicForecastDate(value: unknown) {
  const numeric = toSortNumber(value);
  if (!numeric) return 'Updated recently';
  return new Date(numeric).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function rankTrendingForecasts(records: PublicForecastRecord[]) {
  return [...records].sort((left, right) => {
    const leftScore =
      (left.trust_confidence || left.trust_layer?.confidence_score || 0) * 0.7 +
      toSortNumber(left.published_at || left.updatedAt) / 1e14;
    const rightScore =
      (right.trust_confidence || right.trust_layer?.confidence_score || 0) * 0.7 +
      toSortNumber(right.published_at || right.updatedAt) / 1e14;
    return rightScore - leftScore;
  });
}
