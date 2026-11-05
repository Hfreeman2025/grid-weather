# Public data provenance

Fetched 1 November 2026. No private sources were used.

- `boundaries-source.geojson`: NESO's official 20240503 resource, https://api.neso.energy/dataset/0e377f16-95e9-4c15-a1fc-49e06a39cfa0/resource/1c6a7dc0-1b6c-443a-bc67-5f7125649434/download/gb-dno-license-areas-20240503-as-geojson.geojson
- `boundary-catalog.json`: matching dataset extracted from the official catalogue response at https://api.neso.energy/api/3/action/package_search?q=DNO&rows=20 ; the matching dataset explicitly declares the NESO Open Data Licence.
- `boundary-licence.html` and `licences.json`: official licence text and catalogue licence metadata, retained as verification evidence. Required attribution: **Supported by National Energy SO Open Data**.
- `api-root.txt`: official https://api.carbonintensity.org.uk/ response. Explicitly declares CC BY 4.0, lists the regional endpoints and identifies the operator. Its third-party scripts and styles were not loaded.
- `current-response.json`: genuine `/regional` response used as a parser fixture; source interval 1 November 2026, 11:00–11:30 UTC.
- `public/snapshot.json`: genuine current/history/forecast responses. Its `fetchedAt` and `anchor` contain exact timestamps. Always labelled saved/offline when used without a fresh API response.
- `geometry-report.json`: generated simplification measurements and source URL.

The saved HTML files are evidence only and are excluded from the static build. No API values have been fabricated. Historical regional numbers are estimates, not measured actual emissions. Normal builds do not fetch data.

## V3 weather and holdout

`v3-sources.json` records every successful public preparation URL, raw response byte count and actual capture time, on 2 November 2026. The weather capture is 14:50 UTC: 288 sample points in 36 sequential calls (2,393,831 bytes). NESO preparation is 11 calls (3,447,902 bytes). Local raw caches are `.cache/v3-data/`; they are not part of the static app.

- Weather: https://open-meteo.com/en/docs/ecmwf-api ; explicitly ECMWF IFS 0.25°, 100 m wind, cloud, shortwave and 2 m temperature. Data licence https://open-meteo.com/en/licence (CC BY 4.0). Free endpoint terms https://open-meteo.com/en/terms : non-commercial personal use, <10,000 calls/day, <5,000/hour, <600/minute. Cache for 30 minutes; 36 calls per manual refresh, one in flight. These source documents were checked during preparation. No Open-Meteo server code is imported.
- `public/weather.json`: validated projection-grid fields. Shortwave is the preceding-hour mean. Modified by BNG projection, wind rotation, interpolation and 10 km polygon quadrature. Attribution is visible beside the map.
- `public/experiment.json`: dated public NESO regional history, national actual intensity, weather and feature inputs. Regional target values remain estimates. No private or user data.
- `public/backtest-neso.json`: original comparison issue retained from 1 November 2026 16:02:55.949 UTC. Never refreshed by the preparation command.
- Historical weather archive / single-run endpoint attempts were unavailable (503 / timeout). The backtest therefore uses an explicit 48-hour seasonal-persistence weather input, not future actual weather. The forward run uses the genuine forecast in the capture. No operationally vintaged accuracy is claimed.
- `public/model-recording.json`: calculation from our own ridge code; source SHA-256 and capture date included. Recomputed and compared by tests; the browser independently trains those models.
- `public/wind-recorded.svg`: CPU midpoint reference integration from the real field, recorded at 1,200×. Exact field date, source hash and trace count in `data/wind-recording.json`. Live GPU simulation is separately labelled.
