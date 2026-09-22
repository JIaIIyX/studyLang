import { fold, shuffle } from './normalize'
import type { Language } from '../types'

const FOOD_LEMMA =
  /^(kaese|kase|käse|milch|kartoffel|apfel|haehnchen|hahnchen|hähnchen|brot|butter|reis|fromage|lait|pomme|pain|beurre|poulet|riz|cheese|milk|apple|bread|potato|rice|chicken|сыр|молоко|яблоко|картофель|хлеб|масло|курица|рис)$/i

const FURNITURE_LEMMA =
  /^(tisch|stuhl|lampe|fenster|bett|schrank|sofa|regal|sessel|kommode|couch|tur|стол|стул|лампа|окно|кровать|шкаф|диван)$/i

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

const FURNITURE_DECOYS: Record<Language, string[]> = {
  de: ['der Tisch', 'der Stuhl', 'die Lampe', 'das Fenster', 'das Bett', 'der Schrank'],
  en: ['table', 'chair', 'lamp', 'window', 'bed', 'cupboard'],
  fr: ['la table', 'la chaise', 'la lampe', 'la fenêtre', 'le lit', 'l’armoire'],
}

const FOOD_DECOYS: Record<Language, string[]> = {
  de: ['Käse', 'Milch', 'Brot', 'Reis', 'Butter', 'Kartoffel'],
  en: ['cheese', 'milk', 'bread', 'rice', 'butter', 'potato'],
  fr: ['fromage', 'lait', 'pain', 'riz', 'beurre', 'pomme'],
}

const FOOD_ARTICLE_DECOYS: Record<Language, string[]> = {
  de: ['der Käse', 'die Milch', 'das Brot', 'der Reis', 'die Butter', 'die Kartoffel'],
  en: ['the cheese', 'the milk', 'the bread', 'the rice'],
  fr: ['le fromage', 'le lait', 'le pain', 'le riz'],
}

export function lastLemma(text: string) {
  const parts = fold(text).split(' ').filter(Boolean)
  return parts.at(-1) ?? ''
}

export function isFoodLemma(text: string) {
  return FOOD_LEMMA.test(lastLemma(text))
}

export function isFurnitureLemma(text: string) {
  return FURNITURE_LEMMA.test(lastLemma(text))
}

export function isPhraseOption(text: string) {
  const value = text.trim()
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length >= 3) return true
  if (words.length >= 2 && /[?!.]$/.test(value)) return true
  if (words.length >= 2 && !/^(der|die|das|den|dem|ein|eine|le|la|les|un|une|the|a|an)\s+\S+$/i.test(value)) return true
  return false
}

export type OptionShape = 'phrase' | 'article-noun' | 'lemma'
export type OptionCategory = 'food' | 'furniture' | 'phrase' | 'other'

