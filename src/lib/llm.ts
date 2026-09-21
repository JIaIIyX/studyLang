import { looksLikeThinking, stripThinking } from './modelParse'
import { noteLlmUsage, type LlmUsage } from './llmUsage'

export type AskOptions = {
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
  timeoutMs?: number
}

export function hasGemini() {
  return true
}

function errorText(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message}`
  return String(error ?? '')
}

export const MODEL_TIMEOUT_HINT =
  'Модель не успела ответить. Напишите ещё раз — обычно со второго раза проходит.'

export function isQuotaError(error: unknown) {
  return /429|rate.?limit|quota|exceeded|tpm|rpd|provider returned|llm-failed|temporarily|overloaded|timeout|no (allowed )?providers/i.test(
    errorText(error),
  )
}

export async function askGemini(
  systemInstruction: string,
  history: { role: 'user' | 'model'; text: string }[],
  options?: AskOptions,
): Promise<string> {
  const messages = history
    .filter((item) => item.text.trim())
    .map((item) => {
      const cleaned = stripThinking(item.text) || (looksLikeThinking(item.text) ? 'Продолжим.' : item.text)
      return {
        role: item.role === 'model' ? ('assistant' as const) : ('user' as const),
        content: cleaned,
      }
    })
  if (!messages.some((item) => item.role === 'user')) throw new Error('empty')

  const timeout = AbortSignal.timeout(options?.timeoutMs ?? 35_000)
  const signal =
    options?.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([options.signal, timeout])
      : (options?.signal ?? timeout)
  let response: Response
  try {
    response = await fetch('/api/llm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        system: systemInstruction,
        history: messages,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
      }),
    })
  } catch (error) {
    if (options?.signal?.aborted) throw error
    if (error instanceof Error && error.name === 'AbortError') throw new Error('timeout')
    throw error
  }
  const raw = await response.text()
  let data: { text?: string; error?: string; usage?: Partial<LlmUsage> & { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }; model?: string; provider?: string } = {}
  try {
    data = JSON.parse(raw) as typeof data
  } catch {
    throw new Error(response.ok ? 'empty' : `llm-${response.status}`)
  }
  if (!response.ok) {
    throw new Error(data.error || `llm-${response.status}`)
  }
  const text = stripThinking(data.text?.trim() || '')
  if (!text) throw new Error('empty')
  const usage = data.usage
  if (usage) {
    noteLlmUsage({
      promptTokens: Number(usage.promptTokens ?? usage.prompt_tokens) || 0,
      completionTokens: Number(usage.completionTokens ?? usage.completion_tokens) || 0,
      totalTokens: Number(usage.totalTokens ?? usage.total_tokens) || 0,
      model: data.model || usage.model,
      provider: data.provider || usage.provider,
    })
  }
  return text
}
