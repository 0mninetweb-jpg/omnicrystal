import {
  DEFAULT_APPWRITE_ENDPOINT,
  DEFAULT_APPWRITE_PROJECT_ID,
  executeFunction,
  resolveProjectKey,
} from './lib/appwrite-admin.mjs';

const argv = process.argv.slice(2);

function readOption(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const endpoint = (readOption('endpoint', process.env.APPWRITE_ENDPOINT || DEFAULT_APPWRITE_ENDPOINT) || DEFAULT_APPWRITE_ENDPOINT).replace(/\/$/, '');
const projectId = readOption('project', process.env.APPWRITE_PROJECT_ID || DEFAULT_APPWRITE_PROJECT_ID) || DEFAULT_APPWRITE_PROJECT_ID;
const functionId = readOption('function', process.env.APPWRITE_API_FUNCTION_ID || 'api') || 'api';
const key = await resolveProjectKey({ endpoint });

const result = await executeFunction({
  functionId,
  routePath: '/health',
  httpMethod: 'GET',
  endpoint,
  projectId,
  key,
  timeoutMs: 120000,
});

const payload = result.payload || {};

console.log(
  JSON.stringify(
    {
      ok: payload?.ok === true,
      backend: payload?.backend || '',
      runtime: payload?.runtime || {},
      worldsim: payload?.worldsim || {},
      crystalCore: {
        ...(payload?.runtime || {}),
        base_url: payload?.backend === 'appwrite-api' ? 'appwrite:function/api' : '',
      },
    },
    null,
    2
  )
);
