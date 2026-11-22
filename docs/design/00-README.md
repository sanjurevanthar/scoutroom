# ScoutRoom Design Docs: Start Here

> **In simple words:** ScoutRoom is a shared, live research room where a server-side AI agent finds evidence and a team votes on it. These documents explain what we will build and how, **before any code is written**. Read them in order, or jump to what you need.

Tags used everywhere: **[THIS BUILD]** (due Sunday night) and **[FUTURE]** (documented only).

## Reading order

| # | Document | What it is for |
|---|---|---|
| 01 | [Product overview](01-product-overview.md) | The problem, the features, what success looks like |
| 02 | [Use cases](02-use-cases.md) | Who does what, step by step, and what can go wrong |
| 03 | [Roles and permissions](03-roles-and-permissions.md) | Who may do which action, and where it is enforced |
| 04 | [Screens and user flow](04-screens-and-user-flow.md) | Wireframes, flow diagram, empty/loading/error states |
| 05 | [Architecture](05-architecture.md) | Components, which DeepSpace service does what, code layout |
| 06 | [Data model](06-data-model.md) | Collections, fields, relations, example record |
| 07 | [Agent run design](07-agent-run-design.md) | The core feature: steps, status, JSON format, budget, failures |
| 08 | [Providers and integrations](08-integrations.md) | LLM and search interfaces; Groq + OpenAlex + Wikipedia now, DeepSpace later; what is left out |
| 09 | [Security and privacy](09-security-and-privacy.md) | Secrets, server checks, prompt injection, stored data |
| 10 | [Testing plan](10-testing-plan.md) | What we test, how, and a demo-day checklist |
| 11 | [Decisions and risks](11-decisions-and-risks.md) | Key decisions, risks, **TO VERIFY list**, **open questions** |
| 12 | [Roadmap](12-roadmap.md) | [FUTURE] features in priority order |
| 13 | [Reliability review](13-reliability.md) | 6 run-reliability issues, verified against the code; 1 fixed now, 5 documented with options |

Saved DeepSpace catalogs (`npx deepspace add --list`, `npx deepspace integrations list`) are not kept in this repo; re-run those commands for the current list.

## The design in five lines

1. Data lives in DeepSpace collections. Room members read their room's data; **everything is written through server actions** that check the person's room role.
2. `startRun` (a server action) checks role, budget and a lock, then enqueues a **background job** (Plan A). If a short spike shows that path does not work, one action runs a fixed pipeline instead (Plan B).
3. The job does **one step at a time** (plan, search up to 8 times, write cards), saving each step as a record.
4. The browser just subscribes to those records, so everyone sees steps and cards **live**.
5. AI and search sit behind two interfaces. Now: the owner's Groq key plus OpenAlex and Wikipedia, because DeepSpace credits are 0. Later: DeepSpace `anthropic`, `exa`, `scholar` by changing a setting. All calls happen on the server. The one secret lives in the DeepSpace secrets store, never in the browser or git.

## Glossary

| Word | Simple meaning |
|---|---|
| **RBAC** | Role-based access control: what you can do depends on your role. |
| **Role** | A label for a person's powers. DeepSpace has `viewer`, `member`, `admin` for the whole app. ScoutRoom adds `owner`, `researcher`, `viewer` per room. |
| **Durable Object (DO)** | A small server-side object with its own storage. DeepSpace keeps your data in one and checks permissions there. |
| **RecordRoom / scope** | The Durable Object that holds the app's collections. A "scope" is its id (`app:<APP_ID>`). |
| **Collection / record** | Like a table / a row. |
| **Schema** | The definition of a collection: columns and permission rules. |
| **`'team'` permission** | A read rule: "you may read this row if you are an active member of the team named in the row". |
| **`uniqueOn`** | A rule that two rows cannot share the same values in chosen columns. We use it for one vote per person and for the run lock. |
| **Server action** | A function on our server that the browser calls with the user's login token. It runs as the app and can bypass normal permissions. |
| **Background job / JobRoom** | Work that keeps running after the web request ends, with live progress, cancel and retry. |
| **`ctx.continue`** | A job tool: save progress, pause, and resume on the next tick. |
| **JWT** | A signed login token. The server checks it to know who is calling. |
| **Integration / proxy** | An outside service (AI, search) that DeepSpace lets us call through one place, which also handles billing. |
| **Developer billing** | The app owner pays for integration calls. |
| **Provider interface** | A small contract (`LLMProvider`, `SearchProvider`) the agent uses, so the real service behind it can be swapped by a setting. |
| **Spike** | A short throwaway test to answer risky questions before the real build. |
| **Plan A / Plan B** | A: the run is a background job. B: the run is one server action with a smaller fixed pipeline. |
| **OpenAlex / Wikipedia** | Free search sources (papers / general background) used until DeepSpace credits exist. |
| **Groq** | The AI model provider used now (OpenAI-compatible API, free tier with rate limits), with the owner's key. |
| **Subscription / live query** | `useQuery` keeps a live connection; the server pushes changes, so no refresh is needed. |
| **Presence** | Showing who is online. |
| **Evidence card** | One claim + a source link + source type + confidence. |
| **Run** | One execution of the agent in a room. |
| **Prompt injection** | Text in a web page that tries to give the AI new orders. |
| **Idempotent** | Safe to repeat: doing it twice has the same result as once. |
| **ADR** | Architecture decision record: a short note of a decision, the reason and the tradeoff. |
| **Mermaid** | Text-based diagrams that GitHub draws for us. |
| **TO VERIFY** | A fact I could not confirm; listed with IDs T1..T16 in [11](11-decisions-and-risks.md). |

## Sources used

DeepSpace docs (read through the `deepspace-docs` MCP): `/concepts/permissions`, `/concepts/data-model`, `/concepts/architecture`, `/concepts/realtime-sync`, `/concepts/deployment`, `/guides/server-actions`, `/guides/background-jobs`, `/guides/external-apis`, `/guides/presence-and-cursors`, `/guides/scheduled-jobs`, `/cli-reference/commands`, `/sdk-reference/worker/cron`, `/sdk-reference/client/realtime`.
Repo files read: `AGENTS.md`, `worker.ts`, `wrangler.toml`, `package.json`, `src/schemas.ts`, `src/integrations.ts`, `src/jobs.ts`, `src/actions/index.ts`, `src/cron.ts`, `src/constants.ts`. CLI: `npx deepspace add --list`, `integrations list`, `integrations info` (3 integrations).
