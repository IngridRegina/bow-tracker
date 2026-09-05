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
from collections import Counter
from datetime import datetime, timedelta, timezone

from mp import MP

REALM_URL = re.compile(r"/rubens-realm\d+")
LEDGER = "chest-ledger.json"
EVENT_LEDGER = "event-ledger.json"
NAMES_FILE = "names.json"
# Every name each player id has gone by, with the days it was seen in use.
# Renames are common and names are not unique, so a card cannot explain who
# someone used to be without this.
NAME_HISTORY = "name-history.json"
OVERRIDES_FILE = "overrides.json"
# Who has ever been in the clan, and when we last saw them in it. The game
# never says "X left" — departed members simply stop appearing in the roster —
# so a leaving date can only be "the last day they were still listed".
MEMBER_HISTORY = "member-history.json"
# Might per member per day. The game does not send a last-online time — it is
# shown in the client but never appears in any captured response — so a stalled
# might is the closest thing to an activity signal we can actually derive.
MIGHT_HISTORY = "might-history.json"
# Where each member's city sat, per day. Kept as coordinates rather than a
# yes/no so the answer can be recomputed if the capital moves or the radius is
# retuned, and kept out of public/ since the site only ever needs the counts.
COORDS_HISTORY = "coords-history.json"
# Days of flat might before a member is worth a second look.
STALL_DAYS = 3
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


def first_set(*values):
    """First value that is not None. Unlike `or`, keeps a legitimate 0."""
    return next((v for v in values if v is not None), None)

# Day and week both roll at 20:00 Estonian summer time == 17:00 UTC, which is
# midnight on the game server's own clock, UTC+7. A game-day is therefore named
# for its date in UTC+7 — the date it ends on in UTC, not the one it starts on.
BOUNDARY_UTC_HOUR = 17
SERVER_UTC_OFFSET = 24 - BOUNDARY_UTC_HOUR

# Clan chests carry an expiry timestamp, not a production one. They last
# 20 hours, so subtract that to get when the chest was actually made.
CHEST_TTL = 20 * 3600

# Where the clan's capital sits, and how far out still counts as "near".
#
# The captures do carry real clan structures — the capital and its towers, as
# map objects owning a position — but only whatever part of the map the client
# had loaded at the time, so tower counts swing between 0 and 31 from one
# capture to the next. There is no territory polygon or tile list anywhere in
# them. The capital is the one piece that is stable, so it is read from the
# capture when present (see find_capital) and this constant is only the
# fallback for a capture that does not include it.
CAPITAL = (660, 432)
CAPITAL_RADIUS = 60

# Map objects are 43-field rows; these are the type codes we care about.
OBJ_CLAN_CAPITAL = 10001


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
    """Unopened clan chests, repeated:

        [chest_id, [producer_id], type, expiry_ts, count, tier]

    `count` is a stack size, not always 1 — chests won in bulk arrive as a
    single row with the same id and timestamp, shown in game as "x53". It was
    read as 1 per row until 2026-08-20, which undercounted the ledger by 40%.
    """
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


def is_map_object(row):
    """A thing standing on the map: 43 fields, an owner at [4], a type at [3]
    and its position at [17] as [realm, x, y]."""
    return (
        isinstance(row, list) and len(row) == 43
        and isinstance(row[3], int)
        and isinstance(row[4], list) and len(row[4]) == 1
        and isinstance(row[17], list) and len(row[17]) == 3
        and all(isinstance(v, int) for v in row[17])
    )


def is_event(row):
    return (
        isinstance(row, list) and len(row) == 6
        and isinstance(row[0], int) and isinstance(row[1], list) and len(row[1]) == 1
        and isinstance(row[4], int) and 1_600_000_000 < row[4] < 2_200_000_000
        and isinstance(row[5], list)
    )


def read_hars(paths):
    players, events, chests, roster, map_objects = {}, {}, {}, {}, []
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
                            "clan_entity": row[11][0] if isinstance(row[11], list) and row[11] else None,
                        }
                    elif is_map_object(row):
                        map_objects.append({"type": row[3], "owner": row[4][0], "pos": (row[17][1], row[17][2])})
                    elif is_clan_member(row):
                        roster[row[0][0]] = {"rank": row[1], "joined": row[2]}
                    elif is_chest_list(row):
                        for cid, pid, ctype, ts, count, _tier in row:
                            chests[cid] = {"producer": pid[0], "type": ctype, "ts": ts,
                                           "count": count if isinstance(count, int) else 1}
                    elif is_event(row):
                        events[row[0]] = {
                            "player_id": row[1][0],
                            "kind": row[2],
                            "ts": row[4],
                            "amounts": row[5][0] if isinstance(row[5][0], dict) else {},
                        }
    return players, events, chests, roster, map_objects


