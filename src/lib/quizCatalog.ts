import type { ChatMessage } from '../types'
import { fold } from './normalize'
import { extractQuizAnswers } from './practiceTags'
import { extractQuizChoices, quizQuestionText } from './quizChoices'

export type QuizKind = 'gap' | 'write' | 'choice'

export type QuizRecord = {
  kind: QuizKind
  answers: string[]
  frames: string[]
  cues: string[]
}

export type QuizCatalog = {
  records: QuizRecord[]
  answers: Set<string>
  frames: Set<string>
  cues: Set<string>
}

const WEAK_ANSWERS = new Set([
  'a', 'an', 'the', 'der', 'die', 'das', 'den', 'dem', 'des',
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'ein', 'eine', 'einen',
  'is', 'are', 'was', 'war', 'ist', 'sind',
])

function strongKeys(keys: string[]) {
  return keys.filter((key) => key.length >= 3 && !WEAK_ANSWERS.has(key))
}

export function emptyCatalog(): QuizCatalog {
  return { records: [], answers: new Set(), frames: new Set(), cues: new Set() }
}

export function stemAnswer(value: string) {
  const base = fold(value)
  if (!base || base.length < 2) return []
  const keys = [base]
  if (base.length >= 5 && base.endsWith('ing')) keys.push(base.slice(0, -3))
  else if (base.length >= 5 && base.endsWith('ed')) keys.push(base.slice(0, -2))
  else if (base.length >= 5 && base.endsWith('ies')) keys.push(`${base.slice(0, -3)}y`)
  else if (base.length >= 4 && base.endsWith('es')) keys.push(base.slice(0, -2))
  else if (base.length >= 4 && base.endsWith('s')) keys.push(base.slice(0, -1))
  return [...new Set(keys.filter((item) => item.length >= 2))]
}

export function frameOf(text: string) {
  if (!/_{2,}|…|\.{3}|\bgap\b/i.test(text)) return ''
  const marked = text.replace(/_{2,}|…|\.{3}/g, ' GAP ')
  const span = marked.match(/[^.\n]{0,42}GAP[^.\n]{0,42}/i)?.[0] ?? marked
  return fold(span).replace(/\s+/g, ' ').trim()
}

function cueOf(text: string) {
  return text.match(/[«"]([^»"]+)[»"]/)?.[1]?.trim() ?? ''
}

export function keysFromQuiz(text: string): QuizRecord | null {
  const listed = extractQuizAnswers(text)
  const choices = extractQuizChoices(text)
  if (!listed.length && choices.length < 2 && !/_{2,}/.test(text)) return null
  const question = quizQuestionText(text)
  const cue = cueOf(question)
  const frame = frameOf(question)
  const kind: QuizKind = /_{2,}/.test(text) ? 'gap' : choices.length >= 2 ? 'choice' : 'write'
  const answers = [
    ...listed.flatMap((item) => stemAnswer(item)),
    ...choices.flatMap((item) => (listed.some((answer) => fold(item) === fold(answer)) ? stemAnswer(item) : [])),
  ]
  return {
    kind,
    answers: [...new Set(answers)],
    frames: frame ? [frame] : [],
    cues: cue ? [fold(cue)] : [],
  }
}

export function catalogFromMessages(messages: ChatMessage[]): QuizCatalog {
  const catalog = emptyCatalog()
  for (const item of messages) {
    if (item.role !== 'assistant') continue
    const record = keysFromQuiz(item.content)
    if (!record) continue
    catalog.records.push(record)
    for (const answer of record.answers) catalog.answers.add(answer)
    for (const frame of record.frames) catalog.frames.add(frame)
    for (const cue of record.cues) catalog.cues.add(cue)
  }
  return catalog
}

export function rememberAnswer(catalog: QuizCatalog, value: string) {
  if (!value.trim()) return catalog
  const answers = new Set(catalog.answers)
  for (const key of stemAnswer(value)) answers.add(key)
  return { ...catalog, answers }
}

function fillLine(label: string, items: string[], sep: string, budget: number) {
  if (!items.length || budget < label.length + 4) return ''
  const kept: string[] = []
  let line = `${label}: `
  for (const item of items) {
    const next = kept.length ? `${line}${sep}${item}` : `${line}${item}`
    if (next.length > budget) break
    kept.push(item)
    line = next
  }
  return kept.length ? line : ''
}

export function catalogDigest(catalog: QuizCatalog, maxChars = 560) {
  if (!catalog.records.length) return ''
  const groups: Record<QuizKind, { answers: string[]; frames: string[]; cues: string[] }> = {
    gap: { answers: [], frames: [], cues: [] },
    choice: { answers: [], frames: [], cues: [] },
    write: { answers: [], frames: [], cues: [] },
  }
  for (const record of catalog.records) {
    const group = groups[record.kind]
    for (const answer of record.answers) if (!group.answers.includes(answer)) group.answers.push(answer)
    for (const frame of record.frames) if (!group.frames.includes(frame)) group.frames.push(frame)
    for (const cue of record.cues) if (!group.cues.includes(cue)) group.cues.push(cue)
  }

  const header = 'Already used in this chat. Do NOT repeat these answers, cues, or gap frames. Use a different verb, subject, and sentence.'
  const lines = [header]
  let left = maxChars - header.length - 1
  for (const kind of ['gap', 'choice', 'write'] as const) {
    const group = groups[kind]
    const chunks: string[] = []
    const answers = fillLine(
      'answers',
      group.answers.filter((item) => item.length >= 3 && !WEAK_ANSWERS.has(item)),
      ', ',
      Math.min(220, left),
    )
    if (answers) {
      chunks.push(answers)
      left -= answers.length
    }
    const frames = fillLine('frames', group.frames, ' | ', Math.min(200, left))
    if (frames) {
      chunks.push(frames)
      left -= frames.length
    }
    const cues = fillLine('cues', group.cues, ' | ', Math.min(140, left))
    if (cues) {
      chunks.push(cues)
      left -= cues.length
    }
    if (chunks.length) lines.push(`${kind}: ${chunks.join('; ')}`)
  }
  return lines.join('\n').slice(0, maxChars).trim()
}

function answerHit(catalog: QuizCatalog, value?: string) {
  if (!value) return ''
  const keys = stemAnswer(value)
  if (strongKeys(keys).some((key) => catalog.answers.has(key))) return 'strong'
  if (keys.some((key) => catalog.answers.has(key))) return 'weak'
  return ''
}

export function keysConflict(
  catalog: QuizCatalog,
  parts: { answer?: string; blank?: string; cue?: string; extra?: string },
) {
  if (!catalog.records.length && !catalog.answers.size) return false
  const frame = parts.blank ? frameOf(parts.blank) : ''
  if (frame && catalog.frames.has(frame)) return true
  if (parts.cue) {
    const cue = fold(parts.cue)
    if (cue && catalog.cues.has(cue)) return true
    if (strongKeys(stemAnswer(parts.cue)).some((key) => catalog.answers.has(key))) return true
  }
  for (const value of [parts.answer, parts.extra]) {
    const hit = answerHit(catalog, value)
    if (hit === 'strong') return true
    if (hit === 'weak' && frame && catalog.frames.has(frame)) return true
  }
  return false
}

export function quizRepeatsCatalog(text: string, catalog: QuizCatalog) {
  const record = keysFromQuiz(text)
  if (!record) return false
  if (record.cues.some((item) => catalog.cues.has(item))) return true
  if (record.frames.some((item) => catalog.frames.has(item))) return true
  return strongKeys(record.answers).some((item) => catalog.answers.has(item))
}
