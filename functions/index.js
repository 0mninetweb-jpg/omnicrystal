const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { GoogleAuth } = require("google-auth-library");
const googleTrends = require("google-trends-api");
const Stripe = require("stripe");
const { createLlmRuntime } = require("./llmRuntime");
const {
  createManualWorldSimJob,
  createMatrixSimulationJob,
  maybeCreatePredictionWorldSimJob,
  maybeCreateNextletterWorldSimJobs,
  getWorldSimJobDetail,
  getWorldSimJobResult,
  getMatrixSimulationJobDetail,
  getMatrixSimulationJobResult,
  cancelWorldSimJob,
  cancelMatrixSimulationJob,
  getWorldSimRuntimeHealth,
} = require("./worldSimJobs");
const {
  attachPolymarketToCard,
  attachPolymarketToNextletter,
  getPolymarketPulse,
  getPolymarketRuntimeHealth,
} = require("./polymarket");
const {
  GENERAL_FORECAST_DOMAIN,
  SPORTS_MATCH_OUTCOMES_DOMAIN,
  SPORTS_FIXTURE_CARD_TYPE,
  buildSportsForecastContext,
  getSportsRuntimeHealth,
  isSportsDomain,
  looksLikeSportsMatchQuery,
} = require("./sportsData");
const {
  CATALOG_DOMAIN_IDS,
  CATALOG_VERSION_ID,
  buildCoverageLedger,
  getCatalogRegistryPayload,
  getCoverageSnapshot,
  getDomain,
  getDomainCardTypes,
  getHealthSummary: getCatalogHealthSummary,
  getSourceHealthSummary,
  getSourceRegistryPayload,
  isSupportedDomain,
  resolveCardTypeId,
  resolveDomainId,
} = require("./catalogRegistry");
const {
  buildRoutingHints,
  mergeQueryPlanWithRouting,
  computeEvidenceQuality,
  finalizeScorecard,
  buildBinaryContract,
  buildCompatibleProbabilitySplit,
  buildDriverObjects,
  normalizeTextList,
  clamp01: predictionClamp01,
} = require("./predictionCore");
const { createCrystalCoreRuntime, CRYSTAL_CORE_VERSION } = require("./crystalCore/runtime");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const NIXTLA_API_KEY = defineSecret("NIXTLA_API_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

const SUPPORTED_DOMAINS = Array.from(new Set([GENERAL_FORECAST_DOMAIN, ...CATALOG_DOMAIN_IDS]));

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const llmRuntime = createLlmRuntime({
  getGeminiApiKey: () => GEMINI_API_KEY.value(),
});

const PLAN_OFFERS = {
  free: { creditsPerCycle: 15, watchlistLimit: 5 },
  plus: { creditsPerCycle: 120, watchlistLimit: 25 },
  pro: { creditsPerCycle: 400, watchlistLimit: 100 },
};

const STRIPE_PRICING = {
  plus: { month: 1200, year: 9900 },
  pro: { month: 2900, year: 24900 },
};

const DEFAULT_PROFILE_AI_FREE_MESSAGES = 10;
const PLAN_ORDER = ["free", "plus", "pro"];
const PREDICTION_CORE_VERSION = "v2";

function isBillingTestMode() {
  return ["1", "true", "yes", "on"].includes(String(process.env.BILLING_TEST_MODE || "").trim().toLowerCase());
}

function getBillingRuntimeHealth() {
  const disabled = isBillingTestMode();
  return {
    enabled: !disabled,
    mode: disabled ? "disabled" : "live",
    provider: "stripe",
    message: disabled
      ? "Billing is temporarily unavailable during the current test rollout."
      : "Billing is active.",
  };
}

function createBillingDisabledError() {
  return createApiError(
    "billing-disabled",
    "Billing is temporarily unavailable during the current test rollout.",
    503,
    {
      billingTestMode: true,
    }
  );
}

function getStripe() {
  if (isBillingTestMode()) {
    throw createBillingDisabledError();
  }
  const apiKey = STRIPE_SECRET_KEY.value();
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY non configurata per Firebase Functions.");
  }
  return new Stripe(apiKey, { apiVersion: "2025-02-24.acacia" });
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_error) {
      return {};
    }
  }
  return req.body;
}

function stripApiPrefix(pathname) {
  const path = pathname || "/";
  return path.startsWith("/api/") ? path.slice(4) : path === "/api" ? "/" : path;
}

function respondJson(res, status, payload) {
  res.status(status);
  res.set("Cache-Control", "no-store");
  res.set("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

function sanitizeSegment(value, fallback = "global") {
  const normalized = String(value || fallback).trim().toLowerCase();
  const safe = normalized.replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || fallback;
}

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function createQueryHash(queryText) {
  return crypto.createHash("sha256").update(queryText.trim().toLowerCase()).digest("hex");
}

function createCardCacheKey(queryText, queryPlan = {}, engine = "standard") {
  return createQueryHash(
    JSON.stringify({
      predictionCoreVersion: PREDICTION_CORE_VERSION,
      queryText: queryText.trim().toLowerCase(),
      engine,
      domain: queryPlan?.domain || queryPlan?.domain_id || "",
      primaryDomain: queryPlan?.primary_domain_id || "",
      horizons: Array.isArray(queryPlan?.horizons) ? queryPlan.horizons.map((item) => item?.horizon_id || "") : [],
      filters: queryPlan?.filters || {},
      constraints: queryPlan?.constraints || {},
      entities: Array.isArray(queryPlan?.entities)
        ? queryPlan.entities.map((entity) => `${entity?.entity_type || "entity"}:${entity?.label || entity?.entity_id || ""}`)
        : [],
    })
  );
}

const HORIZON_LABELS = {
  now: "Now",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "6m": "6 months",
  "12m": "12 months",
};

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
  return safeText(getPrimaryEntityLabel(queryPlan), safeText(getPrimaryLocationFromPlan(queryPlan), safeText(queryText.split(/\s+/).slice(0, 4).join(" "), "General")));
}

function getForecastHorizonId(queryPlan = {}) {
  return safeText(queryPlan?.filters?.horizon, safeText(queryPlan?.horizons?.[0]?.horizon_id, "30d"));
}

function formatForecastHorizonLabel(horizonId = "30d") {
  return HORIZON_LABELS[horizonId] || horizonId;
}

function createForecastLineageId(queryText, queryPlan = {}, card = {}) {
  const seed = [
    safeText(queryText).toLowerCase(),
    resolveDomainId(queryPlan?.primary_domain_id || queryPlan?.domain || queryPlan?.domain_id || card?.domain || ""),
    slugifyText(getPrimaryForecastEntityLabel(queryPlan, queryText), "general"),
    slugifyText(getPrimaryLocationFromPlan(queryPlan), "auto"),
    getForecastHorizonId(queryPlan),
  ].join("|");
  return `lineage_${createQueryHash(seed).slice(0, 24)}`;
}

function buildPublicForecastIds(queryText, queryPlan = {}, card = {}, existingPublicSlug = "") {
  const lineageId = createForecastLineageId(queryText, queryPlan, card);
  const domainId = resolveDomainId(queryPlan?.primary_domain_id || queryPlan?.domain || queryPlan?.domain_id || card?.domain || "");
  const domainConfig = getDomain(domainId);
  const entityLabel = getPrimaryForecastEntityLabel(queryPlan, queryText);
  const entitySlug = slugifyText(entityLabel, "general");
  const geographyLabel = safeText(getPrimaryLocationFromPlan(queryPlan), "Auto");
  const geographySlug = slugifyText(geographyLabel, "auto");
  const topicLabel = safeText(domainConfig?.short_label || domainConfig?.title, "Forecast");
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

async function maybePublishForecastArtifacts({
  queryText,
  queryPlan,
  card,
  sourceView = "search",
  uid = null,
}) {
  if (!card || getCardStateUi(card.card_state) === "coverage_gap") {
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
  const publishedAt =
    safeText(publicSnapshot.data()?.published_at) ||
    safeText(ledgerSnapshot.data()?.published_at) ||
    new Date().toISOString();
  const horizonId = getForecastHorizonId(queryPlan);
  const confidenceScore = Number.isFinite(Number(card?.trust_layer?.confidence_score))
    ? Number(card.trust_layer.confidence_score)
    : 0;
  const publicPayload = {
    ...card,
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
    published_at: publishedAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const createdAt = admin.firestore.FieldValue.serverTimestamp();
  const ledgerPayload = ledgerSnapshot.exists
    ? publicPayload
    : {
        ...publicPayload,
        createdAt,
      };
  const publicDocPayload = publicSnapshot.exists
    ? publicPayload
    : {
        ...publicPayload,
        createdAt,
      };

  await Promise.all([
    ledgerRef.set(ledgerPayload, { merge: true }),
    versionRef.set(
      {
        ...publicPayload,
        parent_lineage_id: lineageId,
        version_saved_at: admin.firestore.FieldValue.serverTimestamp(),
        createdAt,
      },
      { merge: true }
    ),
    publicRef.set(publicDocPayload, { merge: true }),
  ]);

  return {
    ...card,
    lineage_id: lineageId,
    ledger_ref: `forecast_ledger/${lineageId}`,
    public_forecast_ref: `public_forecasts/${ids.publicSlug}`,
    public_slug: ids.publicSlug,
    query_origin: safeText(queryText),
  };
}

function clamp01(value, fallback = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num > 1) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function sanitizeList(list) {
  return Array.isArray(list) ? list.filter((item) => typeof item === "string" && item.trim()) : [];
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function isPlaceholderText(value) {
  const normalized = safeText(value).toLowerCase();
  if (!normalized) return true;
  return (
    /^(scenario|elemento|item|driver|entity|azione|option|fixture|match)\s*[_-]?\d+$/.test(normalized) ||
    /^world sim entity\s*\d+$/.test(normalized) ||
    /^mossa oracle\s*\d+$/.test(normalized) ||
    normalized === "narrative only" ||
    normalized === "analisi non disponibile"
  );
}

function isMeaningfulText(value) {
  return Boolean(safeText(value) && !isPlaceholderText(value));
}

function normalizeEvidenceList(list) {
  return sanitizeList(list).map((item) => safeText(item)).filter(isMeaningfulText).slice(0, 4);
}

function normalizeFixtureReads(fixtureReads = []) {
  if (!Array.isArray(fixtureReads)) return [];

  return fixtureReads
    .map((fixture, index) => ({
      fixture_id: safeText(fixture?.fixture_id || fixture?.fixtureId, `fixture_${index + 1}`),
      label: safeText(fixture?.label || fixture?.fixture_label || fixture?.fixtureLabel),
      primary_call: safeText(
        fixture?.primary_call || fixture?.primaryCall || fixture?.pick || fixture?.recommended_outcome || fixture?.outcome
      ),
      confidence: clamp01(fixture?.confidence, 0),
      rationale: safeText(fixture?.rationale || fixture?.note || fixture?.summary),
      evidence: normalizeEvidenceList(fixture?.evidence),
      caution: safeText(fixture?.caution || fixture?.watchout || fixture?.risk_note),
    }))
    .filter((fixture) => isMeaningfulText(fixture.label) && isMeaningfulText(fixture.primary_call))
    .sort((left, right) => right.confidence - left.confidence);
}

function buildSportsRankedList(fixtureReads = []) {
  return fixtureReads.slice(0, 7).map((fixture, index) => ({
    item_id: fixture.fixture_id || `item_${index + 1}`,
    label: fixture.label,
    score: clamp01(fixture.confidence, 0.5),
    rank: index + 1,
    note: [`Esito più probabile: ${fixture.primary_call}.`, fixture.rationale || fixture.caution || ""]
      .filter(Boolean)
      .join(" "),
  }));
}

function mapCoverageStateToTrustFlag(state) {
  if (state === "published") return "sufficient";
  if (state === "limited") return "partial";
  return "insufficient";
}

function mapCoverageStateToFreshness(state) {
  if (state === "published") return "fresh";
  if (state === "limited") return "unknown";
  return "stale";
}

function createEvidenceDrawer(card, domainConfig, nowIso) {
  const trustLayer = card?.trust_layer || {};
  const provenanceSummary = trustLayer?.provenance_summary || {};
  const freshness = trustLayer?.freshness || {};
  return {
    metrics_provenance: sanitizeList(provenanceSummary.license_summary).length > 0 ? provenanceSummary.license_summary : domainConfig.source_allowlist,
    freshness_summary: {
      as_of_utc: safeText(freshness.as_of_utc, nowIso),
      cadence: safeText(domainConfig.refresh_cadence, "weekly"),
      staleness_bucket: safeText(freshness.staleness_bucket, "unknown"),
    },
    coverage_notes: [safeText(domainConfig.status_reason)].filter(Boolean),
    gating_reason:
      domainConfig.current_state === "published"
        ? "published"
        : domainConfig.current_state === "limited"
          ? "limited_by_coverage"
          : "blocked_by_coverage",
  };
}

function buildCoverageGapCard(queryText, queryPlan, domainConfig) {
  const nowIso = new Date().toISOString();
  const title = `${domainConfig.title}: coverage still building`;
  return {
    card_id: crypto.randomUUID(),
    card_type: "coverage_gap",
    canonical_card_type: "coverage_gap",
    card_state: "blocked",
    version_id: `catalog_${CATALOG_VERSION_ID}`,
    domain: domainConfig.domain_id,
    title,
    summary:
      "Crystal knows this blueprint domain, but the public evidence fabric for this coverage unit is not ready enough to publish a trustworthy read.",
    verdict: `Coverage gap for ${domainConfig.short_label}. Crystal will not guess where the current registry says coverage is blocked.`,
    personal_output: "",
    stakes_level: "medium",
    risk_band: "medium",
    scenario_set: [],
    so_what: [],
    ranked_list: [],
    fixture_reads: [],
    drivers: [],
    what_to_watch: [
      `Watch for the domain to move from blocked to limited or published in the coverage explorer.`,
      `Narrow the geography, entity, or horizon to reduce the evidence gap.`,
    ],
    how_to_raise_confidence: [
      `Broaden the scope or use a shorter horizon for ${domainConfig.short_label}.`,
      `Return once the source registry for this domain is operational.`,
    ],
    evidence_drawer: {
      metrics_provenance: domainConfig.source_allowlist,
      freshness_summary: {
        as_of_utc: nowIso,
        cadence: domainConfig.refresh_cadence,
        staleness_bucket: "stale",
      },
      coverage_notes: [domainConfig.status_reason],
      gating_reason: "blocked_by_coverage",
    },
    trust_layer: {
      confidence_score: 0.22,
      confidence_tier: "low",
      data_sufficiency_flag: "insufficient",
      freshness: {
        staleness_bucket: "stale",
        as_of_utc: nowIso,
      },
      provenance_summary: {
        verification_level: "unverified",
        license_summary: domainConfig.source_allowlist,
      },
    },
    prediction_market_frame: null,
  };
}

function hasMeaningfulProbabilities(items = []) {
  const probabilities = items.map((item) => Number(item?.probability)).filter((value) => Number.isFinite(value));
  if (probabilities.length < 2) return true;
  const rounded = probabilities.map((value) => Number(value.toFixed(2)));
  return new Set(rounded).size > 1;
}

function sanitizeFirestoreValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeFirestoreValue(item))
      .filter((item) => item !== undefined);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date || typeof value.toDate === "function") {
    return value;
  }

  const ctorName = value.constructor?.name;
  if (ctorName && ctorName !== "Object") {
    return value;
  }

  const sanitizedEntries = Object.entries(value).flatMap(([key, nestedValue]) => {
    const sanitizedValue = sanitizeFirestoreValue(nestedValue);
    return sanitizedValue === undefined ? [] : [[key, sanitizedValue]];
  });

  return Object.fromEntries(sanitizedEntries);
}

function isPlan(value) {
  return PLAN_ORDER.includes(value);
}

function isPlanStatus(value) {
  return ["active", "past_due", "canceled"].includes(value);
}

function planAtLeast(plan, requiredPlan) {
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(requiredPlan);
}

function getNextCreditResetDate(from = new Date()) {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toFiniteNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function createDefaultEntitlements(plan = "free", now = new Date()) {
  return {
    plan,
    planStatus: "active",
    creditsBalance: PLAN_OFFERS[plan].creditsPerCycle,
    creditsCycleAmount: PLAN_OFFERS[plan].creditsPerCycle,
    creditsResetAt: getNextCreditResetDate(now),
    profileAiFreeMessagesRemaining: DEFAULT_PROFILE_AI_FREE_MESSAGES,
    watchlistLimit: PLAN_OFFERS[plan].watchlistLimit,
    planExpiresAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    billingInterval: null,
  };
}

function downgradeToFree(state, now = new Date()) {
  const defaults = createDefaultEntitlements("free", now);
  return {
    ...state,
    ...defaults,
  };
}

function normalizeUserState(data = {}, now = new Date()) {
  const plan = isPlan(data.plan) ? data.plan : "free";
  const defaults = createDefaultEntitlements(plan, now);
  const normalized = {
    plan,
    planStatus: isPlanStatus(data.planStatus) ? data.planStatus : defaults.planStatus,
    creditsBalance: toFiniteNumber(data.creditsBalance, defaults.creditsBalance),
    creditsCycleAmount: toFiniteNumber(data.creditsCycleAmount, PLAN_OFFERS[plan].creditsPerCycle),
    creditsResetAt: parseTimestamp(data.creditsResetAt) || defaults.creditsResetAt,
    profileAiFreeMessagesRemaining: toFiniteNumber(
      data.profileAiFreeMessagesRemaining,
      DEFAULT_PROFILE_AI_FREE_MESSAGES
    ),
    watchlistLimit: toFiniteNumber(data.watchlistLimit, PLAN_OFFERS[plan].watchlistLimit),
    planExpiresAt: parseTimestamp(data.planExpiresAt),
    stripeCustomerId: typeof data.stripeCustomerId === "string" ? data.stripeCustomerId : null,
    stripeSubscriptionId: typeof data.stripeSubscriptionId === "string" ? data.stripeSubscriptionId : null,
    billingInterval: data.billingInterval === "year" || data.billingInterval === "month" ? data.billingInterval : null,
  };

  if (normalized.planStatus === "canceled" && normalized.planExpiresAt && normalized.planExpiresAt <= now) {
    return downgradeToFree(normalized, now);
  }

  if (normalized.creditsResetAt <= now) {
    normalized.creditsBalance = normalized.creditsCycleAmount;
    normalized.creditsResetAt = getNextCreditResetDate(now);
  }

  return normalized;
}

function buildUserEntitlementPatch(userState, decodedToken, existingData = {}) {
  const patch = {
    email: decodedToken?.email || existingData.email || "no-email@example.com",
    displayName: decodedToken?.name || existingData.displayName || "User",
    photoURL: decodedToken?.picture || existingData.photoURL || "",
    plan: userState.plan,
    planStatus: userState.planStatus,
    creditsBalance: userState.creditsBalance,
    creditsCycleAmount: userState.creditsCycleAmount,
    creditsResetAt: admin.firestore.Timestamp.fromDate(userState.creditsResetAt),
    profileAiFreeMessagesRemaining: userState.profileAiFreeMessagesRemaining,
    watchlistLimit: userState.watchlistLimit,
    planExpiresAt: userState.planExpiresAt ? admin.firestore.Timestamp.fromDate(userState.planExpiresAt) : null,
    stripeCustomerId: userState.stripeCustomerId,
    stripeSubscriptionId: userState.stripeSubscriptionId,
    billingInterval: userState.billingInterval,
  };

  if (!existingData.createdAt) {
    patch.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }

  return patch;
}

async function syncUserState(uid, decodedToken) {
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const normalized = normalizeUserState(data);
    transaction.set(userRef, buildUserEntitlementPatch(normalized, decodedToken, data), { merge: true });
    return normalized;
  });
}

function createApiError(code, message, status = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function createWorldSimJobContext() {
  return {
    db,
    admin,
    withRetry,
    fetchJson,
    getGemini,
  };
}

function getSourceView(req, fallback = "app") {
  const header = req.headers["x-crystal-source-view"];
  if (typeof header === "string" && header.trim()) {
    return sanitizeSegment(header, fallback);
  }
  return fallback;
}

function getActionHeader(req) {
  const header = req.headers["x-crystal-metered-action"];
  return typeof header === "string" && header.trim() ? header.trim() : null;
}

function getPredictSpec(queryPlan, sourceView = "search") {
  const horizon =
    queryPlan?.filters?.horizon ||
    queryPlan?.horizons?.[0]?.horizon_id ||
    "30d";
  const confidence =
    queryPlan?.filters?.confidence_preference ||
    queryPlan?.constraints?.confidence_preference ||
    "balanced";

  if (horizon === "12m" || confidence === "rigorous") {
    return {
      action: sourceView === "dashboard" ? "dashboard_add_card_oracle" : "search_oracle",
      cost: 5,
      requiredPlan: "pro",
      engine: "oracle",
      horizon,
      confidence,
    };
  }

  if (horizon === "90d" || horizon === "6m") {
    return {
      action: sourceView === "dashboard" ? "dashboard_add_card_extended" : "search_extended",
      cost: 2,
      requiredPlan: "plus",
      engine: "extended",
      horizon,
      confidence,
    };
  }

  return {
    action: sourceView === "dashboard" ? "dashboard_add_card_standard" : "search_standard",
    cost: 1,
    requiredPlan: "free",
    engine: "standard",
    horizon,
    confidence,
  };
}

function ensureActionAllowed(userState, actionSpec) {
  if (!planAtLeast(userState.plan, actionSpec.requiredPlan)) {
    throw createApiError(
      actionSpec.requiredPlan === "pro" ? "oracle-plan-required" : "plan-upgrade-required",
      actionSpec.requiredPlan === "pro"
        ? "Questa previsione richiede Crystal Pro per attivare Oracle e TimeGPT."
        : "Questa previsione richiede Crystal Plus o superiore.",
      402,
      { requiredPlan: actionSpec.requiredPlan, action: actionSpec.action }
    );
  }

  if (userState.creditsBalance < actionSpec.cost) {
    throw createApiError(
      "credits-exhausted",
      `Crediti insufficienti per completare questa azione. Ti servono ${actionSpec.cost} crediti.`,
      402,
      { requiredCredits: actionSpec.cost, action: actionSpec.action }
    );
  }
}

async function recordFailedCreditEvent(uid, action, cost, sourceView, meta = {}) {
  const eventRef = db.collection("users").doc(uid).collection("credit_events").doc();
  await eventRef.set({
    action,
    cost,
    status: "failed",
    sourceView,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    meta,
  });
}

async function consumeCredits(uid, decodedToken, actionSpec, sourceView, meta = {}) {
  const userRef = db.collection("users").doc(uid);
  const eventRef = userRef.collection("credit_events").doc();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const normalized = normalizeUserState(data);
    ensureActionAllowed(normalized, actionSpec);
    const nextState = {
      ...normalized,
      creditsBalance: normalized.creditsBalance - actionSpec.cost,
    };

    transaction.set(userRef, buildUserEntitlementPatch(nextState, decodedToken, data), { merge: true });
    transaction.set(eventRef, {
      action: actionSpec.action,
      cost: actionSpec.cost,
      status: "succeeded",
      sourceView,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      meta,
    });
    return nextState;
  });
}

