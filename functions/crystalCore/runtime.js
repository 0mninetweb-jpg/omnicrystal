const crypto = require("node:crypto");
const googleTrends = require("google-trends-api");
const { GoogleGenAI, Type } = require("@google/genai");

const { createLlmRuntime } = require("../llmRuntime");
const {
  GENERAL_FORECAST_DOMAIN,
  CATALOG_VERSION_ID,
  getDomain,
  getDomainCardTypes,
  isSupportedDomain,
  resolveDomainId,
} = require("../catalogRegistry");
const {
  buildRoutingHints,
  mergeQueryPlanWithRouting,
  computeEvidenceQuality,
  finalizeScorecard,
  buildDriverObjects,
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

const CRYSTAL_CORE_VERSION = "crystal-core-v1";

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function nowIso() {
  return new Date().toISOString();
}

function serverTimestamp(admin) {
  return admin?.firestore?.FieldValue?.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : nowIso();
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

function buildEvidenceSignalsText(evidenceBundle = {}) {
  const signals = Array.isArray(evidenceBundle.live_signals) ? evidenceBundle.live_signals : [];
  if (!signals.length) {
    return "LIVE SIGNALS\n- No fresh structured live signals were available for this run.";
  }

  return `LIVE SIGNALS\n${signals.map((signal) => `- ${signal.label}: ${signal.summary}`).join("\n")}`;
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

function buildSourceTrustMap(searchPayload = {}, liveSignals = []) {
  const fromSearch = Array.isArray(searchPayload.source_trust_map) ? searchPayload.source_trust_map : [];
  const fromSignals = (Array.isArray(liveSignals) ? liveSignals : [])
    .map((signal) => ({
      source_id: safeText(signal?.source_id),
      trust_score: clamp01(signal?.trust_score, 0.58),
      note: safeText(signal?.label),
    }))
    .filter((item) => item.source_id);

  const bySource = new Map();
  [...fromSearch, ...fromSignals].forEach((item) => {
    if (!item.source_id) return;
    const existing = bySource.get(item.source_id);
    if (!existing || item.trust_score > existing.trust_score) {
      bySource.set(item.source_id, item);
    }
  });

  return [...bySource.values()].sort((left, right) => right.trust_score - left.trust_score).slice(0, 8);
}

function buildMissingnessMap({ baseline, liveSignals = [], predictionMarketFrame }) {
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

function normalizeScenarioSet(rawScenarioSet = [], probabilitySplit = null) {
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

  return [];
}

function confidenceTier(score) {
  if (score >= 0.78) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function buildStakeLevel(domainId = "") {
  return /safety|geopolitics|governance|health/.test(safeText(domainId)) ? "high" : "medium";
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

  return {
    plan_version: safeText(mergedPayload?.plan_version, "crystal-core-v1"),
    pipeline_version: CRYSTAL_CORE_VERSION,
    catalog_version_id: safeText(mergedPayload?.catalog_version_id, CATALOG_VERSION_ID),
    primary_domain_id: normalizedDomain,
    domain_id: normalizedDomain,
    candidate_domains: Array.isArray(mergedPayload?.candidate_domains) ? mergedPayload.candidate_domains : [],
    intent_shape: safeText(mergedPayload?.intent_shape, routingHints.intentShape || "directional_range"),
    resolution_frame: safeText(mergedPayload?.resolution_frame, routingHints.resolutionFrame || "trend"),
    confidence_mode: safeText(mergedPayload?.confidence_mode, "rigorous"),
    mode: {
      type: mergedPayload?.mode?.type === "predict_action" ? "predict_action" : "predict_only",
    },
    entity_set: Array.isArray(mergedPayload?.entity_set) ? mergedPayload.entity_set : [],
    entities,
    entity_map: entities,
    horizons,
    horizon,
    geography,
    card_types: cardTypes,
    question_side_a: safeText(mergedPayload?.question_side_a),
    question_side_b: safeText(mergedPayload?.question_side_b),
    binary_frame: {
      asks_binary_question: Boolean(safeText(mergedPayload?.question_side_a) && safeText(mergedPayload?.question_side_b)),
      question_side_a: safeText(mergedPayload?.question_side_a),
      question_side_b: safeText(mergedPayload?.question_side_b),
    },
    event_date: safeText(mergedPayload?.event_date),
    governing_entity: safeText(mergedPayload?.governing_entity),
    jurisdiction: safeText(mergedPayload?.jurisdiction),
    supporting_domains: Array.isArray(mergedPayload?.supporting_domains) ? mergedPayload.supporting_domains : [],
    subdomain_map: subdomainMap,
    research_depth_preference: "deep",
    original_query: safeText(options?.queryText),
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

  return `Convert the following user query into a Crystal QueryPlan JSON object.

Query: "${queryText}"

Routing hints:
- preferred primary_domain_id: ${routingHints.primaryDomainId || GENERAL_FORECAST_DOMAIN}
- intent_shape: ${routingHints.intentShape || "directional_range"}
- resolution_frame: ${routingHints.resolutionFrame || "trend"}
- question_side_a: ${routingHints?.binaryFrame?.question_side_a || ""}
- question_side_b: ${routingHints?.binaryFrame?.question_side_b || ""}
- supporting_domains: ${Array.isArray(routingHints?.supportingDomains) ? routingHints.supportingDomains.join(", ") : ""}

Top candidate domains:
${candidateLines || "- none"}

Rules:
1. Choose a concrete domain whenever possible.
2. Do not fall back to ${GENERAL_FORECAST_DOMAIN} unless the query is truly meta or impossible to ground.
3. Preserve binary framing when the question is yes/no-like.
4. Add subdomain_map with 2-3 concrete sub-areas to inspect.
5. Keep the plan broad enough for "predict anything", but specific enough to guide research.

Return JSON only with:
- plan_version
- primary_domain_id
- domain_id
- candidate_domains[]
- intent_shape
- resolution_frame
- confidence_mode
- mode.type
- entity_set[]
- entities[]
- horizons[]
- card_types[]
- question_side_a
- question_side_b
- event_date
- governing_entity
- jurisdiction
- supporting_domains[]
- subdomain_map[]`;
}

function buildDossierPredictionPrompt({
  queryText,
  normalizedQuery,
  researchPlan,
  variableSelectionPack,
  verifiedEvidencePack,
  baselineConsensusPack,
}) {
  return `You are Crystal's Dossier and Prediction Agent. Return JSON only.

QUERY: "${queryText}"
NORMALIZED QUERY: ${JSON.stringify(normalizedQuery)}
RESEARCH PLAN: ${JSON.stringify(researchPlan)}
SELECTED VARIABLES: ${JSON.stringify(variableSelectionPack.selected_variables || [])}
VERIFIED EVIDENCE PACK: ${JSON.stringify({
    live_signals: verifiedEvidencePack.live_signals,
    verification_summary: verifiedEvidencePack.verification_summary,
    conflict_map: verifiedEvidencePack.conflict_map,
    missingness_map: verifiedEvidencePack.missingness_map,
    source_trust_map: verifiedEvidencePack.source_trust_map,
  })}
BASELINE / CONSENSUS: ${JSON.stringify(baselineConsensusPack)}

HISTORICAL BASELINE
${safeText(verifiedEvidencePack.historical_baseline_20y, "No strong historical baseline available.")}

${buildEvidenceSignalsText(verifiedEvidencePack)}

Return JSON only with:
- structured_dossier { query_normalized, domain_map, outcome_target, horizon, selected_variables[], ranked_drivers[], macro_context[], case_specific_context[], uncertainty_map[], data_quality_map[] }
- feature_bundle[] { label, direction, confidence, note }
- baseline_consensus_pack { naive_baseline, consensus_prediction, delta_vs_consensus, edge_claim }
- raw_prediction {
  primary_call,
  probability_split { primary_label, primary_probability, secondary_label, secondary_probability },
  confidence_score,
  key_drivers[],
  counter_signals[],
  invalidators[],
  historical_anchors[],
  why_this_side,
  recommended_posture,
  scenario_set[]
}

Rules:
1. Publish a directional thesis when evidence has orientation.
2. Avoid generic filler or fake neutrality.
3. For binary questions, use explicit side labels.
4. The raw prediction is not the final publish decision.`;
}

function buildForecastVerbalizationPrompt({ queryText, normalizedQuery, verifiedEvidencePack, scorecard }) {
  return `You are Crystal's final verbalizer. Return JSON only.

QUERY: "${queryText}"
NORMALIZED QUERY: ${JSON.stringify(normalizedQuery)}
SCORECARD: ${JSON.stringify(scorecard)}
VERIFIED EVIDENCE SUMMARY: ${JSON.stringify({
    verification_summary: verifiedEvidencePack.verification_summary,
    conflict_map: verifiedEvidencePack.conflict_map,
    missingness_map: verifiedEvidencePack.missingness_map,
  })}

Return JSON only with:
- title
- summary
- verdict
- recommended_action
- what_to_watch[]
- how_to_raise_confidence[]
- coverage_notes[]

Rules:
1. State the call first.
2. Keep the card scannable and product-like.
3. Do not hide the thesis behind uncertainty boilerplate.
4. If the scorecard is limited, keep the thesis but make the trust caveat explicit in summary or coverage notes.`;
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
  runtimeTransport = "local",
  rolloutBucket = null,
}) {
  const domainConfig = getDomain(normalizedQuery.primary_domain_id, GENERAL_FORECAST_DOMAIN);
  const probabilitySplit = scorecard?.probability_split || null;
  const scenarioSet = normalizeScenarioSet(
    Array.isArray(scorecard?.scenario_set) ? scorecard.scenario_set : [],
    probabilitySplit
  );
  const evidenceQuality =
    verifiedEvidencePack?.evidence_quality && typeof verifiedEvidencePack.evidence_quality === "object"
      ? verifiedEvidencePack.evidence_quality
      : computeEvidenceQuality(verifiedEvidencePack, domainConfig, "extended");
  const confidenceScore = clamp01(scorecard?.confidence_score, 0.58);
  const publicationState = safeText(scorecard?.publication_state, "limited");
  const now = nowIso();
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
        ? verifiedEvidencePack.missingness_map.map((item) => item.replace(/_/g, " "))
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
    title: safeText(voicePayload?.title, safeText(queryText, "Crystal Forecast")),
    summary: safeText(voicePayload?.summary, safeText(scorecard?.why_this_side, "Crystal generated a directional read.")),
    verdict: safeText(voicePayload?.verdict, safeText(scorecard?.primary_call, "Crystal generated a directional read.")),
    primary_call: safeText(scorecard?.primary_call),
    probability_split: probabilitySplit,
    why_this_side: safeText(scorecard?.why_this_side),
    personal_output: safeText(
      voicePayload?.recommended_action,
      safeText(scorecard?.recommended_posture, "Use this as a live directional read and monitor the invalidation triggers.")
    ),
    scenario_set: scenarioSet,
    so_what: [],
    drivers: buildDriverObjects(scorecard?.key_drivers || []),
    counter_signals: normalizeTextList(scorecard?.counter_signals, 4),
    historical_anchors: normalizeTextList(scorecard?.historical_anchors, 4),
    invalidators: normalizeTextList(scorecard?.invalidators, 4),
    publication_basis: scorecard?.publication_basis || null,
    what_to_watch: whatToWatch,
    how_to_raise_confidence: howToRaiseConfidence,
    evidence_drawer: {
      metrics_provenance: uniqueStrings(verifiedEvidencePack.source_ledger || []).slice(0, 8),
      freshness_summary: {
        as_of_utc: safeText(verifiedEvidencePack?.prediction_market_frame?.price_updated_at, now),
        cadence: safeText(domainConfig.refresh_cadence, "session-based"),
        staleness_bucket: evidenceQuality.freshness_score >= 0.66 ? "fresh" : evidenceQuality.freshness_score <= 0.32 ? "stale" : "unknown",
      },
      coverage_notes: coverageNotes,
      gating_reason:
        publicationState === "published" ? "published" : publicationState === "limited" ? "limited_by_evidence" : "blocked_by_policy",
    },
    trust_layer: {
      confidence_score: confidenceScore,
      confidence_tier: confidenceTier(confidenceScore),
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
    world_sim: simulationDigest || undefined,
    resolution_target: resolutionTarget || undefined,
    evaluation_eligible: Boolean(evaluationEligible),
    runtime_transport: safeText(runtimeTransport, "local"),
    rollout_bucket: rolloutBucket ? safeText(rolloutBucket) : undefined,
    calibration_snapshot: calibrationSnapshot || undefined,
    core_version: CRYSTAL_CORE_VERSION,
    _source: "crystal-core",
  };
}

function buildPendingRunCard({ runId, queryText, queryPlan = {}, visibility = "private", accessToken = null, pollAfterMs = 2500 }) {
  const domainId = resolveDomainId(queryPlan?.primary_domain_id || queryPlan?.domain_id || queryPlan?.domain || GENERAL_FORECAST_DOMAIN);
  const domainConfig = getDomain(domainId, GENERAL_FORECAST_DOMAIN);
  return {
    card_id: `pending_${runId}`,
    card_type: getDomainCardTypes(domainId)[0] || "forecast_band",
    canonical_card_type: getDomainCardTypes(domainId)[0] || "forecast_band",
    card_state: "limited",
    version_id: `run_${runId}`,
    domain: domainId,
    stakes_level: buildStakeLevel(domainId),
    risk_band: "high",
    title: "Crystal is running a deeper forecast",
    summary: "The deep prediction pipeline is still assembling the final card. Crystal will update this result as soon as the run closes.",
    verdict: `Deep run in progress for: ${safeText(queryText, domainConfig.short_label || "forecast")}`,
    primary_call: "",
    personal_output: "Stay on this screen. Crystal will replace this limited placeholder with the final forecast when the run completes.",
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

  return {
    naive_baseline: binaryFrame.asks_binary_question
      ? `${safeText(binaryFrame.question_side_a, "Primary")} / ${safeText(binaryFrame.question_side_b, "Alternative")} starts close to parity before evidence.`
      : "Without strong evidence, the naive baseline is mean reversion and slow change.",
    consensus_prediction: verifiedEvidencePack?.prediction_market_frame
      ? `Closest consensus reference leans ${primaryProbability >= 0.55 ? safeText(binaryFrame.question_side_a, "Primary") : safeText(binaryFrame.question_side_b, "Alternative")} at ${Math.round(
          primaryProbability * 100
        )}%.`
      : "No strong external consensus reference was available for this run.",
    delta_vs_consensus: verifiedEvidencePack?.prediction_market_frame ? "Crystal should explain where it diverges from external pricing." : "Consensus delta unavailable.",
    edge_claim:
      verifiedEvidencePack?.prediction_market_frame || verifiedEvidencePack?.live_signals?.length >= 2
        ? "Edge should come from variable selection, verified evidence quality, and disciplined calibration."
        : "Edge is constrained by thin live evidence in this run.",
  };
}

async function buildVerifiedEvidencePack(context, { runId, queryText, normalizedQuery, variableSelectionPack, engine }) {
  const { db, admin, llmRuntime, fetchJson, ai } = context;
  const domainConfig = getDomain(normalizedQuery.primary_domain_id, GENERAL_FORECAST_DOMAIN);
  const locationFocus = getPrimaryLocationFromPlan(normalizedQuery) || getPrimaryEntityLabel(normalizedQuery) || "global";
  const supportingDomains = Array.isArray(normalizedQuery.supporting_domains) ? normalizedQuery.supporting_domains.slice(0, 3) : [];

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
  const trendSignal = await fetchTrendSignal(queryText, normalizedQuery, domainConfig);
  if (trendSignal) {
    liveSignals.push(trendSignal);
  }

  const searchPayload = await fetchSearchSignals(ai, queryText, normalizedQuery, variableSelectionPack);
  liveSignals.push(...searchPayload.signals);

  let predictionMarketFrame = null;
  if (normalizedQuery?.binary_frame?.asks_binary_question) {
    try {
      predictionMarketFrame = await getPolymarketPulse({
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

  const sourceTrustMap = buildSourceTrustMap(searchPayload, liveSignals);
  const conflictMap = Array.isArray(searchPayload.conflict_map) ? searchPayload.conflict_map.slice(0, 4) : [];
  const missingnessMap = buildMissingnessMap({
    baseline: mainBaseline,
    liveSignals,
    predictionMarketFrame,
  });
  const sourceLedger = uniqueStrings(
    sourceTrustMap.map((item) => item.source_id).concat(Array.isArray(domainConfig.source_allowlist) ? domainConfig.source_allowlist : [])
  );

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
    selected_variables: Array.isArray(variableSelectionPack?.selected_variables) ? variableSelectionPack.selected_variables : [],
    adapter_activation_map: Array.isArray(variableSelectionPack?.adapter_activation_map) ? variableSelectionPack.adapter_activation_map : [],
    notes: uniqueStrings([
      mainBaseline ? "" : "The 20-year baseline was thin for this entity or geography.",
      liveSignals.length >= 2 ? "" : "Live evidence is still light for this run.",
      conflictMap.length > 0 ? "Active signal conflicts remain unresolved." : "",
    ]).slice(0, 4),
  };

  verifiedEvidencePack.evidence_quality = computeEvidenceQuality(verifiedEvidencePack, domainConfig, engine || "extended");
  await writeArtifact(db, admin, runId, "verified_evidence_pack", verifiedEvidencePack);
  return verifiedEvidencePack;
}

async function compileQueryEdge(context, queryText) {
  const { llmRuntime, withRetry } = context;
  const routingHints = buildRoutingHints(queryText);
  const payload = await withRetry(() =>
    llmRuntime.generateJson({
      modelKind: "query",
      temperature: 0,
      systemInstruction:
        "You convert a user question into a Crystal QueryPlan JSON object. Return JSON only. Choose a concrete domain whenever possible and preserve binary framing.",
      prompt: buildGenericQueryPlanPrompt(queryText, routingHints),
    })
  );

  return normalizeQueryPlanPayload(payload, {
    fallbackDomain: routingHints.primaryDomainId || GENERAL_FORECAST_DOMAIN,
    routingHints,
    queryText,
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
  const runtimeTransport = safeText(payload.runtimeTransport, "local");
  const rolloutBucket = safeText(payload.rolloutBucket);

  await writeRunPatch(db, admin, runId, {
    run_id: runId,
    status: "running",
    visibility,
    access_token: publicAccessToken,
    uid: payload.uid || null,
    source_view: safeText(payload.sourceView, "search"),
    query_text: queryText,
    query_plan: payload.queryPlan || null,
    user_context: payload.userContext || null,
    started_at: serverTimestamp(admin),
    current_stage: "orchestrator",
    engine,
    plan,
    runtime_transport: runtimeTransport,
    rollout_bucket: rolloutBucket || null,
    core_version: CRYSTAL_CORE_VERSION,
    core_runtime: CRYSTAL_CORE_VERSION,
  });
  await writeArtifact(db, admin, runId, "orchestrator_plan", {
    depth_mode: "deep",
    engine,
    plan,
    source_view: safeText(payload.sourceView, "search"),
  });

  try {
    let normalizedQuery = payload.queryPlan && typeof payload.queryPlan === "object" ? payload.queryPlan : null;
    if (!normalizedQuery || !safeText(normalizedQuery.primary_domain_id || normalizedQuery.domain_id || normalizedQuery.domain)) {
      await ensureRunActive(db, runId);
      normalizedQuery = await compileQueryEdge(context, queryText);
    }

    await writeRunPatch(db, admin, runId, {
      query_plan: normalizedQuery,
      current_stage: "query_domain_agent",
    });
    await writeArtifact(db, admin, runId, "normalized_query", normalizedQuery);

    await ensureRunActive(db, runId);
    const { research_plan, variable_selection_pack } = runContextualVariableSelection(normalizedQuery);
    await writeRunPatch(db, admin, runId, {
      current_stage: "research_planner_cvsa_agent",
      adapter_activation_map: variable_selection_pack.adapter_activation_map,
    });
    await writeArtifact(db, admin, runId, "research_plan", research_plan);
    await writeArtifact(db, admin, runId, "variable_selection_pack", variable_selection_pack);

    await ensureRunActive(db, runId);
    const verifiedEvidencePack = await buildVerifiedEvidencePack(context, {
      runId,
      queryText,
      normalizedQuery,
      variableSelectionPack: variable_selection_pack,
      engine,
    });
    const baselineConsensusPack = buildBaselineConsensusPack({
      verifiedEvidencePack,
      normalizedQuery,
    });
    await writeArtifact(db, admin, runId, "baseline_consensus_pack", baselineConsensusPack);

    await writeRunPatch(db, admin, runId, {
      current_stage: "dossier_prediction_agent",
    });
    await ensureRunActive(db, runId);
    const dossierPrediction = await withRetry(() =>
      llmRuntime.generateJson({
        modelKind: "forecast",
        temperature: 0.1,
        systemInstruction:
          "You are Crystal's Dossier and Prediction Agent. Return JSON only. Stay concrete, directional, and grounded in the supplied evidence.",
        prompt: buildDossierPredictionPrompt({
          queryText,
          normalizedQuery,
          researchPlan: research_plan,
          variableSelectionPack: variable_selection_pack,
          verifiedEvidencePack,
          baselineConsensusPack,
        }),
      })
    );
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
      await ensureRunActive(db, runId);
      simulationDigest = await getWorldSimDigest({
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
        sidecarBaseUrl: process.env.MIROFISH_BASE_URL || "",
        sidecarApiKey: process.env.MIROFISH_API_KEY || "",
      });
      simulationContract = buildMiroFishOutputContract(simulationDigest, simulationGate);
      await writeArtifact(db, admin, runId, "mirofish_output_contract", simulationContract);
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

    finalizedScorecard.scenario_set = rawPrediction.scenario_set;
    await writeArtifact(db, admin, runId, "calibration_snapshot", calibrationSnapshot);
    await writeArtifact(db, admin, runId, "fusion_scorecard", finalizedScorecard);

    await writeRunPatch(db, admin, runId, {
      current_stage: "card_generation",
      resolution_target: resolutionTarget,
      evaluation_eligible: evaluationEligible,
      resolution_status: evaluationEligible ? "pending" : "skipped",
    });
    const voicePayload = await withRetry(() =>
      llmRuntime.generateJson({
        modelKind: "forecast",
        temperature: 0.15,
        systemInstruction:
          "You write Crystal prediction cards. Return JSON only. Put the call first, keep the tone precise, and never hide the thesis behind vague uncertainty copy.",
        prompt: buildForecastVerbalizationPrompt({
          queryText,
          normalizedQuery,
          verifiedEvidencePack,
          scorecard: finalizedScorecard,
        }),
      })
    );
    await writeArtifact(db, admin, runId, "voice_payload", voicePayload);

    const card = buildFinalCard({
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
    (async function retry(fn, retries = 2, delayMs = 1200) {
      try {
        return await fn();
      } catch (error) {
        if (retries <= 0) throw error;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return retry(fn, retries - 1, delayMs);
      }
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
    compileQuery: (queryText) => compileQueryEdge(context, queryText),
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
        ],
      };
    },
  };
}

module.exports = {
  CRYSTAL_CORE_VERSION,
  createCrystalCoreRuntime,
};
