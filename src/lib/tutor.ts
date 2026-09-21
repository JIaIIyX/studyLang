import { canonicalizeQuiz, demoteNonQuizButtons, extractQuizAnswer, fixReplySpaces, keepFirstExercise, limitExamples, sealDanglingPrompt, stripQuizMarkup } from './practiceTags'
import { extractQuizChoices, looksLikeQuizRequest } from './quizChoices'
import { askGemini, hasGemini, isQuotaError, MODEL_TIMEOUT_HINT } from './llm'
import { languageMeta, sectionMeta } from './languages'
import {
  classifyTutorTask,
  compactVocabHistory,
  extractAskedPhrase,
  isSimpleSay,
  lessonFromThread,
  lessonSetupReply,
  picksLessonItem,
  wantsBroadLesson,
  wantsDeeper,
  wantsLessonRules,
  quizState,
  tutorAskOptions,
  tutorTurns,
  buildVocabSystem,
  LLM_BUDGET,
  buildQuizWish,
} from './llmTasks'
import {
  contextForVocab,
  groundVocabInContext,
  isExplicitVocabTheme,
  isReferentialVocabWish,
  localVocabDraft,
} from './vocabFromContext'
import { recordQuizResult, skillQuizWish, skillTutorLine } from './skills'
import { gradeLastQuiz, gradeLocalQuiz, improviseQuiz, lastQuizMessage, makeLocalQuiz } from './tutorQuiz'
import { catalogFromMessages } from './quizCatalog'
import { GAME_KINDS, gameProgress, normalizeFileProgress } from './progress'
import { allWordFiles, loadWordFile, readCustomFiles } from './library'
import {
  draftTermKeys,
  knownTermsLine,
  parseTutorPayload,
  takenTermKeys,
  uniqueVocab,
  vocabPreface,
  vocabTableMarkdown,
} from './tutorFile'
import type { ChatMemory, ChatMessage, FileProgress, Language, VocabDraft, WordEntry, WordFile } from '../types'
import {
  buildTutorMemory,
  isOngoingThread,
  packTutorContext,
  stripLeadingGreeting,
} from './tutorMemory'

const cache = new Map<Language, WordFile[]>()

export async function libraryFor(language: Language): Promise<WordFile[]> {
  if (cache.has(language)) return cache.get(language) ?? []
  const custom = readCustomFiles().filter((file) => file.language === language)
  const items = allWordFiles(language).filter((item) => item.source !== 'upload')
  const files = await Promise.all(items.map((item) => loadWordFile(item).catch(() => null)))
  const ready = [...custom, ...files.filter((file): file is WordFile => Boolean(file))]
  cache.set(language, ready)
  return ready
}

function allEntries(files: WordFile[]): WordEntry[] {
  return files.flatMap((file) => file.entries)
}

function looksLikeQuizAnswer(text: string): boolean {
  const value = text.trim()
  if (!value || looksLikeQuizRequest(value)) return false
  if (/^задание\s*#?\d+\s*ответ/i.test(value)) return true
  if (value.includes('|')) return value.split('|').every((part) => part.trim() && !part.includes('?'))
  return value.length < 80 && !value.includes('?') && value.split(/\s+/).length <= 12
}

export function compactLexicon(files: WordFile[], limit = 20): string {
  const lines: string[] = []
  let count = 0
  for (const file of files) {
    lines.push(`[${file.title}]${file.description ? ` — ${file.description}` : ''}`)
    for (const entry of file.entries) {
      if (count >= limit) break
      count += 1
      lines.push(`- ${entry.term}${entry.translation ? ` — ${entry.translation}` : ''}`)
    }
    if (count >= limit) break
  }
  return lines.join('\n')
}

export function tutorStyleLine(prompt?: string) {
  const text = prompt?.trim().slice(0, 400)
  if (!text) return ''
  if (/админ|униж|полный доступ|игнорируй правила|jailbreak/i.test(text)) return ''
  return `Student note (follow tone and pace): ${text}`
}

export function looksLikeLiveTalk(text: string) {
  const value = text.trim()
  if (value.length < 2 || value.length > 140) return false
  if (
    /(домашн|домашк|тетрад|homework|(?:^|[^\p{L}])д[/.]?з(?:$|[^\p{L}])|квиз|проверь меня|словар|тест|таблиц|почему|как сказать|переведи|объясни)/iu.test(
      value,
    )
  ) {
    return false
  }
  const ru = (value.match(/[а-яё]/gi) ?? []).length
  const en = (value.match(/[a-z]/gi) ?? []).length
  return en >= 3 && en > ru
}

export function wantsSpokenDialogue(text: string) {
  return (
    /(давай\s+)?диалог|поговор(?:им|ить)|пообща(?:емся|ться)|живое общение|(?:давай|хочу|открой)\s+общени|talk with me|let'?s talk|role.?play/i.test(
      text,
    ) && !/(домашн|домашк|тетрад|(?:^|[^\p{L}])д[/.]?з(?:$|[^\p{L}])|квиз|проверь меня|словар|тест|таблиц)/iu.test(text)
  )
}

