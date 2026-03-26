import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require(path.resolve(process.cwd(), "functions", "node_modules", "firebase-admin"));

const DEFAULT_PROJECT_ID = "omnicrystal";
const DEFAULT_FIXTURE_PATH = path.resolve(process.cwd(), "scripts", "fixtures", "policy-markets-resolution-backfill.json");
const REQUIRED_MINIMUM = 30;
const FIRESTORE_BATCH_SIZE = 100;

function parseArgs(argv = []) {
  const options = {
    projectId: DEFAULT_PROJECT_ID,
    fixturePath: DEFAULT_FIXTURE_PATH,
    dryRun: false,
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
    if (item === "--fixture" && argv[index + 1]) {
      options.fixturePath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
    }
  }

  return options;
}

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampProbability(value, fallback = 0.58) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0.01, Math.min(0.99, numeric));
}

function buildResolutionRecord(domainId, tuple = []) {
  const [slug, queryText, predictedLabel, predictedProbability, actualOutcome, observedOutcome, cardState, resolvedAt] = tuple;
  const resolutionId = `backfill_${safeText(slug, "missing_slug")}`;
  const predicted = clampProbability(predictedProbability, 0.58);
  const rawProbability = Math.max(0.01, Math.min(0.99, predicted - 0.02));

  return {
    resolution_id: resolutionId,
    query_text: safeText(queryText, resolutionId),
    domain_id: safeText(domainId),
    predicted_label: safeText(predictedLabel),
    predicted_probability: Number(predicted.toFixed(4)),
    raw_probability: Number(rawProbability.toFixed(4)),
    actual_outcome: Number(actualOutcome) === 1 ? 1 : 0,
    observed_outcome: safeText(observedOutcome),
    card_state: safeText(cardState, "limited"),
    runtime_transport: "backfill_seed",
    resolution_source: "curated_backfill",
    resolution_target: {
      target_type: "binary_outcome",
    },
    scored: true,
    backfill_seed: true,
    resolved_at: safeText(resolvedAt),
    updated_at: safeText(resolvedAt),
  };
}

function getGcloudExecutable() {
  for (const candidate of ["gcloud.cmd", "gcloud.exe", "gcloud"]) {
    try {
      const resolved = execFileSync("where", [candidate], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find(Boolean);
      if (resolved) return resolved;
    } catch (_error) {
      continue;
    }
  }
  throw new Error("gcloud not found; cannot fall back to Firestore REST writes.");
}

function getAccessTokenFromGcloud() {
  const gcloud = getGcloudExecutable();
  const command = /\.cmd$/i.test(gcloud) ? "cmd.exe" : gcloud;
  const args = /\.cmd$/i.test(gcloud) ? ["/c", gcloud, "auth", "print-access-token"] : ["auth", "print-access-token"];
  const token = execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .trim();
  if (!token) {
    throw new Error("Failed to obtain gcloud access token for Firestore REST backfill.");
  }
  return token;
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && value.includes("T");
}

function encodeFirestoreValue(value, fieldName = "") {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (typeof value === "string") {
    if (fieldName.endsWith("_at") && isIsoTimestamp(value)) {
      return { timestampValue: new Date(value).toISOString() };
    }
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
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

function buildFirestoreDocumentName(projectId, collectionId, documentId) {
  return `projects/${projectId}/databases/(default)/documents/${collectionId}/${documentId}`;
}

async function writeRecordsWithFirestoreRest(projectId, records = []) {
  const token = getAccessTokenFromGcloud();
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const nowIso = new Date().toISOString();

  for (let index = 0; index < records.length; index += FIRESTORE_BATCH_SIZE) {
    const chunk = records.slice(index, index + FIRESTORE_BATCH_SIZE);
    const writes = chunk.map((record) => {
      const payload = {
        ...record,
        created_at: record.resolved_at || nowIso,
        updated_at: nowIso,
        resolved_at: record.resolved_at || nowIso,
      };
      return {
        update: {
          name: buildFirestoreDocumentName(projectId, "forecast_resolutions", record.resolution_id),
          fields: Object.fromEntries(
            Object.entries(payload)
              .filter(([, value]) => value !== undefined)
              .map(([key, value]) => [key, encodeFirestoreValue(value, key)])
          ),
        },
      };
    });

    const response = await fetch(commitUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ writes }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Firestore REST backfill failed (${response.status}): ${body}`);
    }
  }
}

async function writeRecordsWithAdmin(projectId, records = []) {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId,
    });
  }

  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  for (let index = 0; index < records.length; index += FIRESTORE_BATCH_SIZE) {
    const batch = db.batch();
    const chunk = records.slice(index, index + FIRESTORE_BATCH_SIZE);
    for (const record of chunk) {
      batch.set(
        db.collection("forecast_resolutions").doc(record.resolution_id),
        {
          ...record,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          resolved_at: record.resolved_at ? new Date(record.resolved_at) : admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const fixture = JSON.parse(await fs.readFile(options.fixturePath, "utf8"));
  const domains = fixture?.domains && typeof fixture.domains === "object" ? fixture.domains : {};
  const domainEntries = Object.entries(domains);

  for (const [domainId, tuples] of domainEntries) {
    const count = Array.isArray(tuples) ? tuples.length : 0;
    if (count < REQUIRED_MINIMUM) {
      throw new Error(`Fixture must contain at least ${REQUIRED_MINIMUM} entries for ${domainId}; found ${count}.`);
    }
  }

  const records = domainEntries.flatMap(([domainId, tuples]) =>
    (Array.isArray(tuples) ? tuples : []).map((tuple) => buildResolutionRecord(domainId, tuple))
  );

  if (options.dryRun) {
    const byDomain = Object.fromEntries(
      domainEntries.map(([domainId, tuples]) => [domainId, Array.isArray(tuples) ? tuples.length : 0])
    );
    console.log(JSON.stringify({ dry_run: true, project_id: options.projectId, total_records: records.length, by_domain: byDomain }, null, 2));
    return;
  }

  let writeMode = "firebase_admin";
  try {
    await writeRecordsWithAdmin(options.projectId, records);
  } catch (error) {
    if (!/default credentials/i.test(String(error?.message || ""))) {
      throw error;
    }
    writeMode = "firestore_rest";
    await writeRecordsWithFirestoreRest(options.projectId, records);
  }

  const byDomain = Object.fromEntries(
    domainEntries.map(([domainId, tuples]) => [domainId, Array.isArray(tuples) ? tuples.length : 0])
  );
  console.log(JSON.stringify({ dry_run: false, project_id: options.projectId, total_records: records.length, by_domain: byDomain, write_mode: writeMode }, null, 2));
}

await main();
