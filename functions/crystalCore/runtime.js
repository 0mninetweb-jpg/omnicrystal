const crypto = require("node:crypto");
const googleTrends = require("google-trends-api");
const { GoogleGenAI, Type } = require("@google/genai");
const yahooFinance = require("yahoo-finance2").default;

const { createLlmRuntime, isRetryableRuntimeError } = require("../llmRuntime");
const { sanitizePublishedArtifactFields, sanitizePublishedText } = require("../publicForecastText");
const {
  GENERAL_FORECAST_DOMAIN,
  SPORTS_MATCH_OUTCOMES_DOMAIN,
  CATALOG_VERSION_ID,
  getDomain,
  getDomainCardTypes,
  isSupportedDomain,
  resolveDomainId,
} = require("../catalogRegistry");
const SPORTS_PROBABILITY_MODE_DOMAIN = "B.3.6.sports_outcomes_probability_mode";
const {
  buildSportsForecastContext,
  getSportsRuntimeHealth,
  looksLikeSportsMatchQuery,
} = require("../sportsData");
const { computeSportsContractState, sportsB36LiveEnabled } = require("./sportsState");
const { buildSportsDecisionFrame } = require("./sportsDecision");
const { buildGenericDecisionKernel } = require("./decisionKernel");
const { buildCoordinationTrace } = require("./coordinator");
const {
  buildRoutingHints,
  buildTemporalContext,
  mergeQueryPlanWithRouting,
  computeEvidenceQuality,
  finalizeScorecard,
  buildBinaryContract,
  buildCompatibleProbabilitySplit,
  buildDriverObjects,
  normalizeTimeZone,
  normalizeTextList,
  clamp01,
  safeText,
} = require("../predictionCore");
const { getPolymarketPulse } = require("../polymarket");
const { getWorldSimDigest } = require("../worldSim");
const { runContextualVariableSelection } = require("./adapterRegistry");
const {
  shouldRunSimulationDecisionGate,
  buildMiroFishOutputContract,
  applySimulationFusion,
} = require("./simulationFusion");
const {
  buildResolutionTarget,
  applyCalibrationToScorecard,
  loadActiveCalibration,
  runOfflineEvaluationMode,
} = require("./evaluation");
const {
  SHARED_IMPLEMENTED_SOURCE_IDS,
  getAllProviderRuntimeStatuses,
  buildProviderStatesForUsage,
  buildRequiredSourcesForQuery,
  isGeoLikeQuery,
  isMobilityLikeQuery,
  isTravelLikeQuery,
  isMacroPublicDataQuery,
  isEnergyLikeQuery,
  isEnvironmentLikeQuery,
  fetchNominatimLocationSignal,
  fetchOverpassContextSignal,
  fetchWorldBankSignal,
  fetchEurostatSignal,
  fetchOecdSignal,
  fetchOpenSkySignal,
  fetchGtfsStaticSignal,
  fetchGtfsRealtimeSignal,
  fetchOpenAqSignal,
  fetchEiaSignal,
  buildLocationStructure,
  buildMobilityStructure,
  buildPublicDataStructure,
} = require("./sharedProviders");

const CRYSTAL_CORE_VERSION = "crystal-core-v1";
const JSON_STAGE_MAX_TOKENS = {
  planner: 768,
  dossier: 1400,
  verbalizer: 900,
};
const EXECUTION_BUDGET_MS = 90 * 1000;
const FORECAST_RESULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FORECAST_CACHE_SCHEMA_VERSION = "2026-04-11-sports-1x2-v2";
const STAGE_RETRY_POLICY = {
  planner: { retries: 2, baseDelayMs: 1200, timeoutMs: 18 * 1000 },
  dossier: { retries: 2, baseDelayMs: 1500, timeoutMs: 24 * 1000 },
  verbalizer: { retries: 2, baseDelayMs: 1200, timeoutMs: 18 * 1000 },
};
const EVIDENCE_STAGE_TIMEOUT_MS = 32 * 1000;
const SIMULATION_STAGE_POLICY = {
  retries: 1,
  baseDelayMs: 1000,
  timeoutMs: 12 * 1000,
  minimumBudgetMs: 6 * 1000,
  reserveForFinalizationMs: 14 * 1000,
};
const RUNTIME_IMPLEMENTED_SOURCE_IDS = SHARED_IMPLEMENTED_SOURCE_IDS;
const FORECAST_HORIZON_LABELS = {
  now: "Now",
  "72h": "72 hours",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "6m": "6 months",
  "12m": "12 months",
  season: "Season",
};
const PLANNER_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    plan_version: { type: "string" },
    primary_domain_id: { type: "string" },
    candidate_domains: {
      type: "array",
      items: {
        type: "object",
        properties: {
          domain_id: { type: "string" },
          score: { type: "number" },
        },
        required: ["domain_id", "score"],
      },
    },
    intent_shape: { type: "string" },
    resolution_frame: { type: "string" },
    input_language: { type: "string" },
    response_language: { type: "string" },
    canonical_query: { type: "string" },
    interpretation_confidence: { type: "number" },
    ambiguity_level: { type: "string" },
    resolution_policy: { type: "object" },
    teams: { type: "array", items: { type: "string" } },
    fixture: { type: "object" },
    confidence_mode: { type: "string" },
    mode: {
      type: "object",
      properties: {
        type: { type: "string" },
      },
      required: ["type"],
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entity_id: { type: "string" },
          entity_type: { type: "string" },
          label: { type: "string" },
        },
        required: ["entity_id", "entity_type", "label"],
      },
    },
    question_side_a: { type: "string" },
    question_side_b: { type: "string" },
    event_date: { type: "string" },
    governing_entity: { type: "string" },
    jurisdiction: { type: "string" },
  },
  required: ["plan_version", "primary_domain_id", "intent_shape", "resolution_frame", "mode"],
};
const DOSSIER_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    structured_dossier: {
      type: "object",
      properties: {
        query_normalized: { type: "string" },
        domain_map: { type: "array", items: { type: "string" } },
        outcome_target: { type: "string" },
        horizon: { type: "string" },
        selected_variables: { type: "array", items: { type: "string" } },
        ranked_drivers: { type: "array", items: { type: "string" } },
        macro_context: { type: "array", items: { type: "string" } },
        case_specific_context: { type: "array", items: { type: "string" } },
        uncertainty_map: { type: "array", items: { type: "string" } },
        data_quality_map: { type: "array", items: { type: "string" } },
      },
      required: ["query_normalized", "outcome_target"],
    },
    feature_bundle: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          direction: { type: "string" },
          confidence: { type: "number" },
          note: { type: "string" },
        },
        required: ["label", "direction", "confidence", "note"],
      },
    },
    baseline_consensus_pack: {
      type: "object",
      properties: {
        naive_baseline: { type: "string" },
        consensus_prediction: { type: "string" },
        delta_vs_consensus: { type: "string" },
        edge_claim: { type: "string" },
      },
      required: ["naive_baseline", "consensus_prediction", "delta_vs_consensus", "edge_claim"],
    },
    raw_prediction: {
      type: "object",
      properties: {
        primary_call: { type: "string" },
        probability_split: {
          type: "object",
          properties: {
            primary_label: { type: "string" },
            primary_probability: { type: "number" },
            secondary_label: { type: "string" },
            secondary_probability: { type: "number" },
          },
        },
        binary_contract: {
          type: "object",
          properties: {
            question_side_a: { type: "string" },
            question_side_b: { type: "string" },
            question_side_a_probability: { type: "number" },
            question_side_b_probability: { type: "number" },
            winning_side: { type: "string" },
            winning_probability: { type: "number" },
            band: { type: "string" },
            display_call: { type: "string" },
            flip_conditions: { type: "array", items: { type: "string" } },
          },
        },
        confidence_score: { type: "number" },
        key_drivers: { type: "array", items: { type: "string" } },
        counter_signals: { type: "array", items: { type: "string" } },
        invalidators: { type: "array", items: { type: "string" } },
        historical_anchors: { type: "array", items: { type: "string" } },
        why_this_side: { type: "string" },
        recommended_posture: { type: "string" },
        scenario_set: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              outcome: { type: "string" },
              probability: { type: "number" },
              drivers: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      required: ["primary_call", "confidence_score", "key_drivers", "counter_signals", "invalidators", "historical_anchors"],
    },
  },
  required: ["structured_dossier", "feature_bundle", "baseline_consensus_pack", "raw_prediction"],
};
const VERBALIZER_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    verdict: { type: "string" },
    recommended_action: { type: "string" },
    what_to_watch: { type: "array", items: { type: "string" } },
    how_to_raise_confidence: { type: "array", items: { type: "string" } },
    coverage_notes: { type: "array", items: { type: "string" } },
  },
  required: ["title", "summary", "verdict", "recommended_action", "what_to_watch", "how_to_raise_confidence", "coverage_notes"],
};

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function nowIso() {
  return new Date().toISOString();
}

function truncateTextForPrompt(value, maxLength = 900) {
  const normalized = safeText(value).replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function serverTimestamp(admin) {
  return admin?.firestore?.FieldValue?.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : nowIso();
}

function deleteSentinel(admin) {
  return admin?.firestore?.FieldValue?.delete ? admin.firestore.FieldValue.delete() : null;
}

function createStageTimeoutError(stage, timeoutMs) {
  const error = new Error(`Crystal core timed out during ${safeText(stage, "stage")} after ${timeoutMs}ms.`);
  error.code = "stage-timeout";
  error.status = 503;
  error.details = {
    stage: safeText(stage, "stage"),
    timeout_ms: timeoutMs,
  };
  return error;
}

function getImplementedSourceIds() {
  return Array.from(new Set(RUNTIME_IMPLEMENTED_SOURCE_IDS));
}

function buildRuntimeGroundingSummary() {
  const availableSources = getAllProviderRuntimeStatuses()
    .filter((provider) => provider.available === true)
    .map((provider) => provider.source_id);
  return uniqueStrings(["historical-cache"].concat(availableSources));
}

function logCoreEvent(event, payload = {}) {
  console.log("crystal-core-event", {
    event: safeText(event, "unknown"),
    timestamp: nowIso(),
    ...payload,
  });
}

async function runWithStageTimeout(fn, timeoutMs, stage) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fn();
  }

  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(() => fn()),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(createStageTimeoutError(stage, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ensureExecutionBudget(deadlineAt, stage) {
  if (Date.now() > deadlineAt) {
    throw createStageTimeoutError(stage || "execution_budget", EXECUTION_BUDGET_MS);
  }
}

function getRemainingExecutionBudgetMs(deadlineAt) {
  return Math.max(0, Number(deadlineAt) - Date.now());
}

function buildSimulationBypassContract(gate = {}, options = {}) {
  const status = safeText(options?.status, "skipped");
  const summary = safeText(
    options?.summary,
    status === "degraded"
      ? "Simulation evidence degraded, so Crystal finalized this run from dossier, fusion, and calibration only."
      : "Simulation evidence was skipped to preserve runtime reliability."
  );
  const note = safeText(
    options?.note,
    status === "degraded" ? "Simulation degraded and Crystal continued with the non-simulation stack." : "Simulation skipped."
  );
  const base =
    buildMiroFishOutputContract(null, {
      enabled: false,
      reasons: Array.isArray(gate?.reasons) ? gate.reasons : [],
    }) || {};
  const downwardModifiers =
    status === "degraded"
      ? uniqueStrings([note, "Simulation evidence was not strong enough to own the final call."]).slice(0, 3)
      : [];

  return {
    ...base,
    simulation_status: {
      ...(base.simulation_status || {}),
      status,
      simulation_mode: status === "degraded" ? "degraded" : "skipped",
      runtime_summary: summary,
      completion_quality: status === "degraded" ? 0.2 : 0,
    },
    confidence_modifiers: {
      ...(base.confidence_modifiers || {}),
      confidence_upward_modifiers: [],
      confidence_downward_modifiers: downwardModifiers,
      simulation_reliability_notes: uniqueStrings(
        []
          .concat(Array.isArray(base?.confidence_modifiers?.simulation_reliability_notes) ? base.confidence_modifiers.simulation_reliability_notes : [])
          .concat(note ? [note] : [])
      ).slice(0, 3),
      uncertainty_pressure: status === "degraded" ? 0.18 : 0,
    },
    simulation_summary_for_fusion: {
      ...(base.simulation_summary_for_fusion || {}),
      simulation_summary: summary,
      recommended_fusion_weight: 0,
    },
    gate_reasons: Array.isArray(gate?.reasons) ? gate.reasons : [],
    degradation_reason: safeText(options?.reason),
  };
}

async function writeRunPatch(db, admin, runId, patch = {}) {
  if (!db || !runId) return;
  await db.collection("forecast_runs").doc(runId).set(
    {
      ...patch,
      updated_at: serverTimestamp(admin),
    },
    { merge: true }
  );
}

async function writeArtifact(db, admin, runId, stage, payload) {
  if (!db || !runId || !stage) return;
  const artifactId = `${stage}_${Date.now()}`;
  await db.collection("forecast_runs").doc(runId).collection("artifacts").doc(artifactId).set({
    stage,
    payload,
    created_at: serverTimestamp(admin),
  });
}

async function readRun(db, runId) {
  if (!db || !runId) return null;
  const snapshot = await db.collection("forecast_runs").doc(runId).get();
  return snapshot.exists ? snapshot.data() || null : null;
}

async function ensureRunActive(db, runId) {
  const run = await readRun(db, runId);
  if (run?.status === "canceled") {
    const error = new Error("Forecast run canceled.");
    error.code = "forecast-run-canceled";
    error.status = 409;
    throw error;
  }
}

function createHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function buildForecastCacheKey(queryText, normalizedQuery = {}, options = {}) {
  const payload = {
    cache_schema_version: FORECAST_CACHE_SCHEMA_VERSION,
    query: safeText(queryText).toLowerCase(),
    domain_id: safeText(normalizedQuery?.primary_domain_id || normalizedQuery?.domain_id || normalizedQuery?.domain),
    intent_shape: safeText(normalizedQuery?.intent_shape),
    resolution_frame: safeText(normalizedQuery?.resolution_frame),
    question_side_a: safeText(normalizedQuery?.question_side_a),
    question_side_b: safeText(normalizedQuery?.question_side_b),
    event_date: safeText(normalizedQuery?.event_date),
    jurisdiction: safeText(normalizedQuery?.jurisdiction),
    request_time_zone: safeText(options?.requestTimeZone),
    engine: safeText(options?.engine),
    plan: safeText(options?.plan),
  };
  return `forecast_${createHash(JSON.stringify(payload)).slice(0, 48)}`;
}

function toTimestampMillis(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function readForecastResultCache(db, cacheKey, maxAgeMs = FORECAST_RESULT_CACHE_TTL_MS) {
  if (!db || !cacheKey) return null;
  const snapshot = await db.collection("cached_cards").doc(cacheKey).get();
  if (!snapshot.exists) return null;
  const payload = snapshot.data() || {};
  const cachedAtMs =
    toTimestampMillis(payload.cached_at) ||
    toTimestampMillis(payload.updated_at) ||
    toTimestampMillis(payload.created_at);
  if (!Number.isFinite(cachedAtMs)) return null;
  const ageMs = Date.now() - cachedAtMs;
  if (ageMs < 0 || ageMs > maxAgeMs) return null;
  return {
    ...payload,
    age_ms: ageMs,
  };
}

function isSportsForecastDomain(normalizedQuery = {}) {
  const domainId = safeText(normalizedQuery?.primary_domain_id || normalizedQuery?.domain_id || normalizedQuery?.domain);
  return domainId === SPORTS_MATCH_OUTCOMES_DOMAIN || domainId === SPORTS_PROBABILITY_MODE_DOMAIN;
}

function shouldReuseCachedForecast(cachedForecast = {}, normalizedQuery = {}) {
  const cachedCard = cachedForecast?.card;
  if (!cachedCard || typeof cachedCard !== "object") return false;

  const expectedLanguage = normalizeLanguageCode(
    normalizedQuery?.response_language || normalizedQuery?.input_language,
    ""
  );
  const cachedLanguage = normalizeLanguageCode(
    cachedCard?.response_language || cachedCard?.input_language,
    ""
  );
  if (expectedLanguage && cachedLanguage && expectedLanguage !== cachedLanguage) {
    return false;
  }

  if (isSportsForecastDomain(normalizedQuery)) {
    const sportsFrame = getSportsOutcomeFrame(
      cachedCard,
      cachedCard?.sports_grounding?.model_probabilities || cachedCard?.publication_basis?.sports_model_probabilities || null,
      normalizedQuery
    );
    const scenarioSet = Array.isArray(cachedCard?.scenario_set) ? cachedCard.scenario_set : [];
    const primaryCall = safeText(cachedCard?.primary_call);
    if (!sportsFrame) return false;
    if (scenarioSet.length < 3) return false;
    if (!(primaryCall.includes("1 ") && primaryCall.includes("X ") && primaryCall.includes("2 "))) return false;
  }

  return true;
}

async function writeForecastResultCache(db, admin, cacheKey, payload = {}) {
  if (!db || !cacheKey) return;
  await db.collection("cached_cards").doc(cacheKey).set(
    {
      ...payload,
      cached_at: nowIso(),
      updated_at: serverTimestamp(admin),
    },
    { merge: true }
  );
}

function getPrimaryLocationFromPlan(queryPlan = {}) {
  return (
    safeText(queryPlan?.filters?.location) ||
    safeText(queryPlan?.jurisdiction) ||
    safeText(
      (Array.isArray(queryPlan?.entities) ? queryPlan.entities : []).find((entity) =>
        ["city", "country", "region", "zone", "location"].includes(safeText(entity?.entity_type))
      )?.label
    )
  );
}

function getPrimaryEntityLabel(queryPlan = {}) {
  return safeText((Array.isArray(queryPlan?.entities) ? queryPlan.entities[0] : null)?.label);
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

function getCardStateUi(cardState) {
  if (cardState === "blocked") return "coverage_gap";
  if (cardState === "limited") return "limited";
  return "published";
}

function getPrimaryForecastEntityLabel(queryPlan = {}, queryText = "") {
  return safeText(
    getPrimaryEntityLabel(queryPlan),
    safeText(getPrimaryLocationFromPlan(queryPlan), safeText(queryText.split(/\s+/).slice(0, 4).join(" "), "General"))
  );
}

function getForecastHorizonId(queryPlan = {}) {
  return safeText(queryPlan?.filters?.horizon, safeText(queryPlan?.horizons?.[0]?.horizon_id, "30d"));
}

function formatForecastHorizonLabel(horizonId = "30d") {
  return FORECAST_HORIZON_LABELS[horizonId] || horizonId;
}

function createForecastLineageId(queryText, queryPlan = {}, card = {}) {
  const seed = [
    safeText(queryText).toLowerCase(),
    resolveDomainId(queryPlan?.primary_domain_id || queryPlan?.domain || queryPlan?.domain_id || card?.domain || ""),
    slugifyText(getPrimaryForecastEntityLabel(queryPlan, queryText), "general"),
    slugifyText(getPrimaryLocationFromPlan(queryPlan), "auto"),
    getForecastHorizonId(queryPlan),
  ].join("|");
  return `lineage_${createHash(seed).slice(0, 24)}`;
}

function buildPublicForecastIds(queryText, queryPlan = {}, card = {}, existingPublicSlug = "") {
  const lineageId = createForecastLineageId(queryText, queryPlan, card);
  const domainId = resolveDomainId(queryPlan?.primary_domain_id || queryPlan?.domain || queryPlan?.domain_id || card?.domain || "");
  const domainConfig = getDomain(domainId);
  const entityLabel = sanitizePublishedText(getPrimaryForecastEntityLabel(queryPlan, queryText), getPrimaryForecastEntityLabel(queryPlan, queryText));
  const entitySlug = slugifyText(entityLabel, "general");
  const geographyLabel = sanitizePublishedText(safeText(getPrimaryLocationFromPlan(queryPlan), "Auto"), "Auto");
  const geographySlug = slugifyText(geographyLabel, "auto");
  const topicLabel = sanitizePublishedText(safeText(domainConfig?.short_label || domainConfig?.title, "Forecast"), "Forecast");
  const topicSlug = slugifyText(topicLabel, "forecast");
  const publicSlug =
    safeText(existingPublicSlug) || `${entitySlug}-${topicSlug}-${lineageId.replace(/^lineage_/, "").slice(0, 8)}`;

  return {
    lineageId,
    publicSlug,
    entityLabel,
    entitySlug,
    geographyLabel,
    geographySlug,
    topicLabel,
    topicSlug,
    domainId,
  };
}

function buildCanonicalLifecycleFields({ queryText = "", queryPlan = {}, card = {}, publishedAt = "" } = {}) {
  const temporalContext =
    card?.temporal_context && typeof card.temporal_context === "object"
      ? card.temporal_context
      : queryPlan?.temporal_context && typeof queryPlan.temporal_context === "object"
        ? queryPlan.temporal_context
        : buildTemporalContext(queryText, {
            eventDate: safeText(card?.event_date || queryPlan?.event_date),
          });
  const resolvedTimeWindow = card?.resolved_time_window || temporalContext?.resolved_time_window || null;
  const eventDate = safeText(
    card?.event_date,
    safeText(card?.resolution_target?.event_date, safeText(queryPlan?.event_date, safeText(resolvedTimeWindow?.end_date)))
  );
  const resolutionDueAt = safeText(
    card?.resolution_due_at,
    safeText(card?.resolution_target?.resolution_due_at, safeText(queryPlan?.resolution_due_at))
  );
  const resolutionStatus = safeText(card?.resolution_status, card?.evaluation_eligible ? "pending" : "skipped");

  return {
    temporal_context: temporalContext,
    resolved_time_window: resolvedTimeWindow,
    event_date: eventDate || null,
    resolution_due_at: resolutionDueAt || null,
    resolution_status: resolutionStatus,
    published_at: safeText(card?.published_at, safeText(publishedAt, nowIso())),
  };
}

function extractHoldReason(card = {}) {
  return safeText(
    card?.publication_basis?.blocker_reason,
    safeText(
      card?.evidence_drawer?.quality_summary?.blocker_reason,
      safeText(
        card?.no_action_reason,
        safeText(
          card?.decision_reason,
          safeText(card?.sports_overlay_blocker_reason, safeText(card?.sports_no_bet_reason))
        )
      )
    )
  );
}

async function recordPipelineLog(db, admin, payload = {}) {
  if (!db) return null;
  const timestamp = nowIso();
  const logId = safeText(payload.request_id) || `log_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    request_id: safeText(payload.request_id, logId),
    route: safeText(payload.route, "forecast"),
    event_type: safeText(payload.event_type, "runtime"),
    user_mode: safeText(payload.user_mode, "guest"),
    input_language: safeText(payload.input_language),
    domain_id: safeText(payload.domain_id),
    run_id: safeText(payload.run_id),
    job_id: safeText(payload.job_id),
    cache_hit: payload.cache_hit === true,
    card_state: safeText(payload.card_state),
    hold_reason: safeText(payload.hold_reason),
    error_code: safeText(payload.error_code),
    duration_ms: Number.isFinite(Number(payload.duration_ms)) ? Number(payload.duration_ms) : null,
    runtime_transport: safeText(payload.runtime_transport),
    source_view: safeText(payload.source_view),
    route_origin: safeText(payload.route_origin),
    query_text: safeText(payload.query_text),
    status: safeText(payload.status),
    visibility: safeText(payload.visibility),
    timestamp,
    created_at: serverTimestamp(admin),
    updated_at: serverTimestamp(admin),
  };
  await db.collection("pipeline_logs").doc(logId).set(entry, { merge: true });
  return entry;
}

async function maybePublishForecastArtifacts({
  db,
  admin,
  queryText,
  queryPlan,
  card,
  sourceView = "search",
  uid = null,
}) {
  if (!db || !card || getCardStateUi(card.card_state) === "coverage_gap") {
    return card;
  }

  if (!safeText(card?.title) || !(safeText(card?.summary) || safeText(card?.verdict) || safeText(card?.primary_call))) {
    return card;
  }

  const lineageId = createForecastLineageId(queryText, queryPlan, card);
  const ledgerRef = db.collection("forecast_ledger").doc(lineageId);
  const ledgerSnapshot = await ledgerRef.get();
  const existingPublicSlug = safeText(ledgerSnapshot.data()?.public_slug);
  const ids = buildPublicForecastIds(queryText, queryPlan, card, existingPublicSlug);
  const publicRef = db.collection("public_forecasts").doc(ids.publicSlug);
  const publicSnapshot = await publicRef.get();
  const versionId = safeText(card.card_id, `version_${Date.now()}`);
  const versionRef = ledgerRef.collection("versions").doc(versionId);
  const horizonId = getForecastHorizonId(queryPlan);
  const confidenceScore = Number.isFinite(Number(card?.trust_layer?.confidence_score))
    ? Number(card.trust_layer.confidence_score)
    : 0;
  const publishedAt =
    safeText(publicSnapshot.data()?.published_at) ||
    safeText(ledgerSnapshot.data()?.published_at) ||
    safeText(card?.published_at) ||
    nowIso();
  const canonicalLifecycle = buildCanonicalLifecycleFields({
    queryText,
    queryPlan,
    card,
    publishedAt,
  });
  const publicPayload = {
    ...card,
    ...canonicalLifecycle,
    lineage_id: lineageId,
    ledger_ref: `forecast_ledger/${lineageId}`,
    public_forecast_ref: `public_forecasts/${ids.publicSlug}`,
    public_slug: ids.publicSlug,
    query_origin: safeText(queryText),
    query_text: safeText(queryText),
    query_plan: queryPlan || {},
    entity_label: ids.entityLabel,
    entity_slug: ids.entitySlug,
    geography_label: ids.geographyLabel,
    geography_slug: ids.geographySlug,
    horizon_id: horizonId,
    horizon_label: formatForecastHorizonLabel(horizonId),
    domain_label: safeText(ids.topicLabel, ids.domainId),
    topic_label: ids.topicLabel,
    topic_slug: ids.topicSlug,
    card_state_ui: getCardStateUi(card.card_state),
    trust_confidence: confidenceScore,
    public_visibility: "public",
    source_view: safeText(sourceView, "search"),
    published_by_uid: uid,
    updatedAt: serverTimestamp(admin),
    updated_at: serverTimestamp(admin),
  };
  const { sanitized: sanitizedPublicPayload } = sanitizePublishedArtifactFields(publicPayload);

  const createdAt = serverTimestamp(admin);
  const ledgerPayload = ledgerSnapshot.exists
    ? sanitizedPublicPayload
    : {
        ...sanitizedPublicPayload,
        createdAt,
        created_at: createdAt,
      };
  const publicDocPayload = publicSnapshot.exists
    ? sanitizedPublicPayload
    : {
        ...sanitizedPublicPayload,
        createdAt,
        created_at: createdAt,
      };

  await Promise.all([
    ledgerRef.set(ledgerPayload, { merge: true }),
    versionRef.set(
      {
        ...sanitizedPublicPayload,
        parent_lineage_id: lineageId,
        version_saved_at: serverTimestamp(admin),
        createdAt,
        created_at: createdAt,
      },
      { merge: true }
    ),
    publicRef.set(publicDocPayload, { merge: true }),
  ]);

  return {
    ...card,
    ...canonicalLifecycle,
    lineage_id: lineageId,
    ledger_ref: `forecast_ledger/${lineageId}`,
    public_forecast_ref: `public_forecasts/${ids.publicSlug}`,
    public_slug: ids.publicSlug,
    query_origin: safeText(queryText),
    query_text: safeText(queryText),
  };
}

function buildTrendKeyword(queryText, queryPlan = {}, domainConfig = {}) {
  const primaryEntity = getPrimaryEntityLabel(queryPlan);
  const location = getPrimaryLocationFromPlan(queryPlan);
  if (primaryEntity && location && primaryEntity.toLowerCase() !== location.toLowerCase()) {
    return `${primaryEntity} ${location}`;
  }
  if (primaryEntity) return primaryEntity;
  if (location) return `${domainConfig.short_label || "forecast"} ${location}`;
  return safeText(queryText)
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
}

async function fetchTrendSignal(queryText, queryPlan = {}, domainConfig = {}) {
  const keyword = buildTrendKeyword(queryText, queryPlan, domainConfig);
  if (!keyword) return null;

  try {
    const trendRaw = await googleTrends.interestOverTime({
      keyword,
      startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    });
    const trend = JSON.parse(trendRaw);
    const values = (trend?.default?.timelineData || [])
      .map((item) => Number(item.value?.[0] || 0))
      .filter((value) => Number.isFinite(value));

    if (values.length < 6) return null;

    const latestWindow = values.slice(-7);
    const previousWindow = values.slice(-14, -7);
    const latestAvg = latestWindow.reduce((total, value) => total + value, 0) / latestWindow.length;
    const previousAvg =
      previousWindow.length > 0 ? previousWindow.reduce((total, value) => total + value, 0) / previousWindow.length : latestAvg;
    const delta = latestAvg - previousAvg;
    const lean = delta > 3 ? "up" : delta < -3 ? "down" : "flat";

    return {
      source_id: "google_trends",
      label: "Search momentum",
      summary: `Search momentum for "${keyword}" is ${lean === "up" ? "rising" : lean === "down" ? "cooling" : "stable"} versus the previous weekly window.`,
      lean,
      freshness_score: 0.66,
      trust_score: 0.62,
    };
  } catch (_error) {
    return null;
  }
}

async function fetchHistoricalSeriesForTimeGpt(fetchJson, queryText, queryPlan = {}, domainConfig = {}) {
  const domainId = safeText(domainConfig?.domain_id);
  const corpus = normalizeSignalText([queryText, domainId, queryPlan?.canonical_query, queryPlan?.original_query].filter(Boolean).join(" "));

  if (/bitcoin|btc|crypto/.test(corpus)) {
    const klines = await fetchJson("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=90");
    const series = {};
    for (const item of Array.isArray(klines) ? klines : []) {
      series[new Date(item[0]).toISOString().slice(0, 10)] = Number(item[4]);
    }
    return { series, label: "BTCUSDT daily close" };
  }

  if (/weather|climate|temperature|meteo|clima/.test(corpus)) {
    let lat = 41.9028;
    let lon = 12.4964;
    const location = getPrimaryLocationFromPlan(queryPlan);
    if (location) {
      const geocode = await fetchJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
      );
      if (Array.isArray(geocode?.results) && geocode.results[0]) {
        lat = Number(geocode.results[0].latitude);
        lon = Number(geocode.results[0].longitude);
      }
    }
    const endDate = new Date();
    endDate.setUTCDate(endDate.getUTCDate() - 2);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - 90);
    const weather = await fetchJson(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate
        .toISOString()
        .slice(0, 10)}&end_date=${endDate.toISOString().slice(0, 10)}&daily=temperature_2m_mean`
    );
    const series = {};
    const times = Array.isArray(weather?.daily?.time) ? weather.daily.time : [];
    const values = Array.isArray(weather?.daily?.temperature_2m_mean) ? weather.daily.temperature_2m_mean : [];
    times.forEach((time, index) => {
      if (values[index] !== null && values[index] !== undefined) {
        series[time] = Number(values[index]);
      }
    });
    return { series, label: "Open-Meteo daily temperature" };
  }

  const keyword = buildTrendKeyword(queryText, queryPlan, domainConfig);
  const trendRaw = await googleTrends.interestOverTime({
    keyword,
    startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
  });
  const trend = JSON.parse(trendRaw);
  const series = {};
  for (const item of trend?.default?.timelineData || []) {
    series[new Date(Number(item.time) * 1000).toISOString().slice(0, 10)] = Number(item.value?.[0] || 0);
  }
  return { series, label: `Google Trends proxy for ${keyword}` };
}

function summarizeTimeGptSignal(forecast, horizonId = "30d", sourceLabel = "TimeGPT") {
  const values = Array.isArray(forecast?.value)
    ? forecast.value
    : Array.isArray(forecast?.forecast)
      ? forecast.forecast
      : Array.isArray(forecast?.data)
        ? forecast.data.map((item) => item?.value ?? item?.yhat ?? item?.TimeGPT)
        : [];
  if (values.length < 2) return null;
  const first = Number(values[0]);
  const last = Number(values[values.length - 1]);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  const delta = last - first;
  const lean = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const pct = first !== 0 ? ((delta / Math.abs(first)) * 100).toFixed(1) : "0.0";
  return {
    source_id: "timegpt",
    label: "TimeGPT directional projection",
    summary: `${sourceLabel} projects a ${lean === "up" ? "higher" : lean === "down" ? "lower" : "flat"} path over ${horizonId} (${pct}% across the projected window).`,
    lean,
    freshness_score: 0.72,
    trust_score: 0.7,
  };
}

async function fetchTimeGptSignal(fetchJson, queryText, queryPlan = {}, domainConfig = {}) {
  const domainId = safeText(domainConfig?.domain_id);
  if (domainId === SPORTS_MATCH_OUTCOMES_DOMAIN || domainId === SPORTS_PROBABILITY_MODE_DOMAIN) {
    return { available: false, reason: "timegpt_skipped_for_sports" };
  }
  const nixtlaKey = safeText(process.env.NIXTLA_API_KEY);
  if (!nixtlaKey) {
    return { available: false, reason: "timegpt_unavailable" };
  }

  try {
    const { series, label } = await fetchHistoricalSeriesForTimeGpt(fetchJson, queryText, queryPlan, domainConfig);
    if (!series || Object.keys(series).length < 8) {
      return { available: false, reason: "timegpt_insufficient_history" };
    }
    const horizonId = safeText(queryPlan?.horizon?.horizon_id || queryPlan?.horizons?.[0]?.horizon_id, "30d");
    const forecast = await fetchJson("https://api.nixtla.io/forecast", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nixtlaKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "timegpt-1",
        y: series,
        fh: horizonId === "7d" ? 7 : horizonId === "90d" ? 90 : 30,
        level: [80, 90],
      }),
    });
    const signal = summarizeTimeGptSignal(forecast, horizonId, label);
    if (!signal) return { available: false, reason: "timegpt_empty_forecast" };
    return {
      available: true,
      signals: [signal],
      source_trust_map: [
        {
          source_id: "timegpt",
          trust_score: 0.7,
          note: `${label} projected through TimeGPT/Nixtla.`,
        },
      ],
      conflict_map: [],
      timegpt_metrics: {
        source_label: label,
        horizon_id: horizonId,
        point_count: Object.keys(series).length,
      },
    };
  } catch (_error) {
    return { available: false, reason: "timegpt_unavailable" };
  }
}

