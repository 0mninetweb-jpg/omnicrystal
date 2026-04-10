import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { Client, Functions, Query, TablesDB } from 'node-appwrite';
import { buildRowData, decodeRow, listBootstrapTables, resolveDocumentTarget } from '../data-model.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function resolveFirstExistingPath(candidates, label) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Unable to resolve ${label}. Tried: ${candidates.join(', ')}`);
}

const functionsRoot = resolveFirstExistingPath(
  [
    path.resolve(currentDir, '../functions'),
    path.resolve(currentDir, '../../functions'),
  ],
  'Crystal functions runtime'
);

const require = createRequire(path.join(functionsRoot, 'package.json'));

const { GoogleGenAI } = require('@google/genai');
const { createCrystalCoreRuntime } = require(path.join(functionsRoot, 'crystalCore', 'runtime'));
const {
  createManualWorldSimJob,
  createMatrixSimulationJob,
  getWorldSimJobDetail,
  getWorldSimJobResult,
  getMatrixSimulationJobDetail,
  getMatrixSimulationJobResult,
  cancelWorldSimJob,
  cancelMatrixSimulationJob,
  getWorldSimRuntimeHealth,
} = require(path.join(functionsRoot, 'worldSimJobs'));

export const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1').replace(/\/$/, '');
export const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || 'crystal';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';
export const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'crystal';

const SERVER_TIMESTAMP = Symbol.for('crystal.appwrite.serverTimestamp');
const DELETE_FIELD = Symbol.for('crystal.appwrite.deleteField');

let tablesSingleton = null;
let functionsSingleton = null;
let dbSingleton = null;
let runtimeSingleton = null;
let geminiSingleton = null;
const APPWRITE_JOBS_FUNCTION_ID = process.env.APPWRITE_JOBS_FUNCTION_ID || 'jobs';

export function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function serializeApiValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((item) => serializeApiValue(item)).filter((item) => item !== undefined);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : value;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const ctorName = value.constructor?.name;
  if (ctorName && ctorName !== 'Object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nestedValue]) => [key, serializeApiValue(nestedValue)])
      .filter(([, nestedValue]) => nestedValue !== undefined)
  );
}

function createTables() {
  if (!tablesSingleton) {
    const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY);
    tablesSingleton = new TablesDB(client);
  }
  return tablesSingleton;
}

function createFunctionsClient() {
  if (!functionsSingleton) {
    const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY);
    functionsSingleton = new Functions(client);
  }
  return functionsSingleton;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createForecastJobExecution(body) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await createFunctionsClient().createExecution({
        functionId: APPWRITE_JOBS_FUNCTION_ID,
        async: true,
        body: JSON.stringify(body),
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(350 * attempt);
      }
    }
  }
  throw lastError || new Error('Unable to enqueue forecast job.');
}

class TimestampCompat {
  constructor(value = Date.now()) {
    const date = value instanceof Date ? value : new Date(value);
    this.iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  toDate() {
    return new Date(this.iso);
  }

  toMillis() {
    return this.toDate().getTime();
  }

  toJSON() {
    return this.iso;
  }

  static fromDate(value) {
    return new TimestampCompat(value);
  }

  static fromMillis(value) {
    return new TimestampCompat(value);
  }
}

function getAdminCompat() {
  return {
    firestore: {
      FieldValue: {
        serverTimestamp() {
          return SERVER_TIMESTAMP;
        },
        delete() {
          return DELETE_FIELD;
        },
      },
      Timestamp: TimestampCompat,
    },
  };
}

function isTimestampLike(value) {
  return value instanceof Date || typeof value?.toDate === 'function';
}

function materializeWriteValue(value, nowIso) {
  if (value === SERVER_TIMESTAMP) return nowIso;
  if (value === DELETE_FIELD) return DELETE_FIELD;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => materializeWriteValue(item, nowIso)).filter((item) => item !== DELETE_FIELD);
  }
  if (isTimestampLike(value)) {
    const date = value instanceof Date ? value : value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : value;
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, nestedValue]) => [key, materializeWriteValue(nestedValue, nowIso)])
        .filter(([, nestedValue]) => nestedValue !== DELETE_FIELD)
    );
  }
  return value;
}

