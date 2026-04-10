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

const DEFAULT_PROJECT_ID = 'crystal';
const DOCUMENT_PATH = 'system_config/runtime_rollout';
const DEFAULT_DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'crystal';

const STAGE_PRESETS = {
  baseline: { signed_in_percent: 0, guest_percent: 0, enabled: true, transport: 'remote', kill_switch: false },
  'canary-10-0': { signed_in_percent: 10, guest_percent: 0, enabled: true, transport: 'remote', kill_switch: false },
  'canary-10-10': { signed_in_percent: 10, guest_percent: 10, enabled: true, transport: 'remote', kill_switch: false },
  'rollout-25-25': { signed_in_percent: 25, guest_percent: 25, enabled: true, transport: 'remote', kill_switch: false },
  'rollout-50-50': { signed_in_percent: 50, guest_percent: 50, enabled: true, transport: 'remote', kill_switch: false },
  'rollout-100-100': { signed_in_percent: 100, guest_percent: 100, enabled: true, transport: 'remote', kill_switch: false },
  'hard-rollback': { signed_in_percent: 0, guest_percent: 0, enabled: true, transport: 'remote', kill_switch: true },
};

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = safeText(String(value || '')).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function clampPercent(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(100, Math.round(next)));
}

function parseArgs(argv = []) {
  const options = {
    action: 'get',
    projectId: DEFAULT_PROJECT_ID,
    endpoint: safeText(process.env.APPWRITE_ENDPOINT, DEFAULT_APPWRITE_ENDPOINT),
    databaseId: safeText(process.env.APPWRITE_DATABASE_ID, DEFAULT_DATABASE_ID),
    stage: '',
    signedInPercent: null,
    guestPercent: null,
    enabled: null,
    transport: '',
    killSwitch: null,
    salt: '',
    windowHours: 24,
    limit: 500,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = argv[index + 1];
    if (item === '--action' && next) {
      options.action = next.trim();
      index += 1;
      continue;
    }
    if (item === '--projectId' && next) {
      options.projectId = next.trim();
      index += 1;
      continue;
    }
    if (item === '--endpoint' && next) {
      options.endpoint = next.trim();
      index += 1;
      continue;
    }
    if (item === '--databaseId' && next) {
      options.databaseId = next.trim();
      index += 1;
      continue;
    }
    if (item === '--stage' && next) {
      options.stage = next.trim();
      index += 1;
      continue;
    }
    if (item === '--signed-in-percent' && next) {
      options.signedInPercent = clampPercent(next, 0);
      index += 1;
      continue;
    }
    if (item === '--guest-percent' && next) {
      options.guestPercent = clampPercent(next, 0);
      index += 1;
      continue;
    }
    if (item === '--enabled' && next) {
      options.enabled = parseBoolean(next, null);
      index += 1;
      continue;
    }
    if (item === '--transport' && next) {
      options.transport = next.trim().toLowerCase() === 'local' ? 'local' : 'remote';
      index += 1;
      continue;
    }
    if (item === '--kill-switch' && next) {
      options.killSwitch = parseBoolean(next, null);
      index += 1;
      continue;
    }
    if (item === '--salt' && next) {
      options.salt = next;
      index += 1;
      continue;
    }
    if (item === '--window-hours' && next) {
      options.windowHours = Math.max(1, Number(next) || 24);
      index += 1;
      continue;
    }
    if (item === '--limit' && next) {
      options.limit = Math.max(1, Number(next) || 500);
      index += 1;
    }
  }

  return options;
}

function normalizeProjectId(projectId = '') {
  const normalized = safeText(projectId, DEFAULT_APPWRITE_PROJECT_ID);
  if (normalized === 'omnicrystal') return DEFAULT_APPWRITE_PROJECT_ID;
  return normalized;
}

function normalizeCurrentCrystalCore(current = {}) {
  return {
    enabled: parseBoolean(current.enabled, true),
    transport: safeText(current.transport, 'remote') === 'local' ? 'local' : 'remote',
    signed_in_percent: clampPercent(current.signed_in_percent, 0),
    guest_percent: clampPercent(current.guest_percent, 0),
    salt: safeText(current.salt, 'crystal-core-default-salt'),
    kill_switch: parseBoolean(current.kill_switch, false),
    updated_at: safeText(current.updated_at) || null,
  };
}

