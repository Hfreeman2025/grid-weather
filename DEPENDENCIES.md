# Dependency licences

| Package | Version | Use | Licence |
| --- | --- | --- | --- |
| TypeScript | 5.9.3 | Development: strict checking, static compilation, AST lint | Apache-2.0 |

There are no runtime packages. All visuals are original HTML/CSS/SVG and handwritten WebGL2, with the graphics pipeline in a dedicated worker. Typography now self-hosts IBM Plex latin WOFF2 from @fontsource5.3.0 (SIL OFL1.1). V2 explicitly permits installing the WebKit/Firefox browser test binaries inside the project cache. These are test tools and are not shipped with the app. The optional screenshot harness uses the brief-authorised existing Playwright installation; it is not shipped, installed, or included as a product dependency (Playwright: Apache-2.0).

Data is licensed separately: Carbon Intensity API, CC BY 4.0; DNO boundaries, NESO Open Data Licence. See README and data/SOURCES.md. The package allowlist is MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause and ISC. `npm run licences` checks every lockfile dependency against installed metadata.

## V3 data and methods (no new packages or model weights)

| Resource | Version / capture | Licence | Size / source |
| --- | --- | --- | --- |
| Open-Meteo ECMWF IFS 0.25° fields | 2 Nov 2026; exact times in source manifest | CC BY 4.0; free API non-commercial fair use | 2,393,831 raw JSON bytes across 36 small requests; https://api.open-meteo.com/v1/forecast |
| NESO preparation data | 2 Nov 2026; regional history plus national actual | CC BY 4.0 | 3,447,902 raw JSON bytes in this manifest; https://api.carbonintensity.org.uk |
| Frozen NESO forecast | 1 Nov 2026 16:02 UTC | CC BY 4.0 | public/backtest-neso.json; retained original response |
| Ridge forecaster | Original implementation; source SHA in recorded result | MIT | Computed locally; no pretrained weights, library or hosted API |
| GPU advection | Original WebGL2 transform-feedback / RK2 implementation | MIT | Compiled with the app; no rendering library |

Weather data are projected, rotated, interpolated and area-averaged; required Open-Meteo/ECMWF attribution is beside the map and in the README. Open-Meteo server code (AGPL) is not imported or distributed. The V3 implementation downloaded no model, WASM runtime, font or package; the later Plex typography round adds the fonts recorded below. Shared pretrained weights under ~/Personal/.models/ are unused by this piece.


## Approved Plex typography round —3November2026

IBM Plex Sans400 normal/italic,500/600 normal; IBM Plex Mono400/600 normal; IBM Plex Sans Condensed500/600 normal. All eight are latin WOFF2 from **@fontsource5.3.0**, **SIL Open Font License1.1**, self-hosted under `public/fonts/`. Total **165,476bytes**. Exact CDN URLs, byte counts and SHA-256 hashes: `public/fonts/manifest.json`. The original per-family licence files are beside the fonts (`OFL-ibm-plex-sans.txt`, `OFL-ibm-plex-mono.txt`, `OFL-ibm-plex-sans-condensed.txt`); their copyright notices differ, so each is retained. `font-display:swap`; three main faces preloaded. No Google Fonts or other runtime font request.
