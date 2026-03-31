# Direct API Parity Report - 2026-03-24

## Summary
- Local API base: `https://api-paaqyfwena-ew.a.run.app`
- Remote service: `https://crystal-core-paaqyfwena-ew.a.run.app`
- Remote max completed streak: `7`
- Binary comparable pairs: `5`
- Winner mismatch rate: `0`
- Median probability delta: `0`
- Missing binary contract rate: `0`
- Direct API 502 count: `0`
- Sports probe ready: `True`
- Sports semantic ready: `False`
- Sports publish gate ready: `False`
- Sports market overlay available: `False`
- Sports pick state: ``
- Sportsbook readiness state: `forecast_context_only`
- Sports probability probe ready: `True`
- Sports probability pick state: ``
- Sports probability readiness state: `probability_mode_preview`
- Verdict: **10% ready**

## Benchmark
| Query | Local | Remote | Local domain | Remote domain | Local winner | Remote winner | Local band | Remote band | Delta |
|---|---|---|---|---|---|---|---|---|---|
| Cosa passera al referendum costituzionale di marzo in Italia? si o no | completed | completed | A.24.governance_policy_and_public_timeline | A.24.governance_policy_and_public_timeline | No | No | limited | limited | 0.03 |
| Inter Milan vs Roma 2026-04-05 | completed | completed | A.29.sports_performance_and_outcomes | A.29.sports_performance_and_outcomes | Roma | Roma | limited | limited | 0 |
| Will Inter Milan beat Roma on 2026-04-05? | completed | completed | B.3.6.sports_outcomes_probability_mode | B.3.6.sports_outcomes_probability_mode | Roma | Roma | limited | limited | 0 |
| Inter vs Juventus | completed | completed | A.29.sports_performance_and_outcomes | A.29.sports_performance_and_outcomes | Inter |  | limited |  |  |
| Bitcoin next 30 days | completed | completed | A.23.markets_and_asset_regimes | A.23.markets_and_asset_regimes |  |  |  |  |  |
| La mia startup sopravvivera 12 mesi? | completed | completed | B.3.5.business_idea_outcomes | B.3.5.business_idea_outcomes | Survive | Survive | limited | limited | 0 |
| Dovrei aspettare prima di affittare a Roma? | completed | completed | B.3.8.personal_decisions_and_tradeoffs | B.3.8.personal_decisions_and_tradeoffs | Wait | Wait | limited | limited | 0 |

## Blockers
- None.
