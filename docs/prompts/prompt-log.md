### 2026-11-21 18:24 · session 59656441
hello check

### 2026-11-21 18:57 · session 80b217e8


<pasted_content id="2dc4">
SESSION 02: Corrections + SPIKE (test risky assumptions). Time-box: 60 minutes.

Context: read docs/design/ (especially 05, 07, 08, 09, 11) and CLAUDE.md.
The app is registered and live at https://scoutroom.app.space.

====================================================================
PART 1: Doc corrections (quick, 5 min)
====================================================================
1. The AI provider is GROQ (groq.com), NOT Grok/xAI.
   - Secret name: GROQ_API_KEY (already set via `npx deepspace secrets`).
   - API: OpenAI-compatible, base URL https://api.groq.com/openai/v1
   - Rename GrokProvider -> GroqProvider everywhere in docs 05, 08, 09, 10,
     11 and the T13–T16 items.
   - Groq's free tier has RATE LIMITS, not a bill: handle HTTP 429 with a
     short retry/backoff, and show "rate limited, try again" in run status.
2. Answers to the open questions:
   - T5: non-blocking. One job queue per app is fine for the demo.
   - Q11: yes, send OpenAlex a mailto, read from the env setting
     OPENALEX_MAILTO (set via deepspace secrets). Never put the email in code or git.
   - Q12: no spending limit needed on Groq's free tier; note the rate-limit risk.
   - Q13: yes, a single job queue is acceptable for the demo.
   - Q14: yes, accept Wikipedia for now. Label its cards "background" with
     lower confidence.
3. Add to docs/agent-log.md, Session 00, under "What I verified / changed
   myself": wrangler.toml had the __APP_ID__ placeholder; I ran
   `npx deepspace app init`, committed the real app id, set secrets via
   `npx deepspace secrets` (piped, never typed in chat), and deployed to
   https://scoutroom.app.space (logs show 200s).
Commit on main: "Docs: Groq provider, answers Q11–Q14, setup notes". Push.

====================================================================
PART 2: SPIKE (throwaway code)
====================================================================
Rules:
- New git branch: spike/verify. Smallest possible code. No UI polish.
- Use the deepspace skill + deepspace-docs MCP. Test with `npx deepspace dev start`.
- My DeepSpace account has 0 credits: do NOT call any DeepSpace integration
  (anthropic, exa, scholar).
- AI = Groq via server-side fetch. Read GROQ_API_KEY ONLY on the server.
  Never print, log, or commit it. At most ~5 Groq calls in total.
- Pick the model: call GET /openai/v1/models once and choose a fast,
  free-tier model that supports JSON output. Tell me which one and why.
- Search = OpenAlex (https://api.openalex.org, with mailto) and the
  Wikipedia REST API. Both free, no key.

Test in this order. STOP and report if a "must" test fails:
1. (must) T13: can a job handler / server code make outbound fetch calls
   to OpenAlex, Wikipedia and Groq?
2. (must) T6: a job handler that calls OpenAlex + Groq and writes 1 test
   card record. Show me the real response fields from OpenAlex and Groq.
3. (must) T4: with client writes to the job room denied, can a server
   action still enqueue the job?
4. (must) T3: uniqueOn lock: call the start action twice quickly; only one wins.
5. (must) T2: a "viewer" test user calling the start action is refused by the server.
6. T5: is the job queue per app or per scope?
7. T7: who is createdBy on records written by an action and by a job?
8. T12: how to create 2 test accounts for two-user tests.
9. T1 / T11: anything the docs or tests show about time limits.
10. JSON mode: does the chosen Groq model return valid JSON for the card schema?

Also sketch (interfaces only, no full implementation yet):
  LLMProvider   { complete(messages, jsonSchema) }
  SearchProvider { search(query) }
  Now:   GroqProvider, OpenAlexSearch, WikipediaSearch
  Later: DeepSpaceAnthropicProvider, ExaSearch, ScholarSearch
         (stubs marked "not tested: no DeepSpace credits")

====================================================================
WHEN DONE
====================================================================
- Write results into docs/design/11-decisions-and-risks.md:
  each T item = CONFIRMED / FAILED / STILL UNKNOWN + evidence.
- Give me a clear decision: GO (job design) or PLAN B (fixed pipeline in
  one server action), with the reason in 2-3 sentences.
- Commit the doc update on main (the secret check must pass) and push.
  Keep spike/verify, but don't merge it.
- Then STOP and wait for me.
</pasted_content id="2dc4">

### 2026-11-21 21:40 · session 91be81e4


<pasted_content id="1a35">
SESSION 03: FEATURE 1: Rooms, roles, invite links. Production quality.

Context: read CLAUDE.md, docs/design/03, 04, 05, 06, 11 (spike results).
The spike (branch spike/verify) CONFIRMED: role check in server actions,
uniqueOn, server-only job enqueue, test accounts via the users(2) fixture.
Reuse what worked from spike/verify, but write clean production code on a
new branch feat/rooms. Do not merge spike/verify.

Known gotcha from the spike: files imported by src/actions/index.ts must not
import action-routes.ts at load time (import cycle = empty actions map = 404).

BUILD (F1 only):
1. Data: rooms (title, question, ownerId, runLimit=5, inviteToken) and
   team_members (roomId, userId, role: owner|researcher|viewer), with
   uniqueOn(roomId,userId). Follow docs/design/06.
2. READ ACCESS: only members of a room can read that room's data. The spike
   used read: true. Fix that here using DeepSpace's permission rules (check
   the docs for the right rule, e.g. team-based reads). Non-members get nothing.
3. Server actions (all writes go through actions with role checks):
   createRoom (creator becomes owner), createInviteLink (owner),
   joinByInvite(token) (joins as researcher), changeRole (owner),
   removeMember (owner). The owner can't remove themselves.
4. Screens (simple, clean, follow doc 04; use existing scaffold UI pieces
   and `npx deepspace add` features where they fit, don't hand-build them):
   - Rooms list (my rooms + "New room")
   - Create room (title + research question)
   - Room page shell: header with question, members panel with roles and
     who's online (presence), and an empty board area saying
     "Agent runs arrive in Feature 2"
   - Invite: owner copies the link; opening it signs in and joins
5. Empty, loading and error states.

TESTS (must pass before you finish):
- Two-user Playwright test (users(2) fixture): A creates a room, B joins by
  link, both see each other in the members list live.
- Server checks: a non-member can't read the room; a viewer can't call
  owner-only actions (call the actions directly, not only through the UI).
- `npx deepspace test run` passes.

PROCESS:
- First give me a SHORT plan (files you'll create/change, 10 lines max).
  Then build without waiting, unless something in the plan conflicts with
  the docs. In that case, ask me.
- Keep code readable: small functions, clear names, types for every record.
- When done: merge feat/rooms into main, run the secret check, push, and
  `npx deepspace deploy`. Then open https://scoutroom.app.space and confirm
  the rooms list loads.
- Add Session 03 to docs/agent-log.md (what you built, what you tested,
  anything you got wrong and fixed). Leave the "What I verified myself"
  line for me to fill.
- Report: what works, test results, anything unfinished. Then STOP.
</pasted_content id="1a35">

### 2026-11-21 21:40 · session 91be81e4
Note: secrets now set: GROQ_API_KEY and OPENALEX_API_KEY (server-only). No mailto needed.

