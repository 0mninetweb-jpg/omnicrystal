const crypto = require("node:crypto");
const { Type } = require("@google/genai");
const { attachPolymarketToWorldSimDigest } = require("./polymarket");

const WORLD_SIM_CACHE_VERSION = "oracle-world-sim-v1";
const WORLD_SIM_CACHE_TTL_HOURS = 24;
const CATALOG_NATIVE_WORLD_SIM_FAMILIES = {
  "A.24.governance_policy_and_public_timeline": "governance_timeline",
  "A.25.geopolitics_and_conflict_dynamics": "geopolitics_conflict",
  "A.26.human_history_and_long_run_analogs": "long_run_analog",
  "A.30.culture_events_and_attention": "culture_event_pressure",
  "B.3.8.personal_decisions_and_tradeoffs": "personal_tradeoff",
  "C.1.attention_waves": "attention_narrative",
  "C.3.hype_curve_tracker": "attention_narrative",
  "C.4.global_quote_stream": "attention_narrative",
};

function clamp01(value, fallback = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num > 1) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function sanitizeList(list) {
  return Array.isArray(list) ? list.filter((item) => typeof item === "string" && item.trim()) : [];
}

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNullableNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function createWorldSimCacheKey(queryText, queryPlan = {}, plan = "free", engine = "standard", simulationContext = null) {
  const payload = {
    version: WORLD_SIM_CACHE_VERSION,
    queryText: safeText(queryText),
    domain: queryPlan?.domain || queryPlan?.domain_id || "",
    horizons: Array.isArray(queryPlan?.horizons)
      ? queryPlan.horizons.map((item) => item?.horizon_id || "")
      : [],
    entities: Array.isArray(queryPlan?.entities)
      ? queryPlan.entities.map((entity) => `${entity?.entity_type || "entity"}:${entity?.label || entity?.entity_id || ""}`)
      : [],
    filters: queryPlan?.filters || {},
    constraints: queryPlan?.constraints || {},
    plan,
    engine,
    simulation_context: simulationContext
      ? {
          domain_family: safeText(simulationContext?.domain_family),
          horizon: safeText(simulationContext?.horizon),
          decision_frame: safeText(simulationContext?.decision_frame),
          entity_event_location: simulationContext?.entity_event_location || {},
        }
      : null,
  };

  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function matchesWorldSimKeywords(queryText = "") {
  return /(election|elections|coalition|sanction|tariff|trade war|geopolitic|border|public opinion|protest|government|parliament|ceasefire|war|embargo|market|macro|inflation|rates|city|urban|mobility|tourism|culture|media|attention|narrative|dazi|sanzioni|elezioni|coalizione|conflitto|governo|opinione pubblica|inflazione|tassi|citta|mobilita|turismo|cultura|attenzione)/i.test(
    queryText
  );
}

function resolveWorldSimFamily(queryPlan = {}, queryText = "", simulationContext = null) {
  const fromContext = safeText(simulationContext?.domain_family);
  if (fromContext) return fromContext;

  const domain = safeText(queryPlan?.domain || queryPlan?.domain_id).toLowerCase();
  const corpus = `${domain} ${queryText}`.toLowerCase();

  const exactDomainId = safeText(queryPlan?.domain || queryPlan?.domain_id);
  if (CATALOG_NATIVE_WORLD_SIM_FAMILIES[exactDomainId]) {
    return CATALOG_NATIVE_WORLD_SIM_FAMILIES[exactDomainId];
  }

  if (/(election|government|coalition|referendum|budget vote|policy timeline|public timeline|elezion|governo|coalizione)/i.test(corpus)) {
    return "governance_timeline";
  }
  if (/(war|geopolit|sanction|tariff|border|force posture|taiwan|ukraine|ceasefire|conflitto|sanzion|dazi)/i.test(corpus)) {
    return "geopolitics_conflict";
  }
  if (/(historical analog|historical analogue|long-run analog|long run analog|regime similarity|recurrence)/i.test(corpus)) {
    return "long_run_analog";
  }
  if (/(culture|festival|concert|event pressure|crowding|venue|tourism pressure|cultura|evento)/i.test(corpus)) {
    return "culture_event_pressure";
  }
  if (/(attention|narrative|quote stream|hype|momentum|audience|viral|media breadth|attenzione|quote)/i.test(corpus)) {
    return "attention_narrative";
  }
  if (/(should i move|buy now or wait|tradeoff|opportunity cost|reversibility|wait six months)/i.test(corpus)) {
    return "personal_tradeoff";
  }
  return "";
}

function resolveWorldSimTemplate(queryPlan = {}, queryText = "", simulationContext = null) {
  return safeText(resolveWorldSimFamily(queryPlan, queryText, simulationContext), "public_discourse");
}

function supportsWorldSim(queryPlan = {}, queryText = "", engine = "standard", plan = "free", simulationContext = null) {
  const supportedFamily = Boolean(resolveWorldSimFamily(queryPlan, queryText, simulationContext));
  if (!["free", "plus", "pro"].includes(plan)) {
    return false;
  }
  return supportedFamily || matchesWorldSimKeywords(queryText);
}

function createEmptyDigest(defaults = {}) {
  return normalizeWorldSimDigest(
    {
      enabled: false,
      simulation_mode: "narrative_only",
      quality_score: 0.45,
      graph_coverage: 0.42,
      agent_convergence: 0.4,
      graph_age_hours: 999,
      narrative_arc: "",
      pivotal_actors: [],
      intervention_points: [],
      counterfactuals: [],
      source_set: [],
      scenario_frequencies: [],
      prediction_market_frame: null,
      probability_delta: 0,
      confidence_delta: 0,
      graph_summary: "",
      community_summaries: [],
      tensions: [],
      regime_shift_risk: 0,
      actor_dependency: 0,
      cascade_pressure: 0,
      trigger_map: [],
      invalidation_map: [],
      scenario_split_cause: [],
      simulation_id: null,
      cache_status: "miss",
      notes: [],
    },
    defaults
  );
}

function normalizeCounterfactuals(counterfactuals) {
  return Array.isArray(counterfactuals)
    ? counterfactuals
        .map((item, index) => ({
          label: safeText(item?.label, `Controfattuale ${index + 1}`),
          outcome: safeText(item?.outcome, "Esito non definito."),
        }))
        .slice(0, 4)
    : [];
}

function normalizeScenarioFrequencies(scenarios) {
  const raw = Array.isArray(scenarios)
    ? scenarios
        .map((item, index) => ({
          label: safeText(item?.label, `Scenario ${index + 1}`),
          probability: clamp01(item?.probability, 0),
        }))
        .filter((item) => item.probability > 0)
    : [];

  if (!raw.length) return [];
  const total = raw.reduce((sum, item) => sum + item.probability, 0) || 1;
  return raw
    .map((item) => ({ ...item, probability: item.probability / total }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 4);
}

function normalizePredictionMarketFrame(frame, queryPlan = {}) {
  if (!frame || typeof frame !== "object") return null;
  return {
    outcome: safeText(frame.outcome),
    horizon: safeText(frame.horizon, queryPlan?.horizons?.[0]?.horizon_id || "30d"),
    resolution_criteria: safeText(frame.resolution_criteria),
    reference_market: safeText(frame.reference_market),
    prior_probability: frame.prior_probability == null ? null : clamp01(frame.prior_probability, null),
    market_id: safeText(frame.market_id) || null,
    market_slug: safeText(frame.market_slug) || null,
    market_question: safeText(frame.market_question) || null,
    market_url: safeText(frame.market_url) || null,
    implied_probability: frame.implied_probability == null ? null : clamp01(frame.implied_probability, null),
    match_confidence: frame.match_confidence == null ? null : clamp01(frame.match_confidence, null),
    market_quality: frame.market_quality == null ? null : clamp01(frame.market_quality, null),
    open_interest: toNullableNumber(frame.open_interest),
    volume_24h: toNullableNumber(frame.volume_24h),
    liquidity: toNullableNumber(frame.liquidity),
    price_updated_at: safeText(frame.price_updated_at) || null,
    divergence_vs_crystal: toNullableNumber(frame.divergence_vs_crystal),
    calibration_applied: Boolean(frame.calibration_applied),
    calibration_note: safeText(frame.calibration_note),
    crystal_probability: frame.crystal_probability == null ? null : clamp01(frame.crystal_probability, null),
    calibrated_probability: frame.calibrated_probability == null ? null : clamp01(frame.calibrated_probability, null),
    price_change_7d: toNullableNumber(frame.price_change_7d),
  };
}

function normalizeWorldSimDigest(raw = {}, defaults = {}) {
  const digest = {
    enabled: raw?.enabled !== false,
    simulation_mode: safeText(raw?.simulation_mode, defaults.simulation_mode || "delta_simulation"),
    quality_score: clamp01(raw?.quality_score, defaults.quality_score || 0.65),
    graph_coverage: clamp01(raw?.graph_coverage, defaults.graph_coverage || 0.6),
    agent_convergence: clamp01(raw?.agent_convergence, defaults.agent_convergence || 0.58),
    graph_age_hours: Number.isFinite(Number(raw?.graph_age_hours))
      ? Number(raw.graph_age_hours)
      : Number.isFinite(Number(defaults.graph_age_hours))
        ? Number(defaults.graph_age_hours)
        : 12,
    narrative_arc: safeText(raw?.narrative_arc, defaults.narrative_arc || ""),
    pivotal_actors: sanitizeList(raw?.pivotal_actors).slice(0, 6),
    intervention_points: sanitizeList(raw?.intervention_points).slice(0, 4),
    counterfactuals: normalizeCounterfactuals(raw?.counterfactuals),
    source_set: sanitizeList(raw?.source_set).slice(0, 6),
    scenario_frequencies: normalizeScenarioFrequencies(raw?.scenario_frequencies),
    prediction_market_frame: normalizePredictionMarketFrame(raw?.prediction_market_frame, defaults.queryPlan),
    probability_delta: Math.max(-0.05, Math.min(0.05, Number(raw?.probability_delta) || 0)),
    confidence_delta: Math.max(-0.08, Math.min(0.08, Number(raw?.confidence_delta) || 0)),
    graph_summary: safeText(raw?.graph_summary, defaults.graph_summary || ""),
    community_summaries: sanitizeList(raw?.community_summaries).slice(0, 4),
    tensions: sanitizeList(raw?.tensions).slice(0, 4),
    regime_shift_risk: clamp01(raw?.regime_shift_risk, defaults.regime_shift_risk || 0.42),
    actor_dependency: clamp01(raw?.actor_dependency, defaults.actor_dependency || 0.44),
    cascade_pressure: clamp01(raw?.cascade_pressure, defaults.cascade_pressure || 0.4),
    trigger_map: sanitizeList(raw?.trigger_map).slice(0, 5),
    invalidation_map: sanitizeList(raw?.invalidation_map).slice(0, 5),
    scenario_split_cause: sanitizeList(raw?.scenario_split_cause).slice(0, 4),
    simulation_id: safeText(raw?.simulation_id, defaults.simulation_id || null),
    cache_status: safeText(raw?.cache_status, defaults.cache_status || "miss"),
    notes: sanitizeList(raw?.notes).slice(0, 5),
    generated_at: safeText(raw?.generated_at, defaults.generated_at || new Date().toISOString()),
  };

  if (digest.quality_score < 0.55) {
    digest.probability_delta = 0;
    digest.confidence_delta = Math.min(0, digest.confidence_delta);
  }

  return digest;
}

async function getCachedDigest(db, cacheKey) {
  const docRef = db.collection("world_sim_cache").doc(cacheKey);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return { digest: null, snapshot: null };
  }

  const data = snapshot.data() || {};
  const ttl = typeof data?.ttl?.toDate === "function" ? data.ttl.toDate() : null;
  const generatedAt = typeof data?.generated_at?.toDate === "function" ? data.generated_at.toDate() : null;
  const digest = data.digest || null;

  return {
    snapshot: {
      exists: true,
      ttl,
      generatedAt,
      digest,
    },
    digest: ttl && ttl > new Date() ? digest : null,
  };
}

async function saveWorldSimDigest(db, admin, cacheKey, digest, metadata = {}) {
  const ttl = new Date();
  ttl.setHours(ttl.getHours() + WORLD_SIM_CACHE_TTL_HOURS);

  await db.collection("world_sim_cache").doc(cacheKey).set(
    {
      version: WORLD_SIM_CACHE_VERSION,
      query_hash: cacheKey,
      digest,
      metadata,
      generated_at: admin.firestore.FieldValue.serverTimestamp(),
      ttl: admin.firestore.Timestamp.fromDate(ttl),
    },
    { merge: true }
  );
}

async function buildGraphSeedPack({ ai, queryText, queryPlan, userContext, withRetry, template, simulationContext = null }) {
  const contextString = userContext
    ? `
CONTESTO UTENTE:
- Posizione: ${safeText(userContext.location, "Non specificata")}
- Professione: ${safeText(userContext.profession, "Non specificata")}
- Interessi: ${Array.isArray(userContext.interests) ? userContext.interests.join(", ") : "Non specificati"}`
    : "";

  const response = await withRetry(async () =>
    ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Sei il GraphRAG retriever di Crystal Oracle.
Devi creare un world seed pack grounded per una simulazione di tipo "${template || "public-discourse"}".

QUERY: "${queryText}"
QUERY PLAN: ${JSON.stringify(queryPlan)}
SIMULATION CONTEXT: ${JSON.stringify(simulationContext || {})}
${contextString}

REGOLE:
1. Usa Google Search per trovare solo fatti e segnali attuali.
2. Estrai solo entita, relazioni, community e tensioni davvero rilevanti alla query.
3. Costruisci un frame da prediction market solo se l'outcome puo essere risolto con criteri chiari.
4. Se il matching con un mercato esterno e ambiguo, lascia vuoti reference_market e prior_probability.
5. Niente worldbuilding libero.

Restituisci JSON con:
- graph_summary
- entities
- relations
- community_summaries
- timeline_events
- tensions
- source_set
- prediction_market_frame`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            graph_summary: { type: Type.STRING },
            entities: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            relations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            community_summaries: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            timeline_events: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            tensions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            source_set: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            prediction_market_frame: {
              type: Type.OBJECT,
              properties: {
                outcome: { type: Type.STRING },
                horizon: { type: Type.STRING },
                resolution_criteria: { type: Type.STRING },
                reference_market: { type: Type.STRING },
                prior_probability: { type: Type.NUMBER },
              },
            },
          },
        },
      },
    })
  );

  return JSON.parse(response.text || "{}");
}

async function simulateWithGemini({ ai, queryText, queryPlan, seedPack, withRetry, simulationMode, template, simulationContext = null }) {
  const response = await withRetry(async () =>
    ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Sei il world simulation engine di Crystal Oracle, ispirato a un workflow MiroFish.
Non devi inventare un mondo: devi simulare solo le dinamiche compatibili con il seed pack recuperato.

QUERY: "${queryText}"
QUERY PLAN: ${JSON.stringify(queryPlan)}
TEMPLATE: ${template || "public-discourse"}
SIMULATION MODE: ${simulationMode}
SIMULATION CONTEXT: ${JSON.stringify(simulationContext || {})}
WORLD SEED PACK: ${JSON.stringify(seedPack)}

REGOLE:
1. Simula interazioni tra attori, coalizioni, incentivi e shock solo se coerenti con il seed pack.
2. Restituisci scenari, attori pivot, punti di intervento e controfattuali.
3. Se la copertura del grafo e debole, abbassa quality_score e non spostare il numero finale.
4. probability_delta deve restare tra -0.05 e +0.05.
5. confidence_delta deve restare tra -0.08 e +0.08.
6. Se il template è catalog-native, restituisci anche campi strutturati coerenti con il family type.

OUTPUT JSON con:
- enabled
- simulation_mode
- quality_score
- graph_coverage
- agent_convergence
- graph_age_hours
- narrative_arc
- pivotal_actors
- intervention_points
- counterfactuals
- source_set
- scenario_frequencies
- prediction_market_frame
- probability_delta
- confidence_delta
- graph_summary
- community_summaries
- tensions
- regime_shift_risk
- actor_dependency
- cascade_pressure
- trigger_map
- invalidation_map
- scenario_split_cause
- notes`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            enabled: { type: Type.BOOLEAN },
            simulation_mode: { type: Type.STRING },
            quality_score: { type: Type.NUMBER },
            graph_coverage: { type: Type.NUMBER },
            agent_convergence: { type: Type.NUMBER },
            graph_age_hours: { type: Type.NUMBER },
            narrative_arc: { type: Type.STRING },
            pivotal_actors: { type: Type.ARRAY, items: { type: Type.STRING } },
            intervention_points: { type: Type.ARRAY, items: { type: Type.STRING } },
            counterfactuals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  outcome: { type: Type.STRING },
                },
              },
            },
            source_set: { type: Type.ARRAY, items: { type: Type.STRING } },
            scenario_frequencies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  probability: { type: Type.NUMBER },
                },
              },
            },
            prediction_market_frame: {
              type: Type.OBJECT,
              properties: {
                outcome: { type: Type.STRING },
                horizon: { type: Type.STRING },
                resolution_criteria: { type: Type.STRING },
                reference_market: { type: Type.STRING },
                prior_probability: { type: Type.NUMBER },
              },
            },
            probability_delta: { type: Type.NUMBER },
            confidence_delta: { type: Type.NUMBER },
            graph_summary: { type: Type.STRING },
            community_summaries: { type: Type.ARRAY, items: { type: Type.STRING } },
            tensions: { type: Type.ARRAY, items: { type: Type.STRING } },
            regime_shift_risk: { type: Type.NUMBER },
            actor_dependency: { type: Type.NUMBER },
            cascade_pressure: { type: Type.NUMBER },
            trigger_map: { type: Type.ARRAY, items: { type: Type.STRING } },
            invalidation_map: { type: Type.ARRAY, items: { type: Type.STRING } },
            scenario_split_cause: { type: Type.ARRAY, items: { type: Type.STRING } },
            notes: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    })
  );

  return JSON.parse(response.text || "{}");
}

