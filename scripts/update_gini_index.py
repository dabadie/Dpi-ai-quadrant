#!/usr/bin/env python3
"""Update giniIndex and povertyPct values in country-metadata-baseline.json.

Data sources:
- Gini: World Bank indicator SI.POV.GINI
- Poverty headcount: World Bank PIP metadata JSON
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

BASELINE_PATH = Path("country-metadata-baseline.json")
DEFAULT_GINI_URL = "https://api.worldbank.org/v2/country/all/indicator/SI.POV.GINI?format=json&per_page=20000"
DEFAULT_POVERTY_URL = "https://raw.githubusercontent.com/worldbank/pipdocs/main/metadata/json/WB_PIP_HEADCOUNT.json"


def _load_json_from_url(url: str) -> Any:
    with urllib.request.urlopen(url, timeout=90) as response:  # nosec B310
        return json.load(response)


def _load_json_from_path(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _to_float(value: Any) -> float | None:
    if value in (None, "", "NA", "NaN"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_latest_gini(payload: Any) -> dict[str, float]:
    entries = payload[1] if isinstance(payload, list) and len(payload) > 1 else []
    latest: dict[str, tuple[int, float]] = {}

    for entry in entries:
        iso = entry.get("countryiso3code")
        value = _to_float(entry.get("value"))
        if not iso or value is None:
            continue

        try:
            year = int(entry.get("date"))
        except (TypeError, ValueError):
            year = -1

        previous = latest.get(iso)
        if previous is None or year > previous[0]:
            latest[iso] = (year, value)

    return {iso: value for iso, (_, value) in latest.items()}


def parse_latest_poverty(payload: Any) -> dict[str, float]:
    if not isinstance(payload, list):
        return {}

    latest: dict[str, tuple[int, float]] = {}

    for entry in payload:
        if not isinstance(entry, dict):
            continue

        iso = entry.get("country_code") or entry.get("iso3") or entry.get("countryiso3code")
        value = _to_float(entry.get("reporting_pop_rate") or entry.get("value") or entry.get("headcount"))
        if not iso or value is None:
            continue

        year_value = entry.get("reporting_year") or entry.get("year") or entry.get("date")
        try:
            year = int(year_value)
        except (TypeError, ValueError):
            year = -1

        previous = latest.get(iso)
        if previous is None or year > previous[0]:
            latest[iso] = (year, value)

    return {iso: value for iso, (_, value) in latest.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, default=BASELINE_PATH)
    parser.add_argument("--gini-url", default=DEFAULT_GINI_URL)
    parser.add_argument("--poverty-url", default=DEFAULT_POVERTY_URL)
    parser.add_argument("--gini-file", type=Path, help="Load Gini payload from local file instead of URL")
    parser.add_argument("--poverty-file", type=Path, help="Load poverty payload from local file instead of URL")
    args = parser.parse_args()

    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))

    try:
        gini_payload = _load_json_from_path(args.gini_file) if args.gini_file else _load_json_from_url(args.gini_url)
        poverty_payload = _load_json_from_path(args.poverty_file) if args.poverty_file else _load_json_from_url(args.poverty_url)
    except Exception as exc:  # pragma: no cover - depends on network/files
        print(f"Failed to load source datasets: {exc}", file=sys.stderr)
        return 1

    gini_by_iso = parse_latest_gini(gini_payload)
    poverty_by_iso = parse_latest_poverty(poverty_payload)

    gini_updates = 0
    poverty_updates = 0

    for country in baseline.get("countries", []):
        meta = country.get("meta", {})
        iso = meta.get("isoCode")
        if not iso:
            continue

        if iso in gini_by_iso:
            new_gini = gini_by_iso[iso]
            if meta.get("giniIndex") != new_gini:
                meta["giniIndex"] = new_gini
                gini_updates += 1

        if iso in poverty_by_iso:
            new_poverty = poverty_by_iso[iso]
            if meta.get("povertyPct") != new_poverty:
                meta["povertyPct"] = new_poverty
                poverty_updates += 1

    args.baseline.write_text(json.dumps(baseline, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    gini_populated = sum(1 for c in baseline.get("countries", []) if c.get("meta", {}).get("giniIndex") is not None)
    poverty_populated = sum(1 for c in baseline.get("countries", []) if c.get("meta", {}).get("povertyPct") is not None)

    print(
        f"Updated giniIndex for {gini_updates} records ({gini_populated} populated); "
        f"updated povertyPct for {poverty_updates} records ({poverty_populated} populated)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
