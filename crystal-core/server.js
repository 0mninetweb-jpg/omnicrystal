const express = require("express");
const admin = require("firebase-admin");
const { CloudTasksClient } = require("@google-cloud/tasks");

const { createCrystalCoreRuntime } = require("../functions/crystalCore/runtime");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const runtime = createCrystalCoreRuntime({
  db,
  admin,
  getGeminiApiKey: () => process.env.GEMINI_API_KEY || "",
});

const app = express();
const ACTIVE_RUNS = new Map();
const tasksClient = new CloudTasksClient();
const EXECUTION_LEASE_MS = 2 * 60 * 1000;

app.use(express.json({ limit: "2mb" }));

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function deleteField() {
  return admin.firestore.FieldValue.delete();
}

function futureTimestamp(ms) {
  return admin.firestore.Timestamp.fromMillis(Date.now() + Math.max(1, ms));
}

function getTaskExecutionMetadata(req) {
  return {
    taskName: safeText(req.get("X-CloudTasks-TaskName")),
    retryCount: Math.max(0, toInteger(req.get("X-CloudTasks-TaskRetryCount"), 0)),
    taskDeliveryCount: Math.max(0, toInteger(req.get("X-CloudTasks-TaskExecutionCount"), 0)),
  };
}

function buildRunSeedPatch(runId, payload = {}) {
  const queryText = safeText(payload.queryText, safeText(payload.query));
  const queryPlan = payload.queryPlan && typeof payload.queryPlan === "object" ? payload.queryPlan : null;
  const visibility = payload.visibility === "public" ? "public" : "private";
  return {
    run_id: runId,
    status: "created",
    current_stage: "created",
    visibility,
    access_token: safeText(payload.publicAccessToken) || null,
    uid: payload.uid || null,
    source_view: safeText(payload.sourceView, "search"),
    route_origin: safeText(payload.routeOrigin, "predict"),
    query_text: queryText,
    query_plan: queryPlan,
    user_context: payload.userContext || null,
    request_time_zone: safeText(payload.requestTimeZone || payload.timeZone),
    engine: safeText(payload.engine, "extended"),
    plan: safeText(payload.plan, "free"),
    runtime_transport: safeText(payload.runtimeTransport, "remote"),
    rollout_bucket: safeText(payload.rolloutBucket) || null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
}

function serializeApiValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((item) => serializeApiValue(item)).filter((item) => item !== undefined);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : value;
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const ctorName = value.constructor?.name;
  if (ctorName && ctorName !== "Object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nestedValue]) => [key, serializeApiValue(nestedValue)])
      .filter(([, nestedValue]) => nestedValue !== undefined)
  );
}

function sanitizeRun(runDoc = {}) {
  return {
    run_id: safeText(runDoc.run_id),
    status: safeText(runDoc.status, "created"),
    visibility: safeText(runDoc.visibility, "private"),
    current_stage: safeText(runDoc.current_stage, "created"),
    query_text: safeText(runDoc.query_text),
    query_plan: serializeApiValue(runDoc.query_plan || null),
    request_time_zone: safeText(runDoc.request_time_zone),
    source_view: safeText(runDoc.source_view),
    engine: safeText(runDoc.engine, "extended"),
    plan: safeText(runDoc.plan, "free"),
    error_message: safeText(runDoc.error_message),
    runtime_transport: safeText(runDoc.runtime_transport, "remote"),
    rollout_bucket: safeText(runDoc.rollout_bucket),
    evaluation_eligible: Boolean(runDoc.evaluation_eligible),
    resolution_status: safeText(runDoc.resolution_status),
    attempt_count: Math.max(0, toInteger(runDoc.attempt_count, 0)),
    task_delivery_count: Math.max(0, toInteger(runDoc.task_delivery_count, 0)),
    last_error_code: safeText(runDoc.last_error_code),
    last_error_message: safeText(runDoc.last_error_message),
    last_error_stage: safeText(runDoc.last_error_stage),
    last_provider: safeText(runDoc.last_provider),
    execution_state: safeText(runDoc.execution_state),
    created_at: serializeApiValue(runDoc.created_at),
    started_at: serializeApiValue(runDoc.started_at),
    updated_at: serializeApiValue(runDoc.updated_at),
    completed_at: serializeApiValue(runDoc.completed_at),
    result_available: Boolean(runDoc.result_card),
    pending_poll_after_ms: Number.isFinite(Number(runDoc.pending_poll_after_ms)) ? Number(runDoc.pending_poll_after_ms) : 2500,
    core_runtime: safeText(runDoc.core_runtime),
  };
}

