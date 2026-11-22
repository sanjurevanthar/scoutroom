/** Shared by the worker and the pages. No runtime imports. Rules: docs/design/07 "Brief (F4)". */
import { tally } from './votes'
import type { VoteRecord } from './votes'

/** Max briefs written per room. Counted from saved briefs; a failed attempt costs nothing. */
export const BRIEF_LIMIT = 5

export type BriefParagraph = { text: string; citations: string[] }

export type BriefRecord = {
  teamId: string
  /** 1, 2, 3... per room. `uniqueOn teamId+seq` makes the limit race-proof. */
  seq: number
  /** JSON: BriefParagraph[] (already validated). */
  content: string
  /** JSON: card ids cited, in order of first appearance. Citation marker [n] = index + 1. */
  citedCardIds: string
  /** JSON: the kept card ids at generation time (sorted). Compared with now to show "Stale". */
  keptCardIds: string
  createdBy: string
  model: string
}

/**
 * The kept card ids, sorted. Uses `tally` -> `cardStatus` (the ONE kept rule in lib/votes.ts).
 * Used by the server to choose the cards and by the page to detect a stale brief.
 */
export function keptCardIds(
  cardIds: readonly string[],
  votes: readonly Pick<VoteRecord, 'cardId' | 'userId' | 'value'>[],
): string[] {
  const byCard = new Map<string, Pick<VoteRecord, 'userId' | 'value'>[]>()
  for (const v of votes) {
    const list = byCard.get(v.cardId) ?? []
    list.push(v)
    byCard.set(v.cardId, list)
  }
  return cardIds.filter((id) => tally(byCard.get(id) ?? []).status === 'kept').sort()
}

export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

/** Reads a JSON string column safely. A corrupt value gives the fallback, never a crash. */
export function parseJson<T>(text: string | undefined, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback
  } catch {
    return fallback
  }
}

/** The brief panel fires this on `window` (detail: card id); the board scrolls to and highlights that card. */
export const FOCUS_CARD_EVENT = 'scoutroom:focus-card'
