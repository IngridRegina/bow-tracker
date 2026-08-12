#!/usr/bin/env python3
"""
Turn Total Battle HAR captures into a state file the BOW tracker can import.

    python3 build_state.py capture1.har capture2.har [--merge old-tracker.json]

Writes tracker-state.json. Load it with "Load a JSON backup" in the Data tab.

--merge keeps the things the game does not tell us (ranks, the inactive and
ingot flags) from a tracker export you downloaded earlier, matching on player
name. Without it, everyone lands as Veteran and you re-set the ranks by hand.
"""

import argparse
import base64
import os
import json
import re
from datetime import datetime, timedelta, timezone

from mp import MP

REALM_URL = re.compile(r"/rubens-realm\d+")
LEDGER = "chest-ledger.json"
EVENT_LEDGER = "event-ledger.json"
NAMES_FILE = "names.json"
STATE_FILE = "public/tracker-state.json"
# Speedup item ids to hours, verified against the in-game log wording.
# 2055 and 2056 are guesses at the 3-day and 7-day items; only 3 instances so far.
SPEEDUPS = {2050: 1, 2051: 3, 2052: 8, 2053: 15, 2054: 24, 2055: 72, 2056: 168}
RESOURCES = {2: "silver", 3: "lumber", 4: "iron", 5: "stone", 6: "food", 20: "tractates"}

# The clan roster carries a rank code per member, so ranks no longer have to be
# maintained by hand. Codes 1, 2, 4 and 5 are confirmed against every capture we
# have; 3 was in use until the 2026-08-11 reshuffle and is inferred from its
# position in the ladder. Code 6 has never appeared — the game ladder looks to
# be five deep, so "Member" in the site's RANKS list is simply never produced.
RANK_CODES = {1: "Leader", 2: "Superior", 3: "Officer", 4: "Veteran", 5: "Soldier"}

# Player rows carry the member's timezone as a display string, oddly encoded:
# the hours negated, then a literal '0', then the minutes negated. So UTC+1:00
# is "(UTC-100)" — that is "-1", "0", "0", not minus one hundred minutes — and
# UTC+3:30 is "(UTC-30-30)". Verified against every value in every capture.
TZ_RE = re.compile(r"^\(UTC([+-]\d{1,2})0(-?\d+)\)$")


def parse_tz(s):
    """The member's UTC offset in minutes east of UTC, or None if not set."""
    m = TZ_RE.match(s or "")
    return None if not m else -int(m.group(1)) * 60 + -int(m.group(2))

# Day and week both roll at 20:00 Estonian summer time == 17:00 UTC.
BOUNDARY_UTC_HOUR = 17

# Clan chests carry an expiry timestamp, not a production one. They last
# 20 hours, so subtract that to get when the chest was actually made.
CHEST_TTL = 20 * 3600

# Clan capital, taken from the densest cluster of member coordinates.
# Members within CAPITAL_RADIUS tiles are treated as living in clan territory.
CAPITAL = (659, 445)
CAPITAL_RADIUS = 60


# ---------------------------------------------------------------- decoding

def decode_body(raw):
    out, m = [], MP(raw, little=True, off=8)
    while m.i < len(raw):
        start = m.i
        try:
            out.append(m.read())
        except Exception:
            m.i = start + 1
            if m.i >= len(raw):
                break
    return out


def walk(node):
    if isinstance(node, list):
        yield node
        for x in node:
            yield from walk(x)
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from walk(k)
            yield from walk(v)


def is_player(row):
    return (
        isinstance(row, list) and len(row) > 15
        and isinstance(row[0], list) and isinstance(row[1], str)
        and row[1].startswith("tb:") and isinstance(row[2], str)
    )


def is_chest_list(row):
    """Unopened clan chests: [chest_id, [producer_id], type, ts, 1, 1] repeated."""
    if not (isinstance(row, list) and len(row) >= 3):
        return False
    for x in row:
        if not (isinstance(x, list) and len(x) == 6):
            return False
        if not isinstance(x[0], int) or not isinstance(x[1], list) or len(x[1]) != 1:
            return False
        if not isinstance(x[3], int) or not (1_600_000_000 < x[3] < 2_200_000_000):
            return False
    return True


