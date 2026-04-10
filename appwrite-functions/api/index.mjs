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

function createRequestId() {
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function buildCorsHeaders(extra = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, x-crystal-source-view, x-crystal-metered-action, x-crystal-timezone, x-crystal-language, x-crystal-guest-key',
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

function getRequestId(req) {
  return safeText(getHeader(req, 'x-request-id'), createRequestId());
}

function normalizeRoute(req) {
  const raw = safeText(req.path || req.url || '/', '/');
  const pathOnly = raw.split('?')[0] || '/';
  return pathOnly.startsWith('/api/') ? pathOnly.slice(4) : pathOnly;
}

function getQueryParam(req, name) {
  const direct = req?.query?.[name];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const raw = safeText(req.path || req.url || '/', '/');
  const queryString = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  return safeText(new URLSearchParams(queryString).get(name) || '');
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

function getUserMode(user) {
  if (!user) return 'guest';
  if (user?.prefs?.isAnonymous === true || user?.email === 'guest@anonymous.local') return 'guest';
  return 'signed_in';
}

function inferDomainId(body = {}, payload = {}) {
  return safeText(
    body?.queryPlan?.primary_domain_id ||
      body?.queryPlan?.domain_id ||
      body?.queryPlan?.domain ||
      payload?.query_plan?.primary_domain_id ||
      payload?.query_plan?.domain_id ||
      payload?.query_plan?.domain ||
      payload?.card?.domain ||
      payload?.domain
  );
}

function extractCardState(payload = {}) {
  return safeText(payload?.card_state, safeText(payload?.card?.card_state, safeText(payload?.run?.result_card?.card_state)));
}

function extractHoldReason(payload = {}) {
  const card = payload?.card && typeof payload.card === 'object' ? payload.card : payload;
  return safeText(
    card?.publication_basis?.blocker_reason ||
      card?.evidence_drawer?.quality_summary?.blocker_reason ||
      card?.no_action_reason ||
      card?.decision_reason ||
      card?.sports_overlay_blocker_reason ||
      card?.sports_no_bet_reason
  );
}

function resolveErrorStatus(error) {
  if (Number.isFinite(Number(error?.status))) return Number(error.status);
  const code = safeText(error?.code).toLowerCase();
  if (['permission-denied', 'forbidden'].includes(code)) return 403;
  if (['unauthenticated', 'auth-required', 'unauthorized'].includes(code)) return 401;
  if (['not-found', 'missing'].includes(code)) return 404;
  if (['invalid-argument', 'failed-precondition', 'bad-request'].includes(code)) return 422;
  return 500;
}

async function recordPipelineLog(tables, requestId, payload = {}) {
  const target = resolveDocumentTarget(['pipeline_logs', requestId]);
  if (!target) return;
  await tables.upsertRow({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: 'pipeline_logs',
    rowId: target.rowId,
    data: buildRowData(target, {
      request_id: requestId,
      route: safeText(payload.route),
      event_type: safeText(payload.event_type, 'api_request'),
      user_mode: safeText(payload.user_mode, 'guest'),
      input_language: safeText(payload.input_language),
      domain_id: safeText(payload.domain_id),
      run_id: safeText(payload.run_id),
      job_id: safeText(payload.job_id),
      cache_hit: payload.cache_hit === true,
      card_state: safeText(payload.card_state),
      hold_reason: safeText(payload.hold_reason),
      error_code: safeText(payload.error_code),
      duration_ms: Number.isFinite(Number(payload.duration_ms)) ? Number(payload.duration_ms) : null,
      runtime_transport: safeText(payload.runtime_transport),
      source_view: safeText(payload.source_view),
      route_origin: safeText(payload.route_origin),
      query_text: safeText(payload.query_text),
      status: safeText(payload.status),
      visibility: safeText(payload.visibility),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      timestamp: new Date().toISOString(),
    }),
  });
}

function shouldLogRoute(route) {
  return (
    route.startsWith('/data/') ||
    route === '/public/compile-query' ||
    route === '/compile-query' ||
    route === '/public/predict' ||
    route === '/predict' ||
    route.startsWith('/forecast-runs/') ||
    route.startsWith('/public/forecast-runs/') ||
    route.startsWith('/worldsim/')
  );
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

async function handleForecastRoute(route, req, user, requestId) {
  const body = parseBody(req);
  const queryText = safeText(body.query);

  if (req.method === 'POST' && route === '/public/compile-query') {
    if (!queryText) return { status: 422, body: { error: 'Query is required.' } };
    return {
      status: 200,
      body: {
        ok: true,
        query_plan: await getCrystalRuntime().compileQuery(queryText, {
          timeZone: getHeader(req, 'x-crystal-timezone'),
          languageHint: getHeader(req, 'x-crystal-language') || safeText(body.languageHint || body.requestLanguage || body.language),
          asOfUtc: new Date().toISOString(),
        }),
      },
    };
  }

  if (req.method === 'POST' && route === '/compile-query') {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    if (!queryText) return { status: 422, body: { error: 'Query is required.' } };
    return {
      status: 200,
      body: {
        ok: true,
        query_plan: await getCrystalRuntime().compileQuery(queryText, {
          timeZone: getHeader(req, 'x-crystal-timezone'),
          languageHint: getHeader(req, 'x-crystal-language') || safeText(body.languageHint || body.requestLanguage || body.language),
          asOfUtc: new Date().toISOString(),
        }),
      },
    };
  }

  if (req.method === 'POST' && route === '/public/predict') {
    if (!queryText) return { status: 422, body: { error: 'Query is required.' } };
    const response = await enqueueForecastRun({
      queryText,
      queryPlan: body.queryPlan || null,
      uid: null,
      visibility: 'public',
      publicAccessToken: `pub_${Math.random().toString(36).slice(2, 10)}`,
      sourceView: 'forecast-gallery-guest',
      routeOrigin: 'public/predict',
      requestId,
      userContext: null,
      requestTimeZone: getHeader(req, 'x-crystal-timezone'),
      requestLanguage: getHeader(req, 'x-crystal-language') || safeText(body.languageHint || body.requestLanguage || body.language),
      runAsOfUtc: new Date().toISOString(),
    });
    return { status: 200, body: response.card || response };
  }

  if (req.method === 'POST' && route === '/predict') {
    if (!user) return { status: 401, body: { error: 'Authentication required.' } };
    if (!queryText) return { status: 422, body: { error: 'Query is required.' } };
    const response = await enqueueForecastRun({
      queryText,
      queryPlan: body.queryPlan || null,
      uid: user.$id,
      visibility: 'private',
      sourceView: safeText(getHeader(req, 'x-crystal-source-view'), 'search'),
      routeOrigin: 'predict',
      requestId,
      userContext: body.userContext || null,
      requestTimeZone: getHeader(req, 'x-crystal-timezone'),
      requestLanguage: getHeader(req, 'x-crystal-language') || safeText(body.languageHint || body.requestLanguage || body.language),
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
    const token = getQueryParam(req, 'token');
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
  const requestId = getRequestId(req);
  const tables = getTables();
  const user = await getUserFromJwt(req);
  const requestStartedAt = Date.now();
  const requestBody = parseBody(req);

  try {
    if (req.method === 'OPTIONS') {
      return res.json({}, 204, buildCorsHeaders());
    }

    const response =
      (await handleStaticRoute(route)) ||
      (await handleDataRoute(tables, route, req, user)) ||
      (await handleForecastRoute(route, req, user, requestId)) ||
      (await handleAiRoute(route, req, tables, user)) ||
      (await handleWorldSimRoute(route, req, user)) || {
        status: 404,
        body: { error: `Unhandled route: ${route}` },
      };

    if (shouldLogRoute(route)) {
      await recordPipelineLog(tables, requestId, {
        route,
        event_type: 'api_request',
        user_mode: getUserMode(user),
        input_language: safeText(
          getHeader(req, 'x-crystal-language'),
          safeText(requestBody?.languageHint || requestBody?.requestLanguage || requestBody?.language)
        ),
        domain_id: inferDomainId(requestBody, response?.body || {}),
        run_id: safeText(response?.body?.run_id, safeText(response?.body?.run?.run_id)),
        job_id: safeText(response?.body?.job?.jobId, safeText(response?.body?.job_id)),
        cache_hit: response?.body?.run?.cache_hit === true,
        card_state: extractCardState(response?.body || {}),
        hold_reason: extractHoldReason(response?.body || {}),
        duration_ms: Date.now() - requestStartedAt,
        runtime_transport: safeText(response?.body?.run?.runtime_transport, safeText(response?.body?.runtime_transport)),
        source_view: safeText(getHeader(req, 'x-crystal-source-view'), safeText(requestBody?.sourceView)),
        route_origin: route,
        query_text: safeText(requestBody?.query),
        status: safeText(response?.body?.status, response.status >= 400 ? 'failed' : 'ok'),
        visibility: route.startsWith('/public/') ? 'public' : safeText(response?.body?.run?.visibility, user ? 'private' : 'guest'),
      });
    }

    return res.json(response.body, response.status, buildCorsHeaders());
  } catch (caughtError) {
    error(String(caughtError?.stack || caughtError?.message || caughtError));
    const status = resolveErrorStatus(caughtError);
    if (shouldLogRoute(route)) {
      await recordPipelineLog(tables, requestId, {
        route,
        event_type: 'api_request_failed',
        user_mode: getUserMode(user),
        input_language: safeText(
          getHeader(req, 'x-crystal-language'),
          safeText(requestBody?.languageHint || requestBody?.requestLanguage || requestBody?.language)
        ),
        domain_id: inferDomainId(requestBody, {}),
        duration_ms: Date.now() - requestStartedAt,
        error_code: safeText(caughtError?.code, status === 500 ? 'appwrite-api-error' : `http-${status}`),
        source_view: safeText(getHeader(req, 'x-crystal-source-view'), safeText(requestBody?.sourceView)),
        route_origin: route,
        query_text: safeText(requestBody?.query),
        status: 'failed',
        visibility: route.startsWith('/public/') ? 'public' : user ? 'private' : 'guest',
      });
    }
    return res.json({ error: safeText(caughtError?.message, 'Crystal Appwrite API failed.') }, status, buildCorsHeaders());
  }
};
