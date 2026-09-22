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

function nounOf(value: string) {
  const parts = dropArticle(rawTokens(value))
  return parts.rest.join(' ') || stripMarks(value).trim()
}

function articleOf(value: string) {
  return dropArticle(rawTokens(value)).article
}

function commonPrefix(left: string, right: string) {
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  let index = 0
  while (index < a.length && index < b.length && a[index] === b[index]) index += 1
  return a.slice(0, index)
}

function endingHint(guess: string, expected: string) {
  const guessWord = nounOf(guess).split(' ').at(-1) ?? ''
  const wantWord = nounOf(expected).split(' ').at(-1) ?? ''
  if (!guessWord || !wantWord || foldStrict(guessWord) === foldStrict(wantWord)) return ''
  const stem = commonPrefix(guessWord, wantWord)
  if (stem.length < 3) return ''
  const guessEnd = guessWord.slice(stem.length)
  const wantEnd = wantWord.slice(stem.length)
  if (!guessEnd && !wantEnd) return ''
  if (guessEnd.length > 4 || wantEnd.length > 4) return ''
  const shown = expected.trim()
  return `Не то окончание: нужно -${wantEnd || '∅'} (${shown}), а не -${guessEnd || '∅'}.`
}

function wordOrderHint(guess: string, expected: string) {
  const left = tokens(guess)
  const right = tokens(expected)
  if (left.length < 3 || left.length !== right.length) return ''
  if (left.join(' ') === right.join(' ')) return ''
  const bag = (items: string[]) => [...items].sort().join(' ')
  if (bag(left) !== bag(right)) return ''
  return 'Порядок слов: глагол на втором месте.'
}

function editDistance(left: string, right: string) {
  const a = foldStrict(left)
  const b = foldStrict(right)
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const next = a[i - 1] === b[j - 1] ? prev : Math.min(prev, row[j - 1], row[j]) + 1
      prev = row[j]
      row[j] = next
    }
  }
  return row[b.length] ?? 0
}

export function mistakeHint(guess: string, expected: string) {
  const shown = stripMarks(guess).trim()
  const want = stripMarks(expected).trim()
  if (!shown || !want) return ''
  const graded = gradeGuess(shown, want)
  if (graded.verdict === 'correct') return ''

  const order = wordOrderHint(shown, want)
  if (order) return order

  const ending = endingHint(shown, want)
  if (ending) return ending

  const guessNoun = nounOf(shown)
  const wantNoun = nounOf(want)
  if (graded.notes.includes('umlaut') || graded.notes.includes('plural')) {
    const extraUmlaut = /[äöüÄÖÜ]/.test(guessNoun) && !/[äöüÄÖÜ]/.test(wantNoun)
    if (graded.notes.includes('umlaut') && graded.notes.includes('plural')) {
      return extraUmlaut
        ? `Почти: umlaut не нужен, это множественное число — ${wantNoun}, не ${guessNoun}.`
        : `Почти: другая форма с umlaut — ${wantNoun}, не ${guessNoun}.`
    }
    if (graded.notes.includes('umlaut')) {
      return extraUmlaut
        ? `Почти: umlaut не нужен — ${wantNoun}, не ${guessNoun}.`
        : `Почти: нужен umlaut — ${wantNoun}, не ${guessNoun}.`
    }
    return `Почти: это множественное число — ${wantNoun}, не ${guessNoun}.`
  }

  const guessArticle = articleOf(shown)
  const wantArticle = articleOf(want)
  if (guessArticle && wantArticle && foldStrict(guessArticle) !== foldStrict(wantArticle)) {
    return `Артикль: ${want}, не ${guessArticle}.`
  }

  if (graded.notes.includes('capital')) {
    return `С большой буквы: ${want}, не «${shown}».`
  }

  if (wantNoun.length >= 4 && guessNoun.length >= 3 && editDistance(guessNoun, wantNoun) > 0 && editDistance(guessNoun, wantNoun) <= 2) {
    return `Написание: нужно ${wantNoun}, не ${guessNoun}.`
  }

  return `Не то слово: нужно ${want}, не ${shown}.`
}
