export function readJsonValue(draft: string): unknown {
  const raw = draft.trim()
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function writeDraft(value: unknown) {
  return JSON.stringify(value)
}

export function asStringList(draft: string): string[] {
  const parsed = readJsonValue(draft)
  if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? ''))
  if (!draft.trim()) return []
  return draft.split(/\n|\|\|\|/).map((item) => item.replace(/\r$/, ''))
}

export function asStringMap(draft: string): Record<string, string> {
  const parsed = readJsonValue(draft)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')]),
    )
  }
  if (!draft.trim()) return {}
  const next: Record<string, string> = {}
  for (const line of draft.split('\n')) {
    const parts = line.split(/\s*[—–:]=?\s*|\s+-\s+/)
    if (parts.length < 2) continue
    const key = parts[0]?.trim()
    const value = parts.slice(1).join(' ').trim()
    if (key && value) next[key] = value
  }
  return next
}

export function padLines(draft: string, count: number) {
  const lines = asStringList(draft)
  return Array.from({ length: count }, (_, index) => lines[index] ?? '')
}
