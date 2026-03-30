# Policy Quality Report - 2026-03-30

## Summary
- Total cases: `10`
- Binary cases: `8`
- A.0.general fallback rate: `0`
- Policy adapter missing count: `0`
- Missing metadata count: `0`
- Source coverage failures: `0`
- Missing binary contract count: `0`
- Ambiguous winner count: `0`
- Split inconsistency count: `0`
- Verdict: **policy-ready**

## Cluster Source Coverage
### referendum
- Cases: `2`
- Used sources: `wikidata`, `polymarket_public`, `gdelt`, `rss_allowlist`, `historical-cache`
- Missing required sources: none

### policy_risk
- Cases: `3`
- Used sources: `wikidata`, `polymarket_public`, `gdelt`, `rss_allowlist`, `historical-cache`
- Missing required sources: none

### regulatory_decision
- Cases: `3`
- Used sources: `wikidata`, `polymarket_public`, `gdelt`, `rss_allowlist`, `historical-cache`
- Missing required sources: none

### public_timeline
- Cases: `2`
- Used sources: `wikidata`, `gdelt`, `rss_allowlist`, `historical-cache`
- Missing required sources: none

## Regression vs Previous Report
- Previous report: `policy-quality-report-2026-03-29.json`
- General fallback rate: `0` -> `0`
- Policy adapter missing count: `0` -> `0`
- Source coverage failures: `0` -> `0`
- Missing binary contract count: `0` -> `0`

## Benchmark
| Cluster | Query | Domain | Event date | Jurisdiction | Governing entity | Policy adapter | Sources | Call |
|---|---|---|---|---|---|---|---|---|
| referendum | Cosa passera al referendum costituzionale di marzo in Italia? si o no | A.24.governance_policy_and_public_timeline | March | Italy | Voters | yes | wikidata, polymarket_public, gdelt, rss_allowlist, historical-cache | Lean No 58/42 |
| referendum | Will the new Italian constitutional referendum pass? | A.24.governance_policy_and_public_timeline | - | Italy | Voters | yes | wikidata, polymarket_public, gdelt, rss_allowlist, historical-cache | Lean No 58/42 |
| policy_risk | Will the coalition government survive the budget vote in Italy? | A.24.governance_policy_and_public_timeline | - | Italy | Coalition government | yes | wikidata, polymarket_public, gdelt, rss_allowlist, historical-cache | Lean Government survives 58/42 |
| policy_risk | Quanto e probabile un cambio di governo in Francia nei prossimi 6 mesi? | A.24.governance_policy_and_public_timeline | Next 6 months | France | Government | yes | wikidata, polymarket_public, gdelt, rss_allowlist, historical-cache | Lean Government holds 58/42 |
| regulatory_decision | Will the new regulation be approved by parliament? | A.24.governance_policy_and_public_timeline | - | - | Parliament | yes | wikidata, polymarket_public, gdelt, rss_allowlist, historical-cache | Lean Approved 58/42 |
| regulatory_decision | Will the senate approve the reform package this quarter? | A.24.governance_policy_and_public_timeline | This quarter | - | Senate | yes | wikidata, polymarket_public, gdelt, rss_allowlist, historical-cache | Lean Approved 58/42 |
| public_timeline | Election volatility in Italy over the next 90 days | A.24.governance_policy_and_public_timeline | Next 90 days | Italy | Voters | yes | wikidata, gdelt, rss_allowlist, historical-cache | Policy pressure remains elevated over the selected window. |
| public_timeline | Policy pressure around EU AI regulation next 90 days | A.24.governance_policy_and_public_timeline | Next 90 days | European Union | EU institutions | yes | wikidata, gdelt, rss_allowlist, historical-cache | Policy pressure remains elevated over the selected window. |
| policy_risk | Rischio di elezioni anticipate in Italia entro 12 mesi | A.24.governance_policy_and_public_timeline | Within 12 months | Italy | Government | yes | wikidata, polymarket_public, gdelt, rss_allowlist, historical-cache | Lean Government holds 58/42 |
| regulatory_decision | Will parliament block the reform package before autumn? | A.24.governance_policy_and_public_timeline | Autumn | - | Parliament | yes | wikidata, polymarket_public, gdelt, rss_allowlist, historical-cache | Lean Blocked 58/42 |

## Open Issues
- None.
