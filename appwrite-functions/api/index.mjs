import { Account, Client, Query, TablesDB } from 'node-appwrite';

import {
  buildRowData,
  decodeRow,
  filterRowsForCollection,
  isPublicCollectionPath,
  isUserScopedTable,
  listBootstrapTables,
  resolveCollectionTarget,
  resolveDocumentTarget,
} from './data-model.mjs';
import {
  APPWRITE_DATABASE_ID,
  cancelMatrixWorldSimJobForUser,
  cancelObserveWorldSimJob,
  createMatrixWorldSimJob,
  createObserveWorldSimJob,
  enqueueForecastRun,
  getCrystalRuntime,
  getRuntimeHealth,
  getWorldSimHealth,
  readMatrixWorldSimJob,
  readMatrixWorldSimJobResult,
  readObserveWorldSimJob,
  readObserveWorldSimJobResult,
  readRun,
  safeText,
  sanitizeRun,
  serializeApiValue,
} from './shared/crystal-runtime.mjs';

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || 'crystal';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';
const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const LLM_API_KEY = process.env.LLM_API_KEY || '';

function buildCorsHeaders(extra = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, x-crystal-source-view, x-crystal-metered-action, x-crystal-timezone, x-crystal-guest-key',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'content-type': 'application/json; charset=utf-8',
    ...extra,
  };
}

function parseBody(req) {
  const bodyText = typeof req?.bodyText === 'string' ? req.bodyText.trim() : '';
  if (!bodyText) {
    return {};
  }
  try {
    if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  } catch (_error) {
    // Some Appwrite invokers can expose an eager bodyJson getter that throws for
    // malformed CLI payloads. Fall back to bodyText so a bad parse cannot block
    // unrelated routes before their handlers run.
  }
  if (bodyText) {
    try {
      return JSON.parse(bodyText);
    } catch (_error) {
      return {};
    }
  }
  return {};
}

function getHeader(req, name) {
  return safeText(req?.headers?.[name.toLowerCase()] || req?.headers?.[name] || '');
}

function normalizeRoute(req) {
  const raw = safeText(req.path || req.url || '/', '/');
  return raw.startsWith('/api/') ? raw.slice(4) : raw;
}

function getTables() {
  const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY);
  return new TablesDB(client);
}

async function listAllRows(tables, tableId) {
  let offset = 0;
  const limit = 5000;
  const items = [];
  while (true) {
    const response = await tables.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId,
      queries: [Query.limit(limit), Query.offset(offset)],
    });
    items.push(...response.rows);
    if (response.rows.length < limit) break;
    offset += limit;
  }
  return items;
}

async function getUserFromJwt(req) {
  const authorization = getHeader(req, 'authorization');
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return null;
  const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setJWT(token);
  const account = new Account(client);
  try {
    return await account.get();
  } catch (_error) {
    return null;
  }
}

function getUserPathAccessFailure(path, user) {
  if (!Array.isArray(path) || path[0] !== 'users') {
    return null;
  }
  if (!user) {
    return { status: 401, body: { error: 'Authentication required.' } };
  }
  if (safeText(path[1]) !== safeText(user.$id)) {
    return { status: 403, body: { error: 'Non puoi accedere a questi dati.' } };
  }
  return null;
}

