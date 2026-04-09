const { buildGenericDecisionKernel, normalizeReferenceSourceClass, resolveHighImpactFamily } = require("./decisionKernel");
const { getCapability, isCapabilityAllowed } = require("./capabilityRegistry");

const PASS_ORDER = [
  "grounding_pass",
  "reference_frame_pass",
  "semantic_evidence_pass",
  "mirofish_simulation_pass",
  "decision_pass",
  "evaluation_report_pass",
];

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function hasObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function inferTruthGrounded({ family = "", normalizedQuery = {}, evidenceBundle = {} } = {}) {
  if (family === "sports") {
    return evidenceBundle?.sports_grounding?.sports_grounded === true || evidenceBundle?.sports_grounding?.fixture_resolved === true;
  }
  return Boolean(
    evidenceBundle?.entity_resolution?.resolved === true ||
      evidenceBundle?.event_resolution?.resolved === true ||
      safeText(normalizedQuery?.binary_frame?.question_side_a) ||
      safeText(normalizedQuery?.binary_frame?.question_side_b)
  );
}

function inferReferenceSourceClass({ family = "", evidenceBundle = {}, sportsDecision = null } = {}) {
  if (family === "sports") {
    return normalizeReferenceSourceClass(
      sportsDecision?.market_source_class ||
        evidenceBundle?.sports_grounding?.sports_market_source_class ||
        evidenceBundle?.sports_market_overlay?.sports_market_source_class,
      "none"
    );
  }
  return normalizeReferenceSourceClass(
    evidenceBundle?.reference_frame?.source_class ||
      evidenceBundle?.market_structure?.reference_source_class ||
      (evidenceBundle?.prediction_market_frame ? "proxy" : "") ||
      (Array.isArray(evidenceBundle?.live_signals) && evidenceBundle.live_signals.some((signal) => safeText(signal?.source_id) === "google_trends")
        ? "retail"
        : ""),
    "none"
  );
}

function inferSemanticReady({ family = "", evidenceBundle = {} } = {}) {
  if (family === "sports") {
    return evidenceBundle?.sports_semantic_overlay?.ready === true || evidenceBundle?.sports_grounding?.semantic_ready === true;
  }
  return hasObject(evidenceBundle?.evidence_quality) || (Array.isArray(evidenceBundle?.source_ledger) && evidenceBundle.source_ledger.length > 0);
}

function inferMirofishEligibility({ truthGrounded = false, referenceSourceClass = "none" } = {}) {
  if (!truthGrounded) return false;
  return ["sharp", "proxy", "baseline"].includes(normalizeReferenceSourceClass(referenceSourceClass, "none"));
}

