const STORAGE_KEY = 'studylang.llmUsage.v1'

export type LlmUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  model?: string
  provider?: string
}

export type LlmUsageDay = {
  day: string
  requests: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

type Store = {
  day: LlmUsageDay
  last: LlmUsage | null
}

function todayKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function emptyDay(day = todayKey()): LlmUsageDay {
  return { day, requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { day: emptyDay(), last: null }
    const parsed = JSON.parse(raw) as Store
    if (!parsed?.day?.day || parsed.day.day !== todayKey()) {
      return { day: emptyDay(), last: parsed.last ?? null }
    }
    return {
      day: {
        day: parsed.day.day,
        requests: Number(parsed.day.requests) || 0,
        promptTokens: Number(parsed.day.promptTokens) || 0,
        completionTokens: Number(parsed.day.completionTokens) || 0,
        totalTokens: Number(parsed.day.totalTokens) || 0,
      },
      last: parsed.last ?? null,
    }
  } catch {
    return { day: emptyDay(), last: null }
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* ignore quota */
  }
}

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeLlmUsage(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getLlmUsageDay() {
  return readStore().day
}

export function getLastLlmUsage() {
  return readStore().last
}

export function noteLlmUsage(usage: LlmUsage) {
  const promptTokens = Math.max(0, Math.round(usage.promptTokens) || 0)
  const completionTokens = Math.max(0, Math.round(usage.completionTokens) || 0)
  const totalTokens = Math.max(0, Math.round(usage.totalTokens) || promptTokens + completionTokens)
  const next: LlmUsage = {
    promptTokens,
    completionTokens,
    totalTokens,
    model: usage.model,
    provider: usage.provider,
  }
  const store = readStore()
  const day = store.day.day === todayKey() ? store.day : emptyDay()
  day.requests += 1
  day.promptTokens += promptTokens
  day.completionTokens += completionTokens
  day.totalTokens += totalTokens
  writeStore({ day, last: next })
  emit()
  return next
}

export function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(value)
}

/** Groq gpt-oss-20b paid rates for a rough $ estimate (input / output per 1M). */
export function estimateUsd(promptTokens: number, completionTokens: number) {
  return (promptTokens * 0.075 + completionTokens * 0.3) / 1_000_000
}