# ---------------------------------------------------------------- dates

def game_day(ts):
    """The game-day a moment falls in, named the way the game names it: the
    date on the server clock, UTC+7. The day labelled 31 August therefore runs
    from 30 Aug 17:00 UTC to 31 Aug 17:00 UTC, and August's last donation is
    the one made at 16:59 UTC on the 31st — not a day later."""
    return datetime.fromtimestamp(ts + SERVER_UTC_OFFSET * 3600, timezone.utc).strftime("%Y-%m-%d")


def last_calendar_day(mkey):
    """The final game-day of a YYYY-MM month."""
    y, m = (int(x) for x in mkey.split("-"))
    first_next = datetime(y + m // 12, m % 12 + 1, 1, tzinfo=timezone.utc)
    return (first_next - timedelta(days=1)).strftime("%Y-%m-%d")


def week_start(day):
    """The Monday that starts this game-day's week. Weeks run Monday's game-day
    through Sunday's, so they cover Sunday 17:00 UTC through the following
    Sunday 16:59:59 UTC — Sunday 17:00 UTC is when the next week's first
    game-day (Monday) begins."""
    d = datetime.strptime(day, "%Y-%m-%d")
    return (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")


def daysbetween(a, b):
    """Whole days from date string a to date string b."""
    return (datetime.strptime(b, "%Y-%m-%d") - datetime.strptime(a, "%Y-%m-%d")).days


def capture_day(events, chests, fallback_ts=None):
    """The game-day this capture was taken, read from the freshest thing in it
    rather than from the clock, so re-processing an old capture still dates its
    roster correctly."""
    stamps = [e["ts"] for e in events.values()]
    stamps += [c["ts"] - CHEST_TTL for c in chests.values()]
    return game_day(max(stamps) if stamps else (fallback_ts or datetime.now(timezone.utc).timestamp()))


def find_capital(map_objects, players):
    """The clan's capital as the game reports it, or None if this capture did
    not happen to include that part of the map."""
    entities = Counter(p["clan_entity"] for p in players.values() if p.get("clan_entity"))
    if not entities:
        return None
    ours = entities.most_common(1)[0][0]
    spots = Counter(o["pos"] for o in map_objects if o["owner"] == ours and o["type"] == OBJ_CLAN_CAPITAL)
    return spots.most_common(1)[0][0] if spots else None


def in_territory(coords, capital):
    if not coords or len(coords) < 3:
        return False
    dx, dy = coords[1] - capital[0], coords[2] - capital[1]
    return (dx * dx + dy * dy) ** 0.5 <= CAPITAL_RADIUS


def build_members(players, prev_members, old_by_name, ranks_by_id, ranks_by_name, roster=None, overrides=None, capital=CAPITAL):
    """One record per current clan member, keeping flags from previous state.

    Rank and join date both come from the capture's own clan roster when it is
    there. That is current (promotions and demotions are picked up on their
    own) and keyed by player id, so the two Aydaens and the two Enanings
    resolve correctly — which name-keyed ranks.json entries cannot do.
    ranks.json is only a fallback now, for captures without a roster.
    """
    roster = roster or {}
    overrides = overrides or {}
    today = game_day(datetime.now(timezone.utc).timestamp())
    out = []
    for pid, p in players.items():
        prev = prev_members.get(str(pid)) or old_by_name.get(p["name"], {})
        entry = roster.get(pid, {})
        over = overrides.get(str(pid), {})
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
            "inTerritory": in_territory(p["coords"], capital),
            "inactive": prev.get("inactive", False),
            "ingots": prev.get("ingots", False),
            "firstSeen": joined or prev.get("firstSeen") or today,
            # profile country, ISO 3166-1 alpha-2
            "country": p.get("country") or prev.get("country") or "",
            # minutes east of UTC. What the game reports wins; overrides.json
            # fills in members who left the field blank in their profile, and
            # the previous state covers a capture that happened not to carry it
            "utcOffset": first_set(parse_tz(p.get("tz")), over.get("utcOffset"), prev.get("utcOffset")),
        })
    return out


