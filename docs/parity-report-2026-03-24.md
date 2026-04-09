# Direct API Parity Report - 2026-03-24

## Summary
- Local API base: `https://api-paaqyfwena-ew.a.run.app`
- Remote service: `https://crystal-core-paaqyfwena-ew.a.run.app`
- Remote max completed streak: `0`
- Binary comparable pairs: `0`
- Winner mismatch rate: `n/a`
- Median probability delta: `n/a`
- Missing binary contract rate: `1`
- Direct API 502 count: `0`
- Sports probe ready: `False`
- Sports semantic ready: `False`
- Sports publish gate ready: `False`
- Sports market overlay available: `False`
- Sports market source class: ``
- Sports fixture kind: ``
- Sports pick state: ``
- Sportsbook readiness state: ``
- Sports probability probe ready: `False`
- Sports probability pick state: ``
- Sports probability readiness state: ``
- Verdict: **hold at 0/0**

## Benchmark
| Query | Local | Remote | Local domain | Remote domain | Local winner | Remote winner | Local band | Remote band | Delta |
|---|---|---|---|---|---|---|---|---|---|
| Cosa passera al referendum costituzionale di marzo in Italia? si o no | failed | not_run |  |  |  |  |  |  |  |
| Inter Milan vs Roma 2026-04-05 | failed | not_run |  |  |  |  |  |  |  |
| Will Inter Milan beat Roma on 2026-04-05? | failed | not_run |  |  |  |  |  |  |  |
| Inter vs Juventus | failed | not_run |  |  |  |  |  |  |  |
| Bitcoin next 30 days | failed | not_run |  |  |  |  |  |  |  |
| La mia startup sopravviverebbe 12 mesi? | failed | not_run |  |  |  |  |  |  |  |
| Dovrei aspettare prima di affittare a Roma? | failed | not_run |  |  |  |  |  |  |  |

## Blockers
- local compile failed: Cosa passera al referendum costituzionale di marzo in Italia? si o no
- local compile failed: Inter Milan vs Roma 2026-04-05
- local compile failed: Will Inter Milan beat Roma on 2026-04-05?
- local compile failed: Inter vs Juventus
- local compile failed: Bitcoin next 30 days
- local compile failed: La mia startup sopravviverebbe 12 mesi?
- local compile failed: Dovrei aspettare prima di affittare a Roma?
- binary parity unavailable on benchmark
- median probability delta unavailable
- missing binary contract on binary benchmark
- fewer than 3 consecutive remote completions
- A.29 sports probe is not live-ready on the dated fixture benchmark
- B.3.6 sports probability probe is not live-ready on the dated fixture benchmark
