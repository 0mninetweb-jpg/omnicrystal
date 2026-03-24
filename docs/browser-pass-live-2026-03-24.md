# Browser Pass Live - 2026-03-24

## Scope
- Environment: `https://omnicrystal.web.app`
- Views checked:
  - desktop `1440x900`
  - laptop `1280x800`
  - mobile `390x844`
  - mobile `430x932`
- Surfaces checked:
  - `/forecast`
  - `/forecast-gallery`
  - `/forecast-gallery/forecast/:slug`
  - `/gallery`
  - `/sim`

## Capture Notes
- Local captures were produced during the pass under `C:\Users\Fiorenza\OneDrive\Desktop\Codex\qa-captures`.
- They were used for review but are intentionally not committed to the repository.

## Issue Matrix
| Priority | Surface | Issue | Status |
|---|---|---|---|
| P1 | Mobile primary nav | `Forecast Gallery` label wrapped poorly and clipped on narrow widths. | Fixed in this cycle. |
| P1 | Public forecast loading | Public forecast pages felt blank and over-indexed on a single spinner during data fetch. | Fixed in this cycle. |
| P1 | Forecast Gallery loading | Gallery/entity/topic/best-calls loading states reused empty-state UI and felt like missing content instead of loading content. | Fixed in this cycle. |
| P2 | `/sim` route perception | Hosting returns `200` on `/sim` because SPA shell loads first; the real redirect remains client-side. | Accepted for now; route map is correct in app code. |

## Decisions
- No `P0` blockers were found in the guest/public surface during this pass.
- The rollout can stay at `10%` while parity and binary quality work continues.
- Another visual pass should happen after local/remote parity hardening to verify that pending, binary cards, and guest gating still feel clean on mobile.
