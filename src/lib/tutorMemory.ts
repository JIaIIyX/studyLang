import { languageMeta } from './languages'
import {
  MEMORY_RECENT_TURNS,
  buildTutorSystem,
  compactHistory,
  isQuizItem,
  quizState,
  topicFromThread,
  tutorTurns,
  wantsLessonRules,
  type QuizDirection,
  type TutorTask,
} from './llmTasks'
import { extractQuizAnswer } from './practiceTags'
import { looksLikeQuizRequest } from './quizChoices'
import { extractVocabEntriesFromText } from './vocabFromContext'
import type { ChatMemory, ChatMessage, ChatQuizMemory, Language } from '../types'

export { MEMORY_RECENT_TURNS }

export const MEMORY_MAX_CHARS = 700

const GREET_WORD =
  '(?:привет(?:ик)?|здравствуй(?:те)?|добр(?:ый|ое|ой)\\s+(?:день|утро|вечер|ночи)|добро\\s+пожаловать|хай|хеллоу?|hello|hi|hey|bonjour|salut|welcome|guten\\s+(?:tag|morgen|abend))'

function greetRe(extra: string, flags = 'iu') {
  return new RegExp(`^${GREET_WORD}(?![а-яёa-z])${extra}`, flags)
}

function greetStart(text: string) {
  return greetRe('').test(text.trim())
}

export function looksLikeGreeting(text: string) {
  const value = text.trim()
  if (!value || /приветств/i.test(value)) return false
  return greetStart(value)
}

export function isGreetingOnly(text: string) {
  const value = text.trim()
  if (!value || value.length > 90) return false
  if (/приветств/i.test(value)) return false
  if (/[—–−]|значит|перевод|это\s/i.test(value) && value.length > 24) return false
  return greetRe(
    '(?:\\s*[,!]\\s*|\\s+)?(?:[A-ZА-ЯЁ][\\w.-]*)?(?:\\s*[!.…]*)?$',
  ).test(value)
}

export function userGreeted(text: string) {
  return isGreetingOnly(text) || (looksLikeGreeting(text) && text.trim().length <= 48)
}

export function isOngoingThread(messages: ChatMessage[], memory?: ChatMemory | null) {
  const thread = tutorTurns(messages)
  if (thread.some((item) => item.role === 'assistant')) return true
  if (thread.filter((item) => item.role === 'user').length > 1) return true
  return Boolean(memory?.summary?.trim())
}

export function allowTutorGreeting(last: string, messages: ChatMessage[], memory?: ChatMemory | null) {
  if (userGreeted(last)) return true
  return !isOngoingThread(messages, memory)
}

export function stripLeadingGreeting(text: string) {
  const lines = text.replace(/^\uFEFF/, '').split('\n')
  let start = 0
  while (start < lines.length) {
    const line = lines[start]?.trim() ?? ''
    if (!line) {
      start += 1
      continue
    }
    const teaching = /[—–−]|значит|перевод|приветств/i.test(line)
    if (!teaching && (isGreetingOnly(line) || (looksLikeGreeting(line) && line.length <= 48))) {
      start += 1
      continue
    }
    const stripped = line.replace(greetRe('(?:\\s+[A-ZА-ЯЁ][\\w.-]*)?\\s*[,!.…]+\\s*'), '')
    if (stripped !== line && stripped.trim().length >= 8 && !/приветств/i.test(line)) {
      lines[start] = stripped
    }
    break
  }
  return lines.slice(start).join('\n').trim() || text.trim()
}

function clipBlob(text: string, maxChars: number) {
  const cleaned = text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (cleaned.length <= maxChars) return cleaned
  return `${cleaned.slice(0, maxChars).trim()}…`
}

function uniq(values: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = value.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(value.trim())
  }
  return out
}

