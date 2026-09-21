import { getSnapshot, updateSnapshot } from './persist'
import type { WordLevel } from './wordLevels'
import type { Language } from '../types'
import { parseWordIgnore, type WordIgnoreState } from './wordIgnoreState'

export type { WordIgnoreState, WordLevel }

export function readWordIgnore() {
  return parseWordIgnore(getSnapshot().wordIgnore)
}

export function ignoreWords(language: Language) {
  return readWordIgnore().lists[language]
}

export function enabledLevels(language: Language) {
  return readWordIgnore().levels[language]
}

export function addIgnoreWords(language: Language, raw: string) {
  const extra = raw
    .split(/[\s,;]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
  if (!extra.length) return readWordIgnore()
  const current = readWordIgnore()
  const next = parseWordIgnore({
    ...current,
    lists: {
      ...current.lists,
      [language]: [...new Set([...current.lists[language], ...extra])],
    },
  })
  updateSnapshot({ wordIgnore: next })
  return next
}

export function removeIgnoreWord(language: Language, word: string) {
  const current = readWordIgnore()
  const next = parseWordIgnore({
    ...current,
    lists: {
      ...current.lists,
      [language]: current.lists[language].filter((item) => item !== word),
    },
  })
  updateSnapshot({ wordIgnore: next })
  return next
}

export function toggleIgnoreLevel(language: Language, level: WordLevel) {
  const current = readWordIgnore()
  const active = current.levels[language]
  const levels = active.includes(level) ? active.filter((item) => item !== level) : [...active, level]
  const next = parseWordIgnore({
    ...current,
    levels: { ...current.levels, [language]: levels },
  })
  updateSnapshot({ wordIgnore: next })
  return next
}
