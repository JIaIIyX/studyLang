import { fold, shuffle } from './normalize'
import type { Language } from '../types'

const FOOD_LEMMA =
  /^(kaese|kase|käse|milch|kartoffel|apfel|apfel|haehnchen|hahnchen|hähnchen|brot|butter|reis|fromage|lait|pomme|pain|beurre|poulet|riz|cheese|milk|apple|bread|potato|rice|butter|chicken|сыр|молоко|яблоко|картофель|хлеб|масло|курица|рис)$/i

const PHRASE_DECOYS: Record<Language, string[]> = {
  de: ['Guten Tag!', 'Wie geht es dir?', 'Ich heiße Anna.', 'Sprechen Sie Deutsch?', 'Auf Wiedersehen!'],
  en: ['Good morning!', 'How are you?', 'Nice to meet you.', 'See you later.', 'What is your name?'],
  fr: ['Bonjour !', 'Comment ça va ?', 'Je m’appelle Marie.', 'Au revoir !', 'Parlez-vous anglais ?'],
}

const NOUN_DECOYS: Record<Language, string[]> = {
  de: ['der Tisch', 'das Buch', 'die Lampe', 'das Fenster', 'der Stuhl'],
  en: ['table', 'book', 'window', 'chair', 'door'],
  fr: ['la table', 'le livre', 'la fenêtre', 'la chaise', 'la porte'],
}

export function lastLemma(text: string) {
  const parts = fold(text).split(' ').filter(Boolean)
  return parts.at(-1) ?? ''
}

export function isFoodLemma(text: string) {
  return FOOD_LEMMA.test(lastLemma(text))
}

export function isPhraseOption(text: string) {
  const value = text.trim()
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length >= 3) return true
  if (words.length >= 2 && /[?!.]$/.test(value)) return true
  if (words.length >= 2 && !/^(der|die|das|ein|eine|le|la|les|un|une|the|a|an)\s+\S+$/i.test(value)) return true
  return false
}

function sameShape(correct: string, candidate: string) {
  if (isPhraseOption(correct) !== isPhraseOption(candidate)) return false
  const wordsA = correct.trim().split(/\s+/).length
  const wordsB = candidate.trim().split(/\s+/).length
  if (isPhraseOption(correct) && Math.abs(wordsA - wordsB) > 3) return false
  return true
}

export function plausibleQuizOptions(
  correct: string[],
  extras: string[],
  prompt: string,
  language: Language,
  max = 4,
) {
  const keys = correct.map((item) => item.trim()).filter(Boolean)
  if (!keys.length) return []
  const primary = keys[0]
  const foodOk = isFoodLemma(primary) || /еда|food|сыр|молоко|яблок/i.test(prompt)
  const phrase = isPhraseOption(primary)
  const pool = [
    ...extras,
    ...(phrase ? PHRASE_DECOYS[language] : NOUN_DECOYS[language]),
  ]
  const list: string[] = []
  const take = (item: string, requireShape = true) => {
    if (!item) return
    if (list.some((row) => fold(row) === fold(item))) return
    if (requireShape && !sameShape(primary, item)) return
    if (!foodOk && isFoodLemma(item) && keys.every((key) => fold(key) !== fold(item))) return
    list.push(item)
  }
  for (const item of keys) take(item, false)
  for (const item of pool) {
    take(item)
    if (list.length >= max) break
  }
  if (list.length < 2) {
    for (const item of pool) {
      take(item, false)
      if (list.length >= max) break
    }
  }
  return list.length >= 2 ? shuffle(list).slice(0, max) : list
}
