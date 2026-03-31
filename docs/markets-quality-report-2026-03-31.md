# Markets Quality Report - 2026-03-31

## Summary
- Total cases: `11`
- Binary cases: `2`
- A.0.general fallback rate: `0`
- Markets adapter missing count: `0`
- Source coverage failures: `0`
- Optional source missing count: `3`
- Market structure failures: `0`
- Missing binary contract count: `0`
- Ambiguous winner count: `0`
- Split inconsistency count: `0`
- Contradictory call count: `0`
- Recommendation: `activate_calibrated_thresholds`
- Verdict: **markets-ready**

## Cluster Source Coverage
### asset_direction
- Cases: `3`
- Used sources: `yahoo_finance`, `google_trends`, `historical-cache`, `polymarket_public`
- Missing required sources: none
- Missing optional sources: none

### range_regime
- Cases: `3`
- Used sources: `yahoo_finance`, `google_trends`, `historical-cache`
- Missing required sources: none
- Missing optional sources: none

### consensus_reference
- Cases: `2`
- Used sources: `yahoo_finance`, `polymarket_public`, `google_trends`, `historical-cache`
- Missing required sources: none
- Missing optional sources: none

### macro_markets
- Cases: `3`
- Used sources: `eurostat_api`, `polymarket_public`, `world_bank_api`, `oecd_api`, `google_trends`, `historical-cache`, `yahoo_finance`
- Missing required sources: none
- Missing optional sources: `fred_api`

## Regression vs Previous Report
- Previous report: `markets-quality-report-2026-03-30.json`
- General fallback rate: `0` -> `0`
- Markets adapter missing count: `0` -> `0`
- Source coverage failures: `0` -> `0`
- Market structure failures: `0` -> `0`

## Benchmark
| Cluster | Query | Domain | Market structure | Sources | Optional missing | Call |
|---|---|---|---|---|---|---|
| asset_direction | Bitcoin next 30 days | A.23.markets_and_asset_regimes | ready | yahoo_finance, google_trends, historical-cache | - | The asset is likely to stay in range with a mild bullish bias over the selected horizon. |
| asset_direction | Ethereum next 90 days | A.23.markets_and_asset_regimes | ready | yahoo_finance, google_trends, historical-cache | - | The asset is likely to stay in range with a mild bullish bias over the selected horizon. |
| asset_direction | Will Bitcoin break higher this month? | A.23.markets_and_asset_regimes | ready | yahoo_finance, polymarket_public, google_trends, historical-cache | - | Lean Breaks higher 58/42 |
| range_regime | Oil price regime next 90 days | A.13.energy_and_utilities_markets | ready | yahoo_finance, google_trends, historical-cache | - | Range pressure remains elevated and regime-break risk is still live over the selected horizon. |
| range_regime | Nasdaq volatility in the next month | A.23.markets_and_asset_regimes | ready | yahoo_finance, google_trends, historical-cache | - | Range pressure remains elevated and regime-break risk is still live over the selected horizon. |
| range_regime | Market regime shift in tech stocks this summer | A.23.markets_and_asset_regimes | ready | yahoo_finance, google_trends, historical-cache | - | Range pressure remains elevated and regime-break risk is still live over the selected horizon. |
| consensus_reference | Will gold outperform equities this quarter? | A.23.markets_and_asset_regimes | ready | yahoo_finance, polymarket_public, google_trends, historical-cache | - | Lean gold does not outperform 58/42 |
| consensus_reference | Crypto risk appetite in the next 6 months | A.23.markets_and_asset_regimes | ready | yahoo_finance, google_trends, historical-cache | - | Risk appetite still leans constructive, but the edge remains bounded by range pressure and consensus positioning. |
| macro_markets | Will ECB rates fall by autumn? | A.14.macro_economy_and_cycles | ready | eurostat_api, polymarket_public, world_bank_api, oecd_api, google_trends, historical-cache | fred_api | Lean Yes 57/43 |
| macro_markets | Inflation in Italy next 12 months | A.14.macro_economy_and_cycles | ready | eurostat_api, world_bank_api, oecd_api, google_trends, historical-cache | fred_api | Macro market pressure remains elevated over the selected window, with rates and liquidity still shaping the read. |
| macro_markets | EURUSD next quarter | A.23.markets_and_asset_regimes | ready | yahoo_finance, google_trends, historical-cache | fred_api | Macro market pressure remains elevated over the selected window, with rates and liquidity still shaping the read. |

## Open Issues
- None.
