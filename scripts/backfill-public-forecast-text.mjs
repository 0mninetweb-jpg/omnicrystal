import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  sanitizePublishedArtifactFields,
  containsCorruptedPublishedText,
} = require(path.resolve(process.cwd(), "functions", "publicForecastText.js"));

const DEFAULT_PROJECT_ID = "omnicrystal";
const PAGE_SIZE = 200;

function parseArgs(argv = []) {
  const options = {
    projectId: DEFAULT_PROJECT_ID,
    dryRun: false,
    limit: 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (item === "--projectId" && argv[index + 1]) {
      options.projectId = argv[index + 1];
      index += 1;
      continue;
    }
    if (item === "--limit" && argv[index + 1]) {
      options.limit = Math.max(0, Number(argv[index + 1]) || 0);
      index += 1;
    }
  }

  return options;
}

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function slugifyText(value, fallback = "forecast") {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function getGcloudExecutable() {
  for (const candidate of ["gcloud.cmd", "gcloud.exe", "gcloud"]) {
    try {
      const resolved = execFileSync("cmd.exe", ["/c", "where", candidate], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find(Boolean);
      if (resolved) return resolved;
    } catch (_error) {
      continue;
    }
  }
  throw new Error("gcloud not found; cannot run Firestore REST scan/backfill.");
}

function getAccessTokenFromGcloud() {
  const gcloud = getGcloudExecutable();
  const token = execFileSync("cmd.exe", ["/c", gcloud, "auth", "print-access-token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!token) {
    throw new Error("Failed to obtain gcloud access token.");
  }
  return token;
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (Object.prototype.hasOwnProperty.call(value, "arrayValue")) {
    return Array.isArray(value.arrayValue?.values) ? value.arrayValue.values.map((item) => decodeFirestoreValue(item)) : [];
  }
  if (Object.prototype.hasOwnProperty.call(value, "mapValue")) {
    const fields = value.mapValue?.fields || {};
    return Object.fromEntries(Object.entries(fields).map(([key, nestedValue]) => [key, decodeFirestoreValue(nestedValue)]));
  }
  return null;
}

function decodeFirestoreDocument(document = {}) {
  const fields = document.fields || {};
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

function encodeFirestoreValue(value, fieldName = "") {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (typeof value === "string") {
    if ((fieldName.endsWith("_at") || fieldName === "updatedAt") && value.includes("T")) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return { timestampValue: parsed.toISOString() };
      }
    }
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => encodeFirestoreValue(item)),
      },
    };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value)
            .filter(([, nestedValue]) => nestedValue !== undefined)
            .map(([key, nestedValue]) => [key, encodeFirestoreValue(nestedValue, key)])
        ),
      },
    };
  }
  return { stringValue: String(value) };
}

function buildDocumentName(projectId, documentPath) {
  return `projects/${projectId}/databases/(default)/documents/${documentPath}`;
}

async function firestoreFetchJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firestore request failed (${response.status}): ${body}`);
  }
  return response.json();
}

async function listCollectionDocuments(projectId, collectionPath, token, limit = 0) {
  const documents = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}?${params.toString()}`;
    const payload = await firestoreFetchJson(url, token);
    const nextDocs = Array.isArray(payload.documents) ? payload.documents : [];
    documents.push(...nextDocs);
    pageToken = safeText(payload.nextPageToken);
    if (limit > 0 && documents.length >= limit) {
      return documents.slice(0, limit);
    }
  } while (pageToken);

  return documents;
}

async function documentExists(projectId, documentPath, token) {
  const url = `https://firestore.googleapis.com/v1/${buildDocumentName(projectId, documentPath)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firestore exists check failed (${response.status}): ${body}`);
  }
  return true;
}

