/** Picks providers from the non-secret LLM_PROVIDER / SEARCH_PROVIDER settings (docs/design/08). */
import { DeepSpaceAnthropicProvider, ExaSearch, ScholarSearch } from './deepspace'
import type { IntegrationCall } from './deepspace'
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
  /** Not secret. Overrides the Claude model used through DeepSpace (default claude-haiku-5-5). */
  DEEPSPACE_LLM_MODEL?: string
  OPENALEX_API_KEY?: string
  /** Not secret. Milliseconds without progress before a run counts as stuck (default 180000). */
  STALE_RUN_MS?: string
}

/** Delay between fake calls so e2e tests can watch a run progress. */
const FAKE_DELAY_MS = 1200

/** Just the LLM (the brief needs no search). Throws ProviderConfigError if it is not configured. */
export function getLlm(env: ProviderEnv, integrationCall?: IntegrationCall): LLMProvider {
  const llmSetting = env.LLM_PROVIDER || 'groq'
  const llm =
    llmSetting === 'groq'
      ? new GroqProvider({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL })
      : llmSetting === 'deepspace'
        ? new DeepSpaceAnthropicProvider(requireCall(integrationCall), env.DEEPSPACE_LLM_MODEL)
        : llmSetting === 'fake'
          ? new FakeLLM(undefined, FAKE_DELAY_MS)
          : null
  if (!llm) throw new ProviderConfigError(`Unknown LLM_PROVIDER "${llmSetting}"`)
  return llm
}

/** DeepSpace integrations are reachable only from server code that has `tools.integration`. */
function requireCall(call: IntegrationCall | undefined): IntegrationCall {
  if (!call) throw new ProviderConfigError('DeepSpace integrations are not available here')
  return call
}

export function getProviders(env: ProviderEnv, integrationCall?: IntegrationCall): Providers {
  const llm = getLlm(env, integrationCall)
  const searchSetting = env.SEARCH_PROVIDER || 'free'

  if (searchSetting === 'free') {
    return {
      llm,
      papers: new OpenAlexSearch({ apiKey: env.OPENALEX_API_KEY }),
      background: new WikipediaSearch(),
    }
  }
  if (searchSetting === 'deepspace') {
    const call = requireCall(integrationCall)
    return { llm, papers: new ExaSearch(call, 'paper'), background: new ExaSearch(call, 'background') }
  }
  // Same as above but papers come from Google Scholar. Use it once DeepSpace's Scholar provider works again.
  if (searchSetting === 'deepspace-scholar') {
    const call = requireCall(integrationCall)
    return { llm, papers: new ScholarSearch(call), background: new ExaSearch(call, 'background') }
  }
  if (searchSetting === 'fake') {
    return { llm, papers: new FakeSearch('paper', FAKE_DELAY_MS), background: new FakeSearch('background', FAKE_DELAY_MS) }
  }
  throw new ProviderConfigError(`Unknown SEARCH_PROVIDER "${searchSetting}"`)
}

export type { IntegrationCall } from './deepspace'
export * from './types'
