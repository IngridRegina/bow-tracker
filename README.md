# Brethren of War — contribution tracker

A static page that reads `tracker-state.json` and renders the clan's weekly
donation, chest and speedup ledger. React + Vite; the state file is built from
Total Battle HAR captures by `build_state.py`.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run lint
```

`build_state.py` writes `public/tracker-state.json`; Vite copies `public/` into
`dist/` on build, so the data file needs no separate copying step.

## Deploying to Netlify

Deploys are pushed from the command line — there is no connected Git repo, so
Netlify never builds this itself. `netlify.toml` holds the publish directory;
cache headers are in `public/_headers` (see the comment in that file for why).

### One-time setup

```bash
npm install -g netlify-cli   # or: npm install -D netlify-cli, and use `npx netlify`
netlify login               # opens a browser to authorise the CLI
```

Then attach this folder to the site, from the project root:

```bash
netlify link                       # pick from a list
netlify link --name <site-name>    # if you know the subdomain
netlify sites:list                 # to look the name up first
```

For a brand new site instead: `netlify sites:create --name bow-tracker`.

Linking writes `.netlify/state.json`, which records the site ID. It is
gitignored; if it goes missing, `netlify link` again.

### Every deploy

```bash
npm run build
netlify deploy --prod --dir=dist
```

Drop `--prod` to get a throwaway preview URL instead of publishing to the live
site — useful for checking a change before it goes out.

### The usual path

`deploy.sh` does the whole thing from a fresh capture: rebuild the state file,
build the site, publish.

```bash
./deploy.sh ~/Downloads/totalbattle_com.har
```

## The donation target

The weekly goal is 5% of might per resource, or 20% of might across all four
combined. Might climbs all week through ordinary play, so measuring against the
current figure moved the goalposts: donate exactly 5% on Monday, grow through
the week, and by Friday the same donation was short of a target that had risen
underneath it.

Each week's target is now frozen to the earliest might recorded for that member
*inside* that week, taken from `might-history.json` and stored in
`weeks[week].mights`. Meeting the goal on Monday keeps it met.

The two mights are kept apart in `evaluate()`: `targetMight` drives the goal,
`might` is what the reader sees. The page shows a member's current might, which
is the number they see in game — showing the frozen baseline would have put a
stale figure next to "flat for 4 days", which is derived from current might.

Weeks that predate `might-history.json` have nothing to freeze to and fall back
to current might, the old behaviour. That over-estimates the target for anyone
who has grown since, and cannot be fixed retroactively.

## Ranks

Clan ranks and join dates both come from the capture itself. The roster carries
one row per member, `[[player_id], rank_code, joined_ts]`, where `joined_ts` is
when they joined the clan and `rank_code` maps through `RANK_CODES` in
build_state.py:

| code | rank |
|------|----------|
| 1    | Leader   |
| 2    | Superior |
| 3    | Officer  |
| 4    | Veteran  |
| 5    | Soldier  |

Codes 1, 2, 4 and 5 are confirmed against every capture on file. Code 3 was in
use until the 2026-08-11 reshuffle and its label is inferred from its position
in the ladder. Code 6 has never appeared, so the site's "Member" rank is never
produced. An unrecognised code prints a warning and falls back to ranks.json.

`firstSeen` is the real join date from the roster, falling back to "first
capture we saw them in" only when a capture has no roster. The two are not the
same thing: before this, everyone already in the clan when tracking began was
stamped with the date of the first capture.

`ranks.json` is no longer the source of truth. It is rewritten from each build,
keyed by player id, and is only consulted when a capture arrives without a
roster. Being keyed by id matters: the clan has two players called Aydaen and
two called Enaning, which name-keyed entries could not tell apart.

## Timezones and the "Good times" tab

Player rows carry the member's timezone, encoded oddly: the hours negated, then
a literal `0`, then the minutes negated. `(UTC-100)` is UTC+1:00 — "-1", "0",
"0", not minus a hundred minutes — and `(UTC-30-30)` is UTC+3:30. `parse_tz()`
decodes it to `utcOffset`, minutes east of UTC, and it round-trips every value
in every capture on file.

The "Good times" tab uses that to show, for each UTC hour, how many members'
local clocks read between 09:00 and midnight, with each hour's distance from
the 17:00 UTC daily reset. Expanding an hour lists each timezone group, its
local time, and who is in it.

### Daylight saving

The profile offset cannot be trusted on its own. It behaves like a value frozen
when the member filled the profile in, so the same "+1" means CET to a German
who registered in winter and BST to a Brit who registered in summer. Measured
across this roster: 22 members were on their winter offset, 16 on their current
one, 10 could be read either way, 2 matched neither.

So the page resolves each member through their country's IANA zone
(`COUNTRY_ZONES` in BowTracker.jsx) and uses that zone's offset *today*. Where a
country spans several zones the profile offset picks between them, most
populated first. The lookup runs in the browser, so it stays right through
future DST changes with no rebuild. It currently moves 31 of the 50 members by
an hour.

Where the profile offset matches no zone in the member's country — two cases
today, an Austrian reading UTC+3 and a Turk reading UTC+2 — the country wins,
since both fields are self-reported but the country is the more stable of them.

Ramadan is **not** modelled. It shifts waking hours substantially for members in
Muslim-majority countries — four of them here, in Yemen, Turkey and Egypt — but
Ramadan 1447 ran 18 Feb to 19 Mar 2026 and the next begins around 7 Feb 2027, so
nothing applies at present. Adding it would mean guessing at how far each person
shifts, which is worth doing from observed activity rather than assumption.

## The "World map" tab

A choropleth of where the clan lives, drawn from `world-atlas` with `d3-geo`
and `topojson-client` — plain SVG paths, no map widget and no tiles fetched at
runtime. Clicking a country, or its row in the list beside the map, shows who
is there.

Colour carries one thing, how many members: a single hue in four steps, light
to dark, checked for monotone lightness, visible gaps between steps, and a
light end that still clears 2:1 against the white card so "one member" cannot
be mistaken for "none". Four steps rather than five is deliberate — the same
lightness range split fewer ways gives gaps of ~0.17 instead of ~0.10, which is
what makes them separable at the size of a small country. The country list
repeats every name and count in text, so nothing depends on reading a shade.

The atlas keys countries by ISO 3166-1 *numeric* while members carry alpha-2.
The lookup table in `WorldMap.jsx` was generated by matching each atlas country
name against ICU's own name for every alpha-2 code, excluding withdrawn codes
first — ICU still answers "Germany" for `DD` and "France" for `FX`, and they
would otherwise win the name. 174 of 177 matched; the three left out (N.
Cyprus, Somaliland, Kosovo) have no numeric code to match on. A roster country
the map cannot draw is named on the page rather than silently missing.

The map is a lazily-loaded chunk: the atlas is about 51 kB gzipped, more than
half the built bundle, and only downloads when the tab is first opened.

## What the captures do and do not carry

Per member, taken straight from the capture: name, might, level, coordinates,
country (ISO alpha-2), timezone, clan rank and join date.

`lastActive` is **derived**, not read: it is the most recent day a member
donated, sent speedups or produced a clan chest, taken from the two ledgers.
The game exposes no login time, so a member who plays daily without
contributing will look quiet.

There is no gold-ingot data. The `ingots` flag on each member is a manual field
that nothing currently sets.

### No "last seen"

The client shows "last seen 28m ago" in the member list, but that value is not
in any captured response. Checked: every request goes to the one realm
endpoint; no field pairs a member with a recent timestamp (only join dates,
event times and map objects); and comparing two captures 4h25m apart, no
per-member field grows by that gap in either seconds or minutes, which is what
an elapsed-time counter would have to do.

`might-history.json` is the substitute. It records each member's might per day,
and `mightFlatDays` counts the days since it last rose. Might only goes up
through play, so a flat line usually means an absent player — though someone can
log in daily without moving it, which is why the badge says "possibly inactive"
and the tooltip explains the basis. Three days is the threshold (`STALL_DAYS`,
mirrored in BowTracker.jsx).

Only a build that actually observed the roster writes to this file or to
`member-history.json`. A capture without a member list falls back to the
previous roster, and recording that would date today's figures to that capture's
day — which during the backfill gave a member a might reading four days before
they joined.

### Territory

There is no territory geometry in the captures — no polygon, no owned-tile
list. What is there is map objects: 43-field rows carrying a type, an owning
clan and a position, which include the clan capital and its towers.

Those are real, but a capture only holds the part of the map the client had
open at the time, so tower counts swing between 0 and 31 across the captures on
file. Only the capital is stable, appearing at (660, 432) in every capture that
covers it. So `inTerritory` still means "within `CAPITAL_RADIUS` tiles of the
capital", but the capital is now read from the capture rather than hardcoded,
falling back to the previous state and then to the constant.

The radius stays a judgement call, and a safe one: members sit either within 23
tiles of the capital or beyond 141, with nothing in between, so anything from
24 to 140 gives the same answer.

### Former members

The game records a join date but never a departure — someone who leaves simply
stops appearing in the clan roster, though they remain visible as a player.

So `member-history.json` keeps everyone who has ever been on the roster, with
their join date and the last day they were still listed. Each build refreshes
the current members and treats the rest as former; the state file gets a
`formerMembers` array, shown as a collapsible section under the member list.

The date is "last listed", not "left". It is only as precise as the capture
cadence: with daily captures it is right to within a day, and a gap in captures
widens it. The history was backfilled by replaying every capture in order, so
it reaches back to the first one on file.

A second group comes from the ledgers alone: people who donated, sent speedups
or made chests for the clan but were gone before any capture caught them on the
roster. They carry `via: "contributions"`, and all that can be said of them is
the last day they gave something — no rank and no join date. The list marks them
with a dashed border and dates them "last contributed" rather than "last
listed".

Ones with no name are dropped rather than shown as a bare id. A name only
exists where some capture happened to include them as a player, which for these
three is because they turned up later in another clan. The build prints how
many were skipped.

Because of that replay, `capture_day()` dates a build from the freshest
timestamp *inside* the capture rather than from the clock — otherwise
re-processing an old capture would stamp today's date on a months-old roster.

### overrides.json

Some members leave the timezone blank in their game profile. `overrides.json`
fills those in by player id:

```json
{ "1378684787925": { "name": "Indira", "utcOffset": 180 } }
```

`utcOffset` is minutes east of UTC — UTC+3 is `180`, UTC-7 is `-420`, UTC+5:30
is `330`. The `name` is only there to make the file readable. Whatever the game
reports always wins, so an override is used only where the capture is blank and
stops applying by itself if the member fills the field in later.

## Notes

- `build_state.py` stamps `generatedAt` into the state file; the page shows it
  as "updated 3h 12m ago", with the exact local time on hover. Older state files
  without that field fall back to the response's `Last-Modified` header, which is
  why `netlify.toml` marks `tracker-state.json` as must-revalidate.
- The Anthropic proxy in `vite.config.js` is under `server.proxy`, so it only
  exists in the dev server. `ANTHROPIC_API_KEY` is never part of a build.