async function consumeProfileMessage(uid, decodedToken, sourceView, meta = {}) {
  const userRef = db.collection("users").doc(uid);
  const eventRef = userRef.collection("credit_events").doc();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const normalized = normalizeUserState(data);
    const nextState = { ...normalized };
    let cost = 0;

    if (nextState.profileAiFreeMessagesRemaining > 0) {
      nextState.profileAiFreeMessagesRemaining -= 1;
    } else {
      ensureActionAllowed(nextState, {
        action: "profile_ai_message",
        cost: 1,
        requiredPlan: "free",
      });
      nextState.creditsBalance -= 1;
      cost = 1;
    }

    transaction.set(userRef, buildUserEntitlementPatch(nextState, decodedToken, data), { merge: true });
    transaction.set(eventRef, {
      action: "profile_ai_message",
      cost,
      status: "succeeded",
      sourceView,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: {
        ...meta,
        freeMessage: cost === 0,
      },
    });
    return nextState;
  });
}

async function getOrCreateStripeCustomer(uid, decodedToken, existingData = {}) {
  if (existingData.stripeCustomerId) {
    return existingData.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: decodedToken?.email || existingData.email || undefined,
    name: decodedToken?.name || existingData.displayName || undefined,
    metadata: { uid },
  });

  await db.collection("users").doc(uid).set(
    {
      stripeCustomerId: customer.id,
    },
    { merge: true }
  );

  return customer.id;
}

async function findUserByStripeCustomerId(customerId) {
  const snapshot = await db.collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
  if (snapshot.empty) return null;
  return snapshot.docs[0];
}

async function applyStripeSubscriptionState(uid, subscription, options = {}) {
  const plan = isPlan(subscription?.metadata?.plan) ? subscription.metadata.plan : "free";
  const interval = subscription?.metadata?.interval === "year" ? "year" : "month";
  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
  const status = subscription?.status || "active";
  const patch = {};
  const shouldResetCredits = options.resetCredits === true;

  if (status === "active" || status === "trialing") {
    const defaults = createDefaultEntitlements(plan);
    Object.assign(patch, {
      plan,
      planStatus: subscription.cancel_at_period_end ? "canceled" : "active",
      creditsCycleAmount: PLAN_OFFERS[plan].creditsPerCycle,
      watchlistLimit: PLAN_OFFERS[plan].watchlistLimit,
      billingInterval: interval,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      planExpiresAt: periodEnd ? admin.firestore.Timestamp.fromDate(periodEnd) : null,
    });
    if (shouldResetCredits) {
      Object.assign(patch, {
        creditsBalance: defaults.creditsPerCycle,
        creditsResetAt: admin.firestore.Timestamp.fromDate(getNextCreditResetDate()),
      });
    }
  } else if (status === "past_due" || status === "unpaid") {
    Object.assign(patch, {
      plan,
      planStatus: "past_due",
      planExpiresAt: periodEnd ? admin.firestore.Timestamp.fromDate(periodEnd) : null,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      billingInterval: interval,
    });
  } else {
    const defaults = createDefaultEntitlements("free");
    Object.assign(patch, {
      ...defaults,
      creditsResetAt: admin.firestore.Timestamp.fromDate(defaults.creditsResetAt),
      planExpiresAt: null,
      stripeSubscriptionId: null,
      stripeCustomerId: subscription.customer || null,
      billingInterval: null,
    });
  }

  await db.collection("users").doc(uid).set(patch, { merge: true });
}

