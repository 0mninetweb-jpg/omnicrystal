const HIGH_IMPACT_FAMILY_MAP = {
  "A.23.markets_and_asset_regimes": "markets",
  "A.24.governance_policy_and_public_timeline": "governance",
  "A.25.geopolitics_and_conflict_dynamics": "geopolitics",
  "A.29.sports_performance_and_outcomes": "sports",
  "B.3.5.business_idea_outcomes": "business",
  "B.3.6.sports_outcomes_probability_mode": "sports",
  "B.3.8.personal_decisions_and_tradeoffs": "personal",
};

const DECISION_STATES = ["hold", "grounded_lean", "no_action", "lean", "edge"];
const REFERENCE_SOURCE_CLASSES = ["sharp", "proxy", "retail", "baseline", "none"];

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num > 1) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function roundMaybe(value, digits = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(digits));
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function normalizeDecisionState(value = "", fallback = "hold") {
  const normalized = safeText(value, fallback).toLowerCase();
  return DECISION_STATES.includes(normalized) ? normalized : fallback;
}

function normalizeReferenceSourceClass(value = "", fallback = "none") {
  const normalized = safeText(value, fallback).toLowerCase();
  return REFERENCE_SOURCE_CLASSES.includes(normalized) ? normalized : fallback;
}

function resolveHighImpactFamily(domainId = "") {
  const normalized = safeText(domainId);
  return HIGH_IMPACT_FAMILY_MAP[normalized] || "";
}

function isHighImpactPredictiveDomain(domainId = "") {
  return Boolean(resolveHighImpactFamily(domainId));
}

function inferTruthGrounded({ domainId = "", normalizedQuery = {}, evidenceBundle = {} } = {}) {
  const family = resolveHighImpactFamily(domainId);
  if (!family) return false;
  if (family === "sports") {
    return evidenceBundle?.sports_grounding?.sports_grounded === true || evidenceBundle?.sports_grounding?.fixture_resolved === true;
  }
  const entityResolved = evidenceBundle?.entity_resolution?.resolved === true;
  const eventResolved = evidenceBundle?.event_resolution?.resolved === true;
  const hasLiveSignals = Array.isArray(evidenceBundle?.live_signals) && evidenceBundle.live_signals.length > 0;
  const hasBaseline = Boolean(safeText(evidenceBundle?.historical_baseline_20y));
  const hasBinaryFrame = Boolean(
    safeText(normalizedQuery?.binary_frame?.question_side_a) && safeText(normalizedQuery?.binary_frame?.question_side_b)
  );
  const hasPredictionMarketFrame = Boolean(evidenceBundle?.prediction_market_frame);
  return entityResolved || eventResolved || hasPredictionMarketFrame || (hasLiveSignals && hasBaseline) || hasBinaryFrame;
}

