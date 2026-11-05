# Open-Meteo fixture

These gzip files retain the 36 public ECMWF IFS 0.25° response batches used in the 2 November 2026 preparation capture. Coordinates, URLs, byte counts and capture times are recorded in `data/v3-sources.json` at the repository root. No account or private inputs were used.

The browser harness decompresses them when intercepting Open-Meteo requests. This tests real response assembly, progress, caching and cancellation without making live API requests. The clock is fixed to the saved carbon capture; browser performance timers remain native. These files are test inputs, never current weather claims.

Weather data by Open-Meteo and ECMWF, CC BY 4.0. [Licence](https://open-meteo.com/en/licence).