function normalizeCard(card, queryPlan, options = {}) {
  const nowIso = new Date().toISOString();
  const scorecard = options?.scorecard || {};
  const evidenceBundle = options?.evidenceBundle || {};
  const routingDomain = queryPlan?.primary_domain_id || queryPlan?.domain_id || queryPlan?.domain || "general";
  const domain = resolveDomainId(typeof card?.domain === "string" && card.domain ? card.domain : routingDomain);
  const domainConfig = getDomain(domain);
  const sportsCard = isSportsDomain(domain) || safeText(card?.card_type) === SPORTS_FIXTURE_CARD_TYPE;
  const scenarioSet = Array.isArray(card?.scenario_set)
    ? card.scenario_set
        .map((scenario, index) => ({
          scenario_id: safeText(scenario?.scenario_id, `scenario_${index + 1}`),
          label: safeText(scenario?.label),
          probability: clamp01(scenario?.probability, 0.33),
        }))
        .filter((scenario) => isMeaningfulText(scenario.label))
    : [];
  const normalizedScenarioSet = hasMeaningfulProbabilities(scenarioSet) ? scenarioSet : [];
  const soWhat = Array.isArray(card?.so_what)
    ? card.so_what
        .map((option, index) => ({
          option_id: safeText(option?.option_id, `option_${index + 1}`),
          label: safeText(option?.label),
          tradeoff_note: safeText(option?.tradeoff_note || option?.note),
        }))
        .filter((option) => isMeaningfulText(option.label) && Boolean(option.tradeoff_note))
    : [];
  const rawDrivers =
    Array.isArray(card?.drivers) && card.drivers.length > 0 ? card.drivers : buildDriverObjects(scorecard.key_drivers || card?.key_drivers);
  const drivers = Array.isArray(rawDrivers)
    ? rawDrivers
        .map((driver, index) => ({
          feature_key: safeText(driver?.feature_key || driver?.label, `driver_${index + 1}`),
          direction: ["up", "down", "flat"].includes(driver?.direction) ? driver.direction : "flat",
          contribution: Number.isFinite(Number(driver?.contribution)) ? Number(driver.contribution) : Number((1 - index * 0.15).toFixed(2)),
          historical_trend: Array.isArray(driver?.historical_trend)
            ? driver.historical_trend
                .filter((point) => Number.isFinite(Number(point?.year)) && Number.isFinite(Number(point?.value)))
                .map((point) => ({
                  year: Number(point.year),
                  value: Number(point.value),
                }))
            : [],
        }))
        .filter((driver) => isMeaningfulText(driver.feature_key))
    : [];
  const fixtureReads = normalizeFixtureReads(card?.fixture_reads || card?.fixtureReads);
  const normalizedRankedList = Array.isArray(card?.ranked_list)
    ? card.ranked_list
        .map((item, index) => ({
          item_id: safeText(item?.item_id, `item_${index + 1}`),
          label: safeText(item?.label),
          score: clamp01(item?.score, 0.5),
          rank: Number.isFinite(Number(item?.rank)) ? Number(item.rank) : index + 1,
          note: safeText(item?.note),
        }))
        .filter((item) => isMeaningfulText(item.label))
    : [];
  const rankedList = normalizedRankedList.length > 0 ? normalizedRankedList : sportsCard ? buildSportsRankedList(fixtureReads) : [];
  let cardState =
    card?.card_state === "published" || card?.card_state === "limited" || card?.card_state === "blocked"
      ? card.card_state
      : scorecard?.publication_state === "published" || scorecard?.publication_state === "limited" || scorecard?.publication_state === "blocked"
        ? scorecard.publication_state
        : domainConfig.current_state === "published"
          ? "published"
          : "limited";
  if (cardState === "blocked" && !evidenceBundle?.hard_stop && safeText(scorecard?.primary_call || card?.primary_call)) {
    cardState = "limited";
  }

  const counterSignals = normalizeTextList(card?.counter_signals || scorecard?.counter_signals, 4);
  const historicalAnchors = normalizeTextList(card?.historical_anchors || scorecard?.historical_anchors, 4);
  const invalidators = normalizeTextList(card?.invalidators || scorecard?.invalidators, 4);
  const whatToWatch = sanitizeList(card?.what_to_watch || card?.whatToWatch)
    .concat(invalidators)
    .filter(Boolean)
    .slice(0, 4);
  const coverageNotes = uniqueStrings(
    sanitizeList(card?.evidence_drawer?.coverage_notes).concat(
      normalizeTextList(scorecard?.publication_basis?.notes, 4),
      normalizeTextList(evidenceBundle?.notes, 4)
    )
  ).slice(0, 4);
  const howToRaiseConfidence = uniqueStrings(
    sanitizeList(card?.how_to_raise_confidence || card?.howToRaiseConfidence).concat(
      cardState !== "published" && !coverageNotes.length ? [safeText(domainConfig.status_reason)] : [],
      evidenceBundle?.historical_baseline_20y ? [] : ["Add a stronger historical baseline for the core entity or geography."],
      Array.isArray(evidenceBundle?.live_signals) && evidenceBundle.live_signals.length > 0
        ? []
        : ["Add fresher live signals before promoting this read."]
    )
  ).slice(0, 4);

  const evidenceQuality =
    evidenceBundle?.evidence_quality && typeof evidenceBundle.evidence_quality === "object"
      ? evidenceBundle.evidence_quality
      : computeEvidenceQuality(evidenceBundle, domainConfig, options?.engine || "standard");

  const evidenceDrawer =
    card?.evidence_drawer && typeof card.evidence_drawer === "object"
      ? {
          metrics_provenance: sanitizeList(card.evidence_drawer.metrics_provenance),
          freshness_summary: {
            as_of_utc: safeText(card.evidence_drawer?.freshness_summary?.as_of_utc, nowIso),
            cadence: safeText(card.evidence_drawer?.freshness_summary?.cadence, domainConfig.refresh_cadence),
            staleness_bucket: safeText(
              card.evidence_drawer?.freshness_summary?.staleness_bucket,
              evidenceQuality.freshness_score >= 0.66 ? "fresh" : evidenceQuality.freshness_score <= 0.32 ? "stale" : "unknown"
            ),
          },
          coverage_notes: coverageNotes,
          gating_reason: safeText(card.evidence_drawer.gating_reason, cardState),
        }
      : {
          ...createEvidenceDrawer(card, domainConfig, nowIso),
          metrics_provenance: uniqueStrings(
            sanitizeList(evidenceBundle?.source_ledger).concat(domainConfig.source_allowlist || [])
          ).slice(0, 6),
          freshness_summary: {
            as_of_utc: safeText(
              card?.trust_layer?.freshness?.as_of_utc ||
                evidenceBundle?.prediction_market_frame?.price_updated_at ||
                nowIso,
              nowIso
            ),
            cadence: safeText(domainConfig.refresh_cadence, "session-based"),
            staleness_bucket: evidenceQuality.freshness_score >= 0.66 ? "fresh" : evidenceQuality.freshness_score <= 0.32 ? "stale" : "unknown",
          },
          coverage_notes: coverageNotes,
          gating_reason: cardState === "blocked" ? "blocked_by_runtime" : cardState === "published" ? "published" : "limited_by_evidence",
        };

  const canonicalCardType = resolveCardTypeId(
    card?.canonical_card_type || card?.card_type,
    sportsCard ? "rank_compare" : getDomainCardTypes(domain)[0]
  );

  const confidenceScore =
    Number.isFinite(Number(card?.trust_layer?.confidence_score))
      ? clamp01(card.trust_layer.confidence_score, 0.5)
      : Number.isFinite(Number(scorecard?.confidence_score))
        ? clamp01(scorecard.confidence_score, 0.5)
        : clamp01(
            0.28 +
              evidenceQuality.coverage_score * 0.28 +
              evidenceQuality.freshness_score * 0.16 +
              evidenceQuality.agreement_score * 0.14 -
              evidenceQuality.conflict_score * 0.08,
            0.5
          );

  const titleFallback = sportsCard
    ? "Verdetto Crystal sulle partite selezionate"
    : safeText(queryPlan?.entities?.[0]?.label)
      ? `${safeText(queryPlan.entities[0].label)} forecast`
      : "Crystal Forecast";
  const summaryFallback = safeText(scorecard?.why_this_side) ||
    (cardState === "published"
      ? "Crystal found a directional read grounded in historical baseline and current signals."
      : cardState === "limited"
        ? "Crystal found a directional read, but the evidence is still partial or converging."
        : "Crystal is holding this forecast until the signal becomes strong enough to publish.");
  const verdictFallback = safeText(scorecard?.primary_call) || summaryFallback;
  const recommendedActionFallback =
    safeText(scorecard?.recommended_posture) ||
    safeText(card?.personal_output) ||
    (cardState === "published"
      ? "Act on the current read, but keep monitoring the invalidation triggers."
      : "Use this as orientation and wait for one more confirming signal before acting decisively.");
  const binaryContract =
    card?.binary_contract && typeof card.binary_contract === "object"
      ? card.binary_contract
      : scorecard?.binary_contract && typeof scorecard.binary_contract === "object"
        ? scorecard.binary_contract
        : buildBinaryContract(
            card?.binary_contract || {},
            {
              question_side_a: safeText(queryPlan?.question_side_a),
              question_side_b: safeText(queryPlan?.question_side_b),
            },
            card?.probability_split || scorecard?.probability_split || null,
            card?.primary_call || scorecard?.primary_call,
            {
              fallbackProbability:
                scorecard?.binary_contract?.winning_probability ??
                scorecard?.probability_split?.primary_probability ??
                card?.probability_split?.primary_probability ??
                confidenceScore,
              publicationState: cardState,
              confidenceScore,
              evidenceQuality,
            }
          );
  const compatibilityProbabilitySplit =
    binaryContract && typeof binaryContract === "object"
      ? buildCompatibleProbabilitySplit(binaryContract)
      : card?.probability_split && typeof card.probability_split === "object"
        ? {
            primary_label: safeText(card.probability_split.primary_label),
            primary_probability: predictionClamp01(card.probability_split.primary_probability, 0.5),
            secondary_label: safeText(card.probability_split.secondary_label),
            secondary_probability: predictionClamp01(card.probability_split.secondary_probability, 0.5),
          }
        : scorecard?.probability_split && typeof scorecard.probability_split === "object"
          ? {
              primary_label: safeText(scorecard.probability_split.primary_label),
              primary_probability: predictionClamp01(scorecard.probability_split.primary_probability, 0.5),
              secondary_label: safeText(scorecard.probability_split.secondary_label),
              secondary_probability: predictionClamp01(scorecard.probability_split.secondary_probability, 0.5),
            }
          : null;

  return {
    card_id: card?.card_id || crypto.randomUUID(),
    card_type: safeText(card?.card_type, sportsCard ? SPORTS_FIXTURE_CARD_TYPE : canonicalCardType),
    canonical_card_type: canonicalCardType,
    card_state: cardState,
    version_id: safeText(card?.version_id, `catalog_${CATALOG_VERSION_ID}_${PREDICTION_CORE_VERSION}`),
    domain,
    stakes_level: ["low", "medium", "high", "imminent"].includes(card?.stakes_level) ? card.stakes_level : "medium",
    risk_band: ["low", "medium", "high", "extreme"].includes(card?.risk_band) ? card.risk_band : "medium",
    title: safeText(card?.title, titleFallback),
    summary: safeText(card?.summary, summaryFallback),
    verdict: safeText(card?.verdict, verdictFallback),
    primary_call: safeText(binaryContract?.display_call, safeText(card?.primary_call, safeText(scorecard?.primary_call))),
    binary_contract: binaryContract || null,
    probability_split: compatibilityProbabilitySplit,
    why_this_side: safeText(card?.why_this_side, safeText(scorecard?.why_this_side)),
    personal_output: typeof card?.personal_output === "string" && card.personal_output.trim() ? card.personal_output : recommendedActionFallback,
    scenario_set: normalizedScenarioSet,
    so_what: soWhat,
    ranked_list: rankedList,
    fixture_reads: fixtureReads,
    drivers,
    counter_signals: counterSignals,
    historical_anchors: historicalAnchors,
    invalidators,
    publication_basis:
      scorecard?.publication_basis && typeof scorecard.publication_basis === "object"
        ? { ...scorecard.publication_basis }
        : {
            coverage_score: evidenceQuality.coverage_score,
            freshness_score: evidenceQuality.freshness_score,
            agreement_score: evidenceQuality.agreement_score,
            conflict_score: evidenceQuality.conflict_score,
            source_count: evidenceQuality.source_count,
            domain_state: domainConfig.current_state,
            notes: coverageNotes,
          },
    what_to_watch: whatToWatch,
    how_to_raise_confidence: howToRaiseConfidence,
    evidence_drawer: evidenceDrawer,
    trust_layer: {
      confidence_score: Number(confidenceScore.toFixed(3)),
      confidence_tier:
        ["low", "medium", "high"].includes(card?.trust_layer?.confidence_tier)
          ? card.trust_layer.confidence_tier
          : confidenceScore >= 0.72
            ? "high"
            : confidenceScore >= 0.46
              ? "medium"
              : "low",
      data_sufficiency_flag: ["insufficient", "partial", "sufficient"].includes(card?.trust_layer?.data_sufficiency_flag)
        ? card.trust_layer.data_sufficiency_flag
        : cardState === "published"
          ? "sufficient"
          : cardState === "limited"
            ? "partial"
            : "insufficient",
      freshness: {
        staleness_bucket: ["fresh", "stale", "unknown"].includes(card?.trust_layer?.freshness?.staleness_bucket)
          ? card.trust_layer.freshness.staleness_bucket
          : evidenceDrawer.freshness_summary.staleness_bucket,
        as_of_utc:
          typeof card?.trust_layer?.freshness?.as_of_utc === "string"
            ? card.trust_layer.freshness.as_of_utc
            : evidenceDrawer.freshness_summary.as_of_utc,
      },
      provenance_summary: {
        verification_level: ["unverified", "partially_verified", "verified", "official"].includes(
          card?.trust_layer?.provenance_summary?.verification_level
        )
          ? card.trust_layer.provenance_summary.verification_level
          : cardState === "published"
            ? "verified"
            : cardState === "limited"
              ? "partially_verified"
              : "unverified",
        license_summary:
          sanitizeList(card?.trust_layer?.provenance_summary?.license_summary).length > 0
            ? sanitizeList(card?.trust_layer?.provenance_summary?.license_summary)
            : evidenceDrawer.metrics_provenance,
      },
    },
    prediction_market_frame:
      card?.prediction_market_frame && typeof card.prediction_market_frame === "object"
        ? { ...card.prediction_market_frame }
        : evidenceBundle?.prediction_market_frame && typeof evidenceBundle.prediction_market_frame === "object"
          ? { ...evidenceBundle.prediction_market_frame }
          : null,
  };
}

function normalizeQuotePayload(payload) {
  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
  const today = new Date().toLocaleDateString("it-IT");
  return {
    quotes: quotes.map((quote, index) => ({
      quote_id: quote?.quote_id || `quote_${index + 1}`,
      text: quote?.text || "Il segnale non e ancora abbastanza chiaro.",
      author: quote?.author || "Crystal Intelligence",
      context: quote?.context || "General",
      date: quote?.date || today,
      analysis: {
        title: quote?.analysis?.title || "Analisi Crystal",
        full_text: quote?.analysis?.full_text || "Analisi non disponibile.",
        drivers: sanitizeList(quote?.analysis?.drivers),
        impact: quote?.analysis?.impact || "Impatto in valutazione.",
        historical_parallel: quote?.analysis?.historical_parallel || "Nessun parallelo disponibile.",
      },
    })),
  };
}

function normalizeQueryPlanPayload(payload = {}, options = {}) {
  const routingHints = options?.routingHints || {};
  const fallbackDomain = safeText(options?.fallbackDomain, GENERAL_FORECAST_DOMAIN);
  const mergedPayload = mergeQueryPlanWithRouting(payload, routingHints, { fallbackDomain });
  const domainId = safeText(mergedPayload?.primary_domain_id || mergedPayload?.domain_id || mergedPayload?.domain, fallbackDomain);
  const normalizedDomain = isSupportedDomain(domainId) ? resolveDomainId(domainId, fallbackDomain) : fallbackDomain;
  const horizons =
    Array.isArray(mergedPayload?.horizons) && mergedPayload.horizons.length > 0 ? mergedPayload.horizons : [{ horizon_id: "30d" }];
  const domainCardTypes = getDomainCardTypes(normalizedDomain);
  const defaultCardType = safeText(
    options?.defaultCardType,
    normalizedDomain === SPORTS_MATCH_OUTCOMES_DOMAIN ? SPORTS_FIXTURE_CARD_TYPE : domainCardTypes[0]
  );
  const defaultEntityType = safeText(options?.defaultEntityType, normalizedDomain === SPORTS_MATCH_OUTCOMES_DOMAIN ? "fixture" : "entity");
  const cardTypes =
    Array.isArray(mergedPayload?.card_types) && mergedPayload.card_types.length > 0
      ? mergedPayload.card_types
      : [{ card_type_id: defaultCardType }];

  return {
    plan_version: safeText(mergedPayload?.plan_version, "crystal-b2c-v1"),
    catalog_version_id: safeText(mergedPayload?.catalog_version_id, CATALOG_VERSION_ID),
    primary_domain_id: normalizedDomain,
    domain_id: normalizedDomain,
    candidate_domains: Array.isArray(mergedPayload?.candidate_domains) ? mergedPayload.candidate_domains : [],
    intent_shape: safeText(mergedPayload?.intent_shape, routingHints.intentShape || "directional_range"),
    resolution_frame: safeText(mergedPayload?.resolution_frame, routingHints.resolutionFrame || "trend"),
    confidence_mode: safeText(mergedPayload?.confidence_mode, routingHints.confidenceMode || "balanced"),
    question_side_a: safeText(mergedPayload?.question_side_a),
    question_side_b: safeText(mergedPayload?.question_side_b),
    event_date: safeText(mergedPayload?.event_date),
    governing_entity: safeText(mergedPayload?.governing_entity),
    jurisdiction: safeText(mergedPayload?.jurisdiction),
    supporting_domains: Array.isArray(mergedPayload?.supporting_domains) ? mergedPayload.supporting_domains : [],
    mode: {
      type: mergedPayload?.mode?.type === "predict_action" ? "predict_action" : "predict_only",
    },
    entity_set: Array.isArray(mergedPayload?.entity_set) ? mergedPayload.entity_set : [],
    entities: Array.isArray(mergedPayload?.entities)
      ? mergedPayload.entities.map((entity, index) => ({
          entity_id: safeText(entity?.entity_id, `entity_${index + 1}`),
          entity_type: safeText(entity?.entity_type, defaultEntityType),
          label: safeText(
            entity?.label,
            safeText(entity?.entity_id, defaultEntityType === "fixture" ? `Fixture ${index + 1}` : `Entity ${index + 1}`)
          ),
        }))
      : [],
    horizons: horizons.map((item, index) => ({
      horizon_id: safeText(item?.horizon_id, index === 0 ? "30d" : `horizon_${index + 1}`),
    })),
    card_types: cardTypes.map((item, index) => ({
      card_type_id: resolveCardTypeId(item?.card_type_id, index === 0 ? defaultCardType : domainCardTypes[0]),
    })),
    filters: mergedPayload?.filters && typeof mergedPayload.filters === "object" ? { ...mergedPayload.filters } : undefined,
    constraints: mergedPayload?.constraints && typeof mergedPayload.constraints === "object" ? { ...mergedPayload.constraints } : undefined,
  };
}

