#!/usr/bin/env python3
"""Update population values in country-metadata-baseline.json.

Note:
- Gini and poverty refresh were removed because those sources are often unavailable
  in restricted environments.
- Population source: World Bank indicator SP.POP.TOTL.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

BASELINE_PATH = Path("country-metadata-baseline.json")
DEFAULT_POPULATION_URL = "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=20000"


def _load_json_from_url(url: str) -> Any:
    with urllib.request.urlopen(url, timeout=90) as response:  # nosec B310
        return json.load(response)


def _load_json_from_path(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _to_int(value: Any) -> int | None:
    if value in (None, "", "NA", "NaN"):
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def parse_latest_population(payload: Any) -> dict[str, int]:
    entries = payload[1] if isinstance(payload, list) and len(payload) > 1 else []
    latest: dict[str, tuple[int, int]] = {}

    for entry in entries:
        iso = entry.get("countryiso3code")
        value = _to_int(entry.get("value"))
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, default=BASELINE_PATH)
    parser.add_argument("--population-url", default=DEFAULT_POPULATION_URL)
    parser.add_argument(
        "--population-file",
        type=Path,
        help="Load population payload from local file instead of URL",
    )
    args = parser.parse_args()

    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))

    try:
        population_payload = (
            _load_json_from_path(args.population_file) if args.population_file else _load_json_from_url(args.population_url)
        )
    except Exception as exc:  # pragma: no cover - depends on network/files
        print(f"Failed to load population dataset: {exc}", file=sys.stderr)
        return 1

    population_by_iso = parse_latest_population(population_payload)

    population_updates = 0
    for country in baseline.get("countries", []):
        meta = country.get("meta", {})
        iso = meta.get("isoCode")
        if not iso:
            continue

        if iso in population_by_iso:
            new_population = population_by_iso[iso]
            if meta.get("population") != new_population:
                meta["population"] = new_population
                population_updates += 1

    args.baseline.write_text(json.dumps(baseline, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    population_populated = sum(1 for c in baseline.get("countries", []) if c.get("meta", {}).get("population") is not None)
    print(f"Updated population for {population_updates} records ({population_populated} populated).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
