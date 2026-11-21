#!/usr/bin/env bash
# Scans STAGED content with the same patterns as redact.sh (single source of truth).
set -u
root="$(git rev-parse --show-toplevel)"; cd "$root"
fail=0
while IFS= read -r -d '' f; do
  case "$(basename "$f")" in
    .env|.env.*|.dev.vars|.dev.vars.*|*.jsonl)
      echo "BLOCKED (forbidden file type): $f"; fail=1; continue ;;
  esac
  git show ":$f" 2>/dev/null | grep -Iq . || continue          # skip binary/empty
  hits="$(git show ":$f" | "$root/scripts/redact.sh" --report)"
  if [ -n "$hits" ]; then
    echo "SECRET-LIKE content in $f (values masked):"
    printf '%s\n' "$hits" | sed "s#^#  $f:#"
    fail=1
  fi
done < <(git diff --cached --name-only --diff-filter=ACMR -z)
[ "$fail" -eq 0 ] || { echo "Commit blocked. Remove the secret(s) and re-stage."; exit 1; }
exit 0
