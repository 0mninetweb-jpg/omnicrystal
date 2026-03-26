import assert from "node:assert/strict";
import { runPolicyGovernanceBenchmark } from "./policy-governance-benchmark.mjs";

const report = await runPolicyGovernanceBenchmark();
const summary = report.summary;

assert(summary.total_cases >= 10, `Expected at least 10 policy cases, got ${summary.total_cases}`);
assert(summary.general_fallback_rate < 0.1, `Expected A.0.general fallback rate < 0.1, got ${summary.general_fallback_rate}`);
assert.equal(summary.top3_miss_count, 0, `Expected policy top-3 coverage to stay clean, got ${summary.top3_miss_count} misses`);
assert.equal(summary.policy_adapter_missing_count, 0, `Expected policy_risk adapter on every policy case, got ${summary.policy_adapter_missing_count} misses`);
assert.equal(summary.missing_metadata_count, 0, `Expected all required policy metadata fields, got ${summary.missing_metadata_count} incomplete cases`);
assert.equal(summary.source_coverage_failures, 0, `Expected required policy sources on every case, got ${summary.source_coverage_failures} failures`);
assert.equal(summary.missing_binary_contract_count, 0, `Expected no missing binary contract on policy binary cases, got ${summary.missing_binary_contract_count}`);
assert.equal(summary.ambiguous_winner_count, 0, `Expected no ambiguous binary winners, got ${summary.ambiguous_winner_count}`);
assert.equal(summary.split_inconsistency_count, 0, `Expected no split inconsistencies, got ${summary.split_inconsistency_count}`);

console.log(
  `Policy/governance benchmark passed on ${summary.total_cases} cases with verdict=${summary.verdict} and A.0.general rate=${summary.general_fallback_rate}.`
);
