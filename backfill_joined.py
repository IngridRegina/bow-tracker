#!/usr/bin/env python3
"""
Backfill a firstSeen date on members who don't have one yet.

The daily build records firstSeen the first time it sees a member, but everyone
already in the clan when that started would otherwise all show today. This sets
a chosen past date on anyone missing firstSeen, so they don't get flagged as
"new this week" or show a misleading join date.

    python3 backfill_joined.py 2026-07-01

Pass the date you want existing members to show (roughly when the clan was set
up, or just an early date). Members who already have a firstSeen are left alone.
Run once, then delete or ignore it.
"""

import json
import sys

STATE = "tracker-state.json"


def main(date):
    state = json.load(open(STATE, encoding="utf-8"))
    changed = 0
    for m in state.get("members", []):
        if not m.get("firstSeen"):
            m["firstSeen"] = date
            changed += 1
    json.dump(state, open(STATE, "w", encoding="utf-8"), indent=2)
    print(f"set firstSeen={date} on {changed} member(s) that had none")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python3 backfill_joined.py YYYY-MM-DD")
    main(sys.argv[1])
