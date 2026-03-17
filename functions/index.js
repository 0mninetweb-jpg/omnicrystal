const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { GoogleGenAI, Type } = require("@google/genai");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const googleTrends = require("google-trends-api");
const Stripe = require("stripe");
const {
  getWorldSimDigest,
  enhanceCardWithWorldSim,
  enhanceNextletterWithWorldSim,
} = require("./worldSim");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const NIXTLA_API_KEY = defineSecret("NIXTLA_API_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

const SUPPORTED_DOMAINS = [
  "A.1.macro.gdp_growth",
  "A.1.macro.interest_rates",
  "A.1.macro.unemployment_rate",
  "A.2.markets.equity_indices",
  "A.2.markets.crypto_volatility",
  "A.2.markets.commodity_prices",
  "A.3.real_estate.residential_prices",
  "A.3.real_estate.commercial_rents",
  "A.3.real_estate.mortgage_rates",
  "A.4.climate.extreme_weather_risk",
  "A.4.climate.temperature_anomalies",
  "A.4.climate.precipitation_forecast",
  "A.5.energy.gas_prices",
  "A.5.energy.electricity_costs",
  "A.5.energy.renewable_transition",
  "A.6.tech.ai_adoption_rate",
  "A.6.tech.cybersecurity_threats",
  "A.6.tech.semiconductor_supply",
  "A.7.city_pulse.micro_area_change",
  "A.7.city_pulse.gentrification_index",
  "A.7.city_pulse.crime_rate_trends",
  "A.8.health.pandemic_risk",
  "A.8.health.healthcare_capacity",
  "A.8.health.drug_shortages",
  "A.9.travel.disruption_risk",
  "A.9.travel.tourism_intensity",
  "A.9.travel.flight_cancellations",
  "A.10.consumer.retail_spending",
  "A.10.consumer.ecommerce_growth",
  "A.10.consumer.consumer_confidence",
  "A.11.geopolitics.trade_tensions",
  "A.11.geopolitics.supply_chain_disruption",
  "A.11.geopolitics.election_volatility",
  "A.12.cost_of_living.inflation_pressure",
  "A.12.cost_of_living.grocery_basket_cost",
  "A.12.cost_of_living.housing_affordability",
];

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

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

function getStripe() {
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

function createQueryHash(queryText) {
  return crypto.createHash("sha256").update(queryText.trim().toLowerCase()).digest("hex");
}

function createCardCacheKey(queryText, queryPlan = {}, engine = "standard") {
  return createQueryHash(
    JSON.stringify({
      queryText: queryText.trim().toLowerCase(),
      engine,
      domain: queryPlan?.domain || queryPlan?.domain_id || "",
      horizons: Array.isArray(queryPlan?.horizons) ? queryPlan.horizons.map((item) => item?.horizon_id || "") : [],
      filters: queryPlan?.filters || {},
      constraints: queryPlan?.constraints || {},
      entities: Array.isArray(queryPlan?.entities)
        ? queryPlan.entities.map((entity) => `${entity?.entity_type || "entity"}:${entity?.label || entity?.entity_id || ""}`)
        : [],
    })
  );
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

function normalizeCard(card, queryPlan) {
  const nowIso = new Date().toISOString();
  const domain = typeof card?.domain === "string" && card.domain ? card.domain : queryPlan?.domain_id || "general";
  const scenarioSet = Array.isArray(card?.scenario_set)
    ? card.scenario_set.map((scenario, index) => ({
        scenario_id: scenario?.scenario_id || `scenario_${index + 1}`,
        label: scenario?.label || `Scenario ${index + 1}`,
        probability: clamp01(scenario?.probability, 0.33),
      }))
    : [];
  const soWhat = Array.isArray(card?.so_what)
    ? card.so_what.map((option, index) => ({
        option_id: option?.option_id || `option_${index + 1}`,
        label: option?.label || `Azione ${index + 1}`,
        tradeoff_note: option?.tradeoff_note || "Valuta pro e contro in base al tuo contesto.",
      }))
    : [];
  const drivers = Array.isArray(card?.drivers)
    ? card.drivers.map((driver, index) => ({
        feature_key: driver?.feature_key || `driver_${index + 1}`,
        direction: ["up", "down", "flat"].includes(driver?.direction) ? driver.direction : "flat",
        contribution: Number.isFinite(Number(driver?.contribution)) ? Number(driver.contribution) : 0.33,
        historical_trend: Array.isArray(driver?.historical_trend)
          ? driver.historical_trend
              .filter((point) => Number.isFinite(Number(point?.year)) && Number.isFinite(Number(point?.value)))
              .map((point) => ({
                year: Number(point.year),
                value: Number(point.value),
              }))
          : undefined,
      }))
    : [];

  return {
    card_id: card?.card_id || crypto.randomUUID(),
    card_type: card?.card_type || "prediction_summary",
    domain,
    stakes_level: ["low", "medium", "high", "imminent"].includes(card?.stakes_level) ? card.stakes_level : "medium",
    risk_band: ["low", "medium", "high", "extreme"].includes(card?.risk_band) ? card.risk_band : "medium",
    title: card?.title || "Crystal Forecast",
    summary: card?.summary || "Crystal ha generato una previsione basata sui segnali disponibili.",
    verdict: card?.verdict || card?.summary || "Scenario in evoluzione.",
    personal_output: typeof card?.personal_output === "string" ? card.personal_output : "",
    scenario_set: scenarioSet,
    so_what: soWhat,
    ranked_list: Array.isArray(card?.ranked_list)
      ? card.ranked_list.map((item, index) => ({
          item_id: item?.item_id || `item_${index + 1}`,
          label: item?.label || `Elemento ${index + 1}`,
          score: clamp01(item?.score, 0.5),
          rank: Number.isFinite(Number(item?.rank)) ? Number(item.rank) : index + 1,
          note: typeof item?.note === "string" ? item.note : "",
        }))
      : [],
    drivers,
    trust_layer: {
      confidence_score: clamp01(card?.trust_layer?.confidence_score, 0.62),
      confidence_tier: ["low", "medium", "high"].includes(card?.trust_layer?.confidence_tier)
        ? card.trust_layer.confidence_tier
        : "medium",
      data_sufficiency_flag: ["insufficient", "partial", "sufficient"].includes(card?.trust_layer?.data_sufficiency_flag)
        ? card.trust_layer.data_sufficiency_flag
        : "partial",
      freshness: {
        staleness_bucket: ["fresh", "stale", "unknown"].includes(card?.trust_layer?.freshness?.staleness_bucket)
          ? card.trust_layer.freshness.staleness_bucket
          : "fresh",
        as_of_utc: typeof card?.trust_layer?.freshness?.as_of_utc === "string" ? card.trust_layer.freshness.as_of_utc : nowIso,
      },
      provenance_summary: {
        verification_level: ["unverified", "partially_verified", "verified", "official"].includes(
          card?.trust_layer?.provenance_summary?.verification_level
        )
          ? card.trust_layer.provenance_summary.verification_level
          : "partially_verified",
        license_summary: sanitizeList(card?.trust_layer?.provenance_summary?.license_summary),
      },
    },
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
    const message = error instanceof Error ? error.message : String(error);
    const isQuotaError = message.includes("429") || message.includes("RESOURCE_EXHAUSTED");
    if (isQuotaError && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return withRetry(fn, retries - 1, delayMs * 2);
    }
    throw error;
  }
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
      card_data: card,
      generated_at: admin.firestore.FieldValue.serverTimestamp(),
      ttl: admin.firestore.Timestamp.fromDate(ttl),
    },
    { merge: true }
  );
}

async function get20YearHistoricalContext(domain, city, ai) {
  const docId = sanitizeSegment(`${domain}_${city || "global"}`, "global");
  const docRef = db.collection("historical_20y_summaries").doc(docId);
  const snapshot = await docRef.get();
  if (snapshot.exists) {
    return snapshot.data()?.summary || "";
  }

  const prompt = `Genera un riassunto storico fattuale e analitico degli ultimi 20 anni per il dominio "${domain}"${
    city ? ` con focus specifico sull'area di ${city}` : " a livello globale"
  }.
Includi:
1. Principali cicli di mercato o trend.
2. Cambiamenti strutturali e normativi.
3. Eventi cigno nero o shock esogeni.
4. Benchmark storici rilevanti.
Sii conciso, usa elenchi puntati, massimo 250 parole.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
  });

  const summary = response.text || "Nessun dato storico disponibile.";
  await docRef.set({
    domain,
    city: city || "global",
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

async function compileQuery(queryText) {
  const ai = getGemini();
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Convert the following user query into a Crystal B2C QueryPlan JSON object.

Query: "${queryText}"

Extract the intent, domain, entities, horizons, and required card types based on the Crystal B2C Blueprint.

CRITICAL: The domain_id MUST be chosen from the following list of supported domains:
${SUPPORTED_DOMAINS.join(", ")}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            plan_version: { type: Type.STRING },
            domain_id: { type: Type.STRING },
            mode: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ["predict_only", "predict_action"] },
              },
            },
            entities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  entity_id: { type: Type.STRING },
                  entity_type: { type: Type.STRING },
                  label: { type: Type.STRING },
                },
              },
            },
            horizons: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  horizon_id: { type: Type.STRING },
                },
              },
            },
            card_types: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  card_type_id: {
                    type: Type.STRING,
                    enum: [
                      "prediction_summary",
                      "scenario_set",
                      "ranked_list",
                      "tradeoff_plan",
                      "drivers_breakdown",
                      "risk_band",
                    ],
                  },
                },
              },
            },
          },
          required: ["plan_version", "domain_id", "mode", "entities", "horizons", "card_types"],
        },
      },
    });
    return JSON.parse(response.text || "{}");
  });
}

