/**
 * generateBrief (F4): owner and researcher only. Uses ONLY kept cards (the rule in lib/votes.ts),
 * one short LLM call inside the action (no job: docs/design/07 "Brief (F4)"), strict JSON, citations checked.
 */
import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../../worker'
import { BRIEF_LIMIT, keptCardIds } from '../../lib/brief'
import type { BriefRecord } from '../../lib/brief'
import type { CardRecord } from '../../lib/run-types'
import type { RoomRecord } from '../../lib/room-types'
import type { VoteRecord } from '../../lib/votes'
import { getLlm } from '../../providers'
import type { LLMProvider } from '../../providers/types'
import { CreditsExhaustedError, ProviderConfigError, ProviderError, RateLimitedError } from '../../providers/types'
import { fail, failFrom, isFail, requireMember } from '../rooms/access'
import { parseBrief } from './parse'
import { BRIEF_SCHEMA, briefMessages, briefRepairMessages } from './prompts'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const READ_LIMIT = 500

export const NO_KEPT_MESSAGE = 'Keep at least one card first'
export const limitMessage = (used: number) => `brief limit reached (${used} of ${BRIEF_LIMIT} used)`

export function makeGenerateBrief(llmFor: (env: Env, tools: ActionTools) => LLMProvider): ActionHandler<Env> {
  return async ({ userId, params, tools, env }) => {
    const roomId = str(params.roomId)
    if (!roomId) return fail('roomId is required')

    // Actions bypass RBAC: the role check here is the real boundary.
    const member = await requireMember(tools, roomId, userId)
    if (isFail(member)) return member
    if (member.role !== 'owner' && member.role !== 'researcher') return fail(`forbidden: role=${member.role}`)

    const room = await tools.get('rooms', roomId)
    if (!room.success) return fail('room not found')
    const question = (room.data.record.data as unknown as RoomRecord).question

    const countBriefs = async () => {
      const res = await tools.query<BriefRecord>('briefs', { where: { teamId: roomId }, limit: READ_LIMIT })
      return res.success ? res.data.records.map((r) => r.data.seq) : null
    }
    const seqs = await countBriefs()
    if (!seqs) return fail('could not read the briefs')
    if (seqs.length >= BRIEF_LIMIT) return fail(limitMessage(seqs.length))

    // The kept cards, from the votes as they are right now.
    const [cardRes, voteRes] = await Promise.all([
      tools.query<CardRecord>('cards', { where: { teamId: roomId }, limit: READ_LIMIT }),
      tools.query<VoteRecord>('votes', { where: { teamId: roomId }, limit: READ_LIMIT }),
    ])
    if (!cardRes.success || !voteRes.success) return fail('could not read the cards')
    const cards = cardRes.data.records
    const keptIds = keptCardIds(
      cards.map((c) => c.recordId),
      voteRes.data.records.map((v) => v.data),
    )
    if (keptIds.length === 0) return fail(NO_KEPT_MESSAGE)
    const keptSet = new Set(keptIds)
    const briefCards = cards
      .filter((c) => keptSet.has(c.recordId))
      .map((c) => ({ id: c.recordId, claim: c.data.claim, sourceTitle: c.data.sourceTitle }))

    let llm: LLMProvider
    try {
      llm = llmFor(env, tools)
    } catch {
      return fail('AI provider not configured')
    }

    let paragraphs, citedCardIds
    try {
      const messages = briefMessages(question, briefCards)
      const allIds = cards.map((c) => c.recordId)
      let reply = await llm.complete(messages, BRIEF_SCHEMA)
      let parsed = parseBrief(reply.text, keptIds, allIds)
      if (!parsed.ok) {
        // The one repair attempt.
        reply = await llm.complete(briefRepairMessages(messages, reply.text, parsed.error), BRIEF_SCHEMA)
        parsed = parseBrief(reply.text, keptIds, allIds)
      }
      if (!parsed.ok) return fail('The AI did not return a brief we could verify. Try again.')
      ;({ paragraphs, citedCardIds } = parsed)
    } catch (e) {
      if (e instanceof CreditsExhaustedError) return fail(e.message)
      if (e instanceof RateLimitedError) return fail('rate limited, try again')
      if (e instanceof ProviderError) return fail(e.message)
      if (e instanceof ProviderConfigError) return fail('AI provider not configured')
      // Log the kind only: never request data, never provider internals.
      console.error(`[brief] room=${roomId} ${e instanceof Error ? e.name : 'error'}`)
      return fail('Could not write the brief. Try again.')
    }

    // Save. `uniqueOn teamId+seq` makes two simultaneous briefs unable to both take the same slot,
    // and the limit is re-checked at every attempt, so the 5th slot cannot be passed.
    let created
    let latest = seqs
    for (let attempt = 0; attempt < 3; attempt++) {
      if (latest.length >= BRIEF_LIMIT) return fail(limitMessage(latest.length))
      const data: BriefRecord = {
        teamId: roomId,
        seq: Math.max(0, ...latest) + 1,
        content: JSON.stringify(paragraphs),
        citedCardIds: JSON.stringify(citedCardIds),
        keptCardIds: JSON.stringify(keptIds),
        createdBy: userId,
        model: [llm.name, llm.model].filter(Boolean).join('/'),
      }
      created = await tools.create('briefs', data)
      if (created.success) return { success: true, data: { briefId: created.data.recordId, seq: data.seq } }
      const again = await countBriefs() // someone else took that slot: look again
      if (!again) break
      latest = again
    }
    return failFrom(created!, 'could not save the brief, try again')
  }
}

export const generateBrief = makeGenerateBrief((env, tools) => getLlm(env, tools.integration))

export const briefActions: Record<string, ActionHandler<Env>> = { generateBrief }
