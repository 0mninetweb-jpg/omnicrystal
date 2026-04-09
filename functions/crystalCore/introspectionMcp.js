const fs = require("node:fs/promises");
const path = require("node:path");
const { listCapabilities } = require("./capabilityRegistry");

const INTROSPECTION_RESOURCES = [
  {
    id: "capabilities",
    uri: "crystal://introspection/capabilities",
    title: "Capability registry",
    mime_type: "application/json",
  },
  {
    id: "runtime-health",
    uri: "crystal://introspection/runtime-health",
    title: "Runtime health summary",
    mime_type: "application/json",
  },
  {
    id: "sports-probe-latest",
    uri: "crystal://introspection/sports-probe/latest",
    title: "Latest sports probe",
    mime_type: "application/json",
  },
  {
    id: "sports-calibration-latest",
    uri: "crystal://introspection/sports-calibration/latest",
    title: "Latest sports calibration",
    mime_type: "application/json",
  },
  {
    id: "forecast-runs-summary",
    uri: "crystal://introspection/forecast-runs/summary",
    title: "Forecast run summary",
    mime_type: "application/json",
  },
  {
    id: "forecast-runs-failed",
    uri: "crystal://introspection/forecast-runs/failed",
    title: "Recent failed forecast runs",
    mime_type: "application/json",
  },
  {
    id: "worldsim-jobs-summary",
    uri: "crystal://introspection/worldsim-jobs/summary",
    title: "WorldSim job summary",
    mime_type: "application/json",
  },
  {
    id: "provider-runtime-health-drift",
    uri: "crystal://introspection/provider-runtime-health-drift",
    title: "Provider and runtime health drift",
    mime_type: "application/json",
  },
];

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toSerializable(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => toSerializable(item));
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toSerializable(nested)])
      .filter(([, nested]) => nested !== undefined)
  );
}

async function readLatestArtifact(prefix, docsDir) {
  const matches = (await fs.readdir(docsDir))
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .sort();
  if (!matches.length) {
    return {
      status: "missing",
      artifact_path: null,
      artifact: null,
    };
  }
  const artifactPath = path.join(docsDir, matches[matches.length - 1]);
  const raw = await fs.readFile(artifactPath, "utf8");
  return {
    status: "available",
    artifact_path: artifactPath,
    artifact: JSON.parse(raw.replace(/^\uFEFF/, "")),
  };
}

async function summarizeCollection(db, collectionName, options = {}) {
  if (!db || typeof db.collection !== "function") {
    return {
      total_loaded: 0,
      recent: [],
      error: "Firestore context unavailable.",
    };
  }
  const limit = Math.max(1, Number(options.limit) || 25);
  const snapshot = await db.collection(collectionName).limit(limit).get();
  const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  return {
    total_loaded: docs.length,
    recent: docs.slice(0, 10).map((doc) => ({
      id: doc.id,
      status: safeText(doc.status),
      current_stage: safeText(doc.current_stage),
      domain_id: safeText(doc?.query_plan?.primary_domain_id || doc?.result_card?.domain),
      runtime_transport: safeText(doc.runtime_transport),
      updated_at: toSerializable(doc.updated_at),
      completed_at: toSerializable(doc.completed_at),
    })),
  };
}

async function summarizeFailedRuns(db, options = {}) {
  if (!db || typeof db.collection !== "function") {
    return {
      total_failed_in_scan: 0,
      recent_failed: [],
      error: "Firestore context unavailable.",
    };
  }
  const scanLimit = Math.max(10, Number(options.limit) || 60);
  let snapshot = null;
  try {
    snapshot = await db.collection("forecast_runs").orderBy("updated_at", "desc").limit(scanLimit).get();
  } catch (_error) {
    snapshot = await db.collection("forecast_runs").limit(scanLimit).get();
  }
  const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const failedDocs = docs.filter((doc) => {
    const status = safeText(doc.status).toLowerCase();
    const currentStage = safeText(doc.current_stage).toLowerCase();
    const pendingStatus = safeText(doc.pending_status).toLowerCase();
    return status === "failed" || currentStage === "failed" || pendingStatus === "failed";
  });
  return {
    total_failed_in_scan: failedDocs.length,
    recent_failed: failedDocs.slice(0, 10).map((doc) => ({
      id: doc.id,
      status: safeText(doc.status),
      current_stage: safeText(doc.current_stage),
      domain_id: safeText(doc?.query_plan?.primary_domain_id || doc?.result_card?.domain),
      runtime_transport: safeText(doc.runtime_transport),
      updated_at: toSerializable(doc.updated_at),
      completed_at: toSerializable(doc.completed_at),
      error_message: safeText(doc?.error?.message || doc?.last_error?.message || doc?.failure_reason || doc?.status_detail),
    })),
  };
}

