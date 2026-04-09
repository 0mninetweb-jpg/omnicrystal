import fs from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';

import {
  DEFAULT_APPWRITE_ENDPOINT,
  DEFAULT_APPWRITE_PROJECT_ID,
  DEFAULT_APPWRITE_SITE_URL,
  deleteFunctionVariable,
  listFunctionVariables,
  resolveProjectKey,
  upsertFunctionVariable,
} from './lib/appwrite-admin.mjs';

const argv = process.argv.slice(2);

function readFlag(name) {
  return argv.includes(`--${name}`);
}

function readOption(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const rootDir = path.resolve('.');
const endpoint = (readOption('endpoint', process.env.APPWRITE_ENDPOINT || DEFAULT_APPWRITE_ENDPOINT) || DEFAULT_APPWRITE_ENDPOINT).replace(/\/$/, '');
const projectId = readOption('project', process.env.APPWRITE_PROJECT_ID || DEFAULT_APPWRITE_PROJECT_ID) || DEFAULT_APPWRITE_PROJECT_ID;
const databaseId = readOption('database', process.env.APPWRITE_DATABASE_ID || 'crystal') || 'crystal';
const envPath = path.resolve(rootDir, readOption('env-file', 'functions/.env.omnicrystal'));
const dryRun = readFlag('dry-run');
const functionIds = (readOption('functions', 'api,jobs') || 'api,jobs')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const siteUrl = readOption('site-url', process.env.CRYSTAL_SITE_URL || DEFAULT_APPWRITE_SITE_URL) || DEFAULT_APPWRITE_SITE_URL;

const UPSERT_KEYS = [
  'APPWRITE_ENDPOINT',
  'APPWRITE_PROJECT_ID',
  'APPWRITE_DATABASE_ID',
  'APPWRITE_API_KEY',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_CLOUD_PROJECT',
  'CRYSTAL_CORE_REGION',
  'CRYSTAL_CORE_EVAL_JOB_NAME',
  'LLM_PROVIDER',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL_QUERY',
  'LLM_MODEL_FORECAST',
  'LLM_MODEL_CHAT',
  'LLM_MODEL_COPY',
  'OPENROUTER_SITE_URL',
  'OPENROUTER_APP_TITLE',
  'BILLING_TEST_MODE',
  'SPORTS_PROVIDER',
  'SPORTS_PROVIDER_BASE_URL',
  'SPORTS_RELEASE_MODE',
  'SPORTS_SEMANTIC_OVERLAY_MODE',
  'THE_SPORTS_DB_API_KEY',
  'API_FOOTBALL_KEY',
  'FRED_API_KEY',
  'NOMINATIM_BASE_URL',
  'OVERPASS_BASE_URL',
  'WORLD_BANK_BASE_URL',
  'EUROSTAT_BASE_URL',
  'OECD_BASE_URL',
  'OPENSKY_BASE_URL',
  'OPENSKY_USERNAME',
  'OPENSKY_PASSWORD',
  'OPENAQ_API_KEY',
  'OPENAQ_BASE_URL',
  'EIA_API_KEY',
  'EIA_BASE_URL',
  'GTFS_STATIC_FEEDS_JSON',
  'GTFS_REALTIME_FEEDS_JSON',
];

const DELETE_KEYS = [
  'CRYSTAL_CORE_BASE_URL',
  'CRYSTAL_CORE_INVOKER_AUDIENCE',
  'MIROFISH_BASE_URL',
  'MIROFISH_API_KEY',
  'WORLDSIM_BASE_URL',
  'WORLDSIM_API_KEY',
];

const SECRET_KEYS = new Set([
  'APPWRITE_API_KEY',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'LLM_API_KEY',
  'THE_SPORTS_DB_API_KEY',
  'API_FOOTBALL_KEY',
  'FRED_API_KEY',
  'OPENSKY_USERNAME',
  'OPENSKY_PASSWORD',
  'OPENAQ_API_KEY',
  'EIA_API_KEY',
]);

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return dotenv.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function resolveSourceValue(envMap, key, adminKey) {
  if (key === 'APPWRITE_ENDPOINT') return endpoint;
  if (key === 'APPWRITE_PROJECT_ID') return projectId;
  if (key === 'APPWRITE_DATABASE_ID') return databaseId;
  if (key === 'APPWRITE_API_KEY') return adminKey;
  if (key === 'OPENROUTER_SITE_URL') return siteUrl;
  if (key === 'OPENROUTER_APP_TITLE') return envMap.OPENROUTER_APP_TITLE || 'Crystal';
  if (key === 'BILLING_TEST_MODE') return envMap.BILLING_TEST_MODE || 'false';
  return envMap[key];
}

async function syncFunction(functionId, adminKey, envMap) {
  const existing = await listFunctionVariables({
    functionId,
    endpoint,
    projectId,
    key: adminKey,
  });
  const byKey = new Map(existing.map((entry) => [entry.key, entry]));
  const summary = {
    functionId,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
  };

  for (const key of DELETE_KEYS) {
    const variable = byKey.get(key);
    if (!variable) continue;
    if (dryRun) {
      console.log(`[dry-run] delete ${functionId}:${key}`);
      summary.deleted += 1;
      continue;
    }
    await deleteFunctionVariable({
      functionId,
      variableId: variable.$id,
      endpoint,
      projectId,
      key: adminKey,
    });
    console.log(`[sync] deleted ${functionId}:${key}`);
    summary.deleted += 1;
  }

  for (const key of UPSERT_KEYS) {
    const value = resolveSourceValue(envMap, key, adminKey);
    if (value === undefined) {
      summary.skipped += 1;
      continue;
    }
    const existingVariable = byKey.get(key);
    if (dryRun) {
      console.log(`[dry-run] ${existingVariable ? 'update' : 'create'} ${functionId}:${key}`);
      if (existingVariable) {
        summary.updated += 1;
      } else {
        summary.created += 1;
      }
      continue;
    }
    await upsertFunctionVariable({
      functionId,
      variableId: existingVariable?.$id,
      key,
      value,
      secret: SECRET_KEYS.has(key),
      endpoint,
      projectId,
      adminKey,
    });
    console.log(`[sync] ${existingVariable ? 'updated' : 'created'} ${functionId}:${key}`);
    if (existingVariable) {
      summary.updated += 1;
    } else {
      summary.created += 1;
    }
  }

  return summary;
}

async function main() {
  const adminKey = await resolveProjectKey({ endpoint });
  const envMap = await loadEnvFile(envPath);
  console.log(`Syncing Appwrite env from ${envPath}`);
  console.log(`Functions: ${functionIds.join(', ')}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);

  const results = [];
  for (const functionId of functionIds) {
    results.push(await syncFunction(functionId, adminKey, envMap));
  }

  for (const result of results) {
    console.log(
      `[summary] ${result.functionId}: created=${result.created} updated=${result.updated} deleted=${result.deleted} skipped=${result.skipped}`
    );
  }
}

await main();