async function maybeMigrateLegacyUserData(tables, user) {
  if (!user?.email) return;

  const usersRows = await listAllRows(tables, 'users');
  const currentRow = usersRows.find((row) => row.source_id === user.$id);
  if (currentRow) return;

  const email = safeText(user.email).toLowerCase();
  const legacyRow = usersRows.find((row) => safeText(decodeRow(row)?.email).toLowerCase() === email && row.source_id !== user.$id);
  if (!legacyRow) return;

  const legacyUserId = legacyRow.source_id;
  const userTarget = resolveDocumentTarget(['users', user.$id]);
  await tables.upsertRow({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: 'users',
    rowId: userTarget.rowId,
    data: buildRowData(userTarget, {
      ...(decodeRow(legacyRow) || {}),
      email: user.email,
      displayName: safeText(user.name, safeText(decodeRow(legacyRow)?.displayName, 'User')),
      legacy_uid: legacyUserId,
    }),
  });

  for (const tableId of listBootstrapTables().filter((table) => isUserScopedTable(table) && table !== 'users')) {
    const rows = await listAllRows(tables, tableId);
    for (const row of rows.filter((entry) => entry.user_id === legacyUserId)) {
      const path = safeText(row.path_key).split('/');
      if (path.length < 2) continue;
      path[1] = user.$id;
      const nextTarget = resolveDocumentTarget(path);
      if (!nextTarget) continue;
      await tables.upsertRow({
        databaseId: APPWRITE_DATABASE_ID,
        tableId,
        rowId: nextTarget.rowId,
        data: buildRowData(nextTarget, {
          ...(decodeRow(row) || {}),
          legacy_uid: legacyUserId,
        }),
      });
      await tables.deleteRow({ databaseId: APPWRITE_DATABASE_ID, tableId, rowId: row.$id });
    }
  }

  await tables.deleteRow({ databaseId: APPWRITE_DATABASE_ID, tableId: 'users', rowId: legacyRow.$id });
}

async function callLlmJson(prompt, systemInstruction) {
  if (!LLM_API_KEY) {
    throw new Error('LLM_API_KEY is not configured.');
  }
  const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LLM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL_COPY || process.env.LLM_MODEL_FORECAST || 'openai/gpt-4.1-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`LLM upstream error ${response.status}`);
  }
  const payload = await response.json();
  return JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
}

