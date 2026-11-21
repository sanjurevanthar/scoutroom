# Setup prompts (condensed)

Earlier setup prompts (scaffold, deepspace skill, docs MCP): TODO, paste originals here.

## Prompt 1: tracking files and hook
Create agent-log.md, token-usage.md, prompts/, transcripts/; add a `UserPromptSubmit` hook that logs every prompt to `docs/prompts/prompt-log.md`; add `scripts/token-report.sh` using ccusage. Show config and scripts before saving. Do not touch app code.

## Prompt 2: public repo, secret safety first
Same tracking, but the repo is pushed to public GitHub, so: `.gitignore` for env/secret files; `scripts/redact.sh` (API keys, JWTs, bearer tokens, key=value secrets, PEM blocks); prompt log and token report piped through it; `scripts/check-secrets.sh` plus `.githooks/pre-commit` to block secrets at commit; tell me if any secret file is already tracked. Show everything before saving.

## Prompt 3: approval with additions
Approved. Copy the deepspace skill and `skills-lock.json` into the repo; add `.mcp.json` with the `deepspace-docs` HTTP server; append project rules to `CLAUDE.md`; filter ccusage to this project or report daily totals only; work only inside `scoutroom/`; then test (fake-key commit block, prompt log), commit and push.
