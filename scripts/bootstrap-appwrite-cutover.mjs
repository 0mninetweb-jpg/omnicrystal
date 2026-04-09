import fs from 'node:fs/promises';
import path from 'node:path';
import { Client, TablesDB } from 'node-appwrite';
import {
  buildRowData,
  listBootstrapTables,
  resolveDocumentTarget,
} from '../appwrite-functions/api/data-model.mjs';

const rootDir = path.resolve('.');
const keyPath = path.resolve(rootDir, '..', 'tmp_appwrite_migration', 'appwrite-bootstrap-key-full.json');
const snapshotDir = path.join(rootDir, 'tmp', 'firebase-export-2026-04-08-full', 'firestore');
const endpoint = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID || 'crystal';
const databaseId = process.env.APPWRITE_DATABASE_ID || 'crystal';
const UPSERT_BATCH_SIZE = Number(process.env.APPWRITE_IMPORT_BATCH_SIZE || 50);

const tableColumns = [
  { key: 'user_id', type: 'string', size: 128, required: false, array: false },
  { key: 'parent_id', type: 'string', size: 128, required: false, array: false },
  { key: 'source_id', type: 'string', size: 191, required: false, array: false },
  { key: 'path_key', type: 'text', required: true, array: false },
  { key: 'collection_key', type: 'string', size: 128, required: true, array: false },
  { key: 'slug', type: 'string', size: 256, required: false, array: false },
  { key: 'domain', type: 'string', size: 128, required: false, array: false },
  { key: 'city', type: 'string', size: 128, required: false, array: false },
  { key: 'query_text', type: 'text', required: false, array: false },
  { key: 'status', type: 'string', size: 64, required: false, array: false },
  { key: 'sort_at', type: 'datetime', required: false, array: false },
  { key: 'ttl_at', type: 'datetime', required: false, array: false },
  { key: 'payload_json', type: 'longtext', required: true, array: false },
];

const CREATE_COLUMN_BY_TYPE = {
  string: async (tables, tableId, column) =>
    tables.createStringColumn({
      databaseId,
      tableId,
      key: column.key,
      size: column.size,
      required: column.required,
      array: column.array,
    }),
  text: async (tables, tableId, column) =>
    tables.createTextColumn({
      databaseId,
      tableId,
      key: column.key,
      required: column.required,
      array: column.array,
    }),
  longtext: async (tables, tableId, column) =>
    tables.createLongtextColumn({
      databaseId,
      tableId,
      key: column.key,
      required: column.required,
      array: column.array,
    }),
  datetime: async (tables, tableId, column) =>
    tables.createDatetimeColumn({
      databaseId,
      tableId,
      key: column.key,
      required: column.required,
      array: column.array,
    }),
};

async function loadApiKey() {
  const buffer = await fs.readFile(keyPath);
  const utf8 = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const raw = utf8.includes('"secret"')
    ? JSON.parse(utf8)
    : JSON.parse(buffer.toString('utf16le').replace(/^\uFEFF/, ''));
  return raw.secret || raw.key || raw.value;
}

function createTablesClient(key) {
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(key);
  return new TablesDB(client);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDatabase(tables) {
  const list = await tables.list();
  if (!list.databases.some((database) => database.$id === databaseId)) {
    if (list.databases.length === 1 && list.databases[0].$id === 'default') {
      await tables.delete({ databaseId: 'default' });
    }
    await tables.create({ databaseId, name: 'Crystal', enabled: true });
  }
}

async function ensureTable(tables, tableId) {
  try {
    await tables.getTable({ databaseId, tableId });
  } catch (error) {
    if (error?.code !== 404) {
      throw error;
    }

    try {
      await tables.createTable({
        databaseId,
        tableId,
        name: tableId,
        rowSecurity: false,
        enabled: true,
      });
    } catch (createError) {
      if (createError?.code !== 409) {
        throw createError;
      }
    }
  }

  await ensureColumns(tables, tableId);
}

async function ensureColumns(tables, tableId) {
  const existingColumns = await tables.listColumns({ databaseId, tableId });
  const byKey = new Map(existingColumns.columns.map((column) => [column.key, column]));

  for (const column of tableColumns) {
    if (byKey.has(column.key)) continue;
    const createColumn = CREATE_COLUMN_BY_TYPE[column.type];
    if (!createColumn) {
      throw new Error(`Unsupported column type "${column.type}" for ${tableId}.${column.key}`);
    }
    await createColumn(tables, tableId, column);
  }

  await waitForColumnsReady(tables, tableId, tableColumns.map((column) => column.key));
}

async function waitForColumnsReady(tables, tableId, requiredKeys) {
  const deadline = Date.now() + 5 * 60 * 1000;

  while (Date.now() < deadline) {
    const response = await tables.listColumns({ databaseId, tableId });
    const byKey = new Map(response.columns.map((column) => [column.key, column]));
    let ready = true;

    for (const key of requiredKeys) {
      const column = byKey.get(key);
      if (!column) {
        ready = false;
        break;
      }
      if (column.status === 'failed' || column.status === 'stuck') {
        throw new Error(`Column ${tableId}.${key} failed to become available: ${column.error || column.status}`);
      }
      if (column.status !== 'available') {
        ready = false;
      }
    }

    if (ready) return;
    await sleep(1500);
  }

  throw new Error(`Timed out waiting for columns on table "${tableId}" to become available.`);
}

function collectRows(pathSegments, documents, rowsByTable) {
  for (const document of documents || []) {
    const currentPath = [...pathSegments, document.id];
    const target = resolveDocumentTarget(currentPath);
    if (target) {
      const rows = rowsByTable.get(target.tableId) || [];
      rows.push({
        $id: target.rowId,
        ...buildRowData(target, document.data || {}),
      });
      rowsByTable.set(target.tableId, rows);
    }
    for (const [subcollectionId, subcollection] of Object.entries(document.subcollections || {})) {
      collectRows([...currentPath, subcollectionId], subcollection.documents || [], rowsByTable);
    }
  }
}

async function upsertTableRows(tables, tableId, rows) {
  if (!rows.length) return;
  await ensureTable(tables, tableId);

  for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
    await tables.upsertRows({
      databaseId,
      tableId,
      rows: batch,
    });
  }
}

async function main() {
  const key = await loadApiKey();
  const tables = createTablesClient(key);

  await ensureDatabase(tables);
  for (const tableId of listBootstrapTables()) {
    await ensureTable(tables, tableId);
  }

  const files = await fs.readdir(snapshotDir);
  for (const fileName of files.filter((entry) => entry.endsWith('.json'))) {
    const collection = JSON.parse(await fs.readFile(path.join(snapshotDir, fileName), 'utf8'));
    const rowsByTable = new Map();
    collectRows([collection.id], collection.documents || [], rowsByTable);
    console.log(`[bootstrap] ${collection.id}: ${collection.documents?.length || 0} top-level docs, ${rowsByTable.size} target tables`);
    for (const [tableId, rows] of rowsByTable.entries()) {
      console.log(`[bootstrap] upserting ${rows.length} rows into ${tableId}`);
      await upsertTableRows(tables, tableId, rows);
    }
  }

  console.log(`Appwrite bootstrap complete for database "${databaseId}".`);
}

await main();