function looksLikeShortAnswer(text: string) {
  const value = text.trim()
  if (!value) return true
  if (/^задание\s+#?\d+\s+ответ/i.test(value)) return true
  if (isGreetingOnly(value)) return true
  return value.length < 48 && !value.includes('?') && value.split(/\s+/).length <= 8
}

function extractGoal(messages: ChatMessage[], previous?: ChatMemory | null) {
  for (const item of [...messages].reverse()) {
    if (item.role !== 'user') continue
    const text = item.content.trim()
    if (looksLikeShortAnswer(text)) continue
    if (
      wantsLessonRules(text) ||
      looksLikeQuizRequest(text) ||
      /слов|фраз|словар|практик|разбер|объясни|хочу/i.test(text)
    ) {
      return clipBlob(text.replace(/\s+/g, ' '), 140)
    }
    if (text.length >= 8) return clipBlob(text.replace(/\s+/g, ' '), 140)
  }
  return previous?.goal ?? ''
}

function extractLevel(messages: ChatMessage[], previous?: ChatMemory | null) {
  const blob = messages.map((item) => item.content).join('\n')
  const exam = blob.match(/\b(A1|A2|B1|B2|C1|C2)\b/i)?.[1]
  if (exam) return exam.toUpperCase()
  if (/начальн|новичк|с нуля/i.test(blob)) return 'A1'
  if (/средн(ий|его)|intermediate/i.test(blob)) return 'B1'
  return previous?.level ?? ''
}

function extractQuiz(messages: ChatMessage[]): ChatQuizMemory | null {
  const lastAssist = [...messages].reverse().find((item) => item.role === 'assistant')
  const { lastQuiz, quizOpen } = quizState(messages)
  const source = lastAssist && isQuizItem(lastAssist.content) ? lastAssist : quizOpen ? lastQuiz : null
  if (!source) return null
  const answer = extractQuizAnswer(source.content)
  if (!answer) return null
  const question = clipBlob(
    source.content.replace(/<answer>[\s\S]*?<\/answer>/gi, '').replace(/=\s*[^\n]+/g, ''),
    220,
  )
  return { id: source.id, question, answer }
}

function extractVocabTitles(messages: ChatMessage[], previous?: ChatMemory | null) {
  const titles = messages
    .map((item) => item.fileDraft?.title?.trim() ?? '')
    .filter(Boolean)
  const merged = uniq([...(previous?.vocabTitles ?? []), ...titles])
  return merged.slice(-4)
}

function extractVocabExcerpt(messages: ChatMessage[], previous?: ChatMemory | null) {
  for (const item of [...messages].reverse()) {
    if (item.role !== 'assistant') continue
    if (item.fileDraft?.entries?.length) {
      const rows = item.fileDraft.entries
        .slice(0, 8)
        .map((entry) => `${entry.term} — ${entry.translation ?? ''}`.trim())
        .join('\n')
      return clipBlob(`${item.fileDraft.title ? `${item.fileDraft.title}\n` : ''}${rows || item.content}`, 480)
    }
    if (extractVocabEntriesFromText(item.content).length >= 2) {
      return clipBlob(item.content, 480)
    }
  }
  return previous?.vocabExcerpt ?? ''
}

function extractRefIds(messages: ChatMessage[], previous?: ChatMemory | null) {
  const lastUser = [...messages].reverse().find((item) => item.role === 'user')
  const ids = uniq([...(lastUser?.refIds ?? []), ...(previous?.refIds ?? [])])
  return ids.slice(-8)
}

export function buildTutorMemory(
  language: Language,
  messages: ChatMessage[],
  previous?: ChatMemory | null,
): ChatMemory {
  const thread = tutorTurns(messages)
  const topic = topicFromThread(thread)
  const goal = extractGoal(thread, previous)
  const level = extractLevel(thread, previous)
  const quiz = extractQuiz(thread)
  const vocabTitles = extractVocabTitles(thread, previous)
  const vocabExcerpt = extractVocabExcerpt(thread, previous)
  const refIds = extractRefIds(thread, previous)
  const openTask = clipBlob(topic.excerpt || previous?.openTask || '', 200)
  const topics = uniq([...(topic.topics ?? []), ...(previous?.topics ?? [])]).slice(0, 6)
  const lines = [
    `language: ${languageMeta(language).native} (${language})`,
    goal ? `goal: ${goal}` : '',
    level ? `level: ${level}` : '',
    topics.length ? `topics: ${topics.join(', ')}` : '',
    quiz ? `open quiz id=${quiz.id}; Q: ${quiz.question}; key: ${quiz.answer}` : '',
    vocabTitles.length ? `vocab: ${vocabTitles.join(', ')}` : '',
    vocabExcerpt ? `recent vocab excerpt: ${clipBlob(vocabExcerpt, 280)}` : '',
    refIds.length ? `quoted message ids: ${refIds.join(', ')}` : '',
    openTask ? `open task: ${openTask}` : '',
  ].filter(Boolean)
  return {
    updatedAt: Date.now(),
    language,
    summary: clipBlob(lines.join('\n'), MEMORY_MAX_CHARS),
    goal: goal || undefined,
    level: level || undefined,
    topics: topics.length ? topics : undefined,
    quiz,
    vocabTitles: vocabTitles.length ? vocabTitles : undefined,
    vocabExcerpt: vocabExcerpt || undefined,
    refIds: refIds.length ? refIds : undefined,
    openTask: openTask || undefined,
  }
}

export function formatMemoryBlock(memory: ChatMemory | null | undefined) {
  const summary = memory?.summary?.trim() ?? ''
  if (!summary) return ''
  return `Thread memory (compact; older turns omitted — keep this essence):\n${summary}`
}

export function parseChatMemory(value: unknown): ChatMemory | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Partial<ChatMemory>
  if (typeof item.summary !== 'string' || !item.summary.trim()) return undefined
  const language = item.language === 'fr' || item.language === 'de' || item.language === 'en' ? item.language : undefined
  if (!language) return undefined
  return {
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
    language,
    summary: item.summary.slice(0, MEMORY_MAX_CHARS + 80),
    goal: typeof item.goal === 'string' ? item.goal : undefined,
    level: typeof item.level === 'string' ? item.level : undefined,
    topics: Array.isArray(item.topics) ? item.topics.filter((entry): entry is string => typeof entry === 'string') : undefined,
    quiz:
      item.quiz && typeof item.quiz === 'object' && typeof item.quiz.answer === 'string'
        ? {
            id: String(item.quiz.id ?? ''),
            question: String(item.quiz.question ?? ''),
            answer: item.quiz.answer,
          }
        : item.quiz === null
          ? null
          : undefined,
    vocabTitles: Array.isArray(item.vocabTitles)
      ? item.vocabTitles.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    vocabExcerpt: typeof item.vocabExcerpt === 'string' ? item.vocabExcerpt : undefined,
    refIds: Array.isArray(item.refIds) ? item.refIds.filter((entry): entry is string => typeof entry === 'string') : undefined,
    openTask: typeof item.openTask === 'string' ? item.openTask : undefined,
  }
}