export function optionShape(text: string): OptionShape {
  const value = text.trim()
  if (isPhraseOption(value)) return 'phrase'
  if (/^(der|die|das|den|dem|des|ein|eine|einen|einem|le|la|les|l'|un|une|the|a|an)\s+\S+$/i.test(value)) {
    return 'article-noun'
  }
  return 'lemma'
}

export function targetCategory(primary: string, prompt: string): OptionCategory {
  if (isPhraseOption(primary)) return 'phrase'
  if (isFoodLemma(primary)) return 'food'
  if (isFurnitureLemma(primary)) return 'furniture'
  const blob = `${primary} ${prompt}`
  if (/еда|food|сыр|молоко|яблок|картоф|хлеб|käse|milch|\bbrot\b/i.test(blob)) return 'food'
  if (/мебел|(?:^|[^\p{L}])стол(?:[^\p{L}]|$)|стул|ламп|окн|кроват|шкаф|диван|\btisch\b|\bstuhl\b/iu.test(blob)) {
    return 'furniture'
  }
  return 'other'
}

function sameShape(correct: string, candidate: string) {
  return optionShape(correct) === optionShape(candidate)
}

function categoryDecoys(category: OptionCategory, shape: OptionShape, language: Language) {
  if (category === 'phrase') return PHRASE_DECOYS[language]
  if (category === 'furniture') return FURNITURE_DECOYS[language]
  if (category === 'food') return shape === 'article-noun' ? FOOD_ARTICLE_DECOYS[language] : FOOD_DECOYS[language]
  return NOUN_DECOYS[language]
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
  const category = targetCategory(primary, prompt)
  const foodOk = category === 'food'
  const shape = optionShape(primary)
  const pool = [...extras, ...categoryDecoys(category, shape, language)]
  const list: string[] = []
  const take = (item: string, requireShape = true) => {
    if (!item) return
    if (list.some((row) => fold(row) === fold(item))) return
    if (requireShape && !sameShape(primary, item)) return
    if (!foodOk && isFoodLemma(item) && keys.every((key) => fold(key) !== fold(item))) return
    if (category === 'furniture' && isFoodLemma(item)) return
    if (category === 'phrase' && requireShape && !isPhraseOption(item)) return
    if (category === 'furniture' && requireShape && targetCategory(item, '') !== 'furniture') return
    list.push(item)
  }
  for (const item of keys) take(item, false)
  for (const item of pool) {
    take(item)
    if (list.length >= max) break
  }
  if (list.length < 2) {
    for (const item of pool) {
      if (!foodOk && isFoodLemma(item)) continue
      if (category === 'phrase' && !isPhraseOption(item) && !keys.some((key) => fold(key) === fold(item))) continue
      take(item, false)
      if (list.length >= max) break
    }
  }
  const extrasOnly = list.filter((item) => keys.every((key) => fold(key) !== fold(item)))
  const picked = [...keys]
  for (const item of shuffle(extrasOnly)) {
    if (picked.length >= max) break
    if (picked.some((row) => fold(row) === fold(item))) continue
    picked.push(item)
  }
  return picked.length >= 2 ? picked.slice(0, max) : picked
}

function quizAnswers(text: string) {
  return [...text.matchAll(/<answer>([\s\S]*?)<\/answer>/gi)].map((match) => match[1].trim()).filter(Boolean)
}

function quizButtons(text: string) {
  return [...text.matchAll(/<(btn|opt)>([\s\S]*?)<\/\1>/gi)].map((match) => ({
    tag: match[1],
    value: match[2].trim(),
  }))
}

export function choicesNeedRepair(answers: string[], choices: string[], prompt: string) {
  const primary = answers[0]?.trim()
  if (!primary || choices.length < 2) return false
  const category = targetCategory(primary, prompt)
  const shape = optionShape(primary)
  return choices.some((choice) => {
    if (answers.some((item) => fold(item) === fold(choice))) return false
    if (category !== 'food' && isFoodLemma(choice)) return true
    if (optionShape(choice) !== shape) return true
    if (category === 'phrase' && !isPhraseOption(choice)) return true
    if (category === 'furniture' && targetCategory(choice, '') !== 'furniture') return true
    return false
  })
}

export function repairQuizChoiceButtons(text: string, language: Language) {
  const answers = quizAnswers(text)
  const buttons = quizButtons(text)
  if (answers.length < 1 || buttons.length < 2) return text
  const prompt = text.replace(/<(btn|opt|answer)>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  const choices = buttons.map((item) => item.value)
  if (!choicesNeedRepair(answers, choices, prompt)) return text
  const next = plausibleQuizOptions(answers, choices, prompt, language, Math.min(4, Math.max(buttons.length, 2)))
  if (next.length < 2) return text
  let index = 0
  const replaced = text.replace(/<(btn|opt)>[\s\S]*?<\/\1>/gi, (_full, tag: string) => {
    const value = next[index]
    index += 1
    if (!value) return ''
    return `<${tag}>${value}</${tag}>`
  })
  const extra =
    index < next.length ? `\n${next.slice(index).map((item) => `<btn>${item}</btn>`).join('\n')}` : ''
  return `${replaced}${extra}`.replace(/\n{3,}/g, '\n\n').trim()
}