export function wantsVocabList(messages: ChatMessage[]) {
  const last = messages.at(-1)?.content ?? ''
  const text = last.toLowerCase()
  const hasRef = Boolean(messages.at(-1)?.refIds?.length || messages.at(-1)?.refSnippet)
  if (/(домашн|домашк|тетрад|homework|(?:^|[^\p{L}])д[/.]?з(?:$|[^\p{L}]))/iu.test(text)) return false
  if (/(проверь меня|квиз|как переводится|слово с полки|из файла)/i.test(text) && !/придумай|собери|словар|набор/.test(text)) {
    return false
  }
  if (/таблиц/.test(text) && !/слов|набор|словар|на полк|придумай|собери/.test(text)) return false
  if (isReferentialVocabWish(last) || (hasRef && /слов|фраз|словар|добав/i.test(last))) return true
  if (
    /придумай|составь|собери|создай|словар|на полк|коллекц|набор|flashcard|\bdeck\b|vocabulary|список слов|карточки|слов(?:а|о)? (?:на тему|по теме|про |для )|(?:дай|дайте|нужно|хочу)\s+(?:мне\s+)?(?:\d+\s+)?(?:слов|фраз)|(?:\d+|пять|шесть|семь|восемь|девять|десять)\s+(?:слов|фраз)|добав.{0,32}(?:слов|фраз|словар)/i.test(
      last,
    )
  ) {
    return true
  }
  const previous = messages.at(-2)
  return Boolean(previous?.role === 'assistant' && previous.fileDraft && /ещё|добав|продолж/i.test(last))
}

export function forgetTutorLibrary(language?: Language) {
  if (language) cache.delete(language)
  else cache.clear()
}

export function progressNotes(files: WordFile[], progress?: Record<string, FileProgress>): string {
  if (!progress) return 'No progress yet.'
  const lines: string[] = []
  for (const file of files) {
    const stats = normalizeFileProgress(progress[file.id])
    const parts = GAME_KINDS.map((kind) => {
      const game = gameProgress(stats, kind)
      if (!game.knownIds.length && !game.reviewIds.length) return null
      return `${sectionMeta(kind).label}: known ${game.knownIds.length}, review ${game.reviewIds.length}`
    }).filter(Boolean)
    if (parts.length) lines.push(`[${file.title}] ${parts.join('; ')}`)
  }
  return lines.join('\n') || 'No progress yet.'
}