async function summarizeWorldSimJobs(db, options = {}) {
  if (!db || typeof db.collection !== "function") {
    return {
      total_loaded: 0,
      status_breakdown: {},
      recent: [],
      error: "Firestore context unavailable.",
    };
  }
  const limit = Math.max(1, Number(options.limit) || 25);
  const snapshot = await db.collection("worldsim_jobs").limit(limit).get();
  const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const status_breakdown = docs.reduce((acc, doc) => {
    const key = safeText(doc.status, "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    total_loaded: docs.length,
    status_breakdown,
    recent: docs.slice(0, 10).map((doc) => ({
      id: doc.id,
      status: safeText(doc.status),
      kind: safeText(doc.kind),
      template: safeText(doc.template),
      simulation_id: safeText(doc.simulation_id),
      updated_at: toSerializable(doc.updated_at),
    })),
  };
}

function buildProviderRuntimeHealthDrift({
  runtimeHealth = {},
  closeoutArtifact = null,
  providerArtifact = null,
  sportsProbeArtifact = null,
  sportsCalibrationArtifact = null,
} = {}) {
  const providerSummary = providerArtifact?.summary || {};
  const runtimeProviderStates = Array.isArray(providerArtifact?.runtime_provider_states) ? providerArtifact.runtime_provider_states : [];
  const gates = closeoutArtifact?.gates || {};
  const liveHealth = closeoutArtifact?.live_health || {};
  const sportsProviderState = runtimeProviderStates.find((item) => safeText(item?.source_id) === "thesportsdb_public") || null;
  const driftFlags = [];

  if (safeText(providerSummary.runtime_config_verdict) === "config-ready" && safeText(liveHealth?.health_fetch_error)) {
    driftFlags.push("runtime_health_fetch_failed_despite_config_ready");
  }
  if (sportsProviderState?.configured === true && sportsProviderState?.available === true && liveHealth?.sports_available === false) {
    driftFlags.push("sports_provider_ready_but_runtime_sports_unavailable");
  }
  if (safeText(gates?.sports_calibration_status) === "unavailable") {
    driftFlags.push("calibration_artifact_unavailable");
  }
  if (gates?.sports_probe_ready === false || gates?.sports_probability_probe_ready === false) {
    driftFlags.push("sports_probe_not_green");
  }
  if (runtimeHealth?.api?.available === false || runtimeHealth?.crystal_core?.available === false) {
    driftFlags.push("runtime_health_context_reports_unavailable_service");
  }

  return {
    drift_flag_count: driftFlags.length,
    drift_flags: driftFlags,
    runtime_health: toSerializable(runtimeHealth || {}),
    closeout_snapshot: {
      verdict: safeText(closeoutArtifact?.verdict),
      sports_calibration_status: safeText(gates?.sports_calibration_status),
      sports_probe_ready: gates?.sports_probe_ready === true,
      sports_probability_probe_ready: gates?.sports_probability_probe_ready === true,
      sports_local_remote_green: gates?.sports_local_remote_green === true,
      health_fetch_error: safeText(liveHealth?.health_fetch_error),
      sports_available: liveHealth?.sports_available === true,
    },
    provider_foundation_snapshot: {
      verdict: safeText(providerSummary?.verdict),
      runtime_config_verdict: safeText(providerSummary?.runtime_config_verdict),
      runtime_config_blocker_count: Number(providerSummary?.runtime_config_blocker_count || 0),
      sports_provider_configured: sportsProviderState?.configured === true,
      sports_provider_available: sportsProviderState?.available === true,
    },
    sports_probe_snapshot: {
      local_remote_green: sportsProbeArtifact?.summary?.local_remote_green === true,
      a29_ready: sportsProbeArtifact?.summary?.a29_ready === true,
      b36_ready: sportsProbeArtifact?.summary?.b36_ready === true,
      winner_mismatch_rate:
        sportsProbeArtifact?.summary?.winner_mismatch_rate == null ? null : Number(sportsProbeArtifact.summary.winner_mismatch_rate),
    },
    sports_calibration_snapshot: {
      artifact_status: safeText(sportsCalibrationArtifact?.artifact_status || sportsCalibrationArtifact?.summary?.artifact_status, "missing"),
      sample_size:
        sportsCalibrationArtifact?.summary?.sample_size == null ? null : Number(sportsCalibrationArtifact.summary.sample_size),
      statistically_mature: sportsCalibrationArtifact?.statistically_mature === true || sportsCalibrationArtifact?.summary?.statistically_mature === true,
    },
  };
}

function listIntrospectionResources() {
  return INTROSPECTION_RESOURCES.map((resource) => ({ ...resource }));
}

async function readIntrospectionResource(resourceId, context = {}) {
  const normalized = safeText(resourceId);
  const docsDir = context.docsDir || path.resolve(process.cwd(), "docs");

  if (normalized === "capabilities") {
    return {
      resource: INTROSPECTION_RESOURCES.find((item) => item.id === normalized),
      payload: {
        capability_count: listCapabilities().length,
        capabilities: listCapabilities(),
      },
    };
  }

  if (normalized === "runtime-health") {
    return {
      resource: INTROSPECTION_RESOURCES.find((item) => item.id === normalized),
      payload: toSerializable(context.runtimeHealth || {}),
    };
  }

  if (normalized === "sports-probe-latest") {
    return {
      resource: INTROSPECTION_RESOURCES.find((item) => item.id === normalized),
      payload: await readLatestArtifact("sports-probe-", docsDir),
    };
  }

  if (normalized === "sports-calibration-latest") {
    return {
      resource: INTROSPECTION_RESOURCES.find((item) => item.id === normalized),
      payload: await readLatestArtifact("sports-calibration-", docsDir),
    };
  }

  if (normalized === "forecast-runs-summary") {
    return {
      resource: INTROSPECTION_RESOURCES.find((item) => item.id === normalized),
      payload: await summarizeCollection(context.db, "forecast_runs"),
    };
  }

  if (normalized === "forecast-runs-failed") {
    return {
      resource: INTROSPECTION_RESOURCES.find((item) => item.id === normalized),
      payload: await summarizeFailedRuns(context.db),
    };
  }

  if (normalized === "worldsim-jobs-summary") {
    return {
      resource: INTROSPECTION_RESOURCES.find((item) => item.id === normalized),
      payload: await summarizeWorldSimJobs(context.db),
    };
  }

  if (normalized === "provider-runtime-health-drift") {
    const [closeout, providerArtifact, sportsProbe, sportsCalibration] = await Promise.all([
      readLatestArtifact("phase-a-closeout-", docsDir),
      readLatestArtifact("provider-foundation-report-", docsDir),
      readLatestArtifact("sports-probe-", docsDir),
      readLatestArtifact("sports-calibration-", docsDir),
    ]);
    return {
      resource: INTROSPECTION_RESOURCES.find((item) => item.id === normalized),
      payload: buildProviderRuntimeHealthDrift({
        runtimeHealth: context.runtimeHealth || {},
        closeoutArtifact: closeout?.artifact || null,
        providerArtifact: providerArtifact?.artifact || null,
        sportsProbeArtifact: sportsProbe?.artifact || null,
        sportsCalibrationArtifact: sportsCalibration?.artifact || null,
      }),
    };
  }

  return null;
}

module.exports = {
  INTROSPECTION_RESOURCES,
  listIntrospectionResources,
  readIntrospectionResource,
};
