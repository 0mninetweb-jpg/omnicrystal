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
const JSON_STAGE_MAX_TOKENS = {
  planner: 768,
  dossier: 1400,
  verbalizer: 900,
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
    probability_split: scorecard?.probability_split || null,
    key_drivers: normalizeTextList(scorecard?.key_drivers, 4),
    counter_signals: normalizeTextList(scorecard?.counter_signals, 4),
    invalidators: normalizeTextList(scorecard?.invalidators, 4),
    historical_anchors: normalizeTextList(scorecard?.historical_anchors, 4),
    publication_basis: {
      reasons: normalizeTextList(scorecard?.publication_basis?.reasons, 3),
      notes: normalizeTextList(scorecard?.publication_basis?.notes, 4),
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
      probability_split:
        rawPrediction?.probability_split && typeof rawPrediction.probability_split === "object"
          ? rawPrediction.probability_split
          : null,
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
  const fallbackWhatToWatch = normalizeTextList(options?.scorecard?.invalidators, 4);
  const fallbackConfidence = Array.isArray(options?.verifiedEvidencePack?.missingness_map)
    ? options.verifiedEvidencePack.missingness_map.map((item) => safeText(item).replace(/_/g, " ")).filter(Boolean).slice(0, 4)
    : [];
  const fallbackCoverage = uniqueStrings(
    normalizeTextList(options?.scorecard?.publication_basis?.notes, 4).concat(
      Array.isArray(options?.verifiedEvidencePack?.conflict_map)
        ? options.verifiedEvidencePack.conflict_map.map((item) => safeText(item?.note || item?.issue))
        : []
    )
  ).slice(0, 4);

  return {
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
      : fallbackCoverage,
  };
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
  const questionSideA = normalizedIntentShape === "binary_outcome" ? safeText(mergedPayload?.question_side_a) : "";
  const questionSideB = normalizedIntentShape === "binary_outcome" ? safeText(mergedPayload?.question_side_b) : "";

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
  const candidateLines = compactCandidateDomains(routingHints?.candidateDomains)
    .map((candidate) => `- ${candidate.domain_id} (${candidate.score})`)
    .join("\n");

  return `Query: "${safeText(queryText)}"
Preferred domain: ${safeText(routingHints.primaryDomainId, GENERAL_FORECAST_DOMAIN)}
Intent hint: ${safeText(routingHints.intentShape, "directional_range")}
Resolution frame hint: ${safeText(routingHints.resolutionFrame, "trend")}
Binary side A: ${safeText(routingHints?.binaryFrame?.question_side_a)}
Binary side B: ${safeText(routingHints?.binaryFrame?.question_side_b)}
Supporting domains: ${Array.isArray(routingHints?.supportingDomains) ? routingHints.supportingDomains.slice(0, 3).join(", ") : ""}
Candidate domains:
${candidateLines || "- none"}

Return one JSON object only with keys:
primary_domain_id, intent_shape, resolution_frame, mode, question_side_a, question_side_b.

Rules:
- Choose a concrete domain whenever possible.
- Use ${GENERAL_FORECAST_DOMAIN} only as a last resort.
- Leave question_side_a and question_side_b empty unless the question is clearly binary.
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

  return `Query: "${safeText(queryText)}"
Domain: ${safeText(normalizedQuery?.primary_domain_id)}
Intent: ${safeText(normalizedQuery?.intent_shape)}
Resolution frame: ${safeText(normalizedQuery?.resolution_frame)}
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

Return one JSON object only with keys:
structured_dossier, raw_prediction.

Rules:
- Publish a directional thesis when evidence has orientation.
- Keep structured_dossier compact.
- raw_prediction must include primary_call, confidence_score, key_drivers, counter_signals, invalidators, historical_anchors, why_this_side, recommended_posture.
- If the question is binary, include probability_split with explicit side labels.
- No markdown. No commentary. No wrapper keys.`;
}

function buildForecastVerbalizationPrompt({ queryText, normalizedQuery, verifiedEvidencePack, scorecard }) {
  const compactScorecard = compactScorecardForPrompt(scorecard);
  const entityLabels = Array.isArray(normalizedQuery?.entities)
    ? normalizedQuery.entities.map((entity) => safeText(entity?.label)).filter(Boolean).slice(0, 4)
    : [];

  return `Query: "${safeText(queryText)}"
Domain: ${safeText(normalizedQuery?.primary_domain_id)}
Intent: ${safeText(normalizedQuery?.intent_shape)}
Resolution frame: ${safeText(normalizedQuery?.resolution_frame)}
Entities: ${entityLabels.join(", ")}
Call: ${safeText(compactScorecard.primary_call)}
Publication state: ${safeText(compactScorecard.publication_state, "limited")}
Confidence: ${clamp01(compactScorecard.confidence_score, 0.5)}
Probability split: ${JSON.stringify(compactScorecard.probability_split || null)}
Drivers: ${compactScorecard.key_drivers.join("; ")}
Counter signals: ${compactScorecard.counter_signals.join("; ")}
Invalidators: ${compactScorecard.invalidators.join("; ")}
Historical anchors: ${compactScorecard.historical_anchors.join("; ")}
Trust note: ${safeText(verifiedEvidencePack?.verification_summary)}
Coverage notes: ${normalizeTextList(compactScorecard.publication_basis?.notes, 4).join("; ")}

Return one JSON object only with keys:
title, summary, verdict, recommended_action.

Rules:
- State the call first.
- Keep every field short, precise, and product-like.
- If the state is limited, keep the thesis and put the caution in summary or coverage_notes.
- No markdown. No commentary. No wrapper keys.`;
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
        "You convert a user question into a Crystal QueryPlan JSON object. Return exactly one JSON object, choose a concrete domain whenever possible, preserve binary framing, and never return markdown or prose.",
      prompt: buildGenericQueryPlanPrompt(queryText, routingHints),
      maxTokens: JSON_STAGE_MAX_TOKENS.planner,
      jsonStage: "planner",
      preferTextMode: true,
    })
  );

  return normalizePlannerStagePayload(payload, {
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
    const dossierPredictionPayload = await withRetry(() =>
      llmRuntime.generateJson({
        modelKind: "forecast",
        temperature: 0.1,
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
      })
    );
    const dossierPrediction = normalizeDossierStagePayload(dossierPredictionPayload, {
      baselineConsensusPack,
      variableSelectionPack: variable_selection_pack,
    });
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
    const voicePayloadRaw = await withRetry(() =>
      llmRuntime.generateJson({
        modelKind: "forecast",
        temperature: 0.15,
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
      })
    );
    const voicePayload = normalizeVerbalizerStagePayload(voicePayloadRaw, {
      scorecard: finalizedScorecard,
      verifiedEvidencePack,
    });
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
  },
};