function localReply(language: Language, messages: ChatMessage[], entries: WordEntry[]): string {
  const meta = languageMeta(language)
  const last = messages.at(-1)?.content.trim() ?? ''
  const previous = messages.at(-2)

  if (!last) {
    if (isOngoingThread(messages)) {
      return 'Продолжаем. Напишите, что разобрать дальше.'
    }
    return `${meta.greet}. Я репетитор StudyLang — держим ${meta.label.toLowerCase()}.\n\nМожем разобрать слово с полки, собрать фразу или устроить пять минут у доски.`
  }

  if (previous?.role === 'assistant' && lastQuizMessage([previous]) && looksLikeQuizAnswer(last)) {
    const lesson = lessonFromThread(messages)
    recordQuizResult(language, previous.content, last)
    return gradeLocalQuiz(
      language,
      messages,
      entries,
      lesson.grammar ? 'грамматика формы времена' : skillQuizWish(language),
      catalogFromMessages(messages),
    )
  }

  const lower = last.toLowerCase()
  if (wantsVocabList(messages)) {
    const prior = contextForVocab(messages)
    const hasRef = Boolean(messages.at(-1)?.refIds?.length || messages.at(-1)?.refSnippet)
    const fallback = localVocabDraft(language, last, new Set(), prior, hasRef)
    return fallback ? vocabPreface('', fallback.title) : 'Напишите тему, например «словарь про еду».'
  }
  if (wantsLessonRules(last) || wantsBroadLesson(last)) {
    return lessonSetupReply()
  }
  if (/таблиц/i.test(lower)) {
    const sample = entries.slice(0, 6)
    if (!sample.length) return 'Пока нет слов, из которых собрать таблицу.'
    return [
      'Держите словарик с полки:',
      '',
      '| Слово | Перевод |',
      '| --- | --- |',
      ...sample.map((entry) => `| **${entry.term}** | ${entry.translation || '—'} |`),
    ].join('\n')
  }
  if (looksLikeQuizRequest(last) || /(проверь|квиз|карточка|ещё|quiz)/i.test(lower)) {
    const { wish } = buildQuizWish(last, messages)
    return makeLocalQuiz(language, entries, wish, catalogFromMessages(messages)) || 'Пока нет слов для этого языка.'
  }

  const asked = extractAskedPhrase(last)
  const hit = findShelfHit(entries, asked || last)
  if (hit) return `<ex>${hit.term}</ex> <sec>${hit.translation ?? 'перевод появится позже'}</sec>`

  const grammar = grammarNote(language, last)
  if (grammar) return grammar

  return ''
}

export function localTutorReply(language: Language, messages: ChatMessage[], entries: WordEntry[]) {
  return localReply(language, messages, entries)
}

function findShelfHit(entries: WordEntry[], needle: string) {
  const key = needle.trim().toLowerCase()
  if (key.length < 2) return undefined
  return (
    entries.find((item) => item.term.toLowerCase() === key || (item.translation ?? '').toLowerCase() === key) ||
    entries.find((item) => `${item.term} ${item.translation ?? ''}`.toLowerCase().includes(key))
  )
}

