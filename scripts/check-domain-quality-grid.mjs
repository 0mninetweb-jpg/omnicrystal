import assert from "node:assert/strict";
import { runDomainQualityMatrix } from "./domain-quality-matrix.mjs";

const report = await runDomainQualityMatrix();
const summary = report.summary;

assert.equal(summary.total_domains, 43, `Expected 43 domains in the matrix, got ${summary.total_domains}`);
assert.equal(summary.total_rows, 86, `Expected 86 matrix rows, got ${summary.total_rows}`);
assert.equal(summary.silent_general_fallback_count, 0, `Expected no silent A.0 fallbacks, got ${summary.silent_general_fallback_count}`);
assert(summary.top1_hit_rate >= 0.5, `Expected top-1 routing hit rate >= 0.5, got ${summary.top1_hit_rate}`);
assert(summary.top3_miss_count <= 18, `Expected top-3 miss count <= 18 during sprint bootstrap, got ${summary.top3_miss_count}`);
assert(summary.week1_baseline?.date === "2026-03-28", `Expected fixed Week 1 baseline metadata, got ${summary.week1_baseline?.date}`);
assert(typeof summary.provider_gap_domain_count === "number", "Expected provider_gap_domain_count summary metric.");
assert(typeof summary.quality_follow_up_domain_count === "number", "Expected quality_follow_up_domain_count summary metric.");
assert(typeof summary.thin_evidence_coverage_count === "number", "Expected thin_evidence_coverage_count summary metric.");
assert(typeof summary.edge_publishable_count === "number", "Expected edge_publishable_count summary metric.");
assert(typeof summary.edge_quality_follow_up_count === "number", "Expected edge_quality_follow_up_count summary metric.");
assert(typeof summary.edge_top1_hit_rate === "number", "Expected edge_top1_hit_rate summary metric.");
assert(typeof summary.edge_thin_evidence_coverage_count === "number", "Expected edge_thin_evidence_coverage_count summary metric.");
assert(typeof summary.edge_thin_signal_convergence_count === "number", "Expected edge_thin_signal_convergence_count summary metric.");
assert(typeof summary.edge_directional_signal_not_publish_ready_count === "number", "Expected edge_directional_signal_not_publish_ready_count summary metric.");
assert(typeof summary.edge_provider_required_no_pick_count === "number", "Expected edge_provider_required_no_pick_count summary metric.");
assert(summary.batch3_baseline?.date === "2026-03-28", `Expected fixed Batch 3 baseline metadata, got ${summary.batch3_baseline?.date}`);
assert(typeof summary.batch3_gate_verdict === "string", "Expected batch3_gate_verdict summary metric.");
assert(summary.week2_baseline?.date === "2026-03-28", `Expected fixed Week 2 baseline metadata, got ${summary.week2_baseline?.date}`);
assert(typeof summary.week2_gate_verdict === "string", "Expected week2_gate_verdict summary metric.");
assert(summary.week3_baseline?.date === "2026-03-28", `Expected fixed Week 3 baseline metadata, got ${summary.week3_baseline?.date}`);
assert(typeof summary.week3_gate_verdict === "string", "Expected week3_gate_verdict summary metric.");
assert(Array.isArray(report.cluster_summary?.by_cluster), "Expected cluster_summary.by_cluster array.");
assert(Array.isArray(report.cluster_summary?.week2_focus_rows), "Expected cluster_summary.week2_focus_rows array.");
assert(Array.isArray(report.cluster_summary?.week3_focus_rows), "Expected cluster_summary.week3_focus_rows array.");
assert.equal(report.domains.length, 43, `Expected explicit domain coverage for all domains, got ${report.domains.length}`);
for (const domain of report.domains) {
  assert.equal(domain.rows.length, 2, `Expected canonical + edge rows for ${domain.domain_id}, got ${domain.rows.length}`);
  for (const row of domain.rows) {
    assert.ok(row.cluster, `Expected cluster tag on ${row.domain_id}/${row.variant}`);
    assert.ok(row.gating?.row_state, `Expected gating.row_state on ${row.domain_id}/${row.variant}`);
    assert.ok(row.gating?.action_recommendation, `Expected gating.action_recommendation on ${row.domain_id}/${row.variant}`);
    assert.ok(Array.isArray(row.provider_requirement_map?.provider_states), `Expected provider state map on ${row.domain_id}/${row.variant}`);
    assert.ok(row.quality?.quality_verdict, `Expected quality verdict on ${row.domain_id}/${row.variant}`);
    assert.equal(typeof row.week3_focus, "boolean", `Expected week3_focus boolean on ${row.domain_id}/${row.variant}`);
    if (row.quality?.blocker_reason === "thin_evidence_coverage") {
      assert.ok(row.quality?.still_thin_reason, `Expected still_thin_reason on ${row.domain_id}/${row.variant}`);
    }
    if (row.quality?.decision_ready_state) {
      assert.equal(typeof row.quality?.decision_blocker_reason, "string", `Expected decision_blocker_reason string on ${row.domain_id}/${row.variant}`);
    }
  }
}

console.log(
  `Domain quality grid passed with verdict=${summary.verdict}, batch2_gate_verdict=${summary.batch2_gate_verdict}, batch3_gate_verdict=${summary.batch3_gate_verdict}, week2_gate_verdict=${summary.week2_gate_verdict}, week3_gate_verdict=${summary.week3_gate_verdict}, top1_hit_rate=${summary.top1_hit_rate}, edge_top1_hit_rate=${summary.edge_top1_hit_rate}, top3_miss_count=${summary.top3_miss_count}, ready_domain_count=${summary.ready_domain_count}.`
);