function deepMerge(baseValue, patchValue) {
  if (patchValue === DELETE_FIELD) return DELETE_FIELD;
  if (patchValue === null || patchValue === undefined || Array.isArray(patchValue) || typeof patchValue !== 'object' || isTimestampLike(patchValue)) {
    return patchValue;
  }
  const base = baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue) ? { ...baseValue } : {};
  for (const [key, nestedValue] of Object.entries(patchValue)) {
    const merged = deepMerge(base[key], nestedValue);
    if (merged === DELETE_FIELD) {
      delete base[key];
    } else {
      base[key] = merged;
    }
  }
  return base;
}

function getComparableValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed) && /^\d{4}-\d{2}-\d{2}T/.test(value)) return parsed;
  }
  return value;
}

function compareValues(left, right) {
  const normalizedLeft = getComparableValue(left);
  const normalizedRight = getComparableValue(right);
  if (normalizedLeft === normalizedRight) return 0;
  if (normalizedLeft === null || normalizedLeft === undefined) return -1;
  if (normalizedRight === null || normalizedRight === undefined) return 1;
  return normalizedLeft < normalizedRight ? -1 : 1;
}

function getNestedField(source, field) {
  if (!field || !source || typeof source !== 'object') return undefined;
  return field.split('.').reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), source);
}

function getRowFieldValue(row, payload, field) {
  const sortFields = new Set(['createdAt', 'created_at', 'savedAt', 'updatedAt', 'updated_at', 'generated_at', 'timestamp', 'version_saved_at', 'completedAt', 'completed_at', 'resolved_at', 'lastUpdatedAt']);
  if (sortFields.has(field)) return row.sort_at || getNestedField(payload, field);
  if (field === 'ttl') return row.ttl_at || getNestedField(payload, 'ttl');
  if (field === 'query') return row.query_text || getNestedField(payload, 'query');
  return getNestedField(payload, field);
}

function applyConstraints(entries, constraints = []) {
  let items = [...entries];
  for (const constraint of constraints) {
    if (constraint?.kind === 'where') {
      items = items.filter(({ row, payload }) => {
        const left = getRowFieldValue(row, payload, constraint.field);
        const comparison = compareValues(left, constraint.value);
        switch (constraint.op) {
          case '==':
            return comparison === 0;
          case '>':
            return comparison > 0;
          case '>=':
            return comparison >= 0;
          case '<':
            return comparison < 0;
          case '<=':
            return comparison <= 0;
          default:
            return true;
        }
      });
      continue;
    }
    if (constraint?.kind === 'orderBy') {
      items = [...items].sort((left, right) => {
        const comparison = compareValues(
          getRowFieldValue(left.row, left.payload, constraint.field),
          getRowFieldValue(right.row, right.payload, constraint.field)
        );
        return constraint.direction === 'desc' ? comparison * -1 : comparison;
      });
      continue;
    }
    if (constraint?.kind === 'limit') {
      items = items.slice(0, constraint.value);
    }
  }
  return items;
}

class QuerySnapshotCompat {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
}

class DocumentSnapshotCompat {
  constructor(ref, payload) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = payload !== null;
    this.payload = payload;
  }

  data() {
    return this.payload === null ? undefined : JSON.parse(JSON.stringify(this.payload));
  }
}

class DocumentReferenceCompat {
  constructor(adapter, pathSegments) {
    this.adapter = adapter;
    this.pathSegments = [...pathSegments];
    this.path = this.pathSegments.join('/');
    this.id = this.pathSegments[this.pathSegments.length - 1];
    this.target = resolveDocumentTarget(this.pathSegments);
    if (!this.target) {
      throw new Error(`Unsupported Appwrite document path: ${this.path}`);
    }
  }