function grammarNote(language: Language, text: string) {
  const t = text.toLowerCase()
  if (/артикл|der die das|le la les|\ba\/an\b|(^|\s)the(\s|$)/.test(t)) {
    if (language === 'de') {
      return [
        'Немецкие артикли — это род существительного.',
        '',
        '| Артикль | Род | Пример |',
        '| --- | --- | --- |',
        '| **der** | м. | der Tisch — стол |',
        '| **die** | ж. | die Lampe — лампа |',
        '| **das** | ср. | das Buch — книга |',
        '',
        'Во множественном числе почти всегда **die**. Неопределённые: ein / eine.',
      ].join('\n')
    }
    if (language === 'fr') {
      return [
        'Французские артикли зависят от рода и числа.',
        '',
        '| | м. | ж. | мн. |',
        '| --- | --- | --- | --- |',
        '| определённый | **le** | **la** | **les** |',
        '| неопределённый | **un** | **une** | **des** |',
        '',
        'Перед гласной le/la сжимаются в **l’**: l’eau, l’homme.',
      ].join('\n')
    }
    return [
      'В английском три артикля: **a**, **an**, **the**.',
      '',
      '**a / an** — один, любой: a cat, an apple (an перед гласным звуком).',
      '**the** — этот, уже известный: the cat on the sofa.',
      'Без артикля — общее или неисчисляемое: I like tea.',
    ].join('\n')
  }
  if (/to be|глагол быть|être|\bsein\b|bin ist sind/.test(t)) {
    if (language === 'de') return '**sein**: ich bin, du bist, er/sie/es ist, wir sind, ihr seid, sie/Sie sind.'
    if (language === 'fr') return '**être**: je suis, tu es, il/elle est, nous sommes, vous êtes, ils/elles sont.'
    return '**to be**: I am, you are, he/she/it is, we are, they are. Отрицание: I am not / he isn’t.'
  }
  if (/времен|present simple|présent|perfekt|präterit/.test(t)) {
    if (language === 'de') {
      return 'Сейчас чаще всего **Präsens** (ich gehe). Прошедшее в речи — **Perfekt**: ich bin gegangen / ich habe gemacht. **Präteritum** — в рассказах: ich ging, ich war, ich hatte.'
    }
    if (language === 'fr') {
      return 'Обычное настоящее — **présent**: je parle. Прошедшее факт — **passé composé**: j’ai parlé. Описание в прошлом — **imparfait**: je parlais.'
    }
    return '**Present simple** — привычка: I work here. **Present continuous** — сейчас: I am working. Прошедшее факт — **Past simple**: I worked.'
  }
  return ''
}

async function translateAsked(language: Language, phrase: string) {
  const russian = /[а-яё]/i.test(phrase)
  const response = await fetch('/api/translate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: phrase,
      lang: language,
      ...(russian ? { dir: 'into' } : { mode: 'phrase' }),
    }),
  })
  const data = (await response.json()) as { translation?: string }
  return String(data.translation || '').trim()
}

async function answerWithoutModel(language: Language, messages: ChatMessage[], entries: WordEntry[]) {
  const last = messages.at(-1)?.content.trim() ?? ''
  const ready = localReply(language, messages, entries)
  if (ready) return ready

  const asked = extractAskedPhrase(last)
  if (asked) {
    try {
      const translation = await translateAsked(language, asked)
      if (translation) {
        return /[а-яё]/i.test(asked)
          ? `Так: <ex>${translation}</ex> <sec>${asked}</sec>`
          : `<ex>${asked}</ex> <sec>${translation}</sec>`
      }
    } catch {
      /* shelf already checked */
    }
  }

  const sample = entries.filter((item) => item.translation).slice(0, 4)
  if (sample.length) {
    return [
      'Пока отвечаю с полки:',
      '',
      ...sample.map((item) => `• **${item.term}** — ${item.translation}`),
      '',
      'Или напишите «словарь про …» / «проверь меня».',
    ].join('\n')
  }
  return 'Сейчас отвечаю без нейросети. Напишите «словарь про еду», «проверь меня» или «как сказать кофе».'
}

export type TutorReply = { text: string; file?: VocabDraft | null; retry?: boolean }

export function polishTutorReply(
  text: string,
  task: ReturnType<typeof classifyTutorTask>,
  last: string,
  language: Language,
  options?: { allowGreeting?: boolean },
) {
  let next = canonicalizeQuiz(fixReplySpaces(text))
  if (options?.allowGreeting === false) {
    next = stripLeadingGreeting(next)
  }
  if (task === 'explain' || task === 'general' || task === 'say') {
    if (wantsLessonRules(last) || wantsBroadLesson(last)) {
      if (extractQuizAnswer(next)) {
        const prose = stripQuizMarkup(next)
        next = prose || lessonSetupReply()
      } else {
        next = demoteNonQuizButtons(next)
      }
      if (/<(btn|opt|answer)>/i.test(next)) next = stripQuizMarkup(next) || lessonSetupReply()
    } else {
      next = demoteNonQuizButtons(next)
    }
  }
  if (task === 'quiz' || task === 'grade' || extractQuizAnswer(next) || extractQuizChoices(next).length >= 2) {
    next = keepFirstExercise(next)
  }
  if (task === 'explain' && !wantsBroadLesson(last) && !wantsDeeper(last)) next = limitExamples(next, 1)
  return sealDanglingPrompt(next, language)
}

