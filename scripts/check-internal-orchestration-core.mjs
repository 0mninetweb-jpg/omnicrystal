import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const { listCapabilities, isCapabilityAllowed } = require("../functions/crystalCore/capabilityRegistry.js");
const { buildCoordinationTrace } = require("../functions/crystalCore/coordinator.js");
const { listIntrospectionResources, readIntrospectionResource } = require("../functions/crystalCore/introspectionMcp.js");

const capabilities = listCapabilities();
assert(capabilities.length >= 7, "Expected the internal capability registry to expose the phase-1 capabilities.");
assert.equal(isCapabilityAllowed("mirofish_simulation_pass", "predict"), true);
assert.equal(isCapabilityAllowed("evaluation_report_pass", "predict"), false);
assert.equal(isCapabilityAllowed("evaluation_report_pass", "background_eval"), true);
const mirofishCapability = capabilities.find((item) => item.capability_id === "mirofish_simulation_pass");
assert.deepEqual(mirofishCapability.allowed_runtime_contexts, ["predict"]);
assert(mirofishCapability.preconditions.includes("grounding_pass_ready"));
assert.equal(mirofishCapability.timeout_class, "long");
assert.equal(mirofishCapability.retry_policy, "remote_job_backoff");

const sportsTrace = buildCoordinationTrace({
  domainId: "A.29.sports_performance_and_outcomes",
  normalizedQuery: {
    primary_domain_id: "A.29.sports_performance_and_outcomes",
    question_side_a: "Inter",
    question_side_b: "Roma",
  },
  evidenceBundle: {
    sports_grounding: {
      fixture_resolved: true,
      sports_grounded: true,
      sports_market_source_class: "sharp",
      semantic_ready: true,
    },
    sports_market_overlay: {
      sports_market_source_class: "sharp",
    },
    sports_semantic_overlay: {
      ready: true,
    },
  },
  scorecard: {
    decision_state: "no_action",
  },
  sportsDecision: {
    decision_state: "no_bet",
    market_source_class: "sharp",
  },
  runtimeContext: "predict",
});

assert.equal(sportsTrace.family, "sports");
assert.equal(sportsTrace.truth_grounded, true);
assert.equal(sportsTrace.reference_source_class, "sharp");
const mirofishPass = sportsTrace.passes.find((item) => item.capability_id === "mirofish_simulation_pass");
assert.equal(mirofishPass?.status, "eligible");
assert(mirofishPass?.allowed_reference_source_classes?.includes("sharp"));
assert(mirofishPass?.preconditions?.includes("reference_frame_usable"));

const resources = listIntrospectionResources();
assert(resources.some((resource) => resource.id === "sports-probe-latest"));
assert(resources.some((resource) => resource.id === "runtime-health"));
assert(resources.some((resource) => resource.id === "forecast-runs-failed"));
assert(resources.some((resource) => resource.id === "provider-runtime-health-drift"));

const capabilitiesResource = await readIntrospectionResource("capabilities", {
  docsDir: path.join(repoRoot, "docs"),
  runtimeHealth: { ok: true },
  db: {},
});
assert.equal(capabilitiesResource.payload.capability_count, capabilities.length);

const sportsProbeResource = await readIntrospectionResource("sports-probe-latest", {
  docsDir: path.join(repoRoot, "docs"),
  runtimeHealth: { ok: true },
  db: {},
});
assert(["available", "missing"].includes(sportsProbeResource.payload.status));

const failedRunsResource = await readIntrospectionResource("forecast-runs-failed", {
  docsDir: path.join(repoRoot, "docs"),
  runtimeHealth: { ok: true },
  db: {},
});
assert.equal(Array.isArray(failedRunsResource.payload.recent_failed), true);

const driftResource = await readIntrospectionResource("provider-runtime-health-drift", {
  docsDir: path.join(repoRoot, "docs"),
  runtimeHealth: {
    api: { available: false },
    crystal_core: { available: true },
  },
  db: {},
});
assert.equal(Array.isArray(driftResource.payload.drift_flags), true);
assert(driftResource.payload.provider_foundation_snapshot);
assert(driftResource.payload.closeout_snapshot);

console.log("check-internal-orchestration-core: ok");