  collection(name) {
    return new CollectionReferenceCompat(this.adapter, [...this.pathSegments, name]);
  }

  async get() {
    const payload = await this.adapter.readPayload(this.target);
    return new DocumentSnapshotCompat(this, payload);
  }

  async set(data = {}, options = {}) {
    await this.adapter.writePayload(this.target, data, options);
  }
}

class CollectionReferenceCompat {
  constructor(adapter, pathSegments, constraints = []) {
    this.adapter = adapter;
    this.pathSegments = [...pathSegments];
    this.constraints = constraints;
  }

  doc(id) {
    return new DocumentReferenceCompat(this.adapter, [...this.pathSegments, id]);
  }

  where(field, op, value) {
    return new CollectionReferenceCompat(this.adapter, this.pathSegments, [...this.constraints, { kind: 'where', field, op, value }]);
  }

  orderBy(field, direction = 'asc') {
    return new CollectionReferenceCompat(this.adapter, this.pathSegments, [...this.constraints, { kind: 'orderBy', field, direction }]);
  }

  limit(value) {
    return new CollectionReferenceCompat(this.adapter, this.pathSegments, [...this.constraints, { kind: 'limit', value: Math.max(1, Number(value) || 1) }]);
  }

  async get() {
    return new QuerySnapshotCompat(await this.adapter.queryCollection(this.pathSegments, this.constraints));
  }
}

class CollectionGroupReferenceCompat {
  constructor(adapter, groupName, constraints = []) {
    this.adapter = adapter;
    this.groupName = groupName;
    this.constraints = constraints;
  }

  where(field, op, value) {
    return new CollectionGroupReferenceCompat(this.adapter, this.groupName, [...this.constraints, { kind: 'where', field, op, value }]);
  }

  orderBy(field, direction = 'asc') {
    return new CollectionGroupReferenceCompat(this.adapter, this.groupName, [...this.constraints, { kind: 'orderBy', field, direction }]);
  }

  limit(value) {
    return new CollectionGroupReferenceCompat(this.adapter, this.groupName, [...this.constraints, { kind: 'limit', value: Math.max(1, Number(value) || 1) }]);
  }

  async get() {
    return new QuerySnapshotCompat(await this.adapter.queryCollectionGroup(this.groupName, this.constraints));
  }
}

class AppwriteFirestoreCompat {
  constructor(tables) {
    this.tables = tables;
  }

  settings() {}

  collection(name) {
    return new CollectionReferenceCompat(this, [name]);
  }

  collectionGroup(name) {
    return new CollectionGroupReferenceCompat(this, name);
  }

  async listRows(tableId) {
    const limit = 5000;
    const rows = [];
    for (let offset = 0; ; offset += limit) {
      const response = await this.tables.listRows({
        databaseId: APPWRITE_DATABASE_ID,
        tableId,
        queries: [Query.limit(limit), Query.offset(offset)],
      });
      rows.push(...response.rows);
      if (response.rows.length < limit) break;
    }
    return rows;
  }

  async readPayload(target) {
    try {
      const row = await this.tables.getRow({ databaseId: APPWRITE_DATABASE_ID, tableId: target.tableId, rowId: target.rowId });
      return decodeRow(row);
    } catch (_error) {
      return null;
    }
  }

