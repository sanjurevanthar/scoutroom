#!/usr/bin/env bash
# Daily totals only: ccusage has no per-project filter, and its session view lists
# other projects' names, which must not reach a public repo.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/docs/token-report.md"
mkdir -p "$root/docs"
scrub() {  # secrets, then local usernames in paths
  "$root/scripts/redact.sh" | sed -E 's#/Users/[^/ ]+#/Users/<user>#g; s#-Users-[A-Za-z0-9_.]+-#-Users-<user>-#g'
}
{
  echo "# Token report — $(date '+%Y-%m-%d %H:%M %Z')"
  echo
  echo "Daily totals across all Claude Code usage on this machine (ccusage cannot filter by project)."
  echo
  echo '```'
  npx -y ccusage@latest daily --no-color 2>&1 | scrub
  echo '```'
} > "$out"
echo "Wrote $out"
