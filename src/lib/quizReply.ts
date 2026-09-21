import type { ChatMessage } from '../types'
import { fold, splitAnswerPicks } from './normalize'
import { extractQuizAnswer } from './practiceTags'
import { extractQuizChoices, looksLikeQuizRequest, looksLikeLeavingQuiz } from './quizChoices'
import { messageNo } from './messageRef'

export function choiceLetter(index: number) {
  return String.fromCharCode(65 + (index % 26))
}

export function letterIndex(letter: string) {
  const lower = letter.trim().toLowerCase()
  if (!lower) return -1
  if ('абвг'.includes(lower)) return 'абвг'.indexOf(lower)
  return lower.charCodeAt(0) - 97
}

export function formatTaskAnswer(taskNo: number, picks: { letter: string; text: string }[]) {
  if (!picks.length) return `Задание ${taskNo} ответ:`
  const letters = picks.map((item) => item.letter).join(', ')
  const texts = picks.map((item) => item.text).join(' | ')
  return `Задание ${taskNo} ответ ${letters}: ${texts}`
}

export function parseTaskAnswer(text: string) {
  const match = text
    .trim()
    .match(/^задание\s*#?(\d+)\s*ответ(?:\s+([A-DА-Гa-dа-г](?:\s*(?:,|\/|\||и)\s*[A-DА-Гa-dа-г])*))?\s*[:\-–]?\s*(.*)$/iu)
  if (!match) return null
  const letters = (match[2] ?? '')
    .split(/\s*(?:,|\/|\||и)\s*/i)
    .map((item) => item.trim())
    .filter((item) => /^[A-DА-Гa-dа-г]$/i.test(item))
  return { taskNo: Number(match[1]), letters, rest: (match[3] ?? '').trim() }
}

export function isBoundTaskAnswer(text: string) {
  return Boolean(parseTaskAnswer(text))
}

function uniquePicks(items: string[]) {
  const seen = new Set<string>()
  const list: string[] = []
  for (const item of items) {
    const key = fold(item)
    if (!item || seen.has(key)) continue
    seen.add(key)
    list.push(item)
  }
  return list
}

export function picksFromChoices(raw: string, choices: string[]) {
  const parsed = parseTaskAnswer(raw)
  const fromLetters = (parsed?.letters ?? [])
    .map((letter) => choices[letterIndex(letter)])
    .filter(Boolean)
  if (fromLetters.length) return uniquePicks(fromLetters)
  const parts = splitAnswerPicks(parsed?.rest || raw)
  if (choices.length) {
    const hit = parts
      .map((part) => {
        const guess = fold(part.replace(/^[A-DА-Гa-dа-г]\s*[).:]\s*/, ''))
        return choices.find((choice) => {
          const answer = fold(choice)
          return answer === guess || (answer.length >= 8 && guess.includes(answer)) || (guess.length >= 8 && answer.includes(guess))
        })
      })
      .filter((item): item is string => Boolean(item))
    if (hit.length) return uniquePicks(hit)
  }
  return uniquePicks(parts)
}

function isQuizMessage(text: string) {
  return Boolean(extractQuizAnswer(text))
}


function stripBoundAnswerPrefix(text: string) {
  const match = text.trim().match(/^задание\s*#?\d+\s*ответ(?:\s+[A-DА-Гa-dа-г]+)?\s*:\s*(.*)$/iu)
  return match ? match[1].trim() : text.trim()
}

export function bindQuizAnswer(raw: string, messages: ChatMessage[], options?: { skip?: boolean }) {
  const value = raw.trim()
  const payload = stripBoundAnswerPrefix(value)
  if (options?.skip || !value || looksLikeQuizRequest(value) || looksLikeQuizRequest(payload)) {
    return { content: value, refIds: [] as string[] }
  }
  const quiz = [...messages].reverse().find((item) => item.role === 'assistant' && isQuizMessage(item.content))
  if (!quiz) return { content: value, refIds: [] as string[] }
  const choices = extractQuizChoices(quiz.content)
  if (looksLikeLeavingQuiz(value, choices) || looksLikeLeavingQuiz(payload, choices)) return { content: value, refIds: [] as string[] }
  const n = messageNo(messages, quiz.id)
  if (parseTaskAnswer(value)) {
    if (!extractQuizAnswer(quiz.content)) return { content: value, refIds: [] as string[] }
    return { content: value, refIds: [quiz.id] }
  }
  const write = Boolean(extractQuizAnswer(quiz.content)) && choices.length < 2
  if (choices.length >= 2) {
    const picks = picksFromChoices(value, choices)
    const matched = picks.filter((item) => choices.some((choice) => fold(choice) === fold(item)))
    if (matched.length) {
      const items = matched.map((text) => {
        const index = choices.findIndex((choice) => fold(choice) === fold(text))
        return { letter: choiceLetter(Math.max(0, index)), text }
      })
      return { content: formatTaskAnswer(n, items), refIds: [quiz.id] }
    }
    return { content: value, refIds: [] as string[] }
  }
  if (write && payload.length <= 120) {
    return { content: `Задание ${n} ответ: ${payload}`, refIds: [quiz.id] }
  }
  return { content: value, refIds: [] as string[] }
}
