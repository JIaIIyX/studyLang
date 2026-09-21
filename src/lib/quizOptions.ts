import { fold, matchesAnswer, shuffle, stripMarks } from './normalize'
import type { Language, WordEntry, WordFile } from '../types'

export type QuizDirection = 'to-ru' | 'from-ru'
export type SentenceChip = { token: string; decoy: boolean }

const FILLERS: Record<Language, string[]> = {
  fr: ['aussi', 'encore', 'beaucoup', 'jamais', 'souvent', 'déjà'],
  de: ['auch', 'noch', 'immer', 'gern', 'heute', 'wieder'],
  en: ['also', 'never', 'often', 'really', 'today', 'already'],
}

function tokensOf(entry: WordEntry) {
  if (entry.tokens?.length) return entry.tokens.map(stripMarks).filter(Boolean)
  return stripMarks(entry.term).split(/\s+/).filter(Boolean)
}

export function localTranslationOptions(entry: WordEntry, file: WordFile, direction: QuizDirection) {
  const correct = stripMarks((direction === 'to-ru' ? entry.translation : entry.term) ?? '')
  if (!correct) return []
  const extras = file.entries
    .filter((item) => item.id !== entry.id)
    .map((item) => stripMarks((direction === 'to-ru' ? item.translation : item.term) ?? ''))
    .filter((item) => item && !matchesAnswer(item, correct))
  return shuffle([...new Set([correct, ...extras])]).slice(0, 4)
}

export async function generateTranslationOptions(
  entry: WordEntry,
  file: WordFile,
  direction: QuizDirection,
  _language: Language,
) {
  return localTranslationOptions(entry, file, direction)
}

export function localSentenceChips(entry: WordEntry, file: WordFile, language: Language): SentenceChip[] {
  const real = tokensOf(entry)
  const taken = new Set(real.map((token) => fold(token)))
  const extras: string[] = []
  for (const item of file.entries) {
    if (item.id === entry.id) continue
    for (const token of tokensOf(item)) {
      if (taken.has(fold(token)) || extras.includes(token)) continue
      extras.push(token)
      if (extras.length >= 3) break
    }
    if (extras.length >= 3) break
  }
  for (const token of shuffle(FILLERS[language])) {
    if (extras.length >= 3) break
    if (!taken.has(fold(token))) extras.push(token)
  }
  return shuffle([
    ...real.map((token) => ({ token, decoy: false })),
    ...extras.slice(0, 3).map((token) => ({ token, decoy: true })),
  ])
}

export async function generateSentenceChips(entry: WordEntry, file: WordFile, language: Language) {
  return localSentenceChips(entry, file, language)
}