function buildPassStatus({ capabilityId, runtimeContext = "predict", family = "", truthGrounded = false, referenceSourceClass = "none", semanticReady = false, simulationDigest = null, decisionKernel = null } = {}) {
  const capability = getCapability(capabilityId);
  const allowed = isCapabilityAllowed(capabilityId, runtimeContext);

  let status = "skipped";
  let reason = "";

  switch (capabilityId) {
    case "grounding_pass":
      status = truthGrounded ? "ready" : "blocked";
      reason = truthGrounded ? "Grounded truth is available." : "Crystal still lacks a grounded fact frame.";
      break;
    case "reference_frame_pass":
      if (referenceSourceClass === "none") {
        status = truthGrounded ? "blocked" : "skipped";
        reason = "No usable external reference frame is available yet.";
      } else if (referenceSourceClass === "retail") {
        status = "degraded";
        reason = "Retail sentiment is visible, but it is not treated as reference truth.";
      } else {
        status = "ready";
        reason = `Reference frame is available via ${referenceSourceClass}.`;
      }
      break;
    case "semantic_evidence_pass":
      status = semanticReady ? "ready" : "blocked";
      reason = semanticReady ? "Semantic evidence is available." : "Semantic evidence is still thin or missing.";
      break;
    case "mirofish_simulation_pass": {
      const eligible = inferMirofishEligibility({ truthGrounded, referenceSourceClass });
      if (simulationDigest && typeof simulationDigest === "object") {
        status = "completed";
        reason = "Mirofish digest is already attached.";
      } else if (eligible) {
        status = "eligible";
        reason = "Grounding and usable reference quality are strong enough for Mirofish.";
      } else {
        status = truthGrounded ? "skipped" : "blocked";
        reason = truthGrounded
          ? "Simulation remains off until Crystal has a usable sharp/proxy/baseline reference frame."
          : "Simulation remains off until grounding is closed.";
      }
      break;
    }
    case "decision_pass":
      status = decisionKernel ? "ready" : "blocked";
      reason = decisionKernel
        ? `Decision state ${safeText(decisionKernel?.decision_state, "hold")} is available.`
        : "Decision kernel has not produced an actionability state yet.";
      break;
    case "evaluation_report_pass":
      status = runtimeContext === "background_eval" ? "ready" : "deferred";
      reason =
        runtimeContext === "background_eval"
          ? "Evaluation/report mode is allowed in this runtime context."
          : "Evaluation/report is deferred outside the background job context.";
      break;
    default:
      status = "skipped";
      reason = "No coordinator rule defined.";
      break;
  }

  if (!allowed) {
    status = "denied";
    reason = `Capability ${capabilityId} is not allowed in runtime context ${runtimeContext}.`;
  }

  return {
    capability_id: capabilityId,
    title: capability?.title || capabilityId,
    family,
    runtime_context: runtimeContext,
    allowed,
    allowed_runtime_contexts: Array.isArray(capability?.allowed_runtime_contexts)
      ? [...capability.allowed_runtime_contexts]
      : [],
    read_only: capability?.read_only === true,
    mutating: capability?.mutating === true,
    concurrency_safe: capability?.concurrency_safe === true,
    requires_grounding: capability?.requires_grounding === true,
    allowed_reference_source_classes: Array.isArray(capability?.allowed_reference_source_classes)
      ? [...capability.allowed_reference_source_classes]
      : [],
    preconditions: Array.isArray(capability?.preconditions) ? [...capability.preconditions] : [],
    timeout_class: safeText(capability?.timeout_class) || null,
    retry_policy: safeText(capability?.retry_policy) || null,
    side_effect_class: safeText(capability?.side_effect_class) || null,
    external_side_effect: capability?.external_side_effect === true,
    status,
    reason,
    handler_module: capability?.handler_module || null,
  };
}

function buildCoordinationTrace({
  domainId = "",
  normalizedQuery = {},
  evidenceBundle = {},
  simulationDigest = null,
  scorecard = {},
  sportsDecision = null,
  runtimeContext = "predict",
} = {}) {
  const family = resolveHighImpactFamily(domainId);
  if (!family) return null;

  const decisionKernel = buildGenericDecisionKernel({
    domainId,
    normalizedQuery,
    scorecard,
    evidenceBundle,
    simulationDigest,
    sportsDecision,
  });
  const truthGrounded = inferTruthGrounded({ family, normalizedQuery, evidenceBundle });
  const referenceSourceClass = inferReferenceSourceClass({ family, evidenceBundle, sportsDecision });
  const semanticReady = inferSemanticReady({ family, evidenceBundle });

  return {
    coordinator_mode: "internal_orchestration_core_v1",
    family,
    runtime_context: safeText(runtimeContext, "predict"),
    truth_grounded: truthGrounded,
    reference_source_class: referenceSourceClass,
    semantic_ready: semanticReady,
    decision_state: safeText(decisionKernel?.decision_state, "hold"),
    passes: PASS_ORDER.map((capabilityId) =>
      buildPassStatus({
        capabilityId,
        runtimeContext,
        family,
        truthGrounded,
        referenceSourceClass,
        semanticReady,
        simulationDigest,
        decisionKernel,
      })
    ),
  };
}

module.exports = {
  PASS_ORDER,
  buildCoordinationTrace,
  inferMirofishEligibility,
};
