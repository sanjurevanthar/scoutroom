import type { SearchHit, SearchProvider } from './types'
import { isHttps, toPlainText, withTimeout } from './http'
import type { FetchLike } from './http'

const SELECT = 'id,doi,title,publication_year,cited_by_count,primary_location,abstract_inverted_index'
const LIMIT = 4
const TIMEOUT_MS = 20_000

export interface OpenAlexOptions {
  apiKey?: string
  fetchImpl?: FetchLike
}

/** OpenAlex abstracts arrive as {word: [positions]}. Put them back in order. */
export function abstractFromIndex(index: Record<string, number[]> | null | undefined): string {
  if (!index) return ''
  const words: string[] = []
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word
  return words.filter(Boolean).join(' ')
}

/** Papers from OpenAlex (free). The key is sent as the `api_key` parameter and never appears in an error. */
export class OpenAlexSearch implements SearchProvider {
  readonly name = 'openalex'
  readonly kind = 'paper' as const
  private readonly apiKey?: string
  private readonly fetchImpl: FetchLike

  constructor(opts: OpenAlexOptions = {}) {
    this.apiKey = opts.apiKey
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  async search(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
    const params = new URLSearchParams({ search: query, 'per-page': String(LIMIT), select: SELECT })
    if (this.apiKey) params.set('api_key', this.apiKey)
    const res = await this.fetchImpl(`https://api.openalex.org/works?${params}`, {
      signal: withTimeout(TIMEOUT_MS, signal),
    })
    // Deliberately no URL in the message: it carries the key.
    if (!res.ok) throw new Error(`OpenAlex request failed (HTTP ${res.status})`)
    const json = (await res.json()) as { results?: Record<string, any>[] }

    const hits: SearchHit[] = []
    for (const w of json.results ?? []) {
      const url = [w.primary_location?.landing_page_url, w.doi, w.id].find(isHttps)
      const title = typeof w.title === 'string' ? toPlainText(w.title, 200) : ''
      if (!url || !title) continue
      const abstract = abstractFromIndex(w.abstract_inverted_index)
      const venue = w.primary_location?.source?.display_name
      const snippet = abstract
        ? toPlainText(abstract, 500)
        : toPlainText(`${venue ? `${venue}. ` : ''}Cited by ${w.cited_by_count ?? 0}.`, 200)
      hits.push({
        title,
        url,
        snippet,
        sourceType: 'paper',
        sourceName: 'OpenAlex',
        year: typeof w.publication_year === 'number' ? w.publication_year : undefined,
      })
    }
    return hits
  }
}
