# Token usage

Real numbers for sessions 00-10 (the Total row covers every row; session 08 and 10 are one log file each, see below), from Claude Code's local logs via `npx ccusage session --json`. No number below is estimated by hand. Collected 2026-11-22.

| Session | Date | Feature | Input tokens | Output tokens | Cache read | Cache write | Est. cost | What saved / wasted tokens |
|---|---|---|---:|---:|---:|---:|---:|---|
| 00 | 2026-11-21 | Setup (skill, tracking, secret protection) | 74 | 40,010 | 1,724,727 | 184,537 | $1.31 | saved: skill + docs MCP wired instead of pasting docs. wasted: setup spread over 5 logs; the skill install alone wrote 47k cache tokens for 367 output tokens |
| 01 | 2026-11-21 | Design docs | 36 | 62,142 | 2,549,258 | 116,589 | $1.34 | saved: docs MCP (9 searches, 3 reads) instead of pasted docs. wasted: biggest context of all sessions (peak ~213k tokens) because the whole design set was written in one session |
| 02 | 2026-11-21 | Groq corrections + spike | 58 | 28,561 | 2,729,899 | 105,731 | $0.98 | saved: time-boxed spike on a throwaway branch, no subagents. wasted: 3 sleep/poll commands while waiting for jobs; 6 docs pages fetched with curl |
| 03 | 2026-11-21 | Feature 1: rooms | 56 | 25,999 | 2,741,142 | 227,682 | $1.44 | saved: one feature, plan first, no subagents. wasted: 302 lines of SKILL.md sent with the prompt; docs pages printed in full (permissions page ~250 lines) |
| 04 | 2026-11-21 | Feature 2: agent run | 88 | 69,639 | 6,326,272 | 169,965 | $2.01 | saved: fake providers for all automated tests. wasted: my first fake-provider switch did not reach the worker, so an e2e run made real calls; ~4 real runs; peak context ~197k |
| 05 | 2026-11-22 | Feature 3: votes | 126 | 25,907 | 5,849,522 | 105,697 | $1.27 | saved: fake providers only, no real API calls. wasted: 9 Monitor calls and other sleep/poll waits (12 poll-style calls in all) on test runs; most API calls of any session (53) |
| 06 | 2026-11-22 | Independent review of PR #1 | 70 | 22,713 | 3,154,096 | 88,867 | $0.90 | saved: review-only scope; fixed R1 (rooms piling up in test storage), the cause of the flaky reruns. wasted: 3 full green runs required, plus 6 sleep/poll commands |
| 07 | 2026-11-22 | Feature 4: brief | 70 | 41,304 | 4,156,580 | 134,556 | $1.37 | saved: foreground test runs (0 Monitor or sleep calls) and reuse of the existing kept-card rule. wasted: 9 design docs updated in one session (peak context ~162k) |
| 09a | 2026-11-22 | Reliability document (docs only) | 26 | 13,991 | 935,375 | 75,830 | $0.54 | saved: docs-only scope, no test runs. wasted: not measured |
| 09b | 2026-11-22 | Fix stuck runs (issue 1) | 50 | 24,777 | 2,485,471 | 101,086 | $0.90 | snapshot taken before the docs and PR steps finished: fill the final row after the session. Test runs were foreground (0 Monitor or sleep shell calls) |
| 08 | 2026-11-22 | README (the 08b README attempt and its undo share this log) | 38 | 15,042 | 1,479,266 | 69,920 | $0.58 | one log file covers the README, the undone 08b attempt and its cleanup; not split. wasted: the 08b attempt |
| 10 | 2026-11-22 | Switch AI + search to DeepSpace integrations | 94 | 54,187 | 6,189,382 | 171,651 | $1.85 | snapshot of the whole log (last activity before the final PR steps); real-integration checks cost about 3 credits, not tokens |
| **Total** | | | **786** | **424,272** | **40,320,990** | **1,552,111** | **$14.49** | |

**I use a Claude Pro subscription, so this is an estimate of the API cost, not money spent.** "Est. cost" is ccusage's API-equivalent price for the tokens in each row.

## How the rows were built

- **Matching:** each row was matched to Claude Code session logs by time and first prompt (session ids are in [prompts/prompt-log.md](prompts/prompt-log.md)). Logs of two folders were used: this repo and its parent folder, because some sessions were started from the parent.
- **Session 00 is the sum of 5 log files:** a scaffold Q&A, the skill install, a skill check, a hook test ("hello check"), and the first part of the setup session.
- **Sessions 00 and 01 shared one log file.** I split it at the moment the design-docs skill started (2026-11-21 23:25 UTC). ccusage only reports whole sessions, so for the split rows I added up the per-message token counts from the raw log (they match ccusage's totals exactly when summed) and priced them with ccusage's own rates (Sonnet 5.5: $2 input, $10 output, $0.10 cache read, $4 cache write per million tokens; recovered from ccusage's per-model figures, exact to rounding).
- **Session 03 shared a log file with this later bookkeeping work.** Only messages up to the end of Feature 1 (2026-11-21 21:45 local) count here. The rest of that file (token report, this task) is not counted.
- **Not counted:** one 24-second log opened right after Session 04 ended (12 input, 1,491 output, 235,263 cache read, 49,246 cache write, $0.24). I could not tell which session it belongs to.
- **Session 01 log has no separate prompt-log entry** (the prompt hook was set up in Session 00), so Session 01 was found by its timing and its first prompt.
- **Peak context** (in the notes) is the largest single request: input + cache read + cache write.

## How I kept token use low

- **Prompt caching did most of the work.** 95.3% of all tokens in these sessions are cache reads, priced at $0.10 per million instead of $2 for fresh input. Fresh input tokens total only 786 across twelve sessions.
- **One feature per session, with a plan first.** Sessions 02-07 each cost between $0.90 and $2.01; no session re-explained earlier work, because the design docs and `docs/agent-log.md` carry the context.
- **Docs MCP and the saved catalogs instead of pasted docs** (9 searches and 3 reads in Session 01), so the docs were fetched when needed.
- **Fake providers in automated tests (Sessions 04-07).** Test runs make no Groq or OpenAlex calls, so they cost no free-tier quota. The one slip (Session 04, tests briefly hitting the real providers) is in the table.
- **Foreground test runs.** Session 05 polled with 9 Monitor calls and sleep commands; Session 07 ran its three green runs in the foreground with none, and finished in 35 tool calls.
- **Still to improve:** do not attach a 300-line skill file to a prompt (Session 03), and keep design work in several short sessions (Session 01 peaked at ~213k tokens of context).
