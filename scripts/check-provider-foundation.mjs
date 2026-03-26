import assert from "node:assert/strict";
import { runProviderFoundationBenchmark } from "./provider-foundation-benchmark.mjs";

const { summary } = await runProviderFoundationBenchmark();

assert(summary.total_cases >= 6, `Expected at least 6 provider foundation cases, got ${summary.total_cases}`);
assert(summary.source_coverage_failures === 0, `Expected zero provider-foundation source coverage failures, got ${summary.source_coverage_failures}`);
assert(summary.location_structure_failures === 0, `Expected zero location structure failures, got ${summary.location_structure_failures}`);
assert(summary.mobility_structure_failures === 0, `Expected zero mobility structure failures, got ${summary.mobility_structure_failures}`);
assert(summary.public_data_structure_failures === 0, `Expected zero public data structure failures, got ${summary.public_data_structure_failures}`);
assert(summary.synthetic_smoke_verdict === "connector-ready", `Expected connector-ready synthetic smoke verdict, got ${summary.synthetic_smoke_verdict}`);

console.log(
  `Provider foundation smoke passed on ${summary.total_cases} cases with runtime_config_verdict=${summary.runtime_config_verdict} and blockers=${summary.runtime_config_blocker_count}.`
);
