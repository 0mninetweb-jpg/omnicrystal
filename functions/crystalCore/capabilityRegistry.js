const PHASE1_FAMILIES = ["sports", "markets", "governance", "geopolitics", "business", "personal"];

const CAPABILITY_DEFINITIONS = [
  {
    capability_id: "grounding_pass",
    title: "Grounding Pass",
    domain_families: PHASE1_FAMILIES,
    allowed_runtime_contexts: ["predict", "public_predict"],
    read_only: true,
    mutating: false,
    concurrency_safe: true,
    requires_grounding: false,
    allowed_reference_source_classes: ["none", "sharp", "proxy", "retail", "baseline"],
    preconditions: [],
    timeout_class: "fast",
    retry_policy: "none",
    side_effect_class: "read_only",
    handler_module: "./coordinator",
    external_side_effect: false,
  },
  {
    capability_id: "reference_frame_pass",
    title: "Reference Frame Pass",
    domain_families: PHASE1_FAMILIES,
    allowed_runtime_contexts: ["predict", "public_predict"],
    read_only: true,
    mutating: false,
    concurrency_safe: true,
    requires_grounding: false,
    allowed_reference_source_classes: ["sharp", "proxy", "retail", "baseline", "none"],
    preconditions: ["grounding_pass_attempted"],
    timeout_class: "fast",
    retry_policy: "idempotent_backoff",
    side_effect_class: "read_only",
    handler_module: "./coordinator",
    external_side_effect: false,
  },
  {
    capability_id: "semantic_evidence_pass",
    title: "Semantic Evidence Pass",
    domain_families: PHASE1_FAMILIES,
    allowed_runtime_contexts: ["predict", "public_predict"],
    read_only: true,
    mutating: false,
    concurrency_safe: true,
    requires_grounding: false,
    allowed_reference_source_classes: ["sharp", "proxy", "retail", "baseline", "none"],
    preconditions: ["grounding_pass_attempted", "reference_frame_pass_attempted"],
    timeout_class: "standard",
    retry_policy: "idempotent_backoff",
    side_effect_class: "read_only",
    handler_module: "./coordinator",
    external_side_effect: false,
  },
  {
    capability_id: "mirofish_simulation_pass",
    title: "Mirofish Simulation Pass",
    domain_families: PHASE1_FAMILIES,
    allowed_runtime_contexts: ["predict"],
    read_only: true,
    mutating: false,
    concurrency_safe: false,
    requires_grounding: true,
    allowed_reference_source_classes: ["sharp", "proxy", "baseline"],
    preconditions: ["grounding_pass_ready", "reference_frame_usable", "semantic_evidence_pass_attempted"],
    timeout_class: "long",
    retry_policy: "remote_job_backoff",
    side_effect_class: "remote_compute",
    handler_module: "./simulationFusion",
    external_side_effect: true,
  },
  {
    capability_id: "decision_pass",
    title: "Decision Pass",
    domain_families: PHASE1_FAMILIES,
    allowed_runtime_contexts: ["predict", "public_predict"],
    read_only: true,
    mutating: false,
    concurrency_safe: true,
    requires_grounding: false,
    allowed_reference_source_classes: ["sharp", "proxy", "retail", "baseline", "none"],
    preconditions: ["grounding_pass_attempted", "reference_frame_pass_attempted", "semantic_evidence_pass_attempted"],
    timeout_class: "fast",
    retry_policy: "none",
    side_effect_class: "read_only",
    handler_module: "./decisionKernel",
    external_side_effect: false,
  },
  {
    capability_id: "evaluation_report_pass",
    title: "Evaluation and Report Pass",
    domain_families: PHASE1_FAMILIES,
    allowed_runtime_contexts: ["background_eval"],
    read_only: false,
    mutating: true,
    concurrency_safe: false,
    requires_grounding: false,
    allowed_reference_source_classes: ["sharp", "proxy", "retail", "baseline", "none"],
    preconditions: ["decision_pass_persisted_or_resolution_due"],
    timeout_class: "long",
    retry_policy: "idempotent_backoff",
    side_effect_class: "firestore_write",
    handler_module: "./evaluation",
    external_side_effect: true,
  },
  {
    capability_id: "introspection_read_pass",
    title: "Read-only Introspection Pass",
    domain_families: PHASE1_FAMILIES,
    allowed_runtime_contexts: ["background_eval", "introspection", "health"],
    read_only: true,
    mutating: false,
    concurrency_safe: true,
    requires_grounding: false,
    allowed_reference_source_classes: ["sharp", "proxy", "retail", "baseline", "none"],
    preconditions: [],
    timeout_class: "fast",
    retry_policy: "idempotent_backoff",
    side_effect_class: "read_only",
    handler_module: "./introspectionMcp",
    external_side_effect: false,
  },
];

const CAPABILITY_RUNTIME_ALLOWLISTS = {
  predict: ["grounding_pass", "reference_frame_pass", "semantic_evidence_pass", "mirofish_simulation_pass", "decision_pass"],
  public_predict: ["grounding_pass", "reference_frame_pass", "semantic_evidence_pass", "decision_pass"],
  background_eval: ["evaluation_report_pass", "introspection_read_pass"],
  introspection: ["introspection_read_pass"],
  health: ["introspection_read_pass"],
};

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeRuntimeContext(runtimeContext = "predict") {
  return safeText(runtimeContext, "predict").toLowerCase();
}

function listCapabilities() {
  return CAPABILITY_DEFINITIONS.map((definition) => ({
    ...definition,
    domain_families: [...definition.domain_families],
    allowed_runtime_contexts: [...definition.allowed_runtime_contexts],
    allowed_reference_source_classes: [...definition.allowed_reference_source_classes],
    preconditions: [...definition.preconditions],
  }));
}

function getCapability(capabilityId = "") {
  const normalized = safeText(capabilityId);
  return listCapabilities().find((definition) => definition.capability_id === normalized) || null;
}

function listCapabilityIdsForRuntime(runtimeContext = "predict") {
  const normalized = normalizeRuntimeContext(runtimeContext);
  return [...(CAPABILITY_RUNTIME_ALLOWLISTS[normalized] || [])];
}

function isCapabilityAllowed(capabilityId = "", runtimeContext = "predict") {
  const capability = getCapability(capabilityId);
  if (!capability) return false;
  const allowlist = listCapabilityIdsForRuntime(runtimeContext);
  return allowlist.includes(capability.capability_id);
}

module.exports = {
  CAPABILITY_RUNTIME_ALLOWLISTS,
  CAPABILITY_DEFINITIONS,
  PHASE1_FAMILIES,
  getCapability,
  isCapabilityAllowed,
  listCapabilities,
  listCapabilityIdsForRuntime,
  normalizeRuntimeContext,
};