# ---------------------------------------------------------------- build

def build(har_paths, merge_path=None, clan="BOW", ranks_path=None):
    players, events, chests, roster, map_objects = read_hars(har_paths)

    # What day this capture speaks for. Needed here to date name changes, and
    # again further down for the roster; events and chests are never rebound in
    # between, so one call answers both.
    seen_on = capture_day(events, chests)

    # A permanent id -> name map of everyone ever seen, so people who have since
    # left the clan still show a name rather than a bare id in the "former
    # members" line. Names captured here before the clan filter below.
    names = {}
    if os.path.exists(NAMES_FILE):
        names = json.load(open(NAMES_FILE, encoding="utf-8"))
    for pid, p in players.items():
        names[str(pid)] = p["name"]
    json.dump(names, open(NAMES_FILE, "w", encoding="utf-8"), indent=1)

    # Every name an id has gone by, oldest first. names.json only ever holds
    # the current one, so before this a rename left no trace except in the git
    # history of that file — and two renames between commits would have lost
    # the middle name entirely.
    #
    # This is worth keeping because names are not unique: two live members were
    # both called Enaning through August, and one of them has since become
    # Emil, so "Enaning left the clan" and "Enaning is still here under a new
    # name" were both true of different accounts at once. Only the id settles
    # it, and the card can only explain it if the old names are recorded.
    name_hist = {}
    if os.path.exists(NAME_HISTORY):
        name_hist = json.load(open(NAME_HISTORY, encoding="utf-8"))
    renamed = []
    for pid, p in players.items():
        row = name_hist.setdefault(str(pid), [])
        if row and row[-1]["name"] == p["name"]:
            row[-1]["lastSeen"] = max(row[-1]["lastSeen"], seen_on)
        elif not any(e["name"] == p["name"] for e in row):
            if row:
                renamed.append((row[-1]["name"], p["name"]))
            row.append({"name": p["name"], "firstSeen": seen_on, "lastSeen": seen_on})
        else:
            # A name they have used before, come back round again. Keep the
            # order as "most recently adopted last" rather than duplicating.
            prev = next(e for e in row if e["name"] == p["name"])
            row.remove(prev)
            prev["lastSeen"] = max(prev["lastSeen"], seen_on)
            renamed.append((row[-1]["name"], p["name"]))
            row.append(prev)
    json.dump(name_hist, open(NAME_HISTORY, "w", encoding="utf-8"), indent=1)
    if renamed:
        print("name changes: " + ", ".join(f"{a} -> {b}" for a, b in renamed))

    # Chest producer data only exists while a chest is unopened, so every
    # capture contributes a slice. Keep a running ledger, deduped by chest id,
    # or anything opened between captures is lost for good.
    ledger = {}
    if os.path.exists(LEDGER):
        ledger = json.load(open(LEDGER, encoding="utf-8"))
    before = len(ledger)
    ledger.update({str(k): v for k, v in chests.items()})
    json.dump(ledger, open(LEDGER, "w", encoding="utf-8"), indent=1)
    # Rows and chests differ: one row can be a stack of many (see is_chest_list).
    total = sum(c.get("count", 1) for c in ledger.values())
    print(f"chest ledger: {before} known, {len(ledger) - before} new, "
          f"{len(ledger)} rows / {total} chests total")
    players = {pid: p for pid, p in players.items() if p["clan"] == clan}

    # Hand-set values for anything the game leaves blank, keyed by player id.
    overrides = {}
    if os.path.exists(OVERRIDES_FILE):
        overrides = {k: v for k, v in json.load(open(OVERRIDES_FILE, encoding="utf-8")).items() if k.isdigit()}

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

    # Read the capital off the capture; fall back to the last one we knew, then
    # to the constant, since a capture only carries the map region the client
    # had open and may not include it at all.
    found_capital = find_capital(map_objects, players)
    capital = tuple(found_capital or prev_state.get("capital") or CAPITAL)
    print(f"clan capital: {capital}"
          + ("" if found_capital else "  (not in this capture, kept from before)"))

    if len(players) < max(10, len(prev_members) // 2) and prev_members:
        # A capture with no Members screen in it. Keep the roster we already had
        # rather than wiping it — but remember that these figures were not
        # actually observed now, so nothing dated gets written from them.
        members = list(prev_members.values())
        roster_observed = False
        print(f"capture has no full member list ({len(players)} found), keeping {len(members)} known member(s)")
    else:
        roster_observed = True
        members = build_members(players, prev_members, old_by_name, ranks_by_id, ranks_by_name, roster, overrides, capital)
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

    # Everyone who has ever been in the clan, with the last day we saw them in
    # it. Current members are refreshed; anyone in the ledger who is no longer
    # on the roster becomes a former member, dated to their last sighting.
    history = {}
    if os.path.exists(MEMBER_HISTORY):
        history = json.load(open(MEMBER_HISTORY, encoding="utf-8"))
    for m in members if roster_observed else []:
        was = history.get(m["id"], {})
        history[m["id"]] = {
            "name": m["name"],
            "rank": m["rank"],
            "might": m["might"],
            "joined": m["firstSeen"],
            # never walk the last sighting backwards when an older capture is
            # re-processed after a newer one
            "lastSeen": max(seen_on, was.get("lastSeen", "")),
        }
    json.dump(history, open(MEMBER_HISTORY, "w", encoding="utf-8"), indent=1)

    current_member_ids = {m["id"] for m in members}
    # not `former`: that name is taken further down by the per-week list of
    # people who contributed to a week but are no longer on the roster
    former_members = [
        {"id": k, **v, "via": "roster"}
        for k, v in history.items()
        if k not in current_member_ids
    ]

    # People who show up in the ledgers having donated, sent speedups or made
    # chests for the clan, but who were gone before any capture caught them on
    # the roster. All we can say is the last day they contributed — no rank and
    # no join date. Ones we have no name for are skipped: a bare id tells the
    # reader nothing they can act on.
    contributed = {}
    for e in elog.values():
        pid = str(e["player_id"])
        contributed[pid] = max(contributed.get(pid, ""), game_day(int(e["ts"])))
    for c in ledger.values():
        pid = str(c["producer"])
        contributed[pid] = max(contributed.get(pid, ""), game_day(int(c["ts"]) - CHEST_TTL))

    strangers = [pid for pid, _ in contributed.items()
                 if pid not in history and pid not in current_member_ids]
    ghosts = [
        {"id": pid, "name": names[pid], "lastSeen": contributed[pid], "via": "contributions"}
        for pid in strangers
        if names.get(pid)
    ]
    former_members = sorted(former_members + ghosts,
                            key=lambda m: (m["lastSeen"], m["name"]), reverse=True)

    print(f"member history: {len(history)} ever seen, {len(former_members)} no longer in the clan"
          f" ({len(ghosts)} of them known only from contributions;"
          f" {len(strangers) - len(ghosts)} more skipped for having no name)"
          f" — this capture dated {seen_on}")

    # Might per member per day, and from it the last day each one grew. Might
    # only ever goes up through play, so a flat line means nobody has been
    # building, researching or training — a decent proxy for an absent player,
    # though a member can log in daily and still not move it.
    mights = {}
    if os.path.exists(MIGHT_HISTORY):
        mights = json.load(open(MIGHT_HISTORY, encoding="utf-8"))
    for m in members if roster_observed else []:
        row = mights.setdefault(m["id"], {})
        # highest reading that day: two captures on one day should not look
        # like a fall
        row[seen_on] = max(row.get(seen_on, 0), m["might"])
    json.dump(mights, open(MIGHT_HISTORY, "w", encoding="utf-8"), indent=1)

    for m in members:
        days = sorted(mights.get(m["id"], {}).items())
        rose_on = days[0][0] if days else None
        for (_, before), (day, after) in zip(days, days[1:]):
            if after > before:
                rose_on = day
        m["mightRoseOn"] = rose_on
        m["mightFlatDays"] = daysbetween(rose_on, seen_on) if rose_on else None
        m["daysTracked"] = len(days)

    stalled = [m for m in members if (m["mightFlatDays"] or 0) >= STALL_DAYS]
    print(f"might history: {len(mights)} member(s) tracked over"
          f" {len({d for r in mights.values() for d in r})} day(s);"
          f" {len(stalled)} flat for {STALL_DAYS}+ days")

    # City position per member per day, so "how many live in territory" can be
    # answered for a past week rather than only for today.
    coords_hist = {}
    if os.path.exists(COORDS_HISTORY):
        coords_hist = json.load(open(COORDS_HISTORY, encoding="utf-8"))
    if roster_observed:
        for pid, p in players.items():
            c = p.get("coords")
            if c and len(c) >= 3:
                coords_hist.setdefault(str(pid), {})[seen_on] = [c[1], c[2]]
        json.dump(coords_hist, open(COORDS_HISTORY, "w", encoding="utf-8"), indent=1)

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
        from_ledger[key][pid][day] = from_ledger[key][pid].get(day, 0) + c.get("count", 1)

    for key, per_player in from_ledger.items():
        w = week_for(key)
        for pid, days in per_player.items():
            existing = w["chests"].setdefault(pid, {})
            for day, n in days.items():
                existing[day] = max(existing.get(day, 0), n)

    # The donation target is a share of might, and might climbs all week, so
    # measuring against the current figure moves the goalposts: give exactly
    # the required amount on Monday and you are short again by Friday through
    # nothing but playing. Each week's target is therefore frozen to the
    # earliest might recorded inside that week.
    #
    # Weeks older than might-history.json have nothing to freeze to and fall
    # back to the current figure, which is the previous behaviour and still an
    # over-estimate for anyone who has grown since.
    #
    # The last reading inside the week is kept alongside it, as "endMights".
    # A share-of-might scoreboard needs a denominator that belongs to the week
    # it describes: the start-of-week figure understates what someone could
    # give by Sunday, and the member's current might drags every past week
    # downward as they grow, so an old week quietly shrinks every time it is
    # looked at. The last reading of the week does neither — it is settled once
    # the week is over, and during the week in progress it is simply the newest
    # figure, which is the one the member sees in game.
    # The roster as it stood in a given week: everyone who had joined by the end
    # of it and had not yet left when it began. Weeks are finished history, so
    # the people who played them belong in them — counting a past week over
    # today's roster alone rewrote it every time somebody quit, and made the
    # clan's own record of a week shrink as members drifted away from it.
    # Ghost contributors are left out: never captured on a roster, they have no
    # rank and no might, so there is nothing to measure them against.
    def roster_for(wkey, wk_end):
        out = [m for m in members
               if not (m.get("firstSeen") and m["firstSeen"] > wk_end)]
        out += [f for f in former_members
                if f.get("via") == "roster" and f.get("rank")
                and not (f.get("joined") and f["joined"] > wk_end)
                and not (f.get("lastSeen") and f["lastSeen"] < wkey)]
        return out

    for wkey, w in weeks.items():
        w.setdefault("endMights", {})
        wk_end = (datetime.strptime(wkey, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
        for m in roster_for(wkey, wk_end):
            seen = mights.get(m["id"], {})
            within = sorted(d for d in seen if week_start(d) == wkey)
            w["mights"][m["id"]] = seen[within[0]] if within else m["might"]
            w["endMights"][m["id"]] = seen[within[-1]] if within else m["might"]

    baselined = sum(1 for w in weeks.values() for m in members
                    if any(week_start(d) == w["start"] for d in mights.get(m["id"], {})))
    print(f"week targets: {baselined} member-week(s) frozen to a start-of-week might,"
          f" the rest fall back to the current figure")

    # Who lived in clan territory in each week: each member's last known
    # position as of that week's end, so a week reflects where people were
    # then rather than where they are now. Anyone with no position on file that
    # far back falls back to today's answer — the old behaviour, counted and
    # flagged.
    #
    # Counted over current members only, unlike the donation, chest and speedup
    # figures beside it. Those three record what happened in a week, and
    # someone who has since left still did it. Territory is not a record of a
    # week: it is where a member lives, the standing fact the clan acts on when
    # deciding who to remove — and there is no decision to make about someone
    # already gone. Counting them made "47 of 60 in territory" sit under a clan
    # of 56, with the four extra being people whose city nobody cares about.
    for wkey, w in weeks.items():
        wk_end = (datetime.strptime(wkey, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
        inside, guessed, counted = [], 0, 0
        for m in (m for m in members
                  if not (m.get("firstSeen") and m["firstSeen"] > wk_end)):
            seen = coords_hist.get(m["id"], {})
            upto = sorted(d for d in seen if d <= wk_end)
            if upto:
                x, y = seen[upto[-1]]
                here = in_territory([0, x, y], capital)
            elif m.get("inTerritory") is not None:
                here = m["inTerritory"]
                guessed += 1
            else:
                # No position on file that far back, and no current one to fall
                # back on — someone who left before positions were ever
                # captured. Left out of the figure rather than guessed at, so
                # the denominator stays the people we can actually place.
                continue
            counted += 1
            if here:
                inside.append(m["id"])
        w["inTerritory"] = inside
        w["territoryOf"] = counted
        w["territoryGuessed"] = guessed

    tally = ", ".join(f"{k} {len(weeks[k]['inTerritory'])}/{weeks[k]['territoryOf']}"
                      + (f" ({weeks[k]['territoryGuessed']} guessed)" if weeks[k]["territoryGuessed"] else "")
                      for k in sorted(weeks))
    print(f"in territory by week: {tally}")

    # ---- months -------------------------------------------------
    # Calendar-month donation totals, for the board that names the top few
    # donors once a month is complete. Weeks cannot simply be summed into
    # months: they straddle month boundaries — the week of 26 Jul runs into
    # August, the week of 30 Aug into September — so a month is built from the
    # event ledger's own timestamps, the same source the weeks come from.
    months = {}
    newest_day = ""
    for ev in elog.values():
        day = game_day(ev["ts"])
        # Every event counts as evidence of how far the data reaches, donation
        # or not — that is what decides whether a month has been left behind.
        newest_day = max(newest_day, day)
        pid = str(ev["player_id"])
        if int(pid) not in known_ids or ev["kind"] not in (3, 4):
            continue
        mo = months.setdefault(day[:7], {"start": day[:7], "donations": {},
                                         "mights": {}, "endMights": {}, "lastDay": ""})
        mo["lastDay"] = max(mo["lastDay"], day)
        row = mo["donations"].setdefault(pid, {})
        for k, v in ev["amounts"].items():
            name = RESOURCES.get(int(k))
            if name:
                row[name] = row.get(name, 0) + v

    # The same three-mights reasoning the weeks use. A share-of-might board
    # needs a denominator belonging to the period it describes, so the closing
    # figure of the month is what the board divides by: it is settled once the
    # month ends, where the current figure would shrink every past month a
    # little further each time the page was opened. Months older than
    # might-history.json fall back to the current figure, exactly as weeks do.
    for mkey, mo in months.items():
        for m in members:
            seen = mights.get(m["id"], {})
            within = sorted(d for d in seen if d.startswith(mkey))
            if within:
                mo["lastDay"] = max(mo["lastDay"], within[-1])
            mo["mights"][m["id"]] = seen[within[0]] if within else m["might"]
            mo["endMights"][m["id"]] = seen[within[-1]] if within else m["might"]
        # Donors who have since left, kept aside so "top 3" stays a board about
        # the people who are actually still here — matching the weekly podium.
        former = sorted({name_of.get(p, p) for p in mo["donations"] if p not in current_ids})
        if former:
            mo["former"] = former
        # A month is finished only once the ledger has moved past its final
        # game-day. Reaching that day is not enough: a game-day runs from 17:00
        # UTC to 17:00 UTC, so the last day of August is still taking donations
        # well into 1 September, and a board published at the top of it would
        # be reordered by everything given afterwards.
        mo["closed"] = newest_day > last_calendar_day(mkey)

    if months:
        print("months: " + ", ".join(
            f"{k} {len(months[k]['donations'])} donor(s) through {months[k]['lastDay']}"
            + ("" if months[k]["closed"] else " (still open)")
            for k in sorted(months)))

    today = game_day(datetime.now(timezone.utc).timestamp())
    current = week_start(today)
    week_for(today)

    # Names this member has gone by before the one they carry now, most recent
    # first. Only names actually superseded — the current one is already on the
    # row, and repeating it as history would read as a change that never
    # happened.
    for row in (members, former_members):
        for m in row:
            past = name_hist.get(str(m["id"]), [])[:-1]
            if past:
                m["previousNames"] = [{"name": e["name"], "until": e["lastSeen"]}
                                      for e in reversed(past)]

    # When this run happened, so the page can show "last updated".
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    state = {"generatedAt": generated_at, "capital": list(capital), "members": members,
             "formerMembers": former_members, "currentWeek": current, "weeks": weeks,
             "months": months}
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
