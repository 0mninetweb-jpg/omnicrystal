import { execFileSync } from "node:child_process";

const DEFAULT_PROJECT_ID = "omnicrystal";
const DOCUMENT_PATH = "system_config/runtime_rollout";

const STAGE_PRESETS = {
  baseline: { signed_in_percent: 0, guest_percent: 0, enabled: true, transport: "remote", kill_switch: false },
  "canary-10-0": { signed_in_percent: 10, guest_percent: 0, enabled: true, transport: "remote", kill_switch: false },
  "canary-10-10": { signed_in_percent: 10, guest_percent: 10, enabled: true, transport: "remote", kill_switch: false },
  "rollout-25-25": { signed_in_percent: 25, guest_percent: 25, enabled: true, transport: "remote", kill_switch: false },
  "rollout-50-50": { signed_in_percent: 50, guest_percent: 50, enabled: true, transport: "remote", kill_switch: false },
  "rollout-100-100": { signed_in_percent: 100, guest_percent: 100, enabled: true, transport: "remote", kill_switch: false },
  "hard-rollback": { signed_in_percent: 0, guest_percent: 0, enabled: true, transport: "remote", kill_switch: true },
};

function parseArgs(argv = []) {
  const options = {
    action: "get",
    projectId: DEFAULT_PROJECT_ID,
    stage: "",
    signedInPercent: null,
    guestPercent: null,
    enabled: null,
    transport: "",
    killSwitch: null,
    salt: "",
    windowHours: 24,
    limit: 500,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = argv[index + 1];
    if (item === "--action" && next) {
      options.action = next.trim();
      index += 1;
      continue;
    }
    if (item === "--projectId" && next) {
      options.projectId = next.trim();
      index += 1;
      continue;
    }
    if (item === "--stage" && next) {
      options.stage = next.trim();
      index += 1;
      continue;
    }
    if (item === "--signed-in-percent" && next) {
      options.signedInPercent = clampPercent(next, 0);
      index += 1;
      continue;
    }
    if (item === "--guest-percent" && next) {
      options.guestPercent = clampPercent(next, 0);
      index += 1;
      continue;
    }
    if (item === "--enabled" && next) {
      options.enabled = parseBoolean(next, null);
      index += 1;
      continue;
    }
    if (item === "--transport" && next) {
      options.transport = next.trim().toLowerCase() === "local" ? "local" : "remote";
      index += 1;
      continue;
    }
    if (item === "--kill-switch" && next) {
      options.killSwitch = parseBoolean(next, null);
      index += 1;
      continue;
    }
    if (item === "--salt" && next) {
      options.salt = next;
      index += 1;
      continue;
    }
    if (item === "--window-hours" && next) {
      options.windowHours = Math.max(1, Number(next) || 24);
      index += 1;
      continue;
    }
    if (item === "--limit" && next) {
      options.limit = Math.max(1, Number(next) || 500);
      index += 1;
    }
  }

  return options;
}

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = safeText(String(value || "")).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function clampPercent(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(100, Math.round(next)));
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
  throw new Error("gcloud not found; cannot access Firestore rollout config.");
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
    if ((fieldName.endsWith("_at") || fieldName === "updated_at" || fieldName === "created_at") && value.includes("T")) {
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

async function getRuntimeRolloutDocument(projectId, token) {
  const url = `https://firestore.googleapis.com/v1/${buildDocumentName(projectId, DOCUMENT_PATH)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) {
    return {
      exists: false,
      name: buildDocumentName(projectId, DOCUMENT_PATH),
      updateTime: null,
      data: {},
    };
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firestore request failed (${response.status}): ${body}`);
  }
  const document = await response.json();
  return {
    exists: true,
    name: document.name,
    updateTime: document.updateTime || null,
    data: decodeFirestoreDocument(document),
  };
}