function normalizeNextletterPayload(payload = {}) {
  return {
    title: safeText(payload?.title, "Crystal Times"),
    subtitle: safeText(payload?.subtitle, "A predictive briefing shaped around your current themes."),
    sections: Array.isArray(payload?.sections)
      ? payload.sections.map((section, index) => ({
          topic: safeText(section?.topic, `Topic ${index + 1}`),
          icon: safeText(section?.icon, "sparkles"),
          title: safeText(section?.title, `Section ${index + 1}`),
          content: safeText(section?.content, "No briefing content available."),
          historical_context: safeText(section?.historical_context, "Historical context is limited for this section."),
          probability: Number.isFinite(Number(section?.probability)) ? Number(section.probability) : 50,
          horizon: safeText(section?.horizon, "30d"),
          impact: safeText(section?.impact, "Medium"),
          so_what: safeText(section?.so_what, "Keep monitoring the next signals."),
          query_suggestion: safeText(section?.query_suggestion, safeText(section?.title, `Section ${index + 1}`)),
        }))
      : [],
  };
}

function getForecastRuntimeHealth() {
  const metadata = llmRuntime.getRuntimeMetadata();
  const sportsHealth = getSportsRuntimeHealth();
  const catalogHealth = getCatalogHealthSummary();
  return {
    available: metadata.available,
    mode: metadata.mode,
    provider: metadata.provider,
    model: metadata.model,
    models: metadata.models,
    primaryConfigured: metadata.primaryConfigured,
    fallbackProvider: metadata.fallbackProvider,
    fallbackConfigured: metadata.fallbackConfigured,
    structuredOutputs: metadata.structuredOutputs,
    grounding: ["historical-cache", "google-trends", "timegpt", "polymarket"].concat(
      sportsHealth.configured ? [sportsHealth.provider] : []
    ),
    rollbackProvider: "gemini",
    registryVersionId: catalogHealth.catalogVersionId,
    coverageUnits: catalogHealth.coverageUnits,
    coverageScore: catalogHealth.coverageScore,
    depthScore: catalogHealth.depthScore,
    freshnessScore: catalogHealth.freshnessScore,
  };
}

function getGemini() {
  const apiKey = GEMINI_API_KEY.value();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY non configurata per Firebase Functions.");
  }
  return new GoogleGenAI({ apiKey });
}

async function requireUser(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    throw new Error("Authentication required.");
  }
  return admin.auth().verifyIdToken(token);
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${message}`);
  }
  return response.json();
}

async function withRetry(fn, retries = 2, delayMs = 2000) {
  try {
    return await fn();
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "";
    const message = error instanceof Error ? error.message : String(error);
    const isQuotaError =
      code === "provider-rate-limited" ||
      message.includes("429") ||
      message.includes("RESOURCE_EXHAUSTED");
    if (isQuotaError && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return withRetry(fn, retries - 1, delayMs * 2);
    }
    throw error;
  }
}

let crystalCoreRuntime = null;
let crystalCoreGoogleAuth = null;
const runtimeRolloutCache = {
  value: null,
  expiresAt: 0,
};
const RUNTIME_ROLLOUT_CACHE_TTL_MS = 30 * 1000;

function readBooleanValue(value, fallback = false) {
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

function getCrystalCoreBaseUrl() {
  return safeText(process.env.CRYSTAL_CORE_BASE_URL).replace(/\/$/, "");
}

function getCrystalCoreInvokerAudience() {
  return safeText(process.env.CRYSTAL_CORE_INVOKER_AUDIENCE, getCrystalCoreBaseUrl());
}

function getCrystalCoreProjectId() {
  return safeText(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT, "omnicrystal");
}

function getCrystalCoreRegion() {
  return safeText(process.env.CRYSTAL_CORE_REGION, "europe-west1");
}

function getCrystalCoreEvalJobName() {
  return safeText(process.env.CRYSTAL_CORE_EVAL_JOB_NAME, "crystal-core-eval");
}

function isCrystalCoreRemoteEnabled() {
  return Boolean(getCrystalCoreBaseUrl());
}

function getCrystalCoreGoogleAuth() {
  if (!crystalCoreGoogleAuth) {
    crystalCoreGoogleAuth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }
  return crystalCoreGoogleAuth;
}

function canSkipCloudRunAuth(url) {
  return /localhost|127\.0\.0\.1/i.test(safeText(url));
}

async function invokeCloudRunJson(pathname, { method = "GET", body } = {}) {
  const baseUrl = getCrystalCoreBaseUrl();
  if (!baseUrl) {
    throw createApiError("crystal-core-base-url-missing", "CRYSTAL_CORE_BASE_URL is not configured.", 503);
  }
  const url = `${baseUrl}${pathname}`;
  if (canSkipCloudRunAuth(baseUrl)) {
    return fetchJson(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  const client = await getCrystalCoreGoogleAuth().getIdTokenClient(getCrystalCoreInvokerAudience());
  const response = await client.request({
    url,
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    data: body,
  });
  return response.data;
}

async function getGoogleApiAccessToken() {
  const client = await getCrystalCoreGoogleAuth().getClient();
  const token = await client.getAccessToken();
  if (typeof token === "string" && token) return token;
  if (token?.token) return token.token;
  throw new Error("Unable to mint a Google API access token.");
}

function getCrystalCoreRuntime() {
  if (!crystalCoreRuntime) {
    crystalCoreRuntime = createCrystalCoreRuntime({
      db,
      admin,
      llmRuntime,
      withRetry,
      fetchJson,
      getGeminiApiKey: () => GEMINI_API_KEY.value(),
    });
  }
  return crystalCoreRuntime;
}

function createRunAccessToken() {
  return createQueryHash(`${Date.now()}_${Math.random()}_${crypto.randomUUID()}`).slice(0, 24);
}

function createForecastRunId(queryText, queryPlan = {}, engine = "extended") {
  return `forecast_run_${Date.now()}_${createCardCacheKey(queryText, queryPlan, engine).slice(0, 12)}`;
}

function getDefaultRuntimeRolloutConfig() {
  return {
    enabled: true,
    transport: getCrystalCoreBaseUrl() ? "remote" : "local",
    signed_in_percent: clampPercent(process.env.CRYSTAL_CORE_ROLLOUT_PERCENT, 0),
    guest_percent: clampPercent(process.env.CRYSTAL_CORE_GUEST_ROLLOUT_PERCENT, 0),
    salt: safeText(process.env.CRYSTAL_CORE_ROLLOUT_SALT, "crystal-core-default-salt"),
    kill_switch: false,
    updated_at: null,
  };
}

async function getRuntimeRolloutConfig() {
  if (runtimeRolloutCache.value && runtimeRolloutCache.expiresAt > Date.now()) {
    return runtimeRolloutCache.value;
  }

  const defaults = getDefaultRuntimeRolloutConfig();
  let next = { ...defaults };

  try {
    const snapshot = await db.collection("system_config").doc("runtime_rollout").get();
    if (snapshot.exists) {
      const payload = snapshot.data()?.crystal_core || {};
      next = {
        enabled: readBooleanValue(payload?.enabled, defaults.enabled),
        transport: safeText(payload?.transport, defaults.transport) === "local" ? "local" : "remote",
        signed_in_percent: clampPercent(payload?.signed_in_percent, defaults.signed_in_percent),
        guest_percent: clampPercent(payload?.guest_percent, defaults.guest_percent),
        salt: safeText(payload?.salt, defaults.salt),
        kill_switch: readBooleanValue(payload?.kill_switch, defaults.kill_switch),
        updated_at: serializeApiValue(payload?.updated_at || snapshot.updateTime || null),
      };
    }
  } catch (error) {
    console.warn("Unable to read crystal-core rollout config, using env defaults.", error?.message || error);
  }

  runtimeRolloutCache.value = next;
  runtimeRolloutCache.expiresAt = Date.now() + RUNTIME_ROLLOUT_CACHE_TTL_MS;
  return next;
}

function getGuestRolloutKeyFromRequest(req, queryText = "") {
  const headerValue = req?.headers?.["x-crystal-guest-key"];
  if (typeof headerValue === "string" && headerValue.trim()) {
    return sanitizeSegment(headerValue, "guest");
  }
  const fallbackSeed = [
    safeText(queryText),
    safeText(req?.headers?.["user-agent"]),
    safeText(req?.headers?.["x-forwarded-for"]),
  ].join("|");
  return createQueryHash(fallbackSeed || "guest").slice(0, 20);
}

function computeRolloutBucket(seed, salt) {
  const hash = createQueryHash(`${safeText(seed)}|${safeText(salt)}`);
  return Number.parseInt(hash.slice(0, 8), 16) % 100;
}

async function resolveCrystalCoreSelection({ req, uid = null, queryText = "" }) {
  const config = await getRuntimeRolloutConfig();
  const guestKey = uid ? null : getGuestRolloutKeyFromRequest(req, queryText);
  const bucket = computeRolloutBucket(uid || guestKey || queryText || "guest", config.salt);
  const percent = uid ? config.signed_in_percent : config.guest_percent;
  const selectedTransport =
    config.enabled && !config.kill_switch && config.transport === "remote" && isCrystalCoreRemoteEnabled() && bucket < percent
      ? "remote"
      : "local";

  return {
    selectedTransport,
    rolloutBucket: `${uid ? "signed_in" : "guest"}:${bucket}`,
    rolloutPercent: percent,
    guestKey,
    config,
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
  if (typeof value !== "object") {
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

function sanitizeForecastRunForApi(runDoc = {}) {
  return {
    run_id: safeText(runDoc?.run_id),
    status: safeText(runDoc?.status, "created"),
    visibility: safeText(runDoc?.visibility, "private"),
    current_stage: safeText(runDoc?.current_stage, "created"),
    query_text: safeText(runDoc?.query_text),
    query_plan: serializeApiValue(runDoc?.query_plan || null),
    source_view: safeText(runDoc?.source_view),
    engine: safeText(runDoc?.engine, "extended"),
    plan: safeText(runDoc?.plan, "free"),
    error_message: safeText(runDoc?.error_message),
    runtime_transport: safeText(runDoc?.runtime_transport, "local"),
    rollout_bucket: safeText(runDoc?.rollout_bucket),
    evaluation_eligible: Boolean(runDoc?.evaluation_eligible),
    resolution_status: safeText(runDoc?.resolution_status),
    created_at: serializeApiValue(runDoc?.created_at),
    started_at: serializeApiValue(runDoc?.started_at),
    updated_at: serializeApiValue(runDoc?.updated_at),
    completed_at: serializeApiValue(runDoc?.completed_at),
    result_available: Boolean(runDoc?.result_card),
    pending_poll_after_ms: Number.isFinite(Number(runDoc?.pending_poll_after_ms)) ? Number(runDoc.pending_poll_after_ms) : 2500,
    core_runtime: safeText(runDoc?.core_runtime, CRYSTAL_CORE_VERSION),
  };
}

async function createForecastRunRecord({
  runId,
  queryText,
  queryPlan,
  userContext = null,
  uid = null,
  visibility = "private",
  publicAccessToken = null,
  sourceView = "search",
  routeOrigin = "predict",
  engine = "extended",
  plan = "free",
  runtimeTransport = "local",
  rolloutBucket = null,
}) {
  const payload = {
    run_id: runId,
    status: "created",
    visibility: visibility === "public" ? "public" : "private",
    access_token: visibility === "public" ? publicAccessToken : null,
    uid,
    source_view: safeText(sourceView, "search"),
    route_origin: safeText(routeOrigin, "predict"),
    query_text: safeText(queryText),
    query_plan: sanitizeFirestoreValue(queryPlan || null),
    user_context: sanitizeFirestoreValue(userContext || null),
    engine: safeText(engine, "extended"),
    plan: safeText(plan, "free"),
    runtime_transport: safeText(runtimeTransport, "local"),
    rollout_bucket: rolloutBucket ? safeText(rolloutBucket) : null,
    pending_poll_after_ms: 2500,
    core_runtime: CRYSTAL_CORE_VERSION,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection("forecast_runs").doc(runId).set(payload, { merge: true });
  return payload;
}

async function readForecastRunResult(runId) {
  const snapshot = await db.collection("forecast_runs").doc(runId).get();
  return snapshot.exists ? snapshot.data() || null : null;
}

async function completePublishedRunCardIfNeeded(runDoc, sourceView = "search", uid = null) {
  if (!runDoc?.result_card || runDoc.result_card?.pending_run?.status === "running") {
    return runDoc?.result_card || null;
  }

  const publishedCard = await maybePublishForecastArtifacts({
    queryText: safeText(runDoc.query_text),
    queryPlan: runDoc.query_plan || {},
    card: runDoc.result_card,
    sourceView: safeText(sourceView, safeText(runDoc.source_view, "search")),
    uid,
  });

  await db.collection("forecast_runs").doc(runDoc.run_id).set(
    {
      result_card: sanitizeFirestoreValue(publishedCard),
      publicized_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return publishedCard;
}

async function startRemoteCrystalCoreRun(payload = {}) {
  return invokeCloudRunJson("/v1/runs", {
    method: "POST",
    body: payload,
  });
}

function buildPendingForecastResponse({ runId, queryText, queryPlan = {}, visibility = "private", accessToken = null }) {
  return getCrystalCoreRuntime().buildPendingRunCard({
    runId,
    queryText,
    queryPlan,
    visibility,
    accessToken,
    pollAfterMs: 2500,
  });
}

async function compileQueryThroughCrystalCore(queryText, options = {}) {
  const transport = safeText(options?.transport, "auto");
  if ((transport === "remote" || (transport === "auto" && isCrystalCoreRemoteEnabled())) && isCrystalCoreRemoteEnabled()) {
    try {
      const response = await invokeCloudRunJson("/v1/compile", {
        method: "POST",
        body: { query: queryText },
      });
      return response?.query_plan || response?.plan || response;
    } catch (error) {
      console.warn("Crystal core remote compile failed, falling back locally.", error?.message || error);
    }
  }

  try {
    return await getCrystalCoreRuntime().compileQuery(queryText);
  } catch (error) {
    console.warn("Crystal core local compile failed, falling back to legacy planner.", error?.message || error);
    return compileQuery(queryText);
  }
}

async function startCrystalEdgePrediction({
  runId,
  queryText,
  queryPlan = {},
  userContext = null,
  uid = null,
  visibility = "private",
  publicAccessToken = null,
  sourceView = "search",
  routeOrigin = "predict",
  engine = "extended",
  plan = "free",
  transport = "local",
  rolloutBucket = null,
}) {
  await createForecastRunRecord({
    runId,
    queryText,
    queryPlan,
    userContext,
    uid,
    visibility,
    publicAccessToken,
    sourceView,
    routeOrigin,
    engine,
    plan,
    runtimeTransport: transport,
    rolloutBucket,
  });

  if (transport === "remote" && isCrystalCoreRemoteEnabled()) {
    try {
      const response = await startRemoteCrystalCoreRun({
        runId,
        queryText,
        queryPlan,
        userContext,
        uid,
        visibility,
        publicAccessToken,
        sourceView,
        routeOrigin,
        engine,
        plan,
        runtimeTransport: "remote",
        rolloutBucket,
        waitMs: 8000,
      });

      if (response?.status === "completed" && response?.card) {
        return {
          runId,
          pending: false,
          card: response.card,
        };
      }

      if (response?.status === "pending") {
        return {
          runId,
          pending: true,
          card: buildPendingForecastResponse({
            runId,
            queryText,
            queryPlan,
            visibility,
            accessToken: visibility === "public" ? publicAccessToken : null,
          }),
        };
      }

      if (response?.status === "failed") {
        throw createApiError(
          "crystal-core-remote-failed",
          safeText(response?.run?.error_message, "Crystal core remote run failed."),
          502
        );
      }
    } catch (error) {
      console.warn("Crystal core remote run failed, falling back locally.", error?.message || error);
      await db.collection("forecast_runs").doc(runId).set(
        {
          runtime_transport: "local_fallback",
          transport_fallback_reason: error instanceof Error ? error.message : "remote_transport_failed",
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  const result = await getCrystalCoreRuntime().executeForecastRun({
    runId,
    queryText,
    queryPlan,
    userContext,
    uid,
    visibility,
    publicAccessToken,
    sourceView,
    routeOrigin,
    engine,
    plan,
    runtimeTransport: transport === "remote" ? "local_fallback" : "local",
    rolloutBucket,
  });

  return {
    runId,
    pending: false,
    card: result.card,
  };
}

async function getPublicForecastRun(runId, token) {
  const runDoc = await readForecastRunResult(runId);
  if (!runDoc || safeText(runDoc.visibility) !== "public") {
    throw createApiError("forecast-run-not-found", "Forecast run not found.", 404);
  }
  if (safeText(runDoc.access_token) !== safeText(token)) {
    throw createApiError("forecast-run-forbidden", "Forecast run not available.", 403);
  }
  return runDoc;
}

async function getAuthorizedForecastRun(uid, runId) {
  const runDoc = await readForecastRunResult(runId);
  if (!runDoc) {
    throw createApiError("forecast-run-not-found", "Forecast run not found.", 404);
  }
  if (safeText(runDoc.uid) !== safeText(uid)) {
    throw createApiError("forecast-run-forbidden", "You do not have access to this forecast run.", 403);
  }
  return runDoc;
}

async function getCrystalCoreHealth() {
  if (isCrystalCoreRemoteEnabled()) {
    try {
      const remoteHealth = await invokeCloudRunJson("/health");
      return {
        transport: "remote",
        base_url: getCrystalCoreBaseUrl(),
        rollout: await getRuntimeRolloutConfig(),
        ...remoteHealth,
      };
    } catch (error) {
      return {
        transport: "remote",
        base_url: getCrystalCoreBaseUrl(),
        rollout: await getRuntimeRolloutConfig(),
        available: false,
        message: error instanceof Error ? error.message : "Crystal core remote health check failed.",
      };
    }
  }

  const localHealth = await getCrystalCoreRuntime().getHealth();
  return {
    transport: "local",
    rollout: await getRuntimeRolloutConfig(),
    ...localHealth,
  };
}

async function runCrystalCoreEvalJob(mode, metadata = {}) {
  const jobName = getCrystalCoreEvalJobName();
  if (!jobName) {
    return {
      status: "skipped",
      reason: "missing_job_name",
      mode,
    };
  }

  const projectId = getCrystalCoreProjectId();
  const region = getCrystalCoreRegion();
  const accessToken = await getGoogleApiAccessToken();
  const url = `https://run.googleapis.com/v2/projects/${projectId}/locations/${region}/jobs/${jobName}:run`;
  const response = await fetchJson(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      overrides: {
        containerOverrides: [
          {
            env: [
              { name: "CRYSTAL_CORE_EVAL_MODE", value: mode },
              { name: "CRYSTAL_CORE_EVAL_TRIGGER", value: safeText(metadata.trigger, "scheduler") },
            ],
          },
        ],
      },
    }),
  });

  return {
    status: "started",
    mode,
    operation: response?.name || null,
  };
}