async function callWorldSimSidecar({ baseUrl, apiKey, fetchJson, payload }) {
  const normalizedBase = safeText(baseUrl).replace(/\/$/, "");
  if (!normalizedBase) {
    throw new Error("WorldSim sidecar URL non configurato.");
  }

  return fetchJson(`${normalizedBase}/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-WorldSim-Key": apiKey } : {}),
    },
    body: JSON.stringify(payload),
  });
}

async function getWorldSimDigest({
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
  simulationContext,
  sidecarBaseUrl,
  sidecarApiKey,
}) {
  if (!supportsWorldSim(queryPlan, queryText, engine, plan, simulationContext)) {
    return null;
  }

  const template = resolveWorldSimTemplate(queryPlan, queryText, simulationContext);
  const cacheKey = createWorldSimCacheKey(queryText, queryPlan, plan, engine, simulationContext);
  const { digest: freshDigest, snapshot } = await getCachedDigest(db, cacheKey);

  if (freshDigest) {
    const normalizedFreshDigest = normalizeWorldSimDigest(freshDigest, {
      simulation_mode: "cache_hit",
      cache_status: "fresh",
      queryPlan,
      generated_at: snapshot?.generatedAt?.toISOString?.() || new Date().toISOString(),
    });
    return attachPolymarketToWorldSimDigest({
      db,
      admin,
      fetchJson,
      queryText,
      queryPlan,
      digest: normalizedFreshDigest,
    });
  }

  const simulationMode = snapshot?.exists ? "delta_simulation" : "full_rebuild";
  let rawDigest;

  if (safeText(sidecarBaseUrl)) {
    rawDigest = await callWorldSimSidecar({
      baseUrl: sidecarBaseUrl,
      apiKey: sidecarApiKey,
      fetchJson,
      payload: {
        query: queryText,
        query_plan: queryPlan,
        user_context: userContext,
        simulation_context: simulationContext,
        simulation_mode: simulationMode,
        template,
      },
    });
  } else {
    const seedPack = await buildGraphSeedPack({
      ai,
      queryText,
      queryPlan,
      userContext,
      withRetry,
      template,
      simulationContext,
    });
    rawDigest = await simulateWithGemini({
      ai,
      queryText,
      queryPlan,
      seedPack,
      withRetry,
      simulationMode,
      template,
      simulationContext,
    });
  }

  const normalized = normalizeWorldSimDigest(rawDigest, {
    simulation_mode: simulationMode,
    cache_status: snapshot?.exists ? "stale-recomputed" : "miss",
    queryPlan,
  });

  const enrichedDigest = await attachPolymarketToWorldSimDigest({
    db,
    admin,
    fetchJson,
    queryText,
    queryPlan,
    digest: normalized,
  });

  await saveWorldSimDigest(db, admin, cacheKey, enrichedDigest, {
    query: queryText,
    domain: queryPlan?.domain || queryPlan?.domain_id || "",
    engine,
    plan,
    template,
    simulation_context: simulationContext || null,
  });

  return enrichedDigest;
}

function normalizeScenarioLabel(label) {
  return safeText(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function applyProbabilityDeltaToScenarios(scenarios = [], delta = 0) {
  if (!Array.isArray(scenarios) || scenarios.length === 0 || !delta) return scenarios;

  const next = scenarios.map((scenario) => ({ ...scenario }));
  next.sort((a, b) => (Number(b.probability) || 0) - (Number(a.probability) || 0));
  const first = next[0];
  const topBefore = clamp01(first.probability, 0.5);
  const topAfter = Math.max(0.01, Math.min(0.99, topBefore + delta));
  const remainderBefore = Math.max(0.01, 1 - topBefore);
  const remainderAfter = Math.max(0.01, 1 - topAfter);

  first.probability = topAfter;

  if (next.length === 1) {
    return [{ ...first, probability: 1 }];
  }

  const others = next.slice(1);
  const othersTotal = others.reduce((sum, item) => sum + clamp01(item.probability, 0), 0) || remainderBefore;

  others.forEach((item) => {
    const proportion = clamp01(item.probability, 0) / othersTotal;
    item.probability = Math.max(0.01, remainderAfter * proportion);
  });

  const total = next.reduce((sum, item) => sum + item.probability, 0) || 1;
  return next.map((item) => ({
    ...item,
    probability: item.probability / total,
  }));
}

function mergeScenarioSet(cardScenarios = [], worldSimScenarios = [], probabilityDelta = 0) {
  if (!Array.isArray(cardScenarios) || cardScenarios.length === 0) {
    return applyProbabilityDeltaToScenarios(
      worldSimScenarios.map((item, index) => ({
        scenario_id: `world_sim_${index + 1}`,
        label: item.label,
        probability: item.probability,
      })),
      probabilityDelta
    );
  }

  const normalizedWorldScenarios = worldSimScenarios.map((item) => ({
    label: normalizeScenarioLabel(item.label),
    probability: item.probability,
  }));

  const merged = cardScenarios.map((scenario) => {
    const normalizedLabel = normalizeScenarioLabel(scenario.label);
    const match = normalizedWorldScenarios.find((item) => {
      if (!item.label || !normalizedLabel) return false;
      return item.label.includes(normalizedLabel) || normalizedLabel.includes(item.label);
    });
    return match
      ? {
          ...scenario,
          probability: clamp01((scenario.probability + match.probability) / 2, scenario.probability),
        }
      : { ...scenario };
  });

  merged.sort((a, b) => b.probability - a.probability);
  return applyProbabilityDeltaToScenarios(merged, probabilityDelta);
}

function toConfidenceTier(score) {
  if (score >= 0.78) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function toSufficiencyFlag(coverage) {
  if (coverage >= 0.72) return "sufficient";
  if (coverage >= 0.45) return "partial";
  return "insufficient";
}

function toFreshnessBucket(graphAgeHours) {
  if (graphAgeHours <= 24) return "fresh";
  if (graphAgeHours <= 72) return "stale";
  return "unknown";
}

function mergeUniqueStrings(primary = [], secondary = [], limit = 8) {
  return [...new Set([...sanitizeList(primary), ...sanitizeList(secondary)])].slice(0, limit);
}

function enhanceCardWithWorldSim(card, digest) {
  if (!card || !digest || !digest.enabled) return card;

  const next = JSON.parse(JSON.stringify(card));
  const mergedMarketFrame = digest.prediction_market_frame || next.prediction_market_frame
    ? {
        ...(next.prediction_market_frame || {}),
        ...(digest.prediction_market_frame || {}),
      }
    : null;

  next.prediction_market_frame = mergedMarketFrame;
  next.world_sim = {
    ...digest,
    prediction_market_frame: mergedMarketFrame,
  };
  next.scenario_set = mergeScenarioSet(next.scenario_set, digest.scenario_frequencies, digest.probability_delta);

  const worldSimDrivers = digest.pivotal_actors.slice(0, 3).map((actor, index) => ({
    feature_key: `world_sim_${actor.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    direction: index === 0 ? "up" : "flat",
    contribution: Number((0.18 - index * 0.03).toFixed(2)),
  }));

  next.drivers = [...(Array.isArray(next.drivers) ? next.drivers : []), ...worldSimDrivers].slice(0, 6);

  const interventionActions = digest.intervention_points.slice(0, 2).map((point, index) => ({
    option_id: `oracle_intervention_${index + 1}`,
    label: `Mossa Oracle ${index + 1}`,
    tradeoff_note: point,
  }));

  const existingActions = Array.isArray(card.so_what) ? card.so_what.map((item) => ({ ...item })) : [];
  next.so_what = [...existingActions, ...interventionActions].slice(0, 4);

  if (digest.narrative_arc) {
    next.summary = `${next.summary} Oracle WorldSim: ${digest.narrative_arc}`;
  }

  if (digest.counterfactuals[0]) {
    const counterfactual = digest.counterfactuals[0];
    const personalNote = `Controfattuale chiave: ${counterfactual.label} -> ${counterfactual.outcome}`;
    next.personal_output = next.personal_output
      ? `${next.personal_output} ${personalNote}`
      : personalNote;
  }

  const confidenceScore = clamp01(next.trust_layer?.confidence_score + digest.confidence_delta, next.trust_layer?.confidence_score || 0.6);
  next.trust_layer = {
    ...next.trust_layer,
    confidence_score: confidenceScore,
    confidence_tier: toConfidenceTier(confidenceScore),
    data_sufficiency_flag: toSufficiencyFlag(digest.graph_coverage),
    freshness: {
      ...next.trust_layer?.freshness,
      staleness_bucket: toFreshnessBucket(digest.graph_age_hours),
      as_of_utc: digest.generated_at || next.trust_layer?.freshness?.as_of_utc || new Date().toISOString(),
    },
    provenance_summary: {
      ...next.trust_layer?.provenance_summary,
      verification_level: digest.quality_score >= 0.72 ? "verified" : next.trust_layer?.provenance_summary?.verification_level || "partially_verified",
      license_summary: mergeUniqueStrings(
        next.trust_layer?.provenance_summary?.license_summary,
        digest.source_set.length ? digest.source_set : ["oracle-world-sim"]
      ),
    },
  };

  return next;
}

