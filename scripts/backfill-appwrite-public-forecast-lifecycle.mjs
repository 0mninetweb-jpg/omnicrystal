import { Client, Query, TablesDB } from 'node-appwrite';

import {
  DEFAULT_APPWRITE_ENDPOINT,
  DEFAULT_APPWRITE_PROJECT_ID,
  resolveProjectKey,
} from './lib/appwrite-admin.mjs';
import {
  buildRowData,
  decodeRow,
  resolveDocumentTarget,
} from '../appwrite-functions/api/data-model.mjs';

const argv = process.argv.slice(2);

function readFlag(name) {
  return argv.includes(`--${name}`);
}

function readOption(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeEndpoint(endpoint) {
  return safeText(endpoint, DEFAULT_APPWRITE_ENDPOINT).replace(/\/$/, '');
}

function normalizeProjectId(projectId) {
  const normalized = safeText(projectId, DEFAULT_APPWRITE_PROJECT_ID);
  return normalized === 'omnicrystal' ? DEFAULT_APPWRITE_PROJECT_ID : normalized;
}

function createTablesClient({ endpoint, projectId, key }) {
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(key);
  return new TablesDB(client);
}

async function listAllRows(tables, databaseId, tableId) {
  let offset = 0;
  const limit = 5000;
  const rows = [];
  while (true) {
    const response = await tables.listRows({
      databaseId,
      tableId,
      queries: [Query.limit(limit), Query.offset(offset)],
    });
    rows.push(...response.rows);
    if (response.rows.length < limit) break;
    offset += limit;
  }
  return rows;
}

function parseDateOnlyAtEndOfDay(value) {
  const normalized = safeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  return `${normalized}T23:59:59.999Z`;
}

function normalizeDeadline(value) {
  const normalized = safeText(value);
  if (!normalized) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return parseDateOnlyAtEndOfDay(normalized);
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString();
}

function buildCanonicalLifecycle(payload = {}) {
  const temporalContext =
    payload?.temporal_context && typeof payload.temporal_context === 'object'
      ? payload.temporal_context
      : payload?.query_plan?.temporal_context && typeof payload.query_plan.temporal_context === 'object'
        ? payload.query_plan.temporal_context
        : {};
  const resolvedTimeWindow =
    payload?.resolved_time_window ||
    temporalContext?.resolved_time_window ||
    payload?.query_plan?.temporal_context?.resolved_time_window ||
    null;
  const eventDate = safeText(
    payload?.event_date,
    safeText(
      payload?.resolution_target?.event_date,
      safeText(payload?.query_plan?.event_date, safeText(resolvedTimeWindow?.end_date))
    )
  );
  const resolutionDueAt = normalizeDeadline(
    safeText(
      payload?.resolution_due_at,
      safeText(
        payload?.resolution_target?.resolution_due_at,
        safeText(payload?.query_plan?.resolution_due_at, eventDate)
      )
    )
  );

  return {
    temporal_context: Object.keys(temporalContext || {}).length > 0 ? temporalContext : null,
    resolved_time_window: resolvedTimeWindow || null,
    event_date: eventDate || null,
    resolution_due_at: resolutionDueAt || null,
    resolution_status: safeText(payload?.resolution_status, payload?.evaluation_eligible ? 'pending' : 'skipped'),
    published_at: safeText(payload?.published_at, safeText(payload?.created_at, safeText(payload?.updated_at, new Date().toISOString()))),
    updated_at: new Date().toISOString(),
  };
}

function lifecycleNeedsUpdate(payload = {}, canonical = {}) {
  return (
    JSON.stringify(payload?.temporal_context || null) !== JSON.stringify(canonical.temporal_context) ||
    JSON.stringify(payload?.resolved_time_window || null) !== JSON.stringify(canonical.resolved_time_window) ||
    safeText(payload?.event_date) !== safeText(canonical.event_date) ||
    safeText(payload?.resolution_due_at) !== safeText(canonical.resolution_due_at) ||
    safeText(payload?.resolution_status) !== safeText(canonical.resolution_status) ||
    safeText(payload?.published_at) !== safeText(canonical.published_at)
  );
}

function resolveRowTarget(row, tableId) {
  const pathKey = safeText(row?.path_key);
  if (pathKey) {
    return resolveDocumentTarget(pathKey.split('/').filter(Boolean));
  }
  if (tableId === 'public_forecasts') return resolveDocumentTarget(['public_forecasts', safeText(row?.source_id)]);
  if (tableId === 'forecast_ledger') return resolveDocumentTarget(['forecast_ledger', safeText(row?.source_id)]);
  if (tableId === 'forecast_ledger_versions') {
    return resolveDocumentTarget(['forecast_ledger', safeText(row?.parent_id), 'versions', safeText(row?.source_id)]);
  }
  return null;
}

async function main() {
  const apply = readFlag('apply');
  const endpoint = normalizeEndpoint(readOption('endpoint', process.env.APPWRITE_ENDPOINT || DEFAULT_APPWRITE_ENDPOINT));
  const projectId = normalizeProjectId(readOption('project', process.env.APPWRITE_PROJECT_ID || DEFAULT_APPWRITE_PROJECT_ID));
  const databaseId = safeText(readOption('database', process.env.APPWRITE_DATABASE_ID || 'crystal'), 'crystal');
  const key = await resolveProjectKey({ endpoint });
  const tables = createTablesClient({ endpoint, projectId, key });
  const tableIds = ['public_forecasts', 'forecast_ledger', 'forecast_ledger_versions'];
  const summary = [];

  for (const tableId of tableIds) {
    const rows = await listAllRows(tables, databaseId, tableId);
    let updated = 0;
    let unchanged = 0;

    for (const row of rows) {
      const payload = decodeRow(row) || {};
      const canonical = buildCanonicalLifecycle(payload);
      if (!lifecycleNeedsUpdate(payload, canonical)) {
        unchanged += 1;
        continue;
      }

      if (apply) {
        const target = resolveRowTarget(row, tableId);
        if (!target) {
          throw new Error(`Unable to resolve target for ${tableId}/${safeText(row?.source_id)}`);
        }
        await tables.upsertRow({
          databaseId,
          tableId,
          rowId: row.$id,
          data: buildRowData(target, {
            ...payload,
            ...canonical,
          }),
        });
      }
      updated += 1;
    }

    summary.push({
      table_id: tableId,
      rows_scanned: rows.length,
      rows_updated: updated,
      rows_unchanged: unchanged,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: apply ? 'apply' : 'dry-run',
        endpoint,
        project_id: projectId,
        database_id: databaseId,
        summary,
      },
      null,
      2
    )
  );
}

await main();