function inferRolloutStage(config = {}) {
  const normalized = normalizeCurrentCrystalCore(config);
  const match = Object.entries(STAGE_PRESETS).find(
    ([, preset]) =>
      preset.signed_in_percent === normalized.signed_in_percent &&
      preset.guest_percent === normalized.guest_percent &&
      preset.kill_switch === normalized.kill_switch
  );
  return match?.[0] || 'custom';
}

function buildStagePayload(current = {}, options = {}) {
  const normalizedCurrent = normalizeCurrentCrystalCore(current);
  const preset = STAGE_PRESETS[options.stage] || {};
  return {
    enabled: options.enabled ?? preset.enabled ?? normalizedCurrent.enabled,
    transport: safeText(options.transport, preset.transport || normalizedCurrent.transport) === 'local' ? 'local' : 'remote',
    signed_in_percent: options.signedInPercent ?? preset.signed_in_percent ?? normalizedCurrent.signed_in_percent,
    guest_percent: options.guestPercent ?? preset.guest_percent ?? normalizedCurrent.guest_percent,
    salt: safeText(options.salt, normalizedCurrent.salt),
    kill_switch: options.killSwitch ?? preset.kill_switch ?? normalizedCurrent.kill_switch,
    updated_at: new Date().toISOString(),
  };
}