def is_clan_member(row):
    """A clan roster entry: [[player_id], rank_code, joined_ts]."""
    return (
        isinstance(row, list) and len(row) == 3
        and isinstance(row[0], list) and len(row[0]) == 1
        and isinstance(row[0][0], int) and row[0][0] > 1_000_000_000_000
        and isinstance(row[1], int) and not isinstance(row[1], bool) and 1 <= row[1] <= 8
        and isinstance(row[2], int) and 1_600_000_000 < row[2] < 2_200_000_000
    )


def is_event(row):
    return (
        isinstance(row, list) and len(row) == 6
        and isinstance(row[0], int) and isinstance(row[1], list) and len(row[1]) == 1
        and isinstance(row[4], int) and 1_600_000_000 < row[4] < 2_200_000_000
        and isinstance(row[5], list)
    )


def read_hars(paths):
    players, events, chests, roster = {}, {}, {}, {}
    for path in paths:
        for entry in json.load(open(path, encoding="utf-8"))["log"]["entries"]:
            if entry["request"]["method"] != "POST":
                continue
            if not REALM_URL.search(entry["request"]["url"]):
                continue
            content = entry["response"]["content"]
            text = content.get("text")
            if not text:
                continue
            raw = base64.b64decode(text) if content.get("encoding") == "base64" else text.encode("latin1")
            for obj in decode_body(raw):
                for row in walk(obj):
                    if is_player(row):
                        players[row[0][0]] = {
                            "name": row[2],
                            "might": row[10] if isinstance(row[10], int) else 0,
                            "level": row[7] if isinstance(row[7], int) else 0,
                            "clan": row[13] if isinstance(row[13], str) else "",
                            "coords": row[15] if isinstance(row[15], list) else None,
                            "country": row[3] if isinstance(row[3], str) else "",
                            "tz": row[21] if len(row) > 21 and isinstance(row[21], str) else "",
                        }
                    elif is_clan_member(row):
                        roster[row[0][0]] = {"rank": row[1], "joined": row[2]}
                    elif is_chest_list(row):
                        for cid, pid, ctype, ts, _a, _b in row:
                            chests[cid] = {"producer": pid[0], "type": ctype, "ts": ts}
                    elif is_event(row):
                        events[row[0]] = {
                            "player_id": row[1][0],
                            "kind": row[2],
                            "ts": row[4],
                            "amounts": row[5][0] if isinstance(row[5][0], dict) else {},
                        }
    return players, events, chests, roster


# ---------------------------------------------------------------- dates

def game_day(ts):
    return datetime.fromtimestamp(ts - BOUNDARY_UTC_HOUR * 3600, timezone.utc).strftime("%Y-%m-%d")


def week_start(day):
    d = datetime.strptime(day, "%Y-%m-%d")
    return (d - timedelta(days=(d.weekday() + 1) % 7)).strftime("%Y-%m-%d")


def in_territory(coords):
    if not coords or len(coords) < 3:
        return False
    dx, dy = coords[1] - CAPITAL[0], coords[2] - CAPITAL[1]
    return (dx * dx + dy * dy) ** 0.5 <= CAPITAL_RADIUS


def build_members(players, prev_members, old_by_name, ranks_by_id, ranks_by_name, roster=None):
    """One record per current clan member, keeping flags from previous state.

    Rank and join date both come from the capture's own clan roster when it is
    there. That is current (promotions and demotions are picked up on their
    own) and keyed by player id, so the two Aydaens and the two Enanings
    resolve correctly — which name-keyed ranks.json entries cannot do.
    ranks.json is only a fallback now, for captures without a roster.
    """
    roster = roster or {}
    today = game_day(datetime.now(timezone.utc).timestamp())
    out = []
    for pid, p in players.items():
        prev = prev_members.get(str(pid)) or old_by_name.get(p["name"], {})
        entry = roster.get(pid, {})
        rank = RANK_CODES.get(entry.get("rank"))
        # The roster carries the real join timestamp, so prefer it over the
        # "first capture we saw them in" guess — that one is only right for
        # members who arrived after tracking started.
        joined = game_day(entry["joined"]) if entry.get("joined") else None
        out.append({
            "id": str(pid),                       # game player id, stable across renames
            "name": p["name"],
            "might": p["might"],
            "level": p["level"],
            "rank": rank or ranks_by_id.get(str(pid)) or ranks_by_name.get(p["name"]) or prev.get("rank") or "Veteran",
            "inTerritory": in_territory(p["coords"]),
            "inactive": prev.get("inactive", False),
            "ingots": prev.get("ingots", False),
            "firstSeen": joined or prev.get("firstSeen") or today,
            # profile country, ISO 3166-1 alpha-2
            "country": p.get("country") or prev.get("country") or "",
            # minutes east of UTC; kept from the previous state when a capture
            # happens not to carry it, since it rarely changes
            "utcOffset": parse_tz(p.get("tz")) if parse_tz(p.get("tz")) is not None else prev.get("utcOffset"),
        })
    return out


