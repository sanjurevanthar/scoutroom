/** Strict validation of the brief the model returns. Nothing unvalidated is ever saved. */
import { z } from 'zod'
import type { BriefParagraph } from '../../lib/brief'

export const MAX_PARAGRAPHS = 4
export const PARAGRAPH_MAX = 1200

const paragraph = z
  .object({
    text: z.string().trim().min(1).max(PARAGRAPH_MAX),
    citations: z.array(z.string()).min(1).max(8),
  })
  .strict()

export type ParseBriefResult =
  | { ok: true; paragraphs: BriefParagraph[]; citedCardIds: string[] }
  | { ok: false; error: string }

/**
 * `keptIds`: the only ids a citation may use. `knownIds` (optional): every card in the room,
 * so the error can tell "not a kept card" from "not a card at all".
 * Rules: valid JSON; `{paragraphs:[...]}` with no extra keys; 1-4 paragraphs; each cites at least one card.
 */
export function parseBrief(text: string, keptIds: readonly string[], knownIds: readonly string[] = []): ParseBriefResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'the reply was not valid JSON' }
  }
  const parsed = z.object({ paragraphs: z.array(paragraph).min(1).max(MAX_PARAGRAPHS) }).strict().safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: `${issue?.path.join('.') || 'reply'}: ${issue?.message ?? 'invalid'}` }
  }
  const kept = new Set(keptIds)
  const known = new Set(knownIds)
  const cited: string[] = []
  const paragraphs: BriefParagraph[] = []
  for (const p of parsed.data.paragraphs) {
    const citations: string[] = []
    for (const id of p.citations) {
      if (!kept.has(id)) {
        return {
          ok: false,
          error: known.has(id) ? `citation ${id} is not a kept card` : `citation ${id} is not a card you were given`,
        }
      }
      if (!citations.includes(id)) citations.push(id)
      if (!cited.includes(id)) cited.push(id)
    }
    paragraphs.push({ text: p.text, citations })
  }
  return { ok: true, paragraphs, citedCardIds: cited }
}
