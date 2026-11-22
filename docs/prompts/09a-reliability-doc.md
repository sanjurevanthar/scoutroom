# Session 09a prompt: reliability document

SESSION 09a: Reliability document (docs only, no code changes).
Follow CLAUDE.md (branch docs/reliability, open a PR, don't merge).

Create docs/design/13-reliability.md, in simple English, same style as the
other design docs ("In simple words" box at the top, short sections, tables).

Context: after shipping F1–F4, I did my own reliability review of the agent
run and found 6 issues. Because of limited time before the deadline and gaps
in my knowledge of DeepSpace internals (for example whether multi-record
transactions exist, and exactly how job retries behave), I chose to fix only
the high-risk issue now and document the rest with suggested solutions for
a future implementation. Say this honestly in the intro.

Verify each issue against the real code before writing (cite file:function).
If an issue is not accurate, say so instead of copying it.

For EACH issue write: What happens | Impact (High/Medium/Low) | Suggested
options | Status | How to check it.

1. Crashed job leaves the run "running" forever; the lock is never renewed;
   no reaper (cron file empty). Impact: HIGH (the room is blocked forever).
   Options: heartbeat "lastProgressAt" per step + stale threshold (~3 min
   without progress), reaped lazily in startRun (no cron needed), or a cron
   reaper. Status: FIXING NOW (Session 09b).
2. A long run can outlive its 15-minute lock, so a second run can start.
   Medium. Option: judge the lock by progress (heartbeat), not a fixed TTL,
   so it's solved by the #1 mechanism. Status: covered by 09b if the same
   change; otherwise future.
3. startRun makes several writes with no transaction; the runsUsed update
   isn't checked; the rollback ignores its own results. Medium. Options: a
   safe write order (lock → run → enqueue), check every result, derive
   runsUsed by counting run records instead of a counter, and let the
   reaper heal leftovers. Note: check the DeepSpace docs for transactions;
   if there are none, "safe order + self-healing" is the design. Status: future.
4. saveCards can fail partway and leave half a set of cards on a failed run.
   Low–Medium. Options: show only cards from runs with status "done";
   best-effort delete of cards from failed runs. Status: future.
5. The job is configured to retry twice, but its error handler swallows
   errors, so it never retries; the retry-safe code protects a path that
   never runs. Low (misleading config). Options: A) no automatic retries
   (fail clearly, the user re-runs), B) rethrow only temporary errors
   (network/5xx) so the job retries. Status: future (suggestion: A).
6. Failed runs still use up the room's 5-run quota (no refund). Low.
   Options: count only finished runs; add a hard cap (e.g. 10 attempts per
   room) to prevent retry loops spending free-tier quota. Status: future.

Also add:
- A "Checklist to verify in the future" section (one testable check per issue).
- A short "Why not now" section (time + knowledge gaps + risk of changing
  core run logic right before the deadline).
- Links: add 13 to docs/design/00-README.md; link it from doc 11 (risks)
  and add the future items to doc 12 (roadmap).
- Save this prompt as docs/prompts/09a-reliability-doc.md.
- Add Session 09a to docs/agent-log.md; leave "What I verified myself" EMPTY.

Commit (the secret check must pass), push, open a PR. Do NOT merge. STOP.