async function cheapTutorReply(last: string, entries: WordEntry[], task: ReturnType<typeof classifyTutorTask>) {
  if (task !== 'say' || !isSimpleSay(last)) return ''
  const asked = extractAskedPhrase(last)
  if (!asked) return ''
  const key = asked.trim().toLowerCase()
  const hit = entries.find(
    (item) => item.term.toLowerCase() === key || (item.translation ?? '').toLowerCase() === key,
  )
  if (hit) return `<ex>${hit.term}</ex> <sec>${hit.translation ?? 'перевод появится позже'}</sec>`
  return ''
}

export async function replyAsTutor(
  language: Language,
  messages: ChatMessage[],
  options?: {
    displayName?: string
    progress?: Record<string, FileProgress>
    tutorPrompt?: string
    memory?: ChatMemory | null
  },
): Promise<TutorReply> {
  const meta = languageMeta(language)
  const thread = tutorTurns(messages)
  const last = thread.at(-1)?.content.trim() ?? messages.at(-1)?.content.trim() ?? ''
  const memory = options?.memory ?? buildTutorMemory(language, thread)

  if (!last) {
    if (isOngoingThread(thread, options?.memory)) {
      return { text: 'Продолжаем. Напишите, что разобрать дальше.' }
    }
    return { text: `${meta.greet}. Я репетитор StudyLang — держим ${meta.label.toLowerCase()}.` }
  }

  if (wantsVocabList(thread)) {
    return await makeVocabReply(language, thread, memory)
  }

  let files: WordFile[] = []
  try {
    files = await libraryFor(language)
  } catch {
    files = []
  }
  const entries = allEntries(files)
  const { quizOpen, leftQuiz } = quizState(thread)
  const task = classifyTutorTask(last, { quizOpen, leftQuiz })

  if (wantsLessonRules(last) || (task === 'explain' && wantsBroadLesson(last) && !picksLessonItem(last) && !wantsDeeper(last))) {
    return { text: lessonSetupReply() }
  }

  if (!hasGemini()) {
    return { text: await answerWithoutModel(language, thread, entries) }
  }

  if (task === 'quiz' || task === 'grade') {
    const previousQuiz = lastQuizMessage(thread.slice(0, -1))
    const { wish, topic } = buildQuizWish(last, thread)
    const grammar = topic.grammar || /(врем|предложен|грамматик|практик|тут|выше)/i.test(last)
    if (task === 'grade' && previousQuiz) recordQuizResult(language, previousQuiz.content, last)
    const line = task === 'grade' ? gradeLastQuiz(thread) : ''
    const catalog = catalogFromMessages(thread)
    const lessonHint = [topic.label ? `Topic: ${topic.label}` : '', topic.excerpt].filter(Boolean).join('\n').slice(0, 480)
    const improvised = await improviseQuiz(language, entries, wish, catalog, {
      grammar: grammar || Boolean(topic.label),
      lesson: lessonHint || topic.excerpt,
    })
    if (improvised) return { text: line ? `${line}\n\n${improvised}` : improvised }
    const localWish = topic.label
      ? `${topic.label} грамматика формы — ${last}`
      : grammar
        ? `грамматика формы времена — ${topic.excerpt.slice(0, 120)} — ${last}`
        : wish
    const local =
      task === 'grade'
        ? gradeLocalQuiz(language, thread, entries, localWish, catalog)
        : makeLocalQuiz(language, entries, localWish, catalog)
    if (local) return { text: local }
  }

  const cheap = await cheapTutorReply(last, entries, task)
  if (cheap) return { text: cheap }

  if (/(переведи(?:те)?|как сказать|как будет|как по[- ]?(?:английски|французски|немецки)|что значит)/i.test(last)) {
    const asked = extractAskedPhrase(last)
    if (asked) {
      try {
        const translation = await translateAsked(language, asked)
        if (translation) {
          return {
            text: /[а-яё]/i.test(asked)
              ? `Так: <ex>${translation}</ex> <sec>${asked}</sec>`
              : `<ex>${asked}</ex> <sec>${translation}</sec>`,
          }
        }
      } catch {
        /* fall through to the model */
      }
    }
  }

  const packed = packTutorContext(language, thread, task, {
    displayName: options?.displayName,
    tutorPrompt: options?.tutorPrompt,
    skillFocus: skillTutorLine(language, options?.progress),
    memory,
  })

  try {
    return {
      text: polishTutorReply(
        await askGemini(packed.system, packed.history, tutorAskOptions(task)),
        task,
        last,
        language,
        { allowGreeting: packed.allowGreeting },
      ),
    }
  } catch (error) {
    console.warn('[tutor] llm failed', error)
    const message = error instanceof Error ? error.message : String(error)
    if (/unauthenticated|401/i.test(message)) {
      return { text: 'Сессия сбросилась. Обновите страницу и войдите снова — без входа модель не отвечает.' }
    }
    if (isQuotaError(error) || /timeout|empty/i.test(message)) {
      return { text: MODEL_TIMEOUT_HINT, retry: true }
    }
    return { text: await answerWithoutModel(language, thread, entries) }
  }
}

