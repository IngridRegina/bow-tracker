#!/usr/bin/env bash
# One command: rebuild the state file from the latest capture and publish.
#
#   ./deploy.sh ~/Downloads/totalbattle_com.har
#
# First time only, see README: install the CLI, `netlify login`, `netlify link`.
set -e

HAR="${1:?usage: ./deploy.sh path/to/capture.har}"

# On Windows `python3` resolves to the Microsoft Store stub, which exits
# non-zero instead of running anything. Probe it rather than trusting `command -v`.
if python3 -c '' >/dev/null 2>&1; then PY=python3; else PY=python; fi

if ! command -v netlify >/dev/null 2>&1; then
  echo "netlify CLI not found. Install it with: npm install -g netlify-cli" >&2
  exit 1
fi

$PY build_state.py "$HAR" --ranks ranks.json   # writes public/tracker-state.json
npm run build                                  # vite copies public/ into dist/
netlify deploy --prod --dir=dist

echo "published"
