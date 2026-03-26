# Browser Pass Live - 2026-03-24

## Scope
- Environment: `https://omnicrystal.web.app`
- Rollout state during pass: `0/0`
- Capture method: Microsoft Edge headless screenshots with manual review
- Views checked:
  - desktop `1440x900`
  - laptop `1280x800`
  - mobile `430x932`
- Surfaces checked:
  - `/forecast`
  - `/forecast-gallery`
  - `/forecast-gallery/forecast/:slug`
  - `/gallery`
  - `/sim`

## Capture Notes
- Local captures were produced under `C:\Users\Fiorenza\OneDrive\Desktop\Codex\qa-captures\2026-03-24-repass`.
- Screenshots were intentionally kept out of git.
- A signed-in capture could not be produced from the local Edge profile in headless mode, so signed-in coverage is incomplete in this pass.

## Observed States
- `Forecast Gallery` rendered correctly on laptop and mobile guest captures, with correct primary nav and bottom nav.
- `Gallery` as guest rendered a clean sign-in gate with no dead-end CTA.
- `/sim` landed on the beta/sign-in gated surface, so the client-side redirect path is behaving as expected for guest access.
- `/forecast` stayed on the centered spinner in guest desktop/laptop captures, even with a `60s` virtual time budget.
- A public forecast detail page stayed on loading skeletons after `60s`, so detail-page completion still feels too fragile in this pass.

## Issue Matrix
| Priority | Surface | Issue | Status |
|---|---|---|---|
| P0 | Signed-in QA coverage | The signed-in browser pass could not be completed from this machine in headless mode, so save/follow flows and authenticated gallery behavior are not certified in this cycle. | Open blocker for `10%` readiness. |
| P1 | `/forecast` guest load | Forecast stayed on a centered spinner in desktop/laptop captures after `35-60s` for a prefilled query (`Bitcoin next 30 days`). | Open. |
| P1 | Public forecast detail load | `/forecast-gallery/forecast/:slug` remained on loading skeletons after `60s` on laptop capture. | Open. |
| P2 | Forecast Gallery loading | Gallery home renders, but the loading row and skeleton cards still dominate the first impression before content settles. | Accepted for now. |
| P2 | `/gallery` guest gate | Guest gate copy and CTA are clear and non-dead-ending. | Verified. |
| P2 | `/sim` perception | Redirect behavior is correct in-app, but this pass only verified the guest/gated outcome and not an authenticated beta landing. | Accepted for now. |

## Decisions
- This re-pass does **not** justify reopening the rollout to `10%`.
- No rollout change should be made from browser evidence alone because the pass is incomplete on signed-in coverage and still shows unresolved loading-state risk on `Forecast` and public forecast detail.
- The live recommendation after this pass is: **hold at `0/0`**.

## Addendum After Remote Hardening
- A later direct API parity rerun on 2026-03-24 turned green and produced a `10% ready` verdict from the binary benchmark itself.
- That technical milestone does **not** override this browser-pass blocker, because the signed-in visual pass is still uncertified from this machine.
- An additional attempt to reuse the local Edge profile in headless mode did not produce trustworthy signed-in captures, so authenticated `save/follow` flows remain unverified.
- Operational decision remains unchanged: **keep rollout at `0/0` until signed-in QA is certified.**

## Addendum on 2026-03-26
- Baseline re-check confirmed the live rollout is still `0/0` and `crystalCore.available = true`.
- The technical gate remains green: parity report still shows `remote max completed streak = 5`, `winner mismatch rate = 0`, `median probability delta = 0.02`, `missing binary contract rate = 0`, and `direct API 502 count = 0`.
- Cloud Run logs also confirm remote runs are completing through `dossier_prediction_agent`, `simulation_decision_gate`, and `card_generation`.
- The signed-in gate is still the blocker. The approved method for this cycle is a manual non-headless Edge pass with the live local profile, and that gate cannot be autonomously certified from this terminal-only workflow.
- End-of-day operational decision therefore remains: **hold at `0/0`**.

## Follow-Up
- Re-run the signed-in visual pass with a browser context that can actually reuse the authenticated session.
- Re-check `/forecast` and public forecast detail after the next visual QA cycle.
- Keep using `Forecast Gallery` as the clearest live surface; it is visually the strongest of the checked routes in this cycle.
