import { fold, stripMarks } from './normalize'

export type GradeVerdict = 'correct' | 'almost' | 'wrong'

const ARTICLES = /^(a|an|the|der|die|das|den|dem|des|ein|eine|einen|einem|eines|le|la|les|l|un|une|des)$/i

export function foldStrict(value: string) {
  return stripMarks(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string) {
  return foldStrict(value).split(' ').filter(Boolean)
}

function rawTokens(value: string) {
  return stripMarks(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

function dropArticle(parts: string[]) {
  if (parts.length >= 2 && ARTICLES.test(parts[0])) return { article: parts[0], rest: parts.slice(1) }
  return { article: '', rest: parts }
}

function germanStem(value: string) {
  return value
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/(en|er|e|n|s)$/i, '')
}

function looksPluralOf(guess: string, expected: string) {
  if (!guess || !expected || guess === expected) return false
  if (guess === `${expected}s` || guess === `${expected}es` || guess === `${expected}en` || guess === `${expected}e`) {
    return true
  }
  if (germanStem(guess) === germanStem(expected) && guess !== expected) return true
  if (fold(guess) === fold(expected) && foldStrict(guess) !== foldStrict(expected)) return true
  return false
}

function nounCapitalHint(guess: string, expected: string) {
  const g = dropArticle(rawTokens(guess))
  const e = dropArticle(rawTokens(expected))
  const gNoun = g.rest[0] ?? ''
  const eNoun = e.rest[0] ?? ''
  if (!gNoun || !eNoun) return false
  if (foldStrict(gNoun) !== foldStrict(eNoun)) return false
  return /^[A-ZÄÖÜ]/.test(eNoun) && /^[a-zäöü]/.test(gNoun)
}

export function gradeGuess(input: string, expected: string): { verdict: GradeVerdict; notes: string[] } {
  const guess = stripMarks(input).trim()
  const want = stripMarks(expected).trim()
  if (!guess || !want) return { verdict: 'wrong', notes: [] }

  if (foldStrict(guess) === foldStrict(want)) {
    if (nounCapitalHint(guess, want)) {
      return { verdict: 'almost', notes: ['capital'] }
    }
    return { verdict: 'correct', notes: [] }
  }

  const g = dropArticle(tokens(guess))
  const e = dropArticle(tokens(want))
  const gNoun = g.rest.join(' ')
  const eNoun = e.rest.join(' ')
  const notes: string[] = []

  if (g.article && e.article && g.article !== e.article) notes.push('article')
  if (looksPluralOf(gNoun, eNoun)) notes.push('plural')
  if (fold(gNoun) === fold(eNoun) && foldStrict(gNoun) !== foldStrict(eNoun)) notes.push('umlaut')
  if (nounCapitalHint(guess, want)) notes.push('capital')

  const closeNoun =
    fold(gNoun) === fold(eNoun) || looksPluralOf(gNoun, eNoun) || germanStem(gNoun) === germanStem(eNoun)
  if (closeNoun && notes.length) return { verdict: 'almost', notes }
  if (fold(guess) === fold(want)) return { verdict: 'almost', notes: notes.length ? notes : ['form'] }
  return { verdict: 'wrong', notes }
}

/** Prefer the raw learner string when it is only a near-miss of the key. */
export function gradeFreeText(raw: string, shown: string, expected: string) {
  const direct = gradeGuess(raw, expected)
  if (direct.verdict === 'almost') return direct
  const picked = gradeGuess(shown || raw, expected)
  if (direct.verdict === 'correct') return direct
  return picked
}

export function joinGradeAnswers(items: string[], joiner: 'или' | 'и' | '·') {
  const clean = items.map((item) => item.trim()).filter(Boolean)
  if (!clean.length) return ''
  if (clean.length === 1) return clean[0]
  if (joiner === '·') return clean.join(' · ')
  if (clean.length === 2) return `${clean[0]} ${joiner} ${clean[1]}`
  return `${clean.slice(0, -1).join(', ')} ${joiner} ${clean[clean.length - 1]}`
}

export function almostReason(notes: string[], shown: string, expected: string) {
  const gNoun = dropArticle(rawTokens(shown)).rest.join(' ') || shown
  if (notes.includes('plural') || notes.includes('umlaut')) {
    return `«${gNoun}» — множественное или другая форма; в единственном числе нужно **${expected}**.`
  }
  if (notes.includes('article')) {
    return `Проверьте артикль: нужно **${expected}**.`
  }
  if (notes.includes('capital')) {
    return `Существительные пишутся с большой буквы: **${expected}**.`
  }
  return `Нужно **${expected}**, а не «${shown}».`
}
