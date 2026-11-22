# Session 08b prompt: README integrations

SESSION 08b: README: clarify DeepSpace integrations (planned vs used now).
Follow CLAUDE.md (branch docs/readme-integrations, open a PR, don't merge).
Docs only, no code changes. Verify every claim against the code
(src/providers/, settings names, worker) before writing it.

1. Add a README section "DeepSpace integrations: planned vs. used now" with
   a short intro: my DeepSpace account had 0 credits, so the catalog
   integrations couldn't be called; AI and search sit behind provider
   interfaces and use free providers for now; switching is a config change.

   Table: Need | Planned DeepSpace integration | Used now (free) | Why
   - AI (plan searches, write cards, write brief) | anthropic/chat-completion
     | Groq (openai/gpt-oss-20b), called directly | no credits; Groq free tier
   - Research papers | scholar/search-papers | OpenAlex API (free key) | no credits
   - Web / background search | exa/search | Wikipedia REST API (background only,
     lower confidence) | no credits; Wikipedia is weaker than real web search
   - (Future) Watch-mode email digest | email/send | not built | future feature

2. A short "How the switch works" part (3-5 bullets): the LLMProvider /
   SearchProvider interfaces, the setting names that choose the provider
   (use the real names from the code), DeepSpace adapter classes that exist
   as stubs marked "not tested: no DeepSpace credits", calls go through the
   DeepSpace integrations proxy on the server and are billed to the app
   owner's credits, and the priority if credits arrive (exa/search first for
   real web search, then anthropic for card/brief writing).

3. Make the README consistent: anywhere it lists "integrations", make sure
   Groq / OpenAlex / Wikipedia are called "external free providers", NOT
   DeepSpace integrations. Keep the separate "DeepSpace primitives used"
   table as is.

4. If docs/design/08-integrations.md says anything different, align it.

Add Session 08b to docs/agent-log.md; leave "What I verified myself" EMPTY.
Save this prompt as docs/prompts/08b-readme-integrations.md.
Commit (the secret check must pass), push, open a PR. Do NOT merge. STOP.