async function predict(queryText, queryPlan, userContext, options = {}) {
  const domain = queryPlan?.domain || queryPlan?.domain_id || "";
  const city =
    queryPlan?.filters?.location ||
    queryPlan?.entities?.find((entity) => entity.entity_type === "city" || entity.entity_type === "location")?.label ||
    "";
  const engine = options.engine || "standard";
  const action = options.action || "search_standard";
  const cost = Number.isFinite(Number(options.cost)) ? Number(options.cost) : 1;
  const plan = isPlan(options.plan) ? options.plan : "free";

  if (domain) {
    const cached = await fetchCachedCard(queryText, queryPlan, domain, city, engine);
    if (cached) {
      return {
        ...cached,
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

  const ai = getGemini();
  let contextString = "";
  if (userContext) {
    contextString = `
CONTESTO UTENTE:
- Posizione: ${userContext.location || "Non specificata"}
- Professione: ${userContext.profession || "Non specificata"}
- Interessi: ${Array.isArray(userContext.interests) ? userContext.interests.join(", ") : "Non specificati"}
`;
  }

  let historicalContext = "";
  if (domain) {
    const summary = await get20YearHistoricalContext(domain, city, ai);
    if (summary) {
      historicalContext = `
BASELINE STORICA 20 ANNI:
${summary}
`;
    }
  }

  let timeGptContext = "";
  if (domain && engine === "oracle") {
    let fh = 7;
    if (Array.isArray(queryPlan?.horizons) && queryPlan.horizons.length > 0) {
      const horizonId = queryPlan.horizons[0]?.horizon_id;
      if (horizonId === "30d") fh = 30;
      else if (horizonId === "90d") fh = 90;
      else if (horizonId === "6m") fh = 180;
      else if (horizonId === "12m") fh = 365;
      else if (horizonId === "14d") fh = 14;
      else if (horizonId === "12w") fh = 84;
    }
    const forecast = await fetchTimeGptForecast(domain, city, fh);
    if (forecast) {
      timeGptContext = `
DATI PREVISIONALI TIMEGPT:
- Orizzonte: ${forecast.value.length} periodi
- Valori previsti: ${JSON.stringify(forecast.value)}
- Timestamp: ${JSON.stringify(forecast.timestamp)}
Usa questi numeri come base quantitativa della previsione.
`;
    }
  }

  const response = await withRetry(async () =>
    ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Sei il motore predittivo di Crystal B2C.
L'utente ha chiesto: "${queryText}"
Il Query Plan generato dal sistema e: ${JSON.stringify(queryPlan)}
${contextString}
${historicalContext}
${timeGptContext}

Il tuo compito e generare un oggetto JSON CrystalCard finale.

REGOLE FONDAMENTALI:
1. Prima di ogni analisi usa Google Search per verificare i fatti che cambiano rapidamente.
2. Non inventare dati. Se i dati non bastano, segnalalo nel trust layer.
3. Usa il contesto storico solo per calibrare pattern, mai per sovrascrivere i fatti di oggi.
4. Fornisci un verdetto diretto e azioni pratiche.
5. Mantieni il testo leggibile e ben formattato.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            card_id: { type: Type.STRING },
            card_type: { type: Type.STRING },
            domain: { type: Type.STRING },
            stakes_level: { type: Type.STRING, enum: ["low", "medium", "high", "imminent"] },
            risk_band: { type: Type.STRING, enum: ["low", "medium", "high", "extreme"] },
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            verdict: { type: Type.STRING },
            personal_output: { type: Type.STRING },
            scenario_set: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  scenario_id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  probability: { type: Type.NUMBER },
                },
                required: ["scenario_id", "label", "probability"],
              },
            },
            so_what: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  option_id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  tradeoff_note: { type: Type.STRING },
                },
                required: ["option_id", "label", "tradeoff_note"],
              },
            },
            ranked_list: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item_id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  rank: { type: Type.INTEGER },
                  note: { type: Type.STRING },
                },
                required: ["item_id", "label", "score", "rank"],
              },
            },
            drivers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  feature_key: { type: Type.STRING },
                  direction: { type: Type.STRING, enum: ["up", "down", "flat"] },
                  contribution: { type: Type.NUMBER },
                },
                required: ["feature_key", "direction", "contribution"],
              },
            },
            trust_layer: {
              type: Type.OBJECT,
              properties: {
                confidence_score: { type: Type.NUMBER },
                confidence_tier: { type: Type.STRING, enum: ["low", "medium", "high"] },
                data_sufficiency_flag: { type: Type.STRING, enum: ["insufficient", "partial", "sufficient"] },
                freshness: {
                  type: Type.OBJECT,
                  properties: {
                    staleness_bucket: { type: Type.STRING, enum: ["fresh", "stale", "unknown"] },
                    as_of_utc: { type: Type.STRING },
                  },
                },
                provenance_summary: {
                  type: Type.OBJECT,
                  properties: {
                    verification_level: { type: Type.STRING, enum: ["unverified", "partially_verified", "verified", "official"] },
                    license_summary: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
          required: ["card_id", "card_type", "domain", "stakes_level", "title", "summary", "trust_layer"],
        },
      },
    })
  );

  let card = normalizeCard(JSON.parse(response.text || "{}"), queryPlan);
  try {
    const worldSimDigest = await getWorldSimDigest({
      ai,
      db,
      admin,
      withRetry,
      fetchJson,
      queryText,
      queryPlan,
      userContext,
      engine,
      plan,
      sidecarBaseUrl: process.env.WORLDSIM_BASE_URL,
      sidecarApiKey: process.env.WORLDSIM_API_KEY,
    });
    if (worldSimDigest) {
      card = enhanceCardWithWorldSim(card, worldSimDigest);
    }
  } catch (error) {
    console.error("WorldSim unavailable:", error);
  }
  if (domain) {
    await saveCachedCard(card, queryText, queryPlan, domain, city, engine);
  }
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
  const ai = getGemini();
  const formattedMessages = Array.isArray(messages)
    ? messages.map((message) => ({
        role: message.role === "user" ? "user" : "model",
        parts: [{ text: message.content || "" }],
      }))
    : [];

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: formattedMessages,
      config: {
        systemInstruction: `Sei un assistente AI di Crystal.
Il tuo obiettivo e raccogliere con naturalezza tre informazioni:
1. Posizione geografica
2. Professione o settore
3. Interessi o asset

Fai una domanda alla volta. Quando hai tutto, restituisci anche un riepilogo JSON in un blocco markdown.`,
      },
    });
    return response.text || "";
  });
}

