# 01 · Product Overview

> **In simple words:** ScoutRoom is a shared research room. A team asks one question. An AI agent searches the web and research papers, then pins "evidence cards" on a shared board. Everyone sees the cards appear live, and the team votes to keep or reject each one.

Tags: **[THIS BUILD]** = we build it by Sunday night. **[FUTURE]** = documented only.

## The problem

- Research for a team decision ("Which vector database should we use?") is slow and messy.
- People paste links into chat. Nobody knows which claims are backed by a source.
- AI chat tools give a long answer. You cannot see what it searched, and you cannot easily reject one weak claim.

## Who it is for

Small teams (2-10 people) making a tech or product choice, who want AI speed but human control.

## What ScoutRoom does

1. A team creates a **room** and asks a question.
2. A server-side **AI agent** plans a few searches, runs them, and posts **evidence cards**. A card has a claim, a source link, a source type (web or paper) and a confidence level.
3. Everyone in the room sees the agent's steps and new cards **live**, with no refresh.
4. The team **votes** keep or reject on each card.
5. The agent writes a short **brief** using only the kept cards, with [1] [2] citations.

## Features

| # | Feature | Tag |
|---|---|---|
| F1 | Rooms, roles (owner / researcher / viewer), invites | **[THIS BUILD]** |
| F2 | Live agent run: search, then cards, visible step by step | **[THIS BUILD]** |
| F3 | Team votes (keep / reject) with live counts | **[THIS BUILD]** |
| F4 | Cited brief from kept cards (owner/researcher writes it; max 5 per room; every `[n]` is a kept card) | **[THIS BUILD]** (built, session 07) |
| F5 | Challenge a card (agent digs deeper on one card) | **[FUTURE]** |
| F6 | Watch mode: daily re-check + email digest | **[FUTURE]** |
| F7 | Agent tools via `registerAgent` (my own coding agent queries a room) | **[FUTURE]** |
| F8 | Export brief to Google Docs | **[FUTURE]** |
| F9 | Live co-editing of the brief | **[FUTURE]** |
| F10 | Room templates (competitor scan, literature review, tech choice) | **[FUTURE]** |
| F11 | Usage / cost dashboard per room | **[FUTURE]** |

## Hard rules (apply to everything)

- All AI and integration calls run on the **server**, never in the browser.
- Max **8 search calls per run** (Plan A; Plan B uses 2). The owner sets a per-room run limit, **default 5**. One question per room; re-runs are allowed within the limit.
- Only **one active run per room** at a time.
- Run status is saved as **records**: `queued -> running -> done | failed | stopped`. A refresh never loses it.
- The agent must return **strict JSON**. We validate it before saving any card.
- Use DeepSpace's built-in pieces instead of building our own.

## What success looks like for this build

1. Two people in two browsers see the same cards appear live, with no refresh.
2. A viewer cannot run the agent. The **server** refuses it, not just the UI.
3. A second run cannot start while one is active. Reaching the budget stops the run cleanly.
4. A page refresh in the middle of a run shows the correct status and all steps so far.
5. Every card has a working source link and passed validation. Every `[n]` in the brief maps to a kept card (F4 shipped; the server rejects any other citation).

## AI and search providers (decided)

The agent uses two small interfaces. In production they call the DeepSpace integrations `anthropic/chat-completion` (Claude Haiku) and `exa/search` (web and research papers), paid from the owner's credits. `scholar/search-papers` is built and ready but not in use. A free fallback (Groq, OpenAlex, Wikipedia) is selected with `LLM_PROVIDER` / `SEARCH_PROVIDER`. See [08-integrations.md](08-integrations.md).

## Left out on purpose

| Left out | Why |
|---|---|
| Google Scholar as the default paper source | Built and ready, but DeepSpace's Scholar provider is out of searches (see [11](11-decisions-and-risks.md)). Exa's research-paper mode is the default. |
| Payments / Stripe | No paying user in this flow. |
| `fal` (images) | Decoration, no real value for research. |
| Email + cron | Moved to **[FUTURE]** (watch mode) because of time. |

See [08-integrations.md](08-integrations.md) for the integrations we do use.
