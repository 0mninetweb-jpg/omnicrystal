import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_PROJECT_ID = "omnicrystal";
const ROLLOUT_STAGE_PRESETS = [
  { name: "baseline", signed_in_percent: 0, guest_percent: 0, kill_switch: false },
  { name: "canary-10-0", signed_in_percent: 10, guest_percent: 0, kill_switch: false },
  { name: "canary-10-10", signed_in_percent: 10, guest_percent: 10, kill_switch: false },
  { name: "rollout-25-25", signed_in_percent: 25, guest_percent: 25, kill_switch: false },
  { name: "rollout-50-50", signed_in_percent: 50, guest_percent: 50, kill_switch: false },
  { name: "rollout-100-100", signed_in_percent: 100, guest_percent: 100, kill_switch: false },
  { name: "hard-rollback", signed_in_percent: 0, guest_percent: 0, kill_switch: true },
];

function parseArgs(argv = []) {
  const options = {
    reportType: "daily",
    lookbackDays: null,
    projectId: DEFAULT_PROJECT_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = argv[index + 1];
    if (item === "--reportType" && next) {
      options.reportType = next.trim();
      index += 1;
      continue;
    }
    if (item === "--lookbackDays" && next) {
      const parsed = Number(next);
      options.lookbackDays = Number.isFinite(parsed) ? parsed : null;
      index += 1;
      continue;
    }
    if (item === "--projectId" && next) {
      options.projectId = next.trim();
      index += 1;
    }
  }

  return options;
}

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stripBom(value = "") {
  return typeof value === "string" ? value.replace(/^\uFEFF/, "") : value;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRolloutConfig(raw = {}) {
  return {
    enabled: raw?.enabled !== false,
    transport: safeText(raw?.transport, "remote") === "local" ? "local" : "remote",
    signed_in_percent: Math.max(0, Math.min(100, Math.round(safeNumber(raw?.signed_in_percent, 0)))),
    guest_percent: Math.max(0, Math.min(100, Math.round(safeNumber(raw?.guest_percent, 0)))),
    salt: safeText(raw?.salt),
    kill_switch: raw?.kill_switch === true,
    updated_at: safeText(raw?.updated_at),
  };
}

function inferRolloutStage(config = {}) {
  const normalized = normalizeRolloutConfig(config);
  const matched = ROLLOUT_STAGE_PRESETS.find(
    (preset) =>
      preset.signed_in_percent === normalized.signed_in_percent &&
      preset.guest_percent === normalized.guest_percent &&
      preset.kill_switch === normalized.kill_switch
  );
  return matched?.name || "custom";
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

  throw new Error("gcloud not found; cannot access Firestore production posture data.");
}

function getAccessTokenFromGcloud() {
  const gcloud = getGcloudExecutable();
  const token = execFileSync("cmd.exe", ["/c", gcloud, "auth", "print-access-token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!token) {
    throw new Error("Failed to obtain gcloud access token for production posture report.");
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

async function runQuery(projectId, token, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  return firestoreFetchJson(url, token, {
    method: "POST",
    body: JSON.stringify({ structuredQuery }),
  });
}

function extractDocuments(responses = []) {
  return responses
    .filter((item) => item?.document?.fields)
    .map((item) => {
      const path = safeText(item.document.name).split("/documents/")[1] || "";
      return {
        id: safeText(item.document.name).split("/").pop() || "",
        path,
        ...decodeFirestoreDocument(item.document),
      };
    });
}

function getLatestJson(baseDir, patternPrefix) {
  const docs = fs
    .readdirSync(baseDir)
    .filter((name) => name.startsWith(patternPrefix) && name.endsWith(".json"))
    .map((name) => ({ name, fullPath: path.join(baseDir, name), mtime: fs.statSync(path.join(baseDir, name)).mtimeMs }))
    .sort((left, right) => right.mtime - left.mtime);
  return docs[0]?.fullPath || "";
}

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(stripBom(fs.readFileSync(filePath, "utf8")));
}

function pathUserId(pathValue = "") {
  const match = safeText(pathValue).match(/^users\/([^/]+)\//);
  return match ? safeText(match[1]) : "";
}

function summarizeCountsBy(items = [], keyFn = () => "") {
  return items.reduce((accumulator, item) => {
    const key = safeText(keyFn(item), "unknown");
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function filterDocumentsSince(docs = [], fieldName, sinceDate) {
  return docs.filter((doc) => {
    const value = safeText(doc?.[fieldName]);
    if (!value) return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed >= sinceDate;
  });
}

function buildProductUsageSummary(events = []) {
  const saveEvents = events.filter((event) => safeText(event?.event_type) === "save");
  const followEvents = events.filter((event) => safeText(event?.event_type) === "follow");
  return {
    total_events: events.length,
    save_events_total: saveEvents.length,
    follow_events_total: followEvents.length,
    unique_save_users: new Set(saveEvents.map((event) => pathUserId(event?.path)).filter(Boolean)).size,
    unique_follow_users: new Set(followEvents.map((event) => pathUserId(event?.path)).filter(Boolean)).size,
    unique_saved_lineages: new Set(saveEvents.map((event) => safeText(event?.lineage_id)).filter(Boolean)).size,
    unique_follow_entities: new Set(followEvents.map((event) => safeText(event?.follow_id)).filter(Boolean)).size,
    save_by_source_view: summarizeCountsBy(saveEvents, (event) => event?.source_view),
    follow_by_source_view: summarizeCountsBy(followEvents, (event) => event?.source_view),
  };
}

function buildVersionSummary(versionDocs = [], cardDocs = [], ledgerDocs = []) {
  const privateVersions = versionDocs.filter((doc) => safeText(doc?.path).startsWith("users/"));
  const publicVersions = versionDocs.filter((doc) => safeText(doc?.path).startsWith("forecast_ledger/"));
  return {
    total_version_writes: versionDocs.length,
    private_version_writes: privateVersions.length,
    public_version_writes: publicVersions.length,
    private_card_updates: cardDocs.length,
    private_card_users: new Set(cardDocs.map((doc) => pathUserId(doc?.path)).filter(Boolean)).size,
    public_ledger_updates: ledgerDocs.length,
    public_lineages_touched: new Set(ledgerDocs.map((doc) => safeText(doc?.lineage_id, doc?.id)).filter(Boolean)).size,
  };
}

function buildResolutionSummary(runDocs = [], resolutionDocs = []) {
  return {
    evaluation_eligible_runs: runDocs.filter(
      (runDoc) => runDoc?.evaluation_eligible === true || runDoc?.resolution_target?.evaluation_eligible === true
    ).length,
    resolution_status_breakdown: summarizeCountsBy(runDocs, (runDoc) => runDoc?.resolution_status || "untracked"),
    resolved_outcomes: resolutionDocs.length,
    scored_outcomes: resolutionDocs.filter((doc) => doc?.scored === true).length,
  };
}

function buildCalibrationDriftSummary(calibrationDocs = []) {
  const flagged = calibrationDocs
    .map((doc) => ({
      domain_id: safeText(doc?.domain_id, doc?.id),
      brier_score: Number(doc?.brier_score),
      coverage_gap_rate: Number(doc?.coverage_gap_rate),
      activation_reason: safeText(doc?.activation_reason, "hold_static_thresholds"),
    }))
    .filter((doc) => doc.domain_id && Number.isFinite(doc.brier_score) && doc.brier_score >= 0.24)
    .sort((left, right) => right.brier_score - left.brier_score)
    .slice(0, 5)
    .map((doc) => ({
      domain_id: doc.domain_id,
      brier_score: Number(doc.brier_score.toFixed(4)),
      coverage_gap_rate: Number.isFinite(doc.coverage_gap_rate) ? Number(doc.coverage_gap_rate.toFixed(4)) : null,
      activation_reason: doc.activation_reason,
    }));

  return {
    high_brier_domain_count: flagged.length,
    flagged_domains: flagged,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const lookbackDays = options.lookbackDays ?? (options.reportType === "weekly" ? 7 : 1);
  const now = new Date();
  const sinceDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const sinceIso = sinceDate.toISOString();
  const reportDate = now.toISOString().slice(0, 10);
  const repoRoot = process.cwd();
  const docsDir = path.resolve(repoRoot, "docs");
  const jsonPath = path.join(docsDir, `production-posture-report-${reportDate}.json`);
  const markdownPath = path.join(docsDir, `production-posture-report-${reportDate}.md`);

  const token = getAccessTokenFromGcloud();
  const rolloutOutput = execFileSync("node", [path.resolve(repoRoot, "scripts/runtime-rollout-config.mjs"), "--action", "get", "--projectId", options.projectId], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const rolloutJson = JSON.parse(stripBom(rolloutOutput));
  const rollout = normalizeRolloutConfig(rolloutJson.crystal_core || {});
  const rolloutStage = inferRolloutStage(rollout);

  const [runDocs, productEvents, privateCards, versionDocs, publicLedgerDocs, resolutionDocs, calibrationDocs] = await Promise.all([
    runQuery(options.projectId, token, {
      from: [{ collectionId: "forecast_runs" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "created_at" },
          op: "GREATER_THAN_OR_EQUAL",
          value: { timestampValue: sinceIso },
        },
      },
      limit: 800,
    }).then(extractDocuments),
    runQuery(options.projectId, token, {
      from: [{ collectionId: "product_events", allDescendants: true }],
      limit: 800,
    }).then(extractDocuments).then((docs) => filterDocumentsSince(docs, "createdAt", sinceDate)),
    runQuery(options.projectId, token, {
      from: [{ collectionId: "cards", allDescendants: true }],
      limit: 800,
    }).then(extractDocuments).then((docs) => filterDocumentsSince(docs, "updatedAt", sinceDate)),
    runQuery(options.projectId, token, {
      from: [{ collectionId: "versions", allDescendants: true }],
      limit: 1200,
    }).then(extractDocuments).then((docs) => filterDocumentsSince(docs, "version_saved_at", sinceDate)),
    runQuery(options.projectId, token, {
      from: [{ collectionId: "forecast_ledger" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "updatedAt" },
          op: "GREATER_THAN_OR_EQUAL",
          value: { timestampValue: sinceIso },
        },
      },
      limit: 800,
    }).then(extractDocuments),
    runQuery(options.projectId, token, {
      from: [{ collectionId: "forecast_resolutions" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "resolved_at" },
          op: "GREATER_THAN_OR_EQUAL",
          value: { timestampValue: sinceIso },
        },
      },
      limit: 800,
    }).then(extractDocuments),
    runQuery(options.projectId, token, {
      from: [{ collectionId: "domain_calibration" }],
      limit: 100,
    }).then(extractDocuments),
  ]);

  const remoteRuns = runDocs.filter((runDoc) => safeText(runDoc?.runtime_transport).startsWith("remote"));
  const remoteVolume = {
    remote_completed_total: remoteRuns.filter((runDoc) => safeText(runDoc?.status) === "completed").length,
    remote_completed_signed_in: remoteRuns.filter((runDoc) => safeText(runDoc?.status) === "completed" && safeText(runDoc?.uid)).length,
    remote_completed_guest: remoteRuns.filter((runDoc) => safeText(runDoc?.status) === "completed" && !safeText(runDoc?.uid)).length,
    remote_pending_total: remoteRuns.filter((runDoc) => safeText(runDoc?.status) === "pending").length,
    remote_fallback_total: runDocs.filter((runDoc) => safeText(runDoc?.runtime_transport) === "local_fallback").length,
  };

  const productUsage = buildProductUsageSummary(productEvents);
  const versioning = buildVersionSummary(versionDocs, privateCards, publicLedgerDocs);
  const resolution = buildResolutionSummary(runDocs, resolutionDocs);
  const calibrationDrift = buildCalibrationDriftSummary(calibrationDocs);

  const phaseCloseoutPath = getLatestJson(docsDir, "phase-a-closeout-");
  const parityPath = getLatestJson(docsDir, "parity-report-");
  const matrixPath = getLatestJson(docsDir, "domain-quality-matrix-");
  const phaseCloseout = readJson(phaseCloseoutPath);
  const parityReport = readJson(parityPath);
  const domainMatrix = readJson(matrixPath);

  const report = {
    generated_at: now.toISOString(),
    report_type: options.reportType,
    lookback_days: lookbackDays,
    window_start: sinceIso,
    window_end: now.toISOString(),
    rollout: {
      ...rollout,
      stage: rolloutStage,
    },
    matrix_summary: domainMatrix?.summary || null,
    parity_summary: parityReport?.summary || null,
    phase_closeout: phaseCloseout?.gates || phaseCloseout || null,
    remote_volume: remoteVolume,
    usage: productUsage,
    versioning,
    resolution,
    calibration_drift_watch: calibrationDrift,
    source_docs: {
      phase_closeout_path: phaseCloseoutPath,
      parity_path: parityPath,
      domain_matrix_path: matrixPath,
    },
  };

  const markdown = [
    `# Production Posture Report (${options.reportType})`,
    "",
    `Window: ${sinceIso} -> ${now.toISOString()}`,
    "",
    "## Rollout",
    `- Stage: ${rolloutStage}`,
    `- Rollout: ${rollout.signed_in_percent}/${rollout.guest_percent}`,
    `- Transport: ${rollout.transport}`,
    `- Kill switch: ${rollout.kill_switch === true ? "on" : "off"}`,
    "",
    "## Remote Volume",
    `- Remote completed: ${remoteVolume.remote_completed_total}`,
    `- Signed-in completed: ${remoteVolume.remote_completed_signed_in}`,
    `- Guest completed: ${remoteVolume.remote_completed_guest}`,
    `- Remote pending: ${remoteVolume.remote_pending_total}`,
    `- Remote fallback: ${remoteVolume.remote_fallback_total}`,
    "",
    "## Product Usage",
    `- Save events: ${productUsage.save_events_total}`,
    `- Follow events: ${productUsage.follow_events_total}`,
    `- Unique saved lineages: ${productUsage.unique_saved_lineages}`,
    `- Unique follow entities: ${productUsage.unique_follow_entities}`,
    "",
    "## Versioning",
    `- Private version writes: ${versioning.private_version_writes}`,
    `- Public version writes: ${versioning.public_version_writes}`,
    `- Private card updates: ${versioning.private_card_updates}`,
    `- Public ledger updates: ${versioning.public_ledger_updates}`,
    "",
    "## Outcome / Proof",
    `- Evaluation-eligible runs: ${resolution.evaluation_eligible_runs}`,
    `- Resolved outcomes: ${resolution.resolved_outcomes}`,
    `- Scored outcomes: ${resolution.scored_outcomes}`,
    `- Resolution status breakdown: ${Object.entries(resolution.resolution_status_breakdown)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ") || "none"}`,
    "",
    "## Calibration Drift Watch",
    `- High-brier domains: ${calibrationDrift.high_brier_domain_count}`,
    `- Flagged: ${
      calibrationDrift.flagged_domains.length > 0
        ? calibrationDrift.flagged_domains.map((item) => `${item.domain_id} (${item.brier_score})`).join(", ")
        : "none"
    }`,
    "",
    "## Technical Gates",
    `- Phase closeout verdict: ${safeText(phaseCloseout?.verdict, "unknown")}`,
    `- Parity verdict: ${safeText(parityReport?.summary?.verdict, "unknown")}`,
    `- Matrix verdict: ${safeText(domainMatrix?.summary?.verdict, "unknown")}`,
    `- Edge follow-up count: ${safeNumber(domainMatrix?.summary?.edge_quality_follow_up_count, 0)}`,
    "",
    "## Source Docs",
    `- Phase closeout: ${phaseCloseoutPath}`,
    `- Parity report: ${parityPath}`,
    `- Domain matrix: ${matrixPath}`,
  ].join("\n");

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, `${markdown}\n`, "utf8");

  console.log(`Production posture markdown written to ${markdownPath}`);
  console.log(`Production posture JSON written to ${jsonPath}`);
  console.log(`Summary: rollout_stage=${rolloutStage}, remote_completed=${remoteVolume.remote_completed_total}, save_events=${productUsage.save_events_total}, resolved_outcomes=${resolution.resolved_outcomes}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