function normalizeSignalText(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function keywordTokensFromQuery(queryText = "", normalizedQuery = {}) {
  const raw = [
    queryText,
    safeText(normalizedQuery?.jurisdiction),
    safeText(normalizedQuery?.governing_entity),
    ...((Array.isArray(normalizedQuery?.entities) ? normalizedQuery.entities : [])
      .map((entity) => safeText(entity?.label))
      .filter(Boolean)),
  ]
    .join(" ")
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => normalizeSignalText(token))
    .filter((token) => token.length >= 4);

  return [...new Set(raw)].slice(0, 8);
}

function isPolicyLikeQuery(normalizedQuery = {}, domainConfig = {}) {
  const corpus = normalizeSignalText(
    [normalizedQuery?.primary_domain_id, normalizedQuery?.resolution_frame, normalizedQuery?.original_query, domainConfig?.domain_id]
      .filter(Boolean)
      .join(" ")
  );
  return /governance|policy|referendum|election|government|public_timeline|geopolit/.test(corpus);
}

function isMarketLikeQuery(normalizedQuery = {}, domainConfig = {}) {
  const corpus = normalizeSignalText(
    [normalizedQuery?.primary_domain_id, normalizedQuery?.resolution_frame, normalizedQuery?.original_query, domainConfig?.domain_id]
      .filter(Boolean)
      .join(" ")
  );
  return /market|asset|macro|bitcoin|crypto|gold|oil|nasdaq|sp500|housing|inflation|rates|economy/.test(corpus);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "CrystalCore/1.0",
      accept: "application/json,text/xml,application/rss+xml,application/xml,text/plain;q=0.8,*/*;q=0.2",
    },
  });
  if (!response.ok) {
    throw new Error(`Upstream request failed with status ${response.status}`);
  }
  return response.text();
}

function pickMarketSymbol(queryText = "", normalizedQuery = {}) {
  const corpus = normalizeSignalText([queryText, normalizedQuery?.original_query].filter(Boolean).join(" "));
  if (/\bcrypto risk appetite|crypto market\b/.test(corpus)) return { symbol: "BTC-USD", label: "Bitcoin proxy" };
  if (/\bbitcoin|btc\b/.test(corpus)) return { symbol: "BTC-USD", label: "Bitcoin" };
  if (/\bethereum|eth\b/.test(corpus)) return { symbol: "ETH-USD", label: "Ethereum" };
  if (/\bgold\b/.test(corpus)) return { symbol: "GC=F", label: "Gold futures" };
  if (/\boil|brent|crude\b/.test(corpus)) return { symbol: "CL=F", label: "Crude oil futures" };
  if (/\bnasdaq|tech stocks\b/.test(corpus)) return { symbol: "^IXIC", label: "Nasdaq Composite" };
  if (/\bs&p|sp500|s&p 500\b/.test(corpus)) return { symbol: "^GSPC", label: "S&P 500" };
  if (/\beurusd|eurusd|euro dollar\b/.test(corpus)) return { symbol: "EURUSD=X", label: "EUR/USD" };
  return null;
}

function isMacroMarketQuery(queryText = "", normalizedQuery = {}) {
  const corpus = normalizeSignalText([queryText, normalizedQuery?.original_query, normalizedQuery?.primary_domain_id].filter(Boolean).join(" "));
  return /\b(inflation|cpi|rates|ecb|fed|liquidity|macro|gdp|recession|eurusd|eur\/usd|fx|yield|unemployment)\b/.test(corpus);
}

async function fetchYahooMarketSignal(queryText, normalizedQuery = {}) {
  const target = pickMarketSymbol(queryText, normalizedQuery);
  if (!target) return null;

  try {
    const chart = await yahooFinance.chart(target.symbol, {
      period1: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      interval: "1d",
    });
    const closes = Array.isArray(chart?.quotes)
      ? chart.quotes.map((point) => Number(point?.close)).filter((value) => Number.isFinite(value))
      : [];
    if (closes.length < 8) return null;

    const recent = closes.slice(-5);
    const previous = closes.slice(-10, -5);
    const latest = recent[recent.length - 1];
    const prior = previous.length > 0 ? previous[previous.length - 1] : closes[0];
    const delta = prior ? (latest - prior) / prior : 0;
    const lean = delta > 0.02 ? "up" : delta < -0.02 ? "down" : "flat";
    const high = Math.max(...recent);
    const low = Math.min(...recent);
    const midpoint = (high + low) / 2 || latest || 1;
    const rangeWidthPct = midpoint ? (high - low) / midpoint : 0;
    const regimeRisk = rangeWidthPct >= 0.12 ? "high" : rangeWidthPct >= 0.07 ? "medium" : "low";

    return {
      signals: [
        {
          source_id: "yahoo_finance",
          label: `${target.label} price regime`,
          summary: `${target.label} is ${lean === "up" ? "pushing higher" : lean === "down" ? "under pressure" : "holding a range"} over the latest 5-session window, trading between ${low.toFixed(2)} and ${high.toFixed(2)}.`,
          lean,
          freshness_score: 0.88,
          trust_score: 0.84,
        },
      ],
      source_trust_map: [
        {
          source_id: "yahoo_finance",
          trust_score: 0.84,
          note: `${target.label} chart data over the latest 45 days.`,
        },
      ],
      conflict_map: [],
      market_metrics: {
        symbol: target.symbol,
        label: target.label,
        latest_price: Number(latest.toFixed(4)),
        prior_price: Number(prior.toFixed(4)),
        delta_pct: Number(delta.toFixed(4)),
        range_low: Number(low.toFixed(4)),
        range_high: Number(high.toFixed(4)),
        range_width_pct: Number(rangeWidthPct.toFixed(4)),
        regime_risk: regimeRisk,
      },
    };
  } catch (_error) {
    return null;
  }
}

function pickFredSeries(queryText = "", normalizedQuery = {}) {
  const corpus = normalizeSignalText([queryText, normalizedQuery?.original_query].filter(Boolean).join(" "));
  if (/\binflation|cpi|price pressure\b/.test(corpus)) return { seriesId: "CPIAUCSL", label: "US CPI" };
  if (/\bunemployment|labor market|jobs\b/.test(corpus)) return { seriesId: "UNRATE", label: "US unemployment rate" };
  if (/\brate|rates|fed funds|interest rate\b/.test(corpus)) return { seriesId: "FEDFUNDS", label: "Fed funds rate" };
  if (/\bgdp|growth|recession|economy\b/.test(corpus)) return { seriesId: "GDP", label: "US GDP" };
  return null;
}

async function fetchFredMacroSignal(fetchJson, queryText, normalizedQuery = {}) {
  const apiKey = safeText(process.env.FRED_API_KEY);
  const series = pickFredSeries(queryText, normalizedQuery);
  if (!apiKey || !series) return null;

  try {
    const payload = await fetchJson(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(series.seriesId)}&api_key=${encodeURIComponent(
        apiKey
      )}&file_type=json&sort_order=desc&limit=4`
    );
    const observations = Array.isArray(payload?.observations)
      ? payload.observations
          .map((item) => Number(item?.value))
          .filter((value) => Number.isFinite(value))
      : [];
    if (observations.length < 2) return null;

    const latest = observations[0];
    const previous = observations[1];
    const delta = latest - previous;
    const lean = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

    return {
      signals: [
        {
          source_id: "fred_api",
          label: `${series.label} macro pulse`,
          summary: `${series.label} moved from ${previous.toFixed(2)} to ${latest.toFixed(2)} in the latest observation window.`,
          lean,
          freshness_score: 0.76,
          trust_score: 0.82,
        },
      ],
      source_trust_map: [
        {
          source_id: "fred_api",
          trust_score: 0.82,
          note: `${series.label} via FRED.`,
        },
      ],
      conflict_map: [],
      macro_metrics: {
        series_id: series.seriesId,
        label: series.label,
        latest_value: Number(latest.toFixed(4)),
        previous_value: Number(previous.toFixed(4)),
        delta: Number(delta.toFixed(4)),
        lean,
      },
    };
  } catch (_error) {
    return null;
  }
}

async function fetchWikidataEntitySignal(fetchJson, normalizedQuery = {}) {
  const label = getPrimaryEntityLabel(normalizedQuery);
  if (!label) return null;

  try {
    const payload = await fetchJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=1&search=${encodeURIComponent(
        label
      )}`
    );
    const match = Array.isArray(payload?.search) ? payload.search[0] : null;
    if (!match?.id) return null;

    return {
      signals: [
        {
          source_id: "wikidata",
          label: "Entity resolution",
          summary: `Primary entity resolved as ${safeText(match.label, label)} (${safeText(match.id)}). ${safeText(match.description, "Entity metadata is available for grounding.")}`,
          lean: "flat",
          freshness_score: 0.52,
          trust_score: 0.78,
        },
      ],
      source_trust_map: [
        {
          source_id: "wikidata",
          trust_score: 0.78,
          note: `Resolved ${safeText(match.label, label)} to ${safeText(match.id)}.`,
        },
      ],
      conflict_map: [],
    };
  } catch (_error) {
    return null;
  }
}

