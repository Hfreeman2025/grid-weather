# Validation

## Reproducible checks

`npm run check` runs formatting, strict TypeScript checking, AST safety lint, Node unit tests, a fresh static build, and dependency/font integrity checks. GitHub Actions runs this gate and `npm audit --audit-level=high` on Node 24 on Ubuntu. Builds use bundled public inputs and make no source-data or model requests.

The local browser suite is separate from CI because its acceleration and frame-time assertions depend on a graphics-capable host. It requires the local preview server, matching Playwright engines and an exclusive browser slot on a macOS or Linux host with the Playwright system prerequisites installed. There is no live-model check: ridge fitting runs locally from supplied public data, without pretrained weights.

`npm run test:browser` runs Chromium, WebKit and Firefox sequentially at 1440 × 900 and 390 × 844. Requests are intercepted with public-data fixtures. The clock is fixed to the saved capture; performance timers are unchanged. Reports and screenshots go to ignored `test-results/`.

The suite checks all forecast captions against computed evidence, named-region highlights and map timestamps; keyboard navigation and modal focus; whole-gram outlooks and shared chart scale; fresh worker fits against the same-code recording; hypothetical forward inputs; numerical GPU reference positions; static reduced-motion pixels; and explicit failure/SVG states. Meaningful paint, UI frame intervals, GPU-worker duration and completed GPU-frame intervals are distinct measurements.

Additional scripts: `npm run test:gpu` checks transform feedback directly; `npm run test:fonts` deliberately delays font completion and records swap shifts and geometry. `node scripts/weather-browser-check.mjs` tests all 36 weather batches, cache reuse, cancellation and missing-source fallbacks. `npm run capture` captures presentation, model and failure states.

## Local run: 5 November 2026

A clean install passed formatting, strict checking, lint, **53 active unit tests**, build and licence integrity checks. The serial browser suite passed **117 named checks** (39 per engine), with zero page errors or console warnings. All six views used WebGL2: 131,072 desktop particles and 32,768 phone particles. Separate GPU-reference, weather-refresh/cache/cancel and recorded-model failure checks passed.

Host: macOS/arm64; Node 26.12.0; pinned Playwright 1.64.1. The full portable gate also passed a clean install on official Node 24.22.2, with the runtime archive SHA-256 verified against the official release checksums. CI targets Node 24; the GitHub-hosted job has not been run. These are local fixture observations with native performance timers, not remote-load benchmarks. The loop sample lasts six seconds after warm-up.

| Engine   | Width | Meaningful paint | UI interval p95 | GPU frame interval p95 | GPU worker p95 | Training |
| -------- | ----: | ---------------: | --------------: | ---------------------: | -------------: | -------: |
| Chromium |  1440 |         159.2 ms |         16.7 ms |                36.2 ms |         6.0 ms |  83.6 ms |
| Chromium |   390 |         113.2 ms |         16.7 ms |                35.9 ms |         5.8 ms |  73.4 ms |
| WebKit   |  1440 |         342.0 ms |         18.0 ms |                36.0 ms |         8.0 ms |  62.0 ms |
| WebKit   |   390 |         118.0 ms |         18.0 ms |                36.0 ms |         5.0 ms |  54.0 ms |
| Firefox  |  1440 |         294.0 ms |         16.7 ms |                40.0 ms |        10.0 ms |  97.0 ms |
| Firefox  |   390 |         111.0 ms |         16.7 ms |                38.0 ms |        10.0 ms |  85.0 ms |

Compiled JavaScript totals **48,098 bytes of per-file gzip output**. This sums every compiled module, rather than measuring a single bundle or a network transfer; the local static server does not compress responses. `node scripts/build-report.mjs` records sizes and hashes after a build.

## Forecast result

The bundled comparison gives GB MAE of **49.4 gCO₂/kWh** for ridge, **31.8** for NESO and **42.6** for daily persistence, over **21 paired hours** against the national actual series. The NESO issue is 1 November 2026 at 16:02:55.949 UTC; later inputs were captured on 2 November. Both baselines win. This short retrospective comparison uses seasonal-persistence weather, lacks historical training vintages, and is not evidence of production forecasting skill.

## Typography result

The 5 November rerun measured **0 isolated font-swap CLS** in Chromium at both sizes. WebKit and Firefox did not expose the native layout-shift API. All measured map, timeline, caption, evidence and weather-readout boxes retained their bounds in all engines. WebKit also retained the model section's bounds; Firefox's model section height changed by +3 px on desktop and −2.5 px on phone. No zero-CLS claim is made for those engines.

In the earlier typography validation, eight Plex faces loaded locally with no external font requests. Chromium's native observer measured **0 font-swap CLS** at both desktop and phone sizes when the faces were delayed and then released. WebKit and Firefox lacked that native API; their results were reported as unavailable, with stable measured control geometry instead of invented zeros.

Whole-page startup shifts include data changes. Earlier Arial startup CLS was 0.0127406 desktop / 0.0112399 phone; Plex startup CLS was 0.0072626 / 0.0117611. Those are fixture-run observations, not universal performance guarantees. The zero applies only to the isolated font swap.

The [desktop overview](images/overview.png) and [phone model replay](images/model-phone.png) show the dated demonstration. Generated browser output is intentionally excluded from version control.
