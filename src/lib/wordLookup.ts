import { isRussian } from './autoTranslate'
import { levelWords } from './levelLexicon'
import { readCustomFiles } from './library'
import { enabledLevels, ignoreWords } from './wordIgnore'
import { fold, stripMarks } from './normalize'
import { stripForSpeech } from './speech'
import { libraryFor } from './tutor'
import type { Language } from '../types'

export type WordSense = {
  word: string
  translation: string
  variants?: string[]
  article?: string
  note?: string
}

const cache = new Map<string, WordSense>()

const ARTICLES: Record<Language, string[]> = {
  de: ['der', 'die', 'das', 'ein', 'eine', 'einen', 'einem', 'einer', 'dem', 'den', 'des'],
  fr: ['le', 'la', 'les', 'un', 'une', 'des', 'l'],
  en: ['the', 'a', 'an'],
}

export function isLookupToken(part: string) {
  if (!part || /[а-яё]/i.test(part)) return false
  const letters = part.match(/\p{L}/gu) ?? []
  return letters.length >= 2 && /[a-zäöüßàâéèêëïîôùûçæœ]/i.test(part)
}

const STOP: Record<Language, Set<string>> = {
  de: new Set([
    'der', 'die', 'das', 'ein', 'eine', 'einen', 'einem', 'einer', 'dem', 'den', 'des',
    'und', 'oder', 'aber', 'ist', 'bin', 'sind', 'war', 'hat', 'haben', 'ich', 'du', 'er',
    'sie', 'es', 'wir', 'ihr', 'zu', 'von', 'mit', 'auf', 'fur', 'als', 'auch', 'nicht',
    'nur', 'wie', 'im', 'am', 'an', 'in', 'so', 'ja', 'nein', 'was', 'wer', 'wo',
  ]),
  fr: new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'je', 'tu', 'il', 'elle',
    'on', 'nous', 'vous', 'ils', 'elles', 'est', 'sont', 'a', 'pas', 'ne', 'que', 'qui',
    'dans', 'pour', 'avec', 'sur', 'ce', 'cette', 'oui', 'non',
  ]),
  en: new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'i', 'you', 'he',
    'she', 'it', 'we', 'they', 'of', 'to', 'in', 'on', 'for', 'with', 'as', 'at', 'be',
    'this', 'that', 'yes', 'no', 'not', 'do', 'did',
  ]),
}

function variants(word: string, language: Language) {
  const items = new Set([word])
  const suffixes =
    language === 'de'
      ? ['em', 'en', 'er', 'es', 'te', 'st', 't', 'n', 'e', 's']
      : language === 'fr'
        ? ['ent', 'ons', 'ez', 'es', 'e', 's']
        : ['ing', 'ed', 'es', 's']
  for (const end of suffixes) {
    if (word.length - end.length >= 3 && word.endsWith(end)) items.add(word.slice(0, -end.length))
  }
  return items
}

export function addTermKeys(keys: Set<string>, word: string, language: Language) {
  const raw = fold(stripMarks(word))
  if (!raw) return
  keys.add(raw)
  for (const part of raw.split(' ')) {
    if (part.length < 2) continue
    for (const item of variants(bare(language, part), language)) keys.add(item)
  }
}

export function dictionaryKeys(language: Language) {
  const keys = new Set<string>()
  for (const file of readCustomFiles().filter((item) => item.language === language)) {
    for (const entry of file.entries) addTermKeys(keys, entry.term, language)
  }
  return keys
}

export function familiarKeys(language: Language) {
  const keys = new Set<string>()
  for (const word of ignoreWords(language)) addTermKeys(keys, word, language)
  for (const level of enabledLevels(language)) {
    for (const word of levelWords(language, level)) addTermKeys(keys, word, language)
  }
  return keys
}

export function learnedKeys(language: Language) {
  return dictionaryKeys(language)
}

export function knownHighlightKeys(language: Language) {
  const keys = dictionaryKeys(language)
  for (const word of familiarKeys(language)) keys.add(word)
  return keys
}

function hitsKeys(word: string, language: Language, keys: Set<string>) {
  const needle = bare(language, word)
  if (!needle) return false
  for (const item of variants(needle, language)) {
    if (keys.has(item)) return true
  }
  return false
}

export type WordMark = 'new' | 'learned' | 'known'

export function wordMark(
  language: Language,
  word: string,
  learned: Set<string>,
  familiar: Set<string>,
): WordMark {
  const needle = bare(language, word)
  if (!needle || STOP[language].has(needle)) return 'known'
  if (hitsKeys(word, language, familiar)) return 'known'
  if (hitsKeys(word, language, learned)) return 'learned'
  return 'new'
}