function createTablesClient({ endpoint, projectId, key }) {
  const client = new Client().setEndpoint(endpoint.replace(/\/$/, '')).setProject(projectId).setKey(key);
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

async function readRuntimeRolloutDocument({ tables, databaseId }) {
  const target = resolveDocumentTarget(['system_config', 'runtime_rollout']);
  if (!target) {
    throw new Error(`Unable to resolve Appwrite target for ${DOCUMENT_PATH}.`);
  }

  try {
    const row = await tables.getRow({
      databaseId,
      tableId: target.tableId,
      rowId: target.rowId,
    });
    const data = decodeRow(row) || {};
    return {
      exists: true,
      row,
      rowId: row.$id,
      pathKey: target.pathKey,
      data,
      crystalCore: normalizeCurrentCrystalCore(data?.crystal_core || {}),
    };
  } catch (_error) {
    const rows = await listAllRows(tables, databaseId, target.tableId);
    const match = rows.find((row) => row.path_key === target.pathKey || row.source_id === target.sourceId);
    if (!match) {
      return {
        exists: false,
        row: null,
        rowId: target.rowId,
        pathKey: target.pathKey,
        data: {},
        crystalCore: normalizeCurrentCrystalCore({}),
      };
    }
    const data = decodeRow(match) || {};
    return {
      exists: true,
      row: match,
      rowId: match.$id,
      pathKey: target.pathKey,
      data,
      crystalCore: normalizeCurrentCrystalCore(data?.crystal_core || {}),
    };
  }
}

async function writeRuntimeRolloutDocument({ tables, databaseId, existing, crystalCorePayload }) {
  const target = resolveDocumentTarget(['system_config', 'runtime_rollout']);
  if (!target) {
    throw new Error(`Unable to resolve Appwrite target for ${DOCUMENT_PATH}.`);
  }

  const nextDocument = {
    ...(existing?.data || {}),
    crystal_core: normalizeCurrentCrystalCore(crystalCorePayload),
    updated_at: new Date().toISOString(),
  };

  await tables.upsertRow({
    databaseId,
    tableId: target.tableId,
    rowId: existing?.rowId || target.rowId,
    data: buildRowData(target, nextDocument),
  });

  return readRuntimeRolloutDocument({ tables, databaseId });
}

function toTimestampMs(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function getRunReferenceMs(run = {}) {
  return (
    toTimestampMs(run.completed_at) ||
    toTimestampMs(run.updated_at) ||
    toTimestampMs(run.started_at) ||
    toTimestampMs(run.created_at)
  );
}

function getTransportBucket(runtimeTransport = '') {
  const normalized = safeText(runtimeTransport).toLowerCase();
  if (normalized.startsWith('remote') || normalized.startsWith('appwrite_')) return 'remote';
  if (normalized.startsWith('legacy')) return 'legacy';
  if (normalized.startsWith('local_fallback') || normalized.startsWith('local_core')) return 'local_core';
  return 'other';
}

function isPendingStatus(run = {}) {
  const normalized = safeText(run?.status).toLowerCase();
  return !['completed', 'failed', 'canceled', 'cancelled'].includes(normalized);
}

async function countRuns({ tables, databaseId, windowHours, limit }) {
  const thresholdMs = Date.now() - Math.max(1, Number(windowHours) || 24) * 60 * 60 * 1000;
  const rows = await listAllRows(tables, databaseId, 'forecast_runs');
  const recentRuns = rows
    .map((row) => decodeRow(row) || {})
    .map((run) => ({
      ...run,
      __referenceMs: getRunReferenceMs(run),
    }))
    .filter((run) => Number.isFinite(run.__referenceMs) && run.__referenceMs >= thresholdMs)
    .sort((left, right) => right.__referenceMs - left.__referenceMs)
    .slice(0, Math.max(1, Number(limit) || 500));

  const metrics = {
    window_start: new Date(thresholdMs).toISOString(),
    total_docs_scanned: recentRuns.length,
    remote_completed_total: 0,
    remote_completed_signed_in: 0,
    remote_completed_guest: 0,
    remote_pending_total: 0,
    remote_fallback_total: 0,
    by_route_origin: {},
  };

  for (const run of recentRuns) {
    const bucket = getTransportBucket(run.runtime_transport);
    const routeOrigin = safeText(run.route_origin, safeText(run.source_view, 'unknown'));
    metrics.by_route_origin[routeOrigin] = (metrics.by_route_origin[routeOrigin] || 0) + 1;

    if (bucket === 'remote') {
      if (safeText(run.status) === 'completed') {
        metrics.remote_completed_total += 1;
        if (safeText(run.uid)) {
          metrics.remote_completed_signed_in += 1;
        } else {
          metrics.remote_completed_guest += 1;
        }
      }
      if (isPendingStatus(run)) {
        metrics.remote_pending_total += 1;
      }
    }

    if (safeText(run.runtime_transport).toLowerCase().includes('fallback')) {
      metrics.remote_fallback_total += 1;
    }
  }

  return {
    metrics,
    recent_run_ids: recentRuns.slice(0, 20).map((run) => safeText(run.run_id)).filter(Boolean),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const endpoint = safeText(options.endpoint, DEFAULT_APPWRITE_ENDPOINT).replace(/\/$/, '');
  const projectId = normalizeProjectId(options.projectId);
  const databaseId = safeText(options.databaseId, DEFAULT_DATABASE_ID);
  const key = await resolveProjectKey({ endpoint });
  const tables = createTablesClient({ endpoint, projectId, key });

  if (options.action === 'count-runs') {
    const payload = await countRuns({
      tables,
      databaseId,
      windowHours: options.windowHours,
      limit: options.limit,
    });
    console.log(
      JSON.stringify(
        {
          source: 'appwrite',
          endpoint,
          project_id: projectId,
          database_id: databaseId,
          ...payload,
        },
        null,
        2
      )
    );
    return;
  }

  const current = await readRuntimeRolloutDocument({ tables, databaseId });

  if (options.action === 'get') {
    console.log(
      JSON.stringify(
        {
          source: 'appwrite',
          endpoint,
          project_id: projectId,
          database_id: databaseId,
          document_path: DOCUMENT_PATH,
          exists: current.exists,
          crystal_core: {
            ...current.crystalCore,
            stage: inferRolloutStage(current.crystalCore),
          },
        },
        null,
        2
      )
    );
    return;
  }

  if (options.action !== 'set' && options.action !== 'set-stage') {
    throw new Error(`Unsupported action: ${options.action}`);
  }

  const nextCrystalCore =
    options.action === 'set-stage'
      ? buildStagePayload(current.crystalCore, { stage: options.stage })
      : buildStagePayload(current.crystalCore, options);

  const updated = await writeRuntimeRolloutDocument({
    tables,
    databaseId,
    existing: current,
    crystalCorePayload: nextCrystalCore,
  });

  console.log(
    JSON.stringify(
      {
        source: 'appwrite',
        endpoint,
        project_id: projectId,
        database_id: databaseId,
        document_path: DOCUMENT_PATH,
        exists: updated.exists,
        crystal_core: {
          ...updated.crystalCore,
          stage: inferRolloutStage(updated.crystalCore),
        },
      },
      null,
      2
    )
  );
}

await main();
