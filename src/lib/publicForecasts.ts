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
  resolution_status?: string;
}

export type PublicForecastLoadSource = 'live' | 'cache';

export type PublicForecastCollectionResult = {
  records: PublicForecastRecord[];
  source: PublicForecastLoadSource;
  warning: string | null;
};

export type PublicForecastPageDataResult = {
  record: PublicForecastRecord | null;
  related: PublicForecastRecord[];
  source: PublicForecastLoadSource;
  warning: string | null;
};

const PUBLIC_FORECAST_CACHE_KEY = 'crystal-public-forecasts-cache-v1';
const PUBLIC_FORECAST_TIMEOUT_MS = 12000;

function mapSnapshotToPublicForecast(snapshot: { id: string; data: () => Record<string, unknown> }): PublicForecastRecord {
  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<PublicForecastRecord, 'id'>),
  };
}

function createPublicForecastTimeoutError(message: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = 'public-forecast-timeout';
  return error;
}

function buildCacheWarning() {
  return 'Showing cached public forecasts while the live proof layer catches up.';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(createPublicForecastTimeoutError(message)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function readCachedPublicForecasts() {
  if (typeof window === 'undefined') return [] as PublicForecastRecord[];
  try {
    const raw = window.localStorage.getItem(PUBLIC_FORECAST_CACHE_KEY);
    if (!raw) return [] as PublicForecastRecord[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PublicForecastRecord[]) : [];
  } catch (_error) {
    return [] as PublicForecastRecord[];
  }
}

function writeCachedPublicForecasts(records: PublicForecastRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PUBLIC_FORECAST_CACHE_KEY, JSON.stringify(records));
  } catch (_error) {
    // Ignore cache persistence issues and keep the live path primary.
  }
}

function findForecastRecordBySlug(records: PublicForecastRecord[], slug: string) {
  return records.find((record) => (record.public_slug || record.id) === slug) || null;
}