async function fetchGdeltAttentionSignal(fetchJson, queryText, normalizedQuery = {}) {
  const tokens = keywordTokensFromQuery(queryText, normalizedQuery);
  if (!tokens.length) return null;
  const query = tokens.slice(0, 4).join(" AND ");

  try {
    const payload = await fetchJson(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=6&format=json&sort=DateDesc`
    );
    const articles = Array.isArray(payload?.articles) ? payload.articles : [];
    if (!articles.length) return null;
    const topTitles = articles.slice(0, 2).map((article) => safeText(article?.title)).filter(Boolean);

    return {
      signals: [
        {
          source_id: "gdelt",
          label: "Attention and event flow",
          summary: `Recent policy/event attention is active across ${articles.length} recent articles. ${topTitles.length ? `Latest references include ${topTitles.join(" / ")}.` : ""}`.trim(),
          lean: articles.length >= 4 ? "up" : "flat",
          freshness_score: 0.82,
          trust_score: 0.66,
        },
      ],
      source_trust_map: [
        {
          source_id: "gdelt",
          trust_score: 0.66,
          note: "Recent attention flow from the GDELT document API.",
        },
      ],
      conflict_map: [],
    };
  } catch (_error) {
    return null;
  }
}

const RSS_ALLOWLIST = [
  { source_id: "rss_allowlist", label: "Reuters World", url: "https://feeds.reuters.com/Reuters/worldNews" },
  { source_id: "rss_allowlist", label: "Reuters Business", url: "https://feeds.reuters.com/reuters/businessNews" },
];

function extractRssItems(xmlText = "") {
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  const titlePattern = /<title>([\s\S]*?)<\/title>/i;
  const descriptionPattern = /<description>([\s\S]*?)<\/description>/i;
  const items = [];
  let match = null;
  while ((match = itemPattern.exec(xmlText))) {
    const chunk = match[1] || "";
    const title = safeText((titlePattern.exec(chunk)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " "));
    const description = safeText(
      (descriptionPattern.exec(chunk)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ")
    );
    if (title) {
      items.push({ title, description });
    }
  }
  return items;
}

async function fetchAllowlistedRssSignal(queryText, normalizedQuery = {}) {
  const keywords = keywordTokensFromQuery(queryText, normalizedQuery);
  if (!keywords.length) return null;

  for (const feed of RSS_ALLOWLIST) {
    try {
      const xml = await fetchText(feed.url);
      const items = extractRssItems(xml);
      const matches = items.filter((item) => {
        const corpus = normalizeSignalText(`${item.title} ${item.description}`);
        return keywords.some((keyword) => corpus.includes(keyword));
      });
      if (!matches.length) {
        continue;
      }

      return {
        signals: [
          {
            source_id: feed.source_id,
            label: `${feed.label} signal`,
            summary: `${matches.length} allowlisted RSS items match the current query context. Lead item: ${matches[0].title}.`,
            lean: matches.length >= 3 ? "up" : "flat",
            freshness_score: 0.74,
            trust_score: 0.62,
          },
        ],
        source_trust_map: [
          {
            source_id: feed.source_id,
            trust_score: 0.62,
            note: `${feed.label} RSS allowlist match.`,
          },
        ],
        conflict_map: [],
      };
    } catch (_error) {
      continue;
    }
  }

  return null;
}

async function get20YearHistoricalContext({ db, llmRuntime, admin, runId, domain, locationFocus, analyticalFocus }) {
  const focusSegment = safeText(locationFocus || analyticalFocus, "global");
  const docId = safeText(`${domain}_${focusSegment}`.toLowerCase().replace(/[^a-z0-9._-]+/g, "_"), "global");
  if (db) {
    const snapshot = await db.collection("historical_20y_summaries").doc(docId).get();
    if (snapshot.exists) {
      return snapshot.data()?.summary || "";
    }
  }

  const prompt = `Generate a concise factual 20-year baseline for the domain "${domain}"${
    locationFocus ? ` with a focus on ${locationFocus}` : " at a global level"
  }.
${analyticalFocus ? `The current forecast question is "${analyticalFocus}". Use it to surface relevant analogs.` : ""}

Return plain text with:
1. Long cycle and regime shifts
2. Structural or regulatory changes
3. Exogenous shocks and analogs
4. Historical anchors that matter for this query

Maximum 220 words.`;

  const summary = await llmRuntime.generateText({
    modelKind: "forecast",
    temperature: 0.1,
    prompt,
  });

  if (db && safeText(summary)) {
    await db.collection("historical_20y_summaries").doc(docId).set(
      {
        summary,
        domain,
        focus: focusSegment,
        created_at: serverTimestamp(admin),
        updated_at: serverTimestamp(admin),
        generated_by: CRYSTAL_CORE_VERSION,
      },
      { merge: true }
    );
  }

  if (runId) {
    await writeArtifact(db, admin, runId, "historical_baseline_cache", {
      domain,
      focus: focusSegment,
      generated: true,
    });
  }

  return summary;
}

function buildHistoricalBundle(mainBaseline, supportingBaselines = []) {
  const sections = [];
  if (safeText(mainBaseline)) {
    sections.push(`PRIMARY BASELINE\n${mainBaseline}`);
  }
  supportingBaselines
    .filter((section) => safeText(section?.summary))
    .forEach((section) => {
      sections.push(`${section.label}\n${section.summary}`);
    });
  return sections.join("\n\n");
}

const LOCALIZED_FALLBACKS = {
  en: {
    sports_blocked: "Crystal has the match grounded, but the sports publish gate is still waiting on enough fresh lineup, injury, and preview confirmation.",
    coverage_gap: "Crystal sees early signal here, but required coverage is still too thin for a stronger public read.",
    watchlist_directional: "Crystal has orientation here, but the signals are not converged enough to publish a stronger directional card yet.",
    watchlist_conflict: "Crystal has real signal here, but the live stack is still too conflicted to treat this as decision-ready.",
    watchlist_thin: "Crystal has a readable thesis here, but the evidence stack is still too thin to sharpen it into a stronger public call.",
    binary_watchlist: "Crystal still leans {{side}}, but the edge remains partial and should be treated as a watchlist read.",
    directional_read: "Crystal has a directional read here, but the evidence is still only partially converged.",
    publishable_regime: "Crystal sees a publishable regime read here, with enough convergence to describe the active range and break risk.",
    publishable_binary: "Crystal has a publishable binary edge on {{side}}, with the caveats pushed into the evidence notes.",
    thin_signal: "Crystal has directional evidence here, but it is not yet converged enough to be treated as a clean public call.",
    default_summary: "Crystal built a directional read for \"{{query}}\".",
    verdict_blocked_sports: "Blocked pending sports publish gate",
    verdict_grounded_lean: "Grounded lean: fixture resolved, edge still partial",
    verdict_coverage_gap: "Coverage gap: hold as watchlist",
    verdict_watchlist_directional: "Watchlist: directional read not publish-ready",
    verdict_watchlist_conflict: "Watchlist: live signals still conflict",
    verdict_watchlist: "Watchlist: directional read remains tentative",
    action_blocked_sports: "Treat this as a grounded matchup read only. Wait for fresher lineup, injury, and preview confirmation before using it as a publishable sports pick.",
    action_grounded_lean: "Use this as a grounded lean, not a max-confidence pick. Watch lineups, late injuries, and market divergence before acting more aggressively.",
    action_coverage_gap: "Treat this as a watchlist item and wait for stronger source coverage before acting with conviction.",
    action_watchlist_directional: "Use this as a watchlist thesis only. Wait for stronger convergence before treating it as a public-grade directional call.",
    action_watchlist_conflict: "Treat this as a conflict watchlist and wait for the strongest live signals to resolve before acting with conviction.",
    action_watchlist: "Use this as a bounded scenario read and monitor the invalidation triggers before sizing up any action.",
    action_default: "Use this as a live directional read and keep monitoring the invalidation triggers.",
  },
  it: {
    sports_blocked: "Crystal ha agganciato la partita, ma il gate sportivo aspetta ancora conferme fresche su formazioni, infortuni e preview prima di pubblicare un pick pieno.",
    coverage_gap: "Crystal vede un primo segnale, ma la copertura richiesta e ancora troppo sottile per una lettura pubblica piu forte.",
    watchlist_directional: "Crystal ha un orientamento, ma i segnali non sono ancora abbastanza convergenti per una card direzionale piu forte.",
    watchlist_conflict: "Crystal vede segnale reale, ma lo stack live e ancora troppo in conflitto per trattarlo come decision-ready.",
    watchlist_thin: "Crystal ha una tesi leggibile, ma lo stack di evidenze e ancora troppo sottile per renderla piu netta.",
    binary_watchlist: "Crystal resta orientato su {{side}}, ma il margine e parziale e va trattato come watchlist.",
    directional_read: "Crystal ha una lettura direzionale, ma le evidenze sono ancora solo parzialmente convergenti.",
    publishable_regime: "Crystal vede una lettura di regime pubblicabile, con abbastanza convergenza per descrivere range attivo e rischio di rottura.",
    publishable_binary: "Crystal ha un edge binario pubblicabile su {{side}}, con le cautele nelle note di evidenza.",
    thin_signal: "Crystal ha evidenza direzionale, ma non e ancora abbastanza convergente per una chiamata pubblica pulita.",
    default_summary: "Crystal ha costruito una lettura direzionale per \"{{query}}\".",
    verdict_blocked_sports: "Bloccato: gate sportivo in attesa",
    verdict_grounded_lean: "Lean grounded: fixture risolta, edge ancora parziale",
    verdict_coverage_gap: "Coverage gap: tienilo in watchlist",
    verdict_watchlist_directional: "Watchlist: lettura direzionale non ancora pronta",
    verdict_watchlist_conflict: "Watchlist: i segnali live sono ancora in conflitto",
    verdict_watchlist: "Watchlist: lettura direzionale ancora provvisoria",
    action_blocked_sports: "Trattala come lettura di matchup grounded. Aspetta segnali piu freschi su formazioni, infortuni e preview prima di usarla come pick sportivo pieno.",
    action_grounded_lean: "Usala come lean grounded, non come pick a massima confidenza. Monitora formazioni, infortuni tardivi e divergenze di mercato.",
    action_coverage_gap: "Trattala come watchlist e aspetta copertura piu forte prima di agire con convinzione.",
    action_watchlist_directional: "Usala solo come tesi da watchlist. Aspetta convergenza piu forte prima di trattarla come call pubblica.",
    action_watchlist_conflict: "Trattala come watchlist in conflitto e aspetta che i segnali live piu forti si risolvano.",
    action_watchlist: "Usala come lettura di scenario limitata e monitora gli invalidatori prima di aumentare esposizione.",
    action_default: "Usala come lettura direzionale live e continua a monitorare gli invalidatori.",
  },
  es: {
    sports_blocked: "Crystal tiene el partido identificado, pero el gate deportivo espera confirmacion fresca de alineaciones, lesiones y previa antes de publicar un pick completo.",
    coverage_gap: "Crystal ve una senal inicial, pero la cobertura requerida sigue siendo demasiado fina para una lectura publica mas fuerte.",
    watchlist_directional: "Crystal tiene orientacion, pero las senales aun no convergen lo suficiente para una card direccional mas fuerte.",
    watchlist_conflict: "Crystal ve senal real, pero el stack live sigue demasiado conflictivo para tratarlo como decision-ready.",
    watchlist_thin: "Crystal tiene una tesis legible, pero el stack de evidencia sigue demasiado fino para afinarla.",
    binary_watchlist: "Crystal sigue inclinandose por {{side}}, pero la ventaja es parcial y debe tratarse como watchlist.",
    directional_read: "Crystal tiene una lectura direccional, pero la evidencia aun converge solo parcialmente.",
    publishable_regime: "Crystal ve una lectura de regimen publicable, con suficiente convergencia para describir el rango activo y el riesgo de ruptura.",
    publishable_binary: "Crystal tiene una ventaja binaria publicable en {{side}}, con las cautelas en las notas de evidencia.",
    thin_signal: "Crystal tiene evidencia direccional, pero aun no converge lo suficiente para una llamada publica limpia.",
    default_summary: "Crystal construyo una lectura direccional para \"{{query}}\".",
    verdict_blocked_sports: "Bloqueado: gate deportivo pendiente",
    verdict_grounded_lean: "Lean grounded: fixture resuelta, ventaja parcial",
    verdict_coverage_gap: "Coverage gap: mantener en watchlist",
    verdict_watchlist_directional: "Watchlist: lectura direccional no lista",
    verdict_watchlist_conflict: "Watchlist: las senales live aun chocan",
    verdict_watchlist: "Watchlist: lectura direccional tentativa",
    action_blocked_sports: "Tratalo como lectura de matchup grounded. Espera alineaciones, lesiones y previa mas frescas antes de usarlo como pick deportivo completo.",
    action_grounded_lean: "Usalo como lean grounded, no como pick de maxima confianza. Vigila alineaciones, lesiones tardias y divergencia de mercado.",
    action_coverage_gap: "Tratalo como watchlist y espera mejor cobertura antes de actuar con conviccion.",
    action_watchlist_directional: "Usalo solo como tesis de watchlist hasta que la convergencia sea mas fuerte.",
    action_watchlist_conflict: "Tratalo como watchlist en conflicto y espera que se resuelvan las senales live mas fuertes.",
    action_watchlist: "Usalo como lectura de escenario limitada y monitorea invalidadores.",
    action_default: "Usalo como lectura direccional live y sigue monitoreando invalidadores.",
  },
  fr: {
    sports_blocked: "Crystal a bien ancre le match, mais le gate sportif attend encore des confirmations fraiches sur les compos, blessures et previews avant un pick complet.",
    coverage_gap: "Crystal voit un signal initial, mais la couverture requise reste trop fine pour une lecture publique plus forte.",
    watchlist_directional: "Crystal a une orientation, mais les signaux ne convergent pas encore assez pour une card directionnelle plus forte.",
    watchlist_conflict: "Crystal voit un signal reel, mais le stack live reste trop conflictuel pour etre decision-ready.",
    watchlist_thin: "Crystal a une these lisible, mais le stack de preuves reste trop fin pour la renforcer.",
    binary_watchlist: "Crystal penche encore vers {{side}}, mais l'avantage reste partiel et doit etre traite comme watchlist.",
    directional_read: "Crystal a une lecture directionnelle, mais les preuves ne convergent encore que partiellement.",
    publishable_regime: "Crystal voit une lecture de regime publiable, avec assez de convergence pour decrire le range actif et le risque de rupture.",
    publishable_binary: "Crystal a un edge binaire publiable sur {{side}}, avec les reserves dans les notes de preuve.",
    thin_signal: "Crystal a une preuve directionnelle, mais elle ne converge pas encore assez pour un appel public net.",
    default_summary: "Crystal a construit une lecture directionnelle pour \"{{query}}\".",
    verdict_blocked_sports: "Bloque: gate sportif en attente",
    verdict_grounded_lean: "Lean grounded: fixture resolue, edge partiel",
    verdict_coverage_gap: "Coverage gap: garder en watchlist",
    verdict_watchlist_directional: "Watchlist: lecture directionnelle pas encore prete",
    verdict_watchlist_conflict: "Watchlist: les signaux live restent en conflit",
    verdict_watchlist: "Watchlist: lecture directionnelle encore tentative",
    action_blocked_sports: "Traite cela comme une lecture de matchup grounded. Attends des infos plus fraiches sur compos, blessures et previews avant un pick sportif complet.",
    action_grounded_lean: "Utilise-le comme lean grounded, pas comme pick a confiance maximale. Surveille compos, blessures tardives et divergence de marche.",
    action_coverage_gap: "Traite cela comme watchlist et attends une couverture plus forte avant d'agir avec conviction.",
    action_watchlist_directional: "Utilise cela seulement comme these de watchlist jusqu'a une convergence plus forte.",
    action_watchlist_conflict: "Traite cela comme watchlist en conflit et attends que les signaux live les plus forts se resolvent.",
    action_watchlist: "Utilise cela comme lecture de scenario limitee et surveille les invalidateurs.",
    action_default: "Utilise cela comme lecture directionnelle live et continue de surveiller les invalidateurs.",
  },
  pt: {
    sports_blocked: "Crystal ancorou o jogo, mas o gate esportivo ainda espera confirmacoes recentes de escalacoes, lesoes e previa antes de publicar um pick completo.",
    coverage_gap: "Crystal ve um sinal inicial, mas a cobertura exigida ainda e fina demais para uma leitura publica mais forte.",
    watchlist_directional: "Crystal tem orientacao, mas os sinais ainda nao convergem o bastante para uma card direcional mais forte.",
    watchlist_conflict: "Crystal ve sinal real, mas o stack live ainda esta conflitado demais para ser decision-ready.",
    watchlist_thin: "Crystal tem uma tese legivel, mas o stack de evidencias ainda e fino demais para afina-la.",
    binary_watchlist: "Crystal ainda inclina para {{side}}, mas a vantagem e parcial e deve ser tratada como watchlist.",
    directional_read: "Crystal tem uma leitura direcional, mas as evidencias ainda convergem apenas parcialmente.",
    publishable_regime: "Crystal ve uma leitura de regime publicavel, com convergencia suficiente para descrever o range ativo e o risco de ruptura.",
    publishable_binary: "Crystal tem uma vantagem binaria publicavel em {{side}}, com as cautelas nas notas de evidencia.",
    thin_signal: "Crystal tem evidencia direcional, mas ela ainda nao converge o bastante para uma chamada publica limpa.",
    default_summary: "Crystal construiu uma leitura direcional para \"{{query}}\".",
    verdict_blocked_sports: "Bloqueado: gate esportivo pendente",
    verdict_grounded_lean: "Lean grounded: fixture resolvida, vantagem parcial",
    verdict_coverage_gap: "Coverage gap: manter em watchlist",
    verdict_watchlist_directional: "Watchlist: leitura direcional ainda nao pronta",
    verdict_watchlist_conflict: "Watchlist: os sinais live ainda conflitam",
    verdict_watchlist: "Watchlist: leitura direcional ainda tentativa",
    action_blocked_sports: "Trate como leitura de matchup grounded. Espere dados mais recentes de escalacoes, lesoes e previa antes de usar como pick esportivo completo.",
    action_grounded_lean: "Use como lean grounded, nao como pick de maxima confianca. Monitore escalacoes, lesoes tardias e divergencia de mercado.",
    action_coverage_gap: "Trate como watchlist e espere cobertura mais forte antes de agir com conviccao.",
    action_watchlist_directional: "Use apenas como tese de watchlist ate haver convergencia mais forte.",
    action_watchlist_conflict: "Trate como watchlist em conflito e espere os sinais live mais fortes se resolverem.",
    action_watchlist: "Use como leitura de cenario limitada e monitore invalidadores.",
    action_default: "Use como leitura direcional live e continue monitorando invalidadores.",
  },
};

function localizedFallback(language = "en", key = "", replacements = {}) {
  const dictionary = LOCALIZED_FALLBACKS[normalizeLanguageCode(language, "en")] || LOCALIZED_FALLBACKS.en;
  const template = safeText(dictionary[key], safeText(LOCALIZED_FALLBACKS.en[key], ""));
  return Object.entries(replacements).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, safeText(value)),
    template
  );
}

function localizeReasonToken(value = "", language = "en") {
  const token = safeText(value).replace(/_/g, " ");
  if (!token || normalizeLanguageCode(language, "en") === "en") return token;
  const map = {
    it: {
      "sports publish gate pending": "gate sportivo in attesa",
      "sports market context thin": "contesto mercato sportivo sottile",
      "sports fixture resolution partial": "risoluzione fixture parziale",
      "live evidence is still light": "evidenza live ancora leggera",
      "missing required sources": "fonti richieste mancanti",
    },
    es: {
      "sports publish gate pending": "gate deportivo pendiente",
      "sports market context thin": "contexto de mercado deportivo fino",
      "sports fixture resolution partial": "resolucion parcial de fixture",
      "live evidence is still light": "evidencia live aun ligera",
      "missing required sources": "faltan fuentes requeridas",
    },
    fr: {
      "sports publish gate pending": "gate sportif en attente",
      "sports market context thin": "contexte marche sportif fin",
      "sports fixture resolution partial": "resolution de fixture partielle",
      "live evidence is still light": "preuve live encore legere",
      "missing required sources": "sources requises manquantes",
    },
    pt: {
      "sports publish gate pending": "gate esportivo pendente",
      "sports market context thin": "contexto de mercado esportivo fino",
      "sports fixture resolution partial": "resolucao parcial de fixture",
      "live evidence is still light": "evidencia live ainda leve",
      "missing required sources": "fontes exigidas ausentes",
    },
  };
  const normalized = token.toLowerCase();
  return safeText(map[normalizeLanguageCode(language, "en")]?.[normalized], token);
}

function localizeReasonList(values = [], language = "en") {
  return normalizeTextList(values, 4).map((item) => localizeReasonToken(item, language));
}

function buildEvidenceSignalsText(evidenceBundle = {}) {
  const signals = Array.isArray(evidenceBundle.live_signals) ? evidenceBundle.live_signals : [];
  if (!signals.length) {
    return "LIVE SIGNALS\n- No fresh structured live signals were available for this run.";
  }

  return `LIVE SIGNALS\n${signals.map((signal) => `- ${signal.label}: ${signal.summary}`).join("\n")}`;
}

function compactCandidateDomains(candidateDomains = []) {
  return (Array.isArray(candidateDomains) ? candidateDomains : []).slice(0, 3).map((candidate) => {
    const domain = getDomain(candidate.domain_id, GENERAL_FORECAST_DOMAIN);
    return {
      domain_id: domain.domain_id,
      short_label: domain.short_label,
      score: clamp01(candidate.score, 0.5),
      why: truncateTextForPrompt(candidate.reason || domain.summary, 120),
    };
  });
}

function compactVariablesForPrompt(values = []) {
  return (Array.isArray(values) ? values : []).slice(0, 6).map((variable) => ({
    variable_key: safeText(variable?.variable_key),
    label: safeText(variable?.label),
    causal_relevance: clamp01(variable?.causal_relevance, 0.5),
    signal_quality: clamp01(variable?.signal_quality, 0.5),
    selection_reason: truncateTextForPrompt(variable?.selection_reason || variable?.note, 120),
  }));
}

function compactSignalsForPrompt(signals = []) {
  return (Array.isArray(signals) ? signals : []).slice(0, 4).map((signal) => ({
    label: safeText(signal?.label),
    summary: truncateTextForPrompt(signal?.summary, 160),
    lean: safeText(signal?.lean, "flat"),
    freshness_score: clamp01(signal?.freshness_score, 0.5),
    trust_score: clamp01(signal?.trust_score, 0.5),
  }));
}

function compactConflictMapForPrompt(conflictMap = []) {
  return (Array.isArray(conflictMap) ? conflictMap : []).slice(0, 4).map((conflict) => ({
    issue: safeText(conflict?.issue),
    note: truncateTextForPrompt(conflict?.note, 140),
    severity: clamp01(conflict?.severity, 0.4),
  }));
}

function compactScorecardForPrompt(scorecard = {}) {
  return {
    publication_state: safeText(scorecard?.publication_state, "limited"),
    primary_call: safeText(scorecard?.primary_call),
    confidence_score: clamp01(scorecard?.confidence_score, 0.5),
    binary_contract: scorecard?.binary_contract || null,
    probability_split: scorecard?.probability_split || null,
    key_drivers: normalizeTextList(scorecard?.key_drivers, 4),
    counter_signals: normalizeTextList(scorecard?.counter_signals, 4),
    invalidators: normalizeTextList(scorecard?.invalidators, 4),
    historical_anchors: normalizeTextList(scorecard?.historical_anchors, 4),
    publication_basis: {
      reasons: normalizeTextList(scorecard?.publication_basis?.reasons, 3),
      notes: normalizeTextList(scorecard?.publication_basis?.notes, 4),
      threshold_source: safeText(scorecard?.publication_basis?.threshold_source, "static_defaults"),
      evidence_convergence: safeText(scorecard?.publication_basis?.evidence_convergence),
      evidence_strength: safeText(scorecard?.publication_basis?.evidence_strength),
      quality_verdict: safeText(scorecard?.publication_basis?.quality_verdict),
      blocker_reason: safeText(scorecard?.publication_basis?.blocker_reason),
    },
  };
}

function normalizePlannerStagePayload(payload = {}, options = {}) {
  const normalized = normalizeQueryPlanPayload(payload, options);
  return {
    ...normalized,
    candidate_domains: Array.isArray(normalized.candidate_domains) ? normalized.candidate_domains.slice(0, 3) : [],
    supporting_domains: Array.isArray(normalized.supporting_domains) ? normalized.supporting_domains.slice(0, 3) : [],
    subdomain_map: Array.isArray(normalized.subdomain_map) ? normalized.subdomain_map.slice(0, 3) : [],
    card_types: Array.isArray(normalized.card_types) ? normalized.card_types.slice(0, 3) : [],
    entities: Array.isArray(normalized.entities) ? normalized.entities.slice(0, 4) : [],
    entity_set: Array.isArray(normalized.entity_set) ? normalized.entity_set.slice(0, 4) : [],
    mode: {
      type: safeText(normalized?.mode?.type, "forecast"),
    },
  };
}

function normalizeDossierStagePayload(payload = {}, options = {}) {
  const rawPrediction =
    payload?.raw_prediction && typeof payload.raw_prediction === "object"
      ? payload.raw_prediction
      : typeof payload?.raw_prediction === "string"
        ? { primary_call: payload.raw_prediction }
        : {};
  const fallbackFeatureBundle = compactVariablesForPrompt(options?.variableSelectionPack?.selected_variables).map((variable) => ({
    label: safeText(variable?.label),
    direction: "relevant",
    confidence: clamp01(variable?.signal_quality, 0.5),
    note: safeText(variable?.selection_reason),
  }));
  const normalizedQuery = options?.normalizedQuery || {};
  const binaryContract = buildBinaryContract(
    rawPrediction?.binary_contract || {},
    normalizedQuery,
    rawPrediction?.probability_split || null,
    rawPrediction?.primary_call,
    {
      publicationState: "limited",
      confidenceScore: clamp01(rawPrediction?.confidence_score, 0.58),
      evidenceQuality: options?.evidenceQuality || {},
    }
  );

  return {
    structured_dossier:
      payload?.structured_dossier && typeof payload.structured_dossier === "object" ? payload.structured_dossier : {},
    feature_bundle: (Array.isArray(payload?.feature_bundle) ? payload.feature_bundle : fallbackFeatureBundle).slice(0, 8),
    baseline_consensus_pack:
      payload?.baseline_consensus_pack && typeof payload.baseline_consensus_pack === "object"
        ? payload.baseline_consensus_pack
        : options?.baselineConsensusPack && typeof options.baselineConsensusPack === "object"
          ? options.baselineConsensusPack
          : {},
    raw_prediction: {
      primary_call: safeText(rawPrediction?.primary_call),
      probability_split: binaryContract
        ? buildCompatibleProbabilitySplit(binaryContract)
        : rawPrediction?.probability_split && typeof rawPrediction.probability_split === "object"
          ? rawPrediction.probability_split
          : null,
      binary_contract: binaryContract,
      confidence_score: clamp01(rawPrediction?.confidence_score, 0.5),
      key_drivers: normalizeTextList(rawPrediction?.key_drivers, 4),
      counter_signals: normalizeTextList(rawPrediction?.counter_signals, 4),
      invalidators: normalizeTextList(rawPrediction?.invalidators, 4),
      historical_anchors: normalizeTextList(rawPrediction?.historical_anchors, 4),
      why_this_side: safeText(rawPrediction?.why_this_side),
      recommended_posture: safeText(rawPrediction?.recommended_posture),
      scenario_set: (Array.isArray(rawPrediction?.scenario_set) ? rawPrediction.scenario_set : []).slice(0, 4),
    },
  };
}

function normalizeVerbalizerStagePayload(payload = {}, options = {}) {
  const responseLanguage = normalizeLanguageCode(options?.normalizedQuery?.response_language, "en");
  const fallbackWhatToWatch = localizeReasonList(options?.scorecard?.invalidators, responseLanguage);
  const fallbackConfidence = Array.isArray(options?.verifiedEvidencePack?.missingness_map)
    ? localizeReasonList(options.verifiedEvidencePack.missingness_map, responseLanguage)
    : [];
  const fallbackCoverage = uniqueStrings(
    normalizeTextList(options?.scorecard?.publication_basis?.notes, 4).concat(
      Array.isArray(options?.verifiedEvidencePack?.conflict_map)
        ? options.verifiedEvidencePack.conflict_map.map((item) => safeText(item?.note || item?.issue))
        : []
    )
  ).slice(0, 4);
  const normalizedPayload = {
    title: safeText(payload?.title),
    summary: safeText(payload?.summary),
    verdict: safeText(payload?.verdict),
    recommended_action: safeText(payload?.recommended_action),
    what_to_watch: normalizeTextList(payload?.what_to_watch, 4).length
      ? normalizeTextList(payload?.what_to_watch, 4)
      : fallbackWhatToWatch,
    how_to_raise_confidence: normalizeTextList(payload?.how_to_raise_confidence, 4).length
      ? normalizeTextList(payload?.how_to_raise_confidence, 4)
      : fallbackConfidence,
      coverage_notes: normalizeTextList(payload?.coverage_notes, 4).length
        ? normalizeTextList(payload?.coverage_notes, 4)
        : localizeReasonList(fallbackCoverage, responseLanguage),
    };

  if (hasVoicePayloadLanguageMismatch(normalizedPayload, responseLanguage)) {
    return {
      title: safeText(options?.queryText),
      summary: buildQualityAwareFallbackSummary({
        queryText: safeText(options?.queryText),
        scorecard: options?.scorecard || {},
        binaryContract: options?.scorecard?.binary_contract || null,
        normalizedQuery: options?.normalizedQuery || {},
      }),
      verdict: buildQualityAwareFallbackVerdict({
        queryText: safeText(options?.queryText),
        scorecard: options?.scorecard || {},
        binaryContract: options?.scorecard?.binary_contract || null,
        normalizedQuery: options?.normalizedQuery || {},
      }),
      recommended_action: buildQualityAwareRecommendedAction(options?.scorecard || {}, options?.normalizedQuery || {}),
      what_to_watch: fallbackWhatToWatch,
      how_to_raise_confidence: fallbackConfidence,
      coverage_notes: localizeReasonList(fallbackCoverage, responseLanguage),
      language_fallback_used: true,
    };
  }

  return normalizedPayload;
}

function extractHistoricalAnchorLines(text, maxItems = 4) {
  const normalized = safeText(text);
  if (!normalized) return [];

  return uniqueStrings(
    normalized
      .split(/\n+|(?<=[.!?])\s+/)
      .map((item) => safeText(item).replace(/^[\-\d.)\s]+/, ""))
      .filter(Boolean)
  ).slice(0, maxItems);
}

function summarizeDirectionalLean(liveSignals = []) {
  const summary = { up: 0, down: 0, flat: 0 };
  for (const signal of Array.isArray(liveSignals) ? liveSignals : []) {
    const lean = safeText(signal?.lean, "flat").toLowerCase();
    if (lean === "up" || lean === "bullish" || lean === "positive") {
      summary.up += 1;
    } else if (lean === "down" || lean === "bearish" || lean === "negative") {
      summary.down += 1;
    } else {
      summary.flat += 1;
    }
  }

  if (summary.up > summary.down) return "up";
  if (summary.down > summary.up) return "down";
  return "flat";
}

function formatMarketStructureForPrompt(marketStructure = {}) {
  if (!marketStructure || typeof marketStructure !== "object") return "";
  return uniqueStrings([
    marketStructure?.trend_signal?.summary ? `trend=${marketStructure.trend_signal.summary}` : "",
    marketStructure?.range_signal?.summary ? `range=${marketStructure.range_signal.summary}` : "",
    marketStructure?.regime_risk_signal?.summary ? `regime=${marketStructure.regime_risk_signal.summary}` : "",
    marketStructure?.consensus_reference?.summary ? `consensus=${marketStructure.consensus_reference.summary}` : "",
    Array.isArray(marketStructure?.macro_context) && marketStructure.macro_context.length > 0
      ? `macro=${marketStructure.macro_context.join(" | ")}`
      : "",
  ]).join("; ");
}

function buildDirectionalMarketRead({
  queryText,
  marketStructure = {},
  keyDrivers = [],
  invalidators = [],
  domainConfig = {},
}) {
  const trendLean = safeText(marketStructure?.trend_signal?.lean, "flat").toLowerCase();
  const rangeLean = safeText(marketStructure?.range_signal?.lean, "contained").toLowerCase();
  const regimeLean = safeText(marketStructure?.regime_risk_signal?.lean, "medium").toLowerCase();
  const subject = safeText(queryText).split(/\s+/).slice(0, 4).join(" ") || safeText(domainConfig?.short_label, "This market");

  let primaryCall = `${subject} is likely to remain range-bound with mixed conviction over the selected horizon.`;
  if (trendLean === "up" && rangeLean === "contained") {
    primaryCall = `${subject} is likely to stay in range with a mild bullish bias over the selected horizon.`;
  } else if (trendLean === "down" && rangeLean === "contained") {
    primaryCall = `${subject} is likely to stay in range with a mild bearish bias over the selected horizon.`;
  } else if (trendLean === "up" && rangeLean === "wide") {
    primaryCall = `${subject} is trading with upward pressure, but the range remains wide and vulnerable to reversals.`;
  } else if (trendLean === "down" && rangeLean === "wide") {
    primaryCall = `${subject} is under pressure and trading in a wide risk range over the selected horizon.`;
  }

  const whyThisSide = uniqueStrings([
    marketStructure?.trend_signal?.summary,
    marketStructure?.range_signal?.summary,
    marketStructure?.regime_risk_signal?.summary,
    keyDrivers.length ? `The active edge is currently anchored by ${keyDrivers.slice(0, 2).join(" and ")}.` : "",
  ])
    .slice(0, 2)
    .join(" ");
  const recommendedPosture =
    regimeLean === "high"
      ? "Treat this as a fragile market read and size decisions conservatively until regime risk cools."
      : "Treat this as a bounded market read and keep watching the range and regime triggers before acting more aggressively.";
  const marketInvalidators = invalidators.length
    ? invalidators
    : uniqueStrings([
        marketStructure?.regime_risk_signal?.summary ? "A sharper regime-break signal would invalidate the current range read." : "",
        marketStructure?.trend_signal?.summary ? "A reversal in search and price momentum would flip the directional bias." : "",
      ]).slice(0, 4);

  return {
    primaryCall,
    whyThisSide,
    recommendedPosture,
    invalidators: marketInvalidators,
  };
}

function buildFallbackDossierPrediction({
  queryText,
  normalizedQuery,
  variableSelectionPack,
  verifiedEvidencePack,
  baselineConsensusPack,
}) {
  const domainConfig = getDomain(normalizedQuery?.primary_domain_id, GENERAL_FORECAST_DOMAIN);
  const evidenceQuality = verifiedEvidencePack?.evidence_quality || computeEvidenceQuality(verifiedEvidencePack, domainConfig, "extended");
  const selectedVariables = compactVariablesForPrompt(variableSelectionPack?.selected_variables);
  const liveSignals = compactSignalsForPrompt(verifiedEvidencePack?.live_signals);
  const conflictMap = compactConflictMapForPrompt(verifiedEvidencePack?.conflict_map);
  const historicalAnchors = extractHistoricalAnchorLines(verifiedEvidencePack?.historical_baseline_20y, 4);
  const keyDrivers = uniqueStrings(
    liveSignals.map((signal) => signal.label).concat(selectedVariables.map((variable) => variable.label))
  ).slice(0, 4);
  const counterSignals = uniqueStrings(
    conflictMap
      .map((conflict) => safeText(conflict?.issue || conflict?.note))
      .concat(Array.isArray(verifiedEvidencePack?.missingness_map) ? verifiedEvidencePack.missingness_map : [])
  ).slice(0, 4);
  const invalidators = uniqueStrings(
    counterSignals.concat(
      liveSignals
        .filter((signal) => safeText(signal?.lean).toLowerCase() === "down")
        .map((signal) => `Watch for deterioration in ${signal.label.toLowerCase()}.`)
    )
  ).slice(0, 4);
  const dominantLean = summarizeDirectionalLean(liveSignals);
  const binaryFrame = normalizedQuery?.binary_frame || {};
  const marketStructure = verifiedEvidencePack?.market_structure || null;
  const marketLike = Boolean(marketStructure);
  const primarySide = safeText(binaryFrame?.question_side_a, "Primary");
  const secondarySide = safeText(binaryFrame?.question_side_b, "Alternative");

  let primaryCall = "";
  let probabilitySplit = null;
  let binaryContract = null;
  let whyThisSide = "";
  let recommendedPosture = "";

  if (binaryFrame?.asks_binary_question && primarySide && secondarySide) {
    const deterministicWinner = chooseDeterministicBinaryFallbackWinner({
      primarySide,
      secondarySide,
      dominantLean,
    });
    const questionSideAProbability =
      deterministicWinner === secondarySide ? 0.44 : deterministicWinner === primarySide ? 0.56 : 0.52;
    binaryContract = buildBinaryContract(
      {
        question_side_a: primarySide,
        question_side_b: secondarySide,
        question_side_a_probability: questionSideAProbability,
        question_side_b_probability: 1 - questionSideAProbability,
        flip_conditions: invalidators,
      },
      {
        question_side_a: primarySide,
        question_side_b: secondarySide,
      },
      null,
      deterministicWinner,
      {
        publicationState: "limited",
        confidenceScore: clamp01(evidenceQuality?.coverage_score, 0.56),
        evidenceQuality,
      }
    );
    primaryCall = safeText(binaryContract?.display_call, `Lean ${primarySide} 52/48`);
    probabilitySplit = buildCompatibleProbabilitySplit(binaryContract);
    whyThisSide = keyDrivers.length
      ? `The current edge comes from ${keyDrivers.slice(0, 2).join(" and ")}.`
      : "The current edge comes from the strongest verified directional signals in the run.";
    recommendedPosture = "Treat this as a directional read and monitor the flip conditions before acting on it.";
  } else if (marketLike) {
    const marketRead = buildDirectionalMarketRead({
      queryText,
      marketStructure,
      keyDrivers,
      invalidators,
      domainConfig,
    });
    primaryCall = marketRead.primaryCall;
    whyThisSide = marketRead.whyThisSide;
    recommendedPosture = marketRead.recommendedPosture;
    invalidators.splice(0, invalidators.length, ...marketRead.invalidators);
  } else {
    const leanPhrase =
      dominantLean === "up"
        ? "tilted upward"
        : dominantLean === "down"
          ? "tilted downward"
          : "range-bound with mixed conviction";
    primaryCall = `${safeText(domainConfig?.short_label || domainConfig?.title, "This forecast")} is ${leanPhrase} over the selected horizon, based on the strongest verified signals in the run.`;
    whyThisSide = keyDrivers.length
      ? `The read is anchored by ${keyDrivers.slice(0, 3).join(", ")}.`
      : "The read is anchored by the strongest verified signals and the 20-year baseline.";
    recommendedPosture = "Use this as a directional planning read and keep watching the invalidation triggers.";
  }

  const payload = {
    structured_dossier: {
      query_normalized: safeText(queryText),
      domain_map: uniqueStrings([safeText(normalizedQuery?.primary_domain_id)].concat((normalizedQuery?.candidate_domains || []).map((item) => safeText(item?.domain_id)))).slice(0, 4),
      outcome_target: primaryCall,
      horizon: safeText(normalizedQuery?.horizon?.horizon_id || normalizedQuery?.horizons?.[0]?.horizon_id, "auto"),
      selected_variables: selectedVariables.map((variable) => variable.label).filter(Boolean).slice(0, 6),
      ranked_drivers: keyDrivers,
      macro_context: normalizeTextList(Array.isArray(baselineConsensusPack?.consensus_prediction) ? baselineConsensusPack.consensus_prediction : [safeText(baselineConsensusPack?.consensus_prediction)], 3),
      case_specific_context: uniqueStrings(
        liveSignals.map((signal) => `${signal.label}: ${signal.summary}`).concat(
          marketStructure ? [formatMarketStructureForPrompt(marketStructure)] : []
        )
      ).slice(0, 4),
      uncertainty_map: counterSignals,
      data_quality_map: Array.isArray(verifiedEvidencePack?.missingness_map) ? verifiedEvidencePack.missingness_map.slice(0, 4) : [],
    },
    feature_bundle: selectedVariables.map((variable) => ({
      label: safeText(variable?.label),
      direction: dominantLean === "flat" ? "mixed" : dominantLean,
      confidence: clamp01(variable?.signal_quality, 0.5),
      note: safeText(variable?.selection_reason, "Selected by the contextual variable selector."),
    })),
    baseline_consensus_pack: baselineConsensusPack || {},
    raw_prediction: {
      primary_call: primaryCall,
      probability_split: probabilitySplit,
      binary_contract: binaryContract,
      confidence_score: clamp01(evidenceQuality?.coverage_score * 0.55 + evidenceQuality?.freshness_score * 0.25 + (1 - clamp01(evidenceQuality?.conflict_score, 0.25)) * 0.2, 0.58),
      key_drivers: keyDrivers,
      counter_signals: counterSignals,
      invalidators,
      historical_anchors: historicalAnchors,
      why_this_side: whyThisSide,
      recommended_posture: recommendedPosture,
      scenario_set: [],
    },
  };

  return normalizeDossierStagePayload(payload, {
    baselineConsensusPack,
    variableSelectionPack,
    normalizedQuery,
    evidenceQuality,
  });
}

function buildFallbackVoicePayload({ queryText, normalizedQuery, scorecard, verifiedEvidencePack }) {
  const domainConfig = getDomain(normalizedQuery?.primary_domain_id, GENERAL_FORECAST_DOMAIN);
  const invalidators = normalizeTextList(scorecard?.invalidators, 4);
  const binaryDisplayCall = safeText(scorecard?.binary_contract?.display_call);
  const binaryContract = scorecard?.binary_contract || null;
  const responseLanguage = normalizeLanguageCode(normalizedQuery?.response_language, inferInputLanguage(queryText));
  const sportsFrame = getSportsOutcomeFrame(
    scorecard,
    verifiedEvidencePack?.sports_grounding?.model_probabilities || null,
    normalizedQuery
  );
  const sportsConfidenceHints =
    responseLanguage === "it"
      ? [
          "Aspetta formazioni ufficiali, infortuni tardivi e drift quote per stringere meglio il range.",
          "Conferma se il mercato si muove verso 1, X o 2 prima di trattare il favorito come edge pieno.",
        ]
      : responseLanguage === "es"
        ? [
            "Espera alineaciones oficiales, lesiones tardias y drift de cuotas para cerrar mejor el rango.",
            "Confirma si el mercado se mueve hacia 1, X o 2 antes de tratar al favorito como edge pleno.",
          ]
        : responseLanguage === "fr"
          ? [
              "Attends les compos officielles, blessures tardives et le drift des cotes pour resserrer le range.",
              "Confirme si le marche bouge vers 1, X ou 2 avant de traiter le favori comme un edge plein.",
            ]
          : responseLanguage === "pt"
            ? [
                "Espere escalacoes oficiais, lesoes tardias e drift de odds para apertar melhor o range.",
                "Confirme se o mercado anda para 1, X ou 2 antes de tratar o favorito como edge cheio.",
              ]
            : [
                "Wait for confirmed lineups, late injuries, and odds drift before tightening the range further.",
                "Confirm whether the market is moving toward 1, X, or 2 before treating the favorite as a full edge.",
              ];

  if (sportsFrame) {
    return normalizeVerbalizerStagePayload(
      {
        title: safeText(queryText, safeText(domainConfig?.short_label || "Crystal sports forecast")),
        summary: buildSportsOutcomeSummary({
          scorecard,
          normalizedQuery,
          sportsFrame,
        }),
        verdict: buildQualityAwareFallbackVerdict({
          queryText,
          scorecard,
          binaryContract,
          normalizedQuery,
        }),
        recommended_action: safeText(
          scorecard?.recommended_posture,
          buildQualityAwareRecommendedAction(scorecard, normalizedQuery)
        ),
        what_to_watch: localizeReasonList(
          normalizeTextList(
            (scorecard?.sports_flip_conditions && scorecard.sports_flip_conditions.length > 0
              ? scorecard.sports_flip_conditions
              : scorecard?.invalidators) || [],
            4
          ),
          responseLanguage
        ),
        how_to_raise_confidence:
          Array.isArray(verifiedEvidencePack?.missingness_map) && verifiedEvidencePack.missingness_map.length > 0
            ? localizeReasonList(verifiedEvidencePack.missingness_map, responseLanguage)
            : sportsConfidenceHints,
        coverage_notes: localizeReasonList(normalizeTextList(scorecard?.publication_basis?.notes, 4), responseLanguage),
      },
      {
        queryText,
        scorecard,
        verifiedEvidencePack,
        normalizedQuery,
      }
    );
  }

  const payload = {
    title:
      safeText(binaryDisplayCall || scorecard?.primary_call).slice(0, 92) ||
      safeText(queryText) ||
      safeText(domainConfig?.short_label || "Crystal Forecast"),
    summary: buildQualityAwareFallbackSummary({
      queryText,
      scorecard,
      binaryContract,
      normalizedQuery,
    }),
    verdict: buildQualityAwareFallbackVerdict({
      queryText,
      scorecard,
      binaryContract,
      normalizedQuery,
    }),
    recommended_action: buildQualityAwareRecommendedAction(scorecard, normalizedQuery),
    what_to_watch: localizeReasonList(invalidators, responseLanguage),
    how_to_raise_confidence: Array.isArray(verifiedEvidencePack?.missingness_map)
      ? localizeReasonList(verifiedEvidencePack.missingness_map, responseLanguage)
      : [],
    coverage_notes: localizeReasonList(normalizeTextList(scorecard?.publication_basis?.notes, 4), responseLanguage),
  };

  return normalizeVerbalizerStagePayload(payload, {
    queryText,
    scorecard,
    verifiedEvidencePack,
    normalizedQuery,
  });
}

async function fetchSearchSignals(ai, queryText, normalizedQuery, variableSelectionPack = {}) {
  if (!ai) {
    return {
      signals: [],
      source_trust_map: [],
      conflict_map: [],
      verification_summary: "Search-backed live evidence is unavailable because Gemini search is not configured.",
    };
  }

  const selectedVariables = Array.isArray(variableSelectionPack.selected_variables)
    ? variableSelectionPack.selected_variables.slice(0, 6)
    : [];

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are Crystal's deep evidence retriever.
Use Google Search to collect only recent, decision-relevant evidence.

QUERY: "${queryText}"
NORMALIZED QUERY: ${JSON.stringify(normalizedQuery)}
SELECTED VARIABLES: ${JSON.stringify(selectedVariables)}

Return JSON only with:
- signals[] { label, summary, source_id, lean, freshness_score, trust_score }
- source_trust_map[] { source_id, trust_score, note }
- conflict_map[] { issue, severity, note }
- verification_summary

Rules:
1. Keep signals concise, concrete, and recent.
2. Prefer official, institutional, or primary reporting when available.
3. If sources conflict, record the conflict instead of collapsing it.
4. Maximum 4 signals.`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          signals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                summary: { type: Type.STRING },
                source_id: { type: Type.STRING },
                lean: { type: Type.STRING },
                freshness_score: { type: Type.NUMBER },
                trust_score: { type: Type.NUMBER },
              },
            },
          },
          source_trust_map: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                source_id: { type: Type.STRING },
                trust_score: { type: Type.NUMBER },
                note: { type: Type.STRING },
              },
            },
          },
          conflict_map: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                issue: { type: Type.STRING },
                severity: { type: Type.NUMBER },
                note: { type: Type.STRING },
              },
            },
          },
          verification_summary: { type: Type.STRING },
        },
      },
    },
  });

  const payload = JSON.parse(response.text || "{}");
  return {
    signals: Array.isArray(payload?.signals)
      ? payload.signals
          .map((signal) => ({
            source_id: safeText(signal?.source_id, "search_live"),
            label: safeText(signal?.label),
            summary: safeText(signal?.summary),
            lean: safeText(signal?.lean, "flat"),
            freshness_score: clamp01(signal?.freshness_score, 0.66),
            trust_score: clamp01(signal?.trust_score, 0.64),
          }))
          .filter((signal) => signal.label && signal.summary)
          .slice(0, 4)
      : [],
    source_trust_map: Array.isArray(payload?.source_trust_map)
      ? payload.source_trust_map
          .map((item) => ({
            source_id: safeText(item?.source_id),
            trust_score: clamp01(item?.trust_score, 0.6),
            note: safeText(item?.note),
          }))
          .filter((item) => item.source_id)
      : [],
    conflict_map: Array.isArray(payload?.conflict_map)
      ? payload.conflict_map
          .map((item) => ({
            issue: safeText(item?.issue),
            severity: clamp01(item?.severity, 0.4),
            note: safeText(item?.note),
          }))
          .filter((item) => item.issue)
      : [],
    verification_summary: safeText(payload?.verification_summary, "Recent signals were retrieved and reconciled for this run."),
  };
}

function buildSourceTrustMap(searchPayload = {}, liveSignals = [], connectorTrustMap = []) {
  const fromSearch = Array.isArray(searchPayload.source_trust_map) ? searchPayload.source_trust_map : [];
  const fromSignals = (Array.isArray(liveSignals) ? liveSignals : [])
    .map((signal) => ({
      source_id: safeText(signal?.source_id),
      trust_score: clamp01(signal?.trust_score, 0.58),
      note: safeText(signal?.label),
    }))
    .filter((item) => item.source_id);

  const bySource = new Map();
  [...fromSearch, ...fromSignals, ...(Array.isArray(connectorTrustMap) ? connectorTrustMap : [])].forEach((item) => {
    if (!item.source_id) return;
    const existing = bySource.get(item.source_id);
    if (!existing || item.trust_score > existing.trust_score) {
      bySource.set(item.source_id, item);
    }
  });

  return [...bySource.values()].sort((left, right) => right.trust_score - left.trust_score).slice(0, 8);
}

function buildMissingnessMap({ baseline, liveSignals = [], predictionMarketFrame, sportsLike = false, sportsContext = null }) {
  if (sportsLike) {
    return uniqueStrings([
      sportsContext?.provider_configured ? "" : "sports_provider_missing",
      sportsContext?.grounded_read?.fixture_resolved ? "" : "sports_fixture_resolution_partial",
      sportsContext?.semantic_ready === true ? "" : safeText(sportsContext?.overlay_blocker_reason, "sports_semantic_overlay_pending"),
      sportsContext?.publish_gate_ready === true ? "" : "sports_publish_gate_pending",
    ]);
  }

  return uniqueStrings([
    safeText(baseline) ? "" : "historical_baseline_thin",
    Array.isArray(liveSignals) && liveSignals.length >= 2 ? "" : "live_signal_coverage_light",
    predictionMarketFrame ? "" : "consensus_reference_thin",
  ]);
}

function buildVerificationSummary({ searchPayload, sourceTrustMap, conflictMap, missingnessMap }) {
  return uniqueStrings([
    safeText(searchPayload?.verification_summary),
    sourceTrustMap.length > 0 ? `Verified across ${sourceTrustMap.length} source clusters.` : "",
    conflictMap.length > 0 ? `Found ${conflictMap.length} live evidence conflicts that pressure confidence.` : "",
    missingnessMap.length > 0 ? `Missingness remains in ${missingnessMap.join(", ")}.` : "",
  ]).join(" ");
}

