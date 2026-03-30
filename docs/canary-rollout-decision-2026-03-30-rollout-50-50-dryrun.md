# Canary Rollout Decision - 2026-03-30

## Current Verdict
- Requested stage: **rollout-50-50**
- Target rollout: **50/50**
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
| current_rollout_stage_ok | Blocked | Current rollout stage: canary-10-0; expected previous stage: rollout-25-25. |
| window_requirement_met | Blocked | Elapsed since current rollout change: 4.41 h; required: 48 h. |
| total_request_threshold | Blocked | Total remote completed runs: 62; required: 100. |
| health_spot_checks | Green | Healthy spot checks supplied: 3. |
| manual_smoke | Green | Manual smoke flag supplied: True. |
| no_raw_errors | Green | No raw user-facing errors flag supplied: True. |
| no_p0_ux | Green | No P0 flag supplied: True. |
| no_p1_systemic | Green | No P1 systemic flag supplied: True. |

## Evidence Snapshot
- Latest phase close-out: C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\phase-a-closeout-2026-03-30.json
- Latest domain matrix: C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\domain-quality-matrix-2026-03-30.json
- Latest parity report: C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\parity-report-2026-03-24.json
- Latest provider foundation report: C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\provider-foundation-report-2026-03-30.json
- Remote completed runs in window: 62
- Remote completed signed-in runs: 0
- Remote completed guest runs: 62
- Remote pending runs: 0
- Remote fallback runs: 0
- Window start: 2026-03-28T16:58:45.426Z
- Healthy spot checks supplied: 3
- Manual smoke supplied: True
- Guest gating supplied: False
- No raw errors supplied: True
- No P0 supplied: True
- No P1 systemic supplied: True

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
- Current stage target: **Promote to 50/50**
- Next stage after this one: **rollout-100-100**
- Rollout stays deterministic because the Firestore config preserves the existing salt.
- The old Week 4 canary doc remains historical; this decision report supersedes it operationally.