  async writePayload(target, data = {}, options = {}) {
    const nowIso = new Date().toISOString();
    const patch = materializeWriteValue(data, nowIso);
    const existing = options?.merge ? (await this.readPayload(target)) || {} : {};
    const payload = options?.merge ? deepMerge(existing, patch) : patch;
    await this.tables.upsertRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: target.tableId,
      rowId: target.rowId,
      data: buildRowData(target, materializeWriteValue(payload, nowIso)),
    });
  }

  async queryCollection(pathSegments, constraints = []) {
    const tableId = this.resolveCollectionTable(pathSegments);
    const rows = await this.listRows(tableId);
    const entries = rows.filter((row) => this.matchesCollectionPath(row, pathSegments)).map((row) => ({ row, payload: decodeRow(row) || {} }));
    return this.entriesToDocs(applyConstraints(entries, constraints));
  }

  async queryCollectionGroup(groupName, constraints = []) {
    const entries = [];
    for (const tableId of listBootstrapTables()) {
      try {
        const rows = await this.listRows(tableId);
        for (const row of rows) {
          const collectionKey = safeText(row.collection_key);
          if (collectionKey === groupName || collectionKey.endsWith(`.${groupName}`)) {
            entries.push({ row, payload: decodeRow(row) || {} });
          }
        }
      } catch (_error) {
        // tolerate missing tables during bootstrap
      }
    }
    return this.entriesToDocs(applyConstraints(entries, constraints));
  }

  resolveCollectionTable(pathSegments) {
    if (pathSegments.length === 1 && listBootstrapTables().includes(pathSegments[0])) return pathSegments[0];
    if (pathSegments[0] === 'forecast_runs' && pathSegments[2] === 'artifacts' && pathSegments.length === 3) return 'forecast_run_artifacts';
    if (pathSegments[0] === 'forecast_ledger' && pathSegments[2] === 'versions' && pathSegments.length === 3) return 'forecast_ledger_versions';
    const probe = resolveDocumentTarget([...pathSegments, '__probe__']);
    if (probe?.tableId) return probe.tableId;
    throw new Error(`Unsupported Appwrite collection path: ${pathSegments.join('/')}`);
  }

  matchesCollectionPath(row, pathSegments) {
    if (pathSegments.length === 1) return safeText(row.collection_key) === pathSegments[0];
    if (pathSegments[0] === 'forecast_runs' && pathSegments[2] === 'artifacts' && pathSegments.length === 3) {
      return row.parent_id === pathSegments[1] && safeText(row.collection_key) === 'forecast_runs.artifacts';
    }
    if (pathSegments[0] === 'forecast_ledger' && pathSegments[2] === 'versions' && pathSegments.length === 3) {
      return row.parent_id === pathSegments[1] && safeText(row.collection_key) === 'forecast_ledger.versions';
    }
    if (pathSegments[0] === 'users' && pathSegments.length === 3) {
      return row.user_id === pathSegments[1] && safeText(row.collection_key) === `users.${pathSegments[2]}`;
    }
    if (pathSegments[0] === 'users' && pathSegments[2] === 'cards' && pathSegments[4] === 'versions' && pathSegments.length === 5) {
      return row.user_id === pathSegments[1] && row.parent_id === pathSegments[3] && safeText(row.collection_key) === 'users.cards.versions';
    }
    return false;
  }

  entriesToDocs(entries) {
    return entries.map(({ row, payload }) => ({
      id: row.source_id,
      ref: { id: row.source_id, path: row.path_key },
      data() {
        return JSON.parse(JSON.stringify(payload));
      },
    }));
  }
}

export function getDbCompat() {
  if (!dbSingleton) dbSingleton = new AppwriteFirestoreCompat(createTables());
  return dbSingleton;
}

export function getCrystalRuntime() {
  if (!runtimeSingleton) {
    runtimeSingleton = createCrystalCoreRuntime({
      db: getDbCompat(),
      admin: getAdminCompat(),
      getGeminiApiKey: () => process.env.GEMINI_API_KEY || '',
    });
  }
  return runtimeSingleton;
}

export async function readRun(runId) {
  const snapshot = await getDbCompat().collection('forecast_runs').doc(runId).get();
  return snapshot.exists ? snapshot.data() || null : null;
}