async function generateNextletter(interests, userContext, options = {}) {
  const ai = getGemini();
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
1. Usa dati reali attuali con Google Search.
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

  const response = await withRetry(async () =>
    ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }],
      },
    })
  );
  let letter = JSON.parse(response.text || "{}");

  try {
    letter = await enhanceNextletterWithWorldSim({
      ai,
      db,
      admin,
      withRetry,
      fetchJson,
      interests: topics,
      userContext,
      letter,
      plan: isPlan(options.plan) ? options.plan : "free",
      sidecarBaseUrl: process.env.WORLDSIM_BASE_URL,
      sidecarApiKey: process.env.WORLDSIM_API_KEY,
    });
  } catch (error) {
    console.error("Nextletter WorldSim unavailable:", error);
  }

  return letter;
}

async function generateCrystalQuotes() {
  const today = new Date().toLocaleDateString("it-IT");
  const cacheKey = `quotes_${today.replace(/\//g, "-")}`;
  const cacheRef = db.collection("system_cache").doc(cacheKey);
  const snapshot = await cacheRef.get();
  if (snapshot.exists) {
    return snapshot.data();
  }

  const ai = getGemini();
  const prompt = `
Genera 5 Crystal Quotes per la settimana corrente.
Basati solo su trend reali e attuali usando Google Search.

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

  const response = await withRetry(async () =>
    ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }],
      },
    })
  );

  const payload = normalizeQuotePayload(JSON.parse(response.text || "{}"));
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
  const ai = getGemini();
  const locationEntity = Array.isArray(entities)
    ? entities.find((entity) => ["city", "location", "country"].includes(entity?.entity_type))
    : null;
  const locationContext = locationEntity ? `nella zona di ${locationEntity.label}` : "";

  const response = await withRetry(async () =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Fornisci un breve approfondimento locale relativo a questa query: "${queryText}" ${locationContext}. Menziona luoghi o attivita se rilevanti. Massimo 3-4 frasi.`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    })
  );

  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return {
    text: response.text || "",
    chunks,
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
        respondJson(res, 200, { ok: true, timestamp: new Date().toISOString() });
        return;
      }

      if (req.method === "GET" && route === "/quotes") {
        const quotes = await generateCrystalQuotes();
        respondJson(res, 200, quotes);
        return;
      }

      const decodedUser = await requireUser(req);
      const sourceView = getSourceView(
        req,
        route === "/predict" ? "search" : route === "/nextletter" ? "nextletter" : route === "/profile-chat" ? "profile" : "app"
      );
      const userState = await syncUserState(decodedUser.uid, decodedUser);

      if (req.method === "POST" && route === "/billing/create-checkout-session") {
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
            : req.headers.origin || "https://omnicrystal-3b286.web.app";

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
        const plan = await compileQuery(body.query || "");
        respondJson(res, 200, plan);
        return;
      }

      if (req.method === "POST" && route === "/predict") {
        const actionSpec = getPredictSpec(body.queryPlan || {}, sourceView === "dashboard" ? "dashboard" : "search");
        ensureActionAllowed(userState, actionSpec);
        try {
          const card = await predict(body.query || "", body.queryPlan || {}, body.userContext || null, {
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
          });
          respondJson(res, 200, card);
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
          const letter = await generateNextletter(body.interests || [], body.userContext || null, {
            plan: userState.plan,
          });
          await consumeCredits(decodedUser.uid, decodedUser, actionSpec, sourceView, {
            route: "nextletter",
            topicCount: Array.isArray(body.interests) ? body.interests.length : 0,
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
