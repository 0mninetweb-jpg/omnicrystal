# Week 4 Canary Decision - 2026-03-26

## Current Verdict
- Decision: **hold at `0/0`**
- Reason: Week 4 entry gate is not fully green yet, so the product can be improved and certified further, but the canary is not earned today.

## Entry Gate Status
| Gate | Status | Notes |
|---|---|---|
| Sports parity closed | Blocked | `sports probe ready = false` and `missing binary contract rate = 0.25` remain blocked until `API_FOOTBALL_KEY` is configured live. |
| FRED active in runtime | Blocked | `fred_api` is still `config_missing` in live health and foundation reporting. |
| GTFS Rome First | Green | `gtfs_static` and `gtfs_realtime` are live with `feed_count = 1`. |
| Rollout frozen | Green | `/api/health` still shows `signed_in_percent = 0` and `guest_percent = 0`. |
| Policy benchmark | Green | `npm run check:policy-governance` passes with `A.0.general rate = 0`. |
| Markets benchmark | Green | `npm run check:markets-assets` passes with `A.0.general rate = 0`. |

## Product Readiness Updates
- `/forecast` now fails closed into a readable hold state if a remote run stalls, instead of spinning forever.
- Public forecast discovery now uses timed fetches plus cache fallback, so `Forecast Gallery` and public forecast detail do not stay on loading skeletons indefinitely when Firestore is slow.
- Gallery and version surfaces now explain the save -> memory -> proof loop more clearly.

## Manual QA Handoff
The signed-in browser pass is still required and must be performed manually on this machine:
- Browser: Edge non-headless
- Profile: real authenticated local profile
- Capture path: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\qa-captures\week4`
- Required routes:
  - `/forecast`
  - `/forecast-gallery`
  - one public forecast detail page
  - `/gallery`
  - `/sim -> /beta/world-sim`
- Required scenarios:
  - guest `save/follow` gated correctly
  - signed-in `save`
  - signed-in `follow`
  - private Gallery usable
  - version/proof visible
  - no infinite loader
  - no infinite skeleton

## Reopen Criteria
The rollout can move to `10/10` only if all of these turn green:
- no raw user-facing errors
- `3-5` remote runs complete consecutively
- parity report fully green
- signed-in QA certified
- no `P0` UX issues

## Immediate Next Steps
1. Configure `API_FOOTBALL_KEY` in the dark runtime and rerun sports parity.
2. Configure `FRED_API_KEY` in the dark runtime and rerun provider foundation reporting.
3. Execute the signed-in manual QA pass and update the browser report.
4. Re-run parity, provider health, and final Week 4 decision.