# ---------------------------------------------------------------- build

def build(har_paths, merge_path=None, clan="BOW", ranks_path=None):
    players, events, chests, roster = read_hars(har_paths)

    # A permanent id -> name map of everyone ever seen, so people who have since
    # left the clan still show a name rather than a bare id in the "former
    # members" line. Names captured here before the clan filter below.
    names = {}
    if os.path.exists(NAMES_FILE):
        names = json.load(open(NAMES_FILE, encoding="utf-8"))
    for pid, p in players.items():
        names[str(pid)] = p["name"]
    json.dump(names, open(NAMES_FILE, "w", encoding="utf-8"), indent=1)

    # Chest producer data only exists while a chest is unopened, so every
    # capture contributes a slice. Keep a running ledger, deduped by chest id,
    # or anything opened between captures is lost for good.
    ledger = {}
    if os.path.exists(LEDGER):
        ledger = json.load(open(LEDGER, encoding="utf-8"))
    before = len(ledger)
    ledger.update({str(k): v for k, v in chests.items()})
    json.dump(ledger, open(LEDGER, "w", encoding="utf-8"), indent=1)
    print(f"chest ledger: {before} known, {len(ledger) - before} new, {len(ledger)} total")
    players = {pid: p for pid, p in players.items() if p["clan"] == clan}

    prev_state = {}
    if os.path.exists(STATE_FILE):
        prev_state = json.load(open(STATE_FILE, encoding="utf-8"))
    prev_members = {m["id"]: m for m in prev_state.get("members", [])}

    ranks = json.load(open(ranks_path, encoding="utf-8")) if ranks_path else {}
    # ranks.json supports two formats:
    #   simple:  { "player_id": "Officer" }
    #   rich:    { "player_id": { "name": "X", "might": 123, "rank": "Officer" } }
    # id takes priority; name is a fallback for convenience.
    ranks_by_id = {}
    ranks_by_name = {}
    for k, v in ranks.items():
        if isinstance(v, dict):
            ranks_by_id[k] = v["rank"]
        elif k.isdigit():
            ranks_by_id[k] = v
        else:
            ranks_by_name[k] = v

    old_by_name = {}
    if merge_path:
        old = json.load(open(merge_path, encoding="utf-8"))
        for m in old.get("members", []):
            old_by_name[m["name"]] = m

    if len(players) < max(10, len(prev_members) // 2) and prev_members:
        # A capture with no Members screen in it. Keep the roster we already had
        # rather than wiping it.
        members = list(prev_members.values())
        print(f"capture has no full member list ({len(players)} found), keeping {len(members)} known member(s)")
    else:
        members = build_members(players, prev_members, old_by_name, ranks_by_id, ranks_by_name, roster)
    members.sort(key=lambda m: -m["might"])

    if roster:
        got = sum(1 for m in members if int(m["id"]) in roster)
        spread = {}
        for m in members:
            code = roster.get(int(m["id"]), {}).get("rank")
            if code:
                label = RANK_CODES.get(code, f"code {code}")
                spread[label] = spread.get(label, 0) + 1
        print(f"clan roster: rank + join date read from capture for {got}/{len(members)} member(s)  {spread}")
        unknown = sorted({e["rank"] for e in roster.values() if e["rank"] not in RANK_CODES})
        if unknown:
            print(f"  !! unrecognised rank code(s) {unknown} — add them to RANK_CODES")

    # Ask about anyone the capture could not rank. This used to run at the end of
    # build(), after the dump, so a rank entered here reached ranks.json but not
    # tracker-state.json — the site kept showing the default Veteran until the
    # next run happened to read the rank back in.
    if merge_path or ranks_by_id or ranks_by_name:
        missing = [m for m in members if int(m["id"]) not in roster
                   and m["name"] not in old_by_name
                   and m["id"] not in ranks_by_id and m["name"] not in ranks_by_name]
        if missing:
            print(f"\n{len(missing)} member(s) with no rank in the capture or ranks.json:")
            rank_options = {str(i): r for i, r in enumerate(["Leader", "Superior", "Officer", "Veteran", "Member", "Soldier"], 1)}
            for m in missing:
                print(f"  {m['name']} ({m['might']:,} might)")
                print(f"    1=Leader  2=Superior  3=Officer  4=Veteran  5=Member  6=Soldier")
                while True:
                    try:
                        choice = input(f"    Rank for {m['name']}? [4=Veteran]: ").strip()
                    except EOFError:
                        choice = ""
                        print("    (no input available, using Veteran)")
                    if choice == "":
                        choice = "4"
                    if choice in rank_options:
                        m["rank"] = rank_options[choice]
                        break
                    print("    Enter 1-6.")
    # Write every current member back to ranks.json, keyed by id. It is no
    # longer the source of truth — the capture is — but keeping it in step
    # leaves a readable record and a usable fallback for a capture that comes
    # in without a roster. Name-keyed leftovers for members we now have an id
    # entry for are dropped, since they cannot tell two same-named players
    # apart anyway.
    if ranks_path and members:
        by_name_now = {m["name"] for m in members}
        for m in members:
            p = players.get(int(m["id"]))
            ranks[m["id"]] = {
                "name": m["name"],
                "might": p["might"] if p else m["might"],
                "rank": m["rank"],
            }
        stale = [k for k, v in ranks.items() if not str(k).isdigit() and k in by_name_now]
        for k in stale:
            del ranks[k]
        json.dump(ranks, open(ranks_path, "w", encoding="utf-8"), indent=2)
        print(f"ranks.json: {len(members)} member(s) written"
              + (f", {len(stale)} name-keyed duplicate(s) removed" if stale else ""))

    # Contributions are attributed against the full known roster, not just the
    # players who happened to appear in this capture. Otherwise a capture
    # missing one member silently drops all of their chests and donations.
    current_ids = {m["id"] for m in members}
    name_of = {m["id"]: m["name"] for m in members}
    for k, v in names.items():
        name_of.setdefault(str(k), v)
    for k, v in prev_members.items():
        name_of.setdefault(str(k), v.get("name", str(k)))
    for k, v in ranks.items():
        if isinstance(v, dict):
            name_of.setdefault(str(k), v.get("name", str(k)))

    known_ids = {int(m["id"]) for m in members}
    known_ids |= {int(k) for k in prev_members if str(k).isdigit()}
    known_ids |= {int(k) for k in ranks_by_id if str(k).isdigit()}


    # Donations and speedups accumulate in their own ledger, keyed by content
    # rather than by the game's sequence number, which can be reused. The game
    # only sends about two weeks of history, so without this, older weeks would
    # be wiped every time a capture partially covered them.
    elog = {}
    if os.path.exists(EVENT_LEDGER):
        elog = json.load(open(EVENT_LEDGER, encoding="utf-8"))
    before_e = len(elog)
    for e in events.values():
        amounts = {str(k): v for k, v in e["amounts"].items()}
        key = f"{e['ts']}:{e['player_id']}:{e['kind']}:" + ",".join(f"{k}={amounts[k]}" for k in sorted(amounts))
        elog[key] = {"player_id": e["player_id"], "kind": e["kind"], "ts": e["ts"], "amounts": amounts}
    json.dump(elog, open(EVENT_LEDGER, "w", encoding="utf-8"), indent=1)
    print(f"event ledger: {before_e} known, {len(elog) - before_e} new, {len(elog)} total")

    # Last day a member did something we can see: donated, sent speedups or
    # produced a clan chest. Not a login time — the game does not expose one —
    # so someone playing without contributing looks quiet here.
    last_act = {}
    for e in elog.values():
        pid = str(e["player_id"])
        last_act[pid] = max(last_act.get(pid, 0), int(e["ts"]))
    for c in ledger.values():
        pid = str(c["producer"])
        last_act[pid] = max(last_act.get(pid, 0), int(c["ts"]) - CHEST_TTL)
    for m in members:
        ts = last_act.get(m["id"])
        m["lastActive"] = game_day(ts) if ts else None
    seen = sum(1 for m in members if m["lastActive"])
    print(f"last contribution known for {seen}/{len(members)} member(s)")

    weeks = {}

    # Carry over any week the ledgers no longer reach, so nothing is ever lost.
    for key, pw in prev_state.get("weeks", {}).items():
        weeks[key] = pw
    if weeks:
        print(f"loaded {len(weeks)} existing week(s) from {STATE_FILE}")

    current_week_key = week_start(game_day(datetime.now(timezone.utc).timestamp()))

    def week_for(day):
        key = min(week_start(day), current_week_key)
        if key not in weeks:
            weeks[key] = {"start": key, "mights": {}, "donations": {}, "chests": {}, "speedups": {}}
        return weeks[key]

    # Rebuild donations and speedups from the full event ledger. Weeks the
    # ledger covers are replaced wholesale, so re-running never double-counts.
    from_events = {}
    for ev in elog.values():
        pid = str(ev["player_id"])
        if int(pid) not in known_ids:
            continue
        key = week_start(game_day(ev["ts"]))
        w = from_events.setdefault(key, {"donations": {}, "speedups": {}})
        if ev["kind"] == 2:
            hours = sum(SPEEDUPS.get(int(k), 0) * v for k, v in ev["amounts"].items())
            if hours:
                w["speedups"][pid] = w["speedups"].get(pid, 0) + hours
        elif ev["kind"] in (3, 4):
            row = w["donations"].setdefault(pid, {})
            for k, v in ev["amounts"].items():
                name = RESOURCES.get(int(k))
                if name:
                    row[name] = row.get(name, 0) + v

    for key, data in from_events.items():
        w = week_for(key)
        w["donations"] = data["donations"]
        w["speedups"] = data["speedups"]

    # Contributions from people who have since left. Kept out of the main
    # figures so "X of Y members donated" stays honest, but not thrown away.
    for key, w in weeks.items():
        former = {
            "donors": sorted({name_of.get(p, p) for p in w.get("donations", {}) if p not in current_ids}),
            "chests": sorted({name_of.get(p, p) for p in w.get("chests", {}) if p not in current_ids}),
            "speedups": sorted({name_of.get(p, p) for p in w.get("speedups", {}) if p not in current_ids}),
        }
        if any(former.values()):
            w["former"] = former
        else:
            w.pop("former", None)

    # Chest counts are rebuilt from the ledger each run. Merge with whatever
    # was already in the state using max(), so re-running never inflates counts
    # and hand-entered history (from before the ledger existed) survives.
    from_ledger = {}
    for c in ledger.values():
        pid = str(c["producer"])
        if int(pid) not in known_ids:
            continue
        day = game_day(c["ts"] - CHEST_TTL)
        key = week_start(day)
        from_ledger.setdefault(key, {}).setdefault(pid, {})
        from_ledger[key][pid][day] = from_ledger[key][pid].get(day, 0) + 1

    for key, per_player in from_ledger.items():
        w = week_for(key)
        for pid, days in per_player.items():
            existing = w["chests"].setdefault(pid, {})
            for day, n in days.items():
                existing[day] = max(existing.get(day, 0), n)

    # Might snapshot per week. Only current might is known, so older weeks
    # inherit it; correct going forward, approximate for history.
    for w in weeks.values():
        for m in members:
            w["mights"][m["id"]] = m["might"]

    today = game_day(datetime.now(timezone.utc).timestamp())
    current = week_start(today)
    week_for(today)

    # When this run happened, so the page can show "last updated".
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    state = {"generatedAt": generated_at, "members": members, "currentWeek": current, "weeks": weeks}
    json.dump(state, open("public/tracker-state.json", "w", encoding="utf-8"), indent=2)

    print(f"members: {len(members)}   weeks: {len(weeks)}   current: {current}")
    for key in sorted(weeks):
        w = weeks[key]
        cur = lambda d: sum(1 for p in d if p in current_ids)
        f = w.get("former", {})
        extra = ""
        if f:
            bits = [f"{len(f[k])} {k}" for k in ("donors", "chests", "speedups") if f[k]]
            extra = "   [former: " + ", ".join(bits) + "]"
        print(f"  {key}  donors {cur(w['donations']):>3}  chest producers {cur(w['chests']):>3}"
              f"  speeders {cur(w['speedups']):>3} ({sum(w['speedups'].values())}h){extra}")
    print("\nwritten to public/tracker-state.json")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("hars", nargs="+")
    ap.add_argument("--merge", help="an existing tracker JSON export to keep ranks and flags from")
    ap.add_argument("--ranks", help="a JSON file mapping player name to rank")
    a = ap.parse_args()
    build(a.hars, a.merge, ranks_path=a.ranks)
