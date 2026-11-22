import type { SearchHit, SearchProvider } from './types'
import { toPlainText, withTimeout } from './http'
import type { FetchLike } from './http'

const LIMIT = 3
const TIMEOUT_MS = 15_000
// Wikipedia asks API clients to identify themselves. Generic name on purpose: no personal details.
const USER_AGENT = 'ScoutRoom/1.0 (research assistant app)'

/** Background facts from Wikipedia (free). Extracts are HTML: stripped here. */
export class WikipediaSearch implements SearchProvider {
  readonly name = 'wikipedia'
  readonly kind = 'background' as const
  private readonly fetchImpl: FetchLike

  constructor(opts: { fetchImpl?: FetchLike } = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  async search(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
    const params = new URLSearchParams({ q: query, limit: String(LIMIT) })
    const res = await this.fetchImpl(`https://en.wikipedia.org/w/rest.php/v1/search/page?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: withTimeout(TIMEOUT_MS, signal),
    })
    if (!res.ok) throw new Error(`Wikipedia request failed (HTTP ${res.status})`)
    const json = (await res.json()) as { pages?: { key?: string; title?: string; excerpt?: string; description?: string }[] }

    const hits: SearchHit[] = []
    for (const p of json.pages ?? []) {
      if (!p.key || !p.title) continue
      const text = [p.description, p.excerpt ? toPlainText(p.excerpt, 400) : ''].filter(Boolean).join('. ')
      hits.push({
        title: toPlainText(p.title, 200),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.key)}`,
        snippet: toPlainText(text, 500),
        sourceType: 'background',
        sourceName: 'Wikipedia',
      })
    }
    return hits
  }
}
