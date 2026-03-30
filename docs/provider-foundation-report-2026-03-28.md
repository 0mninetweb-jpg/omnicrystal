# Provider Foundation Report - 2026-03-28

## Summary
- Total synthetic cases: `6`
- Top-3 miss count: `0`
- Source coverage failures: `0`
- Location structure failures: `0`
- Mobility structure failures: `0`
- Public data structure failures: `0`
- Runtime provider count: `20`
- Runtime config blocker count: `0`
- Runtime optional missing count: `1`
- Runtime state source: `live_health`
- Synthetic smoke verdict: `connector-ready`
- Runtime config verdict: `config-ready`
- Recommendation: `shared_spine_ready_for_dark_deploy`
- Verdict: **foundation-ready**

## Runtime Provider States
| Source | Status | Configured | Available | Notes |
|---|---|---|---|---|
| open_meteo | available | yes | yes | - |
| polymarket_public | available | yes | yes | - |
| wikidata | available | yes | yes | - |
| gdelt | available | yes | yes | - |
| rss_allowlist | available | yes | yes | - |
| google_trends | available | yes | yes | - |
| yahoo_finance | available | yes | yes | - |
| fred_api | available | yes | yes | - |
| nominatim | available | yes | yes | - |
| overpass | available | yes | yes | - |
| gtfs_static | available | yes | yes | - |
| gtfs_realtime | available | yes | yes | - |
| opensky | available | yes | yes | - |
| openaq | config_missing | no | no | OPENAQ_API_KEY is required by the current OpenAQ v3 runtime path. |
| world_bank_api | available | yes | yes | - |
| eurostat_api | available | yes | yes | - |
| oecd_api | available | yes | yes | - |
| eia_api | config_missing | no | no | EIA_API_KEY is required to activate EIA in runtime. |
| thesportsdb_public | available | yes | yes | Using TheSportsDB free tier (key 123) as the primary sports runtime source. |
| api_football_optional | config_missing | no | no | API_FOOTBALL_KEY is optional now and only used as a sports enhancer when configured. |

## Synthetic Connector Smoke
| Cluster | Query | Domain | Sources | Missing required | Location | Mobility | Public data |
|---|---|---|---|---|---|---|---|
| city_geo | City pulse in Rome next 30 days | A.7.city_pulse_and_urban_pressure | nominatim, overpass, google_trends, historical-cache | - | ready | ready | ready |
| mobility | Mobility congestion in Rome next week | A.8.mobility_congestion_and_accessibility | nominatim, gtfs_realtime, gtfs_static, overpass, google_trends, historical-cache | - | ready | ready | ready |
| travel | Travel disruption risk in Rome next 90 days | A.9.travel_flows_and_disruption | nominatim, gtfs_realtime, opensky, gtfs_static, overpass, google_trends, historical-cache | - | ready | ready | ready |
| macro_public | Inflation in Italy next 12 months | A.14.macro_economy_and_cycles | yahoo_finance, fred_api, eurostat_api, oecd_api, world_bank_api, google_trends, historical-cache | - | ready | ready | ready |
| energy | Oil price regime next 90 days | A.23.markets_and_asset_regimes | yahoo_finance, fred_api, eia_api, google_trends, historical-cache | - | ready | ready | ready |
| environment | Air quality risk in Milan next week | A.28.public_health_and_environmental_exposure | nominatim, overpass, openaq, google_trends, historical-cache | - | ready | ready | ready |

## Runtime Config Blockers
- None.

## Runtime Optional Missing
- `openaq`: status=`config_missing`, notes=OPENAQ_API_KEY is required by the current OpenAQ v3 runtime path.

## Regression vs Previous Report
- Previous report: `provider-foundation-report-2026-03-27.json`
- Source coverage failures: `0` -> `0`
- Location structure failures: `0` -> `0`
- Mobility structure failures: `0` -> `0`
- Public data structure failures: `0` -> `0`
- Runtime config blockers: `0` -> `0`
- Runtime optional missing: `1` -> `1`
