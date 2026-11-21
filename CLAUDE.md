See [AGENTS.md](./AGENTS.md).

## Project rules

- Server-side AI calls only: never call an AI provider from client code.
- Before building a feature, run `npx deepspace add --list` and `npx deepspace integrations info <name>` to see what already exists.
- Secrets only via `npx deepspace secrets`. Never put keys in code, docs, prompts, or committed files.
- One feature per session, with a plan first. `/clear` between features.
- Run `npx deepspace test run` after every change.
- Session tracking lives in `docs/` (agent log, prompts, token usage). Run `scripts/redact.sh` on anything exported before committing.
