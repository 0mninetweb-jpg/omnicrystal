# Phase A Close-Out - 2026-04-02

## Current Verdict
- Phase A verdict: **phase_a_blocked**
- Rollout decision: **hold at 0/0**
- Deploy requested in this run: `False`

## Entry Gate Snapshot
| Gate | Status | Notes |
|---|---|---|
| TheSportsDB primary selected | Green | SPORTS_PROVIDER is set to thesportsdb and the free tier can ground sports without a private key. |
| FRED_API_KEY present in env | Green | FRED_API_KEY is present in functions/.env.omnicrystal. |
| Sports parity closed | Blocked | probe_artifact=C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\sports-probe-2026-04-02.json, winner_mismatch_rate=0, missing_binary_contract_rate=1, a29_ready=False, b36_ready=False |
| Sports calibration artifact | Blocked | status=unavailable, sample_size=0, brier_score=, log_loss=, no_bet_rate= |
| TheSportsDB active in runtime | Green | status=available, configured=True, available=True |
| FRED active in runtime | Green | status=available, configured=True, available=True |
| GTFS Rome First | Green | gtfs_static feed_count=1, gtfs_realtime feed_count=1 |
| Policy benchmark | Green | verdict=policy-ready, general_fallback_rate=0 |
| Markets benchmark | Green | verdict=markets-ready, optional_source_missing_count=3 |
| Runtime checks | Blocked | One or more hard automated checks failed. See step table below. |
| Rollout frozen | Blocked | Live health unavailable. |
| Signed-in QA handoff | Green | Week 4 signed-in QA is already certified in the canary decision report; keep the canary frozen until the sprint closes. |

## Automated Steps
| Step | Status | Exit | Notes |
|---|---|---|---|
| check:prediction-core | passed | 0 |  > react-example@0.0.0 check:prediction-core > node scripts/check-prediction-core.mjs  Prediction core benchmark passed on 125 routing cases. Synthetic scorecard check passed wi... |
| check:policy-governance | passed | 0 |  > react-example@0.0.0 check:policy-governance > node scripts/check-policy-governance.mjs  Policy/governance benchmark passed on 10 cases with verdict=policy-ready and A.0.gener... |
| report:policy-governance | passed | 0 |  > react-example@0.0.0 report:policy-governance > node scripts/run-policy-quality-report.mjs  Policy quality report written to C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-r... |
| check:markets-assets | passed | 0 |  > react-example@0.0.0 check:markets-assets > node scripts/check-markets-assets.mjs  Markets/assets benchmark passed on 11 cases with verdict=markets-ready and A.0.general rate=0. |
| report:markets-assets | passed | 0 |  > react-example@0.0.0 report:markets-assets > node scripts/run-markets-quality-report.mjs  Markets quality report written to C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-re... |
| check:provider-foundation | passed | 0 |  > react-example@0.0.0 check:provider-foundation > node scripts/check-provider-foundation.mjs  [dotenv@17.3.1] injecting env (39) from functions\.env.omnicrystal -- tip: 🤖 agen... |
| report:provider-foundation | passed | 0 |  > react-example@0.0.0 report:provider-foundation > node scripts/run-provider-foundation-report.mjs  [dotenv@17.3.1] injecting env (39) from functions\.env.omnicrystal -- tip: ⚙... |
| check:domain-quality-grid | passed | 0 |  > react-example@0.0.0 check:domain-quality-grid > node scripts/check-domain-quality-grid.mjs  [dotenv@17.3.1] injecting env (39) from functions\.env.omnicrystal -- tip: ⚙️  loa... |
| parity:direct-api | passed | 0 | Parity report written to C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\parity-report-2026-03-24.md Parity JSON written to C:\Users\Fiorenza\OneDrive\Desktop\... |
| report:sports-calibration | failed | 1 |   "summary": {     "sample_size": 0,     "brier_score": null,     "log_loss": null,     "favorite_vs_edge_confusion_rate": null,     "no_bet_rate": null,     "upset_recall": nul... |
| report:domain-quality-grid | passed | 0 |  > react-example@0.0.0 report:domain-quality-grid > node scripts/run-domain-quality-report.mjs  [dotenv@17.3.1] injecting env (39) from functions\.env.omnicrystal -- tip: ⚙️  wr... |

## Runtime Baseline
- Crystal Core base URL: `unavailable`
- Crystal Core available: `False`
- Sports configured: `False`
- Sports available: `False`
- TheSportsDB state: `available`
- FRED state: `available`
- GTFS static feed count: `1`
- GTFS realtime feed count: `1`
- OpenAQ state: `config_missing`

## Report Baselines
- Parity report: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\parity-report-2026-03-24.md`
- Policy report: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\policy-quality-report-2026-04-02.md`
- Markets report: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\markets-quality-report-2026-04-02.md`
- Provider foundation report: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\provider-foundation-report-2026-04-02.md`
- Domain quality matrix: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\crystal-review-0316\docs\domain-quality-matrix-2026-04-02.md`

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
- Technical Phase A entry gate is still blocked. Keep rollout at `0/0` and do not advance to canary discussion.
- Sports parity now evaluates dated fixtures through the TheSportsDB live backbone; generic rivalry queries remain regression checks for grounded holds.