export function isUnknownWord(language: Language, word: string, keys: Set<string>) {
  const needle = bare(language, word)
  if (!needle || STOP[language].has(needle)) return false
  return !hitsKeys(word, language, keys)
}

function cacheKey(language: Language, word: string) {
  return `${language}:${fold(word)}`
}

function bare(language: Language, value: string) {
  const text = fold(value)
  for (const article of ARTICLES[language]) {
    if (text === article) return text
    if (text.startsWith(`${article} `)) return text.slice(article.length + 1)
  }
  return text
}

function splitArticle(language: Language, value: string) {
  const raw = stripMarks(value).trim()
  const match = raw.match(/^(\S+)\s+(.+)$/)
  if (!match) return { article: '', word: raw }
  const head = match[1].toLowerCase().replace(/'$/, '')
  if (ARTICLES[language].includes(head)) return { article: match[1], word: match[2] }
  return { article: '', word: raw }
}

function fromLibrary(language: Language, word: string, entries: { term: string; translation?: string; pos?: string }[]) {
  const needle = bare(language, word)
  const hit = entries.find((entry) => {
    const term = bare(language, entry.term)
    return term === needle || term.split(' ').includes(needle)
  })
  if (!hit?.translation) return null
  const translation = stripMarks(hit.translation)
  if (!isRussian(translation)) return null
  const parts = splitArticle(language, hit.term)
  return {
    word: parts.word || stripMarks(hit.term),
    translation,
    article: parts.article || undefined,
    note: hit.pos,
  } satisfies WordSense
}

function cleanPart(text: string, word: string) {
  const value = text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
  if (!value || !isRussian(value) || fold(value) === fold(word)) return ''
  if (/query length|mymemory warning|limit/i.test(value)) return ''
  return value
}

function uniqueTranslations(items: string[], word: string) {
  const seen = new Set<string>()
  const list: string[] = []
  for (const raw of items) {
    for (const part of raw.split(/[,;/|·•]+/)) {
      const value = cleanPart(part, word)
      const key = fold(value)
      if (!value || seen.has(key)) continue
      seen.add(key)
      list.push(value)
    }
  }
  return list
}

const phraseCache = new Map<string, string>()

export function hasForeignLetters(text: string) {
  return /[a-zäöüßàâéèêëïîôùûçæœ]/i.test(stripForSpeech(text))
}

export async function translatePhrase(language: Language, raw: string, signal?: AbortSignal) {
  const text = stripForSpeech(raw)
  if (!text) return ''
  const into = isRussian(text) && !hasForeignLetters(text)
  const key = `${language}:${into ? 'into' : 'phrase'}:${fold(text)}`
  const cached = phraseCache.get(key)
  if (cached) return cached
  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      signal,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        lang: language,
        ...(into ? { dir: 'into' } : { mode: 'phrase' }),
      }),
    })
    if (!response.ok) return ''
    const data = (await response.json()) as { translation?: string }
    const translation = String(data.translation ?? '').trim()
    if (!translation) return ''
    if (into) {
      if (!hasForeignLetters(translation)) return ''
    } else if (!isRussian(translation)) {
      return ''
    }
    phraseCache.set(key, translation)
    return translation
  } catch (error) {
    if (signal?.aborted) throw error
    return ''
  }
}

async function translatePlain(language: Language, word: string, signal?: AbortSignal) {
  try {
    const response = await fetch(
      `/api/translate?lang=${language}&q=${encodeURIComponent(word)}`,
      { signal, credentials: 'include' },
    )
    if (!response.ok) return []
    const data = (await response.json()) as { translation?: string; variants?: string[] }
    return uniqueTranslations([data.translation ?? '', ...(data.variants ?? [])], word)
  } catch (error) {
    if (signal?.aborted) throw error
    return []
  }
}

export async function lookupWord(language: Language, raw: string, signal?: AbortSignal): Promise<WordSense> {
  const word = raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
  if (!word) return { word: raw, translation: 'Нет слова' }

  const key = cacheKey(language, word)
  const cached = cache.get(key)
  if (cached) return cached

  const files = await libraryFor(language)
  const fromShelf = fromLibrary(
    language,
    word,
    files.flatMap((file) => file.entries),
  )

  try {
    const translations = uniqueTranslations(
      [fromShelf?.translation ?? '', ...(await translatePlain(language, word, signal))],
      word,
    )
    if (!translations.length) return { word, translation: 'Нет русского перевода.' }
    const sense: WordSense = {
      word: fromShelf?.word || word,
      translation: translations[0],
      variants: translations,
      article: fromShelf?.article,
      note: fromShelf?.note,
    }
    cache.set(key, sense)
    return sense
  } catch (error) {
    if (signal?.aborted) throw error
    return { word, translation: 'Не получилось перевести.' }
  }
}
