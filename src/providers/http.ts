/** Small helpers shared by the adapters. Nothing here ever sees or prints a secret. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
export type Sleep = (ms: number) => Promise<void>

export const defaultSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Combine a caller's abort signal with a timeout. */
export function withTimeout(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/** Strip tags, decode the few entities the APIs emit, collapse whitespace, truncate. */
export function toPlainText(html: string, max: number): string {
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export const isHttps = (url: unknown): url is string => {
  if (typeof url !== 'string') return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