async function fetchCachedCard(queryText, queryPlan, domain, city, engine = "standard") {
  const safeDomain = sanitizeSegment(domain, "general");
  const safeCity = sanitizeSegment(city, "global");
  const queryHash = createCardCacheKey(queryText, queryPlan, engine);
  const docRef = db.doc(`cached_cards/${safeDomain}/${safeCity}/${queryHash}`);
  const snapshot = await docRef.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  const ttl = data?.ttl?.toDate ? data.ttl.toDate() : null;
  if (!ttl || ttl <= new Date()) return null;
  return data.card_data || null;
}

async function saveCachedCard(card, queryText, queryPlan, domain, city, engine = "standard") {
  const safeDomain = sanitizeSegment(domain, "general");
  const safeCity = sanitizeSegment(city, "global");
  const queryHash = createCardCacheKey(queryText, queryPlan, engine);
  const ttl = new Date();
  ttl.setHours(ttl.getHours() + 24);
  await db.doc(`cached_cards/${safeDomain}/${safeCity}/${queryHash}`).set(
    {
      card_id: card.card_id,
      domain,
      city,
      query: queryText,
      query_hash: queryHash,
      engine,
      card_data: sanitizeFirestoreValue(card),
      generated_at: admin.firestore.FieldValue.serverTimestamp(),
      ttl: admin.firestore.Timestamp.fromDate(ttl),
    },
    { merge: true }
  );
}