export function packTutorContext(
  language: Language,
  messages: ChatMessage[],
  task: TutorTask,
  options?: {
    displayName?: string
    tutorPrompt?: string
    skillFocus?: string
    quizPool?: string
    quizDirection?: QuizDirection
    memory?: ChatMemory | null
  },
) {
  const thread = tutorTurns(messages)
  const last = thread.at(-1)?.content.trim() ?? ''
  const memory = buildTutorMemory(language, thread, options?.memory)
  const ongoing = isOngoingThread(thread, options?.memory)
  const allowGreeting = allowTutorGreeting(last, thread, options?.memory)
  const hasMemory = Boolean(memory.summary) && thread.length > MEMORY_RECENT_TURNS
  const system = buildTutorSystem(language, last, thread, task, {
    displayName: options?.displayName,
    tutorPrompt: options?.tutorPrompt,
    skillFocus: options?.skillFocus,
    quizPool: options?.quizPool,
    quizDirection: options?.quizDirection,
    memoryBlock: formatMemoryBlock(memory),
    ongoing,
    allowGreeting,
  })
  const history = compactHistory(
    thread.map((message) => ({
      role: message.role === 'assistant' ? ('model' as const) : ('user' as const),
      text: message.content,
    })),
    task,
    { hasMemory, recentTurns: MEMORY_RECENT_TURNS },
  )
  return { system, history, memory, ongoing, allowGreeting, last, hasMemory }
}
