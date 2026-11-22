/** Strict validation of what the model returns. Nothing unvalidated is ever saved. */
import { z } from 'zod'
import type { SearchHit } from '../../providers/types'
import type { CardRecord } from '../../lib/run-types'

export const MIN_CARDS = 3
export const MAX_CARDS = 6
export const CLAIM_MAX = 280
/** Wikipedia is background, not evidence: its confidence is capped. */
export const BACKGROUND_CONFIDENCE_CAP = 0.6

const rawCard = z
  .object({
    claim: z.string().trim().min(1).max(CLAIM_MAX),
    sourceUrl: z.string().url(),
    confidence: z.number().min(0).max(1),
  })
  .strict()

export type ParseResult = { ok: true; cards: Omit<CardRecord, 'teamId' | 'runId'>[] } | { ok: false; error: string }

/**
 * `text` is the model's reply. Rules: valid JSON; `{cards: [...]}` with no extra keys;
 * 3-6 cards (fewer only if we had fewer sources); every `sourceUrl` is one we gave it.
 * Title and type come from OUR search hit, never from the model.
 */
export function parseCards(text: string, hits: SearchHit[]): ParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'the reply was not valid JSON' }
  }
  const min = Math.min(MIN_CARDS, hits.length)
  const parsed = z.object({ cards: z.array(rawCard).min(min).max(MAX_CARDS) }).strict().safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: `${issue?.path.join('.') || 'reply'}: ${issue?.message ?? 'invalid'}` }
  }

  const byUrl = new Map(hits.map((h) => [h.url, h]))
  const cards: Omit<CardRecord, 'teamId' | 'runId'>[] = []
  for (const c of parsed.data.cards) {
    const hit = byUrl.get(c.sourceUrl)
    if (!hit) return { ok: false, error: `sourceUrl ${c.sourceUrl} is not one of the provided sources` }
    const cap = hit.sourceType === 'background' ? BACKGROUND_CONFIDENCE_CAP : 1
    cards.push({
      claim: c.claim,
      sourceUrl: hit.url,
      sourceTitle: hit.title,
      sourceType: hit.sourceType,
      confidence: Math.round(Math.min(c.confidence, cap) * 100) / 100,
    })
  }
  return { ok: true, cards }
}

const queryText = z.string().trim().min(3).max(200)
const planSchema = z
  .object({ paperQueries: z.array(queryText).min(1).max(2), backgroundQuery: queryText })
  .strict()

export type Plan = z.infer<typeof planSchema>

export function parsePlan(text: string): Plan | null {
  try {
    const parsed = planSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
