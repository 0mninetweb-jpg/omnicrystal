# Week 4 Canary Decision - 2026-03-26

## Current Verdict
- Decision: **hold at `0/0`**
- Reason: Week 4 entry gate is now green, but the canary remains intentionally deferred until the cross-domain prediction quality sprint is complete.
- Program posture: the canary is now **explicitly deferred until after the 3-week cross-domain prediction quality sprint**, even if the Week 4 UX pass turns green earlier.

## Entry Gate Status
| Gate | Status | Notes |
|---|---|---|
| Sports parity closed | Green | TheSportsDB is live as the primary sports provider, parity is green, and `sports probe ready = true`. |
| FRED active in runtime | Green | `fred_api` is now configured live and reported as available in runtime health. |
| GTFS Rome First | Green | `gtfs_static` and `gtfs_realtime` are live with `feed_count = 1`. |
| Rollout frozen | Green | `/api/health` still shows `signed_in_percent = 0` and `guest_percent = 0`. |
| Policy benchmark | Green | `npm run check:policy-governance` passes with `A.0.general rate = 0`. |
| Markets benchmark | Green | `npm run check:markets-assets` passes with `A.0.general rate = 0`. |
| Signed-in QA | Green with note | Manual Edge re-test on 2026-03-28 certified the flow with no open P0/P1 and one accepted P2 data-cleanup issue. |

## Product Readiness Updates
- `/forecast` now fails closed into a readable hold state if a remote run stalls, instead of spinning forever.
- Public forecast discovery now uses timed fetches plus cache fallback, so `Forecast Gallery` and public forecast detail do not stay on loading skeletons indefinitely when Firestore is slow.
- Gallery and version surfaces now explain the save -> memory -> proof loop more clearly.
- A new cross-domain quality matrix now covers all **43 catalog domains** with one canonical row and one degraded row each. Baseline report: `docs/domain-quality-matrix-2026-03-26.md`.

## Manual QA Handoff
The signed-in browser pass has now been completed manually on this machine:
- Browser: Edge non-headless
- Profile: real authenticated local profile
- Capture path: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\qa-captures\week4`
- Completed routes:
  - `/forecast`
  - `/forecast-gallery`
  - one public forecast detail page
  - `/gallery`
  - `/sim -> /beta/world-sim`
- Completed scenarios:
  - guest `save/follow` gated correctly
  - signed-in `save`
  - signed-in `follow`
  - private Gallery usable
  - version/proof visible
  - no infinite loader
  - no infinite skeleton
- Manual QA outcome:
  - certified for release readiness
  - `0` open P0
  - `0` open P1
  - `1` accepted P2: corrupted stored topic/title text on one public forecast card

## Reopen Criteria
The rollout can move to `10/10` only if all of these turn green:
- no raw user-facing errors
- `3-5` remote runs complete consecutively
- parity report fully green
- signed-in QA certified
- no `P0` UX issues

## Immediate Next Steps
1. Keep the backend/runtime frozen as the Week 4 certified baseline.
2. Clean up the remaining P2 corrupted stored topic/title text in the public forecast layer.
3. Continue the 3-week prediction quality sprint on all 43 domains.
4. Reconsider the `10%` canary only after the sprint close-out report is green.
