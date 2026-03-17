#!/usr/bin/env python3
"""Update giniIndex, povertyPct, and population in country-metadata-baseline.json.

Data sources:
- Gini: World Bank indicator SI.POV.GINI
- Poverty: World Bank PIP API CSV (povline=3, PPP 2021)
- Population: World Bank indicator SP.POP.TOTL
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

BASELINE_PATH = Path("country-metadata-baseline.json")
DEFAULT_GINI_URL = "https://api.worldbank.org/v2/country/all/indicator/SI.POV.GINI?format=json&per_page=20000"
DEFAULT_POVERTY_URL = (
    "https://api.worldbank.org/pip/v1/pip?country=all&year=all&povline=3&ppp_version=2021&format=csv&fill_gaps=false"
)
DEFAULT_POPULATION_URL = "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=20000"


def _load_json_from_url(url: str) -> Any:
    with urllib.request.urlopen(url, timeout=90) as response:  # nosec B310
        return json.load(response)


def _load_text_from_url(url: str) -> str:
    with urllib.request.urlopen(url, timeout=90) as response:  # nosec B310
        return response.read().decode("utf-8-sig")


def _load_json_from_path(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _to_float(value: Any) -> float | None:
    if value in (None, "", "NA", "NaN"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    num = _to_float(value)
    if num is None:
        return None
    try:
        return int(round(num))
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


def parse_latest_poverty_csv(csv_text: str) -> dict[str, float]:
    latest: dict[str, tuple[int, float]] = {}

    reader = csv.DictReader(io.StringIO(csv_text))
    for entry in reader:
        iso = entry.get("country_code") or entry.get("country_iso3")
        value = _to_float(entry.get("reporting_pop_rate") or entry.get("headcount"))
        if not iso or value is None:
            continue

        try:
            year = int(entry.get("reporting_year") or entry.get("year") or "-1")
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
    parser.add_argument("--population-url", default=DEFAULT_POPULATION_URL)
    parser.add_argument("--gini-file", type=Path, help="Load Gini payload from local file instead of URL")
    parser.add_argument(
        "--poverty-file",
        type=Path,
        help="Load poverty CSV from local file instead of URL",
    )
    parser.add_argument(
        "--population-file",
        type=Path,
        help="Load population payload from local file instead of URL",
    )
    args = parser.parse_args()

    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))

    try:
        gini_payload = _load_json_from_path(args.gini_file) if args.gini_file else _load_json_from_url(args.gini_url)
        poverty_text = args.poverty_file.read_text(encoding="utf-8-sig") if args.poverty_file else _load_text_from_url(args.poverty_url)
        population_payload = (
            _load_json_from_path(args.population_file) if args.population_file else _load_json_from_url(args.population_url)
        )
    except Exception as exc:  # pragma: no cover - depends on network/files
        print(f"Failed to load source datasets: {exc}", file=sys.stderr)
        return 1

    gini_by_iso = parse_latest_gini(gini_payload)
    poverty_by_iso = parse_latest_poverty_csv(poverty_text)
    population_by_iso = parse_latest_population(population_payload)

    gini_updates = 0
    poverty_updates = 0
    population_updates = 0

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

        if iso in population_by_iso:
            new_population = population_by_iso[iso]
            if meta.get("population") != new_population:
                meta["population"] = new_population
                population_updates += 1

    args.baseline.write_text(json.dumps(baseline, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    gini_populated = sum(1 for c in baseline.get("countries", []) if c.get("meta", {}).get("giniIndex") is not None)
    poverty_populated = sum(1 for c in baseline.get("countries", []) if c.get("meta", {}).get("povertyPct") is not None)
    population_populated = sum(1 for c in baseline.get("countries", []) if c.get("meta", {}).get("population") is not None)

    print(
        f"Updated giniIndex for {gini_updates} records ({gini_populated} populated); "
        f"updated povertyPct for {poverty_updates} records ({poverty_populated} populated); "
        f"updated population for {population_updates} records ({population_populated} populated)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
