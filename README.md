# Grid Weather v3

Great Britain's wind, sun and electricity carbon, on one forecast chart. A real ECMWF 100 m wind field drives 131,072 GPU tracers on desktop and 32,768 on phones. Under the map, a ten-feature ridge forecaster trains in a browser worker, draws its next 48 hours against NESO, and exposes its held-out errors and feature contributions. Inputs and recorded calculations carry their dates. No hosted model, key, account or downloaded model weights.

## Run

Node.js 24 or later:

```sh
npm ci --ignore-scripts
npm run dev
```

Open **http://127.0.0.1:4173**. The server binds to loopback. The port is unchanged. `npm run build` creates the static app; `npm start` serves it. No environment variables are needed.

## See it in ten seconds

The opening wind replay is a recorded integration from this code and the genuine dated field. It is embedded in the page so there is something to see before the weather JSON arrives. The live WebGL2 solver replaces it after priming one second of real advection and completing its first GPU frame. **Wind / Sun / Carbon** changes the underlay. On a phone, use **Layer** beside the time controls. **Present forecast** tours carbon changes together with sourced wind and sunlight stories; every caption prints its evidence.

**Model** opens the forecaster. A recorded calculation is labelled while the same ridge code trains locally. **Held-out replay** compares the model, the frozen NESO forecast and the later target at the same times. The hypothetical wind slider changes only the model's forward input; it is not a causal intervention and never changes the NESO line or the measured backtest score.

The regional outlook, cleanest two-hour windows, table, keyboard map, source dialogs, reduced motion and explicit dated offline states remain. Opening a dialog pauses the carbon tour. Wind is weather, never electricity or carbon flowing between regions.

## The physical field

