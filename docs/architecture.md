# Architecture

The static app has no runtime packages. TypeScript compiles to native browser modules. Separate workers own graphics and model fitting, and the page bounds graphics work to one frame in flight. Recorded, dated results make the opening state useful before those workers finish; they are labelled as recordings rather than live calculations.

## Weather sampling

The source is Open-Meteo's explicitly selected ECMWF IFS 0.25° model: wind speed/direction at 100 m above ground, total cloud cover, surface shortwave radiation and 2 m temperature. Open-Meteo interpolates native time steps to hourly values; shortwave radiation is a preceding-hour mean.

A 100 km British National Grid lattice has 18 × 16 points over GB and adjacent seas. An inverse Airy transverse-Mercator projection and seven-parameter Helmert transform locate the samples in WGS84. This is a weather-sampling approximation, not an OSTN15 surveying conversion. Vectors are rotated into grid east/north, interpolated bilinearly in space and linearly in time, and never extrapolated past source coverage.

Regional means use 10 km equal-area quadrature cells inside DNO polygons, including holes. London has eight cells in the bundled geometry; counts are recorded. Wind-speed magnitudes are averaged directly. These are land-area proxies, not turbine-capacity weights. Offshore farms outside the polygons are omitted.

Pearson correlations show both r and the actual paired n, including undefined results for constant series. Hourly values are autocorrelated; n is not a count of independent observations, and no significance claim is made.

## Rendering

Two transform-feedback buffers retain particle positions, ages and seeds. An explicit midpoint step integrates the selected velocity field. Two RGBA framebuffers retain and fade trails, coloured by speed. Source changes clear old trails; opacity tapers near the sampling boundary. All particles are simulated, with explicit desktop and phone budgets.

The CPU reference integrator generates `public/wind-recorded.svg` from the same units and source field: 477 paths and 189 playback tracers. Provenance is in `data/wind-recording.json`. The browser GPU solver computes positions afresh. If WebGL2, OffscreenCanvas or the graphics worker is unavailable, SVG vectors and sunlight cells remain. Reduced motion uses static fields.

## Forecast fitting

Ridge regression solves standardized normal equations with Cholesky factorization and an unpenalized intercept. Lambda is selected from 0.1, 1, 10 and 100 using an earlier chronological validation slice; scaling is learned only from its training rows. The final fit uses all permitted training rows.

The ten features are wind speed, capped speed cubed, cloud, shortwave radiation, temperature, two daily Fourier harmonics (four terms), and intensity 24 hours earlier. Beyond 24 hours, lag features consume earlier predictions. Missing recent GB actuals are bridged with model warm-up predictions, not future targets. Outputs are bounded to 0–2,000 gCO₂/kWh; the equation view discloses the bound. Contributions are associations, not causal effects.

## Evaluation boundary

The frozen NESO comparator is the regional API's GB aggregate (id 18), captured **1 November 2026 at 16:02:55.949 UTC**, while GB targets come from the separate national actual series. Training ends two hours before issue time. Held-out targets never enter scaling, tuning or recursive predictions.

An as-issued weather archive was unavailable, so this retrospective test uses labelled **48-hour seasonal-persistence weather**. The forward prediction uses the weather forecast from the input capture. Historical training-data vintages were not preserved. Regional targets are historical estimates, so regional scores measure revisions. All per-region scores and counts are displayed, including the losing GB result.

`public/model-recording.json` is computed by the same ridge implementation, with source hashes and dates; no coefficients or pretrained weights are shipped. Browser checks compare fresh worker results with that recording.

## Refresh and failure states

Carbon refresh uses the public keyless API with a 15-minute cache. Manual weather refresh has progress, cancellation and a 30-minute cache. Bundled data survive network failure with explicit dates. A new weather fetch changes the physical field, not the bundled training dataset. To regenerate preparation inputs explicitly, run `npm run refresh:weather`; it makes public network requests, records source captures, and leaves the frozen NESO comparison unchanged. This command changes data and is separate from normal builds.

## References

- [Hoerl & Kennard, Ridge Regression: Biased Estimation for Nonorthogonal Problems (1970)](https://doi.org/10.1080/00401706.1970.10488634).
- [WebGL 2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/).
- [Open-Meteo ECMWF API](https://open-meteo.com/en/docs/ecmwf-api), [licence](https://open-meteo.com/en/licence) and [endpoint terms](https://open-meteo.com/en/terms).
- [Carbon Intensity API definitions](https://carbon-intensity.github.io/api-definitions/) and [NESO DNO licence areas](https://api.neso.energy/dataset/gis-boundaries-for-gb-dno-license-areas).