async function patchRuntimeRolloutDocument(projectId, crystalCorePayload, token) {
  const url = `https://firestore.googleapis.com/v1/${buildDocumentName(projectId, DOCUMENT_PATH)}?updateMask.fieldPaths=crystal_core`;
  const fields = {
    crystal_core: encodeFirestoreValue(crystalCorePayload, "crystal_core"),
  };
  return firestoreFetchJson(url, token, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

function normalizeCurrentCrystalCore(current = {}) {
  return {
    enabled: parseBoolean(current.enabled, true),
    transport: safeText(current.transport, "remote") === "local" ? "local" : "remote",
    signed_in_percent: clampPercent(current.signed_in_percent, 0),
    guest_percent: clampPercent(current.guest_percent, 0),
    salt: safeText(current.salt, "crystal-core-default-salt"),
    kill_switch: parseBoolean(current.kill_switch, false),
    updated_at: safeText(current.updated_at) || null,
  };
}

function buildStagePayload(current = {}, options = {}) {
  const normalizedCurrent = normalizeCurrentCrystalCore(current);
  const preset = STAGE_PRESETS[options.stage] || {};
  return {
    enabled: options.enabled ?? preset.enabled ?? normalizedCurrent.enabled,
    transport: safeText(options.transport, preset.transport || normalizedCurrent.transport) === "local" ? "local" : "remote",
    signed_in_percent:
      options.signedInPercent ?? preset.signed_in_percent ?? normalizedCurrent.signed_in_percent,
    guest_percent:
      options.guestPercent ?? preset.guest_percent ?? normalizedCurrent.guest_percent,
    salt: safeText(options.salt, normalizedCurrent.salt),
    kill_switch: options.killSwitch ?? preset.kill_switch ?? normalizedCurrent.kill_switch,
    updated_at: new Date().toISOString(),
  };
}

function getNestedValue(document = {}, path = "") {
  return path.split(".").reduce((current, segment) => (current && current[segment] !== undefined ? current[segment] : null), document);
}

async function runQuery(projectId, token, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  return firestoreFetchJson(url, token, {
    method: "POST",
    body: JSON.stringify({ structuredQuery }),
  });
}

function extractRunMetrics(responses = [], thresholdIso) {
  const metrics = {
    window_start: thresholdIso,
    total_docs_scanned: 0,
    remote_completed_total: 0,
    remote_completed_signed_in: 0,
    remote_completed_guest: 0,
    remote_pending_total: 0,
    remote_fallback_total: 0,
    by_route_origin: {},
  };

  for (const item of responses) {
    const document = item?.document;
    if (!document?.fields) continue;
    metrics.total_docs_scanned += 1;
    const data = decodeFirestoreDocument(document);
    const runtimeTransport = safeText(data.runtime_transport);
    const status = safeText(data.status);
    const routeOrigin = safeText(data.route_origin, "unknown");
    if (runtimeTransport === "remote" && status === "completed") {
      metrics.remote_completed_total += 1;
      if (safeText(data.uid)) {
        metrics.remote_completed_signed_in += 1;
      } else {
        metrics.remote_completed_guest += 1;
      }
      metrics.by_route_origin[routeOrigin] = (metrics.by_route_origin[routeOrigin] || 0) + 1;
    } else if (runtimeTransport === "remote" && status === "pending") {
      metrics.remote_pending_total += 1;
    } else if (runtimeTransport === "local_fallback") {
      metrics.remote_fallback_total += 1;
    }
  }

  return metrics;
}

async function countRecentRuns(projectId, token, windowHours, limit) {
  const threshold = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const responses = await runQuery(projectId, token, {
    from: [{ collectionId: "forecast_runs" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "created_at" },
        op: "GREATER_THAN_OR_EQUAL",
        value: { timestampValue: threshold },
      },
    },
    orderBy: [{ field: { fieldPath: "created_at" }, direction: "DESCENDING" }],
    limit,
  });
  return extractRunMetrics(responses, threshold);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = getAccessTokenFromGcloud();
  const beforeDocument = await getRuntimeRolloutDocument(options.projectId, token);
  const beforeCrystalCore = normalizeCurrentCrystalCore(getNestedValue(beforeDocument.data, "crystal_core") || {});

  if (options.action === "count-runs") {
    const metrics = await countRecentRuns(options.projectId, token, options.windowHours, options.limit);
    process.stdout.write(
      `${JSON.stringify({ project_id: options.projectId, action: "count-runs", metrics }, null, 2)}\n`
    );
    return;
  }

  if (options.action === "get") {
    process.stdout.write(
      `${JSON.stringify(
        {
          project_id: options.projectId,
          action: "get",
          document_path: DOCUMENT_PATH,
          exists: beforeDocument.exists,
          crystal_core: beforeCrystalCore,
          update_time: beforeDocument.updateTime,
        },
        null,
        2
      )}\n`
    );
    return;
  }

  if (!["set-stage", "set"].includes(options.action)) {
    throw new Error(`Unsupported action: ${options.action}`);
  }

  if (options.action === "set-stage" && !STAGE_PRESETS[options.stage]) {
    throw new Error(`Unknown rollout stage: ${options.stage}`);
  }

  const nextCrystalCore = buildStagePayload(getNestedValue(beforeDocument.data, "crystal_core") || {}, options);
  const updatedDocument = await patchRuntimeRolloutDocument(options.projectId, nextCrystalCore, token);
  const afterCrystalCore = normalizeCurrentCrystalCore(decodeFirestoreDocument(updatedDocument).crystal_core || nextCrystalCore);

  process.stdout.write(
    `${JSON.stringify(
      {
        project_id: options.projectId,
        action: options.action,
        stage: options.stage || null,
        document_path: DOCUMENT_PATH,
        before: beforeCrystalCore,
        after: afterCrystalCore,
        update_time: updatedDocument.updateTime || null,
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
