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

## What the captures do and do not carry

Per member, taken straight from the capture: name, might, level, coordinates,
country (ISO alpha-2), timezone, clan rank and join date.

`lastActive` is **derived**, not read: it is the most recent day a member
donated, sent speedups or produced a clan chest, taken from the two ledgers.
The game exposes no login time, so a member who plays daily without
contributing will look quiet.

There is no gold-ingot data. The `ingots` flag on each member is a manual field
that nothing currently sets.

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
