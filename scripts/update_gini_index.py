#!/usr/bin/env python3
"""Update giniIndex values in country-metadata-baseline.json from World Bank SI.POV.GINI."""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

BASELINE_PATH = Path("country-metadata-baseline.json")
WB_API_URL = "https://api.worldbank.org/v2/country/all/indicator/SI.POV.GINI?format=json&per_page=20000"


def fetch_latest_gini() -> dict[str, float]:
    with urllib.request.urlopen(WB_API_URL, timeout=60) as response:  # nosec B310
        payload = json.load(response)

    entries = payload[1] if isinstance(payload, list) and len(payload) > 1 else []
    latest: dict[str, tuple[int, float]] = {}

    for entry in entries:
        iso = entry.get("countryiso3code")
        value = entry.get("value")
        if not iso or value is None:
            continue

        try:
            year = int(entry.get("date"))
        except (TypeError, ValueError):
            year = -1

        previous = latest.get(iso)
        if previous is None or year > previous[0]:
            latest[iso] = (year, float(value))

    return {iso: value for iso, (_, value) in latest.items()}


def main() -> int:
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))

    try:
        latest_gini = fetch_latest_gini()
    except Exception as exc:  # pragma: no cover - network/environment dependent
        print(f"Failed to download World Bank SI.POV.GINI data: {exc}", file=sys.stderr)
        return 1

    updated = 0
    for country in baseline.get("countries", []):
        meta = country.get("meta", {})
        iso_code = meta.get("isoCode")
        new_value = latest_gini.get(iso_code)
        if meta.get("giniIndex") != new_value:
            meta["giniIndex"] = new_value
            updated += 1

    BASELINE_PATH.write_text(json.dumps(baseline, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    populated = sum(1 for country in baseline.get("countries", []) if country.get("meta", {}).get("giniIndex") is not None)
    print(f"Updated {updated} records. Countries with giniIndex values: {populated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