function buildSourceUsageSummary({ queryText = "", normalizedQuery = {}, domainConfig = {}, sourceLedger = [], predictionMarketFrame = null }) {
  const usedSources = uniqueStrings(sourceLedger);
  const policyLike = isPolicyLikeQuery(normalizedQuery, domainConfig);
  const marketLike = isMarketLikeQuery(normalizedQuery, domainConfig);
  const sportsLike = isSportsLikeQuery(normalizedQuery, normalizedQuery?.original_query || queryText, domainConfig);
  const requirementSummary = buildRequiredSourcesForQuery({
    queryText,
    normalizedQuery,
    domainConfig,
    policyLike,
    marketLike,
    sportsLike,
    predictionMarketFrame,
  });
  const providerStates = buildProviderStatesForUsage({
    requiredSources: requirementSummary.required_sources,
    optionalSources: requirementSummary.optional_sources,
    usedSources,
  });
  return {
    policy_like: policyLike,
    market_like: marketLike,
    sports_like: sportsLike,
    geo_like: requirementSummary.geo_like,
    mobility_like: requirementSummary.mobility_like,
    travel_like: requirementSummary.travel_like,
    macro_public_like: requirementSummary.macro_public_like,
    energy_like: requirementSummary.energy_like,
    environment_like: requirementSummary.environment_like,
    required_sources: requirementSummary.required_sources,
    optional_sources: requirementSummary.optional_sources,
    used_sources: usedSources,
    missing_required_sources: requirementSummary.required_sources.filter((sourceId) => !usedSources.includes(sourceId)),
    missing_optional_sources: requirementSummary.optional_sources.filter((sourceId) => !usedSources.includes(sourceId)),
    provider_states: providerStates,
  };
}

function buildMarketStructure({
  queryText = "",
  normalizedQuery = {},
  liveSignals = [],
  connectorPacks = [],
  predictionMarketFrame = null,
  sourceUsage = {},
}) {
  if (!isMarketLikeQuery(normalizedQuery, getDomain(normalizedQuery?.primary_domain_id, GENERAL_FORECAST_DOMAIN))) {
    return null;
  }

  const yahooPack = connectorPacks.find((pack) => pack?.market_metrics);
  const fredPack = connectorPacks.find((pack) => pack?.macro_metrics);
  const trendSignal =
    (Array.isArray(liveSignals) ? liveSignals : []).find((signal) => safeText(signal?.source_id) === "google_trends") ||
    (Array.isArray(liveSignals) ? liveSignals : []).find((signal) => safeText(signal?.source_id) === "yahoo_finance") ||
    null;
  const marketMetrics = yahooPack?.market_metrics || null;
  const macroMetrics = fredPack?.macro_metrics || null;

  const rangeSignal = marketMetrics
    ? {
        source_id: "yahoo_finance",
        label: `${safeText(marketMetrics?.label, "Asset")} range pressure`,
        summary: `${safeText(marketMetrics?.label, "Asset")} traded between ${Number(marketMetrics?.range_low || 0).toFixed(2)} and ${Number(
          marketMetrics?.range_high || 0
        ).toFixed(2)} over the recent window, with range width ${Math.round(Number(marketMetrics?.range_width_pct || 0) * 100)}%.`,
        lean: Number(marketMetrics?.range_width_pct || 0) >= 0.08 ? "wide" : "contained",
      }
    : null;
  const regimeRiskSignal = marketMetrics
    ? {
        source_id: "yahoo_finance",
        label: `${safeText(marketMetrics?.label, "Asset")} regime risk`,
        summary: `${safeText(marketMetrics?.label, "Asset")} shows ${safeText(marketMetrics?.regime_risk, "medium")} regime-break risk with ${Math.round(
          Math.abs(Number(marketMetrics?.delta_pct || 0)) * 100
        )}% recent directional pressure.`,
        lean: safeText(marketMetrics?.regime_risk, "medium"),
      }
    : null;
  const consensusReference = predictionMarketFrame
    ? {
        source_id: "polymarket_public",
        summary: `Closest market reference leans ${safeText(
          predictionMarketFrame?.outcome || normalizedQuery?.question_side_a,
          "the bullish side"
        )} at ${Math.round(
          clamp01(predictionMarketFrame?.calibrated_probability ?? predictionMarketFrame?.implied_probability, 0.5) * 100
        )}%.`,
        match_status: safeText(predictionMarketFrame?.match_status, "reference"),
      }
    : null;
  const macroContext = uniqueStrings(
    []
      .concat(macroMetrics ? [`${safeText(macroMetrics?.label)} moved from ${Number(macroMetrics?.previous_value || 0).toFixed(2)} to ${Number(macroMetrics?.latest_value || 0).toFixed(2)}.`] : [])
      .concat(sourceUsage?.missing_optional_sources?.includes("fred_api") ? ["FRED macro context is optional and currently unavailable in this runtime."] : [])
  ).slice(0, 3);

  return {
    trend_signal: trendSignal
      ? {
          source_id: safeText(trendSignal?.source_id),
          label: safeText(trendSignal?.label),
          summary: safeText(trendSignal?.summary),
          lean: safeText(trendSignal?.lean, "flat"),
        }
      : null,
    range_signal: rangeSignal,
    regime_risk_signal: regimeRiskSignal,
    consensus_reference: consensusReference,
    macro_context: macroContext,
  };
}

function isSportsLikeQuery(normalizedQuery = {}, queryText = "", domainConfig = {}) {
  const domainId = resolveDomainId(
    safeText(normalizedQuery?.primary_domain_id || normalizedQuery?.domain_id || domainConfig?.domain_id),
    GENERAL_FORECAST_DOMAIN
  );
  if (domainId === SPORTS_MATCH_OUTCOMES_DOMAIN || domainId === SPORTS_PROBABILITY_MODE_DOMAIN) return true;
  return looksLikeSportsMatchQuery(safeText(queryText || normalizedQuery?.original_query));
}

function applySportsGroundingToQueryPlan(normalizedQuery = {}, sportsGrounding = null) {
  if (!sportsGrounding?.fixture_resolved) {
    return normalizedQuery;
  }
  const sideA = safeText(sportsGrounding?.question_side_a);
  const sideB = safeText(sportsGrounding?.question_side_b);
  if (!sideA || !sideB) {
    return normalizedQuery;
  }
  const targetDomain = resolveDomainId(
    safeText(normalizedQuery?.primary_domain_id || normalizedQuery?.domain_id),
    SPORTS_MATCH_OUTCOMES_DOMAIN
  );
  const sportsDomain = targetDomain === SPORTS_PROBABILITY_MODE_DOMAIN ? SPORTS_PROBABILITY_MODE_DOMAIN : SPORTS_MATCH_OUTCOMES_DOMAIN;

  return {
    ...normalizedQuery,
    primary_domain_id: sportsDomain,
    domain_id: sportsDomain,
    intent_shape: "binary_outcome",
    resolution_frame: "event",
    question_side_a: sideA,
    question_side_b: sideB,
    binary_frame: {
      asks_binary_question: true,
      question_side_a: sideA,
      question_side_b: sideB,
    },
  };
}

function buildSportsGroundedDossierPrediction({
  queryText,
  normalizedQuery,
  verifiedEvidencePack,
  baselineConsensusPack,
}) {
  const sportsGrounding = verifiedEvidencePack?.sports_grounding || {};
  const evidenceQuality = verifiedEvidencePack?.evidence_quality || {};
  const domainConfig = getDomain(normalizedQuery?.primary_domain_id, SPORTS_MATCH_OUTCOMES_DOMAIN);
  const keyDrivers = normalizeTextList(sportsGrounding?.key_drivers, 4);
  const counterSignals = normalizeTextList(sportsGrounding?.counter_signals, 4);
  const invalidators = normalizeTextList(sportsGrounding?.invalidators, 4);
  const historicalAnchors = extractHistoricalAnchorLines(verifiedEvidencePack?.historical_baseline_20y, 3);
  const questionSideA = safeText(sportsGrounding?.question_side_a || normalizedQuery?.question_side_a);
  const questionSideB = safeText(sportsGrounding?.question_side_b || normalizedQuery?.question_side_b);
  const previewBinaryContract =
    questionSideA && questionSideB
      ? buildBinaryContract(
          {
            question_side_a: questionSideA,
            question_side_b: questionSideB,
            winning_side: safeText(sportsGrounding?.winning_side),
            winning_probability: Number.isFinite(Number(sportsGrounding?.winning_probability))
              ? Number(sportsGrounding.winning_probability)
              : null,
            flip_conditions: invalidators,
          },
          {
            question_side_a: questionSideA,
            question_side_b: questionSideB,
          },
          null,
          safeText(sportsGrounding?.winning_side),
          {
            fallbackProbability: Number.isFinite(Number(sportsGrounding?.winning_probability))
              ? Number(sportsGrounding.winning_probability)
              : 0.56,
            publicationState: "limited",
            confidenceScore: clamp01(sportsGrounding?.overlay_confidence, 0.56),
            evidenceQuality,
          }
        )
      : null;

  if (!sportsGrounding?.provider_configured) {
    const coverageReason = sportsGrounding?.provider_configured
      ? sportsGrounding?.fixture_resolved
        ? "Crystal has the match grounded, but the sports semantic publish gate is not closed yet for a responsible pick."
        : "Crystal could not resolve the sports fixture cleanly enough to publish a grounded match pick."
      : "Crystal needs a live sports provider before it can publish a grounded match pick.";
    const payload = {
      structured_dossier: {
        query_normalized: safeText(queryText),
        domain_map: [domainConfig.domain_id],
        outcome_target: coverageReason,
        horizon: safeText(normalizedQuery?.horizon?.horizon_id || normalizedQuery?.horizons?.[0]?.horizon_id, "event"),
        selected_variables: [],
        ranked_drivers: [],
        macro_context: [],
        case_specific_context: [],
        uncertainty_map: normalizeTextList([safeText(sportsGrounding?.reason), coverageReason], 3),
        data_quality_map: normalizeTextList(
          ["sports_provider_required", safeText(sportsGrounding?.overlay_blocker_reason)],
          3
        ),
      },
      feature_bundle: [],
      baseline_consensus_pack: baselineConsensusPack || {},
      raw_prediction: {
        primary_call: coverageReason,
        probability_split: null,
        binary_contract: null,
        confidence_score: 0.18,
        key_drivers: [],
        counter_signals: normalizeTextList([coverageReason], 2),
        invalidators: normalizeTextList(
          [
            "Configure the primary sports provider and resolve the fixture before trusting a sports pick.",
            sportsGrounding?.fixture_resolved
              ? "Stand down until lineup, injury, and preview coverage is aligned tightly enough to close the sports publish gate."
              : "Stand down until the runtime can ground the match with provider data.",
          ],
          3
        ),
        historical_anchors: historicalAnchors,
        why_this_side: coverageReason,
        recommended_posture: "Treat this as a coverage gap. Crystal should not invent a sports edge without provider grounding.",
        scenario_set: [],
      },
    };
    return normalizeDossierStagePayload(payload, {
      baselineConsensusPack,
      variableSelectionPack: { selected_variables: [] },
      normalizedQuery,
      evidenceQuality,
    });
  }

  if ((!sportsGrounding?.fixture_resolved || sportsGrounding?.publish_gate_ready === false) && previewBinaryContract) {
    const coverageReason = sportsGrounding?.fixture_resolved
      ? "Crystal grounded the fixture and can show a current lean, but the live sports evidence is still only partially converged."
      : "Crystal resolved the matchup sides, but it is still waiting for a live fixture window before promoting the read into a full sports card.";
    const payload = {
      structured_dossier: {
        query_normalized: safeText(queryText),
        domain_map: [domainConfig.domain_id],
        outcome_target: previewBinaryContract.display_call || coverageReason,
        horizon: safeText(normalizedQuery?.horizon?.horizon_id || normalizedQuery?.horizons?.[0]?.horizon_id, "event"),
        selected_variables: [],
        ranked_drivers: keyDrivers,
        macro_context: [],
        case_specific_context: [],
        uncertainty_map: normalizeTextList([safeText(sportsGrounding?.reason), coverageReason], 4),
        data_quality_map: normalizeTextList(
          [safeText(sportsGrounding?.overlay_blocker_reason), safeText(sportsGrounding?.sportsbook_readiness_state)],
          4
        ),
      },
      feature_bundle: [],
      baseline_consensus_pack: baselineConsensusPack || {},
      raw_prediction: {
        primary_call: previewBinaryContract.display_call || coverageReason,
        probability_split: buildCompatibleProbabilitySplit(previewBinaryContract),
        binary_contract: previewBinaryContract,
        confidence_score: clamp01(sportsGrounding?.overlay_confidence, 0.56),
        key_drivers: keyDrivers,
        counter_signals: counterSignals,
        invalidators,
        historical_anchors: historicalAnchors,
        why_this_side: coverageReason,
        recommended_posture: sportsGrounding?.fixture_resolved
          ? "Treat this as a grounded lean with live invalidators, not as a full-confidence sports pick."
          : "Treat this as matchup context only until Crystal can anchor the active fixture window.",
        scenario_set: [
          {
            scenario_id: "scenario_primary",
            label: previewBinaryContract.winning_side,
            probability: previewBinaryContract.winning_probability,
          },
          {
            scenario_id: "scenario_secondary",
            label:
              previewBinaryContract.winning_side === questionSideA ? questionSideB : questionSideA,
            probability: Number((1 - previewBinaryContract.winning_probability).toFixed(3)),
          },
        ],
      },
    };
    return normalizeDossierStagePayload(payload, {
      baselineConsensusPack,
      variableSelectionPack: { selected_variables: [] },
      normalizedQuery,
      evidenceQuality,
    });
  }

  if (!sportsGrounding?.fixture_resolved || !sportsGrounding?.parity_ready) {
    const coverageReason = "Crystal could not resolve the sports fixture cleanly enough to publish a grounded match pick.";
    const payload = {
      structured_dossier: {
        query_normalized: safeText(queryText),
        domain_map: [domainConfig.domain_id],
        outcome_target: coverageReason,
        horizon: safeText(normalizedQuery?.horizon?.horizon_id || normalizedQuery?.horizons?.[0]?.horizon_id, "event"),
        selected_variables: [],
        ranked_drivers: [],
        macro_context: [],
        case_specific_context: [],
        uncertainty_map: normalizeTextList([safeText(sportsGrounding?.reason), coverageReason], 3),
        data_quality_map: normalizeTextList(
          ["sports_provider_required", safeText(sportsGrounding?.overlay_blocker_reason)],
          3
        ),
      },
      feature_bundle: [],
      baseline_consensus_pack: baselineConsensusPack || {},
      raw_prediction: {
        primary_call: coverageReason,
        probability_split: null,
        binary_contract: null,
        confidence_score: 0.18,
        key_drivers: [],
        counter_signals: normalizeTextList([coverageReason], 2),
        invalidators: normalizeTextList(
          [
            "Configure the primary sports provider and resolve the fixture before trusting a sports pick.",
            "Stand down until the runtime can ground the match with provider data.",
          ],
          3
        ),
        historical_anchors: historicalAnchors,
        why_this_side: coverageReason,
        recommended_posture: "Treat this as a coverage gap. Crystal should not invent a sports edge without provider grounding.",
        scenario_set: [],
      },
    };
    return normalizeDossierStagePayload(payload, {
      baselineConsensusPack,
      variableSelectionPack: { selected_variables: [] },
      normalizedQuery,
      evidenceQuality,
    });
  }

  const winningSide = safeText(sportsGrounding?.winning_side, questionSideA || "Home side");
  const winningProbability = clamp01(sportsGrounding?.winning_probability, 0.58);
  const binaryContract = buildBinaryContract(
    {
      question_side_a: questionSideA,
      question_side_b: questionSideB,
      winning_side: winningSide,
      winning_probability: winningProbability,
      question_side_a_probability: winningSide === questionSideA ? winningProbability : 1 - winningProbability,
      question_side_b_probability: winningSide === questionSideB ? winningProbability : 1 - winningProbability,
      flip_conditions: invalidators,
    },
    {
      question_side_a: questionSideA,
      question_side_b: questionSideB,
    },
    null,
    winningSide,
    {
      publicationState: "limited",
      confidenceScore: 0.62,
      evidenceQuality: {
        ...evidenceQuality,
        coverage_score: Math.max(0.6, Number(evidenceQuality?.coverage_score || 0.6)),
      },
    }
  );
  const payload = {
    structured_dossier: {
      query_normalized: safeText(queryText),
      domain_map: [SPORTS_MATCH_OUTCOMES_DOMAIN],
      outcome_target: safeText(binaryContract?.display_call, `Lean ${winningSide} 58/42`),
      horizon: safeText(normalizedQuery?.horizon?.horizon_id || normalizedQuery?.horizons?.[0]?.horizon_id, "event"),
      selected_variables: ["sports_provider_grounding", "recent_form", "odds_snapshot"],
      ranked_drivers: keyDrivers,
      macro_context: [],
      case_specific_context: keyDrivers,
      uncertainty_map: counterSignals,
      data_quality_map: normalizeTextList(verifiedEvidencePack?.missingness_map, 3),
    },
    feature_bundle: keyDrivers.map((label, index) => ({
      label,
      direction: winningSide === questionSideA ? "up" : "down",
      confidence: Number((0.72 - index * 0.08).toFixed(2)),
      note: "Grounded directly in the shared sports provider path.",
    })),
    baseline_consensus_pack: baselineConsensusPack || {},
    raw_prediction: {
      primary_call: safeText(binaryContract?.display_call, `Lean ${winningSide} 58/42`),
      probability_split: buildCompatibleProbabilitySplit(binaryContract),
      binary_contract: binaryContract,
      confidence_score: 0.64,
      key_drivers: keyDrivers,
      counter_signals: counterSignals,
      invalidators,
      historical_anchors: historicalAnchors,
      why_this_side:
        safeText(sportsGrounding?.reason) ||
        `Sports-provider grounding currently leans ${winningSide} on structured recent form, table context, and any active enhancer signals.`,
      recommended_posture:
        "Treat this as a provider-grounded sports read and keep watching lineups, odds drift, and late availability news.",
      scenario_set: [],
    },
  };
  return normalizeDossierStagePayload(payload, {
    baselineConsensusPack,
    variableSelectionPack: { selected_variables: [] },
    normalizedQuery,
    evidenceQuality,
  });
}

function normalizeScenarioSet(rawScenarioSet = [], probabilitySplit = null, sportsFrame = null) {
  if (Array.isArray(rawScenarioSet) && rawScenarioSet.length > 0) {
    return rawScenarioSet
      .map((scenario, index) => ({
        scenario_id: safeText(scenario?.scenario_id, `scenario_${index + 1}`),
        label: safeText(scenario?.label),
        probability: clamp01(scenario?.probability, 0.33),
      }))
      .filter((scenario) => scenario.label)
      .slice(0, 4);
  }

  if (probabilitySplit && probabilitySplit.primary_label && probabilitySplit.secondary_label) {
    return [
      {
        scenario_id: "scenario_primary",
        label: probabilitySplit.primary_label,
        probability: clamp01(probabilitySplit.primary_probability, 0.58),
      },
      {
        scenario_id: "scenario_secondary",
        label: probabilitySplit.secondary_label,
        probability: clamp01(probabilitySplit.secondary_probability, 0.42),
      },
    ];
  }

  const sportsScenarioSet = buildSportsScenarioSetFromFrame(sportsFrame);
  if (sportsScenarioSet.length > 0) {
    return sportsScenarioSet;
  }

  return [];
}

function localizeSportsDrawLabel(language = "en") {
  const responseLanguage = normalizeLanguageCode(language, "en");
  if (responseLanguage === "it") return "Pareggio";
  if (responseLanguage === "es") return "Empate";
  if (responseLanguage === "fr") return "Nul";
  if (responseLanguage === "pt") return "Empate";
  return "Draw";
}

function getSportsOutcomeFrame(scorecard = {}, fallbackFrame = null, normalizedQuery = {}) {
  const domainId = safeText(normalizedQuery?.primary_domain_id || normalizedQuery?.domain_id || normalizedQuery?.domain);
  if (domainId !== SPORTS_MATCH_OUTCOMES_DOMAIN && domainId !== SPORTS_PROBABILITY_MODE_DOMAIN) {
    return null;
  }
  const frame =
    scorecard?.sports_model_probabilities ||
    scorecard?.publication_basis?.sports_model_probabilities ||
    fallbackFrame ||
    null;
  if (!frame || typeof frame !== "object") return null;
  const home = Number(frame?.home);
  const draw = Number(frame?.draw);
  const away = Number(frame?.away);
  if (![home, draw, away].every(Number.isFinite)) return null;
  return {
    ...frame,
    home: clamp01(home, 0),
    draw: clamp01(draw, 0),
    away: clamp01(away, 0),
    home_label: safeText(frame?.home_label, safeText(normalizedQuery?.question_side_a, "Home")),
    draw_label:
      safeText(frame?.draw_label).toLowerCase() === "draw"
        ? localizeSportsDrawLabel(normalizedQuery?.response_language)
        : safeText(frame?.draw_label, localizeSportsDrawLabel(normalizedQuery?.response_language)),
    away_label: safeText(frame?.away_label, safeText(normalizedQuery?.question_side_b, "Away")),
    favorite_label: safeText(frame?.favorite_label),
    favorite_key: safeText(frame?.favorite_key),
    favorite_probability: Number.isFinite(Number(frame?.favorite_probability))
      ? clamp01(Number(frame.favorite_probability), 0)
      : null,
  };
}

function formatSportsOutcomePercent(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? `${Math.round(clamp01(normalized, 0) * 100)}%` : "--";
}

function buildSportsOneXTwoLine(frame = null) {
  if (!frame) return "";
  return [
    `1 ${safeText(frame.home_label, "Home")} ${formatSportsOutcomePercent(frame.home)}`,
    `X ${safeText(frame.draw_label, "Draw")} ${formatSportsOutcomePercent(frame.draw)}`,
    `2 ${safeText(frame.away_label, "Away")} ${formatSportsOutcomePercent(frame.away)}`,
  ].join(" | ");
}

function buildSportsScenarioSetFromFrame(frame = null) {
  if (!frame) return [];
  return [
    {
      scenario_id: "sports_home_win",
      label: `1 ${safeText(frame.home_label, "Home")}`,
      probability: clamp01(frame.home, 0),
    },
    {
      scenario_id: "sports_draw",
      label: `X ${safeText(frame.draw_label, "Draw")}`,
      probability: clamp01(frame.draw, 0),
    },
    {
      scenario_id: "sports_away_win",
      label: `2 ${safeText(frame.away_label, "Away")}`,
      probability: clamp01(frame.away, 0),
    },
  ];
}

function buildSportsOutcomeSummary({
  scorecard = {},
  normalizedQuery = {},
  sportsFrame = null,
}) {
  if (!sportsFrame) return "";
  const responseLanguage = normalizeLanguageCode(normalizedQuery?.response_language, "en");
  const favoriteLabel =
    safeText(sportsFrame.favorite_label) ||
    [sportsFrame.home_label, sportsFrame.draw_label, sportsFrame.away_label][
      [sportsFrame.home, sportsFrame.draw, sportsFrame.away].indexOf(
        Math.max(Number(sportsFrame.home || 0), Number(sportsFrame.draw || 0), Number(sportsFrame.away || 0))
      )
    ] ||
    safeText(sportsFrame.home_label, "Home");
  const favoriteProbability = formatSportsOutcomePercent(
    sportsFrame.favorite_probability != null ? sportsFrame.favorite_probability : Math.max(sportsFrame.home, sportsFrame.draw, sportsFrame.away)
  );
  const decisionReason = safeText(
    scorecard?.sports_decision_reason,
    safeText(scorecard?.publication_basis?.sports_decision_reason)
  );
  const noBetReason = safeText(
    scorecard?.sports_no_bet_reason,
    safeText(scorecard?.publication_basis?.sports_no_bet_reason)
  );
  const state = safeText(
    scorecard?.sports_decision_state,
    safeText(scorecard?.publication_basis?.sports_decision_state)
  );
  const detail = safeText(noBetReason || decisionReason);

  if (responseLanguage === "it") {
    const base = `La mappa 1X2 non e piatta: 1 vale ${formatSportsOutcomePercent(sportsFrame.home)}, X vale ${formatSportsOutcomePercent(sportsFrame.draw)} e 2 vale ${formatSportsOutcomePercent(sportsFrame.away)}. L'esito singolo piu probabile resta ${favoriteLabel} a ${favoriteProbability}.`;
    if (state === "no_bet" && detail) return `${base} ${detail}`;
    if (detail) return `${base} ${detail}`;
    return `${base} Favorita non significa esito certo: il pareggio e l'altro lato restano ancora vivi nel range del match.`;
  }
  if (responseLanguage === "es") {
    const base = `El mapa 1X2 no esta colapsado: 1 vale ${formatSportsOutcomePercent(sportsFrame.home)}, X vale ${formatSportsOutcomePercent(sportsFrame.draw)} y 2 vale ${formatSportsOutcomePercent(sportsFrame.away)}. El resultado individual mas probable sigue siendo ${favoriteLabel} con ${favoriteProbability}.`;
    return detail ? `${base} ${detail}` : `${base} Favorito no significa resultado seguro: el empate y el otro lado siguen vivos.`;
  }
  if (responseLanguage === "fr") {
    const base = `La carte 1X2 n'est pas ecrasee: 1 vaut ${formatSportsOutcomePercent(sportsFrame.home)}, X vaut ${formatSportsOutcomePercent(sportsFrame.draw)} et 2 vaut ${formatSportsOutcomePercent(sportsFrame.away)}. L'issue individuelle la plus probable reste ${favoriteLabel} a ${favoriteProbability}.`;
    return detail ? `${base} ${detail}` : `${base} Favori ne veut pas dire issue certaine: le nul et l'autre cote restent vivants.`;
  }
  if (responseLanguage === "pt") {
    const base = `O mapa 1X2 nao esta colapsado: 1 vale ${formatSportsOutcomePercent(sportsFrame.home)}, X vale ${formatSportsOutcomePercent(sportsFrame.draw)} e 2 vale ${formatSportsOutcomePercent(sportsFrame.away)}. O resultado individual mais provavel segue sendo ${favoriteLabel} com ${favoriteProbability}.`;
    return detail ? `${base} ${detail}` : `${base} Favorito nao significa resultado garantido: empate e o outro lado seguem vivos.`;
  }
  const base = `The 1X2 map is not collapsed: 1 sits at ${formatSportsOutcomePercent(sportsFrame.home)}, X at ${formatSportsOutcomePercent(sportsFrame.draw)}, and 2 at ${formatSportsOutcomePercent(sportsFrame.away)}. The single most likely outcome remains ${favoriteLabel} at ${favoriteProbability}.`;
  return detail ? `${base} ${detail}` : `${base} Favorite does not mean certain winner: the draw and the other side are still live.`;
}

function confidenceTier(score) {
  if (score >= 0.78) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function buildStakeLevel(domainId = "") {
  return /safety|geopolitics|governance|health/.test(safeText(domainId)) ? "high" : "medium";
}

function normalizeBinaryLabelForHeuristics(value = "") {
  return safeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function chooseDeterministicBinaryFallbackWinner({ primarySide = "", secondarySide = "", dominantLean = "flat" }) {
  const primary = safeText(primarySide, "Primary");
  const secondary = safeText(secondarySide, "Alternative");
  const primaryNorm = normalizeBinaryLabelForHeuristics(primary);
  const secondaryNorm = normalizeBinaryLabelForHeuristics(secondary);

  if (dominantLean === "up") return primary;
  if (dominantLean === "down") return secondary;

  const prudencePattern = /\b(wait|hold off|delay|later|pause|not yet|aspetta|aspettare|rimanda|rinvia)\b/;
  const immediatePattern = /\b(act now|now|do it now|book now|buy now|rent now|move now|start now|agisci subito|subito)\b/;
  const survivePattern = /\b(survive|sopravvivera|survival)\b/;
  const failPattern = /\b(fail|failure|die|chiude|fallisce)\b/;

  if (prudencePattern.test(primaryNorm) && immediatePattern.test(secondaryNorm)) return primary;
  if (prudencePattern.test(secondaryNorm) && immediatePattern.test(primaryNorm)) return secondary;
  if (prudencePattern.test(primaryNorm)) return primary;
  if (prudencePattern.test(secondaryNorm)) return secondary;

  if (survivePattern.test(primaryNorm) && failPattern.test(secondaryNorm)) return primary;
  if (survivePattern.test(secondaryNorm) && failPattern.test(primaryNorm)) return secondary;

  return primary;
}

function shouldUseDeterministicDossierFallback({ normalizedQuery = {}, verifiedEvidencePack = {} }) {
  const binaryFrame = normalizedQuery?.binary_frame || {};
  if (!binaryFrame?.asks_binary_question) return false;

  const domainId = safeText(normalizedQuery?.primary_domain_id);
  const sourceCount = Number(verifiedEvidencePack?.evidence_quality?.source_count || 0);
  const missingness = Array.isArray(verifiedEvidencePack?.missingness_map) ? verifiedEvidencePack.missingness_map : [];
  const thinCoverage =
    sourceCount <= 0 &&
    missingness.some((item) => safeText(item).includes("thin")) &&
    missingness.some((item) => safeText(item).includes("light"));

  if (!thinCoverage) return false;

  return domainId === "B.3.8.personal_decisions_and_tradeoffs" || domainId === "B.3.5.business_idea_outcomes";
}

const LANGUAGE_ALIASES = {
  it: "it",
  ita: "it",
  italian: "it",
  italiano: "it",
  en: "en",
  eng: "en",
  english: "en",
  es: "es",
  spa: "es",
  spanish: "es",
  espanol: "es",
  "espanol": "es",
  fr: "fr",
  fre: "fr",
  french: "fr",
  francais: "fr",
  "francais": "fr",
  pt: "pt",
  por: "pt",
  portuguese: "pt",
  portugues: "pt",
  "portugues": "pt",
};

const RESPONSE_LANGUAGE_NAMES = {
  it: "Italian",
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
};

function normalizeLanguageCode(value = "", fallback = "en") {
  const normalized = safeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]+/g, "");
  const prefix = normalized.slice(0, 2);
  if (["it", "en", "es", "fr", "pt"].includes(prefix)) return prefix;
  return LANGUAGE_ALIASES[normalized] || LANGUAGE_ALIASES[safeText(fallback).toLowerCase()] || "en";
}

function inferInputLanguage(queryText = "") {
  const normalized = safeText(queryText)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return "en";

  const patterns = {
    it: [
      { pattern: /\b(cosa|come|dovrei|partita|stasera|domani|vince|vincere|prossim[oa]|contro|tra|fra|affittare|sopravviverebbe|passera|finira|italia|costituzionale)\b/g, weight: 1 },
      { pattern: /\b(si|no)\b/g, weight: 0.2 },
    ],
    es: [
      { pattern: /\b(como|pronostico|resultado|partido|esta noche|manana|gana|ganar|proximo|proxima|entre|quien|empate)\b/g, weight: 1 },
      { pattern: /\b(si|no)\b/g, weight: 0.15 },
    ],
    fr: [
      { pattern: /\b(comment|pronostic|resultat|match|ce soir|demain|gagne|prochain|prochaine|entre|nul)\b/g, weight: 1 },
      { pattern: /\b(oui|non)\b/g, weight: 0.2 },
    ],
    pt: [
      { pattern: /\b(como|palpite|resultado|jogo|hoje|amanha|vence|ganhar|proximo|proxima|entre|empate|nao)\b/g, weight: 1 },
      { pattern: /\b(sim|nao)\b/g, weight: 0.2 },
    ],
  };
  const scores = Object.fromEntries(
    Object.entries(patterns).map(([language, matchers]) => [
      language,
      matchers.reduce((total, matcher) => total + ((normalized.match(matcher.pattern) || []).length * matcher.weight), 0),
    ])
  );
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  if ((ranked[0]?.[1] || 0) > 0) {
    return ranked[0][0];
  }
  return "en";
}