async function readRun(runId) {
  const snapshot = await db.collection("forecast_runs").doc(runId).get();
  return snapshot.exists ? snapshot.data() || null : null;
}

async function prepareRunForEnqueue(runId, payload = {}, existingRun = null) {
  const docRef = db.collection("forecast_runs").doc(runId);
  const seedPatch = buildRunSeedPatch(runId, payload);
  if (!existingRun) {
    await docRef.set(seedPatch, { merge: true });
    return { ...seedPatch };
  }

  const mergePatch = {};
  if (!safeText(existingRun.query_text) && safeText(seedPatch.query_text)) {
    mergePatch.query_text = seedPatch.query_text;
  }
  if ((!existingRun.query_plan || typeof existingRun.query_plan !== "object") && seedPatch.query_plan) {
    mergePatch.query_plan = seedPatch.query_plan;
  }
  if (!safeText(existingRun.source_view) && safeText(seedPatch.source_view)) {
    mergePatch.source_view = seedPatch.source_view;
  }
  if (!safeText(existingRun.route_origin) && safeText(seedPatch.route_origin)) {
    mergePatch.route_origin = seedPatch.route_origin;
  }
  if (!safeText(existingRun.runtime_transport) && safeText(seedPatch.runtime_transport)) {
    mergePatch.runtime_transport = seedPatch.runtime_transport;
  }
  if (!safeText(existingRun.engine) && safeText(seedPatch.engine)) {
    mergePatch.engine = seedPatch.engine;
  }
  if (!safeText(existingRun.plan) && safeText(seedPatch.plan)) {
    mergePatch.plan = seedPatch.plan;
  }
  if (!safeText(existingRun.request_time_zone) && safeText(seedPatch.request_time_zone)) {
    mergePatch.request_time_zone = seedPatch.request_time_zone;
  }
  if (!existingRun.created_at) {
    mergePatch.created_at = seedPatch.created_at;
  }
  if (Object.keys(mergePatch).length > 0) {
    mergePatch.updated_at = serverTimestamp();
    await docRef.set(mergePatch, { merge: true });
  }
  return { ...existingRun, ...mergePatch };
}

async function claimRunExecution(runId, req) {
  const docRef = db.collection("forecast_runs").doc(runId);
  const taskMeta = getTaskExecutionMetadata(req);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) {
      return { status: "not_found" };
    }
    const runDoc = snapshot.data() || {};
    const status = safeText(runDoc.status, "created");
    if (["completed", "failed", "canceled"].includes(status)) {
      return { status: "terminal", runDoc };
    }

    const leaseExpiresAt =
      typeof runDoc.execution_lock_expires_at?.toMillis === "function" ? runDoc.execution_lock_expires_at.toMillis() : 0;
    if (safeText(runDoc.execution_state) === "running" && leaseExpiresAt > Date.now()) {
      return { status: "already_running", runDoc };
    }

    const attemptCount = Math.max(0, toInteger(runDoc.attempt_count, 0)) + 1;
    transaction.set(
      docRef,
      {
        status: status === "created" || status === "queued" ? "running" : status,
        execution_state: "running",
        execution_lock_expires_at: futureTimestamp(EXECUTION_LEASE_MS),
        attempt_count: attemptCount,
        task_delivery_count: Math.max(Math.max(0, toInteger(runDoc.task_delivery_count, 0)), taskMeta.taskDeliveryCount),
        queue_task_name: taskMeta.taskName || safeText(runDoc.queue_task_name) || null,
        last_attempt_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );

    return {
      status: "claimed",
      runDoc: {
        ...runDoc,
        status: status === "created" || status === "queued" ? "running" : status,
        execution_state: "running",
        attempt_count: attemptCount,
        task_delivery_count: Math.max(Math.max(0, toInteger(runDoc.task_delivery_count, 0)), taskMeta.taskDeliveryCount),
        queue_task_name: taskMeta.taskName || safeText(runDoc.queue_task_name) || null,
      },
      taskMeta,
    };
  });
}