export function sanitizeRun(runDoc = {}) {
  return {
    run_id: safeText(runDoc.run_id),
    status: safeText(runDoc.status, 'created'),
    visibility: safeText(runDoc.visibility, 'private'),
    current_stage: safeText(runDoc.current_stage, 'created'),
    query_text: safeText(runDoc.query_text),
    query_plan: serializeApiValue(runDoc.query_plan || null),
    request_time_zone: safeText(runDoc.request_time_zone),
    source_view: safeText(runDoc.source_view),
    engine: safeText(runDoc.engine, 'extended'),
    plan: safeText(runDoc.plan, 'free'),
    error_message: safeText(runDoc.error_message),
    runtime_transport: safeText(runDoc.runtime_transport, 'appwrite_in_process'),
    rollout_bucket: safeText(runDoc.rollout_bucket),
    evaluation_eligible: Boolean(runDoc.evaluation_eligible),
    resolution_status: safeText(runDoc.resolution_status),
    created_at: serializeApiValue(runDoc.created_at),
    started_at: serializeApiValue(runDoc.started_at),
    updated_at: serializeApiValue(runDoc.updated_at),
    completed_at: serializeApiValue(runDoc.completed_at),
    result_available: Boolean(runDoc.result_card),
    pending_poll_after_ms: Number.isFinite(Number(runDoc.pending_poll_after_ms)) ? Number(runDoc.pending_poll_after_ms) : 2500,
    core_runtime: safeText(runDoc.core_runtime),
  };
}