function detectVoicePayloadLanguage(payload = {}) {
  const text = [
    safeText(payload?.title),
    safeText(payload?.summary),
    safeText(payload?.verdict),
    safeText(payload?.recommended_action),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (text.split(/\s+/).filter(Boolean).length < 4) return "";
  return inferInputLanguage(text);
}

function hasVoicePayloadLanguageMismatch(payload = {}, expectedLanguage = "en") {
  const expected = normalizeLanguageCode(expectedLanguage, "en");
  if (!["it", "en", "es", "fr", "pt"].includes(expected)) return false;
  const detected = detectVoicePayloadLanguage(payload);
  return Boolean(detected && detected !== expected);
}

function normalizeAmbiguityLevel(value = "", confidence = 0.62) {
  const normalized = safeText(value).toLowerCase();
  if (["low", "medium", "high"].includes(normalized)) return normalized;
  if (confidence >= 0.72) return "low";
  if (confidence <= 0.44) return "high";
  return "medium";
}

function normalizeFixtureResolutionPolicy(value = "", fallback = "") {
  const normalized = safeText(value, fallback).toLowerCase();
  if (!normalized) return "";
  if (normalized === "fixed_date") return "exact_date";
  if (normalized === "nearest_date") return "closest_date";
  return normalized;
}

function buildResolutionPolicy(payload = {}, { sportsLike = false } = {}) {
  const rawPolicy = payload?.resolution_policy && typeof payload.resolution_policy === "object" ? payload.resolution_policy : {};
  const explicitFixtureDate = safeText(payload?.event_date || payload?.fixture?.fixture_date || payload?.fixture?.date_hint);
  const fixturePolicy = normalizeFixtureResolutionPolicy(
    rawPolicy.fixture_resolution_policy || payload.fixture_resolution_policy || payload?.fixture?.fixture_resolution_policy,
    explicitFixtureDate ? "exact_date" : sportsLike ? "next_available" : ""
  );
  return {
    fixture_resolution_policy: fixturePolicy,
    auto_resolve_if_confident: rawPolicy.auto_resolve_if_confident === false ? false : sportsLike,
    min_confidence: clamp01(rawPolicy.min_confidence ?? payload.fixture_resolution_min_confidence, 0.72),
    ambiguity_handling: safeText(rawPolicy.ambiguity_handling, "hold_when_uncertain"),
  };
}

function normalizeQueryPlanPayload(payload = {}, options = {}) {
  const routingHints = options?.routingHints || {};
  const fallbackDomain = safeText(options?.fallbackDomain, GENERAL_FORECAST_DOMAIN);
  const mergedPayload = mergeQueryPlanWithRouting(payload, routingHints, { fallbackDomain });
  const allowedIntentShapes = new Set(["binary_outcome", "directional_range", "timing", "ranking", "comparison"]);
  const allowedResolutionFrames = new Set(["event", "trend", "decision", "market", "policy", "personal"]);
  const domainId = safeText(mergedPayload?.primary_domain_id || mergedPayload?.domain_id || mergedPayload?.domain, fallbackDomain);
  const normalizedDomain = isSupportedDomain(domainId) ? resolveDomainId(domainId, fallbackDomain) : fallbackDomain;
  const horizons =
    Array.isArray(mergedPayload?.horizons) && mergedPayload.horizons.length > 0 ? mergedPayload.horizons : [{ horizon_id: "30d" }];
  const domainCardTypes = getDomainCardTypes(normalizedDomain);
  const defaultCardType = safeText(options?.defaultCardType, domainCardTypes[0] || "forecast_band");
  const cardTypes =
    Array.isArray(mergedPayload?.card_types) && mergedPayload.card_types.length > 0
      ? mergedPayload.card_types
      : [{ card_type_id: defaultCardType }];
  const entities = Array.isArray(mergedPayload?.entities) ? mergedPayload.entities : [];
  const subdomainMap =
    Array.isArray(mergedPayload?.subdomain_map) && mergedPayload.subdomain_map.length > 0
      ? mergedPayload.subdomain_map
      : (Array.isArray(mergedPayload?.candidate_domains) ? mergedPayload.candidate_domains : [])
          .slice(0, 3)
          .map((candidate) => ({
            domain_id: candidate.domain_id,
            label: safeText(candidate.short_label || candidate.title, candidate.domain_id),
            score: clamp01(candidate.score, 0.5),
          }));

  const horizon = horizons[0] || { horizon_id: "30d" };
  const geography = {
    label: safeText(mergedPayload?.jurisdiction || mergedPayload?.filters?.location || getPrimaryLocationFromPlan(mergedPayload), "Auto"),
    jurisdiction: safeText(mergedPayload?.jurisdiction),
  };
  const intentShape = safeText(mergedPayload?.intent_shape, routingHints.intentShape || "directional_range");
  const normalizedIntentShape = allowedIntentShapes.has(intentShape) ? intentShape : routingHints.intentShape || "directional_range";
  const resolutionFrame = safeText(mergedPayload?.resolution_frame, routingHints.resolutionFrame || "trend");
  const normalizedResolutionFrame = allowedResolutionFrames.has(resolutionFrame)
    ? resolutionFrame
    : routingHints.resolutionFrame || "trend";
  let questionSideA = normalizedIntentShape === "binary_outcome" ? safeText(mergedPayload?.question_side_a) : "";
  let questionSideB = normalizedIntentShape === "binary_outcome" ? safeText(mergedPayload?.question_side_b) : "";
  const originalQuery = safeText(options?.queryText, safeText(mergedPayload?.original_query));
  const languageHint = normalizeLanguageCode(options?.languageHint || options?.requestLanguage, inferInputLanguage(originalQuery));
  const inputLanguage = normalizeLanguageCode(mergedPayload?.input_language || mergedPayload?.source_language, languageHint);
  const responseLanguage = normalizeLanguageCode(
    mergedPayload?.response_language || mergedPayload?.output_language || mergedPayload?.target_language,
    inputLanguage
  );
  const interpretationConfidence = clamp01(
    mergedPayload?.interpretation_confidence ?? mergedPayload?.confidence ?? mergedPayload?.query_confidence,
    0.62
  );
  const sportsLike =
    normalizedDomain === SPORTS_MATCH_OUTCOMES_DOMAIN ||
    normalizedDomain === SPORTS_PROBABILITY_MODE_DOMAIN ||
    looksLikeSportsMatchQuery(originalQuery);
  const resolutionPolicy = buildResolutionPolicy(mergedPayload, { sportsLike });
  const normalizedTeams = Array.isArray(mergedPayload?.teams)
    ? mergedPayload.teams
        .map((team) => (typeof team === "string" ? safeText(team) : safeText(team?.label || team?.name || team?.team)))
        .filter(Boolean)
    : [];
  const normalizedFixture =
    mergedPayload?.fixture && typeof mergedPayload.fixture === "object"
      ? mergedPayload.fixture
      : {
          home_team: safeText(mergedPayload?.home_team || mergedPayload?.fixture_home_team),
          away_team: safeText(mergedPayload?.away_team || mergedPayload?.fixture_away_team),
          fixture_date: safeText(mergedPayload?.event_date || mergedPayload?.fixture_date),
          competition_hint: safeText(mergedPayload?.competition_hint),
          date_hint: safeText(mergedPayload?.date_hint || mergedPayload?.event_date),
        };
  if (sportsLike && (!questionSideA || !questionSideB)) {
    const teamEntityLabels = entities
      .filter((entity) => ["team", "club", "sports_team"].includes(safeText(entity?.entity_type).toLowerCase()))
      .map((entity) => safeText(entity?.label || entity?.entity_id))
      .filter(Boolean);
    const fallbackTeams = normalizedTeams.length >= 2 ? normalizedTeams : teamEntityLabels;
    questionSideA = questionSideA || safeText(normalizedFixture?.home_team || normalizedFixture?.homeTeam) || fallbackTeams[0] || "";
    questionSideB = questionSideB || safeText(normalizedFixture?.away_team || normalizedFixture?.awayTeam) || fallbackTeams[1] || "";
  }
  if (sportsLike) {
    questionSideA = safeText(questionSideA.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "").trim(), questionSideA);
    questionSideB = safeText(questionSideB.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "").trim(), questionSideB);
  }
  const temporalContext = buildTemporalContext(safeText(options?.queryText), {
    timeZone: options?.timeZone,
    asOfUtc: options?.asOfUtc,
    eventDate: safeText(mergedPayload?.event_date),
  });

  return {
    plan_version: safeText(mergedPayload?.plan_version, "crystal-core-v1"),
    pipeline_version: CRYSTAL_CORE_VERSION,
    catalog_version_id: safeText(mergedPayload?.catalog_version_id, CATALOG_VERSION_ID),
    primary_domain_id: normalizedDomain,
    domain_id: normalizedDomain,
    candidate_domains: Array.isArray(mergedPayload?.candidate_domains) ? mergedPayload.candidate_domains : [],
    intent_shape: normalizedIntentShape,
    resolution_frame: normalizedResolutionFrame,
    confidence_mode: safeText(mergedPayload?.confidence_mode, "rigorous"),
    mode: {
      type: mergedPayload?.mode?.type === "predict_action" ? "predict_action" : "forecast",
    },
    entity_set: Array.isArray(mergedPayload?.entity_set) ? mergedPayload.entity_set : [],
    entities,
    entity_map: entities,
    teams: normalizedTeams,
    fixture: normalizedFixture,
    horizons,
    horizon,
    geography,
    card_types: cardTypes,
    question_side_a: questionSideA,
    question_side_b: questionSideB,
    binary_frame: {
      asks_binary_question: Boolean(questionSideA && questionSideB),
      question_side_a: questionSideA,
      question_side_b: questionSideB,
    },
    temporal_context: temporalContext,
    event_date: safeText(mergedPayload?.event_date),
    governing_entity: safeText(mergedPayload?.governing_entity),
    jurisdiction: safeText(mergedPayload?.jurisdiction),
    supporting_domains: Array.isArray(mergedPayload?.supporting_domains) ? mergedPayload.supporting_domains : [],
    subdomain_map: subdomainMap,
    research_depth_preference: "deep",
    original_query: originalQuery,
    canonical_query: safeText(mergedPayload?.canonical_query || mergedPayload?.normalized_query || mergedPayload?.query_english, originalQuery),
    input_language: inputLanguage,
    response_language: responseLanguage,
    response_language_name: RESPONSE_LANGUAGE_NAMES[responseLanguage] || "English",
    interpretation_confidence: interpretationConfidence,
    ambiguity_level: normalizeAmbiguityLevel(mergedPayload?.ambiguity_level, interpretationConfidence),
    resolution_policy: resolutionPolicy,
  };
}

function buildGenericQueryPlanPrompt(queryText, routingHints = {}) {
  const candidateLines = compactCandidateDomains(routingHints?.candidateDomains)
    .map((candidate) => `- ${candidate.domain_id} (${candidate.score})`)
    .join("\n");
  const resolvedEntities = Array.isArray(routingHints?.entities)
    ? routingHints.entities.map((entity) => safeText(entity?.label)).filter(Boolean).slice(0, 4).join(", ")
    : "";
  const policyHint = Boolean(routingHints?.policyLike);
  const temporalContext = routingHints?.temporalContext || null;
  const resolvedWindowLabel = safeText(temporalContext?.resolved_time_window?.label);
  const inferredLanguage = normalizeLanguageCode(routingHints?.languageHint, inferInputLanguage(queryText));

  return `Query: "${safeText(queryText)}"
Detected input language hint: ${inferredLanguage}
Preferred domain: ${safeText(routingHints.primaryDomainId, GENERAL_FORECAST_DOMAIN)}
Intent hint: ${safeText(routingHints.intentShape, "directional_range")}
Resolution frame hint: ${safeText(routingHints.resolutionFrame, "trend")}
Binary side A: ${safeText(routingHints?.binaryFrame?.question_side_a)}
Binary side B: ${safeText(routingHints?.binaryFrame?.question_side_b)}
Policy/governance hint: ${policyHint ? "yes" : "no"}
Event date hint: ${safeText(routingHints?.eventDate)}
Jurisdiction hint: ${safeText(routingHints?.jurisdiction)}
Governing entity hint: ${safeText(routingHints?.governingEntity)}
As-of UTC: ${safeText(temporalContext?.as_of_utc)}
As-of local date: ${safeText(temporalContext?.as_of_local_date)}
As-of timezone: ${safeText(temporalContext?.as_of_timezone)}
Relative time phrase: ${safeText(temporalContext?.relative_phrase)}
Resolved time window: ${resolvedWindowLabel}
Resolved entities: ${resolvedEntities}
Supporting domains: ${Array.isArray(routingHints?.supportingDomains) ? routingHints.supportingDomains.slice(0, 3).join(", ") : ""}
Candidate domains:
${candidateLines || "- none"}

Return one JSON object only with keys:
input_language, response_language, canonical_query, primary_domain_id, intent_shape, resolution_frame, mode, entities, teams, fixture, question_side_a, question_side_b, event_date, jurisdiction, governing_entity, interpretation_confidence, ambiguity_level, resolution_policy.

Rules:
- Act as Crystal's Universal Query Interpreter. Understand the user query in any language, then emit a canonical QueryPlan for the existing prediction pipeline.
- Set input_language and response_language as ISO-like short codes such as "it", "en", "es", "fr", or "pt"; response_language must match the user's input language.
- canonical_query should be an English, provider-friendly rewrite that preserves all user intent and entities.
- Choose a concrete domain whenever possible.
- Use ${GENERAL_FORECAST_DOMAIN} only as a last resort.
- If the query is sports shorthand such as "Roma Inter", infer that it asks about the next available fixture between those teams, fill entities with team records, set teams ["Roma","Inter"], set fixture.home_team, fixture.away_team, fixture_resolution_policy to "next_available", auto_resolve_if_confident to true, and min_confidence to 0.72.
- If the question is binary, fill question_side_a, question_side_b, event_date, jurisdiction and governing_entity whenever the query implies them.
- If this is a policy/governance or public timeline question, preserve event_date, jurisdiction, governing_entity, and the policy route unless the hints are clearly wrong.
- For policy/governance questions, do not return ${GENERAL_FORECAST_DOMAIN} when a plausible institutional outcome, jurisdiction, or governing actor is already present in the hints.
- Leave question_side_a and question_side_b empty only when the question is not binary.
- Set interpretation_confidence from 0 to 1 and ambiguity_level to low, medium, or high.
- Use mode {"type":"forecast"}.
- No markdown. No commentary. No wrapper keys.`;
}

function buildDossierPredictionPrompt({
  queryText,
  normalizedQuery,
  variableSelectionPack,
  verifiedEvidencePack,
  baselineConsensusPack,
}) {
  const entityLabels = Array.isArray(normalizedQuery?.entities)
    ? normalizedQuery.entities.map((entity) => safeText(entity?.label)).filter(Boolean).slice(0, 4)
    : [];
  const marketStructureSummary = formatMarketStructureForPrompt(verifiedEvidencePack?.market_structure);
  const temporalContext = normalizedQuery?.temporal_context || null;

  return `Query: "${safeText(queryText)}"
Domain: ${safeText(normalizedQuery?.primary_domain_id)}
Intent: ${safeText(normalizedQuery?.intent_shape)}
Resolution frame: ${safeText(normalizedQuery?.resolution_frame)}
As-of UTC: ${safeText(temporalContext?.as_of_utc)}
As-of local date: ${safeText(temporalContext?.as_of_local_date)}
As-of timezone: ${safeText(temporalContext?.as_of_timezone)}
Relative time phrase: ${safeText(temporalContext?.relative_phrase)}
Resolved time window: ${safeText(temporalContext?.resolved_time_window?.label)}
Event date: ${safeText(normalizedQuery?.event_date)}
Entities: ${entityLabels.join(", ")}
Selected variables: ${compactVariablesForPrompt(variableSelectionPack?.selected_variables)
    .map((variable) => variable.label)
    .filter(Boolean)
    .join("; ")}
Historical baseline: ${truncateTextForPrompt(verifiedEvidencePack?.historical_baseline_20y, 700)}
Live signals: ${compactSignalsForPrompt(verifiedEvidencePack?.live_signals)
    .map((signal) => `${signal.label}: ${signal.summary}`)
    .join("; ")}
Conflicts: ${compactConflictMapForPrompt(verifiedEvidencePack?.conflict_map)
    .map((conflict) => conflict.issue || conflict.note)
    .join("; ")}
Verification summary: ${safeText(verifiedEvidencePack?.verification_summary)}
Consensus note: ${safeText(baselineConsensusPack?.consensus_prediction)}
Market structure: ${marketStructureSummary}

Return one JSON object only with keys:
structured_dossier, raw_prediction.

Rules:
- Publish a directional thesis only when the evidence is clearly oriented and internally converged.
- If the evidence is informative but still thin, conflicted, or coverage-limited, keep the raw prediction readable but conservative enough for a watchlist or coverage_gap outcome.
- Keep structured_dossier compact.
- If this is a markets/assets question, reason explicitly in this order: trend, range, regime risk, consensus.
- raw_prediction must include primary_call, confidence_score, key_drivers, counter_signals, invalidators, historical_anchors, why_this_side, recommended_posture.
- If the question is binary, include probability_split with explicit side labels and binary_contract with question_side_a, question_side_b, winning_side, winning_probability, flip_conditions, and keep winning_side explicit.
- Do not force a binary contract for directional/range markets queries.
- For binary calls, set why_this_side, winning_side, and losing_side so the winner never has to be inferred from prose.
- Do not leave the winner implicit in the prose.
- No markdown. No commentary. No wrapper keys.`;
}

function buildForecastVerbalizationPrompt({ queryText, normalizedQuery, verifiedEvidencePack, scorecard }) {
  const compactScorecard = compactScorecardForPrompt(scorecard);
  const entityLabels = Array.isArray(normalizedQuery?.entities)
    ? normalizedQuery.entities.map((entity) => safeText(entity?.label)).filter(Boolean).slice(0, 4)
    : [];
  const temporalContext = normalizedQuery?.temporal_context || null;
  const responseLanguage = normalizeLanguageCode(normalizedQuery?.response_language, inferInputLanguage(queryText));
  const responseLanguageName = RESPONSE_LANGUAGE_NAMES[responseLanguage] || "English";

  return `Query: "${safeText(queryText)}"
Canonical query: "${safeText(normalizedQuery?.canonical_query)}"
Input language: ${safeText(normalizedQuery?.input_language)}
Response language: ${responseLanguage} (${responseLanguageName})
Domain: ${safeText(normalizedQuery?.primary_domain_id)}
Intent: ${safeText(normalizedQuery?.intent_shape)}
Resolution frame: ${safeText(normalizedQuery?.resolution_frame)}
As-of UTC: ${safeText(temporalContext?.as_of_utc)}
As-of local date: ${safeText(temporalContext?.as_of_local_date)}
As-of timezone: ${safeText(temporalContext?.as_of_timezone)}
Relative time phrase: ${safeText(temporalContext?.relative_phrase)}
Resolved time window: ${safeText(temporalContext?.resolved_time_window?.label)}
Event date: ${safeText(normalizedQuery?.event_date)}
Entities: ${entityLabels.join(", ")}
Call: ${safeText(compactScorecard.primary_call)}
Publication state: ${safeText(compactScorecard.publication_state, "limited")}
Confidence: ${clamp01(compactScorecard.confidence_score, 0.5)}
Binary contract: ${JSON.stringify(compactScorecard.binary_contract || null)}
Probability split: ${JSON.stringify(compactScorecard.probability_split || null)}
Drivers: ${compactScorecard.key_drivers.join("; ")}
Counter signals: ${compactScorecard.counter_signals.join("; ")}
Invalidators: ${compactScorecard.invalidators.join("; ")}
Historical anchors: ${compactScorecard.historical_anchors.join("; ")}
Trust note: ${safeText(verifiedEvidencePack?.verification_summary)}
Coverage notes: ${normalizeTextList(compactScorecard.publication_basis?.notes, 4).join("; ")}
Quality verdict: ${safeText(compactScorecard.publication_basis?.quality_verdict)}
Blocker reason: ${safeText(compactScorecard.publication_basis?.blocker_reason)}

Return one JSON object only with keys:
title, summary, verdict, recommended_action, what_to_watch, how_to_raise_confidence, coverage_notes.

Rules:
- Write every user-facing field in ${responseLanguageName}. Preserve team names, tickers, people, places, and provider names verbatim.
- State the call first.
- If the scorecard is binary, keep the compact verdict aligned with binary_contract.display_call.
- Keep every field short, precise, and product-like.
- If the state is limited, keep the thesis and put the caution in summary or coverage_notes.
- If the quality verdict is coverage_gap or blocked_no_pick, say that plainly and do not overstate certainty.
- No markdown. No commentary. No wrapper keys.`;
}

function buildQualityAwareFallbackSummary({ queryText, scorecard = {}, binaryContract = null, normalizedQuery = {} }) {
  const publicationState = safeText(scorecard?.publication_state, "limited");
  const qualityVerdict = safeText(scorecard?.publication_basis?.quality_verdict, publicationState === "published" ? "publishable" : "watchlist");
  const blockerReason = safeText(scorecard?.publication_basis?.blocker_reason);
  const intentShape = safeText(normalizedQuery?.intent_shape, binaryContract ? "binary_outcome" : "directional_range");
  const responseLanguage = normalizeLanguageCode(normalizedQuery?.response_language, inferInputLanguage(queryText));
  const sportsFrame = getSportsOutcomeFrame(scorecard, null, normalizedQuery);

  if (sportsFrame) {
    return buildSportsOutcomeSummary({
      scorecard,
      normalizedQuery,
      sportsFrame,
    });
  }

  if (qualityVerdict === "blocked_no_pick") {
    return localizedFallback(responseLanguage, "sports_blocked");
  }
  if (qualityVerdict === "coverage_gap") {
    return localizedFallback(responseLanguage, "coverage_gap");
  }
  if (qualityVerdict === "watchlist") {
    if (blockerReason === "directional_signal_not_publish_ready") {
      return localizedFallback(responseLanguage, "watchlist_directional");
    }
    if (blockerReason === "conflicting_live_signals") {
      return localizedFallback(responseLanguage, "watchlist_conflict");
    }
    if (blockerReason === "thin_evidence_coverage") {
      return localizedFallback(responseLanguage, "watchlist_thin");
    }
    return binaryContract
      ? localizedFallback(responseLanguage, "binary_watchlist", { side: safeText(binaryContract.winning_side, "the current leader") })
      : localizedFallback(responseLanguage, "directional_read");
  }
  if (intentShape === "range_regime") {
    return localizedFallback(responseLanguage, "publishable_regime");
  }
  if (binaryContract) {
    return localizedFallback(responseLanguage, "publishable_binary", { side: safeText(binaryContract.winning_side, "the leading side") });
  }
  if (blockerReason === "thin_signal_convergence") {
    return localizedFallback(responseLanguage, "thin_signal");
  }
  return safeText(
    scorecard?.why_this_side,
    localizedFallback(responseLanguage, "default_summary", { query: safeText(queryText, "this query") })
  );
}

function buildQualityAwareFallbackVerdict({ queryText, scorecard = {}, binaryContract = null, normalizedQuery = {} }) {
  const publicationState = safeText(scorecard?.publication_state, "limited");
  const qualityVerdict = safeText(scorecard?.publication_basis?.quality_verdict, publicationState === "published" ? "publishable" : "watchlist");
  const responseLanguage = normalizeLanguageCode(normalizedQuery?.response_language, inferInputLanguage(queryText));
  const sportsFrame = getSportsOutcomeFrame(scorecard, null, normalizedQuery);

  if (sportsFrame) {
    if (responseLanguage === "it") return `1X2 live: ${buildSportsOneXTwoLine(sportsFrame)}`;
    if (responseLanguage === "es") return `1X2 en vivo: ${buildSportsOneXTwoLine(sportsFrame)}`;
    if (responseLanguage === "fr") return `1X2 live: ${buildSportsOneXTwoLine(sportsFrame)}`;
    if (responseLanguage === "pt") return `1X2 ao vivo: ${buildSportsOneXTwoLine(sportsFrame)}`;
    return `Live 1X2: ${buildSportsOneXTwoLine(sportsFrame)}`;
  }

  if (binaryContract?.display_call && qualityVerdict !== "blocked_no_pick") {
    return binaryContract.display_call;
  }
  if (qualityVerdict === "blocked_no_pick") {
    return localizedFallback(responseLanguage, "verdict_blocked_sports");
  }
  if (qualityVerdict === "grounded_lean") {
    return safeText(scorecard?.primary_call, localizedFallback(responseLanguage, "verdict_grounded_lean"));
  }
  if (qualityVerdict === "coverage_gap") {
    return localizedFallback(responseLanguage, "verdict_coverage_gap");
  }
  if (qualityVerdict === "watchlist") {
    if (scorecard?.publication_basis?.blocker_reason === "directional_signal_not_publish_ready") {
      return safeText(scorecard?.primary_call, localizedFallback(responseLanguage, "verdict_watchlist_directional"));
    }
    if (scorecard?.publication_basis?.blocker_reason === "conflicting_live_signals") {
      return safeText(scorecard?.primary_call, localizedFallback(responseLanguage, "verdict_watchlist_conflict"));
    }
    return safeText(scorecard?.primary_call, localizedFallback(responseLanguage, "verdict_watchlist"));
  }
  if (safeText(normalizedQuery?.intent_shape) === "range_regime") {
    return safeText(scorecard?.primary_call, localizedFallback(responseLanguage, "publishable_regime"));
  }
  if (binaryContract?.winning_side) {
    return safeText(
      binaryContract.display_call,
      localizedFallback(responseLanguage, "publishable_binary", { side: binaryContract.winning_side })
    );
  }
  return safeText(scorecard?.primary_call, localizedFallback(responseLanguage, "directional_read"));
}

function buildQualityAwareRecommendedAction(scorecard = {}, normalizedQuery = {}) {
  const qualityVerdict = safeText(scorecard?.publication_basis?.quality_verdict);
  const responseLanguage = normalizeLanguageCode(normalizedQuery?.response_language || scorecard?.response_language, "en");
  if (qualityVerdict === "blocked_no_pick") {
    return localizedFallback(responseLanguage, "action_blocked_sports");
  }
  if (qualityVerdict === "grounded_lean") {
    return localizedFallback(responseLanguage, "action_grounded_lean");
  }
  if (qualityVerdict === "coverage_gap") {
    return localizedFallback(responseLanguage, "action_coverage_gap");
  }
  if (qualityVerdict === "watchlist") {
    if (scorecard?.publication_basis?.blocker_reason === "directional_signal_not_publish_ready") {
      return localizedFallback(responseLanguage, "action_watchlist_directional");
    }
    if (scorecard?.publication_basis?.blocker_reason === "conflicting_live_signals") {
      return localizedFallback(responseLanguage, "action_watchlist_conflict");
    }
    return localizedFallback(responseLanguage, "action_watchlist");
  }
  return safeText(
    scorecard?.recommended_posture,
    localizedFallback(responseLanguage, "action_default")
  );
}