function deriveReferenceFrame({ domainId = "", evidenceBundle = {}, simulationDigest = null, scorecard = {} } = {}) {
  const family = resolveHighImpactFamily(domainId);
  const predictionMarketFrame = evidenceBundle?.prediction_market_frame || simulationDigest?.prediction_market_frame || null;
  const marketStructure = evidenceBundle?.market_structure || {};
  const consensusReference = marketStructure?.consensus_reference || null;
  const regimeRiskSignal = marketStructure?.regime_risk_signal || null;
  const explicitReferenceFrame =
    (evidenceBundle?.reference_frame && typeof evidenceBundle.reference_frame === "object" ? evidenceBundle.reference_frame : null) ||
    (scorecard?.reference_frame && typeof scorecard.reference_frame === "object" ? scorecard.reference_frame : null);
  const retailSignal = Array.isArray(evidenceBundle?.live_signals)
    ? evidenceBundle.live_signals.find((signal) => safeText(signal?.source_id) === "google_trends")
    : null;

  if (family === "sports") {
    return {
      reference_source_class: normalizeReferenceSourceClass(
        evidenceBundle?.sports_grounding?.sports_market_source_class || evidenceBundle?.sports_market_overlay?.sports_market_source_class,
        "none"
      ),
      reference_probability: null,
      reference_source: safeText(
        evidenceBundle?.sports_grounding?.sports_market_source || evidenceBundle?.sports_market_overlay?.sports_market_source,
        "none"
      ),
      reference_note: safeText(evidenceBundle?.sports_market_overlay?.sportsbook_readiness_state),
    };
  }

  if (explicitReferenceFrame) {
    const explicitProbability = [
      explicitReferenceFrame?.reference_probability,
      explicitReferenceFrame?.probability,
      explicitReferenceFrame?.implied_probability,
      explicitReferenceFrame?.prior_probability,
    ]
      .map((item) => Number(item))
      .find(Number.isFinite);
    return {
      reference_source_class: normalizeReferenceSourceClass(explicitReferenceFrame?.source_class, "none"),
      reference_probability: Number.isFinite(explicitProbability) ? clamp01(explicitProbability, null) : null,
      reference_source: safeText(explicitReferenceFrame?.source, safeText(explicitReferenceFrame?.label, "reference_frame")),
      reference_note: safeText(explicitReferenceFrame?.note || explicitReferenceFrame?.summary),
    };
  }

  if (predictionMarketFrame) {
    const referenceProbability = [
      predictionMarketFrame?.calibrated_probability,
      predictionMarketFrame?.implied_probability,
      predictionMarketFrame?.prior_probability,
    ]
      .map((item) => Number(item))
      .find(Number.isFinite);
    return {
      reference_source_class: "proxy",
      reference_probability: Number.isFinite(referenceProbability) ? clamp01(referenceProbability, null) : null,
      reference_source: safeText(predictionMarketFrame?.reference_market, "prediction_market"),
      reference_note: safeText(predictionMarketFrame?.resolution_criteria || predictionMarketFrame?.market_question),
    };
  }

  if (consensusReference || regimeRiskSignal) {
    return {
      reference_source_class: "baseline",
      reference_probability: null,
      reference_source: safeText(consensusReference?.source_id || regimeRiskSignal?.source_id, "baseline"),
      reference_note: safeText(consensusReference?.summary || regimeRiskSignal?.summary),
    };
  }

  if (retailSignal) {
    return {
      reference_source_class: "retail",
      reference_probability: null,
      reference_source: "google_trends",
      reference_note: safeText(retailSignal?.summary, "Retail sentiment signal only."),
    };
  }

  return {
    reference_source_class: "none",
    reference_probability: null,
    reference_source: "none",
    reference_note: "",
  };
}

function deriveModelProbability({ scorecard = {}, evidenceBundle = {}, sportsDecision = null } = {}) {
  const directModelProbability = Number(scorecard?.model_probability);
  if (Number.isFinite(directModelProbability)) return clamp01(directModelProbability, null);
  if (sportsDecision?.model_probabilities?.favorite_probability != null) {
    return clamp01(sportsDecision.model_probabilities.favorite_probability, null);
  }
  const binaryProbability = Number(scorecard?.binary_contract?.winning_probability);
  if (Number.isFinite(binaryProbability)) return clamp01(binaryProbability, null);
  const splitProbability = Number(scorecard?.probability_split?.primary_probability);
  if (Number.isFinite(splitProbability)) return clamp01(splitProbability, null);
  const marketFrameProbability = Number(
    evidenceBundle?.prediction_market_frame?.crystal_probability ?? evidenceBundle?.prediction_market_frame?.calibrated_probability
  );
  if (Number.isFinite(marketFrameProbability)) return clamp01(marketFrameProbability, null);
  return null;
}

function deriveReferenceProbability({ referenceFrame = {}, sportsDecision = null } = {}) {
  if (sportsDecision?.market_probabilities?.favorite_probability != null) {
    return clamp01(sportsDecision.market_probabilities.favorite_probability, null);
  }
  const rawProbability = referenceFrame?.reference_probability;
  if (rawProbability == null || rawProbability === "") return null;
  const probability = Number(rawProbability);
  return Number.isFinite(probability) ? clamp01(probability, null) : null;
}

