/** Picks providers from the non-secret LLM_PROVIDER / SEARCH_PROVIDER settings (docs/design/08). */
import { DeepSpaceLLM, DeepSpaceSearch } from './deepspace'
import { FakeLLM, FakeSearch } from './fake'
import { GroqProvider } from './groq'
import { OpenAlexSearch } from './openalex'
import { ProviderConfigError } from './types'
import type { LLMProvider, Providers } from './types'
import { WikipediaSearch } from './wikipedia'

export interface ProviderEnv {
  LLM_PROVIDER?: string
  SEARCH_PROVIDER?: string
  GROQ_API_KEY?: string
  GROQ_MODEL?: string
  OPENALEX_API_KEY?: string
  /** Not secret. Milliseconds without progress before a run counts as stuck (default 180000). */
  STALE_RUN_MS?: string
}

/** Delay between fake calls so e2e tests can watch a run progress. */
const FAKE_DELAY_MS = 1200

/** Just the LLM (the brief needs no search). Throws ProviderConfigError if it is not configured. */
export function getLlm(env: ProviderEnv): LLMProvider {
  const llmSetting = env.LLM_PROVIDER || 'groq'
  const llm =
    llmSetting === 'groq'
      ? new GroqProvider({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL })
      : llmSetting === 'deepspace'
        ? new DeepSpaceLLM()
        : llmSetting === 'fake'
          ? new FakeLLM(undefined, FAKE_DELAY_MS)
          : null
  if (!llm) throw new ProviderConfigError(`Unknown LLM_PROVIDER "${llmSetting}"`)
  return llm
}

export function getProviders(env: ProviderEnv): Providers {
  const llm = getLlm(env)
  const searchSetting = env.SEARCH_PROVIDER || 'free'

  if (searchSetting === 'free') {
    return {
      llm,
      papers: new OpenAlexSearch({ apiKey: env.OPENALEX_API_KEY }),
      background: new WikipediaSearch(),
    }
  }
  if (searchSetting === 'deepspace') {
    return { llm, papers: new DeepSpaceSearch('paper'), background: new DeepSpaceSearch('background') }
  }
  if (searchSetting === 'fake') {
    return { llm, papers: new FakeSearch('paper', FAKE_DELAY_MS), background: new FakeSearch('background', FAKE_DELAY_MS) }
  }
  throw new ProviderConfigError(`Unknown SEARCH_PROVIDER "${searchSetting}"`)
}

export * from './types'