function buildFinalCard({
  runId,
  queryText,
  normalizedQuery,
  scorecard,
  voicePayload,
  verifiedEvidencePack,
  simulationDigest,
  calibrationSnapshot = null,
  resolutionTarget = null,
  evaluationEligible = false,
  runtimeTransport = "local_core",
  rolloutBucket = null,
}) {
  const domainConfig = getDomain(normalizedQuery.primary_domain_id, GENERAL_FORECAST_DOMAIN);
  const binaryContract = scorecard?.binary_contract || null;
  const probabilitySplit = scorecard?.probability_split || null;
  const sportsOutcomeFrame = getSportsOutcomeFrame(scorecard, null, normalizedQuery);
  const scenarioSet = normalizeScenarioSet(
    Array.isArray(scorecard?.scenario_set) ? scorecard.scenario_set : [],
    probabilitySplit,
    sportsOutcomeFrame
  );
  const evidenceQuality =
    verifiedEvidencePack?.evidence_quality && typeof verifiedEvidencePack.evidence_quality === "object"
      ? verifiedEvidencePack.evidence_quality
      : computeEvidenceQuality(verifiedEvidencePack, domainConfig, "extended");
  const confidenceScore = clamp01(scorecard?.confidence_score, 0.58);
  const publicationState = safeText(scorecard?.publication_state, "limited");
  const sportsContractState = computeSportsContractState({
    sportsGrounding: verifiedEvidencePack?.sports_grounding,
    semanticOverlay: verifiedEvidencePack?.sports_semantic_overlay,
  });
  const derivedSportsDecision = buildSportsDecisionFrame({
    sportsGrounding: verifiedEvidencePack?.sports_grounding || {},
    sportsMarketOverlay: verifiedEvidencePack?.sports_market_overlay || {},
    sportsSemanticOverlay: verifiedEvidencePack?.sports_semantic_overlay || {},
    sportsContractState,
    domainId: safeText(normalizedQuery?.primary_domain_id || normalizedQuery?.domain_id || normalizedQuery?.domain),
    simulationTuning: {
      probability_delta: simulationDigest?.probability_delta,
      confidence_delta: simulationDigest?.confidence_delta,
      quality_score: simulationDigest?.quality_score,
      graph_coverage: simulationDigest?.graph_coverage,
      agent_convergence: simulationDigest?.agent_convergence,
      notes: Array.isArray(simulationDigest?.notes) ? simulationDigest.notes : [],
    },
  });
  const sportsDecision =
    simulationDigest?.sports_decision && typeof simulationDigest.sports_decision === "object"
      ? simulationDigest.sports_decision
      : derivedSportsDecision;
  const domainId = safeText(normalizedQuery?.primary_domain_id || normalizedQuery?.domain_id || normalizedQuery?.domain);
  const whaleMode =
    scorecard?.whale_mode && typeof scorecard.whale_mode === "object"
      ? scorecard.whale_mode
      : buildGenericDecisionKernel({
          domainId,
          normalizedQuery,
          scorecard,
          evidenceBundle: verifiedEvidencePack,
          simulationDigest,
          sportsDecision,
        });
  const coordinationTrace = buildCoordinationTrace({
    domainId,
    normalizedQuery,
    evidenceBundle: verifiedEvidencePack,
    simulationDigest,
    scorecard,
    sportsDecision,
    runtimeContext: "predict",
  });
  const publicationBasis =
    scorecard?.publication_basis && typeof scorecard.publication_basis === "object"
      ? {
          ...scorecard.publication_basis,
          decision_state: safeText(scorecard?.decision_state, safeText(whaleMode?.decision_state)) || undefined,
          decision_reason: safeText(scorecard?.decision_reason, safeText(whaleMode?.decision_reason)) || undefined,
          reference_source_class:
            safeText(scorecard?.reference_source_class, safeText(whaleMode?.reference_source_class, "none")) || undefined,
          reference_probability:
            scorecard?.reference_probability == null
              ? whaleMode?.reference_probability ?? undefined
              : Number(scorecard.reference_probability),
          edge_delta: scorecard?.edge_delta == null ? whaleMode?.edge_delta ?? undefined : Number(scorecard.edge_delta),
          fragility_score:
            scorecard?.fragility_score == null ? whaleMode?.fragility_score ?? undefined : Number(scorecard.fragility_score),
          no_action_reason: safeText(scorecard?.no_action_reason, safeText(whaleMode?.no_action_reason)) || undefined,
          flip_conditions:
            Array.isArray(scorecard?.flip_conditions) && scorecard.flip_conditions.length
              ? scorecard.flip_conditions
              : Array.isArray(whaleMode?.flip_conditions)
                ? whaleMode.flip_conditions
                : undefined,
          simulation_confidence:
            scorecard?.simulation_confidence == null
              ? whaleMode?.simulation_confidence ?? undefined
              : Number(scorecard.simulation_confidence),
          sports_decision_state:
            safeText(scorecard?.sports_decision_state, safeText(sportsDecision?.decision_state)) || undefined,
          sports_decision_reason:
            safeText(scorecard?.sports_decision_reason, safeText(sportsDecision?.decision_reason)) || undefined,
          sports_no_bet_reason:
            safeText(scorecard?.sports_no_bet_reason, safeText(sportsDecision?.no_bet_reason)) || undefined,
          sports_model_probabilities:
            scorecard?.sports_model_probabilities || sportsDecision?.model_probabilities || undefined,
          sports_market_probabilities:
            scorecard?.sports_market_probabilities || sportsDecision?.market_probabilities || undefined,
          sports_edge_delta: scorecard?.sports_edge_delta || sportsDecision?.edge_delta || undefined,
          sports_fair_prices: scorecard?.sports_fair_prices || sportsDecision?.fair_prices || undefined,
          sports_fragility_score: Number.isFinite(Number(scorecard?.sports_fragility_score))
            ? Number(scorecard.sports_fragility_score)
            : sportsDecision?.fragility_score ?? undefined,
          sports_simulation_confidence: Number.isFinite(Number(scorecard?.sports_simulation_confidence))
            ? Number(scorecard.sports_simulation_confidence)
            : sportsDecision?.simulation_confidence ?? undefined,
          sports_model_favorite:
            safeText(scorecard?.sports_model_favorite, safeText(sportsDecision?.model_favorite)) || undefined,
          sports_market_favorite:
            safeText(scorecard?.sports_market_favorite, safeText(sportsDecision?.market_favorite)) || undefined,
          sports_favorite_but_no_bet:
            scorecard?.sports_favorite_but_no_bet === true || sportsDecision?.favorite_but_no_bet === true,
          sports_fixture_kind:
            safeText(verifiedEvidencePack?.sports_grounding?.sports_fixture_kind) || undefined,
          sports_fixture_candidate_score: Number.isFinite(Number(verifiedEvidencePack?.sports_grounding?.sports_fixture_candidate_score))
            ? Number(verifiedEvidencePack.sports_grounding.sports_fixture_candidate_score)
            : undefined,
          sports_fixture_resolution_reason:
            safeText(verifiedEvidencePack?.sports_grounding?.sports_fixture_resolution_reason) || undefined,
          sports_fixture_date_match: verifiedEvidencePack?.sports_grounding?.sports_fixture_date_match === true,
          sports_fixture_competition_match:
            verifiedEvidencePack?.sports_grounding?.sports_fixture_competition_match == null
              ? undefined
              : verifiedEvidencePack.sports_grounding.sports_fixture_competition_match === true,
          sports_market_source:
            safeText(
              verifiedEvidencePack?.sports_grounding?.sports_market_source,
              safeText(verifiedEvidencePack?.sports_market_overlay?.sports_market_source)
            ) || undefined,
          sports_market_source_class:
            safeText(
              verifiedEvidencePack?.sports_grounding?.sports_market_source_class,
              safeText(verifiedEvidencePack?.sports_market_overlay?.sports_market_source_class, "none")
            ) || undefined,
          sports_market_quality_tier:
            safeText(
              verifiedEvidencePack?.sports_grounding?.sports_market_quality_tier,
              safeText(verifiedEvidencePack?.sports_market_overlay?.sports_market_quality_tier, "none")
            ) || undefined,
          sports_market_snapshot:
            verifiedEvidencePack?.sports_grounding?.sports_market_snapshot ||
            verifiedEvidencePack?.sports_market_overlay?.sports_market_snapshot ||
            undefined,
          sports_market_overround:
            verifiedEvidencePack?.sports_grounding?.sports_market_overround == null
              ? verifiedEvidencePack?.sports_market_overlay?.sports_market_overround ?? undefined
              : Number(verifiedEvidencePack.sports_grounding.sports_market_overround),
        }
      : null;
  const now = nowIso();
  const temporalContext =
    normalizedQuery?.temporal_context && typeof normalizedQuery.temporal_context === "object"
      ? normalizedQuery.temporal_context
      : buildTemporalContext(queryText, {
          eventDate: safeText(normalizedQuery?.event_date),
        });
  const runAsOfUtc = safeText(temporalContext?.as_of_utc, now);
  const runAsOfTimezone = safeText(temporalContext?.as_of_timezone, "Europe/Rome");
  const runAsOfLocalDate = safeText(temporalContext?.as_of_local_date);
  const responseLanguage = normalizeLanguageCode(normalizedQuery?.response_language, inferInputLanguage(queryText));
  const resolvedTimeWindow = temporalContext?.resolved_time_window || null;
  const eventDate = safeText(
    normalizedQuery?.event_date,
    safeText(resolutionTarget?.event_date, safeText(resolvedTimeWindow?.end_date))
  ) || null;
  const resolutionDueAt = safeText(
    resolutionTarget?.resolution_due_at,
    safeText(normalizedQuery?.resolution_due_at)
  ) || null;
  const resolutionStatus = evaluationEligible ? "pending" : "skipped";
  const rawSportsbookReadinessState =
    safeText(
      verifiedEvidencePack?.sports_grounding?.sportsbook_readiness_state,
      safeText(verifiedEvidencePack?.sports_market_overlay?.sportsbook_readiness_state)
    ) || undefined;
  const normalizedSportsbookReadinessState =
    domainId === SPORTS_PROBABILITY_MODE_DOMAIN
      ? sportsContractState.sportsPublishGateReady
        ? sportsB36LiveEnabled()
          ? "probability_mode_live"
          : "probability_mode_preview"
        : sportsContractState.sportsGrounded && safeText(sportsContractState.sportsPickState) === "grounded_lean"
          ? "probability_mode_preview"
          : rawSportsbookReadinessState || "benchmark_only"
      : rawSportsbookReadinessState;
  const coverageNotes = uniqueStrings(
    normalizeTextList(voicePayload?.coverage_notes, 4).concat(
      normalizeTextList(scorecard?.publication_basis?.notes, 4),
      Array.isArray(verifiedEvidencePack?.conflict_map)
        ? verifiedEvidencePack.conflict_map.map((item) => safeText(item?.note || item?.issue))
        : []
    )
  ).slice(0, 4);
  const whatToWatch = uniqueStrings(
    normalizeTextList(voicePayload?.what_to_watch, 4).concat(normalizeTextList(scorecard?.invalidators, 4))
  ).slice(0, 4);
  const howToRaiseConfidence = uniqueStrings(
    normalizeTextList(voicePayload?.how_to_raise_confidence, 4).concat(
      Array.isArray(verifiedEvidencePack?.missingness_map)
        ? localizeReasonList(verifiedEvidencePack.missingness_map, responseLanguage)
        : []
    )
  ).slice(0, 4);

  return {
    card_id: safeText(runId, crypto.randomUUID()),
    card_type: getDomainCardTypes(domainConfig.domain_id)[0] || "forecast_band",
    canonical_card_type: getDomainCardTypes(domainConfig.domain_id)[0] || "forecast_band",
    card_state: publicationState,
    version_id: `catalog_${CATALOG_VERSION_ID}_${CRYSTAL_CORE_VERSION}`,
    domain: domainConfig.domain_id,
    stakes_level: buildStakeLevel(domainConfig.domain_id),
    risk_band: publicationState === "published" ? "medium" : "high",
    query_origin: safeText(queryText),
    canonical_query: safeText(normalizedQuery?.canonical_query, safeText(queryText)),
    input_language: safeText(normalizedQuery?.input_language, responseLanguage),
    response_language: responseLanguage,
    title: safeText(voicePayload?.title, safeText(queryText, "Crystal Forecast")),
    summary: safeText(
      voicePayload?.summary,
      buildQualityAwareFallbackSummary({ queryText, scorecard, binaryContract, normalizedQuery })
    ),
    verdict: safeText(
      voicePayload?.verdict,
      buildQualityAwareFallbackVerdict({ queryText, scorecard, binaryContract, normalizedQuery })
    ),
    primary_call: safeText(
      buildSportsOneXTwoLine(sportsOutcomeFrame),
      safeText(scorecard?.primary_call, safeText(binaryContract?.display_call))
    ),
    temporal_context: temporalContext,
    run_as_of_utc: runAsOfUtc,
    run_as_of_timezone: runAsOfTimezone,
    run_as_of_local_date: runAsOfLocalDate,
    relative_time_phrase: safeText(temporalContext?.relative_phrase),
    resolved_time_window: resolvedTimeWindow,
    event_date: eventDate,
    resolution_due_at: resolutionDueAt,
    resolution_status: resolutionStatus,
    published_at: now,
    updated_at: now,
    binary_contract: binaryContract,
    probability_split: probabilitySplit,
    why_this_side: safeText(scorecard?.why_this_side),
    personal_output: safeText(
      voicePayload?.recommended_action,
      buildQualityAwareRecommendedAction(scorecard, normalizedQuery)
    ),
    scenario_set: scenarioSet,
    so_what: [],
    drivers: buildDriverObjects(scorecard?.key_drivers || []),
    counter_signals: normalizeTextList(scorecard?.counter_signals, 4),
    historical_anchors: normalizeTextList(scorecard?.historical_anchors, 4),
    invalidators: normalizeTextList(scorecard?.invalidators, 4),
    publication_basis: publicationBasis,
    what_to_watch: whatToWatch,
    how_to_raise_confidence: howToRaiseConfidence,
    evidence_drawer: {
      metrics_provenance: uniqueStrings(verifiedEvidencePack.source_ledger || []).slice(0, 8),
      source_usage: verifiedEvidencePack?.source_usage || undefined,
      freshness_summary: {
        as_of_utc: safeText(verifiedEvidencePack?.prediction_market_frame?.price_updated_at, now),
        cadence: safeText(domainConfig.refresh_cadence, "session-based"),
        staleness_bucket: evidenceQuality.freshness_score >= 0.66 ? "fresh" : evidenceQuality.freshness_score <= 0.32 ? "stale" : "unknown",
      },
      coverage_notes: coverageNotes,
      quality_summary: {
        evidence_convergence: safeText(scorecard?.publication_basis?.evidence_convergence),
        evidence_strength: safeText(scorecard?.publication_basis?.evidence_strength),
        source_coverage_state: safeText(scorecard?.publication_basis?.source_coverage_state),
        blocker_reason: safeText(scorecard?.publication_basis?.blocker_reason),
        threshold_source: safeText(scorecard?.publication_basis?.threshold_source, "static_defaults"),
      },
      gating_reason:
        publicationState === "published" ? "published" : publicationState === "limited" ? "limited_by_evidence" : "blocked_by_policy",
    },
    trust_layer: {
      confidence_score: confidenceScore,
      confidence_tier: confidenceTier(confidenceScore),
      threshold_source: safeText(scorecard?.publication_basis?.threshold_source, "static_defaults"),
      quality_verdict: safeText(scorecard?.publication_basis?.quality_verdict),
      data_sufficiency_flag:
        publicationState === "published" ? "sufficient" : evidenceQuality.coverage_score >= 0.45 ? "partial" : "insufficient",
      freshness: {
        staleness_bucket: evidenceQuality.freshness_score >= 0.66 ? "fresh" : evidenceQuality.freshness_score <= 0.32 ? "stale" : "unknown",
        as_of_utc: safeText(verifiedEvidencePack?.prediction_market_frame?.price_updated_at, now),
      },
      provenance_summary: {
        verification_level: publicationState === "published" ? "verified" : "partially_verified",
        license_summary: uniqueStrings(verifiedEvidencePack.source_ledger || []).slice(0, 6),
      },
    },
    prediction_market_frame: verifiedEvidencePack?.prediction_market_frame || null,
    coordination_trace: coordinationTrace || undefined,
    world_sim: simulationDigest || whaleMode
      ? {
          ...(simulationDigest || {}),
          sports_decision: simulationDigest?.sports_decision || sportsDecision || null,
          whale_mode: whaleMode || null,
          coordination_trace: coordinationTrace || null,
        }
      : undefined,
    resolution_target: resolutionTarget || undefined,
    evaluation_eligible: Boolean(evaluationEligible),
    runtime_transport: safeText(runtimeTransport, "local_core"),
    rollout_bucket: rolloutBucket ? safeText(rolloutBucket) : undefined,
    calibration_snapshot: calibrationSnapshot || undefined,
    sports_grounding: verifiedEvidencePack?.sports_grounding || undefined,
    sports_semantic_overlay: verifiedEvidencePack?.sports_semantic_overlay || undefined,
    sports_market_overlay: verifiedEvidencePack?.sports_market_overlay || undefined,
    sports_semantic_ready: verifiedEvidencePack?.sports_grounding?.semantic_ready === true,
    sports_overlay_confidence: Number.isFinite(Number(verifiedEvidencePack?.sports_grounding?.overlay_confidence))
      ? Number(verifiedEvidencePack.sports_grounding.overlay_confidence)
      : undefined,
    sports_overlay_blocker_reason: safeText(verifiedEvidencePack?.sports_grounding?.overlay_blocker_reason) || undefined,
    sports_publish_gate_ready: sportsContractState.sportsPublishGateReady === true,
    sports_pick_state: safeText(sportsContractState.sportsPickState) || undefined,
    sports_grounded: sportsContractState.sportsGrounded === true,
    fixture_window_state: safeText(sportsContractState.fixtureWindowState) || undefined,
    fixture_window_open: sportsContractState.fixtureWindowOpen === true,
    sports_extraction_provenance: Array.isArray(sportsContractState.sportsExtractionProvenance)
      ? sportsContractState.sportsExtractionProvenance
      : undefined,
    sports_confidence_tier: safeText(sportsContractState.sportsConfidenceTier) || undefined,
    decision_state: safeText(scorecard?.decision_state, safeText(whaleMode?.decision_state)) || undefined,
    decision_reason: safeText(scorecard?.decision_reason, safeText(whaleMode?.decision_reason)) || undefined,
    reference_source_class:
      safeText(scorecard?.reference_source_class, safeText(whaleMode?.reference_source_class, "none")) || undefined,
    reference_probability:
      scorecard?.reference_probability == null
        ? whaleMode?.reference_probability ?? undefined
        : Number(scorecard.reference_probability),
    edge_delta: scorecard?.edge_delta == null ? whaleMode?.edge_delta ?? undefined : Number(scorecard.edge_delta),
    fragility_score:
      scorecard?.fragility_score == null ? whaleMode?.fragility_score ?? undefined : Number(scorecard.fragility_score),
    no_action_reason: safeText(scorecard?.no_action_reason, safeText(whaleMode?.no_action_reason)) || undefined,
    flip_conditions:
      Array.isArray(scorecard?.flip_conditions) && scorecard.flip_conditions.length
        ? scorecard.flip_conditions
        : Array.isArray(whaleMode?.flip_conditions)
          ? whaleMode.flip_conditions
          : undefined,
    simulation_confidence:
      scorecard?.simulation_confidence == null
        ? whaleMode?.simulation_confidence ?? undefined
        : Number(scorecard.simulation_confidence),
    sports_decision_state:
      safeText(scorecard?.sports_decision_state, safeText(sportsDecision?.decision_state)) || undefined,
    sports_decision_reason:
      safeText(scorecard?.sports_decision_reason, safeText(sportsDecision?.decision_reason)) || undefined,
    sports_no_bet_reason:
      safeText(scorecard?.sports_no_bet_reason, safeText(sportsDecision?.no_bet_reason)) || undefined,
    sports_model_probabilities: scorecard?.sports_model_probabilities || sportsDecision?.model_probabilities || undefined,
    sports_market_probabilities:
      scorecard?.sports_market_probabilities || sportsDecision?.market_probabilities || undefined,
    sports_edge_delta: scorecard?.sports_edge_delta || sportsDecision?.edge_delta || undefined,
    sports_fair_prices: scorecard?.sports_fair_prices || sportsDecision?.fair_prices || undefined,
    sports_fragility_score: Number.isFinite(Number(scorecard?.sports_fragility_score))
      ? Number(scorecard.sports_fragility_score)
      : sportsDecision?.fragility_score ?? undefined,
    sports_simulation_confidence: Number.isFinite(Number(scorecard?.sports_simulation_confidence))
      ? Number(scorecard.sports_simulation_confidence)
      : sportsDecision?.simulation_confidence ?? undefined,
    sports_upset_rate: Number.isFinite(Number(scorecard?.sports_upset_rate))
      ? Number(scorecard.sports_upset_rate)
      : sportsDecision?.upset_rate ?? undefined,
    sports_draw_volatility: Number.isFinite(Number(scorecard?.sports_draw_volatility))
      ? Number(scorecard.sports_draw_volatility)
      : sportsDecision?.draw_volatility ?? undefined,
    sports_flip_conditions:
      normalizeTextList(scorecard?.sports_flip_conditions, 4).length > 0
        ? normalizeTextList(scorecard?.sports_flip_conditions, 4)
        : normalizeTextList(sportsDecision?.flip_conditions, 4),
    sports_model_favorite:
      safeText(scorecard?.sports_model_favorite, safeText(sportsDecision?.model_favorite)) || undefined,
    sports_market_favorite:
      safeText(scorecard?.sports_market_favorite, safeText(sportsDecision?.market_favorite)) || undefined,
    sports_favorite_but_no_bet:
      scorecard?.sports_favorite_but_no_bet === true || sportsDecision?.favorite_but_no_bet === true,
    sports_fixture_kind: safeText(verifiedEvidencePack?.sports_grounding?.sports_fixture_kind) || undefined,
    sports_fixture_candidate_score: Number.isFinite(Number(verifiedEvidencePack?.sports_grounding?.sports_fixture_candidate_score))
      ? Number(verifiedEvidencePack.sports_grounding.sports_fixture_candidate_score)
      : undefined,
    sports_fixture_resolution_reason:
      safeText(verifiedEvidencePack?.sports_grounding?.sports_fixture_resolution_reason) || undefined,
    sports_fixture_date_match: verifiedEvidencePack?.sports_grounding?.sports_fixture_date_match === true,
    sports_fixture_competition_match:
      verifiedEvidencePack?.sports_grounding?.sports_fixture_competition_match == null
        ? undefined
        : verifiedEvidencePack.sports_grounding.sports_fixture_competition_match === true,
    sports_market_source:
      safeText(
        verifiedEvidencePack?.sports_grounding?.sports_market_source,
        safeText(verifiedEvidencePack?.sports_market_overlay?.sports_market_source)
      ) || undefined,
    sports_market_source_class:
      safeText(
        verifiedEvidencePack?.sports_grounding?.sports_market_source_class,
        safeText(verifiedEvidencePack?.sports_market_overlay?.sports_market_source_class, "none")
      ) || undefined,
    sports_market_quality_tier:
      safeText(
        verifiedEvidencePack?.sports_grounding?.sports_market_quality_tier,
        safeText(verifiedEvidencePack?.sports_market_overlay?.sports_market_quality_tier, "none")
      ) || undefined,
    sports_market_snapshot:
      verifiedEvidencePack?.sports_grounding?.sports_market_snapshot ||
      verifiedEvidencePack?.sports_market_overlay?.sports_market_snapshot ||
      undefined,
    sports_market_overround:
      verifiedEvidencePack?.sports_grounding?.sports_market_overround == null
        ? verifiedEvidencePack?.sports_market_overlay?.sports_market_overround ?? undefined
        : Number(verifiedEvidencePack.sports_grounding.sports_market_overround),
    market_consensus_strength: Number.isFinite(Number(verifiedEvidencePack?.sports_grounding?.market_consensus_strength))
      ? Number(verifiedEvidencePack.sports_grounding.market_consensus_strength)
      : verifiedEvidencePack?.sports_market_overlay?.market_consensus_strength,
    market_disagreement_score: Number.isFinite(Number(verifiedEvidencePack?.sports_grounding?.market_disagreement_score))
      ? Number(verifiedEvidencePack.sports_grounding.market_disagreement_score)
      : verifiedEvidencePack?.sports_market_overlay?.market_disagreement_score,
    price_move_pressure: Number.isFinite(Number(verifiedEvidencePack?.sports_grounding?.price_move_pressure))
      ? Number(verifiedEvidencePack.sports_grounding.price_move_pressure)
      : verifiedEvidencePack?.sports_market_overlay?.price_move_pressure,
    narrative_hype_score: Number.isFinite(Number(verifiedEvidencePack?.sports_grounding?.narrative_hype_score))
      ? Number(verifiedEvidencePack.sports_grounding.narrative_hype_score)
      : verifiedEvidencePack?.sports_market_overlay?.narrative_hype_score,
    sportsbook_readiness_state: normalizedSportsbookReadinessState,
    core_version: CRYSTAL_CORE_VERSION,
    _source: "crystal-core",
  };
}

function buildPendingRunCard({
  runId,
  queryText,
  queryPlan = {},
  visibility = "private",
  accessToken = null,
  pollAfterMs = 2500,
  languageHint = "",
}) {
  const domainId = resolveDomainId(queryPlan?.primary_domain_id || queryPlan?.domain_id || queryPlan?.domain || GENERAL_FORECAST_DOMAIN);
  const domainConfig = getDomain(domainId, GENERAL_FORECAST_DOMAIN);
  const responseLanguage = normalizeLanguageCode(queryPlan?.response_language, normalizeLanguageCode(languageHint, inferInputLanguage(queryText)));
  const temporalContext =
    queryPlan?.temporal_context && typeof queryPlan.temporal_context === "object"
      ? queryPlan.temporal_context
      : buildTemporalContext(queryText, {
          eventDate: safeText(queryPlan?.event_date),
        });
  const runAsOfUtc = safeText(temporalContext?.as_of_utc, nowIso());
  const resolvedTimeWindow = temporalContext?.resolved_time_window || null;
  const eventDate = safeText(queryPlan?.event_date, safeText(resolvedTimeWindow?.end_date)) || null;
  return {
    card_id: `pending_${runId}`,
    card_type: getDomainCardTypes(domainId)[0] || "forecast_band",
    canonical_card_type: getDomainCardTypes(domainId)[0] || "forecast_band",
    card_state: "limited",
    version_id: `run_${runId}`,
    domain: domainId,
    stakes_level: buildStakeLevel(domainId),
    risk_band: "high",
    query_origin: safeText(queryText),
    canonical_query: safeText(queryPlan?.canonical_query, safeText(queryText)),
    input_language: safeText(queryPlan?.input_language, responseLanguage),
    response_language: responseLanguage,
    title:
      responseLanguage === "it"
        ? "Crystal sta elaborando una previsione piu profonda"
        : responseLanguage === "es"
          ? "Crystal esta ejecutando una prevision mas profunda"
          : responseLanguage === "fr"
            ? "Crystal lance une prevision plus profonde"
            : responseLanguage === "pt"
              ? "Crystal esta rodando uma previsao mais profunda"
              : "Crystal is running a deeper forecast",
    summary:
      responseLanguage === "it"
        ? "La pipeline predittiva profonda sta assemblando la card finale. Crystal aggiornera il risultato appena la run si chiude."
        : responseLanguage === "es"
          ? "La pipeline predictiva profunda esta armando la card final. Crystal actualizara el resultado cuando cierre la run."
          : responseLanguage === "fr"
            ? "La pipeline predictive profonde assemble la card finale. Crystal mettra le resultat a jour des que la run sera terminee."
            : responseLanguage === "pt"
              ? "A pipeline preditiva profunda esta montando a card final. Crystal atualizara o resultado quando a run terminar."
              : "The deep prediction pipeline is still assembling the final card. Crystal will update this result as soon as the run closes.",
    verdict:
      responseLanguage === "it"
        ? `Run profonda in corso per: ${safeText(queryText, domainConfig.short_label || "forecast")}`
        : responseLanguage === "es"
          ? `Run profunda en curso para: ${safeText(queryText, domainConfig.short_label || "forecast")}`
          : responseLanguage === "fr"
            ? `Run profonde en cours pour: ${safeText(queryText, domainConfig.short_label || "forecast")}`
            : responseLanguage === "pt"
              ? `Run profunda em curso para: ${safeText(queryText, domainConfig.short_label || "forecast")}`
              : `Deep run in progress for: ${safeText(queryText, domainConfig.short_label || "forecast")}`,
    temporal_context: temporalContext,
    run_as_of_utc: runAsOfUtc,
    run_as_of_timezone: safeText(temporalContext?.as_of_timezone, "Europe/Rome"),
    run_as_of_local_date: safeText(temporalContext?.as_of_local_date),
    relative_time_phrase: safeText(temporalContext?.relative_phrase),
    resolved_time_window: resolvedTimeWindow,
    event_date: eventDate,
    resolution_due_at: eventDate,
    resolution_status: "pending",
    updated_at: nowIso(),
    primary_call: "",
    personal_output:
      responseLanguage === "it"
        ? "Resta su questa schermata. Crystal sostituira questo placeholder con la previsione finale quando la run sara completata."
        : responseLanguage === "es"
          ? "Quedate en esta pantalla. Crystal reemplazara este placeholder con la prevision final cuando termine la run."
          : responseLanguage === "fr"
            ? "Reste sur cet ecran. Crystal remplacera ce placeholder par la prevision finale quand la run sera terminee."
            : responseLanguage === "pt"
              ? "Fique nesta tela. Crystal substituira este placeholder pela previsao final quando a run terminar."
              : "Stay on this screen. Crystal will replace this limited placeholder with the final forecast when the run completes.",
    scenario_set: [],
    so_what: [],
    drivers: [],
    counter_signals: [],
    historical_anchors: [],
    invalidators: [],
    publication_basis: {
      coverage_score: 0.46,
      freshness_score: 0.52,
      agreement_score: 0.5,
      conflict_score: 0.34,
      source_count: 0,
      domain_state: "pending_run",
      notes: ["The deep pipeline is still synthesizing evidence, fusion, and calibration."],
    },
    what_to_watch: ["Run status", "Scenario fusion", "Confidence calibration"],
    how_to_raise_confidence: ["Wait for the deep run to close."],
    evidence_drawer: {
      metrics_provenance: [],
      freshness_summary: {
        as_of_utc: nowIso(),
        cadence: "run-based",
        staleness_bucket: "unknown",
      },
      coverage_notes: ["The final forecast is not ready yet."],
      gating_reason: "pending_run",
    },
    trust_layer: {
      confidence_score: 0.41,
      confidence_tier: "low",
      data_sufficiency_flag: "partial",
      freshness: {
        staleness_bucket: "unknown",
        as_of_utc: nowIso(),
      },
      provenance_summary: {
        verification_level: "partially_verified",
        license_summary: ["crystal-core-run"],
      },
    },
    pending_run: {
      run_id: runId,
      status: "running",
      visibility,
      access_token: accessToken,
      poll_after_ms: pollAfterMs,
    },
    _source: "crystal-core-pending",
  };
}

function buildBaselineConsensusPack({ verifiedEvidencePack = {}, normalizedQuery = {} }) {
  const binaryFrame = normalizedQuery.binary_frame || {};
  const primaryProbability = clamp01(
    verifiedEvidencePack?.prediction_market_frame?.calibrated_probability ??
      verifiedEvidencePack?.prediction_market_frame?.implied_probability,
    0.5
  );
  const marketConsensusReference = safeText(verifiedEvidencePack?.market_structure?.consensus_reference?.summary);

  return {
    naive_baseline: binaryFrame.asks_binary_question
      ? `${safeText(binaryFrame.question_side_a, "Primary")} / ${safeText(binaryFrame.question_side_b, "Alternative")} starts close to parity before evidence.`
      : "Without strong evidence, the naive baseline is mean reversion and slow change.",
    consensus_prediction: verifiedEvidencePack?.prediction_market_frame
      ? `Closest consensus reference leans ${primaryProbability >= 0.55 ? safeText(binaryFrame.question_side_a, "Primary") : safeText(binaryFrame.question_side_b, "Alternative")} at ${Math.round(
          primaryProbability * 100
        )}%.`
      : marketConsensusReference || "No strong external consensus reference was available for this run.",
    delta_vs_consensus: verifiedEvidencePack?.prediction_market_frame ? "Crystal should explain where it diverges from external pricing." : "Consensus delta unavailable.",
    edge_claim:
      verifiedEvidencePack?.prediction_market_frame || verifiedEvidencePack?.live_signals?.length >= 2
        ? "Edge should come from variable selection, verified evidence quality, and disciplined calibration."
        : "Edge is constrained by thin live evidence in this run.",
  };
}

function inferSimulationDomainFamily(normalizedQuery = {}) {
  const domainId = safeText(normalizedQuery?.primary_domain_id);
  if (domainId === "A.23.markets_and_asset_regimes") return "market_regime";
  if (domainId === SPORTS_MATCH_OUTCOMES_DOMAIN || domainId === SPORTS_PROBABILITY_MODE_DOMAIN) return "sports_match_decision";
  if (domainId === "B.3.5.business_idea_outcomes") return "business_tradeoff";
  if (domainId === "A.24.governance_policy_and_public_timeline") return "governance_timeline";
  if (domainId === "A.25.geopolitics_and_conflict_dynamics") return "geopolitics_conflict";
  if (domainId === "A.26.human_history_and_long_run_analogs") return "long_run_analog";
  if (["C.1.attention_waves", "C.3.hype_curve_tracker", "C.4.global_quote_stream"].includes(domainId)) {
    return "attention_narrative";
  }
  if (domainId === "A.30.culture_events_and_attention") return "culture_event_pressure";
  if (domainId === "B.3.8.personal_decisions_and_tradeoffs") return "personal_tradeoff";
  return "";
}

function buildSimulationEntityEventLocation(normalizedQuery = {}) {
  return {
    entity: safeText(getPrimaryEntityLabel(normalizedQuery)),
    location: safeText(getPrimaryLocationFromPlan(normalizedQuery)),
    event: safeText(normalizedQuery?.governing_entity || normalizedQuery?.question_side_a || normalizedQuery?.event_date),
  };
}

function inferSimulationDecisionFrame(normalizedQuery = {}, verifiedEvidencePack = {}) {
  const domainId = safeText(normalizedQuery?.primary_domain_id);
  if (domainId === "A.23.markets_and_asset_regimes") return "market_regime";
  const publicationBasis = verifiedEvidencePack?.publication_basis || {};
  const decisionReadyState = safeText(publicationBasis?.decision_ready_state || verifiedEvidencePack?.decision_ready_state);
  if (domainId === SPORTS_PROBABILITY_MODE_DOMAIN) return "sports_probability_mode";
  if (domainId === SPORTS_MATCH_OUTCOMES_DOMAIN) return "sports_match_forecast";
  if (domainId === "B.3.8.personal_decisions_and_tradeoffs") return "personal_tradeoff";
  if (domainId === "B.3.5.business_idea_outcomes") return "business_tradeoff";
  if (domainId === "A.24.governance_policy_and_public_timeline") return "governance_timeline";
  if (domainId === "A.25.geopolitics_and_conflict_dynamics") return "escalation_path";
  if (domainId === "A.26.human_history_and_long_run_analogs") return "analog_break_conditions";
  if (decisionReadyState === "ready") return "decision_ready";
  return safeText(normalizedQuery?.resolution_frame, "directional");
}

function buildSimulationLiveSignalsSummary(verifiedEvidencePack = {}) {
  const liveSignals = Array.isArray(verifiedEvidencePack?.live_signals) ? verifiedEvidencePack.live_signals : [];
  return liveSignals.slice(0, 5).map((signal) => ({
    source_id: safeText(signal?.source_id),
    label: safeText(signal?.label),
    lean: safeText(signal?.lean),
    summary: safeText(signal?.summary).slice(0, 160),
  }));
}

