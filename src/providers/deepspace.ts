/**
 * DeepSpace-integration providers: the later option (docs/design/08).
 * Stubs only. NOT TESTED: no DeepSpace credits. They fail loudly rather than
 * pretend to work, so setting LLM_PROVIDER=deepspace today gives a clear error.
 */
import type { LLMProvider, LLMResult, SearchHit, SearchProvider, SourceKind } from './types'

const NOT_READY = 'not tested: no DeepSpace credits'

/** Would call `anthropic/chat-completion`. not tested: no DeepSpace credits. */
export class DeepSpaceLLM implements LLMProvider {
  readonly name = 'deepspace'
  async complete(): Promise<LLMResult> {
    throw new Error(NOT_READY)
  }
}

/** Would call `scholar/search-papers` (papers) or `exa/search` (background). not tested: no DeepSpace credits. */
export class DeepSpaceSearch implements SearchProvider {
  readonly name = 'deepspace'
  constructor(readonly kind: SourceKind) {}
  async search(): Promise<SearchHit[]> {
    throw new Error(NOT_READY)
  }
}
