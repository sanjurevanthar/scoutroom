SESSION 10: Switch AI + search to DeepSpace integrations. Time-box: 75 minutes.
Follow CLAUDE.md (branch feat/deepspace-integrations from an up-to-date
main, PR, no merge, no deploy).

Context: README.md is on main (PR #9). PRs #10 and #11 were closed without
merging. `npx deepspace app usage` shows Plan: free, Credits: 500 of 500
($5), so we can use DeepSpace integrations.

STEP 1: Check before coding (report briefly):
- `npx deepspace integrations info anthropic/chat-completion`,
  `exa/search`, `scholar/search-papers`: inputs, outputs, price, model ids.
- Pick the cheapest Claude Haiku model available for anthropic.
- Estimate credits per scout run and per brief. If one run would cost more
  than ~5 credits, tell me and use fewer searches.
- Read the DeepSpace docs on calling integrations from SERVER code (server
  actions AND background jobs). Confirm the job can call them; cite the page.

STEP 2: Implement (small, clean, server-side only):
- Real adapters behind the existing interfaces in src/providers/:
  DeepSpaceAnthropicProvider (LLMProvider), ScholarSearch (papers),
  ExaSearch (web). Replace the existing stubs.
- Exa results: add sourceType "web" if it's a small change (badge in UI);
  otherwise map them to "background". Your choice, documented.
- Production config: LLM_PROVIDER / SEARCH_PROVIDER select DeepSpace. Keep
  Groq/OpenAlex/Wikipedia as a fallback config (don't delete them).
- The brief (F4) uses the same LLM provider setting.
- Errors: insufficient credits (402) or provider errors -> the run/brief
  fails with a clear human message ("Out of DeepSpace credits" etc.).
  No silent fallback.
- Same rules as before: strict JSON + zod, citations only from supplied
  URLs/kept cards, prompt-injection guard, step budget, stale-run heartbeat.

STEP 3: Checks:
- Automated tests still use FAKE providers (no real calls).
- Adapter contract tests using recorded sample responses (no network).
- ONE real local run + ONE real brief through DeepSpace integrations.
  Max ~10 integration calls total. Show the cards and brief in the PR.
  Show `npx deepspace app usage` before/after (credits used).
- `npm run check:reliability` green, and `npx deepspace test run all`
  3 times IN THE FOREGROUND, all green. No sleep loops/Monitors.

STEP 4: Docs (same PR). Describe the CURRENT design cleanly; don't scatter
the history across files.
- README and docs/design (00, 01, 05, 08, 12, 13): describe the app as it
  is now. AI and search use the DeepSpace integrations
  anthropic/chat-completion, scholar/search-papers and exa/search.
  Groq / OpenAlex / Wikipedia are a "free fallback config" (external
  providers, NOT DeepSpace integrations), chosen with LLM_PROVIDER /
  SEARCH_PROVIDER. Remove every "0 credits" sentence and any "we started
  with free providers" storytelling from these files. No history narrative
  here.
- History goes in ONE place only: docs/design/11-decisions-and-risks.md.
  Update the existing D8 (provider interfaces) entry, without adding
  contradictory text, to say: "Provider interfaces from the start. Early
  builds ran on the free fallback because I misread my DeepSpace credit
  balance as 0; on the final day I found 500 free credits and switched
  production to DeepSpace integrations. The switch needed new adapters
  but no agent changes."
- README: a section "DeepSpace integrations used" (what each does + rough
  credits per run), then a short "Free fallback providers" note + how to
  switch.
- docs/agent-log.md: add Session 10 (what changed and why). Leave earlier
  sessions as they are (they're a true record of what happened then).
  Leave "What I verified myself" EMPTY.
- Before finishing, grep README.md and docs/design for "0 credits",
  "no credits", "Grok", "untested" and "stub", and fix any leftovers so
  nothing contradicts the current design.
- Tell me EXACTLY what I must set for production (setting names + the
  command) before deploy.
- Save this prompt as docs/prompts/10-deepspace-integrations.md.

Commit (secret check must pass), push, open a PR. Do NOT merge or deploy.
If not working within 75 minutes: open a DRAFT PR, explain what's missing,
and STOP. We'll ship on the free providers instead.

--- Follow-up answer during the session (scholar/search-papers failed upstream) ---
Go with option 1 (Exa research-paper mode for papers). Integrations used in
production: anthropic/chat-completion and exa/search (web + research-paper
mode). scholar/search-papers is implemented and contract-tested but NOT the
default, because DeepSpace's Scholar provider returned "Your account has run
out of searches" (502, billing released) during the build. Say this in one
line in README and doc 08, with the setting to switch to it when it works
again. Put the exact error + date in doc 11 (risks) and in the PR. Don't
claim three integrations in use: say two in use + one built and ready.
Continue with the real run, brief, checks and PR. Time-box stays: PR by 8:00 PM.