function buildSimulationContext({ queryText = "", normalizedQuery = {}, verifiedEvidencePack = {} }) {
  const domainFamily = inferSimulationDomainFamily(normalizedQuery);
  if (!domainFamily) return null;
  const baseContext = {
    domain_family: domainFamily,
    entity_event_location: buildSimulationEntityEventLocation(normalizedQuery),
    horizon: safeText(
      (Array.isArray(normalizedQuery?.horizons) ? normalizedQuery.horizons[0]?.horizon_id : "") || normalizedQuery?.time_horizon,
      "30d"
    ),
    decision_frame: inferSimulationDecisionFrame(normalizedQuery, verifiedEvidencePack),
    live_signals_summary: buildSimulationLiveSignalsSummary(verifiedEvidencePack),
  };
  if (domainFamily !== "sports_match_decision") {
    return baseContext;
  }

  const sportsGrounding = verifiedEvidencePack?.sports_grounding || {};
  const sportsSemanticOverlay = verifiedEvidencePack?.sports_semantic_overlay || null;
  const sportsMarketOverlay = verifiedEvidencePack?.sports_market_overlay || null;
  const sportsContractState = computeSportsContractState({
    sportsGrounding,
    semanticOverlay: sportsSemanticOverlay,
  });
  const sportsDecisionInput = buildSportsDecisionFrame({
    sportsGrounding,
    sportsMarketOverlay,
    sportsSemanticOverlay,
    sportsContractState,
    domainId: safeText(normalizedQuery?.primary_domain_id),
  });

  return {
    ...baseContext,
    sports_grounding: sportsGrounding,
    sports_semantic_overlay: sportsSemanticOverlay,
    sports_market_overlay: sportsMarketOverlay,
    sports_contract_state: sportsContractState,
    sports_decision_input: sportsDecisionInput,
    fixture_window_open: sportsContractState.fixtureWindowOpen === true,
  };
}

function buildFallbackVerifiedEvidencePack({ normalizedQuery = {}, variableSelectionPack = {}, engine = "extended", reason = "" }) {
  const domainConfig = getDomain(normalizedQuery.primary_domain_id, GENERAL_FORECAST_DOMAIN);
  const sportsLike = isSportsLikeQuery(normalizedQuery, normalizedQuery?.original_query, domainConfig);
  const fallbackPack = {
    historical_baseline: "",
    historical_baseline_20y: "",
    live_signals: [],
    source_ledger: [],
    source_trust_map: [],
    conflict_map: [],
    missingness_map: ["historical_baseline_thin", "live_signal_coverage_light", "consensus_reference_thin"],
    consensus_inputs: [],
    verification_summary: "Evidence retrieval degraded, so Crystal completed this run with a conservative evidence pack.",
    entity_resolution: {
      resolved: Array.isArray(normalizedQuery?.entities) && normalizedQuery.entities.length > 0,
      entities: Array.isArray(normalizedQuery?.entities) ? normalizedQuery.entities.map((entity) => entity.label).filter(Boolean) : [],
    },
    event_resolution: {
      resolved: Boolean(
        safeText(normalizedQuery?.question_side_a) || safeText(normalizedQuery?.event_date) || safeText(normalizedQuery?.jurisdiction)
      ),
      event_date: safeText(normalizedQuery?.event_date),
      governing_entity: safeText(normalizedQuery?.governing_entity),
      jurisdiction: safeText(normalizedQuery?.jurisdiction),
    },
    prediction_market_frame: null,
    sports_grounding: sportsLike
      ? {
          provider_required: true,
          provider: safeText(getSportsRuntimeHealth().provider, "thesportsdb"),
          provider_configured: Boolean(getSportsRuntimeHealth().configured),
          fixture_resolved: false,
          parity_ready: false,
          semantic_ready: false,
          overlay_confidence: null,
          overlay_blocker_reason: "sports_semantic_overlay_pending",
          publish_gate_ready: false,
          question_side_a: safeText(normalizedQuery?.question_side_a),
          question_side_b: safeText(normalizedQuery?.question_side_b),
          reason: "Sports evidence degraded before Crystal could ground the fixture with the shared provider path.",
        }
      : null,
    selected_variables: Array.isArray(variableSelectionPack?.selected_variables) ? variableSelectionPack.selected_variables : [],
    adapter_activation_map: Array.isArray(variableSelectionPack?.adapter_activation_map) ? variableSelectionPack.adapter_activation_map : [],
    notes: uniqueStrings([
      "Evidence retrieval degraded and Crystal fell back to a conservative verified evidence pack.",
      safeText(reason),
    ]).slice(0, 4),
  };
  fallbackPack.source_usage = buildSourceUsageSummary({
    queryText: safeText(normalizedQuery?.original_query),
    normalizedQuery,
    domainConfig,
    sourceLedger: fallbackPack.source_ledger,
    predictionMarketFrame: fallbackPack.prediction_market_frame,
  });
  fallbackPack.location_structure = null;
  fallbackPack.mobility_structure = null;
  fallbackPack.public_data_structure = null;
  fallbackPack.market_structure = buildMarketStructure({
    normalizedQuery,
    liveSignals: fallbackPack.live_signals,
    connectorPacks: [],
    predictionMarketFrame: fallbackPack.prediction_market_frame,
    sourceUsage: fallbackPack.source_usage,
  });
  if (sportsLike) {
    fallbackPack.hard_stop = true;
  }
  fallbackPack.evidence_quality = computeEvidenceQuality(fallbackPack, domainConfig, engine || "extended");
  fallbackPack.simulation_context = buildSimulationContext({
    queryText: safeText(normalizedQuery?.original_query),
    normalizedQuery,
    verifiedEvidencePack: fallbackPack,
  });
  return fallbackPack;
}

