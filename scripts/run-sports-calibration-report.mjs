import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PROJECT_ID = "omnicrystal";
const DEFAULT_REGION = "europe-west1";
const DEFAULT_JOB_NAME = "crystal-core-eval";
const ACTIVE_SAMPLE_SIZE = 30;

function parseArgs(argv = []) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const options = {
    projectId: DEFAULT_PROJECT_ID,
    region: DEFAULT_REGION,
    jobName: process.env.CRYSTAL_CORE_EVAL_JOB_NAME || DEFAULT_JOB_NAME,
    lookbackDays: 30,
    backfillLookbackDays: 365,
    outputDate: today,
    outputPath: "",
    trigger: "manual_report",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = argv[index + 1];
    if (item === "--projectId" && next) {
      options.projectId = next.trim();
      index += 1;
      continue;
    }
    if (item === "--region" && next) {
      options.region = next.trim();
      index += 1;
      continue;
    }
    if (item === "--jobName" && next) {
      options.jobName = next.trim();
      index += 1;
      continue;
    }
    if (item === "--lookbackDays" && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) options.lookbackDays = parsed;
      index += 1;
      continue;
    }
    if (item === "--backfillLookbackDays" && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) options.backfillLookbackDays = parsed;
      index += 1;
      continue;
    }
    if (item === "--outputDate" && next) {
      options.outputDate = next.trim();
      index += 1;
      continue;
    }
    if (item === "--outputPath" && next) {
      options.outputPath = next.trim();
      index += 1;
      continue;
    }
    if (item === "--trigger" && next) {
      options.trigger = next.trim();
      index += 1;
    }
  }

  return options;
}

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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
  throw new Error("gcloud not found; cannot trigger the calibration job.");
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

async function fetchJson(url, token, options = {}) {
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
    throw new Error(`Request failed (${response.status}): ${body}`);
  }
  return response.json();
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

async function triggerCalibrationJob(options, token) {
  const url = `https://run.googleapis.com/v2/projects/${options.projectId}/locations/${options.region}/jobs/${options.jobName}:run`;
  const response = await fetchJson(url, token, {
    method: "POST",
    body: JSON.stringify({
      overrides: {
        containerOverrides: [
          {
            env: [
              { name: "CRYSTAL_CORE_EVAL_MODE", value: "sports_calibration" },
              { name: "CRYSTAL_CORE_EVAL_TRIGGER", value: options.trigger },
              { name: "CRYSTAL_CORE_EVAL_LOOKBACK_DAYS", value: String(options.lookbackDays) },
              { name: "CRYSTAL_CORE_EVAL_BACKFILL_LOOKBACK_DAYS", value: String(options.backfillLookbackDays) },
              { name: "CRYSTAL_CORE_EVAL_OUTPUT_DATE", value: options.outputDate },
            ],
          },
        ],
      },
    }),
  });
  return safeText(response?.name);
}

async function waitForOperation(operationName, token, timeoutMs = 8 * 60 * 1000) {
  if (!operationName) {
    throw new Error("Run Jobs API did not return an operation name.");
  }
  const startedAt = Date.now();
  const operationUrl = `https://run.googleapis.com/v2/${operationName}`;
  while (Date.now() - startedAt < timeoutMs) {
    const payload = await fetchJson(operationUrl, token);
    if (payload?.done === true) {
      if (payload?.error) {
        throw new Error(`Calibration job failed: ${JSON.stringify(payload.error)}`);
      }
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Timed out while waiting for ${operationName}`);
}

async function readCalibrationArtifact(projectId, outputDate, token) {
  const documentPath = `projects/${projectId}/databases/(default)/documents/calibration_reports/sports_${outputDate}`;
  const url = `https://firestore.googleapis.com/v1/${documentPath}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) {
    throw new Error(`Calibration artifact calibration_reports/sports_${outputDate} not found after job completion.`);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to read calibration artifact (${response.status}): ${body}`);
  }
  return decodeFirestoreDocument(await response.json());
}

async function readCalibrationArtifactWithRetry(projectId, outputDate, token, attempts = 8, delayMs = 5000) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await readCalibrationArtifact(projectId, outputDate, token);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to fetch calibration artifact.");
}

function buildUnavailableArtifact(options, error) {
  const message = error instanceof Error ? error.message : String(error || "Sports calibration job failed.");
  return {
    artifact_type: "sports_calibration",
    artifact_status: "unavailable",
    operational: false,
    statistically_mature: false,
    generated_at: new Date().toISOString(),
    output_date: options.outputDate,
    lookback_days: options.lookbackDays,
    backfill_lookback_days: options.backfillLookbackDays,
    operation_name: null,
    fetched_at: new Date().toISOString(),
    source: "crystal-core-eval-job",
    summary: {
      sample_size: 0,
      brier_score: null,
      log_loss: null,
      favorite_vs_edge_confusion_rate: null,
      no_bet_rate: null,
      upset_recall: null,
      artifact_status: "unavailable",
      operational: false,
      statistically_mature: false,
      sample_floor: ACTIVE_SAMPLE_SIZE,
      status_reason: message,
    },
    error: {
      message,
    },
  };
}

function decorateArtifact(payload = {}) {
  const sampleSize = Number(payload?.summary?.sample_size || 0);
  const artifactStatus = sampleSize >= ACTIVE_SAMPLE_SIZE ? "active" : "warming_up";
  return {
    ...payload,
    artifact_status: payload?.artifact_status || artifactStatus,
    operational: payload?.operational !== false,
    statistically_mature: payload?.statistically_mature === true || sampleSize >= ACTIVE_SAMPLE_SIZE,
    summary: {
      ...(payload?.summary || {}),
      artifact_status: payload?.summary?.artifact_status || artifactStatus,
      operational: payload?.summary?.operational !== false,
      statistically_mature: payload?.summary?.statistically_mature === true || sampleSize >= ACTIVE_SAMPLE_SIZE,
      sample_floor: Number(payload?.summary?.sample_floor || ACTIVE_SAMPLE_SIZE),
      status_reason:
        payload?.summary?.status_reason ||
        (sampleSize >= ACTIVE_SAMPLE_SIZE
          ? "Calibration sample floor reached."
          : "Calibration artifact is operational, but it is still warming up toward the sample floor."),
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputPath = path.resolve(repoRoot, options.outputPath || `docs/sports-calibration-${options.outputDate}.json`);
  let payload = null;
  let shouldFail = false;
  try {
    const token = getAccessTokenFromGcloud();
    const operationName = await triggerCalibrationJob(options, token);
    await waitForOperation(operationName, token);
    const artifact = await readCalibrationArtifactWithRetry(options.projectId, options.outputDate, token);
    payload = decorateArtifact({
      ...artifact,
      operation_name: operationName,
      fetched_at: new Date().toISOString(),
      source: "crystal-core-eval-job",
    });
  } catch (error) {
    payload = buildUnavailableArtifact(options, error);
    shouldFail = true;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({ outputPath, artifact_status: payload.artifact_status, summary: payload.summary, operation: payload.operation_name }, null, 2)}\n`
  );
  if (shouldFail) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
