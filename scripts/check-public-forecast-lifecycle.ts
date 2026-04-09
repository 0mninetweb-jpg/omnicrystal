import assert from 'node:assert/strict';

import {
  filterActivePublicForecasts,
  getPublicForecastDeadline,
  isPublicForecastConcluded,
  parseDateOnlyAtEndOfDay,
  type PublicForecastLifecycleRecord,
  resolvePublicForecastPageRecord,
} from '../src/lib/publicForecastLifecycle';

const concludedByResolutionDueAt = {
  id: 'forecast-top-level-resolution-due',
  resolution_due_at: '2026-03-31T08:30:00Z',
};

assert.equal(
  isPublicForecastConcluded(concludedByResolutionDueAt, new Date('2026-03-31T09:00:00Z')),
  true,
  'Top-level resolution_due_at should conclude a public forecast without relying on nested resolution_target fields.'
);

const romeDateOnlyRecord = {
  id: 'forecast-rome-date-only',
  event_date: '2026-03-31',
};

const romeDeadline = getPublicForecastDeadline(romeDateOnlyRecord);
assert(romeDeadline instanceof Date, 'Date-only event_date should resolve to a concrete deadline.');
assert.equal(
  romeDeadline?.toISOString(),
  '2026-03-31T21:59:59.999Z',
  'Date-only deadlines should resolve to Europe/Rome end-of-day rather than raw UTC midnight boundaries.'
);

assert.equal(
  isPublicForecastConcluded(romeDateOnlyRecord, new Date('2026-03-31T21:00:00.000Z')),
  false,
  'A Rome-local date-only deadline should stay active before local end-of-day even when UTC has rolled later.'
);
assert.equal(
  isPublicForecastConcluded(romeDateOnlyRecord, new Date('2026-03-31T22:00:00.000Z')),
  true,
  'A Rome-local date-only deadline should conclude immediately after local end-of-day.'
);

const nestedFallbackRecord = {
  id: 'forecast-nested-fallback',
  resolution_target: {
    event_date: '2026-04-02',
  },
};

assert.equal(
  isPublicForecastConcluded(nestedFallbackRecord, new Date('2026-04-02T12:00:00.000Z')),
  false,
  'Nested resolution_target.event_date should remain part of the fallback deadline chain.'
);

const activeRecords = filterActivePublicForecasts<PublicForecastLifecycleRecord>([
  concludedByResolutionDueAt,
  romeDateOnlyRecord,
  {
    id: 'forecast-active',
    public_slug: 'forecast-active',
    resolution_status: 'open',
    event_date: '2026-04-03',
  },
], new Date('2026-04-01T10:00:00.000Z'));

assert.deepEqual(
  activeRecords.map((record) => record.id),
  ['forecast-active'],
  'Public gallery filtering should exclude resolved and past forecasts while preserving active items.'
);

const concludedDirectRecord = {
  id: 'forecast-concluded-direct',
  public_slug: 'forecast-concluded-direct',
  resolution_status: 'resolved',
};

assert.equal(
  resolvePublicForecastPageRecord(activeRecords, 'forecast-concluded-direct', concludedDirectRecord)?.id,
  'forecast-concluded-direct',
  'Direct forecast pages should still resolve concluded items even when the collection feed filters them out.'
);

const parsedRomeDate = parseDateOnlyAtEndOfDay('2026-04-01');
assert.equal(
  parsedRomeDate?.toISOString(),
  '2026-04-01T21:59:59.999Z',
  'The shared Rome deadline parser should remain stable for date-only values.'
);

console.log('Public forecast lifecycle checks passed.');
