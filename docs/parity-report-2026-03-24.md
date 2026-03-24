# Direct API Parity Report - 2026-03-24

## Summary
- Local API base: `https://api-paaqyfwena-ew.a.run.app`
- Remote service: `https://crystal-core-paaqyfwena-ew.a.run.app`
- Remote max completed streak: `2`
- Binary comparable pairs: `0`
- Winner mismatch rate: `n/a`
- Median probability delta: `n/a`
- Missing binary contract rate: `1`
- Direct API 502 count: `0`
- Verdict: **hold at 0/0**

## Benchmark
| Query | Local | Remote | Local domain | Remote domain | Local winner | Remote winner | Local band | Remote band | Delta |
|---|---|---|---|---|---|---|---|---|---|
| Cosa passera al referendum costituzionale di marzo in Italia? si o no | completed | failed | A.24.governance_policy_and_public_timeline |  | No |  | lean |  |  |
| Inter vs Juventus | completed | completed | A.0.general.general_forecast | A.0.general.general_forecast |  |  |  |  |  |
| Bitcoin next 30 days | completed | completed | A.23.markets_and_asset_regimes | A.23.markets_and_asset_regimes |  |  |  |  |  |
| La mia startup sopravvivera 12 mesi? | completed | running | A.22.industry_and_business_cycles |  |  |  |  |  |  |
| Dovrei aspettare prima di affittare a Roma? | completed | failed | A.0.general.general_forecast |  |  |  |  |  |  |

## Interpretation
- The direct API path was cleaner than the Hosting rewrite path: no repeated `502` surfaced during this run.
- Remote execution is still not stable enough for canary traffic. It failed on the referendum, timed out on startup survival, and failed again on the Rome renting query.
- Binary parity could not be certified because the run produced **zero** binary pairs with a comparable contract on both sides.
- Local output quality is ahead of the remote dark runtime on this benchmark, but local parity is also not yet where we want it for `Inter vs Juventus` and `Dovrei aspettare prima di affittare a Roma?`.

## Blockers
- remote failed: `Cosa passera al referendum costituzionale di marzo in Italia? si o no`
- remote timeout: `La mia startup sopravvivera 12 mesi?`
- remote failed: `Dovrei aspettare prima di affittare a Roma?`
- binary parity unavailable on benchmark
- median probability delta unavailable
- missing binary contract on binary benchmark
- fewer than `3` consecutive remote completions