export async function executeForecastRunNow(payload = {}) {
  const runId = safeText(payload.runId) || `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const runtime = getCrystalRuntime();
  try {
    const card = await runtime.executeForecastRun({
      ...payload,
      runId,
      runtimeTransport: safeText(payload.runtimeTransport, 'appwrite_in_process'),
    });
    const runDoc = await readRun(runId);
    return {
      status: 'completed',
      run_id: runId,
      run: sanitizeRun(runDoc || { run_id: runId, status: 'completed' }),
      card: serializeApiValue(runDoc?.result_card || card),
    };
  } catch (error) {
    const runDoc = await readRun(runId);
    return {
      status: safeText(runDoc?.status, 'failed'),
      run_id: runId,
      run: sanitizeRun(runDoc || { run_id: runId, status: 'failed' }),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function enqueueForecastRun(payload = {}) {
  const runId = safeText(payload.runId) || `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const visibility = safeText(payload.visibility) === 'public' ? 'public' : 'private';
  const publicAccessToken = visibility === 'public' ? safeText(payload.publicAccessToken) || `pub_${Math.random().toString(36).slice(2, 12)}` : null;
  const requestTimeZone = safeText(payload.requestTimeZone, 'Europe/Rome');
  const requestLanguage = safeText(payload.requestLanguage);
  const runAsOfUtc = safeText(payload.runAsOfUtc, new Date().toISOString());
  const runtimeTransport = safeText(payload.runtimeTransport, 'appwrite_jobs');
  const pendingCard = getCrystalRuntime().buildPendingRunCard({
    runId,
    queryText: safeText(payload.queryText),
    queryPlan: payload.queryPlan || null,
    visibility,
    accessToken: publicAccessToken,
    pollAfterMs: 2500,
    languageHint: requestLanguage,
  });

  const target = resolveDocumentTarget(['forecast_runs', runId]);
  if (!target) {
    throw new Error(`Unable to resolve forecast run target for ${runId}.`);
  }

  const tables = createTables();
  await tables.upsertRow({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: 'forecast_runs',
    rowId: target.rowId,
    data: buildRowData(target, {
      run_id: runId,
      status: 'running',
      visibility,
      access_token: publicAccessToken,
      uid: payload.uid || null,
      source_view: safeText(payload.sourceView, 'search'),
      query_text: safeText(payload.queryText),
      query_plan: payload.queryPlan || null,
      user_context: payload.userContext || null,
      started_at: runAsOfUtc,
      updated_at: runAsOfUtc,
      current_stage: 'queued',
      engine: safeText(payload.engine, 'extended'),
      plan: safeText(payload.plan, 'free'),
      request_time_zone: requestTimeZone,
      request_language: requestLanguage || null,
      run_as_of_utc: runAsOfUtc,
      runtime_transport: runtimeTransport,
      rollout_bucket: safeText(payload.rolloutBucket) || null,
      core_version: 'crystal-core-v1',
      core_runtime: 'crystal-core-v1',
      pending_poll_after_ms: 2500,
    }),
  });

  try {
    await createForecastJobExecution({
      action: 'run-forecast',
      payload: {
        ...payload,
        runId,
        queryText: safeText(payload.queryText),
        queryPlan: payload.queryPlan || null,
        visibility,
        publicAccessToken,
        requestTimeZone,
        requestLanguage,
        runAsOfUtc,
        runtimeTransport,
      },
    });
  } catch (error) {
    const fallbackResult = await executeForecastRunNow({
      ...payload,
      runId,
      queryText: safeText(payload.queryText),
      queryPlan: payload.queryPlan || null,
      visibility,
      publicAccessToken,
      requestTimeZone,
      requestLanguage,
      runAsOfUtc,
      runtimeTransport: 'appwrite_in_process_fallback',
      transportFallbackReason: error instanceof Error ? error.message : String(error),
    });

    if (fallbackResult?.card) {
      return fallbackResult;
    }

    await tables.upsertRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: 'forecast_runs',
      rowId: target.rowId,
      data: buildRowData(target, {
        run_id: runId,
        status: 'failed',
        visibility,
        access_token: publicAccessToken,
        uid: payload.uid || null,
        source_view: safeText(payload.sourceView, 'search'),
        query_text: safeText(payload.queryText),
        query_plan: payload.queryPlan || null,
        user_context: payload.userContext || null,
        started_at: runAsOfUtc,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_stage: 'failed',
        engine: safeText(payload.engine, 'extended'),
        plan: safeText(payload.plan, 'free'),
        request_time_zone: requestTimeZone,
        run_as_of_utc: runAsOfUtc,
        runtime_transport: runtimeTransport,
        rollout_bucket: safeText(payload.rolloutBucket) || null,
        core_version: 'crystal-core-v1',
        core_runtime: 'crystal-core-v1',
        pending_poll_after_ms: 2500,
        error_message: error instanceof Error ? error.message : String(error),
      }),
    });
    throw error;
  }

  return {
    status: 'pending',
    run_id: runId,
    run: sanitizeRun({
      run_id: runId,
      status: 'running',
      visibility,
      query_text: safeText(payload.queryText),
      query_plan: payload.queryPlan || null,
      request_time_zone: requestTimeZone,
      source_view: safeText(payload.sourceView, 'search'),
      engine: safeText(payload.engine, 'extended'),
      plan: safeText(payload.plan, 'free'),
      runtime_transport: runtimeTransport,
      rollout_bucket: safeText(payload.rolloutBucket),
      pending_poll_after_ms: 2500,
      current_stage: 'queued',
      core_runtime: 'crystal-core-v1',
      started_at: runAsOfUtc,
      updated_at: runAsOfUtc,
    }),
    card: pendingCard,
  };
}

export async function runEvaluationMode(mode, options = {}) {
  return getCrystalRuntime().runOfflineEvaluationMode({
    mode,
    reportType: options.reportType,
    lookbackDays: options.lookbackDays,
    backfillLookbackDays: options.backfillLookbackDays,
    limit: options.limit,
    outputDate: options.outputDate,
  });
}

function getGeminiClient() {
  const apiKey = safeText(process.env.GEMINI_API_KEY);
  if (!apiKey) {
    return null;
  }
  if (!geminiSingleton) {
    geminiSingleton = new GoogleGenAI({ apiKey });
  }
  return geminiSingleton;
}

async function fetchJsonCompat(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json();
}

