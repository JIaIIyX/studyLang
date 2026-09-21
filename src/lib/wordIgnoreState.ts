import { WORD_LEVELS, type WordLevel } from './wordLevels'
import type { Language } from '../types'

export type WordIgnoreState = {
  lists: Record<Language, string[]>
  levels: Record<Language, WordLevel[]>
}

const LANGUAGES: Language[] = ['fr', 'de', 'en']

export function emptyWordIgnore(): WordIgnoreState {
  return {
    lists: { fr: [], de: [], en: [] },
    levels: { fr: [], de: [], en: [] },
  }
}

function asLevel(value: unknown): WordLevel | null {
  return WORD_LEVELS.includes(value as WordLevel) ? (value as WordLevel) : null
}

export function parseWordIgnore(value: unknown): WordIgnoreState {
  const fallback = emptyWordIgnore()
  if (!value || typeof value !== 'object') return fallback
  const item = value as Partial<WordIgnoreState>
  const lists = { ...fallback.lists }
  const levels = { ...fallback.levels }
  for (const language of LANGUAGES) {
    const rawList = item.lists?.[language]
    if (Array.isArray(rawList)) {
      lists[language] = [...new Set(rawList.map((word) => String(word).trim()).filter(Boolean))]
    }
    const rawLevels = item.levels?.[language]
    if (Array.isArray(rawLevels)) {
      levels[language] = [...new Set(rawLevels.map(asLevel).filter((level): level is WordLevel => Boolean(level)))]
    }
  }
  return { lists, levels }
}
