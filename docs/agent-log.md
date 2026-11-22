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

---

## Session 03: Feature 1, rooms, roles, invite links
- Date/time: 2026-11-21
- Goal: Rooms with per-room roles and invite links, on a clean branch `feat/rooms` (spike code reused only as a pattern, `spike/verify` not merged).
- My prompt: Session 03 prompt (see [docs/prompts/prompt-log.md](prompts/prompt-log.md)).
- What the agent did:
  - Data (`src/schemas/rooms-schema.ts`): `rooms`, `team_members` (`uniqueOn teamId+userId`), `invites`. Room data reads use `read: 'team'` (`teamField: 'teamId'`); all client writes denied, so every write is a server action.
  - Actions (`src/server/rooms/`): `createRoom`, `createInviteLink` (owner), `joinByInvite` (joins as researcher), `changeRole` (owner), `removeMember` (owner; owner cannot remove themselves or be demoted). Role checks live in `access.ts`. `src/actions/index.ts` imports only these files, so there is no import cycle with `action-routes.ts`.
  - Screens: `/rooms` (list, empty/loading/error states), `/rooms/new`, `/rooms/:roomId` (question, members with roles, live presence via `usePresenceRoom`, empty board "Agent runs arrive in Feature 2"), `/join/:token`. `/home` now redirects to `/rooms`. No `deepspace add` feature fit (none covers rooms or roles), so the scaffold UI primitives were reused.
  - Two deliberate differences from the prompt's field list, both following docs/design/06: `team_members.teamId` instead of `roomId` (DeepSpace's `'team'` rule requires `teamId`); the invite token lives in an owner-only `invites` collection, not on `rooms`, because `rooms` is readable by every member and a token there would reach viewers.
- What I tested (`npx deepspace test run all`, 14 passed):
  - Two-user Playwright: A creates a room, B joins by link, both lists show 2 members live, both show as online.
  - Direct action calls: a non-member sees "not a member" and gets `not a member` from actions; researcher and viewer get `forbidden: role=...` from `createInviteLink`, `changeRole`, `removeMember`; owner cannot remove self or be demoted; bad role refused; invalid invite refused; a removed member loses access at once.
  - Note: plain `npx deepspace test run` only runs smoke+api; the new specs need `run all`.
- What I got wrong and fixed: first run of the direct-action test failed because the page was still on `about:blank` when calling `fetch('/api/auth/token')`; fixed by loading `/rooms` first. No production test hook was added: tests get a token from `/api/auth/token`.
- Not done (later features): job room is still open to client enqueue (D4, F2); invite revoke/expiry UI and role-specific invite links; budget setting.
- What I verified myself: - What I verified myself: tested live on scoutroom.app.space with 2 accounts
  (normal + private window): created room, joined by invite link, saw both
  members online, changed role to viewer and it updated live. So far I don't see any issues.
- Tokens / cost (from /cost): TODO
