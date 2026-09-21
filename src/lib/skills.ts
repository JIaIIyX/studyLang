import { allWordFiles } from './library'
import { matchAnswerSet } from './normalize'
import { getSnapshot, updateSnapshot } from './persist'
import { extractQuizAnswers, quizPickMode } from './practiceTags'
import { extractQuizChoices } from './quizChoices'
import { picksFromChoices } from './quizReply'
import { GAME_KINDS, gameProgress, normalizeFileProgress } from './progress'
import type { FileProgress, GameKind, Language } from '../types'

export const SKILL_KINDS = ['words', 'sense', 'grammar'] as const
export type SkillKind = (typeof SKILL_KINDS)[number]

export type SkillTally = {
  hits: number
  samples: number
}

export type LanguageSkills = Record<SkillKind, SkillTally>
export type SkillStore = Partial<Record<Language, LanguageSkills>>

export type SkillBar = {
  kind: SkillKind
  label: string
  hint: string
  score: number | null
  samples: number
}

export type SkillProfile = {
  bars: SkillBar[]
  weakest: SkillKind | null
  note: string
  tutorLine: string
  quizWish: string
  homeworkHint: string
}

export const SKILL_META: Record<SkillKind, { label: string; hint: string; drill: string }> = {
  words: {
    label: 'Слова',
    hint: 'Понимание отдельных слов и значений',
    drill: 'Drill vocabulary: L2↔Russian, pairs, several senses of the same word.',
  },
  sense: {
    label: 'Смысл',
    hint: 'Понимание смысла в текстах',
    drill: 'Focus on meaning in text: short passages, story order, whole-sentence sense.',
  },
  grammar: {
    label: 'Грамматика',
    hint: 'Формы, артикли, порядок слов',
    drill: 'Focus on grammar: forms, articles, tense, word order, full sentences.',
  },
}

function emptyTally(): SkillTally {
  return { hits: 0, samples: 0 }
}

function emptyLang(): LanguageSkills {
  return { words: emptyTally(), sense: emptyTally(), grammar: emptyTally() }
}

function add(tally: SkillTally, quality: number, weight: number): SkillTally {
  const w = Math.max(0, weight)
  if (w === 0) return tally
  return {
    hits: tally.hits + Math.max(0, Math.min(1, quality)) * w,
    samples: tally.samples + w,
  }
}

function merge(left: SkillTally, right: SkillTally): SkillTally {
  return { hits: left.hits + right.hits, samples: left.samples + right.samples }
}

export function skillScore(tally: SkillTally): number | null {
  if (tally.samples < 1) return null
  return Math.max(0, Math.min(100, Math.round((100 * tally.hits) / tally.samples)))
}

function markQuality(mark: string): number | null {
  if (mark === 'ok' || mark === 'known') return 1
  if (mark === 'partial') return 0.5
  if (mark === 'bad' || mark === 'review') return 0
  return null
}

export function homeworkSkillWeights(kind: string): Partial<Record<SkillKind, number>> {
  if (kind === 'words' || kind === 'match' || kind === 'meanings') return { words: 2 }
  if (kind === 'into') return { words: 2, grammar: 0.5 }
  if (kind === 'passage' || kind === 'translate') return { sense: 2, grammar: 0.8 }
  if (kind === 'order') return { sense: 2 }
  if (kind === 'rows' || kind === 'write') return { grammar: 2, words: 0.5 }
  if (kind === 'fill' || kind === 'correct') return { grammar: 2 }
  if (kind === 'choose') return { words: 1, grammar: 1 }
  return { words: 1 }
}

export function gameSkillWeights(kind: GameKind): Partial<Record<SkillKind, number>> {
  if (kind === 'cards' || kind === 'matching' || kind === 'puzzles') return { words: 1 }
  if (kind === 'translations') return { words: 0.8, sense: 0.6 }
  if (kind === 'sentences') return { grammar: 1, sense: 0.5 }
  return { words: 1 }
}

export function quizSkillKind(text: string): SkillKind {
  if (/___|артикл|форм|спряж|склон|пропуск|вставь|согласован/i.test(text)) return 'grammar'
  if (/абзац|текст|смысл|истори|предложен/i.test(text)) return 'sense'
  return 'words'
}

function asTally(value: unknown): SkillTally {
  if (!value || typeof value !== 'object') return emptyTally()
  const item = value as { hits?: unknown; samples?: unknown }
  const hits = typeof item.hits === 'number' && Number.isFinite(item.hits) ? Math.max(0, item.hits) : 0
  const samples = typeof item.samples === 'number' && Number.isFinite(item.samples) ? Math.max(0, item.samples) : 0
  return { hits, samples }
}

function asLang(value: unknown): LanguageSkills {
  if (!value || typeof value !== 'object') return emptyLang()
  const item = value as Record<string, unknown>
  return {
    words: asTally(item.words),
    sense: asTally(item.sense),
    grammar: asTally(item.grammar),
  }
}

function adviceObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {}
}

export function readTutorSkills(): SkillStore {
  const advice = adviceObject(getSnapshot().advice)
  const raw = advice.skills
  if (!raw || typeof raw !== 'object') return {}
  const next: SkillStore = {}
  for (const key of ['fr', 'de', 'en'] as const) {
    const item = (raw as Record<string, unknown>)[key]
    if (item) next[key] = asLang(item)
  }
  return next
}

export function writeTutorSkills(store: SkillStore) {
  const advice = adviceObject(getSnapshot().advice)
  updateSnapshot({ advice: { ...advice, skills: store } })
}

export function addSkillEvent(store: SkillStore, language: Language, kind: SkillKind, quality: number, weight = 1): SkillStore {
  const lang = store[language] ?? emptyLang()
  return {
    ...store,
    [language]: {
      ...lang,
      [kind]: add(lang[kind], quality, weight),
    },
  }
}

