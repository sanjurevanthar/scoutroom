# Agent log

How I directed the coding agent, session by session. Each entry follows this template:

    ## Session NN: <feature>
    - Date/time:
    - Goal:
    - My prompt (summary + link to docs/prompts/NN-*.md):
    - What the agent did:
    - What I verified, and how (commands run, browser checks, two-user test):
    - What I changed or took over myself, and why:
    - Tokens / cost (from /cost):

---

## Session 00: Setup
- Date/time: 2026-11-21
- Goal: Scaffold the DeepSpace app and put guardrails and tracking in place before building any feature.
- My prompt: set up agent tracking with secret protection. See [docs/prompts/00-setup.md](prompts/00-setup.md); every later prompt is auto-logged in [docs/prompts/prompt-log.md](prompts/prompt-log.md).
- What the agent did:
  - Scaffold: DeepSpace app `scoutroom` (commit "Scaffold DeepSpace app").
  - DeepSpace skill: installed from `deepdotspace/deepspace-skill` (pinned in `skills-lock.json`), copied into `.claude/skills/deepspace/` so reviewers can read it.
  - Docs MCP: `deepspace-docs` HTTP server declared in `.mcp.json` (https://docs.deep.space/mcp). TODO: describe how I used it.
  - Project rules appended to `CLAUDE.md` (server-side AI only, secrets only via `npx deepspace secrets`, one feature per session with a plan first, run tests after changes).
  - Tracking: this log, `docs/token-usage.md`, `docs/prompts/`, `docs/transcripts/`, a `UserPromptSubmit` hook (`scripts/log-prompt.sh`) and `scripts/token-report.sh` (daily totals only).
  - **Secret protection** (the repo is public):
    - `.gitignore` covers `.env*`, `.dev.vars*`, `.deepspace/`, `.wrangler/`, `.claude/settings.local.json`, `*.jsonl`, keys.
    - `scripts/redact.sh` masks API keys, JWTs, bearer tokens, key=value secrets and PEM blocks. The prompt log and token report pass through it.
    - `scripts/check-secrets.sh`, run by `.githooks/pre-commit`, scans staged files with the same patterns and blocks forbidden file types. Enable with `git config core.hooksPath .githooks`.
- What I verified, and how: fake-secret sample through `redact.sh`; staged a file containing a fake key and confirmed the commit was blocked; sent a test prompt and confirmed it was logged redacted; `git ls-files` showed no secret-looking files tracked.
- What I verified / changed myself (addendum): `wrangler.toml` had the `__APP_ID__` placeholder; I ran `npx deepspace app init`, committed the real app id, set secrets via `npx deepspace secrets` (piped, never typed in chat), and deployed to https://scoutroom.app.space (logs show 200s).
- What I changed or took over myself, and why: chose `scoutroom/` as the repo, narrowed the token report to daily totals (ccusage cannot filter by project, and session names would leak other projects).
- Tokens / cost (from /cost): TODO
