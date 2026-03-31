# Phase A Close-Out - 2026-03-31

## Current Verdict
- Phase A verdict: **phase_a_ready_for_sprint_baseline**
- Rollout decision: **canary live at 10/0; promote only through the canary rollout runbook**
- Deploy requested in this run: `False`

## Entry Gate Snapshot
| Gate | Status | Notes |
|---|---|---|
| TheSportsDB primary selected | Green | SPORTS_PROVIDER is set to thesportsdb and the free tier can ground sports without a private key. |
| FRED_API_KEY present in env | Green | FRED_API_KEY is present in functions/.env.omnicrystal. |
| Sports parity closed | Green | winner_mismatch_rate=0, missing_binary_contract_rate=0, a29_ready=True, b36_ready=True |
| TheSportsDB active in runtime | Green | status=available, configured=True, available=True |
| FRED active in runtime | Green | status=available, configured=True, available=True |
| GTFS Rome First | Green | gtfs_static feed_count=1, gtfs_realtime feed_count=1 |
| Policy benchmark | Green | verdict=policy-ready, general_fallback_rate=0 |
| Markets benchmark | Green | verdict=markets-ready, optional_source_missing_count=3 |
| Runtime checks | Green | All hard automated checks passed; parity:direct-api soft-failed on a DNS probe while live health and the stored parity report remained green. |
| Rollout frozen | Info | Canary is live at 10/0 and is now governed by the rollout runbook rather than the frozen-baseline rule. |
| Signed-in QA handoff | Green | Week 4 signed-in QA is already certified in the canary decision report; keep the canary frozen until the sprint closes. |

## Automated Steps
| Step | Status | Exit | Notes |
|---|---|---|---|
| check:prediction-core | passed | 0 |  > react-example@0.0.0 check:prediction-core > node scripts/check-prediction-core.mjs  Prediction core benchmark passed on 125 routing cases. Synthetic scorecard check passed wi... |
| check:policy-governance | passed | 0 |  > react-example@0.0.0 check:policy-governance > node scripts/check-policy-governance.mjs  Policy/governance benchmark passed on 10 cases with verdict=policy-ready and A.0.gener... |
| report:policy-governance | passed | 0 |  > react-example@0.0.0 report:policy-governance > node scripts/run-policy-quality-report.mjs  Policy quality report written to C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-r... |
| check:markets-assets | passed | 0 |  > react-example@0.0.0 check:markets-assets > node scripts/check-markets-assets.mjs  Markets/assets benchmark passed on 11 cases with verdict=markets-ready and A.0.general rate=0. |
| report:markets-assets | passed | 0 |  > react-example@0.0.0 report:markets-assets > node scripts/run-markets-quality-report.mjs  Markets quality report written to C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-re... |
| check:provider-foundation | passed | 0 |  > react-example@0.0.0 check:provider-foundation > node scripts/check-provider-foundation.mjs  [dotenv@17.3.1] injecting env (39) from functions\.env.omnicrystal -- tip: 🔐 prev... |
| report:provider-foundation | passed | 0 |  > react-example@0.0.0 report:provider-foundation > node scripts/run-provider-foundation-report.mjs  [dotenv@17.3.1] injecting env (39) from functions\.env.omnicrystal -- tip: �... |
| check:domain-quality-grid | passed | 0 |  > react-example@0.0.0 check:domain-quality-grid > node scripts/check-domain-quality-grid.mjs  [dotenv@17.3.1] injecting env (39) from functions\.env.omnicrystal -- tip: 🛡️ aut... |
| report:domain-quality-grid | passed | 0 |  > react-example@0.0.0 report:domain-quality-grid > node scripts/run-domain-quality-report.mjs  [dotenv@17.3.1] injecting env (39) from functions\.env.omnicrystal -- tip: 🤖 age... |
| parity:direct-api | failed | 1 | powershell : Invoke-RestMethod :   In C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\scripts\run-phase-a-closeout.ps1:219 car:3  +   powershell -ExecutionPolicy By... |

## Runtime Baseline
- Crystal Core base URL: `https://crystal-core-paaqyfwena-ew.a.run.app`
- Crystal Core available: `True`
- Sports configured: `True`
- Sports available: `True`
- TheSportsDB state: `available`
- FRED state: `available`
- GTFS static feed count: `1`
- GTFS realtime feed count: `1`
- OpenAQ state: `config_missing`

## Report Baselines
- Parity report: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\parity-report-2026-03-24.md`
- Policy report: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\policy-quality-report-2026-03-31.md`
- Markets report: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\markets-quality-report-2026-03-31.md`
- Provider foundation report: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\provider-foundation-report-2026-03-31.md`
- Domain quality matrix: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\domain-quality-matrix-2026-03-31.md`

## Manual QA Handoff
- Signed-in QA status: `certified`
- Browser: Edge non-headless
- Profile: real authenticated local profile
- Capture path: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\qa-captures\week4`
- Required routes:
  - `/forecast`
  - `/forecast-gallery`
  - one public forecast detail page
  - `/gallery`
  - `/sim -> /beta/world-sim`
- Required checks:
  - guest `save/follow` gating
  - signed-in `save`
  - signed-in `follow`
  - useful private Gallery
  - version/proof visible
  - no infinite loader
  - no infinite skeleton

```powershell
$capturePath = 'C:\Users\Fiorenza\OneDrive\Desktop\Codex\qa-captures\week4'
New-Item -ItemType Directory -Force -Path $capturePath | Out-Null
$urls = @(
  'https://omnicrystal.web.app/forecast',
  'https://omnicrystal.web.app/forecast-gallery',
  'https://omnicrystal.web.app/gallery',
  'https://omnicrystal.web.app/sim'
)
foreach ($url in $urls) { Start-Process "microsoft-edge:$url" }
```

## Final Close-Out Command
Use this to rerun the full close-out after any new backend/runtime change:

```powershell
cd C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316
powershell -ExecutionPolicy Bypass -File scripts/run-phase-a-closeout.ps1 -Deploy
```

## Notes
- Technical Phase A baseline is green and signed-in QA is already certified. Canary is already live and should now be governed by the rollout runbook gates.
