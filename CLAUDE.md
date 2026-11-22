See [AGENTS.md](./AGENTS.md).

## Project rules

- Server-side AI calls only: never call an AI provider from client code.
- Before building a feature, run `npx deepspace add --list` and `npx deepspace integrations info <name>` to see what already exists.
- Secrets only via `npx deepspace secrets`. Never put keys in code, docs, prompts, or committed files.
- One feature per session, with a plan first. `/clear` between features.
- Run `npx deepspace test run` after every change.
- Session tracking lives in `docs/` (agent log, prompts, token usage). Run `scripts/redact.sh` on anything exported before committing.

## Git workflow (mandatory for every feature or fix)
- Never commit directly to main. Start every feature or fix on a new branch:
  feat/<short-name> or fix/<short-name>, created from an up-to-date main
  (git checkout main && git pull first).
- Commit in small, clear steps. The pre-commit secret check must pass;
  never bypass it (no --no-verify). If it flags a false positive, rename
  the variable instead.
- When the work is done and tests pass, push the branch and open a pull
  request to main with `gh pr create`. If gh isn't available, push and give
  me the GitHub compare link.
- PR description must include: what changed, how to test it, test results,
  "Doc changes" (any docs/design/ updates), and known gaps.
- NEVER merge a PR, and NEVER run `npx deepspace deploy`. I review, approve,
  merge, and deploy myself, from main only.
- Never push to main, never force-push, never delete branches unless I ask.
- docs/design/ is the source of truth. If code must differ from a doc,
  update that doc in the same PR.
- Add a session entry to docs/agent-log.md on the branch; always leave
  "What I verified myself" empty for me to fill.
