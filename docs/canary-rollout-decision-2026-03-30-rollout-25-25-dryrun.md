# Canary Rollout Decision - 2026-03-30

## Current Verdict
- Requested stage: **rollout-25-25**
- Target rollout: **25/25**
- Action taken: **hold**
- Requested apply: False

## Gate Snapshot
| Gate | Status | Notes |
|---|---|---|
| phase_a_closeout_green | Green | Latest close-out: C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\phase-a-closeout-2026-03-30.json |
| domain_matrix_green | Green | Latest matrix: C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\domain-quality-matrix-2026-03-30.json |
| parity_green | Green | Latest parity: C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\parity-report-2026-03-24.json |
| health_green | Green | Live /api/health reachable and crystal core available. |
| sports_parity_green | Green | Sports catalog/provider still available in live health. |
| signed_in_qa_certified | Green | QA gate from latest phase close-out. |
| current_rollout_stage_ok | Blocked | Current rollout stage: canary-10-0; expected previous stage: canary-10-10. |
| window_requirement_met | Blocked | Elapsed since current rollout change: 3.85 h; required: 24 h. |
| total_request_threshold | Blocked | Total remote completed runs: 39; required: 40. |
| guest_request_presence | Green | Guest remote completed runs in window: 39. |
| health_spot_checks | Green | Healthy spot checks supplied: 3. |
| manual_smoke | Blocked | Manual smoke flag supplied: False. |
| no_raw_errors | Blocked | No raw user-facing errors flag supplied: False. |
| no_p0_ux | Blocked | No P0 flag supplied: False. |
| guest_gating_ok | Blocked | Guest gating flag supplied: False. |

## Evidence Snapshot
- Latest phase close-out: C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\phase-a-closeout-2026-03-30.json
- Latest domain matrix: C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\domain-quality-matrix-2026-03-30.json
- Latest parity report: C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\parity-report-2026-03-24.json
- Latest provider foundation report: C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\provider-foundation-report-2026-03-30.json
- Remote completed runs in window: 39
- Remote completed signed-in runs: 0
- Remote completed guest runs: 39
- Remote pending runs: 0
- Remote fallback runs: 0
- Window start: 2026-03-29T16:25:14.533Z
- Healthy spot checks supplied: 3
- Manual smoke supplied: False
- Guest gating supplied: False
- No raw errors supplied: False
- No P0 supplied: False
- No P1 systemic supplied: False

## Live Health Before
- Crystal Core available: True
- Base URL: https://crystal-core-paaqyfwena-ew.a.run.app
- Rollout signed-in percent: 10
- Rollout guest percent: 0
- Sports available: True
- Sports provider configured: True
- Health fetch error: 

## Live Health After
- Not applied in this run.

## Stage Recommendation
- Current stage target: **Promote to 25/25**
- Next stage after this one: **rollout-50-50**
- Rollout stays deterministic because the Firestore config preserves the existing salt.
- The old Week 4 canary doc remains historical; this decision report supersedes it operationally.