async function releaseRunExecution(runId, patch = {}) {
  await db.collection("forecast_runs").doc(runId).set(
    {
      execution_state: "idle",
      execution_lock_expires_at: deleteField(),
      updated_at: serverTimestamp(),
      ...patch,
    },
    { merge: true }
  );
}

function normalizeRunError(error, fallbackStage = "") {
  const message = error instanceof Error ? error.message : String(error || "Crystal core execution failed.");
  const details = error && typeof error === "object" ? error.details || {} : {};
  return {
    code: safeText(error?.code, "crystal-core-run-failed"),
    message: safeText(message, "Crystal core execution failed."),
    stage: safeText(error?.stage, safeText(details?.stage, fallbackStage)),
    provider: safeText(error?.provider, safeText(details?.provider)),
  };
}

async function markRunTerminalFailure(runId, error, metadata = {}) {
  const normalized = normalizeRunError(error, safeText(metadata.stage, "execution"));
  await db.collection("forecast_runs").doc(runId).set(
    {
      status: "failed",
      current_stage: "failed",
      completed_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      error_message: normalized.message,
      error_code: normalized.code,
      last_error_code: normalized.code,
      last_error_message: normalized.message,
      last_error_stage: normalized.stage || null,
      last_provider: normalized.provider || null,
      last_attempt_at: serverTimestamp(),
      execution_state: "idle",
      execution_lock_expires_at: deleteField(),
      task_delivery_count:
        metadata.taskDeliveryCount === undefined
          ? undefined
          : Math.max(0, toInteger(metadata.taskDeliveryCount, 0)),
      attempt_count:
        metadata.attemptCount === undefined
          ? undefined
          : Math.max(0, toInteger(metadata.attemptCount, 0)),
    },
    { merge: true }
  );
  return normalized;
}

function getProjectId() {
  return safeText(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT, "omnicrystal");
}

function getTaskQueueName() {
  return safeText(process.env.CRYSTAL_CORE_TASK_QUEUE, "crystal-core-runs");
}

function getTaskLocation() {
  return safeText(process.env.CRYSTAL_CORE_TASK_LOCATION, "europe-west1");
}

function getRunnerServiceAccountEmail() {
  return safeText(process.env.CRYSTAL_CORE_RUNNER_SERVICE_ACCOUNT_EMAIL);
}

