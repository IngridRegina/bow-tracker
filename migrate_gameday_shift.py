"""One-off: game_day used to name a day for the date it *starts* on in UTC,
which is one day behind the game's own clock (UTC+7). Fixing game_day relabels
everything built from here on; this shifts the day labels already stored in the
history files by +1 day so old and new readings mean the same thing.

Idempotent it is not — run it exactly once, against files written before the
fix. backups/pre-gameday-shift holds the originals.
"""
import json
from datetime import datetime, timedelta

DAY_KEYED = ("might-history.json", "coords-history.json")
DAY_VALUED = {"member-history.json": ("joined", "lastSeen"),
              "name-history.json": ("firstSeen", "lastSeen")}


def shift(day):
    return (datetime.strptime(day, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")


def main():
    for f in DAY_KEYED:
        d = json.load(open(f, encoding="utf-8"))
        moved = 0
        for pid, row in d.items():
            d[pid] = {shift(k): v for k, v in row.items()}
            moved += len(row)
        json.dump(d, open(f, "w", encoding="utf-8"), indent=1)
        print(f"{f}: {moved} day(s) shifted across {len(d)} member(s)")

    for f, fields in DAY_VALUED.items():
        d = json.load(open(f, encoding="utf-8"))
        rows = d.values() if isinstance(d, dict) else d
        moved = 0
        for row in rows:
            for entry in (row if isinstance(row, list) else [row]):
                for k in fields:
                    if entry.get(k):
                        entry[k] = shift(entry[k])
                        moved += 1
        json.dump(d, open(f, "w", encoding="utf-8"), indent=1)
        print(f"{f}: {moved} date(s) shifted")


if __name__ == "__main__":
    main()
