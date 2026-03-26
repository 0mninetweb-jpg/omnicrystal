# Direct API Parity Report - 2026-03-24

## Summary
- Local API base: `https://api-paaqyfwena-ew.a.run.app`
- Remote service: `https://crystal-core-paaqyfwena-ew.a.run.app`
- Remote max completed streak: `5`
- Binary comparable pairs: `3`
- Winner mismatch rate: `0,3333`
- Median probability delta: `0`
- Missing binary contract rate: `0,25`
- Direct API 502 count: `0`
- Sports probe ready: `False`
- Verdict: **hold at 0/0**

## Benchmark
| Query | Local | Remote | Local domain | Remote domain | Local winner | Remote winner | Local band | Remote band | Delta |
|---|---|---|---|---|---|---|---|---|---|
| Cosa passera al referendum costituzionale di marzo in Italia? si o no | completed | completed | A.24.governance_policy_and_public_timeline | A.24.governance_policy_and_public_timeline | Si | No | limited | limited | 0 |
| Inter vs Juventus | completed | completed | A.29.sports_performance_and_outcomes | A.29.sports_performance_and_outcomes |  |  |  |  |  |
| Bitcoin next 30 days | completed | completed | A.23.markets_and_asset_regimes | A.23.markets_and_asset_regimes |  |  |  |  |  |
| La mia startup sopravvivera 12 mesi? | completed | completed | B.3.5.business_idea_outcomes | B.3.5.business_idea_outcomes | Survive | Survive | limited | limited | 0 |
| Dovrei aspettare prima di affittare a Roma? | completed | completed | B.3.8.personal_decisions_and_tradeoffs | B.3.8.personal_decisions_and_tradeoffs | Wait | Wait | limited | limited | 0 |

## Blockers
- sports provider grounding unavailable on local_core: Inter vs Juventus
- sports provider grounding unavailable on remote: Inter vs Juventus
- binary winner mismatch present
- missing binary contract on binary benchmark
- sports probe is not provider-grounded and parity-ready