function deriveFragilityScore({ evidenceBundle = {}, simulationDigest = null, sportsDecision = null } = {}) {
  if (sportsDecision?.fragility_score != null) {
    return roundMaybe(clamp01(sportsDecision.fragility_score, 0), 3);
  }
  const evidenceQuality = evidenceBundle?.evidence_quality || {};
  const conflictScore = clamp01(evidenceQuality?.conflict_score, 0.22);
  const freshnessPressure = 1 - clamp01(evidenceQuality?.freshness_score, 0.58);
  const agreementPressure = 1 - clamp01(evidenceQuality?.agreement_score, 0.6);
  const graphPressure = simulationDigest
    ? 1 - clamp01((Number(simulationDigest?.quality_score) + Number(simulationDigest?.graph_coverage) + Number(simulationDigest?.agent_convergence)) / 3, 0.58)
    : 0.24;
  return roundMaybe(
    clamp01(conflictScore * 0.38 + freshnessPressure * 0.18 + agreementPressure * 0.18 + graphPressure * 0.26, 0.34),
    3
  );
}

function deriveSimulationConfidence({ simulationDigest = null, sportsDecision = null } = {}) {
  if (sportsDecision?.simulation_confidence != null) {
    return roundMaybe(clamp01(sportsDecision.simulation_confidence, 0), 3);
  }
  if (!simulationDigest) return null;
  return roundMaybe(
    clamp01(
      Number(simulationDigest?.quality_score || 0) * 0.42 +
        Number(simulationDigest?.graph_coverage || 0) * 0.3 +
        Number(simulationDigest?.agent_convergence || 0) * 0.28,
      0
    ),
    3
  );
}

function buildFlipConditions({ scorecard = {}, sportsDecision = null, simulationDigest = null } = {}) {
  return uniqueStrings(
    []
      .concat(Array.isArray(scorecard?.invalidators) ? scorecard.invalidators : [])
      .concat(Array.isArray(sportsDecision?.flip_conditions) ? sportsDecision.flip_conditions : [])
      .concat(Array.isArray(simulationDigest?.intervention_points) ? simulationDigest.intervention_points : [])
  ).slice(0, 4);
}

function buildSportsKernel({ evidenceBundle = {}, sportsDecision = null } = {}) {
  const decisionState = safeText(sportsDecision?.decision_state);
  const mappedState = decisionState === "no_bet" ? "no_action" : normalizeDecisionState(decisionState, "hold");
  return {
    decision_state: mappedState,
    decision_reason: safeText(sportsDecision?.decision_reason),
    no_action_reason: decisionState === "no_bet" ? safeText(sportsDecision?.no_bet_reason) : "",
    reference_source_class: normalizeReferenceSourceClass(
      evidenceBundle?.sports_grounding?.sports_market_source_class || evidenceBundle?.sports_market_overlay?.sports_market_source_class,
      "none"
    ),
    reference_probability: deriveReferenceProbability({ sportsDecision }),
    edge_delta: roundMaybe(sportsDecision?.edge_delta?.best_delta, 3),
    fragility_score: deriveFragilityScore({ sportsDecision }),
    flip_conditions: buildFlipConditions({ sportsDecision }),
    simulation_confidence: deriveSimulationConfidence({ sportsDecision }),
    model_probability: deriveModelProbability({ sportsDecision }),
    reference_source: safeText(
      evidenceBundle?.sports_grounding?.sports_market_source || evidenceBundle?.sports_market_overlay?.sports_market_source,
      "none"
    ),
  };
}

