export const PUBLIC_FORECAST_PRODUCT_TIME_ZONE = 'Europe/Rome';

export type PublicForecastLifecycleRecord = {
  id: string;
  public_slug?: string | null;
  resolution_status?: string | null;
  resolution_due_at?: unknown;
  event_date?: unknown;
  resolution_target?: {
    resolution_due_at?: unknown;
    event_date?: unknown;
  } | null;
  query_plan?: {
    event_date?: unknown;
    temporal_context?: {
      resolved_time_window?: {
        end_date?: unknown;
      } | null;
    } | null;
  } | null;
  temporal_context?: {
    resolved_time_window?: {
      end_date?: unknown;
    } | null;
  } | null;
  resolved_time_window?: {
    end_date?: unknown;
  } | null;
};

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

function parseDateValue(value: unknown) {
  const numeric = toSortNumber(value);
  if (!numeric) return null;
  const parsed = new Date(numeric);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>;

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const actualParts = getTimeZoneParts(new Date(utcGuess), timeZone);
  const actualAsUtc = Date.UTC(
    actualParts.year,
    actualParts.month - 1,
    actualParts.day,
    actualParts.hour,
    actualParts.minute,
    actualParts.second,
    0
  );
  const offsetMs = actualAsUtc - utcGuess;
  return new Date(utcGuess - offsetMs);
}

export function parseDateOnlyAtEndOfDay(
  value: unknown,
  timeZone = PUBLIC_FORECAST_PRODUCT_TIME_ZONE
) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = zonedDateTimeToUtc(year, month, day, 23, 59, 59, timeZone);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() + 999);
}

export function getResolvedWindowEnd(record: PublicForecastLifecycleRecord) {
  return (
    record.resolved_time_window?.end_date ||
    record.temporal_context?.resolved_time_window?.end_date ||
    record.query_plan?.temporal_context?.resolved_time_window?.end_date ||
    null
  );
}

export function getPublicForecastDeadline(record: PublicForecastLifecycleRecord) {
  return (
    parseDateValue(record.resolution_due_at) ||
    parseDateValue(record.resolution_target?.resolution_due_at) ||
    parseDateOnlyAtEndOfDay(record.event_date) ||
    parseDateOnlyAtEndOfDay(record.resolution_target?.event_date) ||
    parseDateOnlyAtEndOfDay(record.query_plan?.event_date) ||
    parseDateOnlyAtEndOfDay(getResolvedWindowEnd(record))
  );
}

export function isPublicForecastConcluded(record: PublicForecastLifecycleRecord, now = new Date()) {
  const status = String(record.resolution_status || '').trim().toLowerCase();
  if (status === 'resolved' || status === 'closed' || status === 'expired' || status === 'canceled' || status === 'cancelled') {
    return true;
  }

  const deadline = getPublicForecastDeadline(record);
  return Boolean(deadline && deadline.getTime() < now.getTime());
}

export function filterActivePublicForecasts<T extends PublicForecastLifecycleRecord>(records: T[], now = new Date()) {
  return records.filter((record) => !isPublicForecastConcluded(record, now));
}

export function findForecastRecordBySlug<T extends Pick<PublicForecastLifecycleRecord, 'id' | 'public_slug'>>(
  records: T[],
  slug: string
) {
  return records.find((record) => (record.public_slug || record.id) === slug) || null;
}

export function resolvePublicForecastPageRecord<T extends Pick<PublicForecastLifecycleRecord, 'id' | 'public_slug'>>(
  records: T[],
  slug: string,
  directRecord: T | null
) {
  return directRecord || findForecastRecordBySlug(records, slug);
}
