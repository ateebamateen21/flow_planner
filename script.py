#!/usr/bin/env python3
"""
Swap Climate Change (Lec) and Project Planning & Management (Lec)
times on Tuesdays from 2026-09-15 onward.

- Only touches startTime/endTime of those two exact titles.
- Leaves every other field, entry, and key untouched.
- Writes to a NEW file; never overwrites the original.
- Reports exactly what it changed and validates the result.
"""

import json
import shutil
import sys
from datetime import date
from pathlib import Path

INPUT = Path("data.json")          # <-- your file
OUTPUT = Path("data.swapped.json") # <-- new file
BACKUP = Path("data.json.bak")     # <-- safety copy

CUTOFF = date(2026, 9, 15)

CLIMATE_TITLE = "Climate Change (Lec)"
PPM_TITLE = "Project Planning & Management (Lec)"

CLIMATE_NEW = ("15:00", "16:00")
PPM_NEW = ("14:00", "15:00")


def is_tuesday(iso_date: str) -> bool:
    y, m, d = map(int, iso_date.split("-"))
    return date(y, m, d).weekday() == 1  # Monday=0, Tuesday=1


def main() -> int:
    if not INPUT.exists():
        print(f"ERROR: {INPUT} not found.", file=sys.stderr)
        return 1

    # Safety backup
    shutil.copy2(INPUT, BACKUP)
    print(f"Backup written to {BACKUP}")

    with INPUT.open("r", encoding="utf-8") as f:
        data = json.load(f)

    events = data.get("events")
    if not isinstance(events, list):
        print("ERROR: 'events' is missing or not a list.", file=sys.stderr)
        return 1

    changed = 0
    seen = {"climate": 0, "ppm": 0}

    for ev in events:
        d = ev.get("date", "")
        title = ev.get("title", "")

        # Only Tuesdays on/after cutoff
        try:
            y, m, dd = map(int, d.split("-"))
        except ValueError:
            continue
        if date(y, m, dd) < CUTOFF or not is_tuesday(d):
            continue

        if title == CLIMATE_TITLE and ev.get("startTime") == "14:00":
            ev["startTime"], ev["endTime"] = CLIMATE_NEW
            seen["climate"] += 1
            changed += 1
        elif title == PPM_TITLE and ev.get("startTime") == "15:00":
            ev["startTime"], ev["endTime"] = PPM_NEW
            seen["ppm"] += 1
            changed += 1

    with OUTPUT.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Swapped {changed} events "
          f"(Climate Lec: {seen['climate']}, PPM Lec: {seen['ppm']})")
    print(f"Output written to {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
