import type { Language, WordEntry } from '../types'

export function isRussian(text: string) {
  return /[а-яё]/i.test(text)
}

function hasLatin(text: string) {
  return /[a-zäöüßàâéèêëïîôùûçæœ]/i.test(text)
}

type Draft = { id: string; term: string }
type Pair = { term: string; translation: string }

async function machineTranslate(language: Language, term: string, intoPractice: boolean) {
  const phrase = /\s/.test(term.trim())
  const response = await fetch('/api/translate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: term,
      lang: language,
      ...(intoPractice ? { dir: 'into' } : phrase ? { mode: 'phrase' } : {}),
    }),
  })
  if (!response.ok) return ''
  const data = (await response.json()) as { translation?: string }
  return String(data.translation ?? '').trim()
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = []
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++
      out[current] = await fn(items[current])
    }
  })
  await Promise.all(workers)
  return out
}

export async function translateRussianTerms(
  language: Language,
  drafts: Draft[],
): Promise<Map<string, Pair>> {
  const russian = drafts.filter((item) => isRussian(item.term))
  if (russian.length === 0) return new Map()
  const result = new Map<string, Pair>()
  await mapPool(russian, 3, async (draft) => {
    const translated = await machineTranslate(language, draft.term, true)
    if (!translated || (isRussian(translated) && !hasLatin(translated))) return
    result.set(draft.id, { term: translated, translation: draft.term })
  })
  return result
}

async function translateForeignTerms(language: Language, drafts: Draft[]): Promise<Map<string, Pair>> {
  const foreign = drafts.filter((item) => item.term && !isRussian(item.term))
  if (foreign.length === 0) return new Map()
  const result = new Map<string, Pair>()
  await mapPool(foreign, 3, async (draft) => {
    const translation = await machineTranslate(language, draft.term, false)
    if (!translation || !isRussian(translation)) return
    result.set(draft.id, { term: draft.term, translation })
  })
  return result
}

export function applyTranslations(entries: WordEntry[], translated: Map<string, Pair>): WordEntry[] {
  return entries.map((entry) => {
    const next = translated.get(entry.id)
    if (!next) return entry
    return { ...entry, term: next.term, translation: next.translation }
  })
}

export function needsTranslation(entries: WordEntry[]) {
  return entries.some((entry) => entry.term.trim() && !entry.translation?.trim())
}

export async function fillMissingTranslations(language: Language, entries: WordEntry[]): Promise<WordEntry[]> {
  if (!needsTranslation(entries)) return entries

  const drafts = entries
    .filter((entry) => entry.term.trim() && !entry.translation?.trim())
    .map((entry) => ({ id: entry.id, term: entry.term.trim() }))

  const fromRussian = await translateRussianTerms(language, drafts)
  const leftover = drafts.filter((item) => !fromRussian.has(item.id))
  const fromForeign = await translateForeignTerms(language, leftover)

  const merged = new Map<string, Pair>([...fromRussian, ...fromForeign])
  return applyTranslations(entries, merged)
}
