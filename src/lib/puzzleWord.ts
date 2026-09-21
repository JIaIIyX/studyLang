import { markedSpan, stripMarks } from './normalize'
import type { WordEntry } from '../types'

const ARTICLES = new Set(['le', 'la', 'les', 'un', 'une', 'l', 'der', 'die', 'das', 'ein', 'eine', 'the', 'a', 'an'])

const STOP = new Set([
  ...ARTICLES,
  'je',
  'tu',
  'il',
  'elle',
  'on',
  'nous',
  'vous',
  'ils',
  'elles',
  'me',
  'te',
  'se',
  'de',
  'du',
  'des',
  'et',
  'ou',
  'que',
  'qui',
  'est',
  'sont',
  'ce',
  'cette',
  'ces',
  'mon',
  'ma',
  'mes',
  'pour',
  'avec',
  'dans',
  'sur',
  'pas',
  'ne',
  'au',
  'aux',
  'en',
  'ich',
  'du',
  'er',
  'sie',
  'es',
  'wir',
  'ihr',
  'und',
  'oder',
  'ist',
  'sind',
  'zu',
  'von',
  'mit',
  'auf',
  'im',
  'in',
  'für',
  'nicht',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'and',
  'or',
  'is',
  'are',
  'to',
  'of',
  'on',
  'for',
  'with',
  'my',
  'your',
  'not',
])

function tokensOf(term: string) {
  return term
    .replace(/[’]/g, "'")
    .split(/[^\p{L}']+/u)
    .map((word) => word.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
}

function key(word: string) {
  return word.toLowerCase().replace(/'/g, '')
}

function lettersOf(value: string) {
  return value.replace(/[^\p{L}]/gu, '')
}

export function puzzleWord(entry: Pick<WordEntry, 'term' | 'puzzle'>): string {
  const marked = markedSpan(entry.term) || markedSpan(entry.puzzle ?? '')
  if (marked) return lettersOf(marked)

  const explicit = entry.puzzle ? lettersOf(entry.puzzle) : ''
  if (explicit) return explicit

  const words = tokensOf(entry.term)
  if (words.length === 0) return lettersOf(entry.term)
  if (words.length === 1) return words[0]
  if (words.length === 2 && ARTICLES.has(key(words[0]))) return words[1]

  const content = words.filter((word) => !STOP.has(key(word)))
  return content.at(-1) || words.at(-1) || words[0]
}

export function puzzleBlank(term: string, target: string) {
  const marked = term.match(/^(.*)\*\*([^*]+)\*\*(.*)$/s)
  if (marked) {
    return { before: stripMarks(marked[1]), after: stripMarks(marked[3]) }
  }

  const clean = stripMarks(term)
  if (!target) return { before: clean, after: '' }

  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = clean.match(new RegExp(`(${escaped})`, 'i'))
  if (!found || found.index === undefined) {
    if (clean.toLowerCase() === target.toLowerCase()) return { before: '', after: '' }
    return { before: clean, after: '' }
  }
  return {
    before: clean.slice(0, found.index),
    after: clean.slice(found.index + found[0].length),
  }
}
