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

## Notes

- `build_state.py` stamps `generatedAt` into the state file; the page shows it
  as "updated 3h 12m ago", with the exact local time on hover. Older state files
  without that field fall back to the response's `Last-Modified` header, which is
  why `netlify.toml` marks `tracker-state.json` as must-revalidate.
- The Anthropic proxy in `vite.config.js` is under `server.proxy`, so it only
  exists in the dev server. `ANTHROPIC_API_KEY` is never part of a build.