async function handleDataRoute(tables, route, req, user) {
  if (!route.startsWith('/data/')) return null;

  const body = parseBody(req);

  if (route === '/data/document/get') {
    const path = Array.isArray(body.path) ? body.path : [];
    const target = resolveDocumentTarget(path);
    if (!target) return { status: 404, body: { error: 'Document path not supported.' } };
    if (path[0] === 'users') {
      const accessFailure = getUserPathAccessFailure(path, user);
      if (accessFailure) return accessFailure;
      await maybeMigrateLegacyUserData(tables, user);
    }
    const rows = await listAllRows(tables, target.tableId);
    const row = rows.find((entry) => entry.path_key === target.pathKey || entry.source_id === target.sourceId);
    return { status: 200, body: { document: row ? { id: row.source_id, data: decodeRow(row) } : { id: target.sourceId, data: null } } };
  }

  if (route === '/data/document/set') {
    const path = Array.isArray(body.path) ? body.path : [];
    const target = resolveDocumentTarget(path);
    if (!target) return { status: 404, body: { error: 'Document path not supported.' } };
    if (path[0] === 'users') {
      const accessFailure = getUserPathAccessFailure(path, user);
      if (accessFailure) return accessFailure;
      await maybeMigrateLegacyUserData(tables, user);
    }
    const rows = await listAllRows(tables, target.tableId);
    const existing = rows.find((entry) => entry.path_key === target.pathKey || entry.source_id === target.sourceId);
    const payload = body.merge && existing ? { ...(decodeRow(existing) || {}), ...(body.data || {}) } : body.data || {};
    await tables.upsertRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: target.tableId,
      rowId: target.rowId,
      data: buildRowData(target, payload),
    });
    return { status: 200, body: { ok: true } };
  }

  if (route === '/data/document/delete') {
    const path = Array.isArray(body.path) ? body.path : [];
    const target = resolveDocumentTarget(path);
    if (!target) return { status: 404, body: { error: 'Document path not supported.' } };
    if (path[0] === 'users') {
      const accessFailure = getUserPathAccessFailure(path, user);
      if (accessFailure) return accessFailure;
    }
    const rows = await listAllRows(tables, target.tableId);
    const existing = rows.find((entry) => entry.path_key === target.pathKey || entry.source_id === target.sourceId);
    if (existing) {
      await tables.deleteRow({ databaseId: APPWRITE_DATABASE_ID, tableId: target.tableId, rowId: existing.$id });
    }
    return { status: 200, body: { ok: true } };
  }

  if (route === '/data/collection/add') {
    const collectionPath = Array.isArray(body.path) ? body.path : [];
    const nextId = safeText(body.id) || `doc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    if (collectionPath[0] === 'users') {
      const accessFailure = getUserPathAccessFailure([...collectionPath, nextId], user);
      if (accessFailure) return accessFailure;
      await maybeMigrateLegacyUserData(tables, user);
    }
    const target = resolveDocumentTarget([...collectionPath, nextId]);
    if (!target) return { status: 404, body: { error: 'Collection path not supported.' } };
    await tables.upsertRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: target.tableId,
      rowId: target.rowId,
      data: buildRowData(target, body.data || {}),
    });
    return { status: 200, body: { document: { id: nextId, data: body.data || {} } } };
  }

  if (route === '/data/query') {
    const path = Array.isArray(body.path) ? body.path : [];
    const constraints = Array.isArray(body.constraints) ? body.constraints : [];
    const collectionTarget = resolveCollectionTarget(path);
    if (!collectionTarget) return { status: 404, body: { error: 'Collection path not supported.' } };
    if (path[0] === 'users') {
      const accessFailure = getUserPathAccessFailure([...path, 'placeholder'], user);
      if (accessFailure) return accessFailure;
      await maybeMigrateLegacyUserData(tables, user);
    } else if (!collectionTarget.publicRead && !user && !isPublicCollectionPath(path)) {
      return { status: 401, body: { error: 'Authentication required.' } };
    }
    const rows = await listAllRows(tables, collectionTarget.tableId);
    return { status: 200, body: { documents: filterRowsForCollection(rows, collectionTarget, constraints) } };
  }

  return null;
}

async function handleForecastRoute(route, req, user) {
  const body = parseBody(req);

  if (req.method === 'POST' && route === '/public/compile-query') {
    return {
      status: 200,
      body: {
        ok: true,
        query_plan: await getCrystalRuntime().compileQuery(safeText(body.query), {
          timeZone: getHeader(req, 'x-crystal-timezone'),
          asOfUtc: new Date().toISOString(),
        }),
      },
    };
  }

  if (req.method === 'POST' && route === '/compile-query') {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    return {
      status: 200,
      body: {
        ok: true,
        query_plan: await getCrystalRuntime().compileQuery(safeText(body.query), {
          timeZone: getHeader(req, 'x-crystal-timezone'),
          asOfUtc: new Date().toISOString(),
        }),
      },
    };
  }

  if (req.method === 'POST' && route === '/public/predict') {
    const response = await enqueueForecastRun({
      queryText: safeText(body.query),
      queryPlan: body.queryPlan || null,
      uid: null,
      visibility: 'public',
      publicAccessToken: `pub_${Math.random().toString(36).slice(2, 10)}`,
      sourceView: 'forecast-gallery-guest',
      routeOrigin: 'public/predict',
      userContext: null,
      requestTimeZone: getHeader(req, 'x-crystal-timezone'),
      runAsOfUtc: new Date().toISOString(),
    });
    return { status: 200, body: response.card || response };
  }

  if (req.method === 'POST' && route === '/predict') {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    const response = await enqueueForecastRun({
      queryText: safeText(body.query),
      queryPlan: body.queryPlan || null,
      uid: user.$id,
      visibility: 'private',
      sourceView: safeText(getHeader(req, 'x-crystal-source-view'), 'search'),
      routeOrigin: 'predict',
      userContext: body.userContext || null,
      requestTimeZone: getHeader(req, 'x-crystal-timezone'),
      runAsOfUtc: new Date().toISOString(),
    });
    return { status: 200, body: response.card || response };
  }

  if (req.method === 'GET' && /^\/forecast-runs\/[^/]+$/.test(route)) {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    const runId = decodeURIComponent(route.split('/')[2] || '');
    const runDoc = await readRun(runId);
    if (!runDoc || safeText(runDoc.uid) !== safeText(user.$id)) {
      return { status: 404, body: { error: 'Forecast run not available.' } };
    }
    return {
      status: 200,
      body: {
        status: safeText(runDoc.status, 'created'),
        run_id: runId,
        run: sanitizeRun(runDoc),
        card: runDoc.result_card ? serializeApiValue(runDoc.result_card) : null,
      },
    };
  }

  if (req.method === 'GET' && /^\/public\/forecast-runs\/[^/]+$/.test(route)) {
    const runId = decodeURIComponent(route.split('/')[3] || '');
    const token = safeText(req.query?.token);
    const runDoc = await readRun(runId);
    if (!runDoc || safeText(runDoc.visibility) !== 'public' || safeText(runDoc.access_token) !== token) {
      return { status: 404, body: { error: 'Forecast run not available.' } };
    }
    return {
      status: 200,
      body: {
        status: safeText(runDoc.status, 'created'),
        run_id: runId,
        run: sanitizeRun(runDoc),
        card: runDoc.result_card ? serializeApiValue(runDoc.result_card) : null,
      },
    };
  }

  if (req.method === 'POST' && /^\/forecast-runs\/[^/]+\/cancel$/.test(route)) {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    const runId = decodeURIComponent(route.split('/')[2] || '');
    const tables = getTables();
    const target = resolveDocumentTarget(['forecast_runs', runId]);
    const current = await readRun(runId);
    if (!current || safeText(current.uid) !== safeText(user.$id)) {
      return { status: 404, body: { error: 'Forecast run not available.' } };
    }
    await tables.upsertRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: 'forecast_runs',
      rowId: target.rowId,
      data: buildRowData(target, {
        ...current,
        status: 'canceled',
        current_stage: 'canceled',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    return { status: 200, body: { ok: true, run_id: runId } };
  }

  return null;
}

async function handleAiRoute(route, req, tables, user) {
  const body = parseBody(req);

  if (req.method === 'POST' && route === '/profile-chat') {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    return {
      status: 200,
      body: await callLlmJson(
        `Reply to this Crystal profile chat history and ask for geography, profession, and interests naturally one at a time.\n${JSON.stringify(body.messages || [])}`,
        'Return JSON with exactly one field: {"text":"..."}'
      ),
    };
  }

  if (req.method === 'POST' && route === '/nextletter') {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    return {
      status: 200,
      body: await callLlmJson(
        `Create a Crystal Nextletter for interests ${JSON.stringify(body.interests || [])} and user context ${JSON.stringify(body.userContext || {})}.`,
        'Return JSON with title, subtitle, and sections[] with topic, icon, title, content, historical_context, probability, horizon, impact, so_what, query_suggestion.'
      ),
    };
  }

  if (req.method === 'GET' && route === '/quotes') {
    const cacheTarget = resolveDocumentTarget(['system_cache', `quotes_${new Date().toISOString().slice(0, 10)}`]);
    const cacheRows = await listAllRows(tables, 'system_cache');
    const cached = cacheRows.find((entry) => entry.path_key === cacheTarget.pathKey);
    if (cached) return { status: 200, body: decodeRow(cached) };
    const payload = await callLlmJson(
      'Generate 5 Crystal quotes for the current week with quote_id, text, author, context, date, analysis{title, full_text, drivers[], impact, historical_parallel}.',
      'Return JSON with a top-level "quotes" array only.'
    );
    await tables.upsertRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: 'system_cache',
      rowId: cacheTarget.rowId,
      data: buildRowData(cacheTarget, payload),
    });
    return { status: 200, body: payload };
  }

  if (req.method === 'POST' && route === '/local-insights') {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    return {
      status: 200,
      body: await callLlmJson(
        `Provide concise local insights for query "${safeText(body.query)}" and entities ${JSON.stringify(body.entities || [])}.`,
        'Return JSON with keys {"text": string, "chunks": [] }.'
      ),
    };
  }

  return null;
}

async function handleWorldSimRoute(route, req, user) {
  const body = parseBody(req);

  if (req.method === 'POST' && route === '/worldsim/jobs') {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    return {
      status: 200,
      body: await createObserveWorldSimJob({
        uid: user.$id,
        plan: body.plan || 'free',
        source: body.source || 'manual',
        sourceRef: body.sourceRef || 'manual',
        queryText: safeText(body.query || body.baselineQuery),
        queryPlan: body.queryPlan || null,
        userContext: body.userContext || null,
      }),
    };
  }

  if (req.method === 'GET' && /^\/worldsim\/jobs\/[^/]+$/.test(route)) {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    const jobId = decodeURIComponent(route.split('/')[3] || '');
    return { status: 200, body: { job: await readObserveWorldSimJob(user.$id, jobId) } };
  }

  if (req.method === 'GET' && /^\/worldsim\/jobs\/[^/]+\/result$/.test(route)) {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    const jobId = decodeURIComponent(route.split('/')[3] || '');
    return { status: 200, body: await readObserveWorldSimJobResult(user.$id, jobId) };
  }

  if (req.method === 'POST' && /^\/worldsim\/jobs\/[^/]+\/cancel$/.test(route)) {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    const jobId = decodeURIComponent(route.split('/')[3] || '');
    return { status: 200, body: { job: await cancelObserveWorldSimJob(user.$id, jobId) } };
  }

  if (req.method === 'POST' && route === '/worldsim/interventions') {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    return {
      status: 200,
      body: await createMatrixWorldSimJob({
        uid: user.$id,
        plan: body.plan || 'free',
        source: body.source || 'matrix-simulation',
        sourceRef: body.sourceRef || 'worldsim-chamber',
        queryText: safeText(body.query || body.baselineQuery),
        queryPlan: body.queryPlan || null,
        userContext: body.userContext || null,
        interventionPayload: body.intervention || null,
        branchParentId: body.branchParentId || null,
      }),
    };
  }

  if (req.method === 'GET' && /^\/worldsim\/interventions\/[^/]+$/.test(route)) {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    const jobId = decodeURIComponent(route.split('/')[3] || '');
    return { status: 200, body: { job: await readMatrixWorldSimJob(user.$id, jobId) } };
  }

  if (req.method === 'GET' && /^\/worldsim\/interventions\/[^/]+\/result$/.test(route)) {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    const jobId = decodeURIComponent(route.split('/')[3] || '');
    return { status: 200, body: await readMatrixWorldSimJobResult(user.$id, jobId) };
  }

  if (req.method === 'POST' && /^\/worldsim\/interventions\/[^/]+\/cancel$/.test(route)) {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    const jobId = decodeURIComponent(route.split('/')[3] || '');
    return { status: 200, body: { job: await cancelMatrixWorldSimJobForUser(user.$id, jobId) } };
  }

  return null;
}

async function handleStaticRoute(route) {
  if (route === '/registry/catalog') {
    return { status: 200, body: { domains: [], version: 'appwrite-runtime-v2', note: 'Catalog registry pending direct port.' } };
  }
  if (route === '/registry/sources') {
    return { status: 200, body: { sources: [], version: 'appwrite-runtime-v2', note: 'Source registry pending direct port.' } };
  }
  if (route === '/coverage/snapshot') {
    return { status: 200, body: { available: false, note: 'Coverage snapshot pending direct port.' } };
  }
  if (route === '/coverage/ledger') {
    return { status: 200, body: { items: [], note: 'Coverage ledger pending direct port.' } };
  }
  if (route === '/billing/create-checkout-session') {
    return { status: 503, body: { error: 'Billing is temporarily unavailable during the Appwrite cutover.' } };
  }
  if (route === '/health') {
    return {
      status: 200,
      body: {
        ok: true,
        backend: 'appwrite-api',
        runtime: await getRuntimeHealth(),
        worldsim: await getWorldSimHealth(),
      },
    };
  }
  return null;
}

export default async ({ req, res, error }) => {
  const route = normalizeRoute(req);
  const tables = getTables();
  const user = await getUserFromJwt(req);

  try {
    if (req.method === 'OPTIONS') {
      return res.json({}, 204, buildCorsHeaders());
    }

    const response =
      (await handleStaticRoute(route)) ||
      (await handleDataRoute(tables, route, req, user)) ||
      (await handleForecastRoute(route, req, user)) ||
      (await handleAiRoute(route, req, tables, user)) ||
      (await handleWorldSimRoute(route, req, user)) || {
        status: 404,
        body: { error: `Unhandled route: ${route}` },
      };

    return res.json(response.body, response.status, buildCorsHeaders());
  } catch (caughtError) {
    error(String(caughtError?.stack || caughtError?.message || caughtError));
    return res.json({ error: safeText(caughtError?.message, 'Crystal Appwrite API failed.') }, 500, buildCorsHeaders());
  }
};