async function withRetryCompat(fn, optionsOrRetries = 2, delayMs = 1200) {
  const options =
    typeof optionsOrRetries === 'object' && optionsOrRetries !== null
      ? {
          retries: Number.isFinite(Number(optionsOrRetries.retries)) ? Number(optionsOrRetries.retries) : 2,
          baseDelayMs: Number.isFinite(Number(optionsOrRetries.baseDelayMs))
            ? Number(optionsOrRetries.baseDelayMs)
            : delayMs,
          maxDelayMs: Number.isFinite(Number(optionsOrRetries.maxDelayMs))
            ? Number(optionsOrRetries.maxDelayMs)
            : 10_000,
          jitterRatio:
            Number.isFinite(Number(optionsOrRetries.jitterRatio)) && Number(optionsOrRetries.jitterRatio) >= 0
              ? Number(optionsOrRetries.jitterRatio)
              : 0.25,
        }
      : {
          retries: Number.isFinite(Number(optionsOrRetries)) ? Number(optionsOrRetries) : 2,
          baseDelayMs: delayMs,
          maxDelayMs: 10_000,
          jitterRatio: 0.25,
        };

  for (let attempt = 1; attempt <= options.retries + 1; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt > options.retries) {
        throw error;
      }
      const exponentialDelay = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
      const jitterWindow = Math.max(0, Math.round(exponentialDelay * options.jitterRatio));
      const jitter = jitterWindow > 0 ? Math.floor(Math.random() * (jitterWindow + 1)) : 0;
      await new Promise((resolve) => setTimeout(resolve, exponentialDelay + jitter));
    }
  }

  throw new Error('WorldSim retry loop exhausted unexpectedly.');
}

function getWorldSimContext() {
  return {
    db: getDbCompat(),
    admin: getAdminCompat(),
    fetchJson: fetchJsonCompat,
    withRetry: withRetryCompat,
    getGemini: () => getGeminiClient(),
  };
}

export async function getRuntimeHealth() {
  return {
    ...serializeApiValue(await getCrystalRuntime().getHealth()),
    appwrite_database_id: APPWRITE_DATABASE_ID,
    legacy_proxy: { crystal_core_base_url: false, mirofish_base_url: false },
  };
}

export async function getWorldSimHealth() {
  return serializeApiValue(await getWorldSimRuntimeHealth({ fetchJson: fetchJsonCompat }));
}

export async function createObserveWorldSimJob(payload = {}) {
  return createManualWorldSimJob(getWorldSimContext(), payload);
}

export async function createMatrixWorldSimJob(payload = {}) {
  return createMatrixSimulationJob(getWorldSimContext(), payload);
}

export async function readObserveWorldSimJob(uid, jobId) {
  return getWorldSimJobDetail(getWorldSimContext(), uid, jobId);
}

export async function readObserveWorldSimJobResult(uid, jobId) {
  return getWorldSimJobResult(getWorldSimContext(), uid, jobId);
}

export async function readMatrixWorldSimJob(uid, jobId) {
  return getMatrixSimulationJobDetail(getWorldSimContext(), uid, jobId);
}

export async function readMatrixWorldSimJobResult(uid, jobId) {
  return getMatrixSimulationJobResult(getWorldSimContext(), uid, jobId);
}

export async function cancelObserveWorldSimJob(uid, jobId) {
  return cancelWorldSimJob(getWorldSimContext(), uid, jobId);
}

export async function cancelMatrixWorldSimJobForUser(uid, jobId) {
  return cancelMatrixSimulationJob(getWorldSimContext(), uid, jobId);
}

export async function listPendingWorldSimJobs(limit = 50) {
  const rows = await getDbCompat().listRows('worldsim_jobs');
  return rows
    .map((row) => decodeRow(row))
    .filter((row) => !['completed', 'failed', 'canceled'].includes(safeText(row?.status)))
    .slice(0, Math.max(1, Number(limit) || 50));
}