function buildGenericDecisionKernel({
  domainId = "",
  normalizedQuery = {},
  scorecard = {},
  evidenceBundle = {},
  simulationDigest = null,
  sportsDecision = null,
} = {}) {
  const family = resolveHighImpactFamily(domainId);
  if (!family) return null;
  if (family === "sports" && sportsDecision) {
    return buildSportsKernel({ evidenceBundle, sportsDecision });
  }

  const truthGrounded = inferTruthGrounded({ domainId, normalizedQuery, evidenceBundle });
  const referenceFrame = deriveReferenceFrame({ domainId, evidenceBundle, simulationDigest, scorecard });
  const referenceSourceClass = normalizeReferenceSourceClass(referenceFrame.reference_source_class, "none");
  const modelProbability = deriveModelProbability({ scorecard, evidenceBundle, sportsDecision: null });
  const referenceProbability = deriveReferenceProbability({ referenceFrame });
  const simulationConfidence = deriveSimulationConfidence({ simulationDigest });
  const fragilityScore = deriveFragilityScore({ evidenceBundle, simulationDigest });
  const edgeDelta =
    Number.isFinite(modelProbability) && Number.isFinite(referenceProbability)
      ? roundMaybe(modelProbability - referenceProbability, 3)
      : null;
  const absoluteDelta = Math.abs(Number(edgeDelta || 0));
  const flipConditions = buildFlipConditions({ scorecard, simulationDigest });

  let decisionState = "hold";
  let decisionReason = "";
  let noActionReason = "";

  if (!truthGrounded) {
    decisionState = "hold";
    decisionReason = "Crystal still needs a grounded fact frame before it can turn this into an actionable edge read.";
  } else if (!Number.isFinite(modelProbability)) {
    decisionState = "grounded_lean";
    decisionReason = "Crystal has the context grounded, but it still lacks a stable model probability for a cleaner action state.";
  } else if (referenceSourceClass === "none") {
    decisionState = "grounded_lean";
    decisionReason = "Crystal has a grounded directional read, but it is still missing a usable reference frame to price the call.";
  } else if (referenceSourceClass === "retail") {
    decisionState = "no_action";
    noActionReason = "Retail sentiment is visible, but Crystal does not treat hype as a reliable reference price.";
    decisionReason = noActionReason;
  } else if (referenceSourceClass === "proxy") {
    if (absoluteDelta >= 0.05 && fragilityScore < 0.42 && Number(simulationConfidence || 0) >= 0.66) {
      decisionState = "lean";
      decisionReason = "Crystal sees a meaningful delta versus the proxy consensus, but it still stops short of a full edge without sharper reference truth.";
    } else {
      decisionState = "no_action";
      noActionReason =
        absoluteDelta >= 0.03
          ? "Crystal sees some separation from proxy consensus, but not enough to clear a disciplined edge threshold."
          : "The current consensus proxy already prices most of the directional read.";
      decisionReason = noActionReason;
    }
  } else if (referenceSourceClass === "baseline") {
    if (absoluteDelta >= 0.06 && fragilityScore < 0.46 && Number(simulationConfidence || 0) >= 0.6) {
      decisionState = "lean";
      decisionReason = "Crystal sees a real differential versus the baseline, but the baseline frame is still not strong enough to justify an edge call.";
    } else {
      decisionState = "no_action";
      noActionReason =
        absoluteDelta >= 0.03
          ? "Crystal tilts away from the baseline, but the differential is still too thin or fragile for action."
          : "The baseline already captures most of the current directional case.";
      decisionReason = noActionReason;
    }
  } else {
    if (absoluteDelta >= 0.05 && fragilityScore < 0.46 && Number(simulationConfidence || 0) >= 0.6) {
      decisionState = "edge";
      decisionReason = "Crystal sees a disciplined edge after comparing its model probability with the external reference frame.";
    } else if (absoluteDelta >= 0.03 && fragilityScore < 0.56) {
      decisionState = "lean";
      decisionReason = "Crystal sees a modest edge-like differential, but not enough quality to call it a full edge.";
    } else {
      decisionState = "no_action";
      noActionReason = "The current reference frame already prices this read too tightly for a clean edge.";
      decisionReason = noActionReason;
    }
  }

  return {
    decision_state: normalizeDecisionState(decisionState, "hold"),
    decision_reason: decisionReason,
    no_action_reason: noActionReason || null,
    reference_source_class: referenceSourceClass,
    reference_probability: Number.isFinite(referenceProbability) ? referenceProbability : null,
    edge_delta: Number.isFinite(edgeDelta) ? edgeDelta : null,
    fragility_score: Number.isFinite(fragilityScore) ? fragilityScore : null,
    flip_conditions: flipConditions.length ? flipConditions : null,
    simulation_confidence: Number.isFinite(Number(simulationConfidence)) ? Number(simulationConfidence) : null,
    model_probability: Number.isFinite(modelProbability) ? modelProbability : null,
    reference_source: safeText(referenceFrame.reference_source, "none"),
    reference_note: safeText(referenceFrame.reference_note),
    family,
  };
}

module.exports = {
  DECISION_STATES,
  HIGH_IMPACT_FAMILY_MAP,
  REFERENCE_SOURCE_CLASSES,
  buildGenericDecisionKernel,
  isHighImpactPredictiveDomain,
  normalizeDecisionState,
  normalizeReferenceSourceClass,
  resolveHighImpactFamily,
};
