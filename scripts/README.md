# Data pipeline scripts

## 1) Fetch DPI Map raw data

```bash
node scripts/fetch-dpimap.js
```

Writes `data/dpimap.raw.json`.

## 2) Prepare UN EGDI raw snapshot

```bash
node scripts/fetch-unegov.js
```

Writes `data/unegov.raw.json` from the local country baseline snapshot.

## 3) Build normalized + enriched datasets

```bash
node scripts/build-countries.js
```

Writes:
- `data/dpimap.normalized.json`
- `data/unegov.normalized.json`
- `data/countries.base.json`
- `data/countries.enriched.json`

## Full rebuild

```bash
node scripts/fetch-dpimap.js && node scripts/fetch-unegov.js && node scripts/build-countries.js
```