Public [Open-Meteo ECMWF data](https://open-meteo.com/en/docs/ecmwf-api): wind speed/direction at **100 m above ground**, total cloud cover, surface shortwave radiation and 2 m temperature. The explicitly selected model is **ECMWF IFS 0.25°**. Open-Meteo interpolates its native time steps to hourly values; shortwave radiation is the preceding-hour mean.

We sample a **100 km British National Grid lattice**, 18×16 points over GB and adjacent seas. An inverse Airy transverse-Mercator projection and a seven-parameter Helmert transform locate those points in WGS84. This is a weather sampling approximation, not an OSTN15 surveying conversion. Wind vectors are rotated into grid east/north. The renderer bilinearly samples the vector field and linearly interpolates between source hours; it never extrapolates past the field's coverage.

Regional means use **10 km equal-area quadrature cells inside the actual DNO polygons**, including polygon holes. London has eight such cells in this geometry; cell counts are recorded. We average wind-speed magnitudes, rather than taking the magnitude of an average vector. These are land-area proxies, not turbine-capacity weights, and omit offshore farms outside the DNO areas. The correlation table reports Pearson **r and actual paired n**, including undefined correlations for constant series. Hourly samples are autocorrelated; n is not a count of independent observations and no significance claim is made.

`src/wind-gpu.ts` keeps positions/ages/seeds in two transform-feedback buffers. A second-order explicit midpoint step advances every particle using the real velocity field. Two RGBA framebuffers retain and fade trails. Particle colour follows speed, and motion is **1,200×** real time. These are virtual tracers in the field selected by the timeline, not observed air-parcel tracks. Source changes clear old trails; opacity tapers inside the sampling boundary. All particle states are simulated; the phone uses a smaller explicit budget. A worker owns the graphics context and bounds work to one frame in flight.

The reference CPU midpoint integrator generates `public/wind-recorded.svg` from the same source field and units. Its 477 paths and 189 playback tracers are explicitly recorded. Live GPU positions are computed afresh, not played back. If WebGL2, OffscreenCanvas or the graphics worker is unavailable, source-derived wind vectors and sunlight cells remain. Reduced motion uses those static fields.

## The forecaster and its score

[Ridge regression — Hoerl & Kennard (1970)](https://doi.org/10.1080/00401706.1970.10488634) is a good fit for a short, correlated time series: it is small, stable and inspectable, and needs no pretrained download. We implement the standardized normal equations with Cholesky factorization. The intercept is unpenalized. Lambda is selected from 0.1, 1, 10 and 100 on an earlier chronological validation slice, using scaling learned only on that slice's training rows. The final fit uses all permitted training rows.

Features: wind speed, capped speed cubed, cloud, shortwave radiation, temperature, two daily Fourier harmonics (four terms) and intensity 24 hours earlier. Forecasts beyond 24 hours consume their own earlier predictions. Missing recent GB actuals are bridged with model warm-up predictions, not future targets. Intensity outputs are bounded to 0–2,000 gCO₂/kWh; the equation/contribution view discloses this bound. Contributions are associations, not causal effects.

The comparator is the regional API's GB aggregate (id 18); the GB target is the separate national actual series. The comparison freezes the genuine NESO forecast captured **1 November 2026, 16:02 UTC** (`public/backtest-neso.json`). Training ends two hours before that issue time. No held-out target enters scaling, tuning or recursive predictions. The as-issued weather archive was unavailable during preparation, so the retrospective test uses an explicitly labelled **48-hour seasonal-persistence weather forecast**. The forward prediction uses the actual weather forecast in the input capture. Historical training-data vintages were not preserved; this is not a fully operationally vintaged evaluation.

The bundled GB result, against NESO's **national actual intensity series**, is **49.4 gCO₂/kWh MAE** for ridge versus **31.8** for the frozen NESO forecast and **42.6** for daily persistence, over **21 paired hours**. NESO wins, and the simple persistence baseline also beats this model. Regional targets are NESO's historical **estimates**: their scores measure revisions, not independently observed emissions. All per-region scores and counts are shown, not just the best result. A short window does not establish general forecast skill.

`src/forecaster.ts` is used unchanged by the browser worker and by `scripts/record-model.mjs`. The recorded output includes the core source SHA-256 and its source date. Tests recompute all 15 results, all 48-hour series and the score inputs. No coefficients are downloaded to impersonate training; the browser actually fits the models. Recorded inputs and recorded outputs remain separately labelled from live computation.

Additional technique reference: [WebGL 2 transform feedback specification](https://registry.khronos.org/webgl/specs/latest/2.0/).

## Sources, cache and refresh

Electricity: the public [NESO Carbon Intensity API](https://api.carbonintensity.org.uk/), regional current/history/forecast plus the national actual series. Every response crosses a runtime validator. Regional historical values are estimates; only the explicitly named national target uses the API's actual series. The GB aggregate is never invented by averaging regional intensities.

**Refresh weather** fetches 288 public sample points in small sequential batches: approximately **2.4 MB** of JSON for the current request shape. Progress and Cancel are visible. Successful responses are validated and cached in the browser for 30 minutes; failed/cancelled downloads retain the dated snapshot. Refreshed weather and model-training inputs have separate provenance labels. The carbon API cache remains 15 minutes. Normal builds fetch nothing.

To deliberately prepare new recorded inputs:

```sh
npm run refresh:v3
npm run build
```

The source manifest, URLs, byte counts and capture times are `data/v3-sources.json`. Raw preparation responses stay in `.cache/v3-data/`. A failed preparation does not update the served build. Disk headroom is checked before preparation. The frozen November 1 NESO comparison remains frozen; it is never silently replaced by today's forecast. `public/model-recording.json` is a calculation from our own code and public data, not a hosted-model response.

## Checks and visual review

```sh
npm run check
npm run test:browser
```

The local gate checks strict TypeScript, safety/syntax lint, data/model/geometry/projection/advection tests, the build and package licences. Browser automation is silent: Chromium is muted, Firefox volume is zero, and all engines use the V3 device-free AudioContext pattern. On macOS, accelerated Chromium tests explicitly use ANGLE Metal (the default headless backend otherwise chose SwiftShader). Browser suites must run one engine at a time, with no overlapping suite. The brief-authorized existing Playwright SDK is the only external test tool used. Temporary profiles and downloads remain inside the project cache. Do not start a suite while another builder holds the browser slot. The harness checks for 10 GiB free plus profile headroom before every launch and reuses exact global test-browser builds when available.

Final browser results, native timings, both critique passes and screenshots are recorded in `shots/v3/` and `QA.md`. Node benchmark time is not reported as browser training time. Browser meaningful paint, GPU readiness, animation frame intervals and completed worker GPU-frame latency are measured separately. No remote CI workflow, commit or deployment is implied by a local pass.

## Credits and licences

- Original code: [MIT](LICENSE), Copyright (c) 2026 Harry Freeman.
- Electricity: National Grid ESO / NESO Carbon Intensity API, CC BY 4.0.
- Weather: [Open-Meteo / ECMWF](https://open-meteo.com/en/licence), **CC BY 4.0**. Modified by projection, rotation, interpolation and area averaging. Open-Meteo's free endpoint is [non-commercial, with fair-use limits](https://open-meteo.com/en/terms): fewer than 10,000 calls/day, 5,000/hour and 600/minute. This is a local personal preview. No Open-Meteo server code is imported; its AGPL code is not a product dependency.
- Boundaries: [NESO DNO licence areas](https://api.neso.energy/dataset/gis-boundaries-for-gb-dno-license-areas), NESO Open Data Licence. **Supported by National Energy SO Open Data.** Simplified and indicative, not a connection lookup.
- TypeScript 5.9.3: development-only, Apache-2.0. **Zero runtime packages, zero pretrained-weight downloads.** No shared model-weight file is needed. [DEPENDENCIES.md](DEPENDENCIES.md) records tools and data.

Local only. No private data, accounts, commits, pushes or publishing.
