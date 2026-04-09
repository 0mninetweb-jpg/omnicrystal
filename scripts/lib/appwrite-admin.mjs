import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
export const DEFAULT_APPWRITE_PROJECT_ID = 'crystal';
export const DEFAULT_APPWRITE_SITE_URL = 'https://69d6db3628a9a5fab5b4.appwrite.network';

function stripBom(text) {
  return text.replace(/^\uFEFF/, '');
}

function normalizeEndpoint(endpoint = DEFAULT_APPWRITE_ENDPOINT) {
  return String(endpoint || DEFAULT_APPWRITE_ENDPOINT).replace(/\/$/, '');
}

async function parseJsonFile(filePath) {
  const text = stripBom(await fs.readFile(filePath, 'utf8'));
  return JSON.parse(text);
}

export async function loadAppwritePrefs() {
  const prefsPath = path.join(os.homedir(), '.appwrite', 'prefs.json');
  return parseJsonFile(prefsPath);
}

export async function resolveProjectKey({ endpoint = DEFAULT_APPWRITE_ENDPOINT } = {}) {
  if (process.env.APPWRITE_API_KEY) {
    return process.env.APPWRITE_API_KEY;
  }

  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const prefs = await loadAppwritePrefs();
  const current = prefs?.current ? prefs[prefs.current] : null;
  if (current?.endpoint === normalizedEndpoint && current?.key) {
    return current.key;
  }

  for (const value of Object.values(prefs || {})) {
    if (value && typeof value === 'object' && value.endpoint === normalizedEndpoint && value.key) {
      return value.key;
    }
  }

  throw new Error(`No Appwrite API key found for endpoint "${normalizedEndpoint}".`);
}

export async function resolveConsoleCookie({ endpoint = 'https://cloud.appwrite.io/v1' } = {}) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const prefs = await loadAppwritePrefs();
  for (const value of Object.values(prefs || {})) {
    if (value && typeof value === 'object' && value.endpoint === normalizedEndpoint && value.cookie) {
      return value.cookie;
    }
  }
  throw new Error(`No Appwrite console cookie found for endpoint "${normalizedEndpoint}".`);
}

function buildHeaders({ headers = {}, projectId = DEFAULT_APPWRITE_PROJECT_ID, key } = {}) {
  return {
    'X-Appwrite-Project': projectId,
    ...(key ? { 'X-Appwrite-Key': key } : {}),
    ...headers,
  };
}

export async function appwriteJson(route, options = {}) {
  const {
    method = 'GET',
    body,
    endpoint = DEFAULT_APPWRITE_ENDPOINT,
    projectId = DEFAULT_APPWRITE_PROJECT_ID,
    key,
    headers = {},
    accept = 'application/json',
  } = options;

  const url = route.startsWith('http://') || route.startsWith('https://') ? route : `${normalizeEndpoint(endpoint)}${route}`;
  const requestHeaders = buildHeaders({ headers: { Accept: accept, ...headers }, projectId, key });
  const init = { method, headers: requestHeaders };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') && text ? JSON.parse(text) : text;

  if (!response.ok) {
    const message =
      typeof payload === 'string'
        ? payload
        : payload?.message || payload?.error || `Appwrite request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseExecutionPayload(execution) {
  const raw = execution?.responseBody ?? execution?.response ?? '';
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_error) {
    return raw;
  }
}

export async function waitForExecution({
  functionId,
  executionId,
  endpoint = DEFAULT_APPWRITE_ENDPOINT,
  projectId = DEFAULT_APPWRITE_PROJECT_ID,
  key,
  timeoutMs = 120000,
  pollMs = 1500,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const execution = await appwriteJson(`/functions/${functionId}/executions/${executionId}`, {
      endpoint,
      projectId,
      key,
    });
    if (execution.status === 'completed') {
      return execution;
    }
    if (execution.status === 'failed' || execution.status === 'canceled') {
      const error = new Error(`Function ${functionId} execution ${executionId} ended with status "${execution.status}".`);
      error.execution = execution;
      throw error;
    }
    await sleep(pollMs);
  }

  throw new Error(`Timed out waiting for Appwrite execution ${executionId}.`);
}

export async function executeFunction({
  functionId,
  routePath = '/',
  httpMethod = 'GET',
  body,
  headers = {},
  endpoint = DEFAULT_APPWRITE_ENDPOINT,
  projectId = DEFAULT_APPWRITE_PROJECT_ID,
  key,
  asyncExecution = false,
  timeoutMs = 120000,
  pollMs = 1500,
}) {
  const execution = await appwriteJson(`/functions/${functionId}/executions`, {
    method: 'POST',
    endpoint,
    projectId,
    key,
    body: {
      async: asyncExecution,
      path: routePath,
      method: httpMethod,
      body: body === undefined ? '' : JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
    },
  });

  if (!asyncExecution) {
    return {
      execution,
      payload: parseExecutionPayload(execution),
      statusCode: Number(execution.responseStatusCode || 0),
    };
  }

  const completed = await waitForExecution({
    functionId,
    executionId: execution.$id,
    endpoint,
    projectId,
    key,
    timeoutMs,
    pollMs,
  });

  return {
    execution: completed,
    payload: parseExecutionPayload(completed) ?? parseExecutionPayload(execution),
    statusCode: Number(completed.responseStatusCode || 0),
  };
}

function readSetCookie(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function toCookieHeader(cookies) {
  return cookies.map((value) => String(value).split(';')[0]).join('; ');
}

export async function createAnonymousSession({
  endpoint = DEFAULT_APPWRITE_ENDPOINT,
  projectId = DEFAULT_APPWRITE_PROJECT_ID,
} = {}) {
  const response = await fetch(`${normalizeEndpoint(endpoint)}/account/sessions/anonymous`, {
    method: 'POST',
    headers: {
      'X-Appwrite-Project': projectId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({}),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || `Anonymous session creation failed with ${response.status}.`);
  }

  const cookies = readSetCookie(response);
  const cookieHeader = toCookieHeader(cookies);
  if (!cookieHeader) {
    throw new Error('Anonymous session did not return a usable cookie.');
  }

  return {
    session: payload,
    cookies,
    cookieHeader,
  };
}

export async function createEmailSession({
  email,
  password,
  endpoint = DEFAULT_APPWRITE_ENDPOINT,
  projectId = DEFAULT_APPWRITE_PROJECT_ID,
} = {}) {
  const response = await fetch(`${normalizeEndpoint(endpoint)}/account/sessions/email`, {
    method: 'POST',
    headers: {
      'X-Appwrite-Project': projectId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || `Email session creation failed with ${response.status}.`);
  }

  const cookies = readSetCookie(response);
  const cookieHeader = toCookieHeader(cookies);
  if (!cookieHeader) {
    throw new Error('Email session did not return a usable cookie.');
  }

  return {
    session: payload,
    cookies,
    cookieHeader,
  };
}

async function appwriteSessionJson(route, { method = 'GET', body, cookieHeader, endpoint = DEFAULT_APPWRITE_ENDPOINT, projectId = DEFAULT_APPWRITE_PROJECT_ID } = {}) {
  const headers = {
    'X-Appwrite-Project': projectId,
    Accept: 'application/json',
    Cookie: cookieHeader,
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${normalizeEndpoint(endpoint)}${route}`, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || `Session request ${route} failed with ${response.status}.`);
  }
  return payload;
}

