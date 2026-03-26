import assert from "node:assert/strict";
import { runMarketsAssetsBenchmark } from "./markets-assets-benchmark.mjs";

const { summary } = await runMarketsAssetsBenchmark();

assert(summary.total_cases >= 10, `Expected at least 10 markets cases, got ${summary.total_cases}`);
assert(summary.general_fallback_rate < 0.1, `Expected A.0.general fallback rate < 0.1, got ${summary.general_fallback_rate}`);
assert(summary.markets_adapter_missing_count === 0, `Expected markets adapter coverage on all cases, got ${summary.markets_adapter_missing_count}`);
assert(summary.source_coverage_failures === 0, `Expected zero required source failures, got ${summary.source_coverage_failures}`);
assert(summary.market_structure_failures === 0, `Expected complete market_structure on all cases, got ${summary.market_structure_failures}`);
assert(summary.missing_binary_contract_count === 0, `Expected zero missing binary contracts on binary markets cases, got ${summary.missing_binary_contract_count}`);
assert(summary.ambiguous_winner_count === 0, `Expected zero ambiguous winners, got ${summary.ambiguous_winner_count}`);
assert(summary.split_inconsistency_count === 0, `Expected zero split inconsistencies, got ${summary.split_inconsistency_count}`);
assert(summary.contradictory_call_count === 0, `Expected zero contradictory binary calls, got ${summary.contradictory_call_count}`);

console.log(
  `Markets/assets benchmark passed on ${summary.total_cases} cases with verdict=${summary.verdict} and A.0.general rate=${summary.general_fallback_rate}.`
);