async function patchDocument(projectId, documentPath, updates, token) {
  const mask = new URLSearchParams();
  Object.keys(updates).forEach((fieldPath) => mask.append("updateMask.fieldPaths", fieldPath));
  const url = `https://firestore.googleapis.com/v1/${buildDocumentName(projectId, documentPath)}?${mask.toString()}`;
  const fields = Object.fromEntries(
    Object.entries(updates).map(([key, value]) => [key, encodeFirestoreValue(value, key)])
  );
  await firestoreFetchJson(url, token, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

function buildSanitizedFieldPatch(data = {}) {
  const { sanitized, changed, changedFields } = sanitizePublishedArtifactFields(data);
  if (!changed) {
    return { changed: false, patch: {}, changedFields: [] };
  }

  const patch = {};
  for (const field of changedFields) {
    patch[field] = sanitized[field];
  }

  if (Object.prototype.hasOwnProperty.call(patch, "topic_label")) {
    patch.topic_slug = slugifyText(sanitized.topic_label, safeText(data.topic_slug, "forecast"));
  }
  if (Object.prototype.hasOwnProperty.call(patch, "entity_label") || containsCorruptedPublishedText(data.entity_slug)) {
    patch.entity_slug = slugifyText(sanitized.entity_label || data.entity_label, safeText(data.entity_slug, "general"));
  }
  if (Object.prototype.hasOwnProperty.call(patch, "geography_label") || containsCorruptedPublishedText(data.geography_slug)) {
    patch.geography_slug = slugifyText(sanitized.geography_label || data.geography_label, safeText(data.geography_slug, "auto"));
  }
  if (Object.prototype.hasOwnProperty.call(patch, "domain_label") && !patch.topic_label) {
    patch.topic_label = sanitized.domain_label;
    patch.topic_slug = slugifyText(sanitized.domain_label, safeText(data.topic_slug, "forecast"));
  }

  patch.updatedAt = new Date().toISOString();
  return { changed: true, patch, changedFields };
}

function deriveRelatedPaths(publicDocId, data = {}) {
  const lineageId = safeText(data.lineage_id, safeText(data.ledger_ref).replace(/^forecast_ledger\//, ""));
  const versionId = safeText(data.card_id);

  return {
    publicPath: `public_forecasts/${publicDocId}`,
    ledgerPath: lineageId ? `forecast_ledger/${lineageId}` : "",
    versionPath: lineageId && versionId ? `forecast_ledger/${lineageId}/versions/${versionId}` : "",
    lineageId,
    versionId,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = getAccessTokenFromGcloud();
  const publicDocs = await listCollectionDocuments(options.projectId, "public_forecasts", token, options.limit);

  const candidates = publicDocs
    .map((document) => {
      const data = decodeFirestoreDocument(document);
      const publicDocId = safeText(document.name).split("/").pop();
      const { changed, patch, changedFields } = buildSanitizedFieldPatch(data);
      if (!changed) return null;
      return {
        publicDocId,
        changedFields,
        patch,
        data,
        relatedPaths: deriveRelatedPaths(publicDocId, data),
      };
    })
    .filter(Boolean);

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          project_id: options.projectId,
          scanned_public_docs: publicDocs.length,
          corrupted_public_docs: candidates.length,
          docs: candidates.slice(0, 25).map((item) => ({
            public_doc_id: item.publicDocId,
            lineage_id: item.relatedPaths.lineageId,
            version_id: item.relatedPaths.versionId,
            changed_fields: item.changedFields,
            preview_patch: item.patch,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  let updatedPublicDocs = 0;
  let updatedLedgerDocs = 0;
  let updatedVersionDocs = 0;

  for (const candidate of candidates) {
    await patchDocument(options.projectId, candidate.relatedPaths.publicPath, candidate.patch, token);
    updatedPublicDocs += 1;

    if (candidate.relatedPaths.ledgerPath) {
      await patchDocument(options.projectId, candidate.relatedPaths.ledgerPath, candidate.patch, token);
      updatedLedgerDocs += 1;
    }

    if (candidate.relatedPaths.versionPath && (await documentExists(options.projectId, candidate.relatedPaths.versionPath, token))) {
      await patchDocument(options.projectId, candidate.relatedPaths.versionPath, candidate.patch, token);
      updatedVersionDocs += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        dry_run: false,
        project_id: options.projectId,
        scanned_public_docs: publicDocs.length,
        corrupted_public_docs: candidates.length,
        updated_public_docs: updatedPublicDocs,
        updated_ledger_docs: updatedLedgerDocs,
        updated_version_docs: updatedVersionDocs,
      },
      null,
      2
    )
  );
}

await main();