export async function getAccountWithCookie({ cookieHeader, endpoint = DEFAULT_APPWRITE_ENDPOINT, projectId = DEFAULT_APPWRITE_PROJECT_ID } = {}) {
  return appwriteSessionJson('/account', { cookieHeader, endpoint, projectId });
}

export async function createJwtWithCookie({ cookieHeader, endpoint = DEFAULT_APPWRITE_ENDPOINT, projectId = DEFAULT_APPWRITE_PROJECT_ID } = {}) {
  const payload = await appwriteSessionJson('/account/jwts', {
    method: 'POST',
    body: {},
    cookieHeader,
    endpoint,
    projectId,
  });
  return payload?.jwt || '';
}

export async function deleteCurrentSession({ cookieHeader, endpoint = DEFAULT_APPWRITE_ENDPOINT, projectId = DEFAULT_APPWRITE_PROJECT_ID } = {}) {
  return appwriteSessionJson('/account/sessions/current', {
    method: 'DELETE',
    cookieHeader,
    endpoint,
    projectId,
  });
}

export async function createAppwriteUser({
  userId,
  email,
  password,
  name = '',
  endpoint = DEFAULT_APPWRITE_ENDPOINT,
  projectId = DEFAULT_APPWRITE_PROJECT_ID,
  key,
}) {
  return appwriteJson('/users', {
    method: 'POST',
    endpoint,
    projectId,
    key,
    body: {
      userId,
      email,
      password,
      name,
    },
  });
}

export async function deleteAppwriteUser({
  userId,
  endpoint = DEFAULT_APPWRITE_ENDPOINT,
  projectId = DEFAULT_APPWRITE_PROJECT_ID,
  key,
}) {
  return appwriteJson(`/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    endpoint,
    projectId,
    key,
  });
}

export async function listFunctionVariables({
  functionId,
  endpoint = DEFAULT_APPWRITE_ENDPOINT,
  projectId = DEFAULT_APPWRITE_PROJECT_ID,
  key,
}) {
  const payload = await appwriteJson(`/functions/${functionId}/variables`, {
    endpoint,
    projectId,
    key,
  });
  return Array.isArray(payload?.variables) ? payload.variables : [];
}

export async function upsertFunctionVariable({
  functionId,
  variableId,
  key: variableKey,
  value,
  secret = true,
  endpoint = DEFAULT_APPWRITE_ENDPOINT,
  projectId = DEFAULT_APPWRITE_PROJECT_ID,
  adminKey,
}) {
  if (!variableKey) {
    throw new Error('Variable key is required.');
  }
  const method = variableId ? 'PUT' : 'POST';
  const route = variableId
    ? `/functions/${functionId}/variables/${variableId}`
    : `/functions/${functionId}/variables`;
  return appwriteJson(route, {
    method,
    endpoint,
    projectId,
    key: adminKey,
    body: {
      key: variableKey,
      value: String(value ?? ''),
      secret,
    },
  });
}

export async function deleteFunctionVariable({
  functionId,
  variableId,
  endpoint = DEFAULT_APPWRITE_ENDPOINT,
  projectId = DEFAULT_APPWRITE_PROJECT_ID,
  key,
}) {
  return appwriteJson(`/functions/${functionId}/variables/${variableId}`, {
    method: 'DELETE',
    endpoint,
    projectId,
    key,
  });
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(4)) : Number(sorted[middle].toFixed(4));
}

export async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}
