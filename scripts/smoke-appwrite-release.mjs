import {
  Client,
  Functions,
  Query,
} from 'node-appwrite';

import {
  DEFAULT_APPWRITE_ENDPOINT,
  DEFAULT_APPWRITE_PROJECT_ID,
  appwriteJson,
  createAnonymousSession,
  createJwtWithCookie,
  executeFunction,
  resolveProjectKey,
} from './lib/appwrite-admin.mjs';

const argv = process.argv.slice(2);

function readOption(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parsePayload(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (_error) {
    return value;
  }
}

async function resolveDeploymentDomain({ endpoint, projectId, key, siteId, deploymentId }) {
  const payload = await appwriteJson('/proxy/rules', { endpoint, projectId, key });
  const rules = Array.isArray(payload?.rules) ? payload.rules : [];
  const rule = rules.find(
    (entry) =>
      entry.deploymentResourceType === 'site' &&
      entry.deploymentResourceId === siteId &&
      (!deploymentId || entry.deploymentId === deploymentId) &&
      entry.status === 'verified'
  );
  assert(rule?.domain, `No verified Appwrite domain found for site "${siteId}" deployment "${deploymentId}".`);
  return `https://${rule.domain}`;
}

async function resolveActiveSiteDeploymentId({ endpoint, projectId, key, siteId }) {
  const site = await appwriteJson(`/sites/${siteId}`, { endpoint, projectId, key });
  return site?.deploymentId || site?.latestDeploymentId || '';
}

async function appwriteApi(route, { method = 'GET', body, headers = {}, endpoint, projectId, key, functionId }) {
  const result = await executeFunction({
    functionId,
    routePath: route,
    httpMethod: method,
    body,
    headers: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])),
    endpoint,
    projectId,
    key,
    timeoutMs: 180000,
  });
  return {
    status: result.statusCode,
    payload: result.payload,
    execution: result.execution,
  };
}

async function listRecentApiExecutions({ endpoint, projectId, key, functionId }) {
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(key);
  const functions = new Functions(client);
  const payload = await functions.listExecutions({
    functionId,
    queries: [Query.orderDesc('$createdAt'), Query.limit(25)],
  });
  return Array.isArray(payload?.executions) ? payload.executions : [];
}

const endpoint = (readOption('endpoint', process.env.APPWRITE_ENDPOINT || DEFAULT_APPWRITE_ENDPOINT) || DEFAULT_APPWRITE_ENDPOINT).replace(/\/$/, '');
const projectId = readOption('project', process.env.APPWRITE_PROJECT_ID || DEFAULT_APPWRITE_PROJECT_ID) || DEFAULT_APPWRITE_PROJECT_ID;
const functionId = readOption('function', 'api') || 'api';
const siteId = readOption('site', 'crystal-web') || 'crystal-web';
const siteDeploymentId = readOption('deployment', '');
const key = await resolveProjectKey({ endpoint });
const activeSiteDeploymentId =
  siteDeploymentId || (await resolveActiveSiteDeploymentId({ endpoint, projectId, key, siteId }));

const siteUrl = await resolveDeploymentDomain({ endpoint, projectId, key, siteId, deploymentId: activeSiteDeploymentId });
const forecastResponse = await fetch(`${siteUrl}/forecast`, { headers: { 'cache-control': 'no-cache' } });
const forecastHtml = await forecastResponse.text();
const bundle = forecastHtml.match(/assets\/index-[^"']+\.js/u)?.[0] || '';
assert(forecastResponse.ok, `Site /forecast returned ${forecastResponse.status}.`);
assert(bundle, 'Site /forecast did not include a built index bundle.');

const anonymous = await createAnonymousSession({ endpoint, projectId });
const jwt = await createJwtWithCookie({ cookieHeader: anonymous.cookieHeader, endpoint, projectId });
assert(jwt, 'Anonymous session did not return a JWT.');

const authHeaders = {
  authorization: `Bearer ${jwt}`,
  'content-type': 'application/json',
};

const health = await appwriteApi('/health', { method: 'GET', endpoint, projectId, key, functionId });
assert(health.status === 200, `/health returned ${health.status}.`);
assert(health.payload?.backend === 'appwrite-api', '/health did not report backend=appwrite-api.');
assert(health.payload?.runtime?.legacy_proxy?.crystal_core_base_url === false, '/health still reports CRYSTAL_CORE_BASE_URL proxy enabled.');
assert(health.payload?.runtime?.legacy_proxy?.mirofish_base_url === false, '/health still reports MIROFISH_BASE_URL proxy enabled.');
assert(health.payload?.runtime?.rollout?.source === 'appwrite.system_config/runtime_rollout', '/health did not report Appwrite rollout config as the active source.');

const ownUserRead = await appwriteApi('/data/document/get', {
  method: 'POST',
  body: { path: ['users', anonymous.session.userId] },
  headers: authHeaders,
  endpoint,
  projectId,
  key,
  functionId,
});
assert(ownUserRead.status === 200, `Own user data read returned ${ownUserRead.status}.`);

const otherUserRead = await appwriteApi('/data/document/get', {
  method: 'POST',
  body: { path: ['users', `${anonymous.session.userId}_other`] },
  headers: authHeaders,
  endpoint,
  projectId,
  key,
  functionId,
});
assert(otherUserRead.status === 403, `Other user data read returned ${otherUserRead.status}; expected 403.`);

const publicCompile = await appwriteApi('/public/compile-query', {
  method: 'POST',
  body: { query: 'Will Apple stock rise in the next 30 days?' },
  headers: { 'content-type': 'application/json' },
  endpoint,
  projectId,
  key,
  functionId,
});
assert(publicCompile.status === 200, `Public compile returned ${publicCompile.status}.`);

const privateCompile = await appwriteApi('/compile-query', {
  method: 'POST',
  body: { query: 'Will Apple stock rise in the next 30 days?' },
  headers: authHeaders,
  endpoint,
  projectId,
  key,
  functionId,
});
assert(privateCompile.status === 200, `Private compile returned ${privateCompile.status}.`);

const publicPredict = await appwriteApi('/public/predict', {
  method: 'POST',
  body: {
    query: 'Will Apple stock rise in the next 30 days?',
    queryPlan: parsePayload(publicCompile.payload)?.query_plan || publicCompile.payload?.query_plan || null,
  },
  headers: { 'content-type': 'application/json' },
  endpoint,
  projectId,
  key,
  functionId,
});
assert(publicPredict.status === 200, `Public predict returned ${publicPredict.status}.`);

const recentExecutions = await listRecentApiExecutions({ endpoint, projectId, key, functionId });
const recentDataGetFailures = recentExecutions.filter(
  (execution) => execution.requestPath === '/data/document/get' && Number(execution.responseStatusCode) >= 500
);
assert(
  recentDataGetFailures.length === 0,
  `Found ${recentDataGetFailures.length} recent 5xx executions on /data/document/get.`
);

console.log(
  JSON.stringify(
    {
      ok: true,
      siteUrl,
      bundle,
      functionId,
      siteDeploymentId: activeSiteDeploymentId || null,
      health: health.status,
      ownUserRead: ownUserRead.status,
      otherUserRead: otherUserRead.status,
      publicCompile: publicCompile.status,
      privateCompile: privateCompile.status,
      publicPredict: publicPredict.status,
      recentDataGet5xx: recentDataGetFailures.length,
    },
    null,
    2
  )
);
