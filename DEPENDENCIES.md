# Dependency licences

| Package                      | Version | Use                                       | Licence    |
| ---------------------------- | ------- | ----------------------------------------- | ---------- |
| TypeScript                   | 5.9.3   | Strict checking, compilation and AST lint | Apache-2.0 |
| Prettier                     | 3.9.10  | Source and documentation formatting       | MIT        |
| Playwright / playwright-core | 1.64.1  | Local browser validation                  | Apache-2.0 |

There are **zero runtime packages**. Browser binaries are development tools, installed separately and never shipped in the app. `npm run licences` checks installed dependency versions and licences against the lockfile. Approved package licences are MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause and ISC.

## Fonts

Eight Latin WOFF2 files from **@fontsource 5.3.0** are self-hosted under `public/fonts/`, totalling **165,476 bytes**: IBM Plex Sans 400 normal/italic, 500 and 600; IBM Plex Mono 400 and 600; IBM Plex Sans Condensed 500 and 600. All are **SIL Open Font License 1.1**. Original per-family licence files are retained because their copyright notices differ. `public/fonts/manifest.json` records exact source URLs, sizes and SHA-256 hashes. The licence check verifies every font and original notice. There are no runtime font-service requests.

## HF badge

The supplied HF badge design is © 2026 Harry Freeman and is separate from the code’s MIT licence. Its lettering is outlined IBM Plex Sans Condensed SemiBold, sourced from a SIL OFL 1.1 font; the resulting artwork is not Font Software. The [mark notice](docs/brand/LICENSE.md) retains the supplied attribution and links to the existing font licence. The SVG makes no font-service request.

## Data and methods

| Resource                       | Capture                                    | Licence / provenance                                                |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------- |
| Open-Meteo ECMWF IFS 0.25°     | 2 November 2026; precise times in manifest | CC BY 4.0; ECMWF attribution; free endpoint non-commercial fair use |
| NESO carbon preparation inputs | 2 November 2026                            | CC BY 4.0; regional estimates and national actuals                  |
| Frozen NESO forecast           | 1 November 2026, 16:02 UTC                 | CC BY 4.0; original response retained                               |
| DNO boundaries                 | Source recorded in `data/SOURCES.md`       | NESO Open Data Licence; simplified for display                      |
| Ridge and GPU integration code | Original implementation                    | MIT; no pretrained weights or hosted inference                      |

The preparation manifest `data/v3-sources.json` records 2,393,831 raw weather-response bytes over 36 requests and 3,447,902 NESO-response bytes. These are recorded preparation totals, not a prediction of future download sizes. Compressed public weather responses in `tests/fixtures/meteo/` support offline API-contract tests.

Weather data are projected, rotated, interpolated and area-averaged. Open-Meteo server code is not imported or distributed. Endpoint access is subject to [Open-Meteo's terms](https://open-meteo.com/en/terms); the data licence is [CC BY 4.0](https://open-meteo.com/en/licence). **Supported by National Energy SO Open Data.** See [data sources](data/SOURCES.md).