function parseDateValue(value: unknown) {
  const numeric = toSortNumber(value);
  if (!numeric) return null;
  const parsed = new Date(numeric);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateOnlyAtEndOfDay(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T23:59:59.999Z`)
    : new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getResolvedWindowEnd(record: PublicForecastRecord) {
  return (
    record.resolved_time_window?.end_date ||
    record.temporal_context?.resolved_time_window?.end_date ||
    record.query_plan?.temporal_context?.resolved_time_window?.end_date ||
    null
  );
}

function getPublicForecastDeadline(record: PublicForecastRecord) {
  return (
    parseDateValue(record.resolution_target?.resolution_due_at) ||
    parseDateOnlyAtEndOfDay(record.resolution_target?.event_date) ||
    parseDateOnlyAtEndOfDay(record.query_plan?.event_date) ||
    parseDateOnlyAtEndOfDay(getResolvedWindowEnd(record))
  );
}

export function isPublicForecastConcluded(record: PublicForecastRecord, now = new Date()) {
  const status = String(record.resolution_status || '').trim().toLowerCase();
  if (status === 'resolved' || status === 'closed' || status === 'expired' || status === 'canceled' || status === 'cancelled') {
    return true;
  }

  const deadline = getPublicForecastDeadline(record);
  return Boolean(deadline && deadline.getTime() < now.getTime());
}

export function filterActivePublicForecasts(records: PublicForecastRecord[], now = new Date()) {
  return records.filter((record) => !isPublicForecastConcluded(record, now));
}

export async function fetchPublicForecasts() {
  const snapshot = await getDocs(collection(db, 'public_forecasts'));
  return filterActivePublicForecasts(snapshot.docs.map(mapSnapshotToPublicForecast));
}

export async function fetchPublicForecastBySlug(slug: string, timeoutMs = PUBLIC_FORECAST_TIMEOUT_MS) {
  const snapshot = await withTimeout(
    getDoc(doc(db, 'public_forecasts', slug)),
    timeoutMs,
    'Crystal timed out while loading the public forecast page.'
  );
  if (!snapshot.exists()) return null;
  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<PublicForecastRecord, 'id'>),
  };
}

export async function fetchPublicForecastCollection(timeoutMs = PUBLIC_FORECAST_TIMEOUT_MS): Promise<PublicForecastCollectionResult> {
  const cachedRecords = filterActivePublicForecasts(readCachedPublicForecasts());

  try {
    const snapshot = await withTimeout(
      getDocs(collection(db, 'public_forecasts')),
      timeoutMs,
      'Crystal timed out while loading the public forecast gallery.'
    );
    const records = filterActivePublicForecasts(snapshot.docs.map(mapSnapshotToPublicForecast));
    writeCachedPublicForecasts(records);
    return {
      records,
      source: 'live',
      warning: null,
    };
  } catch (error) {
    if (cachedRecords.length > 0) {
      return {
        records: cachedRecords,
        source: 'cache',
        warning: buildCacheWarning(),
      };
    }
    throw error;
  }
}

export async function fetchPublicForecastPageData(
  slug: string,
  timeoutMs = PUBLIC_FORECAST_TIMEOUT_MS
): Promise<PublicForecastPageDataResult> {
  const collectionResult = await fetchPublicForecastCollection(timeoutMs);
  let record = findForecastRecordBySlug(collectionResult.records, slug);
  let warning = collectionResult.warning;
  let source = collectionResult.source;

  try {
    const directRecord = await fetchPublicForecastBySlug(slug, timeoutMs);
    if (directRecord) {
      record = directRecord;
      if (collectionResult.source === 'live') {
        source = 'live';
      }
    }
  } catch (_error) {
    if (!record && collectionResult.records.length === 0) {
      throw _error;
    }
    warning = warning || buildCacheWarning();
  }

  const related = record
    ? [...collectionResult.records]
        .filter(
          (candidate) =>
            candidate.id !== record.id &&
            (candidate.entity_slug === record.entity_slug || candidate.topic_slug === record.topic_slug)
        )
        .sort(
          (left, right) => toSortNumber(right.published_at || right.updatedAt) - toSortNumber(left.published_at || left.updatedAt)
        )
        .slice(0, 3)
    : [];

  return {
    record,
    related,
    source,
    warning,
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

export function formatPublicForecastRunDate(record: PublicForecastRecord) {
  const runValue =
    (typeof record.run_as_of_utc === 'string' && record.run_as_of_utc) ||
    (typeof record.temporal_context?.as_of_utc === 'string' && record.temporal_context.as_of_utc) ||
    (typeof record.query_plan?.temporal_context?.as_of_utc === 'string' && record.query_plan.temporal_context.as_of_utc) ||
    '';
  if (!runValue) return '';
  const parsed = new Date(runValue);
  if (Number.isNaN(parsed.getTime())) return '';
  return `Forecast run ${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function formatRelativeTimeInterpretation(record: PublicForecastRecord) {
  const phrase =
    (typeof record.relative_time_phrase === 'string' && record.relative_time_phrase) ||
    (typeof record.temporal_context?.relative_phrase === 'string' && record.temporal_context.relative_phrase) ||
    (typeof record.query_plan?.temporal_context?.relative_phrase === 'string' && record.query_plan.temporal_context.relative_phrase) ||
    '';
  const resolvedLabel =
    (typeof record.resolved_time_window?.label === 'string' && record.resolved_time_window.label) ||
    (typeof record.temporal_context?.resolved_time_window?.label === 'string' && record.temporal_context.resolved_time_window.label) ||
    (typeof record.query_plan?.temporal_context?.resolved_time_window?.label === 'string' &&
      record.query_plan.temporal_context.resolved_time_window.label) ||
    '';
  if (!phrase || !resolvedLabel) return '';
  return `Interpreted "${phrase}" as ${resolvedLabel}`;
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