function getServiceBaseUrl(req) {
  return safeText(process.env.CRYSTAL_CORE_SERVICE_URL, `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

function getExecutorAudience(req) {
  return safeText(process.env.CRYSTAL_CORE_EXECUTOR_AUDIENCE, getServiceBaseUrl(req));
}

function canUseCloudTasks(req) {
  return Boolean(getRunnerServiceAccountEmail()) && !/localhost|127\.0\.0\.1/i.test(getServiceBaseUrl(req));
}

function launchRunInProcess(payload = {}) {
  const runId = safeText(payload.runId);
  if (!runId) {
    throw new Error("runId is required.");
  }

  if (ACTIVE_RUNS.has(runId)) {
    return ACTIVE_RUNS.get(runId);
  }

  const promise = runtime
    .executeForecastRun(payload)
    .catch((error) => {
      console.error("crystal-core run failed", { runId, message: error instanceof Error ? error.message : String(error) });
      throw error;
    })
    .finally(() => {
      ACTIVE_RUNS.delete(runId);
    });

  ACTIVE_RUNS.set(runId, promise);
  return promise;
}

async function enqueueForecastRun(req, runDoc = {}) {
  const runId = safeText(runDoc.run_id);
  if (!runId) {
    throw new Error("runId is required.");
  }

  if (["completed", "failed", "canceled"].includes(safeText(runDoc.status))) {
    return {
      status: "terminal",
      mode: "noop",
    };
  }

  if (!canUseCloudTasks(req)) {
    launchRunInProcess({
      runId,
      queryText: runDoc.query_text,
      queryPlan: runDoc.query_plan || {},
      userContext: runDoc.user_context || null,
      requestTimeZone: safeText(runDoc.request_time_zone),
      uid: runDoc.uid || null,
      visibility: safeText(runDoc.visibility, "private"),
      publicAccessToken: runDoc.access_token || null,
      sourceView: safeText(runDoc.source_view, "search"),
      routeOrigin: safeText(runDoc.route_origin, "predict"),
      engine: safeText(runDoc.engine, "extended"),
      plan: safeText(runDoc.plan, "free"),
      runtimeTransport: safeText(runDoc.runtime_transport, "remote"),
      rolloutBucket: safeText(runDoc.rollout_bucket),
    });
    return {
      status: "started",
      mode: "in_process",
    };
  }

  if (safeText(runDoc.queue_task_name)) {
    return {
      status: "queued",
      mode: "cloud_tasks",
      task_name: runDoc.queue_task_name,
    };
  }

  const projectId = getProjectId();
  const location = getTaskLocation();
  const queueName = getTaskQueueName();
  const url = `${getServiceBaseUrl(req)}/v1/internal/execute/${encodeURIComponent(runId)}`;
  const parent = tasksClient.queuePath(projectId, location, queueName);
  const [task] = await tasksClient.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: "POST",
        url,
        headers: {
          "Content-Type": "application/json",
        },
        body: Buffer.from(JSON.stringify({ runId })).toString("base64"),
        oidcToken: {
          serviceAccountEmail: getRunnerServiceAccountEmail(),
          audience: getExecutorAudience(req),
        },
      },
    },
  });

  await db.collection("forecast_runs").doc(runId).set(
    {
      status: "queued",
      current_stage: "queued",
      queue_task_name: task.name,
      task_enqueued_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    status: "queued",
    mode: "cloud_tasks",
    task_name: task.name,
  };
}

async function waitForRun(runId, waitMs) {
  const deadline = Date.now() + Math.max(0, waitMs);
  while (Date.now() < deadline) {
    const runDoc = await readRun(runId);
    if (["completed", "failed", "canceled"].includes(safeText(runDoc?.status))) {
      return runDoc;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return readRun(runId);
}

app.get("/health", async (req, res) => {
  const health = await runtime.getHealth();
  res.json({
    ok: true,
    queueing: {
      enabled: canUseCloudTasks(req),
      task_queue: getTaskQueueName(),
      task_location: getTaskLocation(),
      service_base_url: getServiceBaseUrl(req),
    },
    ...health,
  });
});

app.post("/v1/compile", async (req, res) => {
  try {
    const queryText = typeof req.body?.query === "string" ? req.body.query : "";
    const queryPlan = await runtime.compileQuery(queryText, {
      timeZone: safeText(req.body?.timeZone),
      asOfUtc: safeText(req.body?.asOfUtc),
    });
    res.json({
      ok: true,
      query_plan: queryPlan,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Crystal core compile failed.",
    });
  }
});

app.post("/v1/runs", async (req, res) => {
  try {
    const payload = req.body || {};
    const runId = safeText(payload.runId);
    if (!runId) {
      res.status(400).json({
        status: "invalid",
        error: "runId is required.",
      });
      return;
    }

    const existingRun = await readRun(runId);
    const preparedRun = await prepareRunForEnqueue(runId, payload, existingRun);
    await enqueueForecastRun(req, preparedRun);

    const waitMs = Math.min(Math.max(Number(payload.waitMs) || 8000, 0), 15000);
    const runDoc = await waitForRun(runId, waitMs);

    if (safeText(runDoc?.status) === "completed" && runDoc?.result_card) {
      res.json({
        status: "completed",
        run_id: runId,
        run: sanitizeRun(runDoc),
        card: serializeApiValue(runDoc.result_card),
      });
      return;
    }

    if (["failed", "canceled"].includes(safeText(runDoc?.status))) {
      res.json({
        status: safeText(runDoc.status),
        run_id: runId,
        run: sanitizeRun(runDoc),
      });
      return;
    }

    res.json({
      status: "pending",
      run_id: runId,
      run: sanitizeRun(runDoc || { run_id: runId, status: "queued", current_stage: "queued" }),
    });
  } catch (error) {
    res.status(500).json({
      status: "failed",
      error: error instanceof Error ? error.message : "Crystal core run failed.",
    });
  }
});

app.post("/v1/internal/execute/:runId", async (req, res) => {
  const runId = safeText(req.params.runId);
  if (!runId) {
    res.status(400).json({
      ok: false,
      error: "Run id missing.",
    });
    return;
  }

  const claim = await claimRunExecution(runId, req);
  if (claim.status === "not_found") {
    res.status(404).json({
      ok: false,
      error: "Run not found.",
    });
    return;
  }

  if (claim.status === "terminal") {
    res.json({
      ok: true,
      status: safeText(claim.runDoc?.status),
      run_id: runId,
    });
    return;
  }

  if (claim.status === "already_running") {
    res.json({
      ok: true,
      status: "running",
      run_id: runId,
    });
    return;
  }

  const runDoc = claim.runDoc || (await readRun(runId));

  try {
    await launchRunInProcess({
      runId,
      queryText: runDoc.query_text,
      queryPlan: runDoc.query_plan || {},
      userContext: runDoc.user_context || null,
      requestTimeZone: safeText(runDoc.request_time_zone),
      uid: runDoc.uid || null,
      visibility: safeText(runDoc.visibility, "private"),
      publicAccessToken: runDoc.access_token || null,
      sourceView: safeText(runDoc.source_view, "search"),
      routeOrigin: safeText(runDoc.route_origin, "predict"),
      engine: safeText(runDoc.engine, "extended"),
      plan: safeText(runDoc.plan, "free"),
      runtimeTransport: safeText(runDoc.runtime_transport, "remote"),
      rolloutBucket: safeText(runDoc.rollout_bucket),
    });
    await releaseRunExecution(runId);
    const finalRun = await readRun(runId);
    res.json({
      ok: true,
      status: safeText(finalRun?.status, "completed"),
      run_id: runId,
    });
  } catch (error) {
    const currentRun = await readRun(runId);
    const isTerminal = ["completed", "failed", "canceled"].includes(safeText(currentRun?.status));
    const normalized = isTerminal
      ? normalizeRunError(error, safeText(currentRun?.current_stage, "execution"))
      : await markRunTerminalFailure(runId, error, {
          stage: safeText(currentRun?.current_stage, "execution"),
          attemptCount: claim.runDoc?.attempt_count,
          taskDeliveryCount: claim.taskMeta?.taskDeliveryCount,
        });
    if (isTerminal) {
      await releaseRunExecution(runId, {
        last_error_code: normalized.code,
        last_error_message: normalized.message,
        last_error_stage: normalized.stage || null,
        last_provider: normalized.provider || null,
        last_attempt_at: serverTimestamp(),
      });
    }
    res.json({
      ok: false,
      status: "failed",
      error: normalized.message,
      run_id: runId,
    });
  }
});

app.post("/v1/internal/evaluation/run", async (req, res) => {
  try {
    const mode = safeText(req.body?.mode, safeText(req.query?.mode, safeText(process.env.CRYSTAL_CORE_EVAL_MODE, "resolution")));
    const result = await runtime.runOfflineEvaluationMode({
      mode,
      reportType: safeText(req.body?.reportType, safeText(req.query?.reportType)),
      lookbackDays: Number(req.body?.lookbackDays || req.query?.lookbackDays) || undefined,
      limit: Number(req.body?.limit || req.query?.limit) || undefined,
    });
    res.json({
      ok: true,
      ...serializeApiValue(result),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Evaluation run failed.",
    });
  }
});

app.get("/v1/runs/:runId", async (req, res) => {
  const runId = safeText(req.params.runId);
  const runDoc = await readRun(runId);
  if (!runDoc) {
    res.status(404).json({
      status: "not_found",
      error: "Run not found.",
    });
    return;
  }

  res.json({
    status: safeText(runDoc.status, "created"),
    run_id: runId,
    run: sanitizeRun(runDoc),
    card: runDoc.result_card ? serializeApiValue(runDoc.result_card) : null,
  });
});

app.post("/v1/runs/:runId/cancel", async (req, res) => {
  const runId = safeText(req.params.runId);
  if (!runId) {
    res.status(400).json({
      ok: false,
      error: "Run id missing.",
    });
    return;
  }

  await db.collection("forecast_runs").doc(runId).set(
    {
      status: "canceled",
      current_stage: "canceled",
      completed_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  res.json({
    ok: true,
    run_id: runId,
  });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`crystal-core listening on ${port}`);
});
