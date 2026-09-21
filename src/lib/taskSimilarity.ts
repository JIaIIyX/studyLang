import type { ChatMessage } from '../types'
import { fold } from './normalize'
import { extractChoiceTags, extractQuizAnswer, splitPracticeTags, stripPracticeTags } from './practiceTags'
import { extractQuizChoices, quizQuestionText } from './quizChoices'

const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been',
  'do', 'does', 'did', 'this', 'that', 'it', 'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'his', 'her',
  'with', 'from', 'as', 'by', 'not', 'so', 'if', 'but',
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'est', 'sont', 'je', 'tu', 'il', 'elle', 'nous', 'vous',
  'ils', 'elles', 'au', 'aux', 'en', 'que', 'qui', 'pas',
  'der', 'die', 'das', 'ein', 'eine', 'einen', 'und', 'ist', 'sind', 'ich', 'du', 'er', 'sie', 'wir', 'ihr', 'den',
  'dem', 'des', 'im', 'mit', 'nicht',
  'в', 'на', 'и', 'или', 'это', 'как', 'что', 'для', 'по', 'из', 'с', 'не', 'да', 'же', 'бы', 'к', 'о', 'от', 'а',
  'у', 'за', 'то', 'ты', 'он', 'она', 'мы', 'вы', 'они', 'мне', 'вас',
  'choose', 'insert', 'correct', 'option', 'blank', 'fill', 'gap', 'sentence', 'translate', 'pick', 'right',
  'вставьте', 'выберите', 'правильный', 'вариант', 'слово', 'пропуск', 'задание', 'вопрос', 'перевод', 'пример',
  'пропущенное', 'нужное', 'форму', 'глагола',
])

export type TaskKind = 'quiz' | 'lesson'

export type TaskPrint = {
  kind: TaskKind
  answer: string
  choices: string[]
  gap: string
  blob: string
  tokens: Set<string>
  grams: Set<string>
}

export type ChatMatch = {
  percent: number
  withN: number
  withId: string
  why: string
  first: boolean
  kind: TaskKind
}

function markGaps(text: string) {
  return text.replace(/_{2,}|…|\.{3}/g, ' GAP ')
}

function wordSet(text: string) {
  return new Set(
    fold(text)
      .split(' ')
      .filter((word) => word.length >= 2 && !STOP.has(word)),
  )
}

function ngrams(text: string, n = 3) {
  const value = fold(text).replace(/\s+/g, ' ')
  if (!value) return new Set<string>()
  if (value.length < n) return new Set([value])
  const padded = ` ${value} `
  const out = new Set<string>()
  for (let i = 0; i <= padded.length - n; i += 1) out.add(padded.slice(i, i + n))
  return out
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size && !right.size) return 1
  if (!left.size || !right.size) return 0
  let hit = 0
  for (const item of left) if (right.has(item)) hit += 1
  return hit / (left.size + right.size - hit)
}

function dice(left: Set<string>, right: Set<string>) {
  if (!left.size && !right.size) return 1
  if (!left.size || !right.size) return 0
  let hit = 0
  for (const item of left) if (right.has(item)) hit += 1
  return (2 * hit) / (left.size + right.size)
}

export function isQuizLike(text: string) {
  return Boolean(extractQuizAnswer(text)) || extractQuizChoices(text).length >= 2 || /_{2,}/.test(text)
}

function examplesOf(text: string) {
  return splitPracticeTags(text)
    .filter((part) => part.type === 'ex')
    .map((part) => part.text)
}

export function taskPrint(text: string): TaskPrint {
  const quiz = isQuizLike(text)
  const answer = fold(extractQuizAnswer(text))
  const choices = (extractChoiceTags(text).length >= 2 ? extractChoiceTags(text) : extractQuizChoices(text)).map((item) =>
    fold(item),
  )
  const question = quizQuestionText(text)
  const gap = fold(markGaps(question || stripPracticeTags(text)))
  const examples = examplesOf(text).map((item) => fold(item)).filter(Boolean)
  const body = fold(stripPracticeTags(text)).slice(0, 480)
  const blob = quiz
    ? [answer, [...choices].sort().join(' '), gap].filter(Boolean).join(' ')
    : [examples.join(' '), body].filter(Boolean).join(' ')
  return {
    kind: quiz ? 'quiz' : 'lesson',
    answer,
    choices: [...new Set(choices.filter(Boolean))],
    gap,
    blob,
    tokens: wordSet(blob),
    grams: ngrams(blob),
  }
}

export function pairSimilarity(left: TaskPrint, right: TaskPrint) {
  const tri = dice(left.grams, right.grams)
  const tok = jaccard(left.tokens, right.tokens)
  const sameAnswer = Boolean(left.answer && right.answer && left.answer === right.answer)
  const gapScore = left.gap && right.gap ? dice(ngrams(left.gap), ngrams(right.gap)) : 0
  const choiceScore = left.choices.length && right.choices.length
    ? jaccard(new Set(left.choices), new Set(right.choices))
    : 0
  const bothGapped = /\bgap\b/.test(left.gap) && /\bgap\b/.test(right.gap)

  let score = tri * 0.42 + tok * 0.28 + (sameAnswer ? 0.18 : 0) + choiceScore * 0.12
  if (sameAnswer && bothGapped) score = Math.max(score, 0.72 + gapScore * 0.2)
  if (sameAnswer && gapScore >= 0.5) score = Math.max(score, 0.86)
  if (!sameAnswer && gapScore >= 0.78) score = Math.max(score, gapScore * 0.74)
  score = Math.min(1, score)

  let why = 'похожий текст'
  if (sameAnswer && gapScore >= 0.5) why = 'тот же ответ и пропуск'
  else if (sameAnswer && bothGapped) why = 'тот же ответ'
  else if (choiceScore >= 0.6) why = 'те же варианты'
  else if (gapScore >= 0.78) why = 'похожий пропуск'
  else if (tok >= 0.45) why = 'похожие слова'

  return { score, why }
}

export function matchAgainstChat(messages: ChatMessage[], index: number): ChatMatch | null {
  const current = messages[index]
  if (!current || current.role !== 'assistant') return null
  const print = taskPrint(current.content)
  const previous: { n: number; id: string; print: TaskPrint }[] = []
  for (let i = 0; i < index; i += 1) {
    const item = messages[i]
    if (item.role !== 'assistant') continue
    const other = taskPrint(item.content)
    if (other.kind !== print.kind) continue
    previous.push({ n: i + 1, id: item.id, print: other })
  }
  if (!previous.length) {
    return { percent: 0, withN: 0, withId: '', why: '', first: true, kind: print.kind }
  }
  let best: ChatMatch = { percent: -1, withN: 0, withId: '', why: '', first: false, kind: print.kind }
  for (const item of previous) {
    const { score, why } = pairSimilarity(print, item.print)
    const percent = Math.round(score * 100)
    if (percent >= best.percent) {
      best = { percent, withN: item.n, withId: item.id, why, first: false, kind: print.kind }
    }
  }
  return best
}