async function get20YearHistoricalContext(domain, locationFocus, analyticalFocus = "") {
  const focusSegment = safeText(locationFocus || analyticalFocus, "global");
  const docId = sanitizeSegment(`${domain}_${focusSegment}`, "global");
  const docRef = db.collection("historical_20y_summaries").doc(docId);
  const snapshot = await docRef.get();
  if (snapshot.exists) {
    return snapshot.data()?.summary || "";
  }

  const prompt = `Genera un riassunto storico fattuale e analitico degli ultimi 20 anni per il dominio "${domain}"${
    locationFocus ? ` con focus specifico su ${locationFocus}` : " a livello globale"
  }.
${analyticalFocus ? `La domanda corrente riguarda: "${analyticalFocus}". Usa questo focus per scegliere analoghi e trigger storici rilevanti.` : ""}
Includi:
1. Principali cicli di mercato o trend.
2. Cambiamenti strutturali e normativi.
3. Eventi cigno nero o shock esogeni.
4. Benchmark storici rilevanti.
5. Se utile, analoghi diretti rispetto alla domanda corrente.
Sii conciso, usa elenchi puntati, massimo 250 parole.`;

  const summary = await llmRuntime.generateText({
    modelKind: "copy",
    systemInstruction:
      "Sei un research analyst di Crystal. Rispondi in italiano con un riassunto storico fattuale, conciso e leggibile.",
    prompt,
  });
  await docRef.set({
    domain,
    location_focus: locationFocus || "global",
    summary,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  return summary;
}

async function fetchHistoricalDataForTimeGPT(domain, city) {
  if (domain === "markets_and_assets" || domain === "crypto" || domain.includes("crypto")) {
    const klines = await fetchJson("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=90");
    const series = {};
    for (const item of klines) {
      series[new Date(item[0]).toISOString().split("T")[0]] = Number(item[4]);
    }
    return series;
  }

  if (domain === "weather" || domain === "climate_impact" || domain.includes("climate")) {
    let lat = 41.9028;
    let lon = 12.4964;
    if (city) {
      const geocode = await fetchJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
      );
      if (Array.isArray(geocode?.results) && geocode.results.length > 0) {
        lat = geocode.results[0].latitude;
        lon = geocode.results[0].longitude;
      }
    }
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 2);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 90);
    const weather = await fetchJson(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${
        startDate.toISOString().split("T")[0]
      }&end_date=${endDate.toISOString().split("T")[0]}&daily=temperature_2m_mean`
    );
    const series = {};
    const times = weather?.daily?.time || [];
    const values = weather?.daily?.temperature_2m_mean || [];
    times.forEach((time, index) => {
      if (values[index] !== null && values[index] !== undefined) {
        series[time] = Number(values[index]);
      }
    });
    return series;
  }

  const keyword = city ? `${domain.replace(/_/g, " ")} ${city}` : domain.replace(/_/g, " ");
  const trendRaw = await googleTrends.interestOverTime({
    keyword,
    startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
  });
  const trend = JSON.parse(trendRaw);
  const series = {};
  for (const item of trend?.default?.timelineData || []) {
    series[new Date(Number(item.time) * 1000).toISOString().split("T")[0]] = Number(item.value?.[0] || 0);
  }
  return series;
}

async function fetchTimeGptForecast(domain, city, fh) {
  if (isSportsDomain(domain)) return null;
  const nixtlaKey = NIXTLA_API_KEY.value();
  if (!nixtlaKey) return null;
  try {
    const historical = await fetchHistoricalDataForTimeGPT(domain, city);
    if (Object.keys(historical).length < 2) return null;
    const response = await fetchJson("https://api.nixtla.io/forecast", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nixtlaKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "timegpt-1",
        y: historical,
        fh,
        level: [80, 90],
      }),
    });
    return response?.value ? response : null;
  } catch (error) {
    console.error("TimeGPT unavailable:", error);
    return null;
  }
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

function buildTrendKeyword(queryText, queryPlan = {}, domainConfig = {}) {
  const primaryEntity = getPrimaryEntityLabel(queryPlan);
  const location = getPrimaryLocationFromPlan(queryPlan);
  if (primaryEntity && location && primaryEntity.toLowerCase() !== location.toLowerCase()) {
    return `${primaryEntity} ${location}`;
  }
  if (primaryEntity) return primaryEntity;
  if (location) return `${domainConfig.short_label || "forecast"} ${location}`;
  return queryText
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
    const lean = delta > 4 ? "up" : delta < -4 ? "down" : "flat";

    return {
      source_id: "google_trends",
      label: "Search momentum",
      summary: `${keyword} shows ${lean === "up" ? "rising" : lean === "down" ? "cooling" : "stable"} attention over the last 90 days.`,
      lean,
      freshness_score: 0.76,
    };
  } catch (error) {
    console.error("Trend signal unavailable:", error);
    return null;
  }
}

function summarizeTimeGptSignal(forecast, horizonId = "30d") {
  if (!forecast?.value || !Array.isArray(forecast.value) || forecast.value.length < 2) return null;
  const first = Number(forecast.value[0]);
  const last = Number(forecast.value[forecast.value.length - 1]);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  const delta = last - first;
  const lean = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const pct = first !== 0 ? ((delta / Math.abs(first)) * 100).toFixed(1) : "0.0";
  return {
    source_id: "timegpt",
    label: "TimeGPT directional projection",
    summary: `TimeGPT projects a ${lean === "up" ? "higher" : lean === "down" ? "lower" : "flat"} path over ${horizonId} (${pct}% change across the projected window).`,
    lean,
    freshness_score: 0.72,
  };
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

function buildEvidenceSignalsText(evidenceBundle = {}) {
  const signals = Array.isArray(evidenceBundle.live_signals) ? evidenceBundle.live_signals : [];
  if (!signals.length) {
    return "LIVE SIGNALS\n- No fresh structured live signals were available for this run.";
  }

  return `LIVE SIGNALS\n${signals
    .map((signal) => `- ${signal.label}: ${signal.summary}`)
    .join("\n")}`;
}

async function buildEvidenceBundle({ queryText, queryPlan, domainConfig, engine }) {
  const locationFocus = getPrimaryLocationFromPlan(queryPlan) || getPrimaryEntityLabel(queryPlan) || "global";
  const supportingDomains = Array.isArray(queryPlan?.supporting_domains) ? queryPlan.supporting_domains.slice(0, 3) : [];
  const mainBaseline = await get20YearHistoricalContext(domainConfig.domain_id, locationFocus, queryText);
  const supportingBaselines = [];

  for (const supportingDomainId of supportingDomains) {
    const supportingDomain = getDomain(supportingDomainId, supportingDomainId);
    const summary = await get20YearHistoricalContext(supportingDomain.domain_id, locationFocus, queryText);
    if (summary) {
      supportingBaselines.push({
        label: `${supportingDomain.short_label} baseline`,
        summary,
      });
    }
  }

  const liveSignals = [];
  const trendSignal = await fetchTrendSignal(queryText, queryPlan, domainConfig);
  if (trendSignal) {
    liveSignals.push(trendSignal);
  }

  let predictionMarketFrame = null;
  if (queryPlan?.intent_shape === "binary_outcome" || safeText(queryPlan?.question_side_a) || safeText(queryPlan?.question_side_b)) {
    try {
      predictionMarketFrame = await getPolymarketPulse({
        db,
        admin,
        fetchJson,
        queryText,
        queryPlan,
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
        });
      }
    } catch (error) {
      console.error("Polymarket signal unavailable:", error);
    }
  }

  if (!isSportsDomain(domainConfig.domain_id) && engine !== "standard") {
    const horizonId = queryPlan?.horizons?.[0]?.horizon_id || "30d";
    let fh = 30;
    if (horizonId === "7d") fh = 7;
    else if (horizonId === "90d") fh = 90;
    else if (horizonId === "6m") fh = 180;
    else if (horizonId === "12m") fh = 365;
    const timeGptForecast = await fetchTimeGptForecast(domainConfig.domain_id, locationFocus, fh);
    const timeGptSignal = summarizeTimeGptSignal(timeGptForecast, horizonId);
    if (timeGptSignal) {
      liveSignals.push(timeGptSignal);
    }
  }

  const sourceLedger = uniqueStrings(
    (domainConfig.source_allowlist || [])
      .concat(supportingDomains.flatMap((supportingDomainId) => getDomain(supportingDomainId, supportingDomainId).source_allowlist || []))
      .concat(liveSignals.map((signal) => signal.source_id))
  );

  const evidenceBundle = {
    historical_baseline_20y: buildHistoricalBundle(mainBaseline, supportingBaselines),
    live_signals: liveSignals,
    source_ledger: sourceLedger,
    entity_resolution: {
      resolved: Array.isArray(queryPlan?.entities) && queryPlan.entities.length > 0,
      entities: Array.isArray(queryPlan?.entities) ? queryPlan.entities.map((entity) => entity.label).filter(Boolean) : [],
    },
    event_resolution: {
      resolved: Boolean(safeText(queryPlan?.question_side_a) || safeText(queryPlan?.event_date) || safeText(queryPlan?.jurisdiction)),
      event_date: safeText(queryPlan?.event_date),
      governing_entity: safeText(queryPlan?.governing_entity),
      jurisdiction: safeText(queryPlan?.jurisdiction),
    },
    supporting_domains: supportingDomains,
    prediction_market_frame: predictionMarketFrame,
    notes: uniqueStrings([
      domainConfig.current_state === "blocked"
        ? `${domainConfig.short_label} is still registry-blocked, so Crystal is publishing a cautious directional read instead of a full trust publish.`
        : "",
      !mainBaseline ? "The 20-year baseline was thin for this specific entity or geography." : "",
      liveSignals.length < 2 ? "Live evidence is present but still light for this run." : "",
    ]).slice(0, 4),
  };

  evidenceBundle.evidence_quality = computeEvidenceQuality(evidenceBundle, domainConfig, engine);
  return evidenceBundle;
}

function buildEvidenceSynthesisPrompt({ queryText, queryPlan, domainConfig, evidenceBundle, contextString }) {
  return `You are Crystal's evidence synthesizer. Return JSON only.

Query: "${queryText}"
Primary domain: ${domainConfig.domain_id} | ${domainConfig.title}
Query plan: ${JSON.stringify(queryPlan)}
${contextString}

${evidenceBundle.historical_baseline_20y ? `HISTORICAL BASELINE 20Y\n${evidenceBundle.historical_baseline_20y}` : "HISTORICAL BASELINE 20Y\n- Baseline unavailable."}

${buildEvidenceSignalsText(evidenceBundle)}

SOURCE LEDGER
- ${evidenceBundle.source_ledger.join("\n- ")}

Return a JSON object with:
- directional_hypothesis
- why_this_side
- key_drivers[]
- counter_signals[]
- invalidators[]
- historical_anchors[]
- recommended_posture
- evidence_notes[]

Rules:
1. Use only the evidence provided.
2. If the query is binary, still choose a directional hypothesis when the evidence gives orientation.
3. Keep each array at 2-4 items.
4. Do not write vague filler like "scenario in evoluzione" or "non si puo prevedere" unless there is truly no directional read.`;
}

function buildForecastScorecardPrompt({ queryText, queryPlan, domainConfig, evidenceBundle, evidenceSynthesis }) {
  return `You are Crystal's scorecard model. Return JSON only.

Query: "${queryText}"
Primary domain: ${domainConfig.domain_id} | ${domainConfig.title}
Query plan: ${JSON.stringify(queryPlan)}
Evidence quality: ${JSON.stringify(evidenceBundle.evidence_quality)}
Evidence synthesis: ${JSON.stringify(evidenceSynthesis)}

Return a JSON object with:
- primary_call
- probability_split { primary_label, primary_probability, secondary_label, secondary_probability }
- key_drivers[]
- counter_signals[]
- invalidators[]
- historical_anchors[]
- why_this_side
- recommended_posture

Rules:
1. Prefer a directional call when the evidence has orientation.
2. If the query is binary and question_side_a/question_side_b exist, use those labels.
3. Avoid 50/50 unless the evidence is genuinely unresolved.
4. Keep the call crisp, decisive, and grounded.`;
}

function buildForecastVerbalizationPrompt({ queryText, queryPlan, domainConfig, evidenceBundle, scorecard }) {
  return `You are Crystal's editorial prediction writer. Return JSON only.

Query: "${queryText}"
Primary domain: ${domainConfig.domain_id} | ${domainConfig.title}
Query plan: ${JSON.stringify(queryPlan)}
Scorecard: ${JSON.stringify(scorecard)}
Evidence quality: ${JSON.stringify(evidenceBundle.evidence_quality)}

Return a JSON object with:
- title
- summary
- verdict
- recommended_action
- scenario_set[]
- what_to_watch[]
- how_to_raise_confidence[]
- coverage_notes[]

Rules:
1. The verdict must clearly state the call, not just the uncertainty.
2. If publication_state is limited, keep the call but say that evidence is still converging.
3. Summary max 2 sentences.
4. scenario_set max 3 items with label and probability.
5. what_to_watch must focus on invalidators and countersignals.`;
}

function buildDraftCard({ queryText, queryPlan, domainConfig, voicePayload, scorecard, evidenceBundle }) {
  const binaryContract = scorecard?.binary_contract || null;
  const probabilitySplit = scorecard?.probability_split || null;
  const scenarioSet = Array.isArray(voicePayload?.scenario_set) && voicePayload.scenario_set.length > 0
    ? voicePayload.scenario_set.slice(0, 3)
    : probabilitySplit
      ? [
          {
            scenario_id: "scenario_primary",
            label: probabilitySplit.primary_label,
            probability: probabilitySplit.primary_probability,
          },
          {
            scenario_id: "scenario_secondary",
            label: probabilitySplit.secondary_label,
            probability: probabilitySplit.secondary_probability,
          },
        ]
      : [];

  const notes = uniqueStrings(
    normalizeTextList(voicePayload?.coverage_notes, 4).concat(normalizeTextList(scorecard?.publication_basis?.notes, 4))
  );

  return {
    card_id: crypto.randomUUID(),
    card_type: getDomainCardTypes(domainConfig.domain_id)[0] || "forecast_band",
    canonical_card_type: getDomainCardTypes(domainConfig.domain_id)[0] || "forecast_band",
    card_state: scorecard?.publication_state || "limited",
    version_id: `catalog_${CATALOG_VERSION_ID}_${PREDICTION_CORE_VERSION}`,
    domain: domainConfig.domain_id,
    stakes_level:
      domainConfig.domain_id.includes("safety") || domainConfig.domain_id.includes("geopolitics") || domainConfig.domain_id.includes("governance")
        ? "high"
        : "medium",
    risk_band: scorecard?.publication_state === "published" ? "medium" : "high",
    title: safeText(voicePayload?.title, safeText(queryText, "Crystal Forecast")),
    summary: safeText(voicePayload?.summary, safeText(scorecard?.why_this_side)),
    verdict: safeText(voicePayload?.verdict, safeText(binaryContract?.display_call, safeText(scorecard?.primary_call))),
    primary_call: safeText(binaryContract?.display_call, safeText(scorecard?.primary_call)),
    binary_contract: binaryContract,
    probability_split: probabilitySplit,
    why_this_side: safeText(scorecard?.why_this_side),
    personal_output: safeText(voicePayload?.recommended_action, safeText(scorecard?.recommended_posture)),
    scenario_set: scenarioSet,
    so_what: [],
    drivers: buildDriverObjects(scorecard?.key_drivers || []),
    counter_signals: normalizeTextList(scorecard?.counter_signals, 4),
    historical_anchors: normalizeTextList(scorecard?.historical_anchors, 4),
    invalidators: normalizeTextList(scorecard?.invalidators, 4),
    what_to_watch: normalizeTextList(voicePayload?.what_to_watch, 4),
    how_to_raise_confidence: normalizeTextList(voicePayload?.how_to_raise_confidence, 4),
    evidence_drawer: {
      metrics_provenance: uniqueStrings(evidenceBundle.source_ledger || []).slice(0, 6),
      freshness_summary: {
        as_of_utc: safeText(evidenceBundle?.prediction_market_frame?.price_updated_at, new Date().toISOString()),
        cadence: safeText(domainConfig.refresh_cadence, "session-based"),
        staleness_bucket: evidenceBundle?.evidence_quality?.freshness_score >= 0.66 ? "fresh" : "unknown",
      },
      coverage_notes: notes,
      gating_reason: scorecard?.publication_state === "published" ? "published" : "limited_by_evidence",
    },
    trust_layer: {
      confidence_score: predictionClamp01(scorecard?.confidence_score, 0.5),
      confidence_tier: scorecard?.confidence_score >= 0.72 ? "high" : scorecard?.confidence_score >= 0.46 ? "medium" : "low",
      data_sufficiency_flag: scorecard?.publication_state === "published" ? "sufficient" : "partial",
      freshness: {
        staleness_bucket: evidenceBundle?.evidence_quality?.freshness_score >= 0.66 ? "fresh" : "unknown",
        as_of_utc: safeText(evidenceBundle?.prediction_market_frame?.price_updated_at, new Date().toISOString()),
      },
      provenance_summary: {
        verification_level: scorecard?.publication_state === "published" ? "verified" : "partially_verified",
        license_summary: uniqueStrings(evidenceBundle.source_ledger || []).slice(0, 6),
      },
    },
    publication_basis: scorecard?.publication_basis || null,
    prediction_market_frame: evidenceBundle?.prediction_market_frame || null,
  };
}

function buildGenericQueryPlanPrompt(queryText, routingHints = {}) {
  const candidateLines = (routingHints?.candidateDomains || [])
    .slice(0, 6)
    .map((candidate, index) => {
      const domain = getDomain(candidate.domain_id, GENERAL_FORECAST_DOMAIN);
      return `${index + 1}. ${domain.domain_id} | ${domain.short_label} | score=${candidate.score} | ${domain.summary}`;
    })
    .join("\n");
  return `Convert the following user query into a Crystal B2C QueryPlan JSON object.

Query: "${queryText}"

Extract the intent, domain, entities, horizons, and required card types based on the Crystal B2C Blueprint.

Routing hints from the system:
- primary_domain_id candidate: ${routingHints.primaryDomainId || GENERAL_FORECAST_DOMAIN}
- intent_shape: ${routingHints.intentShape || "directional_range"}
- resolution_frame: ${routingHints.resolutionFrame || "trend"}
- question_side_a: ${routingHints?.binaryFrame?.question_side_a || ""}
- question_side_b: ${routingHints?.binaryFrame?.question_side_b || ""}
- supporting_domains: ${Array.isArray(routingHints?.supportingDomains) ? routingHints.supportingDomains.join(", ") : ""}

Top candidate domains:
${candidateLines || "- none"}

CRITICAL:
- The domain_id MUST be chosen from the following list of supported domains:
${SUPPORTED_DOMAINS.join(", ")}
- Do NOT fall back to ${GENERAL_FORECAST_DOMAIN} unless the query is genuinely meta, mixed, or impossible to ground to a concrete domain.
- For politics, referendum, regulation, housing, startup, safety, and personal decision queries, prefer the closest concrete domain.
- For binary questions, explicitly frame question_side_a and question_side_b.
- If a B-domain is the right public surface, keep it and add supporting_domains from the underlying A-layer where useful.

Return an object with:
- plan_version
- primary_domain_id
- domain_id
- candidate_domains[]
- intent_shape
- resolution_frame
- confidence_mode
- mode.type ("predict_only" or "predict_action")
- entity_set[]
- entities[]
- horizons[]
- card_types[]
- question_side_a
- question_side_b
- event_date
- governing_entity
- jurisdiction
- supporting_domains[]`;
}

function buildSportsQueryPlanPrompt(queryText) {
  return `Convert the following sports question into a Crystal B2C QueryPlan JSON object.

Query: "${queryText}"

Rules:
- domain_id must be exactly "${SPORTS_MATCH_OUTCOMES_DOMAIN}".
- card_types must include "${SPORTS_FIXTURE_CARD_TYPE}".
- Each match must be its own entity with entity_type "fixture".
- Each fixture label must use the format "Home Team vs Away Team".
- If the user lists a matchday date, reflect it in the horizon with "7d" when the matches are close, otherwise "30d".
- mode.type must be "predict_only".

Return JSON only with:
- plan_version
- domain_id
- mode.type
- entities[]
- horizons[]
- card_types[]`;
}

function buildGenericForecastPayload({ queryText, queryPlan, contextString, historicalContext, timeGptContext }) {
  return {
    systemInstruction: `Sei il motore predittivo di Crystal B2C.
Restituisci solo JSON valido.
Non inventare dati o fonti.
Usa il contesto fornito dal sistema come grounding primario.
Se il contesto e parziale, abbassa la confidence e dichiaralo nel trust layer.
Scrivi campi testuali chiari, sintetici e leggibili.`,
    prompt: `Sei il motore predittivo di Crystal B2C.
L'utente ha chiesto: "${queryText}"
Il Query Plan generato dal sistema e: ${JSON.stringify(queryPlan)}
${contextString}
${historicalContext}
${timeGptContext}

Il tuo compito e generare un oggetto JSON CrystalCard finale.

REGOLE FONDAMENTALI:
1. Non inventare dati. Se i dati non bastano, segnalalo nel trust layer.
2. Usa il contesto storico solo per calibrare pattern, mai per sovrascrivere i fatti di oggi.
3. Se sono presenti dati quantitativi, usali per calibrare scenario_set e trust_layer.
4. Fornisci un verdetto diretto e azioni pratiche.
5. Mantieni il testo leggibile e ben formattato.
6. Evita placeholder come Scenario 1, Elemento 1, driver_1 o ranking finti.
7. Usa il contratto Crystal A.99: prediction chiara, so what, what_to_watch, how_to_raise_confidence, trust, evidence.

Restituisci un oggetto con almeno questi campi:
- card_id
- card_type
- canonical_card_type
- card_state
- version_id
- domain
- stakes_level
- risk_band
- title
- summary
- verdict
- personal_output
- scenario_set
- so_what
- what_to_watch
- how_to_raise_confidence
- ranked_list
- drivers
- evidence_drawer
- trust_layer
- prediction_market_frame`,
  };
}

function buildSportsForecastPayload({ queryText, queryPlan, contextString, sportsContext }) {
  return {
    systemInstruction: `Sei Crystal, un motore predittivo editoriale per previsioni sportive.
Restituisci solo JSON valido.
Non inventare dati, quote, assenze o risultati dell'andata.
Se il contesto sports e debole, riduci il numero di partite consigliate e abbassa la confidence.
Scrivi in italiano, con tono netto e leggibile.
Non usare placeholder come "Scenario 1", "Elemento 1", "driver_1" o percentuali tutte uguali.
Non trasformare la risposta in tips di bankroll o copy da tipster.`,
    prompt: `L'utente ha chiesto: "${queryText}"
Il Query Plan e: ${JSON.stringify(queryPlan)}
${contextString}
${sportsContext.contextText || "SPORTS DATA\nNo structured sports data is available. Stay conservative."}

Genera una CrystalCard sports con queste regole:
1. card_type deve essere "${SPORTS_FIXTURE_CARD_TYPE}".
2. domain deve essere "${SPORTS_MATCH_OUTCOMES_DOMAIN}".
3. verdict: 2-4 frasi con il quadro generale e i segnali più forti.
4. summary: una sintesi asciutta, senza marketing copy.
5. ranked_list: massimo 5 fixture ordinate per convinzione, con note concrete.
6. fixture_reads: una riga per ogni partita, con label, primary_call, confidence, rationale, evidence[] e caution se serve.
7. drivers: 3-5 driver reali e sportivi, niente etichette generiche.
8. trust_layer: esplicita se il dato e parziale o incompleto.
9. prediction_market_frame deve restare nullo se non hai un mercato esterno chiaro.
10. Non includere narrativa geopolitica o WorldSim nel verdetto principale.
11. Aggiungi what_to_watch, evidence_drawer, card_state e version_id.

Restituisci almeno:
- card_id
- card_type
- canonical_card_type
- card_state
- version_id
- domain
- stakes_level
- risk_band
- title
- summary
- verdict
- ranked_list
- fixture_reads
- drivers
- what_to_watch
- evidence_drawer
- trust_layer`,
  };
}

async function compileQuery(queryText) {
  if (looksLikeSportsMatchQuery(queryText)) {
    const payload = await withRetry(() =>
      llmRuntime.generateJson({
        modelKind: "query",
        temperature: 0,
        systemInstruction:
          "You convert a sports question into a Crystal B2C QueryPlan JSON object. Return JSON only. Use the sports domain and one fixture entity per match.",
        prompt: buildSportsQueryPlanPrompt(queryText),
      })
    );

    return normalizeQueryPlanPayload(payload, {
      fallbackDomain: SPORTS_MATCH_OUTCOMES_DOMAIN,
      defaultCardType: SPORTS_FIXTURE_CARD_TYPE,
      defaultEntityType: "fixture",
    });
  }

  const routingHints = buildRoutingHints(queryText);
  const payload = await withRetry(() =>
    llmRuntime.generateJson({
      modelKind: "query",
      temperature: 0,
      systemInstruction:
        "You convert a user question into a Crystal B2C QueryPlan JSON object. Return JSON only. Choose a concrete blueprint domain whenever possible, avoid the generic router unless absolutely necessary, and preserve binary framing when the question is yes/no-like.",
      prompt: buildGenericQueryPlanPrompt(queryText, routingHints),
    })
  );

  return normalizeQueryPlanPayload(payload, {
    fallbackDomain: routingHints.primaryDomainId || GENERAL_FORECAST_DOMAIN,
    routingHints,
  });
}

async function predict(queryText, queryPlan, userContext, options = {}) {
  const domain = resolveDomainId(queryPlan?.primary_domain_id || queryPlan?.domain || queryPlan?.domain_id || "");
  const domainConfig = getDomain(domain);
  const sportsForecast = isSportsDomain(domain);
  const city =
    queryPlan?.filters?.location ||
    queryPlan?.entities?.find((entity) => entity.entity_type === "city" || entity.entity_type === "location")?.label ||
    "";
  const engine = options.engine || "standard";
  const action = options.action || "search_standard";
  const cost = Number.isFinite(Number(options.cost)) ? Number(options.cost) : 1;
  const plan = isPlan(options.plan) ? options.plan : "free";

  if (!safeText(queryText)) {
    return {
      ...buildCoverageGapCard(queryText, queryPlan, domainConfig),
      _source: "invalid-query",
      _billing: {
        action,
        cost,
        engine,
        plan,
      },
    };
  }

  if (domain) {
    const cached = await fetchCachedCard(queryText, queryPlan, domain, city, engine);
    if (cached) {
      const normalizedCachedCard = normalizeCard(cached, queryPlan);
      return {
        ...normalizedCachedCard,
        _source: "cache",
        _billing: {
          action,
          cost,
          engine,
          plan,
        },
      };
    }
  }

  let contextString = "";
  if (userContext) {
    contextString = `
CONTESTO UTENTE:
- Posizione: ${userContext.location || "Non specificata"}
- Professione: ${userContext.profession || "Non specificata"}
- Interessi: ${Array.isArray(userContext.interests) ? userContext.interests.join(", ") : "Non specificati"}
`;
  }

  let sportsContext = {
    available: false,
    configured: false,
    contextText: "",
    notes: [],
  };
  if (sportsForecast) {
    sportsContext = await buildSportsForecastContext({
      queryText,
      queryPlan,
      fetchJson,
    });
  }

  let baseCard;
  if (sportsForecast) {
    const forecastRequest = buildSportsForecastPayload({
      queryText,
      queryPlan,
      contextString,
      sportsContext,
    });

    const payload = await withRetry(() =>
      llmRuntime.generateJson({
        modelKind: "forecast",
        temperature: 0.2,
        systemInstruction: forecastRequest.systemInstruction,
        prompt: forecastRequest.prompt,
      })
    );

    baseCard = normalizeCard(payload, queryPlan);
  } else {
    const evidenceBundle = await buildEvidenceBundle({
      queryText,
      queryPlan,
      domainConfig,
      engine,
    });

    const evidenceSynthesis = await withRetry(() =>
      llmRuntime.generateJson({
        modelKind: "forecast",
        temperature: 0.1,
        systemInstruction:
          "You synthesize evidence for Crystal. Return JSON only. Stay grounded in the supplied evidence and preserve a directional thesis when the evidence allows one.",
        prompt: buildEvidenceSynthesisPrompt({
          queryText,
          queryPlan,
          domainConfig,
          evidenceBundle,
          contextString,
        }),
      })
    );

    const rawScorecard = await withRetry(() =>
      llmRuntime.generateJson({
        modelKind: "forecast",
        temperature: 0,
        systemInstruction:
          "You create Crystal's forecast scorecard. Return JSON only. Use binary labels when present and avoid hedging filler.",
        prompt: buildForecastScorecardPrompt({
          queryText,
          queryPlan,
          domainConfig,
          evidenceBundle,
          evidenceSynthesis,
        }),
      })
    );

    const finalizedScorecard = finalizeScorecard(rawScorecard, evidenceBundle, queryPlan, domainConfig, {
      engine,
    });

    const voicePayload = await withRetry(() =>
      llmRuntime.generateJson({
        modelKind: "forecast",
        temperature: 0.15,
        systemInstruction:
          "You write Crystal prediction cards. Return JSON only. State the call first, then the nuance, and never hide the thesis behind generic uncertainty boilerplate.",
        prompt: buildForecastVerbalizationPrompt({
          queryText,
          queryPlan,
          domainConfig,
          evidenceBundle,
          scorecard: finalizedScorecard,
        }),
      })
    );

    const draftCard = buildDraftCard({
      queryText,
      queryPlan,
      domainConfig,
      voicePayload,
      scorecard: finalizedScorecard,
      evidenceBundle,
    });

    baseCard = normalizeCard(draftCard, queryPlan, {
      scorecard: finalizedScorecard,
      evidenceBundle,
      engine,
    });
  }

  if (domain) {
    await saveCachedCard(baseCard, queryText, queryPlan, domain, city, engine);
  }

  const card =
    sportsForecast || baseCard?.prediction_market_frame
      ? baseCard
      : await attachPolymarketToCard({
          db,
          admin,
          fetchJson,
          queryText,
          queryPlan,
          card: baseCard,
        });

  return {
    ...card,
    _source: "live-server",
    _billing: {
      action,
      cost,
      engine,
      plan,
    },
  };
}

async function chatWithProfileBot(messages) {
  return withRetry(() =>
    llmRuntime.generateText({
      modelKind: "chat",
      temperature: 0.4,
      messages: Array.isArray(messages)
        ? messages.map((message) => ({
            role: message?.role === "user" ? "user" : "assistant",
            content: message?.content || "",
          }))
        : [],
      systemInstruction: `Sei un assistente AI di Crystal.
Il tuo obiettivo e raccogliere con naturalezza tre informazioni:
1. Posizione geografica
2. Professione o settore
3. Interessi o asset

Fai una domanda alla volta. Quando hai tutto, restituisci anche un riepilogo JSON in un blocco markdown.`,
    })
  );
}

async function generateNextletter(interests, userContext, options = {}) {
  const topics = Array.isArray(interests) ? interests.filter(Boolean) : [];
  let contextString = "";
  if (userContext) {
    contextString = `
User Context:
- Location: ${userContext.location || "Unknown"}
- Profession: ${userContext.profession || "Unknown"}
- General Interests: ${Array.isArray(userContext.interests) ? userContext.interests.join(", ") : "Unknown"}
`;
  }

  const prompt = `
Sei "The Crystal Times", il quotidiano d'inchiesta predittiva piu autorevole del 2045.
Scrivi una Nextletter per un utente del presente.

REGOLE:
1. Usa il contesto disponibile del sistema e resta conservativo se la copertura e parziale.
2. Cita un parallelo storico.
3. Chiudi ogni sezione con un'azione concreta.

ARGOMENTI: ${topics.join(", ")}
CONTESTO: ${contextString}

OUTPUT JSON:
{
  "title": "string",
  "subtitle": "string",
  "sections": [
    {
      "topic": "string",
      "icon": "string",
      "title": "string",
      "content": "string",
      "historical_context": "string",
      "probability": 85,
      "horizon": "15d",
      "impact": "High",
      "so_what": "string",
      "query_suggestion": "string"
    }
  ]
}`;

  const baseLetter = normalizeNextletterPayload(
    await withRetry(() =>
      llmRuntime.generateJson({
        modelKind: "copy",
        temperature: 0.3,
        systemInstruction:
          'Sei "The Crystal Times", un briefing layer predittivo. Restituisci solo JSON valido e mantieni il tono chiaro, concreto e leggibile.',
        prompt,
      })
    )
  );
  return attachPolymarketToNextletter({
    db,
    admin,
    fetchJson,
    letter: baseLetter,
  });
}

async function generateCrystalQuotes() {
  const today = new Date().toLocaleDateString("it-IT");
  const cacheKey = `quotes_${today.replace(/\//g, "-")}`;
  const cacheRef = db.collection("system_cache").doc(cacheKey);
  const snapshot = await cacheRef.get();
  if (snapshot.exists) {
    return snapshot.data();
  }

  const prompt = `
Genera 5 Crystal Quotes per la settimana corrente.
Basati sul contesto disponibile del sistema e resta conservativo se la copertura e parziale.

OUTPUT JSON:
{
  "quotes": [
    {
      "quote_id": "string",
      "text": "string",
      "author": "string",
      "context": "string",
      "date": "${today}",
      "analysis": {
        "title": "string",
        "full_text": "string",
        "drivers": ["string"],
        "impact": "string",
        "historical_parallel": "string"
      }
    }
  ]
}`;

  const payload = normalizeQuotePayload(
    await withRetry(() =>
      llmRuntime.generateJson({
        modelKind: "copy",
        temperature: 0.35,
        systemInstruction:
          "You generate Crystal Quotes in valid JSON only. Keep them sharp, plausible, and anchored to current signal patterns without inventing certainty.",
        prompt,
      })
    )
  );
  await cacheRef.set(
    {
      ...payload,
      generated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return payload;
}

async function getLocalInsights(queryText, entities) {
  const locationEntity = Array.isArray(entities)
    ? entities.find((entity) => ["city", "location", "country"].includes(entity?.entity_type))
    : null;
  const locationContext = locationEntity ? `nella zona di ${locationEntity.label}` : "";

  const text = await withRetry(() =>
    llmRuntime.generateText({
      modelKind: "chat",
      temperature: 0.35,
      systemInstruction:
        "Sei un assistente locale di Crystal. Rispondi in italiano con un breve approfondimento locale, prudente e concreto, senza inventare dettagli.",
      prompt: `Fornisci un breve approfondimento locale relativo a questa query: "${queryText}" ${locationContext}. Menziona luoghi o attivita solo se sono coerenti con il contesto disponibile. Massimo 3-4 frasi.`,
    })
  );

  return {
    text,
    chunks: [],
  };
}

exports.api = onRequest(
  {
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "1GiB",
    secrets: [GEMINI_API_KEY, NIXTLA_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.status(204).send("");
      return;
    }

    const route = stripApiPrefix(req.path || "/");
    const body = getBody(req);

    try {
      if (req.method === "POST" && route === "/billing/stripe-webhook") {
        if (isBillingTestMode()) {
          respondJson(res, 200, {
            received: false,
            disabled: true,
            message: "Billing is temporarily unavailable during the current test rollout.",
          });
          return;
        }

        const stripe = getStripe();
        const signature = req.headers["stripe-signature"];
        const webhookSecret = STRIPE_WEBHOOK_SECRET.value();
        if (!signature || !webhookSecret || !req.rawBody) {
          throw createApiError("stripe-webhook-invalid", "Webhook Stripe non verificabile.", 400);
        }

        const event = stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);

        if (event.type === "checkout.session.completed") {
          const session = event.data.object;
          if (session.mode === "subscription" && session.subscription && session.metadata?.uid) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            await applyStripeSubscriptionState(session.metadata.uid, subscription, { resetCredits: true });
          }
        }

        if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
          const subscription = event.data.object;
          const uid = subscription.metadata?.uid;
          let targetUid = uid;
          if (!targetUid && subscription.customer) {
            const userDoc = await findUserByStripeCustomerId(subscription.customer);
            targetUid = userDoc?.id;
          }
          if (targetUid) {
            await applyStripeSubscriptionState(targetUid, subscription, { resetCredits: event.type === "customer.subscription.created" });
          }
        }

        if (event.type === "invoice.payment_succeeded") {
          const invoice = event.data.object;
          if (invoice.subscription) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            const uid = subscription.metadata?.uid;
            let targetUid = uid;
            if (!targetUid && subscription.customer) {
              const userDoc = await findUserByStripeCustomerId(subscription.customer);
              targetUid = userDoc?.id;
            }
            if (targetUid) {
              await applyStripeSubscriptionState(targetUid, subscription, { resetCredits: true });
            }
          }
        }

        if (event.type === "customer.subscription.deleted") {
          const subscription = event.data.object;
          const uid = subscription.metadata?.uid;
          let targetUid = uid;
          if (!targetUid && subscription.customer) {
            const userDoc = await findUserByStripeCustomerId(subscription.customer);
            targetUid = userDoc?.id;
          }
          if (targetUid) {
            await applyStripeSubscriptionState(targetUid, subscription, { resetCredits: false });
          }
        }

        respondJson(res, 200, { received: true });
        return;
      }

        if (req.method === "GET" && route === "/health") {
          const forecastHealth = getForecastRuntimeHealth();
          const crystalCoreHealth = await getCrystalCoreHealth();
          const worldSimHealth = await getWorldSimRuntimeHealth({ fetchJson });
          const sportsHealth = getSportsRuntimeHealth();
          const coverageSnapshot = getCoverageSnapshot();
          const sourceHealth = getSourceHealthSummary();
          respondJson(res, 200, {
            ok: true,
            timestamp: new Date().toISOString(),
            forecast: forecastHealth,
            crystalCore: crystalCoreHealth,
            worldSim: worldSimHealth,
            sports: sportsHealth,
            polymarket: getPolymarketRuntimeHealth(),
            billing: getBillingRuntimeHealth(),
            registry: {
              catalogVersionId: coverageSnapshot.catalog_version_id,
              policyProfile: coverageSnapshot.policy_profile,
              domains: coverageSnapshot.totals.domains,
            },
            sources: sourceHealth,
            coverage: coverageSnapshot,
            quality: {
              deterministicRouting: true,
              coverageGapCards: true,
              placeholderGuardrails: true,
              clientFallbackPrimary: false,
            },
          });
          return;
        }

      if (req.method === "GET" && route === "/registry/catalog") {
        respondJson(res, 200, getCatalogRegistryPayload());
        return;
      }

      if (req.method === "GET" && route === "/registry/sources") {
        respondJson(res, 200, getSourceRegistryPayload());
        return;
      }

      if (req.method === "GET" && route === "/coverage/ledger") {
        respondJson(res, 200, {
          catalog_version_id: CATALOG_VERSION_ID,
          coverage_units: buildCoverageLedger(),
        });
        return;
      }

      if (req.method === "GET" && route === "/coverage/snapshot") {
        respondJson(res, 200, getCoverageSnapshot());
        return;
      }

      if (req.method === "GET" && route === "/quotes") {
        const quotes = await generateCrystalQuotes();
        respondJson(res, 200, quotes);
        return;
      }

      if (req.method === "POST" && route === "/public/compile-query") {
        const runtimeSelection = await resolveCrystalCoreSelection({
          req,
          uid: null,
          queryText: body.query || "",
        });
        const plan = await compileQueryThroughCrystalCore(body.query || "", {
          transport: runtimeSelection.selectedTransport,
        });
        respondJson(res, 200, plan);
        return;
      }

      if (req.method === "GET" && /^\/public\/forecast-runs\/[^/]+$/.test(route)) {
        const runId = decodeURIComponent(route.split("/")[3] || "");
        const token = typeof req.query?.token === "string" ? req.query.token : "";
        const runDoc = await getPublicForecastRun(runId, token);
        const card =
          runDoc.status === "completed" && runDoc.result_card
            ? await completePublishedRunCardIfNeeded(runDoc, safeText(runDoc.source_view, "forecast-gallery-guest"), null)
            : null;
        respondJson(res, 200, {
          run: sanitizeForecastRunForApi(runDoc),
          card: card ? serializeApiValue(card) : null,
        });
        return;
      }

      if (req.method === "POST" && route === "/public/predict") {
        const actionSpec = getPredictSpec(body.queryPlan || {}, "search");
        if (actionSpec.requiredPlan !== "free" || actionSpec.engine !== "standard") {
          throw createApiError(
            "guest-plan-required",
            "Guest mode currently supports one standard forecast. Sign in for longer horizons or rigorous mode.",
            403
          );
        }

        const queryText = body.query || "";
        const queryPlan = body.queryPlan || {};
        const runtimeSelection = await resolveCrystalCoreSelection({
          req,
          uid: null,
          queryText,
        });
        const runId = createForecastRunId(queryText, queryPlan, actionSpec.engine);
        const publicAccessToken = createRunAccessToken();

        try {
          const edgeResult = await startCrystalEdgePrediction({
            runId,
            queryText,
            queryPlan,
            userContext: null,
            uid: null,
            visibility: "public",
            publicAccessToken,
            sourceView: "forecast-gallery-guest",
            routeOrigin: "public/predict",
            engine: actionSpec.engine,
            plan: "free",
            transport: runtimeSelection.selectedTransport,
            rolloutBucket: runtimeSelection.rolloutBucket,
          });

          if (edgeResult.pending) {
            respondJson(res, 200, edgeResult.card);
            return;
          }

          const runDoc =
            (await readForecastRunResult(runId)) || {
              run_id: runId,
              query_text: queryText,
              query_plan: queryPlan,
              result_card: edgeResult.card,
              source_view: "forecast-gallery-guest",
              status: "completed",
            };
          const publishedCard = await completePublishedRunCardIfNeeded(runDoc, "forecast-gallery-guest", null);
          respondJson(res, 200, publishedCard);
          return;
        } catch (edgeError) {
          console.warn("Crystal edge guest run failed, falling back to legacy predict.", edgeError?.message || edgeError);
          const card = await predict(body.query || "", body.queryPlan || {}, null, {
            engine: "standard",
            action: "search_standard",
            cost: 0,
            plan: "free",
          });
          const publishedCard = await maybePublishForecastArtifacts({
            queryText: body.query || "",
            queryPlan: body.queryPlan || {},
            card,
            sourceView: "forecast-gallery-guest",
          });
          respondJson(res, 200, publishedCard);
          return;
        }
      }

      const decodedUser = await requireUser(req);
      const sourceView = getSourceView(
        req,
        route === "/predict"
          ? "search"
          : route === "/nextletter"
            ? "nextletter"
            : route.startsWith("/worldsim/")
              ? "worldsim"
              : route === "/profile-chat"
                ? "profile"
                : "app"
      );
      const userState = await syncUserState(decodedUser.uid, decodedUser);

      if (req.method === "GET" && /^\/forecast-runs\/[^/]+$/.test(route)) {
        const runId = decodeURIComponent(route.split("/")[2] || "");
        const runDoc = await getAuthorizedForecastRun(decodedUser.uid, runId);
        const card =
          runDoc.status === "completed" && runDoc.result_card
            ? await completePublishedRunCardIfNeeded(runDoc, safeText(runDoc.source_view, sourceView), decodedUser.uid)
            : null;
        respondJson(res, 200, {
          run: sanitizeForecastRunForApi(runDoc),
          card: card ? serializeApiValue(card) : null,
        });
        return;
      }

      if (req.method === "POST" && /^\/forecast-runs\/[^/]+\/cancel$/.test(route)) {
        const runId = decodeURIComponent(route.split("/")[2] || "");
        await getAuthorizedForecastRun(decodedUser.uid, runId);
        await db.collection("forecast_runs").doc(runId).set(
          {
            status: "canceled",
            current_stage: "canceled",
            completed_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        respondJson(res, 200, {
          ok: true,
          run_id: runId,
        });
        return;
      }

      if (req.method === "POST" && route === "/worldsim/jobs") {
        const created = await createManualWorldSimJob(createWorldSimJobContext(), {
          uid: decodedUser.uid,
          plan: userState.plan,
          source: typeof body.source === "string" ? body.source : "manual",
          sourceRef: typeof body.sourceRef === "string" ? body.sourceRef : "manual",
          queryText: body.query || "",
          queryPlan: body.queryPlan || {},
          userContext: body.userContext || null,
          sourcePayload: body.sourcePayload || null,
        });
        respondJson(res, 200, created);
        return;
      }

      if (req.method === "POST" && route === "/worldsim/interventions") {
        const created = await createMatrixSimulationJob(createWorldSimJobContext(), {
          uid: decodedUser.uid,
          plan: userState.plan,
          source: typeof body.source === "string" ? body.source : "matrix-simulation",
          sourceRef: typeof body.sourceRef === "string" ? body.sourceRef : "worldsim-chamber",
          queryText:
            typeof body.baselineQuery === "string"
              ? body.baselineQuery
              : typeof body.query === "string"
                ? body.query
                : "",
          queryPlan: body.queryPlan || {},
          userContext: body.userContext || null,
          interventionPayload: body.intervention || {},
          branchParentId: typeof body.branchParentId === "string" ? body.branchParentId : null,
        });
        respondJson(res, 200, created);
        return;
      }

      if (req.method === "GET" && /^\/worldsim\/jobs\/[^/]+$/.test(route)) {
        const jobId = decodeURIComponent(route.split("/")[3] || "");
        const detail = await getWorldSimJobDetail(createWorldSimJobContext(), decodedUser.uid, jobId);
        respondJson(res, 200, detail);
        return;
      }

      if (req.method === "GET" && /^\/worldsim\/jobs\/[^/]+\/result$/.test(route)) {
        const jobId = decodeURIComponent(route.split("/")[3] || "");
        const result = await getWorldSimJobResult(createWorldSimJobContext(), decodedUser.uid, jobId);
        respondJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && /^\/worldsim\/jobs\/[^/]+\/cancel$/.test(route)) {
        const jobId = decodeURIComponent(route.split("/")[3] || "");
        const detail = await cancelWorldSimJob(createWorldSimJobContext(), decodedUser.uid, jobId);
        respondJson(res, 200, detail);
        return;
      }

      if (req.method === "GET" && /^\/worldsim\/interventions\/[^/]+$/.test(route)) {
        const jobId = decodeURIComponent(route.split("/")[3] || "");
        const detail = await getMatrixSimulationJobDetail(createWorldSimJobContext(), decodedUser.uid, jobId);
        respondJson(res, 200, detail);
        return;
      }

      if (req.method === "GET" && /^\/worldsim\/interventions\/[^/]+\/result$/.test(route)) {
        const jobId = decodeURIComponent(route.split("/")[3] || "");
        const result = await getMatrixSimulationJobResult(createWorldSimJobContext(), decodedUser.uid, jobId);
        respondJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && /^\/worldsim\/interventions\/[^/]+\/cancel$/.test(route)) {
        const jobId = decodeURIComponent(route.split("/")[3] || "");
        const detail = await cancelMatrixSimulationJob(createWorldSimJobContext(), decodedUser.uid, jobId);
        respondJson(res, 200, detail);
        return;
      }

      if (req.method === "POST" && route === "/polymarket/pulse") {
        const pulse = await getPolymarketPulse({
          db,
          admin,
          fetchJson,
          queryText: typeof body.query === "string" ? body.query : typeof body.queryText === "string" ? body.queryText : "",
          queryPlan: body.queryPlan || {},
        });
        respondJson(res, 200, pulse);
        return;
      }

      if (req.method === "POST" && route === "/billing/create-checkout-session") {
        if (isBillingTestMode()) {
          throw createBillingDisabledError();
        }

        const plan = isPlan(body.plan) && body.plan !== "free" ? body.plan : null;
        const interval = body.interval === "year" ? "year" : "month";
        if (!plan) {
          throw createApiError("invalid-plan", "Piano non valido per il checkout.", 400);
        }

        const stripe = getStripe();
        const customerId = await getOrCreateStripeCustomer(decodedUser.uid, decodedUser, userState);
        const returnUrl =
          typeof body.returnUrl === "string" && body.returnUrl.startsWith("http")
            ? body.returnUrl
            : req.headers.origin || "https://omnicrystal.web.app";

        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: customerId,
          success_url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}billing=success`,
          cancel_url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}billing=cancelled`,
          metadata: {
            uid: decodedUser.uid,
            plan,
            interval,
          },
          line_items: [
            {
              price_data: {
                currency: "eur",
                unit_amount: STRIPE_PRICING[plan][interval],
                recurring: { interval },
                product_data: {
                  name: `Crystal ${plan === "plus" ? "Plus" : "Pro"}`,
                  metadata: {
                    plan,
                    interval,
                  },
                },
              },
              quantity: 1,
            },
          ],
          subscription_data: {
            metadata: {
              uid: decodedUser.uid,
              plan,
              interval,
            },
          },
          allow_promotion_codes: true,
        });

        respondJson(res, 200, { url: session.url });
        return;
      }

      if (req.method === "POST" && route === "/compile-query") {
        const runtimeSelection = await resolveCrystalCoreSelection({
          req,
          uid: decodedUser.uid,
          queryText: body.query || "",
        });
        const plan = await compileQueryThroughCrystalCore(body.query || "", {
          transport: runtimeSelection.selectedTransport,
        });
        respondJson(res, 200, plan);
        return;
      }

      if (req.method === "POST" && route === "/predict") {
        const actionSpec = getPredictSpec(body.queryPlan || {}, sourceView === "dashboard" ? "dashboard" : "search");
        ensureActionAllowed(userState, actionSpec);
        const queryText = body.query || "";
        const queryPlan = body.queryPlan || {};
        const userContext = body.userContext || null;
        const runtimeSelection = await resolveCrystalCoreSelection({
          req,
          uid: decodedUser.uid,
          queryText,
        });
        const runId = createForecastRunId(queryText, queryPlan, actionSpec.engine);

        try {
          const edgeResult = await startCrystalEdgePrediction({
            runId,
            queryText,
            queryPlan,
            userContext,
            uid: decodedUser.uid,
            visibility: "private",
            publicAccessToken: null,
            sourceView,
            routeOrigin: "predict",
            engine: actionSpec.engine,
            plan: userState.plan,
            transport: runtimeSelection.selectedTransport,
            rolloutBucket: runtimeSelection.rolloutBucket,
          });

          await consumeCredits(decodedUser.uid, decodedUser, actionSpec, sourceView, {
            route: "predict",
            engine: actionSpec.engine,
            horizon: actionSpec.horizon,
            confidence: actionSpec.confidence,
            transport: edgeResult.pending ? "edge_pending" : "edge_completed",
          });

          if (edgeResult.pending) {
            respondJson(res, 200, edgeResult.card);
            return;
          }

          const runDoc =
            (await readForecastRunResult(runId)) || {
              run_id: runId,
              query_text: queryText,
              query_plan: queryPlan,
              result_card: edgeResult.card,
              source_view: sourceView,
              status: "completed",
            };
          const publishedCard = await completePublishedRunCardIfNeeded(runDoc, sourceView, decodedUser.uid);
          respondJson(res, 200, publishedCard);
          return;
        } catch (edgeError) {
          console.warn("Crystal edge authenticated run failed, falling back to legacy predict.", edgeError?.message || edgeError);
        }

        try {
          const baseCard = await predict(queryText, queryPlan, userContext, {
            engine: actionSpec.engine,
            action: actionSpec.action,
            cost: actionSpec.cost,
            plan: userState.plan,
          });
          await consumeCredits(decodedUser.uid, decodedUser, actionSpec, sourceView, {
            route: "predict",
            engine: actionSpec.engine,
            horizon: actionSpec.horizon,
            confidence: actionSpec.confidence,
            transport: "legacy",
          });
          const { card } = await maybeCreatePredictionWorldSimJob(createWorldSimJobContext(), {
            uid: decodedUser.uid,
            queryText,
            queryPlan,
            userContext,
            plan: userState.plan,
            engine: actionSpec.engine,
            sourceRef: sourceView,
            card: baseCard,
          });
          const publishedCard = await maybePublishForecastArtifacts({
            queryText,
            queryPlan,
            card,
            sourceView,
            uid: decodedUser.uid,
          });
          respondJson(res, 200, publishedCard);
          return;
        } catch (error) {
          await recordFailedCreditEvent(decodedUser.uid, actionSpec.action, actionSpec.cost, sourceView, {
            route: "predict",
            message: error instanceof Error ? error.message : "Unexpected predict failure.",
          });
          throw error;
        }
      }

      if (req.method === "POST" && route === "/profile-chat") {
        try {
          const text = await chatWithProfileBot(body.messages || []);
          await consumeProfileMessage(decodedUser.uid, decodedUser, sourceView, {
            route: "profile-chat",
            messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
          });
          respondJson(res, 200, { text });
          return;
        } catch (error) {
          await recordFailedCreditEvent(
            decodedUser.uid,
            "profile_ai_message",
            userState.profileAiFreeMessagesRemaining > 0 ? 0 : 1,
            sourceView,
            {
              route: "profile-chat",
              message: error instanceof Error ? error.message : "Unexpected profile chat failure.",
            }
          );
          throw error;
        }
      }

      if (req.method === "POST" && route === "/nextletter") {
        const actionSpec = {
          action: "nextletter_personal",
          cost: 3,
          requiredPlan: "free",
        };
        ensureActionAllowed(userState, actionSpec);
        try {
          const baseLetter = await generateNextletter(body.interests || [], body.userContext || null, {
            plan: userState.plan,
          });
          await consumeCredits(decodedUser.uid, decodedUser, actionSpec, sourceView, {
            route: "nextletter",
            topicCount: Array.isArray(body.interests) ? body.interests.length : 0,
          });
          const letter = await maybeCreateNextletterWorldSimJobs(createWorldSimJobContext(), {
            uid: decodedUser.uid,
            interests: body.interests || [],
            userContext: body.userContext || null,
            plan: userState.plan,
            letter: baseLetter,
          });
          respondJson(res, 200, letter);
          return;
        } catch (error) {
          await recordFailedCreditEvent(decodedUser.uid, actionSpec.action, actionSpec.cost, sourceView, {
            route: "nextletter",
            message: error instanceof Error ? error.message : "Unexpected nextletter failure.",
          });
          throw error;
        }
      }

      if (req.method === "POST" && route === "/local-insights") {
        const insights = await getLocalInsights(body.query || "", body.entities || []);
        respondJson(res, 200, insights);
        return;
      }

      respondJson(res, 404, { error: `Unknown route: ${route}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      const status =
        error?.status ||
        (message === "Authentication required." ? 401 : 500);
      console.error("API error:", error);
      respondJson(res, status, {
        error: message,
        code: error?.code || (message === "Authentication required." ? "auth-required" : "server-error"),
        details: error?.details || null,
      });
    }
  }
);

exports.crystalCoreResolutionSweep = onSchedule(
  {
    schedule: "10 * * * *",
    timeZone: "Europe/Rome",
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async () => {
    const result = await runCrystalCoreEvalJob("resolution", { trigger: "scheduler_hourly" });
    console.log("crystalCoreResolutionSweep", result);
  }
);

exports.crystalCoreEvaluationSweep = onSchedule(
  {
    schedule: "15 3 * * *",
    timeZone: "Europe/Rome",
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async () => {
    const result = await runCrystalCoreEvalJob("evaluation", { trigger: "scheduler_nightly" });
    console.log("crystalCoreEvaluationSweep", result);
  }
);

exports.crystalCoreReportGeneration = onSchedule(
  {
    schedule: "30 6 * * *",
    timeZone: "Europe/Rome",
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async () => {
    const result = await runCrystalCoreEvalJob("report", { trigger: "scheduler_daily" });
    console.log("crystalCoreReportGeneration", result);
  }
);
