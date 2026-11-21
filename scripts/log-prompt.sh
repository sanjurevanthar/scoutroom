#!/usr/bin/env bash
# UserPromptSubmit hook. Fails closed: if redaction fails, the raw prompt is NOT written.
# Always exits 0 so it can never block a prompt.
trap 'exit 0' EXIT
set +e
input="$(cat)"
root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
log="$root/docs/prompts/prompt-log.md"
mkdir -p "$(dirname "$log")" 2>/dev/null

if command -v jq >/dev/null 2>&1; then
  prompt="$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null)"
  sid="$(printf '%s' "$input" | jq -r '.session_id // "unknown"' 2>/dev/null)"
else
  js='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j[process.argv[1]]||""))}catch(e){}})'
  prompt="$(printf '%s' "$input" | node -e "$js" prompt 2>/dev/null)"
  sid="$(printf '%s' "$input" | node -e "$js" session_id 2>/dev/null)"
fi
[ -z "$prompt" ] && exit 0

redacted="$(printf '%s' "$prompt" | "$root/scripts/redact.sh" 2>/dev/null)"
if [ $? -ne 0 ] || [ -z "$redacted" ]; then
  redacted="[prompt not logged: redactor unavailable]"
fi

{
  printf '### %s · session %s\n' "$(date '+%Y-%m-%d %H:%M')" "$(printf '%s' "${sid:-unknown}" | cut -c1-8)"
  printf '%s\n\n' "$redacted"
} >> "$log" 2>/dev/null
exit 0