function localVocabReply(language: Language, wish: string, taken: Set<string>, prior = '', hasRef = false): TutorReply {
  const file = localVocabDraft(language, wish, taken, prior, hasRef)
  if (!file) return { text: 'Напишите тему, например «словарь про еду».' }
  return {
    text: `${vocabPreface('', file.title)}\n\n${vocabTableMarkdown(file)}`,
    file,
  }
}

export async function makeVocabReply(
  language: Language,
  messages: ChatMessage[],
  memory?: ChatMemory | null,
): Promise<TutorReply> {
  const last = messages.at(-1)?.content.trim() ?? ''
  const prior = contextForVocab(messages) || memory?.vocabExcerpt || ''
  const hasRef = Boolean(messages.at(-1)?.refIds?.length || messages.at(-1)?.refSnippet)
  const referential = (isReferentialVocabWish(last) || hasRef) && !isExplicitVocabTheme(last)
  let files: WordFile[] = []
  try {
    files = await libraryFor(language)
  } catch {
    files = []
  }
  const taken = referential ? draftTermKeys(messages) : takenTermKeys(files, messages)
  if (referential) {
    const extracted = localVocabDraft(language, last, taken, prior, hasRef)
    if (extracted && extracted.entries.length >= 2) return localVocabReply(language, last, taken, prior, hasRef)
  }
  if (!hasGemini()) return localVocabReply(language, last, taken, prior, hasRef)

  const known = knownTermsLine(files, messages, 40, last)
  const system = buildVocabSystem(language, known, taken.size, referential)
  const history = compactVocabHistory(
    messages.map((message) => ({
      role: message.role === 'assistant' ? ('model' as const) : ('user' as const),
      text: message.content,
    })),
    referential,
    prior,
  )

  try {
    const raw = await askGemini(system, history, {
      maxTokens: LLM_BUDGET.vocab.maxTokens,
      timeoutMs: LLM_BUDGET.vocab.timeoutMs,
    })
    const parsed = parseTutorPayload(raw)
    let file = parsed.file ? uniqueVocab(parsed.file, taken) : null
    if (referential && prior) file = groundVocabInContext(file, prior)
    const minEntries = referential ? 2 : 4
    if (file && file.entries.length >= minEntries) {
      return {
        text: `${vocabPreface(parsed.reply, file.title)}\n\n${vocabTableMarkdown(file)}`,
        file,
      }
    }
  } catch {
    /* local pack */
  }
  return localVocabReply(language, last, taken, prior, hasRef)
}