export function recordQuizResult(language: Language, quizText: string, answer: string) {
  const expected = extractQuizAnswers(quizText)
  if (!expected.length || !answer.trim()) return
  const quality = matchAnswerSet(picksFromChoices(answer, extractQuizChoices(quizText)).join(' | ') || answer, expected, quizPickMode(quizText)) ? 1 : 0
  writeTutorSkills(addSkillEvent(readTutorSkills(), language, quizSkillKind(quizText), quality, 2))
}

function tallyFromGames(progress: Record<string, FileProgress> | undefined, language: Language): LanguageSkills {
  const out = emptyLang()
  const ids = new Set(allWordFiles(language).map((file) => file.id))
  for (const [fileId, raw] of Object.entries(progress ?? {})) {
    if (!ids.has(fileId)) continue
    const file = normalizeFileProgress(raw)
    for (const kind of GAME_KINDS) {
      const weights = gameSkillWeights(kind)
      const game = gameProgress(file, kind)
      for (const [skill, weight] of Object.entries(weights) as [SkillKind, number][]) {
        for (let i = 0; i < game.knownIds.length; i += 1) out[skill] = add(out[skill], 1, weight)
        for (let i = 0; i < game.reviewIds.length; i += 1) out[skill] = add(out[skill], 0, weight)
      }
    }
  }
  return out
}

function tallyFromHomework(language: Language): LanguageSkills {
  const out = emptyLang()
  const raw = getSnapshot().homework
  if (!Array.isArray(raw)) return out
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const sheet = item as {
      language?: string
      marks?: Record<string, string>
      tasks?: { id?: string; kind?: string }[]
    }
    if (sheet.language !== language || !Array.isArray(sheet.tasks) || !sheet.marks) continue
    for (const task of sheet.tasks) {
      if (!task?.id || !task.kind) continue
      const quality = markQuality(sheet.marks[task.id] ?? '')
      if (quality === null) continue
      const weights = homeworkSkillWeights(task.kind)
      for (const [skill, weight] of Object.entries(weights) as [SkillKind, number][]) {
        out[skill] = add(out[skill], quality, weight)
      }
    }
  }
  return out
}

function combine(parts: LanguageSkills[]): LanguageSkills {
  return parts.reduce<LanguageSkills>(
    (acc, part) => ({
      words: merge(acc.words, part.words),
      sense: merge(acc.sense, part.sense),
      grammar: merge(acc.grammar, part.grammar),
    }),
    emptyLang(),
  )
}

function pickExtreme(bars: SkillBar[], prefer: 'low' | 'high'): SkillBar | null {
  const ready = bars.filter((bar) => bar.score !== null && bar.samples >= 3)
  const pool = ready.length ? ready : bars.filter((bar) => bar.score !== null)
  if (!pool.length) return null
  return pool.reduce((best, bar) => {
    if (prefer === 'low') return (bar.score ?? 100) < (best.score ?? 100) ? bar : best
    return (bar.score ?? 0) > (best.score ?? 0) ? bar : best
  })
}

export function skillProfileFor(language: Language, progress?: Record<string, FileProgress>): SkillProfile {
  const tallies = combine([tallyFromGames(progress ?? getSnapshot().progress, language), tallyFromHomework(language), readTutorSkills()[language] ?? emptyLang()])
  const bars: SkillBar[] = SKILL_KINDS.map((kind) => ({
    kind,
    label: SKILL_META[kind].label,
    hint: SKILL_META[kind].hint,
    score: skillScore(tallies[kind]),
    samples: Math.round(tallies[kind].samples),
  }))
  const weakestBar = pickExtreme(bars, 'low')
  const strongestBar = pickExtreme(bars, 'high')
  const gap =
    weakestBar && strongestBar && weakestBar.kind !== strongestBar.kind
      ? (strongestBar.score ?? 0) - (weakestBar.score ?? 0)
      : 0
  const weakest = weakestBar && (weakestBar.score ?? 100) < 78 && gap >= 6 ? weakestBar.kind : weakestBar && (weakestBar.score ?? 100) < 55 ? weakestBar.kind : null
  const focus = weakest ? SKILL_META[weakest] : null
  const note = !bars.some((bar) => bar.samples > 0)
    ? 'Очки появятся после карточек, квиза и тетради.'
    : focus
      ? `Упор: ${focus.label.toLowerCase()} — ${focus.hint.toLowerCase()}.`
      : 'Пока без явного слабого места. Можно чуть усложнить тексты.'
  const parts = bars.map((bar) => `${bar.kind} ${bar.score ?? 'n/a'} (${bar.samples})`).join(', ')
  const tutorLine = focus
    ? `Skill scores 0–100: ${parts}. Weakest: ${focus.label} (${weakestBar?.score}). ${focus.drill} Do not mention scores unless asked.`
    : `Skill scores 0–100: ${parts}. Keep a balanced mix. Do not mention scores unless asked.`
  const quizWish = weakest === 'grammar' ? 'грамматика формы артикли' : weakest === 'sense' ? 'смысл в тексте' : weakest === 'words' ? 'перевод слов' : ''
  const homeworkHint = focus ? `упор на ${focus.label.toLowerCase()}` : ''
  return { bars, weakest, note, tutorLine, quizWish, homeworkHint }
}

export function skillTutorLine(language: Language, progress?: Record<string, FileProgress>) {
  return skillProfileFor(language, progress).tutorLine
}

export function skillQuizWish(language: Language, progress?: Record<string, FileProgress>) {
  return skillProfileFor(language, progress).quizWish
}
