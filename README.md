# DPI / AI Quadrant (Static GitHub Pages)

This project is a fully static country dashboard that preloads a global country list and enriched base scores from local JSON files.

## Purpose

- Load all countries from a canonical static list.
- Enrich countries with DPI Map and UN EGDI source snapshots.
- Compute transparent base DPI/AI estimates.
- Allow manual country-level overrides in the browser.
- Remain GitHub Pages compatible (subpath-safe, no backend, no runtime external APIs).

## Repository layout

- `data/` static datasets used at runtime.
- `scripts/` optional ingestion + normalization scripts.
- `index.html`, `styles.css`, `app.js` frontend runtime.

## Data pipeline (offline-prepared, browser-consumed)

Frontend reads only:

- `./data/countries.enriched.json`

Preparation scripts generate this file from raw snapshots:

```bash
node scripts/fetch-dpimap.js
node scripts/fetch-unegov.js
node scripts/build-countries.js
```

Or in one line:

```bash
node scripts/fetch-dpimap.js && node scripts/fetch-unegov.js && node scripts/build-countries.js
```

Generated files:

- `data/dpimap.raw.json`
- `data/dpimap.normalized.json`
- `data/unegov.raw.json`
- `data/unegov.normalized.json`
- `data/countries.base.json`
- `data/countries.enriched.json`
- `data/country-aliases.json`

## Scoring formulas

- `computeDpimapBaseScore`: average pillar score (`dpi_like=100`, `pilot=50`, `none=0`).
- `computeStateCapacityScore`: `EGDI * 100`.
- `computeDpiBaseScore`: `0.7 * dpimap + 0.3 * egdi`.
- `computeAiBaseScore`: `0.6 * stateCapacity` (estimated proxy).
- `computeConfidence`: high/medium/low by source availability.
- `computeDataCompleteness`: high/medium/low by pillar + EGDI coverage.

## Manual overrides

- Saved in browser `localStorage` (`dpiAiManualOverridesV2`).
- Overrides are merged on top of immutable base data.
- Final dashboard scores use manual values when present.

## Local run

```bash
python3 -m http.server 8080
```

Open:

- `http://localhost:8080/#dashboard`

## GitHub Pages deployment

- Push repo to default branch.
- Enable Pages from root.
- Keep relative paths (`./data/...`, `styles.css`, `app.js`) for subpath compatibility.

## Known limitations

- DPI Map fetch can fail in restricted environments; a warning is stored in `dpimap.raw.json`.
- UN EGDI raw script currently snapshots local baseline fields and should be replaced with a direct UN parser when a stable machine-readable export is available.
- Some countries may remain low-confidence where source coverage is incomplete.
