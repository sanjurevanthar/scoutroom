# 12 · Roadmap [FUTURE]

> **Moved to THIS BUILD:** F4, the cited brief from kept cards, was a stretch goal and is now built (session 07). See [01](01-product-overview.md) and [07](07-agent-run-design.md#brief-f4). Everything in the table below is still future.

> **In simple words:** These are the features we are not building now, in the order I would build them, with the DeepSpace piece each would use. Nothing here is designed in depth.

| Priority | Feature | Why it is next | DeepSpace piece it would use |
|:-:|---|---|---|
| 0 | **Switch to DeepSpace providers** | When credits exist: better web search (Exa), Google Scholar, Haiku. A config change, no agent change. | `anthropic/chat-completion`, `exa/search`, `scholar/search-papers` via the provider interfaces (see [08](08-integrations.md)) |
| 1 | **Challenge a card** (F5) | Most useful follow-up: humans steer the agent to dig deeper on one claim. Reuses the same run loop. | Same `startRun` action and job; a new step kind; `anthropic` + `exa` |
| 2 | **Usage / cost dashboard per room** (F11) | Builds trust and protects the owner's wallet. | `npx deepspace app usage` data (TO VERIFY if an API exists); our `runs.searchCalls` / `aiCalls` counters |
| 3 | **Room templates** (F10) | Faster start: competitor scan, literature review, tech choice are just prompt + query presets. | Plain data (a `templates` collection or constants) |
| 4 | **Live co-editing of the brief** (F9) | Teams will want to edit the brief together. (The brief itself, F4, is built: generated, read-only, cited.) | `documents` feature (Tiptap + Yjs) via `deepspace add documents`; `YjsRoom` |
| 5 | **Watch mode** (F6) | Research gets old; a daily re-check with an email digest keeps it fresh. | `cron` feature (`CronRoom`, `src/cron.ts`) + `email` integration (`email/send`) |
| 6 | **Agent tools via `registerAgent`** (F7) | Lets my own coding agent query a room (read cards, kept items). | `registerAgent` in `src/ai/agent.ts`; `npx deepspace agent tools` / `agent invoke` (per `AGENTS.md`) |
| 7 | **Export brief to Google Docs** (F8) | Handy for sharing outside the team. | `google/*` integrations with **user** billing and per-user OAuth consent |

Sources: `npx deepspace add --list` (`documents`, `cron`), `npx deepspace integrations list` (`email`, `google`), `AGENTS.md` (agent tools), https://docs.deep.space/guides/scheduled-jobs.

## Why this order

- 1-2 improve trust in the core loop (steer it, see cost).
- 3-4 improve speed and collaboration.
- 5-7 add reach (time, other tools, other apps) and need extra setup such as OAuth or email.