async function buildVerifiedEvidencePack(context, { runId, queryText, normalizedQuery, variableSelectionPack, engine }) {
  const { db, admin, llmRuntime, fetchJson, ai } = context;
  const domainConfig = getDomain(normalizedQuery.primary_domain_id, GENERAL_FORECAST_DOMAIN);
  const locationFocus = getPrimaryLocationFromPlan(normalizedQuery) || getPrimaryEntityLabel(normalizedQuery) || "global";
  const supportingDomains = Array.isArray(normalizedQuery.supporting_domains) ? normalizedQuery.supporting_domains.slice(0, 3) : [];
  const policyLike = isPolicyLikeQuery(normalizedQuery, domainConfig);
  const marketLike = isMarketLikeQuery(normalizedQuery, domainConfig);
  const sportsLike = isSportsLikeQuery(normalizedQuery, queryText, domainConfig);
  const geoLike = isGeoLikeQuery(queryText, normalizedQuery, domainConfig);
  const mobilityLike = isMobilityLikeQuery(queryText, normalizedQuery, domainConfig);
  const travelLike = isTravelLikeQuery(queryText, normalizedQuery, domainConfig);
  const macroPublicLike = isMacroPublicDataQuery(queryText, normalizedQuery, domainConfig);
  const energyLike = isEnergyLikeQuery(queryText, normalizedQuery, domainConfig);
  const environmentLike = isEnvironmentLikeQuery(queryText, normalizedQuery, domainConfig);
  const resolveWikidataSignal = typeof context.fetchWikidataEntitySignal === "function" ? context.fetchWikidataEntitySignal : fetchWikidataEntitySignal;
  const resolveGdeltSignal = typeof context.fetchGdeltAttentionSignal === "function" ? context.fetchGdeltAttentionSignal : fetchGdeltAttentionSignal;
  const resolveAllowlistedRssSignal =
    typeof context.fetchAllowlistedRssSignal === "function" ? context.fetchAllowlistedRssSignal : fetchAllowlistedRssSignal;
  const resolveTrendSignal = typeof context.fetchTrendSignal === "function" ? context.fetchTrendSignal : fetchTrendSignal;
  const resolveYahooMarketSignal = typeof context.fetchYahooMarketSignal === "function" ? context.fetchYahooMarketSignal : fetchYahooMarketSignal;
  const resolveFredMacroSignal = typeof context.fetchFredMacroSignal === "function" ? context.fetchFredMacroSignal : fetchFredMacroSignal;
  const resolveNominatimLocationSignal =
    typeof context.fetchNominatimLocationSignal === "function" ? context.fetchNominatimLocationSignal : fetchNominatimLocationSignal;
  const resolveOverpassContextSignal =
    typeof context.fetchOverpassContextSignal === "function" ? context.fetchOverpassContextSignal : fetchOverpassContextSignal;
  const resolveWorldBankSignal =
    typeof context.fetchWorldBankSignal === "function" ? context.fetchWorldBankSignal : fetchWorldBankSignal;
  const resolveEurostatSignal = typeof context.fetchEurostatSignal === "function" ? context.fetchEurostatSignal : fetchEurostatSignal;
  const resolveOecdSignal = typeof context.fetchOecdSignal === "function" ? context.fetchOecdSignal : fetchOecdSignal;
  const resolveOpenSkySignal = typeof context.fetchOpenSkySignal === "function" ? context.fetchOpenSkySignal : fetchOpenSkySignal;
  const resolveGtfsStaticSignal =
    typeof context.fetchGtfsStaticSignal === "function" ? context.fetchGtfsStaticSignal : fetchGtfsStaticSignal;
  const resolveGtfsRealtimeSignal =
    typeof context.fetchGtfsRealtimeSignal === "function" ? context.fetchGtfsRealtimeSignal : fetchGtfsRealtimeSignal;
  const resolveOpenAqSignal = typeof context.fetchOpenAqSignal === "function" ? context.fetchOpenAqSignal : fetchOpenAqSignal;
  const resolveEiaSignal = typeof context.fetchEiaSignal === "function" ? context.fetchEiaSignal : fetchEiaSignal;
  const resolvePredictionMarketPulse =
    typeof context.getPredictionMarketPulse === "function" ? context.getPredictionMarketPulse : getPolymarketPulse;
  const resolveSportsForecastContext =
    typeof context.buildSportsForecastContext === "function" ? context.buildSportsForecastContext : buildSportsForecastContext;
  const resolveTimeGptSignal = typeof context.fetchTimeGptSignal === "function" ? context.fetchTimeGptSignal : fetchTimeGptSignal;

  const mainBaseline = await get20YearHistoricalContext({
    db,
    llmRuntime,
    admin,
    runId,
    domain: domainConfig.domain_id,
    locationFocus,
    analyticalFocus: queryText,
  });

  const supportingBaselines = [];
  for (const supportingDomainId of supportingDomains) {
    const supportingDomain = getDomain(supportingDomainId, supportingDomainId);
    const summary = await get20YearHistoricalContext({
      db,
      llmRuntime,
      admin,
      runId,
      domain: supportingDomain.domain_id,
      locationFocus,
      analyticalFocus: queryText,
    });
    if (summary) {
      supportingBaselines.push({
        label: `${supportingDomain.short_label} baseline`,
        summary,
      });
    }
  }

  const liveSignals = [];
  let sportsContext = null;
  if (sportsLike) {
    try {
      sportsContext = await resolveSportsForecastContext({
        queryText,
        queryPlan: normalizedQuery,
        fetchJson,
        db,
        admin,
      });
    } catch (error) {
      sportsContext = {
        provider_required: true,
        provider_configured: false,
        configured: false,
        available: false,
        parity_ready: false,
        reason: error instanceof Error ? error.message : "Sports provider lookup failed.",
        grounded_read: null,
        signals: [],
        notes: [error instanceof Error ? error.message : "Sports provider lookup failed."],
      };
    }
  }

  if (!sportsLike) {
    const trendSignal = await resolveTrendSignal(queryText, normalizedQuery, domainConfig);
    if (trendSignal) {
      liveSignals.push(trendSignal);
    }
  }

  const timeGptPack = !sportsLike
    ? await Promise.resolve(resolveTimeGptSignal(fetchJson, queryText, normalizedQuery, domainConfig)).catch(() => ({
        available: false,
        reason: "timegpt_unavailable",
      }))
    : { available: false, reason: "timegpt_skipped_for_sports" };
  if (Array.isArray(timeGptPack?.signals)) {
    liveSignals.push(...timeGptPack.signals);
  }

  const searchPayload = sportsLike
    ? {
        signals: [],
        source_trust_map: [],
        conflict_map: [],
        verification_summary: "Sports runs use the shared provider-backed grounding path instead of generic web search.",
      }
    : await fetchSearchSignals(ai, queryText, normalizedQuery, variableSelectionPack);
  liveSignals.push(...searchPayload.signals);
  if (Array.isArray(sportsContext?.signals)) {
    liveSignals.push(...sportsContext.signals);
  }

  const locationPack = geoLike ? await Promise.resolve(resolveNominatimLocationSignal(queryText, normalizedQuery)).catch(() => null) : null;
  const connectorPacks = (
    await Promise.all(
      [
        policyLike ? resolveWikidataSignal(fetchJson, normalizedQuery) : null,
        policyLike ? resolveGdeltSignal(fetchJson, queryText, normalizedQuery) : null,
        policyLike ? resolveAllowlistedRssSignal(queryText, normalizedQuery) : null,
        marketLike ? resolveYahooMarketSignal(queryText, normalizedQuery) : null,
        marketLike || macroPublicLike ? resolveFredMacroSignal(fetchJson, queryText, normalizedQuery) : null,
        geoLike ? resolveOverpassContextSignal(queryText, normalizedQuery, domainConfig, locationPack) : null,
        macroPublicLike ? resolveWorldBankSignal(queryText, normalizedQuery) : null,
        macroPublicLike ? resolveEurostatSignal(queryText, normalizedQuery) : null,
        macroPublicLike ? resolveOecdSignal(queryText, normalizedQuery) : null,
        travelLike ? resolveOpenSkySignal(queryText, normalizedQuery, locationPack) : null,
        mobilityLike ? resolveGtfsStaticSignal(queryText, normalizedQuery) : null,
        mobilityLike ? resolveGtfsRealtimeSignal(queryText, normalizedQuery) : null,
        environmentLike ? resolveOpenAqSignal(queryText, normalizedQuery) : null,
        energyLike ? resolveEiaSignal(queryText, normalizedQuery) : null,
      ].map((task) => Promise.resolve(task).catch(() => null))
    )
  )
    .filter(Boolean)
    .concat(locationPack ? [locationPack] : [])
    .concat(timeGptPack?.available ? [timeGptPack] : []);

  const connectorSignals = connectorPacks.flatMap((pack) => (Array.isArray(pack?.signals) ? pack.signals : []));
  const connectorTrustMap = connectorPacks.flatMap((pack) => (Array.isArray(pack?.source_trust_map) ? pack.source_trust_map : []));
  const connectorConflicts = connectorPacks.flatMap((pack) => (Array.isArray(pack?.conflict_map) ? pack.conflict_map : []));
  liveSignals.push(...connectorSignals);

  let predictionMarketFrame = null;
  if (normalizedQuery?.binary_frame?.asks_binary_question && !sportsLike) {
    try {
      predictionMarketFrame = await resolvePredictionMarketPulse({
        db,
        admin,
        fetchJson,
        queryText,
        queryPlan: normalizedQuery,
      });
      if (predictionMarketFrame) {
        liveSignals.push({
          source_id: "polymarket_public",
          label: "Prediction market reference",
          summary: `Closest market read: ${predictionMarketFrame.market_question || predictionMarketFrame.outcome || "binary frame"} with implied probability ${Math.round(
            clamp01(
              predictionMarketFrame.calibrated_probability ?? predictionMarketFrame.implied_probability ?? 0.5,
              0.5
            ) * 100
          )}%`,
          lean:
            Number(predictionMarketFrame.calibrated_probability ?? predictionMarketFrame.implied_probability ?? 0.5) >= 0.55
              ? "up"
              : "down",
          freshness_score: 0.88,
          trust_score: 0.8,
        });
      }
    } catch (_error) {
      predictionMarketFrame = null;
    }
  }

  const sourceTrustMap = buildSourceTrustMap(searchPayload, liveSignals, connectorTrustMap);
  const conflictMap = uniqueStrings(
    []
      .concat(Array.isArray(searchPayload.conflict_map) ? searchPayload.conflict_map.map((item) => JSON.stringify(item)) : [])
      .concat(connectorConflicts.map((item) => JSON.stringify(item)))
  )
    .map((item) => {
      try {
        return JSON.parse(item);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, 4);
  const missingnessMap = buildMissingnessMap({
    baseline: mainBaseline,
    liveSignals,
    predictionMarketFrame,
    sportsLike,
    sportsContext,
  });
  const sourceLedger = uniqueStrings(
    []
      .concat(sourceTrustMap.map((item) => item.source_id))
      .concat(mainBaseline ? ["historical-cache"] : [])
      .concat(Array.isArray(sportsContext?.used_source_ids) ? sportsContext.used_source_ids : sportsContext?.available ? [safeText(sportsContext?.source_id)] : [])
  );
  const sourceUsage = buildSourceUsageSummary({
    queryText,
    normalizedQuery,
    domainConfig,
    sourceLedger,
    predictionMarketFrame,
  });
  const overpassPack = connectorPacks.find((pack) => pack?.poi_metrics);
  const worldBankPack = connectorPacks.find((pack) => pack?.public_data_metrics?.source_id === "world_bank_api");
  const eurostatPack = connectorPacks.find((pack) => pack?.public_data_metrics?.source_id === "eurostat_api");
  const oecdPack = connectorPacks.find((pack) => pack?.public_data_metrics?.source_id === "oecd_api");
  const eiaPack = connectorPacks.find((pack) => pack?.public_data_metrics?.source_id === "eia_api");
  const openAqPack = connectorPacks.find((pack) => pack?.environment_metrics?.source_id === "openaq");
  const openSkyPack = connectorPacks.find((pack) => pack?.mobility_metrics?.source_id === "opensky");
  const gtfsStaticPack = connectorPacks.find((pack) => pack?.mobility_metrics?.source_id === "gtfs_static");
  const gtfsRealtimePack = connectorPacks.find((pack) => pack?.mobility_metrics?.source_id === "gtfs_realtime");
  const locationStructure = buildLocationStructure({
    locationPack,
    overpassPack,
  });
  const mobilityStructure = buildMobilityStructure({
    openSkyPack,
    gtfsStaticPack,
    gtfsRealtimePack,
  });
  const publicDataStructure = buildPublicDataStructure({
    worldBankPack,
    eurostatPack,
    oecdPack,
    fredPack: connectorPacks.find((pack) => pack?.macro_metrics),
    eiaPack,
    openAqPack,
  });
  const marketStructure = buildMarketStructure({
    queryText,
    normalizedQuery,
    liveSignals,
    connectorPacks,
    predictionMarketFrame,
    sourceUsage,
  });
  const sportsGrounding = sportsLike
    ? {
        provider_required: true,
        provider: safeText(sportsContext?.provider, "thesportsdb"),
        provider_configured: Boolean(sportsContext?.provider_configured ?? sportsContext?.configured),
        fixture_resolved: Boolean(sportsContext?.grounded_read?.fixture_resolved),
        parity_ready: Boolean(sportsContext?.grounded_read?.parity_ready),
        semantic_ready: Boolean(sportsContext?.semantic_ready),
        overlay_confidence: Number.isFinite(Number(sportsContext?.overlay_confidence)) ? Number(sportsContext.overlay_confidence) : null,
        overlay_blocker_reason: safeText(sportsContext?.overlay_blocker_reason),
        publish_gate_ready: Boolean(sportsContext?.publish_gate_ready),
        question_side_a: safeText(sportsContext?.grounded_read?.question_side_a),
        question_side_b: safeText(sportsContext?.grounded_read?.question_side_b),
        winning_side: safeText(sportsContext?.grounded_read?.winning_side),
        winning_probability: Number.isFinite(Number(sportsContext?.grounded_read?.winning_probability))
          ? Number(sportsContext.grounded_read.winning_probability)
          : null,
        model_probabilities: sportsContext?.grounded_read?.model_probabilities || null,
        market_probabilities: sportsContext?.grounded_read?.market_probabilities || null,
        fair_prices: sportsContext?.grounded_read?.fair_prices || null,
        model_favorite: safeText(sportsContext?.grounded_read?.model_favorite) || null,
        market_favorite: safeText(sportsContext?.grounded_read?.market_favorite) || null,
        market_consensus_strength: Number.isFinite(Number(sportsContext?.market_consensus_strength))
          ? Number(sportsContext.market_consensus_strength)
          : null,
        market_disagreement_score: Number.isFinite(Number(sportsContext?.market_disagreement_score))
          ? Number(sportsContext.market_disagreement_score)
          : null,
        price_move_pressure: Number.isFinite(Number(sportsContext?.price_move_pressure))
          ? Number(sportsContext.price_move_pressure)
          : null,
        narrative_hype_score: Number.isFinite(Number(sportsContext?.narrative_hype_score))
          ? Number(sportsContext.narrative_hype_score)
          : null,
        sportsbook_readiness_state: safeText(sportsContext?.sportsbook_readiness_state),
        key_drivers: normalizeTextList(sportsContext?.grounded_read?.key_drivers, 4),
        counter_signals: normalizeTextList(sportsContext?.grounded_read?.counter_signals, 4),
        invalidators: normalizeTextList(sportsContext?.grounded_read?.invalidators, 4),
        reason: safeText(sportsContext?.grounded_read?.reason, safeText(sportsContext?.reason)),
      }
    : null;

  const verifiedEvidencePack = {
    historical_baseline: buildHistoricalBundle(mainBaseline, supportingBaselines),
    historical_baseline_20y: buildHistoricalBundle(mainBaseline, supportingBaselines),
    live_signals: liveSignals,
    source_ledger: sourceLedger,
    source_trust_map: sourceTrustMap,
    conflict_map: conflictMap,
    missingness_map: missingnessMap,
    consensus_inputs: predictionMarketFrame ? [predictionMarketFrame.market_question || predictionMarketFrame.outcome || "prediction market"] : [],
    verification_summary: buildVerificationSummary({
      searchPayload,
      sourceTrustMap,
      conflictMap,
      missingnessMap,
    }),
    entity_resolution: {
      resolved: Array.isArray(normalizedQuery?.entities) && normalizedQuery.entities.length > 0,
      entities: Array.isArray(normalizedQuery?.entities) ? normalizedQuery.entities.map((entity) => entity.label).filter(Boolean) : [],
    },
    event_resolution: {
      resolved: Boolean(
        safeText(normalizedQuery?.question_side_a) || safeText(normalizedQuery?.event_date) || safeText(normalizedQuery?.jurisdiction)
      ),
      event_date: safeText(normalizedQuery?.event_date),
      governing_entity: safeText(normalizedQuery?.governing_entity),
      jurisdiction: safeText(normalizedQuery?.jurisdiction),
    },
    prediction_market_frame: predictionMarketFrame,
    source_usage: sourceUsage,
    location_structure: locationStructure,
    mobility_structure: mobilityStructure,
    public_data_structure: publicDataStructure,
    market_structure: marketStructure,
    sports_grounding: sportsGrounding,
    sports_semantic_overlay: sportsLike ? sportsContext?.semantic_overlay || null : null,
    sports_market_overlay: sportsLike ? sportsContext?.market_overlay || null : null,
    selected_variables: Array.isArray(variableSelectionPack?.selected_variables) ? variableSelectionPack.selected_variables : [],
    adapter_activation_map: Array.isArray(variableSelectionPack?.adapter_activation_map) ? variableSelectionPack.adapter_activation_map : [],
    notes: uniqueStrings([
      mainBaseline ? "" : "The 20-year baseline was thin for this entity or geography.",
      liveSignals.length >= 2 ? "" : "Live evidence is still light for this run.",
      conflictMap.length > 0 ? "Active signal conflicts remain unresolved." : "",
      sourceUsage.missing_required_sources.length > 0
        ? `Required source coverage is still missing ${sourceUsage.missing_required_sources.join(", ")}.`
        : "",
      sourceUsage.missing_optional_sources.length > 0
        ? `Optional source coverage is still missing ${sourceUsage.missing_optional_sources.join(", ")}.`
        : "",
      !sportsLike && !timeGptPack?.available ? safeText(timeGptPack?.reason) : "",
      locationStructure ? "" : geoLike ? "Location-aware grounding remains thin because the shared geography pack did not fully resolve." : "",
      mobilityStructure ? "" : mobilityLike || travelLike ? "Mobility/travel grounding remains partial because shared transit or flight feeds are still thin." : "",
      publicDataStructure ? "" : macroPublicLike || energyLike || environmentLike ? "Public-data grounding remains partial because one or more macro, energy, or environment providers did not return a usable signal." : "",
      sportsLike && !sportsGrounding?.provider_configured
        ? "Sports picks require the shared sports provider. The runtime is currently missing that configuration."
        : "",
      sportsLike && sportsGrounding?.provider_configured && !sportsGrounding?.fixture_resolved
        ? "Sports provider is configured, but the runtime could not resolve the fixture cleanly enough for a parity-ready pick."
        : "",
      sportsLike && sportsGrounding?.fixture_resolved && sportsGrounding?.semantic_ready !== true
        ? "Crystal grounded the fixture, but the sports semantic overlay is still below the publish gate."
        : "",
      sportsLike && sportsGrounding?.overlay_blocker_reason
        ? `Sports semantic blocker: ${safeText(sportsGrounding.overlay_blocker_reason).replace(/_/g, " ")}.`
        : "",
      sportsLike && safeText(sportsContext?.sportsbook_readiness_state)
        ? `Sports market posture: ${safeText(sportsContext.sportsbook_readiness_state).replace(/_/g, " ")}.`
        : "",
    ]).slice(0, 4),
  };

  verifiedEvidencePack.required_source_gap = sourceUsage.missing_required_sources.length > 0;

  if (sportsLike && (!sportsGrounding?.provider_configured || !sportsGrounding?.fixture_resolved || !sportsGrounding?.parity_ready)) {
    verifiedEvidencePack.hard_stop = true;
  }

  verifiedEvidencePack.evidence_quality = computeEvidenceQuality(verifiedEvidencePack, domainConfig, engine || "extended");
  verifiedEvidencePack.simulation_context = buildSimulationContext({
    queryText,
    normalizedQuery,
    verifiedEvidencePack,
  });
  await writeArtifact(db, admin, runId, "verified_evidence_pack", verifiedEvidencePack);
  return verifiedEvidencePack;
}

async function compileQueryEdge(context, queryText, options = {}) {
  const { llmRuntime, withRetry } = context;
  const routingHints = {
    ...buildRoutingHints(queryText, {
      timeZone: options?.timeZone,
      asOfUtc: options?.asOfUtc,
    }),
    languageHint: options?.languageHint || options?.requestLanguage,
  };
  const generatePlannerPayload = () =>
    llmRuntime.generateJson({
      modelKind: "query",
      temperature: 0,
      systemInstruction:
        "You convert a user question into a Crystal QueryPlan JSON object. Return exactly one JSON object, choose a concrete domain whenever possible, preserve binary framing, and never return markdown or prose.",
      prompt: buildGenericQueryPlanPrompt(queryText, routingHints),
      maxTokens: JSON_STAGE_MAX_TOKENS.planner,
      jsonStage: "planner",
      preferTextMode: true,
    });
  const payload =
    options.disableRetry === true
      ? await runWithStageTimeout(generatePlannerPayload, STAGE_RETRY_POLICY.planner.timeoutMs, "planner")
      : await withRetry(generatePlannerPayload, {
          ...STAGE_RETRY_POLICY.planner,
          label: "planner",
          stage: "planner",
        });

  return normalizePlannerStagePayload(payload, {
    fallbackDomain: routingHints.primaryDomainId || GENERAL_FORECAST_DOMAIN,
    routingHints,
    queryText,
    timeZone: options?.timeZone,
    asOfUtc: options?.asOfUtc,
    languageHint: options?.languageHint || options?.requestLanguage,
  });
}

async function executeForecastRun(context, payload = {}) {
  const { db, admin, llmRuntime, withRetry } = context;
  const runId = safeText(payload.runId, `run_${createHash(`${payload.queryText}_${Date.now()}`).slice(0, 16)}`);
  const queryText = safeText(payload.queryText);
  const publicAccessToken = safeText(payload.publicAccessToken) || null;
  const visibility = payload.visibility === "public" ? "public" : "private";
  const engine = safeText(payload.engine, "extended");
  const plan = safeText(payload.plan, "free");
  const runtimeTransport = safeText(payload.runtimeTransport, "local_core");
  const rolloutBucket = safeText(payload.rolloutBucket);
  const sourceView = safeText(payload.sourceView, visibility === "public" ? "forecast-gallery-guest" : "search");
  const routeOrigin = safeText(payload.routeOrigin, visibility === "public" ? "public/predict" : "predict");
  const requestId = safeText(
    payload.requestId,
    `req_${createHash(`${queryText}|${runId}|${routeOrigin}|${Date.now()}`).slice(0, 18)}`
  );
  const requestTimeZone = normalizeTimeZone(payload.requestTimeZone || payload.timeZone, "Europe/Rome");
  const requestLanguage = normalizeLanguageCode(payload.requestLanguage || payload.languageHint, inferInputLanguage(queryText));
  const runAsOfUtc = safeText(payload.runAsOfUtc, nowIso());
  const runDeadlineAt = Date.now() + EXECUTION_BUDGET_MS;
  const startedAtMs = Date.now();
  const clearField = deleteSentinel(admin);
  let cacheKey = "";

  await writeRunPatch(db, admin, runId, {
    run_id: runId,
    request_id: requestId,
    status: "running",
    visibility,
    access_token: publicAccessToken,
    uid: payload.uid || null,
    source_view: sourceView,
    route_origin: routeOrigin,
    query_text: queryText,
    query_plan: payload.queryPlan || null,
    user_context: payload.userContext || null,
    started_at: serverTimestamp(admin),
    current_stage: "orchestrator",
    engine,
    plan,
    request_time_zone: requestTimeZone,
    request_language: requestLanguage,
    run_as_of_utc: runAsOfUtc,
    runtime_transport: runtimeTransport,
    rollout_bucket: rolloutBucket || null,
    core_version: CRYSTAL_CORE_VERSION,
    core_runtime: CRYSTAL_CORE_VERSION,
    last_error_code: clearField,
    last_error_message: clearField,
    last_error_stage: clearField,
    last_provider: clearField,
  });
  await writeArtifact(db, admin, runId, "orchestrator_plan", {
    depth_mode: "deep",
    engine,
    plan,
    source_view: sourceView,
    route_origin: routeOrigin,
    request_id: requestId,
  });
  logCoreEvent("run_started", {
    runId,
    transport: runtimeTransport,
    engine,
    plan,
    query: queryText.slice(0, 140),
  });

  try {
    let normalizedQuery =
      payload.queryPlan && typeof payload.queryPlan === "object"
        ? normalizePlannerStagePayload(payload.queryPlan, {
            fallbackDomain: safeText(
              payload?.queryPlan?.primary_domain_id || payload?.queryPlan?.domain_id || payload?.queryPlan?.domain,
              GENERAL_FORECAST_DOMAIN
            ),
            queryText,
            timeZone: requestTimeZone,
            languageHint: requestLanguage,
            asOfUtc: runAsOfUtc,
          })
        : null;
    if (!normalizedQuery || !safeText(normalizedQuery.primary_domain_id || normalizedQuery.domain_id || normalizedQuery.domain)) {
      await ensureRunActive(db, runId);
      ensureExecutionBudget(runDeadlineAt, "query_domain_agent");
      const queryStageStartedAt = Date.now();
      normalizedQuery = await withRetry(
        () =>
          compileQueryEdge(context, queryText, {
            disableRetry: true,
            timeZone: requestTimeZone,
            languageHint: requestLanguage,
            asOfUtc: runAsOfUtc,
          }),
        {
          ...STAGE_RETRY_POLICY.planner,
          label: "planner",
          stage: "query_domain_agent",
        onRetry: ({ attempt, error, nextDelayMs }) => {
          logCoreEvent("stage_retry", {
            runId,
            stage: "query_domain_agent",
            attempt,
            next_delay_ms: nextDelayMs,
            error_code: safeText(error?.code),
            provider: safeText(error?.details?.provider),
          });
        },
        }
      );
      logCoreEvent("stage_completed", {
        runId,
        stage: "query_domain_agent",
        duration_ms: Date.now() - queryStageStartedAt,
      });
    }

    await writeRunPatch(db, admin, runId, {
      query_plan: normalizedQuery,
      current_stage: "query_domain_agent",
    });
    await writeArtifact(db, admin, runId, "normalized_query", normalizedQuery);

    cacheKey = buildForecastCacheKey(queryText, normalizedQuery, {
      requestTimeZone,
      engine,
      plan,
    });
    const cachedForecast = await readForecastResultCache(db, cacheKey, FORECAST_RESULT_CACHE_TTL_MS);
    if (cachedForecast?.card && shouldReuseCachedForecast(cachedForecast, normalizedQuery)) {
      const cachedCard =
        visibility === "public"
          ? await maybePublishForecastArtifacts({
              db,
              admin,
              queryText,
              queryPlan: normalizedQuery,
              card: cachedForecast.card,
              sourceView,
              uid: payload.uid || null,
            })
          : cachedForecast.card;
      await writeRunPatch(db, admin, runId, {
        status: "completed",
        current_stage: "completed",
        completed_at: serverTimestamp(admin),
        result_card: cachedCard,
        query_plan: normalizedQuery,
        resolution_target: cachedForecast.resolution_target || null,
        evaluation_eligible: Boolean(cachedForecast.evaluation_eligible),
        resolution_status: cachedForecast.evaluation_eligible ? "pending" : "skipped",
        runtime_transport: runtimeTransport,
        rollout_bucket: rolloutBucket || null,
        core_version: CRYSTAL_CORE_VERSION,
        core_runtime: CRYSTAL_CORE_VERSION,
        cache_hit: true,
        cache_key: cacheKey,
        cache_source_run_id: safeText(cachedForecast.source_run_id),
        last_error_code: clearField,
        last_error_message: clearField,
        last_error_stage: clearField,
        last_provider: clearField,
      });
      await writeArtifact(db, admin, runId, "forecast_cache_hit", {
        cache_key: cacheKey,
        source_run_id: safeText(cachedForecast.source_run_id),
        cached_at: safeText(cachedForecast.cached_at),
        age_ms: Number.isFinite(Number(cachedForecast.age_ms)) ? Number(cachedForecast.age_ms) : null,
      });
      logCoreEvent("run_completed", {
        runId,
        transport: runtimeTransport,
        publication_state: safeText(cachedForecast?.card?.card_state),
        domain: safeText(cachedForecast?.card?.domain),
        cache_hit: true,
      });
      await recordPipelineLog(db, admin, {
        request_id: requestId,
        route: routeOrigin,
        event_type: "forecast_completed",
        user_mode: payload.uid ? "signed_in" : "guest",
        input_language: safeText(normalizedQuery?.input_language, requestLanguage),
        domain_id: safeText(normalizedQuery?.primary_domain_id || normalizedQuery?.domain_id || normalizedQuery?.domain),
        run_id: runId,
        cache_hit: true,
        card_state: safeText(cachedCard?.card_state),
        hold_reason: extractHoldReason(cachedCard),
        duration_ms: Date.now() - startedAtMs,
        runtime_transport: runtimeTransport,
        source_view: sourceView,
        route_origin: routeOrigin,
        query_text: queryText,
        status: "completed",
        visibility,
      });
      return {
        run_id: runId,
        status: "completed",
        query_plan: normalizedQuery,
        card: cachedCard,
      };
    }

    await ensureRunActive(db, runId);
    const { research_plan, variable_selection_pack } = runContextualVariableSelection(normalizedQuery);
    await writeRunPatch(db, admin, runId, {
      current_stage: "research_planner_cvsa_agent",
      adapter_activation_map: variable_selection_pack.adapter_activation_map,
    });
    await writeArtifact(db, admin, runId, "research_plan", research_plan);
    await writeArtifact(db, admin, runId, "variable_selection_pack", variable_selection_pack);

    await ensureRunActive(db, runId);
    await writeRunPatch(db, admin, runId, {
      current_stage: "evidence_verification_agent",
    });
    ensureExecutionBudget(runDeadlineAt, "evidence_verification_agent");
    const evidenceStageStartedAt = Date.now();
    let verifiedEvidencePack;
    let evidenceFallbackActivated = false;
    try {
      verifiedEvidencePack = await runWithStageTimeout(
        () =>
          buildVerifiedEvidencePack(context, {
            runId,
            queryText,
            normalizedQuery,
            variableSelectionPack: variable_selection_pack,
            engine,
          }),
        EVIDENCE_STAGE_TIMEOUT_MS,
        "evidence_verification_agent"
      );
    } catch (error) {
      evidenceFallbackActivated = true;
      verifiedEvidencePack = buildFallbackVerifiedEvidencePack({
        normalizedQuery,
        variableSelectionPack: variable_selection_pack,
        engine,
        reason: error instanceof Error ? error.message : "Evidence verification degraded.",
      });
      await writeArtifact(db, admin, runId, "verified_evidence_fallback", {
        activated: true,
        message: error instanceof Error ? error.message : "Evidence verification degraded.",
        code: safeText(error?.code, "evidence-fallback"),
        details: error?.details || null,
      });
      logCoreEvent("stage_degraded", {
        runId,
        stage: "evidence_verification_agent",
        duration_ms: Date.now() - evidenceStageStartedAt,
        error_code: safeText(error?.code, "evidence-fallback"),
      });
    }
    logCoreEvent("stage_completed", {
      runId,
      stage: "evidence_verification_agent",
      duration_ms: Date.now() - evidenceStageStartedAt,
      source_count: Number(verifiedEvidencePack?.evidence_quality?.source_count || 0),
    });
    if (evidenceFallbackActivated) {
      await writeArtifact(db, admin, runId, "verified_evidence_pack", {
        ...verifiedEvidencePack,
        fallback_used: true,
      });
    }
    const sportsLike = isSportsLikeQuery(normalizedQuery, queryText, getDomain(normalizedQuery.primary_domain_id, GENERAL_FORECAST_DOMAIN));
    if (sportsLike) {
      const groundedQuery = applySportsGroundingToQueryPlan(normalizedQuery, verifiedEvidencePack?.sports_grounding);
      if (groundedQuery !== normalizedQuery) {
        normalizedQuery = groundedQuery;
        await writeRunPatch(db, admin, runId, {
          query_plan: normalizedQuery,
        });
        await writeArtifact(db, admin, runId, "normalized_query_grounded", normalizedQuery);
      }
    }
    const baselineConsensusPack = buildBaselineConsensusPack({
      verifiedEvidencePack,
      normalizedQuery,
    });
    await writeArtifact(db, admin, runId, "baseline_consensus_pack", baselineConsensusPack);

      await writeRunPatch(db, admin, runId, {
        current_stage: "dossier_prediction_agent",
      });
      await ensureRunActive(db, runId);
      ensureExecutionBudget(runDeadlineAt, "dossier_prediction_agent");
      let dossierPredictionPayload;
      let dossierFallbackActivated = false;
      const forceSportsDeterministicPath = sportsLike;
      const forceDeterministicDossierFallback =
        forceSportsDeterministicPath ||
        shouldUseDeterministicDossierFallback({
          normalizedQuery,
          verifiedEvidencePack,
        });
      try {
        if (forceDeterministicDossierFallback) {
          dossierPredictionPayload = forceSportsDeterministicPath
            ? buildSportsGroundedDossierPrediction({
                queryText,
                normalizedQuery,
                verifiedEvidencePack,
                baselineConsensusPack,
              })
            : buildFallbackDossierPrediction({
                queryText,
                normalizedQuery,
                variableSelectionPack: variable_selection_pack,
                verifiedEvidencePack,
                baselineConsensusPack,
              });
          dossierFallbackActivated = true;
          await writeArtifact(db, admin, runId, "dossier_prediction_fallback", {
            activated: true,
            deterministic: true,
            sports_grounded: forceSportsDeterministicPath,
            message: forceSportsDeterministicPath
              ? "Deterministic sports grounding activated for shared-runtime parity."
              : "Deterministic dossier fallback activated for thin binary coverage.",
            code: forceSportsDeterministicPath ? "sports-provider-grounded" : "dossier-deterministic-fallback",
          });
          logCoreEvent("stage_skipped", {
            runId,
            stage: "dossier_prediction_agent",
            error_code: forceSportsDeterministicPath ? "sports-provider-grounded" : "dossier-deterministic-fallback",
          });
        } else {
          const dossierStageStartedAt = Date.now();
          dossierPredictionPayload = await withRetry(
            () =>
              runWithStageTimeout(
                () =>
                  llmRuntime.generateJson({
                    modelKind: "forecast",
                    temperature: 0,
                    systemInstruction:
                      "You are Crystal's Dossier and Prediction Agent. Return exactly one JSON object. Stay concrete, directional, and grounded in the supplied evidence.",
                    prompt: buildDossierPredictionPrompt({
                      queryText,
                      normalizedQuery,
                      variableSelectionPack: variable_selection_pack,
                      verifiedEvidencePack,
                      baselineConsensusPack,
                    }),
                    maxTokens: JSON_STAGE_MAX_TOKENS.dossier,
                    jsonStage: "dossier",
                    preferTextMode: true,
                  }),
                STAGE_RETRY_POLICY.dossier.timeoutMs,
                "dossier"
              ),
            {
              ...STAGE_RETRY_POLICY.dossier,
              label: "dossier",
              stage: "dossier_prediction_agent",
              onRetry: ({ attempt, error, nextDelayMs }) => {
                logCoreEvent("stage_retry", {
                  runId,
                  stage: "dossier_prediction_agent",
                  attempt,
                  next_delay_ms: nextDelayMs,
                  error_code: safeText(error?.code),
                  provider: safeText(error?.details?.provider),
                });
              },
            }
          );
          logCoreEvent("stage_completed", {
            runId,
            stage: "dossier_prediction_agent",
            duration_ms: Date.now() - dossierStageStartedAt,
          });
        }
      } catch (error) {
        dossierFallbackActivated = true;
        dossierPredictionPayload = buildFallbackDossierPrediction({
          queryText,
          normalizedQuery,
          variableSelectionPack: variable_selection_pack,
          verifiedEvidencePack,
          baselineConsensusPack,
        });
        await writeArtifact(db, admin, runId, "dossier_prediction_fallback", {
          activated: true,
          deterministic: forceDeterministicDossierFallback,
          message: error instanceof Error ? error.message : "Dossier generation failed.",
          code: safeText(error?.code, "dossier-fallback"),
          details: error?.details || null,
        });
        logCoreEvent(forceDeterministicDossierFallback ? "stage_skipped" : "stage_degraded", {
          runId,
          stage: "dossier_prediction_agent",
          error_code: safeText(error?.code, forceDeterministicDossierFallback ? "dossier-deterministic-fallback" : "dossier-fallback"),
        });
      }
      const dossierPrediction = normalizeDossierStagePayload(dossierPredictionPayload, {
        baselineConsensusPack,
        variableSelectionPack: variable_selection_pack,
        normalizedQuery,
        evidenceQuality: verifiedEvidencePack?.evidence_quality || {},
      });
      if (dossierFallbackActivated) {
        dossierPrediction.fallback_used = true;
      }
      await writeArtifact(db, admin, runId, "dossier_prediction_agent", dossierPrediction);

    await writeRunPatch(db, admin, runId, {
      current_stage: "simulation_decision_gate",
    });
    const simulationGate = shouldRunSimulationDecisionGate({
      normalizedQuery,
      variableSelectionPack: variable_selection_pack,
      verifiedEvidencePack,
    });
    await writeArtifact(db, admin, runId, "simulation_gate", simulationGate);

    let simulationDigest = null;
    let simulationContract = buildMiroFishOutputContract(null, simulationGate);
    if (simulationGate.enabled) {
      const remainingBudgetMs = getRemainingExecutionBudgetMs(runDeadlineAt);
      if (remainingBudgetMs <= SIMULATION_STAGE_POLICY.minimumBudgetMs + SIMULATION_STAGE_POLICY.reserveForFinalizationMs) {
        simulationContract = buildSimulationBypassContract(simulationGate, {
          status: "skipped",
          reason: "simulation_budget_too_thin",
          summary: "Simulation was skipped to preserve enough budget for final fusion, calibration, and card generation.",
          note: `Remaining execution budget was ${remainingBudgetMs}ms, below the safe simulation threshold.`,
        });
        await writeArtifact(db, admin, runId, "simulation_bypass", {
          activated: true,
          status: "skipped",
          reason: safeText(simulationContract?.degradation_reason, "simulation_budget_too_thin"),
          budget_ms_remaining: remainingBudgetMs,
        });
        await writeArtifact(db, admin, runId, "mirofish_output_contract", simulationContract);
        logCoreEvent("stage_skipped", {
          runId,
          stage: "simulation_decision_gate",
          reason: safeText(simulationContract?.degradation_reason, "simulation_budget_too_thin"),
          budget_ms_remaining: remainingBudgetMs,
        });
      } else {
        await ensureRunActive(db, runId);
        ensureExecutionBudget(runDeadlineAt, "simulation_decision_gate");
        const simulationStageStartedAt = Date.now();
        const simulationTimeoutMs = Math.max(
          SIMULATION_STAGE_POLICY.minimumBudgetMs,
          Math.min(
            SIMULATION_STAGE_POLICY.timeoutMs,
            remainingBudgetMs - SIMULATION_STAGE_POLICY.reserveForFinalizationMs
          )
        );
        try {
          simulationDigest = await withRetry(
            () =>
              runWithStageTimeout(
                () =>
                  getWorldSimDigest({
                    ai: context.ai,
                    db,
                    admin,
                    withRetry,
                    fetchJson: context.fetchJson,
                    queryText,
                    queryPlan: normalizedQuery,
                    userContext: payload.userContext || null,
                    engine: "oracle",
                    plan,
                    simulationContext: verifiedEvidencePack?.simulation_context || null,
                    sidecarBaseUrl: process.env.MIROFISH_BASE_URL || "",
                    sidecarApiKey: process.env.MIROFISH_API_KEY || "",
                  }),
                simulationTimeoutMs,
                "simulation_decision_gate"
              ),
            {
              retries: SIMULATION_STAGE_POLICY.retries,
              baseDelayMs: SIMULATION_STAGE_POLICY.baseDelayMs,
              timeoutMs: null,
              label: "simulation",
              stage: "simulation_decision_gate",
              onRetry: ({ attempt, error, nextDelayMs }) => {
                logCoreEvent("stage_retry", {
                  runId,
                  stage: "simulation_decision_gate",
                  attempt,
                  next_delay_ms: nextDelayMs,
                  error_code: safeText(error?.code),
                  provider: safeText(error?.details?.provider),
                });
              },
            }
          );
          simulationContract = buildMiroFishOutputContract(simulationDigest, simulationGate);
          await writeArtifact(db, admin, runId, "mirofish_output_contract", simulationContract);
          logCoreEvent("stage_completed", {
            runId,
            stage: "simulation_decision_gate",
            duration_ms: Date.now() - simulationStageStartedAt,
            simulation_status: safeText(simulationContract?.simulation_status?.status, "completed"),
          });
        } catch (error) {
          simulationContract = buildSimulationBypassContract(simulationGate, {
            status: "degraded",
            reason: safeText(error?.code, "simulation_degraded"),
            summary: "Simulation evidence degraded and Crystal continued with dossier, fusion, and calibration only.",
            note: error instanceof Error ? error.message : "Simulation stage degraded.",
          });
          await writeArtifact(db, admin, runId, "simulation_bypass", {
            activated: true,
            status: "degraded",
            reason: safeText(simulationContract?.degradation_reason, "simulation_degraded"),
            message: error instanceof Error ? error.message : "Simulation stage degraded.",
            code: safeText(error?.code, "simulation_degraded"),
            details: error?.details || null,
          });
          await writeArtifact(db, admin, runId, "mirofish_output_contract", simulationContract);
          logCoreEvent("stage_degraded", {
            runId,
            stage: "simulation_decision_gate",
            duration_ms: Date.now() - simulationStageStartedAt,
            error_code: safeText(error?.code, "simulation_degraded"),
            provider: safeText(error?.details?.provider),
          });
        }
      }
    }

    const rawPrediction = applySimulationFusion(dossierPrediction?.raw_prediction || {}, simulationContract);
    rawPrediction.scenario_set =
      Array.isArray(dossierPrediction?.raw_prediction?.scenario_set) && dossierPrediction.raw_prediction.scenario_set.length > 0
        ? dossierPrediction.raw_prediction.scenario_set
        : [];

    await writeRunPatch(db, admin, runId, {
      current_stage: "calibration_publishing_agent",
    });
    const domainConfig = getDomain(normalizedQuery.primary_domain_id, GENERAL_FORECAST_DOMAIN);
    let finalizedScorecard = finalizeScorecard(rawPrediction, verifiedEvidencePack, normalizedQuery, domainConfig, {
      engine,
    });
    const resolutionTarget = buildResolutionTarget({
      normalizedQuery,
      scorecard: finalizedScorecard,
      verifiedEvidencePack,
    });
    const evaluationEligible = Boolean(resolutionTarget?.evaluation_eligible);
    const domainCalibration = await loadActiveCalibration(db, normalizedQuery.primary_domain_id);
    const { scorecard: calibratedScorecard, calibration_snapshot: calibrationSnapshot } = applyCalibrationToScorecard(
      finalizedScorecard,
      domainCalibration
    );
    finalizedScorecard = calibratedScorecard;

    if (simulationContract?.simulation_summary_for_fusion?.simulation_summary) {
      finalizedScorecard.publication_basis = {
        ...(finalizedScorecard.publication_basis || {}),
        notes: uniqueStrings([
          ...((finalizedScorecard.publication_basis && Array.isArray(finalizedScorecard.publication_basis.notes))
            ? finalizedScorecard.publication_basis.notes
            : []),
          safeText(simulationContract.simulation_summary_for_fusion.simulation_summary),
        ]).slice(0, 4),
      };
    }

    const sportsScenarioSet = buildSportsScenarioSetFromFrame(
      getSportsOutcomeFrame(
        finalizedScorecard,
        verifiedEvidencePack?.sports_grounding?.model_probabilities || simulationDigest?.sports_decision?.model_probabilities || null,
        normalizedQuery
      )
    );
    finalizedScorecard.scenario_set = sportsScenarioSet.length > 0 ? sportsScenarioSet : rawPrediction.scenario_set;
    await writeArtifact(db, admin, runId, "calibration_snapshot", calibrationSnapshot);
    await writeArtifact(db, admin, runId, "fusion_scorecard", finalizedScorecard);

      await writeRunPatch(db, admin, runId, {
        current_stage: "card_generation",
        resolution_target: resolutionTarget,
        evaluation_eligible: evaluationEligible,
        resolution_status: evaluationEligible ? "pending" : "skipped",
      });
      let voicePayloadRaw;
      let voiceFallbackActivated = false;
      const forceDeterministicVoicePayload = sportsLike;
      try {
        if (forceDeterministicVoicePayload) {
          voicePayloadRaw = buildFallbackVoicePayload({
            queryText,
            normalizedQuery,
            scorecard: finalizedScorecard,
            verifiedEvidencePack,
          });
          voiceFallbackActivated = true;
          logCoreEvent("stage_skipped", {
            runId,
            stage: "card_generation",
            error_code: "sports-deterministic-voice",
          });
        } else {
          ensureExecutionBudget(runDeadlineAt, "card_generation");
          const verbalizerStageStartedAt = Date.now();
          voicePayloadRaw = await withRetry(
            () =>
              runWithStageTimeout(
                () =>
                  llmRuntime.generateJson({
                    modelKind: "forecast",
                    temperature: 0,
                    systemInstruction:
                      "You write Crystal prediction cards. Return exactly one JSON object. Put the call first, keep the tone precise, and never hide the thesis behind vague uncertainty copy.",
                    prompt: buildForecastVerbalizationPrompt({
                      queryText,
                      normalizedQuery,
                      verifiedEvidencePack,
                      scorecard: finalizedScorecard,
                    }),
                    maxTokens: JSON_STAGE_MAX_TOKENS.verbalizer,
                    jsonStage: "verbalizer",
                    preferTextMode: true,
                  }),
                STAGE_RETRY_POLICY.verbalizer.timeoutMs,
                "verbalizer"
              ),
            {
              ...STAGE_RETRY_POLICY.verbalizer,
              label: "verbalizer",
              stage: "card_generation",
              onRetry: ({ attempt, error, nextDelayMs }) => {
                logCoreEvent("stage_retry", {
                  runId,
                  stage: "card_generation",
                  attempt,
                  next_delay_ms: nextDelayMs,
                  error_code: safeText(error?.code),
                  provider: safeText(error?.details?.provider),
                });
              },
            }
          );
          logCoreEvent("stage_completed", {
            runId,
            stage: "card_generation",
            duration_ms: Date.now() - verbalizerStageStartedAt,
          });
        }
      } catch (error) {
        voiceFallbackActivated = true;
        voicePayloadRaw = buildFallbackVoicePayload({
          queryText,
          normalizedQuery,
          scorecard: finalizedScorecard,
          verifiedEvidencePack,
        });
        await writeArtifact(db, admin, runId, "voice_payload_fallback", {
          activated: true,
          message: error instanceof Error ? error.message : "Voice payload generation failed.",
          code: safeText(error?.code, "voice-fallback"),
          details: error?.details || null,
        });
      }
      const voicePayload = normalizeVerbalizerStagePayload(voicePayloadRaw, {
        queryText,
        scorecard: finalizedScorecard,
        verifiedEvidencePack,
        normalizedQuery,
      });
      if (voiceFallbackActivated) {
        voicePayload.fallback_used = true;
      }
      await writeArtifact(db, admin, runId, "voice_payload", voicePayload);

    let card = buildFinalCard({
      runId,
      queryText,
      normalizedQuery,
      scorecard: finalizedScorecard,
      voicePayload,
      verifiedEvidencePack,
      simulationDigest,
      calibrationSnapshot,
      resolutionTarget,
      evaluationEligible,
      runtimeTransport,
      rolloutBucket,
    });
    if (visibility === "public") {
      card = await maybePublishForecastArtifacts({
        db,
        admin,
        queryText,
        queryPlan: normalizedQuery,
        card,
        sourceView,
        uid: payload.uid || null,
      });
    }

    await writeRunPatch(db, admin, runId, {
      status: "completed",
      current_stage: "completed",
      completed_at: serverTimestamp(admin),
      result_card: card,
      query_plan: normalizedQuery,
      resolution_target: resolutionTarget,
      evaluation_eligible: evaluationEligible,
      resolution_status: evaluationEligible ? "pending" : "skipped",
      runtime_transport: runtimeTransport,
      rollout_bucket: rolloutBucket || null,
      core_version: CRYSTAL_CORE_VERSION,
      route_origin: routeOrigin,
      request_id: requestId,
      last_error_code: clearField,
      last_error_message: clearField,
      last_error_stage: clearField,
      last_provider: clearField,
    });
    await writeForecastResultCache(db, admin, cacheKey, {
      source_run_id: runId,
      query_text: queryText,
      query_plan: normalizedQuery,
      card,
      resolution_target: resolutionTarget,
      evaluation_eligible: evaluationEligible,
      calibration_snapshot: calibrationSnapshot || null,
      runtime_transport: runtimeTransport,
      visibility,
    });
    logCoreEvent("run_completed", {
      runId,
      transport: runtimeTransport,
      publication_state: safeText(card?.card_state),
      domain: safeText(card?.domain),
    });
    await recordPipelineLog(db, admin, {
      request_id: requestId,
      route: routeOrigin,
      event_type: "forecast_completed",
      user_mode: payload.uid ? "signed_in" : "guest",
      input_language: safeText(card?.input_language, requestLanguage),
      domain_id: safeText(card?.domain, safeText(normalizedQuery?.primary_domain_id || normalizedQuery?.domain_id || normalizedQuery?.domain)),
      run_id: runId,
      cache_hit: false,
      card_state: safeText(card?.card_state),
      hold_reason: extractHoldReason(card),
      duration_ms: Date.now() - startedAtMs,
      runtime_transport: runtimeTransport,
      source_view: sourceView,
      route_origin: routeOrigin,
      query_text: queryText,
      status: "completed",
      visibility,
    });

    return {
      run_id: runId,
      status: "completed",
      query_plan: normalizedQuery,
      card,
    };
  } catch (error) {
    await writeRunPatch(db, admin, runId, {
      status: "failed",
      current_stage: "failed",
      completed_at: serverTimestamp(admin),
      error_message: error instanceof Error ? error.message : "Crystal core failed.",
      error_code: safeText(error?.code, "crystal-core-error"),
      last_error_code: safeText(error?.code, "crystal-core-error"),
      last_error_message: error instanceof Error ? error.message : "Crystal core failed.",
      last_error_stage: safeText(error?.details?.stage || error?.details?.json_stage || error?.stage, "unknown"),
      last_provider: safeText(
        error?.details?.provider || error?.details?.primaryProvider || error?.details?.fallbackProvider,
        ""
      ),
      last_attempt_at: serverTimestamp(admin),
      route_origin: routeOrigin,
      request_id: requestId,
    });
    logCoreEvent("run_failed", {
      runId,
      transport: runtimeTransport,
      error_code: safeText(error?.code, "crystal-core-error"),
      error_stage: safeText(error?.details?.stage || error?.details?.json_stage || error?.stage, "unknown"),
      provider: safeText(error?.details?.provider || error?.details?.primaryProvider || error?.details?.fallbackProvider),
      message: error instanceof Error ? error.message : String(error),
    });
    await recordPipelineLog(db, admin, {
      request_id: requestId,
      route: routeOrigin,
      event_type: "forecast_failed",
      user_mode: payload.uid ? "signed_in" : "guest",
      input_language: requestLanguage,
      domain_id: safeText(payload?.queryPlan?.primary_domain_id || payload?.queryPlan?.domain_id || payload?.queryPlan?.domain),
      run_id: runId,
      cache_hit: false,
      error_code: safeText(error?.code, "crystal-core-error"),
      duration_ms: Date.now() - startedAtMs,
      runtime_transport: runtimeTransport,
      source_view: sourceView,
      route_origin: routeOrigin,
      query_text: queryText,
      status: "failed",
      visibility,
    });
    throw error;
  }
}

function createCrystalCoreRuntime(config = {}) {
  const llmRuntime =
    config.llmRuntime ||
    createLlmRuntime({
      getGeminiApiKey: config.getGeminiApiKey || (() => process.env.GEMINI_API_KEY || ""),
    });
  const withRetry =
    config.withRetry ||
    (async function retry(fn, optionsOrRetries = 2, delayMs = 1200) {
      const options =
        typeof optionsOrRetries === "object" && optionsOrRetries !== null
          ? {
              retries: Number.isFinite(Number(optionsOrRetries.retries)) ? Number(optionsOrRetries.retries) : 2,
              baseDelayMs: Number.isFinite(Number(optionsOrRetries.baseDelayMs))
                ? Number(optionsOrRetries.baseDelayMs)
                : delayMs,
              maxDelayMs: Number.isFinite(Number(optionsOrRetries.maxDelayMs))
                ? Number(optionsOrRetries.maxDelayMs)
                : 10_000,
              jitterRatio:
                Number.isFinite(Number(optionsOrRetries.jitterRatio)) && Number(optionsOrRetries.jitterRatio) >= 0
                  ? Number(optionsOrRetries.jitterRatio)
                  : 0.25,
              timeoutMs: Number.isFinite(Number(optionsOrRetries.timeoutMs))
                ? Number(optionsOrRetries.timeoutMs)
                : null,
              stage: safeText(optionsOrRetries.stage || optionsOrRetries.label || "runtime"),
              onRetry: typeof optionsOrRetries.onRetry === "function" ? optionsOrRetries.onRetry : null,
              isRetryable:
                typeof optionsOrRetries.isRetryable === "function"
                  ? optionsOrRetries.isRetryable
                  : isRetryableRuntimeError,
            }
          : {
              retries: Number.isFinite(Number(optionsOrRetries)) ? Number(optionsOrRetries) : 2,
              baseDelayMs: delayMs,
              maxDelayMs: 10_000,
              jitterRatio: 0.25,
              timeoutMs: null,
              stage: "runtime",
              onRetry: null,
              isRetryable: isRetryableRuntimeError,
            };

      for (let attempt = 1; attempt <= options.retries + 1; attempt += 1) {
        try {
          return await runWithStageTimeout(fn, options.timeoutMs, options.stage);
        } catch (error) {
          const shouldRetry = attempt <= options.retries && options.isRetryable(error);
          if (!shouldRetry) {
            throw error;
          }

          const exponentialDelay = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
          const jitterWindow = Math.max(0, Math.round(exponentialDelay * options.jitterRatio));
          const jitter = jitterWindow > 0 ? Math.floor(Math.random() * (jitterWindow + 1)) : 0;
          const nextDelayMs = exponentialDelay + jitter;
          if (options.onRetry) {
            await options.onRetry({ attempt, error, nextDelayMs, stage: options.stage });
          }
          await new Promise((resolve) => setTimeout(resolve, nextDelayMs));
        }
      }

      throw new Error("Crystal core retry loop exhausted unexpectedly.");
    });
  const fetchJson =
    config.fetchJson ||
    (async (url, options = {}) => {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${await response.text()}`);
      }
      return response.json();
    });
  const geminiKey = safeText(config.getGeminiApiKey?.()) || safeText(process.env.GEMINI_API_KEY);
  const ai = config.ai || (geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null);

  const context = {
    ...config,
    llmRuntime,
    withRetry,
    fetchJson,
    ai,
  };

  return {
    compileQuery: (queryText, options = {}) => compileQueryEdge(context, queryText, options),
    executeForecastRun: (payload) => executeForecastRun(context, payload),
    buildPendingRunCard,
    runOfflineEvaluationMode: (options) => runOfflineEvaluationMode(context, options),
    async getHealth() {
      let remoteAdapterReachable = false;
      if (safeText(process.env.MIROFISH_BASE_URL)) {
        try {
          await fetchJson(`${safeText(process.env.MIROFISH_BASE_URL).replace(/\/$/, "")}/health`);
          remoteAdapterReachable = true;
        } catch (_error) {
          remoteAdapterReachable = false;
        }
      }

        return {
          runtime: CRYSTAL_CORE_VERSION,
          mode: "deep_default",
          available: true,
          llm: llmRuntime.getRuntimeMetadata(),
          sports: getSportsRuntimeHealth(),
          provider_states: getAllProviderRuntimeStatuses(),
          simulation: {
            configured: Boolean(safeText(process.env.MIROFISH_BASE_URL)),
            adapterReachable: remoteAdapterReachable,
          },
        adapters: [
          "EntityResolutionAdapter",
          "TemporalHorizonAdapter",
          "HistoricalBaselineAdapter",
          "ConsensusBaselineAdapter",
          "MacroSpilloverAdapter",
          "EventNewsAdapter",
          "SourceReliabilityAdapter",
          "PolicyPoliticalRiskAdapter",
          "MarketsAssetsAdapter",
          "CitiesHousingTravelAdapter",
          "CompanyOperationsAdapter",
        ],
        implemented_sources: getImplementedSourceIds(),
        grounding: buildRuntimeGroundingSummary(),
      };
    },
  };
}

module.exports = {
  CRYSTAL_CORE_VERSION,
  createCrystalCoreRuntime,
  __testables: {
    JSON_STAGE_MAX_TOKENS,
    PLANNER_RESPONSE_SCHEMA,
    DOSSIER_RESPONSE_SCHEMA,
    VERBALIZER_RESPONSE_SCHEMA,
    buildGenericQueryPlanPrompt,
    buildDossierPredictionPrompt,
    buildForecastVerbalizationPrompt,
    normalizePlannerStagePayload,
    normalizeDossierStagePayload,
    normalizeVerbalizerStagePayload,
    normalizeQueryPlanPayload,
    buildTemporalContext,
    buildVerifiedEvidencePack,
    buildFallbackVerifiedEvidencePack,
    buildFinalCard,
    buildSourceUsageSummary,
    buildMarketStructure,
    getAllProviderRuntimeStatuses,
  },
};