function looksGeopoliticalText(text = "") {
  return /(election|geopolit|war|trade|tariff|sanction|border|coalition|government|parliament|public opinion|protest|macro risk|politic|sanzion|dazi|elezion|governo|coalizione|conflitto)/i.test(
    text
  );
}

function buildSectionQueryPlan(section = {}) {
  const horizon = safeText(section.horizon, "30d");
  return {
    domain_id: "A.11.geopolitics.trade_tensions",
    horizons: [{ horizon_id: horizon }],
    filters: {
      confidence_preference: "rigorous",
    },
    entities: [],
  };
}

async function enhanceNextletterWithWorldSim({
  ai,
  db,
  admin,
  withRetry,
  fetchJson,
  interests,
  userContext,
  letter,
  plan,
  sidecarBaseUrl,
  sidecarApiKey,
}) {
  if (plan !== "pro" || !letter || !Array.isArray(letter.sections)) {
    return letter;
  }

  const next = {
    ...letter,
    sections: letter.sections.map((section) => ({ ...section })),
  };

  const eligibleSections = next.sections
    .filter((section) =>
      looksGeopoliticalText(
        [section.topic, section.title, section.content, section.query_suggestion].filter(Boolean).join(" ")
      )
    )
    .slice(0, 2);

  for (const section of eligibleSections) {
    try {
      const queryText =
        safeText(section.query_suggestion) ||
        [safeText(section.topic), safeText(section.title)].filter(Boolean).join(": ");
      const digest = await getWorldSimDigest({
        ai,
        db,
        admin,
        withRetry,
        fetchJson,
        queryText,
        queryPlan: buildSectionQueryPlan(section),
        userContext,
        engine: "oracle",
        plan,
        sidecarBaseUrl,
        sidecarApiKey,
      });

      if (!digest) continue;

      const mergedMarketFrame = digest.prediction_market_frame || section.prediction_market_frame
        ? {
            ...(section.prediction_market_frame || {}),
            ...(digest.prediction_market_frame || {}),
          }
        : null;

      section.prediction_market_frame = mergedMarketFrame;

      section.world_sim = {
        simulation_mode: digest.simulation_mode,
        narrative_arc: digest.narrative_arc,
        pivotal_actors: digest.pivotal_actors,
        intervention_points: digest.intervention_points,
        prediction_market_frame: mergedMarketFrame,
      };

      if (digest.narrative_arc) {
        section.content = `${section.content} Oracle WorldSim: ${digest.narrative_arc}`;
      }

      if (digest.counterfactuals[0]) {
        const note = `Controfattuale chiave: ${digest.counterfactuals[0].label} -> ${digest.counterfactuals[0].outcome}`;
        section.historical_context = section.historical_context
          ? `${section.historical_context} ${note}`
          : note;
      }
    } catch (error) {
      console.error("Nextletter WorldSim unavailable:", error);
    }
  }

  return next;
}

module.exports = {
  WORLD_SIM_CACHE_TTL_HOURS,
  WORLD_SIM_CACHE_VERSION,
  supportsWorldSim,
  resolveWorldSimFamily,
  resolveWorldSimTemplate,
  getWorldSimDigest,
  enhanceCardWithWorldSim,
  enhanceNextletterWithWorldSim,
};
