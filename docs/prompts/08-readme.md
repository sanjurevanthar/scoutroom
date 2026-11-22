# Session 08 prompt: README

SESSION 08: Write README.md. Follow CLAUDE.md (branch docs/readme, open a PR,
don't merge). Audience: DeepSpace reviewers. Simple English, short sections,
easy to scan. Sources: docs/design/ (00–13), docs/agent-log.md,
docs/token-usage.md, the code. Do NOT invent facts: only describe what is
built and verified. Replace the scaffold README completely.

Sections:
1. ScoutRoom: a one-line pitch + live link https://scoutroom.app.space
2. What it does: the 4 features as a short story (rooms + roles with invite
   links → live agent run with evidence cards → team votes keep/reject →
   cited brief from kept cards only)
3. Try it in 2 minutes: 2 browsers, create a room, copy the invite link,
   run scout, vote, write brief
4. DeepSpace pieces used: table "Need | DeepSpace primitive | How we use it"
   (auth, RBAC + 'team' reads, records + live sync, presence, server actions,
   background jobs, uniqueOn locks, secrets, deploy, logs)
5. Architecture: one small Mermaid diagram + link to docs/design/05
6. Main tradeoff: 0 DeepSpace credits → LLMProvider/SearchProvider
   interfaces with Groq + OpenAlex + Wikipedia; switching to DeepSpace
   anthropic/exa/scholar is a config change. Integrations left out and why.
7. Safety: server-only AI calls, role checks on the server, budget guard,
   one run per room, strict JSON + citation validation, prompt-injection
   guard, secrets only in `deepspace secrets`, pre-commit secret check
8. Reliability: link docs/design/13-reliability.md. #1 and #2 fixed
   (heartbeat + stale-run reaper, `npm run check:reliability`); #3–#6
   documented as future work with suggested options.
9. Tests & logs: unit + two-user Playwright tests with fake providers; how
   to run them; `npx deepspace logs`; the run_steps timeline
10. How I worked with the agent: design docs → spike → one feature per
    session → branch + PR → independent review session → I test, merge,
    deploy. Link docs/agent-log.md, docs/prompts/, docs/token-usage.md
    (8 sessions ≈ $10.6 API-equivalent, 95% cache reads)
11. Known gaps & what's next (from docs 11, 12, 13), e.g. a brief sentence
    can add a fact not in its card; ~100-room read limit; watch mode,
    challenge-a-card, agent tools, DeepSpace integrations
12. Run locally: npm install, `npx deepspace auth login`, `dev start`,
    `test run all`, setting secrets via a pipe (never typed)

Keep it to about 2–3 screens. Save this prompt as docs/prompts/08-readme.md.
Add Session 08 to docs/agent-log.md; leave "What I verified myself" EMPTY.
Commit (the secret check must pass), push, open a PR. Do NOT merge. STOP.
