import { askGemini } from './llm'
import { asStringList, asStringMap, padLines } from './homeworkDraft'
import { LLM_BUDGET } from './llmTasks'
import { languageMeta } from './languages'
import { asRows, asText, parseModelValue } from './modelParse'
import { getSnapshot, updateSnapshot } from './persist'
import { skillProfileFor } from './skills'
import { libraryFor } from './tutor'
import { answersOf, fold, matchesAnswer, shuffle, uid } from './normalize'
import type { FileProgress, Language, WordEntry, WordFile } from '../types'

export const HOMEWORK_KINDS = [
  'passage',
  'words',
  'fill',
  'translate',
  'choose',
  'meanings',
  'match',
  'order',
  'into',
  'rows',
  'write',
  'correct',
] as const
export type HomeworkKind = (typeof HOMEWORK_KINDS)[number]

export type HomeworkMark = 'ok' | 'partial' | 'bad'
export type HomeworkTask = {
  id: string
  kind: HomeworkKind
  prompt: string
  text?: string
  hint?: string
  options?: string[]
  answer: string
  answers?: string[]
  requiredWords?: string[]
  pairs?: { left: string; right: string }[]
  items?: string[]
  rows?: string[]
  explanation?: string
  tags?: string[]
}

export type HomeworkAnalysis = {
  summary: string
  problems: string[]
  study: string[]
}

export type TaskCheck = {
  mark: HomeworkMark
  points: number
  missing: string[]
}

export type HomeworkSheet = {
  id: string
  title: string
  topic: string
  intro: string
  language: Language
  createdAt: number
  doneAt?: number
  tasks: HomeworkTask[]
  drafts: Record<string, string>
  marks: Record<string, HomeworkMark>
  reviews: Record<string, string>
  tags?: string[]
  analysis?: HomeworkAnalysis
}

const KIND_SET = new Set<string>(HOMEWORK_KINDS)
const KIND_TAG: Record<HomeworkKind, string> = {
  passage: 'абзац',
  words: 'слова',
  fill: 'пропуск',
  translate: 'перевод',
  choose: 'выбор',
  meanings: 'значения',
  match: 'пары',
  order: 'история',
  into: 'на язык',
  rows: 'строки',
  write: 'письмо',
  correct: 'ошибка',
}

export function wantsHomework(text: string) {
  const value = text.trim()
  if (!value) return false
  if (/(словар|flashcard|на полк|квиз|проверь меня)/i.test(value) && !/домашк|домашн|тетрад|(?:^|[^\p{L}])д[/.]?з(?:$|[^\p{L}])/iu.test(value)) {
    return false
  }
  return /домашн|домашк|тетрад|homework|(?:^|[^\p{L}])д[/.]?з(?:$|[^\p{L}])|задан\w{0,10} на дом|(?:выдай|создай|сделай|дай|собери|напиши)(?:те)?(?:\s+мне)?\s+(?:домаш|тетрад|задан|д[/.]?з)/iu.test(
    value,
  )
}

export function parseTags(raw: string) {
  return [...new Set(raw.split(/[,;#/]+/).map((item) => item.trim()).filter((item) => item.length > 0 && item.length <= 22))].slice(
    0,
    4,
  )
}

export function tagsOf(task: HomeworkTask) {
  return task.tags?.length ? task.tags : [KIND_TAG[task.kind]]
}

export function sheetTags(sheet: HomeworkSheet) {
  if (sheet.tags?.length) return sheet.tags
  return [...new Set(sheet.tasks.flatMap((task) => tagsOf(task)))].slice(0, 6)
}

function asTagField(raw: string) {
  if (!raw) return { tags: undefined as string[] | undefined, explanation: undefined as string | undefined }
  if (raw.length > 48 && /\s/.test(raw)) return { tags: undefined, explanation: raw }
  const tags = parseTags(raw)
  return tags.length ? { tags, explanation: undefined } : { tags: undefined, explanation: raw || undefined }
}

export function kindLabel(kind: HomeworkKind) {
  if (kind === 'passage') return 'Перевод абзаца'
  if (kind === 'words') return 'Перевод слов'
  if (kind === 'fill') return 'Вставьте пропуск'
  if (kind === 'translate') return 'Перевод'
  if (kind === 'choose') return 'Выберите ответ'
  if (kind === 'meanings') return 'Несколько значений'
  if (kind === 'match') return 'Сопоставьте пары'
  if (kind === 'order') return 'Соберите историю'
  if (kind === 'into') return 'С русского'
  if (kind === 'rows') return 'Пять строк'
  if (kind === 'write') return 'Письменное задание'
  return 'Исправьте ошибку'
}

function isKind(value: unknown): value is HomeworkKind {
  return typeof value === 'string' && KIND_SET.has(value)
}

function isMark(value: unknown): value is HomeworkMark {
  return value === 'ok' || value === 'partial' || value === 'bad'
}

export function requiredWordsFromPrompt(prompt: string) {
  const match = prompt.match(
    /(?:со словами|словами|используя слова|using(?: the)? words?)\s*:?\s*(.+)$/i,
  )
  if (!match?.[1]) return undefined
  const words = match[1]
    .split(/[,;]| и | and /i)
    .map((item) => item.replace(/[.«»"'():]/g, '').trim())
    .filter((item) => item.length >= 2 && !/^(на|по|английск|француз|немец|английский|французский|немецкий)$/i.test(item))
  return words.length ? words : undefined
}

export function requiredWordsOf(task: HomeworkTask) {
  return task.requiredWords?.length ? task.requiredWords : requiredWordsFromPrompt(task.prompt) ?? []
}

function hasRequiredWord(draft: string, word: string) {
  const needle = fold(word)
  if (needle.length < 2) return true
  return fold(draft)
    .split(' ')
    .filter(Boolean)
    .some((token) => token === needle || (needle.length >= 3 && token.startsWith(needle)))
}

export function missingRequiredWords(task: HomeworkTask, draft: string) {
  return requiredWordsOf(task).filter((word) => !hasRequiredWord(draft, word))
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : []
}

function asPairs(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const pairs = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const left = typeof row.left === 'string' ? row.left.trim() : ''
      const right = typeof row.right === 'string' ? row.right.trim() : ''
      return left && right ? { left, right } : null
    })
    .filter((item): item is { left: string; right: string } => Boolean(item))
  return pairs.length ? pairs : undefined
}

function pairsFromOptions(options: string[] | undefined, answer: string) {
  if (!options?.length || !answer) return undefined
  const rights = answer.split('|').map((item) => item.trim()).filter(Boolean)
  if (rights.length !== options.length) return undefined
  return options.map((left, index) => ({ left, right: rights[index] }))
}

function needsAnswer(kind: HomeworkKind) {
  return kind !== 'write' && kind !== 'rows' && kind !== 'meanings' && kind !== 'match' && kind !== 'order' && kind !== 'words' && kind !== 'into'
}

function asTask(value: unknown): HomeworkTask | null {
  if (Array.isArray(value)) {
    const kind = asText(value[0])
    if (!isKind(kind)) return null
    const prompt = asText(value[1])
    const text = asText(value[2])
    const answer = asText(value[3])
    const extra = asText(value[4])
    const tagged = asTagField(asText(value[5]))
    if (!prompt) return null
    if (needsAnswer(kind) && !answer) return null
    const split = extra.split('|').map((item) => item.trim()).filter(Boolean)
    const options = kind === 'choose' || kind === 'meanings' || kind === 'match' || kind === 'order' ? split : undefined
    if (kind === 'choose' && answer && options && !options.includes(answer)) options.unshift(answer)
    return {
      id: uid('hw'),
      kind,
      prompt,
      text: text || undefined,
      hint: kind === 'choose' || kind === 'meanings' || kind === 'match' || kind === 'order' ? undefined : extra || undefined,
      options: options?.length ? options : undefined,
      answer,
      answers: kind === 'meanings' ? answer.split('|').map((item) => item.trim()).filter(Boolean) : undefined,
      requiredWords: requiredWordsFromPrompt(prompt),
      pairs: kind === 'match' ? pairsFromOptions(options, answer) : undefined,
      items: kind === 'order' && split.length ? split : undefined,
      rows: kind === 'rows' ? requiredWordsFromPrompt(prompt) : undefined,
      explanation: tagged.explanation,
      tags: tagged.tags?.length ? tagged.tags : [KIND_TAG[kind]],
    }
  }

  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (!isKind(item.kind)) return null
  const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : ''
  const answer = typeof item.answer === 'string' ? item.answer.trim() : ''
  if (!prompt) return null
  if (needsAnswer(item.kind) && !answer) return null
  const options = stringList(item.options)
  const answers = stringList(item.answers)
  const pairs = asPairs(item.pairs)
  const items = stringList(item.items)
  const rows = stringList(item.rows)
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id : uid('hw'),
    kind: item.kind,
    prompt,
    text: typeof item.text === 'string' ? item.text.trim() : undefined,
    hint: typeof item.hint === 'string' ? item.hint.trim() : undefined,
    options: options.length ? options : undefined,
    answer,
    answers: answers.length ? answers : undefined,
    requiredWords:
      stringList(item.requiredWords).length ? stringList(item.requiredWords) : requiredWordsFromPrompt(prompt),
    pairs,
    items: items.length ? items : undefined,
    rows: rows.length ? rows : undefined,
    explanation: typeof item.explanation === 'string' ? item.explanation.trim() : undefined,
    tags: Array.isArray(item.tags)
      ? parseTags(item.tags.filter((tag): tag is string => typeof tag === 'string').join(','))
      : typeof item.tags === 'string'
        ? parseTags(item.tags)
        : [KIND_TAG[item.kind]],
  }
}

function asSheet(value: unknown, language: Language): HomeworkSheet | null {
  if (Array.isArray(value)) {
    const title = asText(value[0])
    const topic = asText(value[1]) || 'Практика'
    const tasksRaw = Array.isArray(value[2]) ? value[2] : value[3]
    const intro = Array.isArray(value[2]) ? '' : asText(value[2])
    const tasks = asRows(tasksRaw)
      .map((task) => asTask(task))
      .filter((task): task is HomeworkTask => Boolean(task))
    if (!title || tasks.length < 1) return null
    const sheet = {
      id: uid('hwsheet'),
      title,
      topic,
      intro: intro || `Тетрадь по ${(languageMeta(language).prep ?? languageMeta(language).label.toLowerCase())}.`,
      language,
      createdAt: Date.now(),
      tasks,
      drafts: {},
      marks: {},
      reviews: {},
    }
    return { ...sheet, tags: sheetTags(sheet) }
  }

  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  const tasks = Array.isArray(item.tasks)
    ? item.tasks.map((task) => asTask(task)).filter((task): task is HomeworkTask => Boolean(task))
    : []
  if (!title || tasks.length < 1) return null
  const sheet: HomeworkSheet = {
    id: typeof item.id === 'string' && item.id.trim() ? item.id : uid('hwsheet'),
    title,
    topic: typeof item.topic === 'string' && item.topic.trim() ? item.topic.trim() : 'Практика',
    intro:
      typeof item.intro === 'string' && item.intro.trim()
        ? item.intro.trim()
        : 'Выполните задания. Пишите аккуратно, как в школьной тетради.',
    language,
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    doneAt: typeof item.doneAt === 'number' ? item.doneAt : undefined,
    tasks,
    drafts: item.drafts && typeof item.drafts === 'object' ? (item.drafts as Record<string, string>) : {},
    marks: asMarks(item.marks),
    reviews: asNotes(item.reviews),
    tags: Array.isArray(item.tags)
      ? parseTags(item.tags.filter((tag): tag is string => typeof tag === 'string').join(','))
      : undefined,
    analysis: asAnalysis(item.analysis),
  }
  return { ...sheet, tags: sheet.tags?.length ? sheet.tags : sheetTags(sheet) }
}

export function readHomework(): HomeworkSheet[] {
  return getSnapshot()
    .homework.map((item) => asSheet(item, (item as HomeworkSheet).language ?? 'fr'))
    .filter((item): item is HomeworkSheet => Boolean(item))
}

export function saveHomework(sheet: HomeworkSheet) {
  const next = [sheet, ...readHomework().filter((item) => item.id !== sheet.id)]
  updateSnapshot({ homework: next })
  return next
}

export function deleteHomework(id: string) {
  const next = readHomework().filter((item) => item.id !== id)
  updateSnapshot({ homework: next })
  return next
}

export function homeworkById(id: string) {
  return readHomework().find((item) => item.id === id)
}

export function homeworkFor(language: Language) {
  return readHomework()
    .filter((item) => item.language === language)
    .sort((left, right) => right.createdAt - left.createdAt)
}

type HomeworkMemory = {
  lemmas: Set<string>
  stories: string[]
  meaningTerms: Set<string>
  passages: string[]
}

function emptyMemory(): HomeworkMemory {
  return { lemmas: new Set(), stories: [], meaningTerms: new Set(), passages: [] }
}

function recentHomeworkMemory(language: Language, limit = 3): HomeworkMemory {
  const memory = emptyMemory()
  for (const sheet of homeworkFor(language).slice(0, limit)) {
    for (const word of wordsFromSheet(sheet)) memory.lemmas.add(fold(word))
    for (const task of sheet.tasks) {
      if (task.kind === 'order') {
        const story = (task.text || task.answer || (task.items ?? []).join(' ')).trim()
        if (story) memory.stories.push(story.slice(0, 500))
      }
      if (task.kind === 'meanings' && task.text) memory.meaningTerms.add(fold(task.text))
      if (task.kind === 'passage' && task.text) memory.passages.push(fold(task.text).slice(0, 120))
    }
  }
  return memory
}

function pickFreshEntries(ready: WordEntry[], avoid: Set<string>, count: number) {
  const unused = shuffle(ready.filter((entry) => !avoid.has(fold(lemma(entry.term)))))
  if (unused.length >= count) return unused.slice(0, count)
  const used = shuffle(ready.filter((entry) => avoid.has(fold(lemma(entry.term)))))
  return [...unused, ...used].slice(0, Math.min(count, ready.length))
}

function storiesTooClose(next: string, previous: string[]) {
  const tokens = new Set(fold(next).split(' ').filter((word) => word.length > 3))
  if (tokens.size < 5) return false
  return previous.some((story) => {
    const have = fold(story).split(' ')
    const hit = [...tokens].filter((word) => have.includes(word)).length
    return hit / tokens.size >= 0.5
  })
}

function asMarks(value: unknown): Record<string, HomeworkMark> {
  if (!value || typeof value !== 'object') return {}
  const next: Record<string, HomeworkMark> = {}
  for (const [id, mark] of Object.entries(value as Record<string, unknown>)) {
    if (isMark(mark)) next[id] = mark
  }
  return next
}

function asNotes(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const next: Record<string, string> = {}
  for (const [id, note] of Object.entries(value as Record<string, unknown>)) {
    if (typeof note === 'string' && note.trim()) next[id] = note.trim().slice(0, 280)
  }
  return next
}

function asAnalysis(value: unknown): HomeworkAnalysis | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  const summary = typeof item.summary === 'string' ? item.summary.trim() : ''
  const problems = stringList(item.problems)
  const study = stringList(item.study)
  if (!summary && !problems.length && !study.length) return undefined
  return { summary, problems, study }
}

export function taskHint(task: HomeworkTask) {
  if (task.hint?.trim()) return task.hint.trim()
  if (task.kind === 'passage') return 'Переведите весь абзац. В отзыве разберём грамматику, не только слова.'
  if (task.kind === 'words') return 'Рядом с каждым словом напишите перевод. Подойдёт любое верное значение.'
  if (task.kind === 'into') return 'Напишите, как это сказать на языке тетради. Подойдёт близкий смысл.'
  if (task.kind === 'write') return 'Одна естественная фраза. Если есть список слов — все должны прозвучать.'
  if (task.kind === 'rows') return 'В каждой строке — предложение с тем словом, которое указано в номере строки.'
  if (task.kind === 'meanings') return 'Отметьте все подходящие переводы, не один.'
  if (task.kind === 'match') return 'Перетащите перевод к слову или нажмите карточку, затем строку.'
  if (task.kind === 'order') return 'Кусочки истории разрезаны по точкам. Расставьте их по порядку — текст соберётся обратно.'
  if (task.kind === 'translate') return 'Передайте смысл, не копируйте слова как есть.'
  if (task.kind === 'fill') return 'Можно вписать только слово или переписать всю фразу с пропуском.'
  if (task.kind === 'choose') return 'Отсеките вариант, который не подходит по смыслу.'
  return 'Найдите одно место, которое звучит неестественно.'
}

export function markPoints(mark?: HomeworkMark) {
  if (mark === 'ok') return 1
  if (mark === 'partial') return 0.75
  return 0
}

export function formatPoints(points: number) {
  const value = Math.round(points * 100) / 100
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')
}

export function isBlankDraft(task: HomeworkTask, draft: string) {
  if (task.kind === 'words' || task.kind === 'into' || task.kind === 'match') {
    return !Object.values(asStringMap(draft)).some((item) => item.trim())
  }
  if (task.kind === 'meanings') return asStringList(draft).every((item) => !item.trim())
  if (task.kind === 'rows') return padLines(draft, task.rows?.length ?? 5).every((item) => !item.trim())
  if (task.kind === 'order') return asStringList(draft).every((item) => !item.trim())
  return !draft.trim()
}

function looksLikePraise(note: string) {
  return /верн|принят|все (пары )?совпал|все на месте|балл полный|правильно/i.test(note)
}

function ratioMark(hit: number, total: number, missing: string[]): TaskCheck {
  if (total <= 0 || hit <= 0) return { mark: 'bad', points: 0, missing }
  if (hit === total) return { mark: 'ok', points: 1, missing: [] }
  if (total - hit === 1 || hit / total >= 0.6) return { mark: 'partial', points: 0.75, missing }
  return { mark: 'bad', points: 0, missing }
}

function splitStory(raw: string) {
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*#+\s.*/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []
  const parts = cleaned
    .split(/(?<=[.!?…])(?:\s+|$)/)
    .map((item) => item.replace(/^["«»]+|["«»]+$/g, '').trim())
    .filter((item) => /[\p{L}]/u.test(item) && item.length > 2)
  return parts.slice(0, 7)
}

export function assembleStory(parts: string[]) {
  return parts
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function appearingWords(text: string, words: string[]) {
  const hay = fold(text)
  return words.filter((word) => {
    const needle = fold(lemma(word))
    return needle.length >= 2 && hay.includes(needle)
  })
}

function orderFromChunks(chunks: string[], words: string[]): Pick<HomeworkTask, 'prompt' | 'text' | 'items' | 'options' | 'answer' | 'requiredWords' | 'hint' | 'explanation' | 'tags'> {
  const items = chunks.filter(Boolean)
  const text = assembleStory(items)
  return {
    prompt: 'Расставьте кусочки истории по порядку. Они разрезаны по точкам — соберите рассказ заново.',
    text,
    items,
    options: shuffle([...items]),
    answer: text,
    requiredWords: appearingWords(text, words),
    hint: 'Перетаскивайте фразы. Галочка — кусок на своём месте. Когда всё верно, история появится целиком внизу.',
    explanation: 'Алгоритм сверяет собранный текст с исходной историей.',
    tags: [KIND_TAG.order, 'текст'],
  }
}

function packIndex(seed: string, count: number) {
  const text = String(seed)
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return count ? (hash >>> 0) % count : 0
}

function stuffedSentence(text: string, words: string[]) {
  const value = fold(text)
  if (
    /this morning i pick up|in the kitchen i put .+ on the table|later i really need|at the park i look for|in the evening i think about|at school i see|a friend gives me|then we talk about|after class i forget|at last i find|on the trip i buy|on the train i pack|suddenly i need|when we arrive i ask for|the last thing i remember|tomorrow i try .+ again|and i do not forget/.test(
      value,
    )
  ) {
    return true
  }
  if (
    /ce matin je prends|dans la cuisine je mets .+ sur la table|plus tard j ai besoin de|au parc je cherche|le soir je pense a|a l ecole je vois|un ami me donne|ensuite nous parlons de|apres le cours j oublie|finalement je retrouve|en voyage j achete|dans le train je range|soudain j ai besoin de|a l arrivee je demande|le dernier souvenir est|et je n oublie pas|demain encore /.test(
      value,
    )
  ) {
    return true
  }
  if (
    /heute morgen nehme ich|in der kuche lege ich .+ auf den tisch|spater brauche ich|im park suche ich|am abend denke ich an|in der schule sehe ich|ein freund gibt mir|dann sprechen wir uber|nach dem unterricht vergesse ich|zum schluss finde ich|auf der reise kaufe ich|im zug packe ich|plotzlich brauche ich|bei der ankunft frage ich nach|die letzte erinnerung ist|und ich vergesse .+ nicht|morgen wieder /.test(
      value,
    )
  ) {
    return true
  }
  const tokens = value.split(' ').filter(Boolean)
  if (tokens.length > 9) return false
  return words.some((word) => {
    const needle = fold(lemma(word))
    return needle.length >= 4 && tokens.at(-1) === needle && /^(i|je|ich|this|ce|heute)\b/.test(value)
  })
}

function isStuffedStory(chunks: string[], words: string[]) {
  if (chunks.length < 3) return true
  const hits = chunks.filter((item) => stuffedSentence(item, words)).length
  return hits >= Math.ceil(chunks.length * 0.5)
}

function isUsableStory(chunks: string[], words: string[] = []) {
  if (chunks.length < 4 || chunks.length > 6) return false
  if (chunks.some((item) => item.length < 16 || item.length > 180)) return false
  if (new Set(chunks.map((item) => fold(item))).size < chunks.length) return false
  return !isStuffedStory(chunks, words)
}

function isWeakOrder(task: HomeworkTask) {
  if (task.kind !== 'order') return false
  const items = task.items ?? splitStory(task.text || task.answer || '')
  if (items.length < 4) return true
  return isStuffedStory(items, task.requiredWords ?? [])
}

async function improviseStory(language: Language, words: string[], avoidStories: string[] = [], retry = false) {
  const meta = languageMeta(language)
  const list = words.filter(isVocabToken).slice(0, 4)
  const seed = `${Date.now() % 997}-${list.join('-')}`
  const raw = await askGemini(
    [
      `Write a tiny anecdote in ${meta.native}. Exactly 4 or 5 sentences.`,
      'It is ONE story: a person, a place, something that goes wrong or changes, and an ending.',
      'Sentences must connect (then, so, but, after that). Not a list of unrelated actions.',
      'Do not write "I see X. I take X. I need X." Never drop a vocabulary word in as the object of a dummy verb.',
      list.length
        ? `You may use at most two of these words, and only if they truly fit: ${list.join(', ')}. Skip the rest.`
        : '',
      retry ? 'The previous draft was a word list, not a story. Write a real scene with cause and result.' : '',
      avoidStories.length
        ? `Do NOT repeat these previous stories — different place, people, and events:\n${avoidStories.slice(0, 2).join('\n---\n')}`
        : '',
      'Every sentence ends with a period. No questions, quotes, title, or numbering.',
      `Variation token: ${seed}`,
      'Output only the story.',
    ]
      .filter(Boolean)
      .join('\n'),
    [{ role: 'user', text: retry ? `Anecdote, not a vocab drill. ${seed}` : `${list.join(', ') || 'everyday life'} · ${seed}` }],
    { maxTokens: 500, temperature: retry ? 0.7 : 0.9, timeoutMs: LLM_BUDGET.homework.timeoutMs },
  )
  return splitStory(raw)
}

function orderStory(language: Language, seed = 'story') {
  const fr = [
    [
      'Léa rate le bus sous la pluie.',
      'Elle entre dans un café pour se sécher.',
      'Le serveur lui apporte un chocolat chaud.',
      'Elle appelle un ami et explique le retard.',
      'Quand le ciel se calme, elle repart à pied.',
    ],
    [
      'Marc cherche ses clés avant le travail.',
      'Il vide le sac et regarde sous la table.',
      'Il ne trouve rien du tout.',
      'Sa sœur rit et montre le crochet près de la porte.',
      'Il part enfin, un peu en retard mais soulagé.',
    ],
    [
      'Au marché du matin Anna achète des tomates.',
      'Une voisine lui parle d’une soupe simple.',
      'À la maison Anna coupe tout sans recette.',
      'Le parfum remplit la cuisine.',
      'Le soir toute la famille se ressert.',
    ],
    [
      'Paul prend le train pour voir sa tante.',
      'Près de la fenêtre il lit la même page trop longtemps.',
      'Un contrôleur lui demande son billet.',
      'Paul le trouve au fond de la poche.',
      'À l’arrivée sa tante l’attend avec du thé.',
    ],
    [
      'Un chien court après une balle dans le parc.',
      'La balle tombe trop près de l’eau.',
      'Le chien revient tout mouillé.',
      'Les enfants rient et le séchent avec une serviette.',
      'Ensuite tout le monde rentre lentement.',
    ],
    [
      'Clara arrive en classe sans cahier.',
      'Elle emprunte une feuille à son voisin.',
      'Le professeur pose une question difficile.',
      'Clara écrit une réponse courte et claire.',
      'À la fin du cours elle remercie le voisin.',
    ],
  ]
  const de = [
    [
      'Lea verpasst den Bus im Regen.',
      'Sie geht in ein Café, um sich zu wärmen.',
      'Der Kellner bringt ihr heiße Schokolade.',
      'Sie ruft einen Freund an und erklärt die Verspätung.',
      'Als der Himmel ruhiger wird, geht sie zu Fuß weiter.',
    ],
    [
      'Marc sucht vor der Arbeit seine Schlüssel.',
      'Er leert die Tasche und schaut unter den Tisch.',
      'Er findet dort gar nichts.',
      'Seine Schwester lacht und zeigt auf den Haken an der Tür.',
      'Er geht endlich, etwas spät, aber erleichtert.',
    ],
    [
      'Am Morgen kauft Anna auf dem Markt Tomaten.',
      'Eine Nachbarin erzählt von einer einfachen Suppe.',
      'Zu Hause schneidet Anna alles ohne Rezept.',
      'Der Duft füllt die Küche.',
      'Am Abend holt sich die ganze Familie Nachschlag.',
    ],
    [
      'Paul nimmt den Zug zu seiner Tante.',
      'Am Fenster liest er dieselbe Seite zu lange.',
      'Ein Schaffner will seine Fahrkarte sehen.',
      'Paul findet sie ganz unten in der Tasche.',
      'Ankunft: die Tante wartet schon mit Tee.',
    ],
    [
      'Ein Hund rennt im Park hinter einem Ball her.',
      'Der Ball fällt zu nah ans Wasser.',
      'Der Hund kommt ganz nass zurück.',
      'Die Kinder lachen und trocknen ihn mit einem Handtuch.',
      'Danach gehen alle langsam nach Hause.',
    ],
    [
      'Clara kommt ohne Heft in den Unterricht.',
      'Sie borgt sich ein Blatt von ihrem Nachbarn.',
      'Der Lehrer stellt eine schwere Frage.',
      'Clara schreibt eine kurze, klare Antwort.',
      'Am Ende dankt sie dem Nachbarn.',
    ],
  ]
  const en = [
    [
      'Lea misses the bus in the rain.',
      'She steps into a café to get dry.',
      'The waiter brings her a hot chocolate.',
      'She calls a friend and explains why she is late.',
      'When the sky calms down, she walks the rest of the way.',
    ],
    [
      'Marc looks for his keys before work.',
      'He empties the bag and checks under the table.',
      'He finds nothing there at all.',
      'His sister laughs and points to the hook by the door.',
      'He leaves at last, a little late but relieved.',
    ],
    [
      'In the morning Anna buys tomatoes at the market.',
      'A neighbour tells her about a simple soup.',
      'At home Anna cuts everything without a recipe.',
      'The smell fills the kitchen.',
      'In the evening the whole family asks for more.',
    ],
    [
      'Paul takes the train to visit his aunt.',
      'By the window he reads the same page for too long.',
      'A conductor asks for his ticket.',
      'Paul finds it at the bottom of his pocket.',
      'On arrival his aunt is already waiting with tea.',
    ],
    [
      'A dog runs after a ball in the park.',
      'The ball falls too close to the water.',
      'The dog comes back soaking wet.',
      'The children laugh and dry him with a towel.',
      'Then everybody walks home slowly.',
    ],
    [
      'Clara arrives in class without a notebook.',
      'She borrows a sheet from the person next to her.',
      'The teacher asks a hard question.',
      'Clara writes a short, clear answer.',
      'After class she thanks her neighbour.',
    ],
  ]
  const packs = language === 'fr' ? fr : language === 'de' ? de : en
  return packs[packIndex(seed, packs.length)]
}

function isVocabToken(value: string) {
  const term = lemma(value)
  if (term.length < 2 || term.length > 28) return false
  if (/[.!?;:]/.test(term)) return false
  return term.split(' ').length <= 3
}

function wordsFromSheet(sheet: HomeworkSheet) {
  const fromTasks = sheet.tasks.flatMap((task) => {
    if (task.kind === 'words') return task.items ?? []
    if (task.kind === 'into') return task.answers ?? []
    if (task.kind === 'match') return task.pairs?.map((pair) => pair.left) ?? []
    if (task.kind === 'meanings' && task.text) return [task.text]
    if (task.kind === 'rows') return task.rows ?? []
    if (task.kind === 'order') return (task.requiredWords ?? []).filter(isVocabToken)
    return []
  })
  return [...new Set(fromTasks.map((item) => lemma(item.trim())).filter(isVocabToken))].slice(0, 6)
}

export function sanitizeHomeworkReview(sheet: HomeworkSheet): HomeworkSheet {
  const marks = { ...sheet.marks }
  const reviews = { ...sheet.reviews }
  let changed = false
  for (const task of sheet.tasks) {
    const draft = sheet.drafts[task.id] ?? ''
    const blank = isBlankDraft(task, draft)
    if (blank) {
      if (!marks[task.id]) continue
      if (marks[task.id] !== 'bad') {
        marks[task.id] = 'bad'
        changed = true
      }
      const honest = explainTaskCheck(task, draft)
      if (reviews[task.id] !== honest) {
        reviews[task.id] = honest
        changed = true
      }
      continue
    }
    if (task.kind === 'match' || task.kind === 'meanings') {
      if (!marks[task.id] && !sheet.doneAt) continue
      const result = checkTaskResult(task, draft)
      const note = explainTaskCheck(task, draft)
      if (marks[task.id] !== result.mark || reviews[task.id] !== note) {
        marks[task.id] = result.mark
        reviews[task.id] = note
        changed = true
      }
      continue
    }
    if (marks[task.id] === 'bad' && looksLikePraise(reviews[task.id] ?? '')) {
      reviews[task.id] = explainTaskCheck(task, draft)
      changed = true
    }
  }
  if (!changed) return sheet
  const next = { ...sheet, marks, reviews }
  return { ...next, analysis: sheet.analysis || sheet.doneAt ? buildAnalysis(next) : sheet.analysis }
}

export function polishHomeworkSheet(sheet: HomeworkSheet): HomeworkSheet {
  const words = wordsFromSheet(sheet)
  const drafts = { ...sheet.drafts }
  let touched = false
  const withoutFill = sheet.tasks.filter((task) => task.kind !== 'fill')
  if (withoutFill.length !== sheet.tasks.length) {
    touched = true
    for (const task of sheet.tasks) {
      if (task.kind === 'fill') delete drafts[task.id]
    }
  }
  const tasks = withoutFill.map((task) => {
    if (isWeakOrder(task)) {
      touched = true
      const story = orderFromChunks(splitStory(orderStory(sheet.language, sheet.id).join(' ')), words)
      delete drafts[task.id]
      return {
        ...task,
        ...story,
      }
    }
    if (task.kind === 'order' && !task.requiredWords?.length && words.length) {
      touched = true
      return { ...task, requiredWords: words.slice(0, task.items?.length || words.length) }
    }
    return task
  })
  const next = touched ? { ...sheet, tasks, drafts } : sheet
  return sanitizeHomeworkReview(next)
}

function shownChoices(task: HomeworkTask) {
  if (task.options?.length) return task.options
  if (task.pairs?.length) return task.pairs.map((pair) => pair.right)
  return []
}

function sameChoice(left: string, right: string) {
  if (!left.trim() || !right.trim()) return false
  return fold(left) === fold(right) || lemmaMatches(left, right) || lemmaMatches(right, left)
}

function isShown(choice: string, shown: string[]) {
  return shown.some((item) => sameChoice(choice, item))
}

function extraSenses(term: string) {
  const key = fold(term.split(/[/\s]/)[0] ?? term)
  const fromMaps = Object.values(EXTRA_SENSES).flatMap((map) => map?.[key] ?? [])
  if (key === 'get') return [...fromMaps, 'добиваться', 'добираться']
  return fromMaps
}

function officialSenses(term: string, official: string) {
  return [...new Set([...glosses(official), official.trim(), ...extraSenses(term)].filter(Boolean))]
}

function oneSwap(current: string[], expected: string[]) {
  if (current.length !== expected.length) return false
  const folded = current.map((item) => fold(item))
  const want = expected.map((item) => fold(item))
  if (folded.every((item, index) => item === want[index])) return false
  const differs = folded.map((_, index) => index).filter((index) => folded[index] !== want[index])
  if (differs.length !== 2) return false
  const [a, b] = differs
  return Math.abs(a - b) === 1 && folded[a] === want[b] && folded[b] === want[a]
}

export function checkTaskResult(task: HomeworkTask, draft: string): TaskCheck {
  if (isBlankDraft(task, draft)) {
    const missing =
      task.kind === 'words'
        ? task.items ?? []
        : task.kind === 'match'
          ? (task.pairs ?? []).map((pair) => pair.left)
          : task.kind === 'rows'
            ? task.rows ?? requiredWordsOf(task)
            : requiredWordsOf(task)
    return { mark: 'bad', points: 0, missing }
  }

  if (task.kind === 'meanings') {
    const shown = shownChoices(task)
    const listed = task.answers?.length ? task.answers : glosses(task.answer)
    const required = listed.filter((item) => !shown.length || isShown(item, shown))
    const picked = asStringList(draft).filter(Boolean)
    const extra = picked.filter((item) => !required.some((good) => sameChoice(item, good)))
    const miss = required.filter((item) => !picked.some((choice) => sameChoice(choice, item)))
    if (!picked.length) return { mark: 'bad', points: 0, missing: required }
    if (!required.length) return { mark: 'ok', points: 1, missing: [] }
    if (!extra.length && !miss.length) return { mark: 'ok', points: 1, missing: [] }
    if (extra.length + miss.length === 1) return { mark: 'partial', points: 0.75, missing: miss }
    return ratioMark(required.length - miss.length, required.length, miss)
  }

  if (task.kind === 'match') {
    const pairs = task.pairs?.length
      ? task.pairs
      : (task.items ?? []).map((left, index) => ({ left, right: task.answers?.[index] ?? '' }))
    const map = asStringMap(draft)
    const shown = shownChoices(task)
    const solvable = pairs.filter((pair) => officialSenses(pair.left, pair.right).some((sense) => isShown(sense, shown)))
    const miss = solvable
      .filter((pair) => {
        const placed = map[pair.left] ?? ''
        if (!placed.trim()) return true
        return !officialSenses(pair.left, pair.right).some((sense) => sameChoice(placed, sense))
      })
      .map((pair) => pair.left)
    if (!solvable.length) return { mark: 'ok', points: 1, missing: [] }
    return ratioMark(solvable.length - miss.length, solvable.length, miss)
  }

  if (task.kind === 'order') {
    const expected = task.items?.length ? task.items : splitStory(task.text || task.answer || '')
    const current = asStringList(draft)
    if (!expected.length || !current.length) return { mark: 'bad', points: 0, missing: [] }
    const assembled = assembleStory(current)
    const original = assembleStory(expected) || task.answer || task.text || ''
    if (fold(assembled) === fold(original)) return { mark: 'ok', points: 1, missing: [] }
    const same = current.length === expected.length && current.every((item, index) => fold(item) === fold(expected[index]))
    if (same) return { mark: 'ok', points: 1, missing: [] }
    const hits = current.filter((item, index) => fold(item) === fold(expected[index] ?? '')).length
    const ends =
      fold(current[0] ?? '') === fold(expected[0] ?? '') &&
      fold(current[current.length - 1] ?? '') === fold(expected[expected.length - 1] ?? '')
    if (oneSwap(current, expected) || (ends && hits >= expected.length - 2)) {
      return { mark: 'partial', points: 0.75, missing: [] }
    }
    return { mark: 'bad', points: 0, missing: [] }
  }

  if (task.kind === 'rows') {
    const words = task.rows?.length ? task.rows : requiredWordsOf(task)
    const lines = padLines(draft, Math.max(words.length, 5))
    const miss = words.filter((word, index) => !hasRequiredWord(lines[index] ?? '', word) || (lines[index] ?? '').trim().length < 8)
    if (!words.length) return { mark: 'bad', points: 0, missing: [] }
    if (!miss.length) return { mark: 'ok', points: 1, missing: [] }
    if (miss.length === 1) return { mark: 'partial', points: 0.75, missing: miss }
    return { mark: 'bad', points: 0, missing: miss }
  }

  if (task.kind === 'words' || task.kind === 'into') {
    const terms = task.items?.length ? task.items : (task.text ?? '').split(/\n|,/).map((item) => item.trim()).filter(Boolean)
    const keys = task.answers?.length ? task.answers : task.answer.split('|').map((item) => item.trim()).filter(Boolean)
    const map = asStringMap(draft)
    const miss = terms.filter((term, index) => {
      const guess = map[term] ?? ''
      if (!guess.trim()) return true
      if (lemmaMatches(guess, keys[index] ?? task.answer)) return false
      if (officialSenses(term, keys[index] ?? task.answer).some((sense) => sameChoice(guess, sense))) return false
      const termRu = /[а-яё]/i.test(term)
      const guessRu = /[а-яё]/i.test(guess)
      return termRu === guessRu || guess.split(/\s+/).length > 6
    })
    if (!terms.length) return { mark: 'bad', points: 0, missing: [] }
    return ratioMark(terms.length - miss.length, terms.length, miss)
  }

  const required = requiredWordsOf(task)
  const missing = required.length ? missingRequiredWords(task, draft) : []
  const writeOpen = task.kind === 'write' && !task.answer && !task.answers?.length

  if (writeOpen || (task.kind === 'write' && required.length)) {
    if (draft.trim().length < 8) return { mark: 'bad', points: 0, missing: required.length ? missing : [] }
    if (required.length && missing.length === 0) return { mark: 'ok', points: 1, missing: [] }
    if (required.length && missing.length === 1) return { mark: 'partial', points: 0.75, missing }
    if (required.length && missing.length > 1) return { mark: 'bad', points: 0, missing }
    return { mark: 'ok', points: 1, missing: [] }
  }

  if (task.kind === 'passage' || (isLongTask(task) && task.kind === 'translate')) {
    const raw = draft.trim()
    if (raw.length < 12) return { mark: 'bad', points: 0, missing }
    const guess = fold(raw)
    const source = fold(task.text ?? '')
    const copied = Boolean(source) && (source.includes(guess) || guess.includes(source.slice(0, 48)))
    const hasRu = /[а-яё]/i.test(raw)
    if (copied && !hasRu) return { mark: 'bad', points: 0, missing }
    if (task.answer) {
      const words = fold(task.answer).split(' ').filter((word) => word.length > 2)
      const have = new Set(guess.split(' '))
      const hit = words.filter((word) => have.has(word)).length
      if (words.length && hit >= Math.max(3, Math.floor(words.length * 0.25))) {
        return { mark: 'ok', points: 1, missing: [] }
      }
    }
    if (hasRu && raw.split(/\s+/).length >= 5) return { mark: 'partial', points: 0.75, missing }
    return { mark: 'bad', points: 0, missing }
  }

  const expected = [task.answer, ...(task.answers ?? [])].filter(Boolean).join(' / ')
  const ok =
    task.kind === 'fill'
      ? fillMatches(task, draft)
      : task.kind === 'translate' || task.kind === 'choose'
        ? lemmaMatches(draft, expected)
        : matchesAnswer(draft, expected)
  if (!ok) return { mark: 'bad', points: 0, missing }
  if (missing.length === 1) return { mark: 'partial', points: 0.75, missing }
  if (missing.length > 1) return { mark: 'bad', points: 0, missing }
  return { mark: 'ok', points: 1, missing: [] }
}

export function checkTask(task: HomeworkTask, draft: string) {
  return checkTaskResult(task, draft).mark === 'ok'
}

function bareLemma(value: string) {
  return fold(value).replace(/^(the|a|an|le|la|les|l|un|une|des|der|die|das|ein|eine|einen)\s+/, '')
}

function lemmaMatches(input: string, expected: string) {
  const guess = bareLemma(input)
  if (!guess) return false
  const keys = answersOf(expected).map((item) => bareLemma(item)).filter(Boolean)
  if (keys.some((key) => key === guess || key.includes(guess) || guess.includes(key))) return true
  const tokens = fold(input).split(' ').filter(Boolean)
  return keys.some((key) => tokens.includes(key))
}

function blankPattern() {
  return /___+|…{2,}|\.{3,}|\[[.\s_]*\]/
}

function filledSentence(task: HomeworkTask, word = task.answer) {
  const text = task.text?.trim() ?? ''
  if (!text || !word.trim() || !blankPattern().test(text)) return ''
  return text.replace(blankPattern(), word.trim()).replace(/\s+/g, ' ').trim()
}

function fillMatches(task: HomeworkTask, draft: string) {
  const guess = fold(draft)
  if (!guess) return false
  const keys = [task.answer, ...(task.answers ?? [])].filter(Boolean)
  if (keys.some((key) => matchesAnswer(draft, key))) return true
  return keys.some((key) => {
    const complete = fold(filledSentence(task, key))
    if (complete && (guess === complete || complete.includes(guess) && guess.includes(fold(key)))) return true
    return Boolean(complete && guess.includes(fold(key)) && guess.split(' ').length >= complete.split(' ').length - 1)
  })
}

function cueOf(task: HomeworkTask) {
  return task.text?.replace(/\s+/g, ' ').trim() || ''
}

export function explainTaskCheck(task: HomeworkTask, draft: string) {
  const { mark, missing } = checkTaskResult(task, draft)
  const answer = task.answer.trim()
  const guess = draft.trim()
  const cue = cueOf(task)
  const stored = task.explanation?.replace(/\s+/g, ' ').trim() ?? ''
  const short = stored.length > 0 && stored.length <= 160 ? stored : ''

  if (isBlankDraft(task, draft)) {
    if (task.kind === 'passage' || task.kind === 'translate') return 'Перевода нет — балла нет.'
    if (task.kind === 'words') return 'Таблица пустая — переводов нет, балла нет.'
    if (task.kind === 'into') return 'Таблица пустая — перевода на язык тетради нет, балла нет.'
    if (task.kind === 'match') return 'Пары не собраны — балла нет.'
    if (task.kind === 'meanings') return 'Ничего не отмечено — балла нет.'
    if (task.kind === 'rows') return 'Строки пустые — балла нет.'
    if (task.kind === 'fill') return 'Пропуск не заполнен — балла нет.'
    return 'Ответа нет — балла нет.'
  }

  if (task.kind === 'meanings') {
    const keys = (task.answers?.length ? task.answers : answersOf(task.answer)).join(', ')
    if (mark === 'ok') return short || `Верные значения: ${keys}.`
    if (mark === 'partial') return `Почти. Нужные значения: ${keys}.`
    return `Отметьте все подходящие смыслы: ${keys}.`
  }

  if (task.kind === 'match') {
    if (mark === 'ok') return short || 'Все пары совпали.'
    if (mark === 'partial' && missing.length) {
      return `Почти: не на месте ${missing.map((word) => `«${word}»`).join(', ')}.`
    }
    if (missing.length) return `Не на месте: ${missing.map((word) => `«${word}»`).join(', ')}. Балла нет.`
    return 'Перетащите каждый перевод к своему слову.'
  }

  if (task.kind === 'order') {
    if (mark === 'ok') return short || 'История собралась — порядок совпал с исходным текстом.'
    if (mark === 'partial') return 'Почти: поменяйте местами соседние кусочки, тогда текст сойдётся.'
    return 'Соберите историю по точкам: кусочки должны снова стать целым рассказом.'
  }

  if (task.kind === 'rows') {
    if (mark === 'ok') return short || 'В каждой строке есть своё слово и целая фраза.'
    if (mark === 'partial') return `В одной строке нет слова «${missing[0]}» или фраза слишком короткая.`
    if (missing.length) return `Проверьте строки со словами: ${missing.map((word) => `«${word}»`).join(', ')}.`
    return 'Нужны пять целых предложений — по слову на строку.'
  }

  if (task.kind === 'words' || task.kind === 'into') {
    if (mark === 'ok') return short || 'Переводы слов приняты.'
    if (mark === 'partial' && missing.length) {
      return `Почти. Ещё раз: ${missing.map((word) => `«${word}»`).join(', ')}.`
    }
    if (missing.length) return `Нет перевода для: ${missing.map((word) => `«${word}»`).join(', ')}. Балла нет.`
    return 'Напишите перевод рядом с каждым словом.'
  }

  if (task.kind === 'passage') {
    if (mark === 'ok') return short || 'Смысл абзаца передан. Грамматику смотрите в отзыве после сдачи.'
    if (mark === 'partial') return 'Смысл в целом понятен, но перевод ещё сырой — 0.75. Допишите связнее.'
    return 'Нужен связный перевод абзаца на русский, не пустая строка и не копия английского.'
  }

  if (task.kind === 'write' || requiredWordsOf(task).length) {
    if (mark === 'ok') return short || 'Все заданные слова есть в фразе — балл полный.'
    if (mark === 'partial') return `Нет слова «${missing[0]}», поэтому 0.75, не 1.`
    if (guess.length < 8) return 'Нужна одна целая фраза, не набор слов.'
    if (missing.length) return `В ответе нет: ${missing.map((word) => `«${word}»`).join(', ')}.`
  }

  if (task.kind === 'choose') {
    if (mark === 'ok') return short || (cue ? `«${answer}» подходит к «${cue}».` : `Верный вариант — «${answer}».`)
    return `Верно «${answer}»${cue ? ` к «${cue}»` : ''}.${guess ? ` «${guess}» — нет.` : ''}`
  }

  if (task.kind === 'translate') {
    if (mark === 'ok') return short || (cue ? `«${cue}» — это «${answer}».` : `Да, так: «${answer}».`)
    return cue ? `«${cue}» переводится «${answer}».` : `Нужно «${answer}».`
  }

  if (task.kind === 'fill') {
    if (mark === 'ok') return short || `В пропуск идёт «${answer}».`
    return `В пропуск нужна форма «${answer}».${guess ? ` Не «${guess}».` : ''}`
  }

  if (task.kind === 'correct') {
    if (mark === 'ok') return short || `Исправленный вариант: «${answer}».`
    return answer ? `Правильно так: «${answer}».` : 'В этой фразе нужно поправить ошибку.'
  }

  if (mark === 'ok') return short || (answer ? `Подходит «${answer}».` : 'Ответ принят.')
  return answer ? `Ожидается «${answer}».` : 'Ответ не совпал с ключом.'
}

export function sheetScore(sheet: HomeworkSheet) {
  const checked = sheet.tasks.filter((task) => sheet.marks[task.id])
  const ok = checked.filter((task) => sheet.marks[task.id] === 'ok').length
  const partial = checked.filter((task) => sheet.marks[task.id] === 'partial').length
  const points = sheet.tasks.reduce((sum, task) => sum + markPoints(sheet.marks[task.id]), 0)
  return { ok, partial, checked: checked.length, total: sheet.tasks.length, points }
}

export function sheetErrors(sheet: HomeworkSheet) {
  return sheet.tasks
    .map((task) => {
      const mark = sheet.marks[task.id]
      if (mark !== 'bad' && mark !== 'partial') return null
      const draft = sheet.drafts[task.id] ?? ''
      const missing = missingRequiredWords(task, draft)
      return {
        task,
        mark,
        draft,
        missing,
        points: markPoints(mark),
        review: sheet.reviews[task.id] ?? '',
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
}

export function errorHomeworkWish(sheet: HomeworkSheet) {
  const analysis = sheet.analysis ?? buildAnalysis(sheet)
  const errors = sheetErrors(sheet)
  const words = [
    ...new Set(
      errors.flatMap((item) => {
        const fromTask = [
          ...(item.missing ?? []),
          ...requiredWordsOf(item.task),
          ...(item.task.items ?? []),
          ...(item.task.rows ?? []),
          item.task.text && item.task.kind === 'meanings' ? item.task.text : '',
        ]
        return fromTask.filter(Boolean)
      }),
    ),
  ]
  const focus = words.slice(0, 8).join(', ')
  const study = analysis.study.slice(0, 3).join(' ')
  const hint = skillProfileFor(sheet.language).homeworkHint
  if (focus) {
    return `Новое задание на слабые места, слова ${focus}. ${study} ${hint ? `${hint}. ` : ''}Снова: абзац, перевод слов, несколько значений, пары, порядок предложений и пять строк.`
  }
  return `Новое задание на слабые стороны. ${study || analysis.summary}${hint ? ` ${hint}.` : ''} Снова полный набор: абзац, слова, значения, пары, порядок, пять строк.`
}

export function buildAnalysis(sheet: HomeworkSheet): HomeworkAnalysis {
  const score = sheetScore(sheet)
  const errors = sheetErrors(sheet)
  if (!errors.length) {
    return {
      summary: `Тетрадь сдана: ${formatPoints(score.points)} из ${score.total}. Существенных ошибок нет.`,
      problems: [],
      study: [
        'Повторите слова с полки вслух и ещё раз сопоставьте пары.',
        'Напишите два новых предложения на ту же тему — так закрепляется порядок слов.',
      ],
    }
  }

  const problems = errors.map((item) => {
    const note = item.review?.trim() || explainTaskCheck(item.task, item.draft)
    return `${kindLabel(item.task.kind)}: ${note}`
  })

  const weakWords = [
    ...new Set(errors.flatMap((item) => (item.missing.length ? item.missing : requiredWordsOf(item.task)))),
  ].slice(0, 8)
  const weakKinds = [...new Set(errors.map((item) => item.task.kind))]
  const study: string[] = []
  if (weakKinds.includes('passage') || weakKinds.includes('translate')) {
    study.push('Перечитайте абзац и выпишите 2 грамматические формы, которые сбивают (время, артикль, порядок слов).')
  }
  if (weakKinds.includes('meanings') || weakKinds.includes('words') || weakKinds.includes('match')) {
    study.push(
      weakWords.length
        ? `Подучите значения: ${weakWords.join(', ')}. Для многозначных слов запишите по 2 смысла.`
        : 'Повторите переводы слов с полки и лишние значения отсеките.',
    )
  }
  if (weakKinds.includes('order')) {
    study.push('Соберите короткий рассказ из 4 фраз: сначала / потом / после этого / в конце.')
  }
  if (weakKinds.includes('rows') || weakKinds.includes('write') || weakKinds.includes('fill')) {
    study.push('Составьте свои предложения по одному слову на строку — без набора слов вразброс.')
  }
  if (!study.length) {
    study.push(weakWords.length ? `Повторите: ${weakWords.join(', ')}.` : 'Разберите отзывы по заданиям и закройте одно слабое место.')
  }

  return {
    summary: `Результат: ${formatPoints(score.points)} из ${score.total}. Слабые места: ${weakKinds.map(kindLabel).join(', ').toLowerCase()}.`,
    problems,
    study,
  }
}

export function isLongTask(task: HomeworkTask) {
  const source = `${task.text ?? ''} ${task.answer ?? ''}`
  return task.kind === 'passage' || task.kind === 'write' || source.length >= 90 || source.includes('\n')
}

function lemma(term: string) {
  return term.split('/')[0].replace(/\s+/g, ' ').trim()
}

function isHomeworkWord(entry: WordEntry) {
  const term = lemma(entry.term)
  const translation = entry.translation?.trim() ?? ''
  if (!term || !translation) return false
  if (/[?]/.test(term) || /[?]/.test(translation)) return false
  if (term.split(' ').length > 3 || translation.split(' ').length > 4) return false
  return /[а-яё]/i.test(translation) && /[a-zäöüßàâéèêëïîôùûçæœ]/i.test(term)
}

function homeworkPool(files: WordFile[]) {
  const preferred = files.filter((file) => file.kind === 'words' || file.kind === 'cards')
  const source = preferred.length ? preferred : files
  return source.flatMap((file) => file.entries).filter(isHomeworkWord)
}

function homeworkTopic(wish: string, fallback: string) {
  const cleaned = wish
    .replace(/^(дай|дайте|сделай|сделайте|выдай|создай|создайте|собери|хочу|нужно)\s+(мне\s+)?/i, '')
    .replace(/^(домашн\w*|домашк\w*|тетрад\w*|д[/.]?з|homework)\s*(по|про|на|:)?\s*/i, '')
    .trim()
  if (!cleaned || cleaned.length < 3 || wantsHomework(cleaned)) return fallback
  return cleaned.slice(0, 48)
}

const EXTRA_SENSES: Partial<Record<Language, Record<string, string[]>>> = {
  en: {
    get: ['получать', 'взять', 'добираться', 'добиваться', 'понимать'],
    take: ['брать', 'занимать', 'принимать'],
    make: ['делать', 'заставлять'],
    set: ['ставить', 'набор'],
    run: ['бежать', 'управлять'],
    put: ['класть', 'ставить'],
  },
  fr: {
    faire: ['делать', 'изготовлять'],
    prendre: ['брать', 'занимать'],
    passer: ['проходить', 'проводить'],
    mettre: ['класть', 'надевать'],
  },
  de: {
    machen: ['делать', 'совершать'],
    nehmen: ['брать', 'принимать'],
    werden: ['становиться'],
    setzen: ['ставить', 'сажать'],
  },
}

const MEANING_DECOYS = ['хотеть', 'читать', 'дразнить', 'спать', 'красный', 'вчера', 'тихо']

function storyLine(language: Language, term: string, index: number) {
  if (language === 'fr') {
    const lines = [
      `Je vois ${term}.`,
      `Ensuite j'utilise ${term}.`,
      `Après ça j'ai besoin de ${term}.`,
      `Puis je cherche ${term}.`,
      `Enfin je me souviens de ${term}.`,
    ]
    return lines[index % lines.length]
  }
  if (language === 'de') {
    const lines = [
      `Ich sehe ${term}.`,
      `Dann benutze ich ${term}.`,
      `Danach brauche ich ${term}.`,
      `Später suche ich ${term}.`,
      `Zum Schluss erinnere ich mich an ${term}.`,
    ]
    return lines[index % lines.length]
  }
  const lines = [
    `I see ${term}.`,
    `Then I use ${term}.`,
    `After that I need ${term}.`,
    `Later I look for ${term}.`,
    `Finally I remember ${term}.`,
  ]
  return lines[index % lines.length]
}

function focusTermsFromWish(wish: string) {
  const match = wish.match(/слова(?:ми)?\s+(.+?)(?:\.|$)/i)
  if (!match?.[1]) return []
  return match[1]
    .split(/[,;]| и /i)
    .map((item) => fold(item))
    .filter((item) => item.length >= 2)
    .slice(0, 10)
}

function glosses(translation: string) {
  return translation
    .split(/[/;,]| или /i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
}

function meaningsFor(language: Language, entry: WordEntry) {
  const term = lemma(entry.term)
  const fromShelf = glosses(entry.translation ?? '')
  const extra = EXTRA_SENSES[language]?.[fold(term)] ?? []
  const good = [...new Set([...extra, ...fromShelf])].filter(Boolean).slice(0, 4)
  if (good.length < 2 && entry.translation) good.push(entry.translation.split(/[/;,]/)[0].trim())
  return { term, good: [...new Set(good)].filter(Boolean).slice(0, 4) }
}

function localTasks(language: Language, entries: WordEntry[], wish = '', memory: HomeworkMemory = emptyMemory()): HomeworkTask[] {
  const ready = entries.filter(isHomeworkWord)
  const meta = languageMeta(language)
  const focus = focusTermsFromWish(wish)
  const repairing = /слабые места|на ошибки|повтори слова|новое задание на/i.test(wish)
  const avoid = repairing ? new Set<string>() : memory.lemmas
  const focused = focus.length ? ready.filter((entry) => focus.includes(fold(lemma(entry.term)))) : []
  const ranked = focus.length
    ? [...shuffle(focused), ...pickFreshEntries(ready.filter((entry) => !focused.includes(entry)), avoid, ready.length)]
    : pickFreshEntries(ready, avoid, ready.length)
  if (ranked.length < 3) {
    return [
      {
        id: uid('hw'),
        kind: 'write',
        prompt: `Напишите 3 слова на ${(meta.prep ?? meta.label.toLowerCase())}, которые уже знаете.`,
        answer: '',
        explanation: 'Можно взять любые знакомые слова с полки.',
        tags: [KIND_TAG.write],
      },
    ]
  }

  const term = (entry: WordEntry) => lemma(entry.term)
  const ru = (entry: WordEntry) => entry.translation?.trim() ?? ''
  const picked = ranked.slice(0, Math.max(5, Math.min(8, ranked.length)))
  const five = picked.slice(0, 5)
  const withExamples = ranked.filter((entry) => entry.example?.trim())
  const passagePool = shuffle(withExamples.length >= 3 ? withExamples : ranked)
  const passageChunk = passagePool.slice(0, 6)
  const passageText = passageChunk.map((entry) => entry.example?.trim() || storyLine(language, term(entry), Math.floor(Math.random() * 5))).join(' ')
  const passageRu = passageChunk
    .map((entry) => entry.exampleTranslation?.trim() || `${ru(entry)}.`)
    .join(' ')

  const wordEntries = five
  const meaningPool = shuffle(
    ranked.filter(
      (entry) =>
        (EXTRA_SENSES[language]?.[fold(term(entry))]?.length ?? 0) >= 2 || glosses(entry.translation ?? '').length >= 2,
    ),
  )
  const meaningSource =
    meaningPool.find((entry) => !memory.meaningTerms.has(fold(term(entry)))) ?? meaningPool[0] ?? picked[0]
  const meaning = meaningsFor(language, meaningSource)
  const decoys = shuffle([
    ...MEANING_DECOYS,
    ...ranked.filter((entry) => entry.id !== meaningSource.id).map((entry) => ru(entry).split(/[/;,]/)[0].trim()),
  ])
    .filter((item) => item && !meaning.good.some((good) => fold(good) === fold(item)))
    .slice(0, 3)
  const meaningOptions = shuffle([...meaning.good, ...decoys])

  const matchPairs = five.map((entry) => ({ left: term(entry), right: ru(entry).split(/[/;,]/)[0].trim() }))
  const matchRights = shuffle(matchPairs.map((pair) => pair.right))
  const vocab = five.map((entry) => term(entry))
  const order = orderFromChunks(splitStory(orderStory(language, vocab.join('|')).join(' ')), vocab)

  const tasks: HomeworkTask[] = [
    {
      id: uid('hw'),
      kind: 'passage',
      prompt: `Переведите абзац на русский. После сдачи в отзыве разберём грамматику, не только слова.`,
      text: passageText,
      answer: passageRu,
      explanation: 'Связный перевод. Ошибки времени, артиклей и порядка слов попадут в обзор.',
      tags: [KIND_TAG.passage, 'грамматика'],
    },
    {
      id: uid('hw'),
      kind: 'words',
      prompt: 'Переведите каждое слово. Подойдёт любое верное значение.',
      items: wordEntries.map((entry) => term(entry)),
      answers: wordEntries.map((entry) => ru(entry)),
      answer: wordEntries.map((entry) => ru(entry)).join(' | '),
      explanation: 'Одно слово — один перевод. Форма слова может быть словарной.',
      tags: [KIND_TAG.words, 'лексика'],
    },
    {
      id: uid('hw'),
      kind: 'into',
      prompt: `Переведите с русского на ${(meta.prep ?? meta.label.toLowerCase())}.`,
      items: wordEntries.map((entry) => ru(entry).split(/[/;,]/)[0].trim()),
      answers: wordEntries.map((entry) => term(entry)),
      answer: wordEntries.map((entry) => term(entry)).join(' | '),
      explanation: 'С русского на язык тетради. Подойдёт близкий смысл, не только словарный ключ.',
      tags: [KIND_TAG.into, 'лексика'],
    },
    {
      id: uid('hw'),
      kind: 'meanings',
      prompt: `Как переводится «${meaning.term}»? Отметьте все подходящие значения.`,
      text: meaning.term,
      options: meaningOptions,
      answers: meaning.good,
      answer: meaning.good.join(' | '),
      explanation: `У «${meaning.term}» несколько смыслов: ${meaning.good.join(', ')}.`,
      tags: [KIND_TAG.meanings, 'лексика'],
    },
    {
      id: uid('hw'),
      kind: 'order',
      ...order,
    },
    {
      id: uid('hw'),
      kind: 'match',
      prompt: 'Сопоставьте слово с переводом. Перетащите карточку в строку.',
      pairs: matchPairs,
      options: matchRights,
      answer: matchPairs.map((pair) => pair.right).join(' | '),
      tags: [KIND_TAG.match, 'пары'],
    },
    {
      id: uid('hw'),
      kind: 'rows',
      prompt: `Напишите 5 предложений на ${(meta.prep ?? meta.label.toLowerCase())}. В 1-й строке — 1-е слово, во 2-й — 2-е и так дальше.`,
      rows: five.map((entry) => term(entry)),
      requiredWords: five.map((entry) => term(entry)),
      answer: '',
      hint: five.map((entry, index) => `${index + 1}. ${term(entry)}`).join(' · '),
      explanation: 'Каждая строка — целая фраза со своим словом.',
      tags: [KIND_TAG.rows, 'письмо'],
    },
  ]

  return tasks
}

export function localHomework(language: Language, files: WordFile[], wish = '', memory: HomeworkMemory = emptyMemory()): HomeworkSheet {
  const meta = languageMeta(language)
  const entries = homeworkPool(files)
  const tasks = localTasks(language, entries, wish, memory)
  const vocab = tasks
    .filter((task) => task.kind === 'words' || task.kind === 'rows')
    .flatMap((task) => task.items ?? task.rows ?? [])
    .filter(isVocabToken)
    .slice(0, 2)
  const topic = homeworkTopic(
    wish,
    vocab.length ? vocab.join(' / ') : files.find((file) => file.kind === 'cards' || file.kind === 'words')?.title || 'Слова с полки',
  )
  const focus = skillProfileFor(language).homeworkHint
  const sheet: HomeworkSheet = {
    id: uid('hwsheet'),
    title: `Домашняя работа. ${topic}`,
    topic,
    intro: `Тетрадь по ${(meta.prep ?? meta.label.toLowerCase())}: абзац, слова, перевод с русского, значения, история по точкам, пары и пять строк.${focus ? ` ${focus.charAt(0).toUpperCase()}${focus.slice(1)}.` : ''}`,
    language,
    createdAt: Date.now(),
    tasks,
    drafts: {},
    marks: {},
    reviews: {},
  }
  return { ...sheet, tags: sheetTags(sheet) }
}

export async function assignHomework(options: {
  language: Language
  displayName: string
  tutorPrompt?: string
  wish?: string
  progress?: Record<string, FileProgress>
}): Promise<HomeworkSheet> {
  const files = await libraryFor(options.language)
  const asked = options.wish?.trim().slice(0, 220) ?? ''
  const focus = skillProfileFor(options.language, options.progress).homeworkHint
  const wish = [asked, !asked && focus ? focus : ''].filter(Boolean).join(' ').slice(0, 220)
  const memory = recentHomeworkMemory(options.language)
  const sheet = localHomework(options.language, files, asked || wish, memory)
  const words = wordsFromSheet(sheet)
  try {
    let chunks = await improviseStory(sheet.language, words, memory.stories)
    if (!isUsableStory(chunks, words) || storiesTooClose(assembleStory(chunks), memory.stories)) {
      chunks = await improviseStory(sheet.language, words, [...memory.stories, assembleStory(chunks)], true)
    }
    if (isUsableStory(chunks, words) && !storiesTooClose(assembleStory(chunks), memory.stories)) {
      const packed = orderFromChunks(chunks, words)
      return {
        ...sheet,
        tasks: sheet.tasks.map((task) => (task.kind === 'order' ? { ...task, ...packed } : task)),
        tags: sheetTags(sheet),
      }
    }
  } catch (error) {
    console.warn('[homework] story', error)
  }
  return sheet
}

function asHomeworkMark(value: string): HomeworkMark | '' {
  const v = fold(value)
  if (!v) return ''
  if (/^(ok|right|good|1)$/.test(v) || /^верн/.test(v)) return 'ok'
  if (/^(partial|075|0 75)$/.test(v) || /почти/.test(v)) return 'partial'
  if (/^(bad|wrong|0)$/.test(v) || /неверн|ошиб/.test(v)) return 'bad'
  return isMark(value.trim().toLowerCase()) ? (value.trim().toLowerCase() as HomeworkMark) : ''
}

function parseReviewRows(raw: string, parsed: unknown): unknown[] {
  if (Array.isArray(parsed) && parsed.length) return parsed
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { reviews?: unknown }).reviews)) {
    return (parsed as { reviews: unknown[] }).reviews
  }
  const fromValue = asRows(parsed)
  if (fromValue.length) return fromValue

  const rows: unknown[] = []
  const re =
    /(?:^|\n)\s*(?:#|№)?\s*(\d+)\s*(?:\||[\).:\-—])\s*(ok|partial|bad|верно|почти|неверно|ошибка)\b\s*(?:\||[\-—:])?\s*(.*)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    rows.push([match[1], match[2], (match[3] ?? '').trim()])
  }
  return rows
}

function localReviewSheet(sheet: HomeworkSheet) {
  const marks: Record<string, HomeworkMark> = {}
  const reviews: Record<string, string> = {}
  for (const task of sheet.tasks) {
    const draft = sheet.drafts[task.id] ?? ''
    const result = checkTaskResult(task, draft)
    marks[task.id] = result.mark
    reviews[task.id] = explainTaskCheck(task, draft)
  }
  return softenOpenTranslations(sheet, marks, reviews)
}

function applyReviewRows(sheet: HomeworkSheet, rows: unknown[]) {
  const marks = { ...sheet.marks }
  const reviews = { ...sheet.reviews }
  let applied = 0
  for (const row of rows) {
    let index = -1
    let mark = ''
    let note = ''
    if (Array.isArray(row)) {
      const raw = asText(row[0])
      index = /^\d+$/.test(raw) ? Number(raw) - 1 : sheet.tasks.findIndex((task) => task.id === raw)
      mark = asHomeworkMark(asText(row[1]))
      note = asText(row[2])
    } else if (row && typeof row === 'object') {
      const item = row as Record<string, unknown>
      const raw = asText(item.n ?? item.index ?? item.id)
      index = /^\d+$/.test(raw) ? Number(raw) - 1 : sheet.tasks.findIndex((task) => task.id === raw)
      mark = asHomeworkMark(asText(item.mark ?? item.status))
      note = asText(item.note ?? item.why ?? item.review)
    }
    const task = sheet.tasks[index]
    if (!task || !isMark(mark)) continue
    marks[task.id] = mark
    if (note.trim()) reviews[task.id] = note.replace(/\s+/g, ' ').trim().slice(0, 280)
    applied += 1
  }
  if (!applied) return null
  return softenOpenTranslations(sheet, marks, reviews)
}

function looksLikeOpenTranslation(task: HomeworkTask, draft: string) {
  const guess = draft.trim()
  if (!guess || task.kind !== 'translate' || hasSenseHint(task)) return false
  if (lemmaMatches(guess, [task.answer, ...(task.answers ?? [])].filter(Boolean).join(' / '))) return true
  const cue = (task.text || '').trim()
  if (!cue) return /[а-яё]/i.test(guess) && guess.split(/\s+/).length <= 6
  const cueRu = /[а-яё]/i.test(cue)
  const guessRu = /[а-яё]/i.test(guess)
  if (cueRu === guessRu) return false
  return guess.split(/\s+/).length <= 6
}

function softenOpenTranslations(
  sheet: HomeworkSheet,
  marks: Record<string, HomeworkMark>,
  reviews: Record<string, string>,
) {
  for (const task of sheet.tasks) {
    const draft = sheet.drafts[task.id] ?? ''
    if (!looksLikeOpenTranslation(task, draft)) continue
    marks[task.id] = 'ok'
    const key = [task.answer, ...(task.answers ?? [])].filter(Boolean).join(' / ')
    const hit = key ? lemmaMatches(draft, key) : false
    const extra = key && !hit ? `Ещё бывает: ${key}.` : ''
    const prev = reviews[task.id] ?? ''
    if (!prev || /не подходит|неверн|ошибк|ключ требует|не входит/i.test(prev)) {
      reviews[task.id] = extra ? `Верно. ${extra}` : 'Верно.'
    } else if (extra && !/ещё бывает/i.test(prev)) {
      reviews[task.id] = `${prev} ${extra}`.replace(/\s+/g, ' ').trim().slice(0, 280)
    }
  }
  return { marks, reviews }
}

function hasSenseHint(task: HomeworkTask) {
  const blob = `${task.prompt} ${task.text ?? ''}`
  if (/(в значен|в смысле|здесь значит|в этом контексте|именно как|как глагол|как существительн)/i.test(blob)) {
    return true
  }
  return /(переведите предложение|переведи(?:те)? фразу|весь текст)/i.test(task.prompt)
}

function draftPreview(task: HomeworkTask, draft: string) {
  if (task.kind === 'meanings') return asStringList(draft).join(', ') || '(empty)'
  if (task.kind === 'match') {
    const map = asStringMap(draft)
    return Object.entries(map).map(([left, right]) => `${left} — ${right}`).join('; ') || '(empty)'
  }
  if (task.kind === 'order') return asStringList(draft).join(' → ') || '(empty)'
  if (task.kind === 'rows') return padLines(draft, task.rows?.length ?? 5).join(' | ') || '(empty)'
  if (task.kind === 'words' || task.kind === 'into') {
    return (
      Object.entries(asStringMap(draft))
        .map(([left, right]) => `${left} — ${right}`)
        .join('; ') || '(empty)'
    )
  }
  return draft.trim() || '(empty)'
}

export async function reviewHomework(sheet: HomeworkSheet): Promise<HomeworkSheet> {
  const packed = sheet.tasks
    .map((task, index) => {
      const required = requiredWordsOf(task)
      const keyed = Boolean(task.answer && hasSenseHint(task))
      return [
        `#${index + 1}`,
        `kind: ${task.kind}`,
        `prompt: ${task.prompt}`,
        task.text ? `text: ${task.text}` : '',
        task.answer ? `key: ${task.answer}` : 'key: free sentence',
        required.length ? `must include: ${required.join(', ')}` : '',
        `sense: ${keyed ? 'keyed' : 'open'}`,
        `student: ${draftPreview(task, sheet.drafts[task.id] ?? '')}`,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')

  const system = [
    'Grade homework. Notes in Russian only, one or two short sentences. No English. No preamble.',
    'ok=1, partial=0.75, bad=0. Empty = bad.',
    'HARD: sense:open translate — a real meaning is always ok=1. «get» → «взять» is ok. Key «получать / добираться» goes only into the note: «Ещё бывает: получать / добираться». NEVER write «не подходит под ключ» and NEVER mark bad for that.',
    'A bare word without article (burden, get) is a lemma — noun or verb, both fine. «бремя» → burden is ok. A short example sentence is also ok. Do not demand a verb or the/a.',
    'translate/choose with sense:keyed: only if the prompt/example clearly pins ONE meaning or POS — then the key matters.',
    'fill: accept the missing word alone OR the whole sentence rewritten with the blank filled. «get» and «How do I get to the museum?» are both ok if the form is right. Do not require only the word.',
    'passage: mark sense first. In the note list concrete grammar issues (tense, article, word order). If grammar is fine, say so and offer one more natural phrasing.',
    'words/meanings/match/order/rows: trust obvious objective hits; notes stay short.',
    'write/sentence/rows: score the WHOLE sentence. Words listed without grammar, broken order, or a fragment (get burden do) = bad, 0. All required words present is not enough.',
    'write partial=0.75 only if the sentence is grammatical and misses exactly ONE required word.',
    'One line per task: 1|ok|краткий отзыв',
  ].join('\n')

  const local = localReviewSheet(sheet)
  let marks = { ...local.marks }
  let reviews = { ...local.reviews }

  try {
    const raw = await askGemini(system, [{ role: 'user', text: packed || 'empty' }], {
      maxTokens: LLM_BUDGET.homework.maxTokens,
      timeoutMs: LLM_BUDGET.homework.timeoutMs,
      temperature: 0.2,
    })
    const model = applyReviewRows(sheet, parseReviewRows(raw, parseModelValue(raw)))
    if (model) {
      for (const task of sheet.tasks) {
        const draft = sheet.drafts[task.id] ?? ''
        const note = model.reviews[task.id]
        if (isBlankDraft(task, draft)) {
          marks[task.id] = 'bad'
          reviews[task.id] = explainTaskCheck(task, draft)
          continue
        }
        if (task.kind === 'passage' || task.kind === 'write' || task.kind === 'translate') {
          if (model.marks[task.id] === 'partial') marks[task.id] = 'partial'
          if (model.marks[task.id] === 'ok' && marks[task.id] !== 'bad') marks[task.id] = 'ok'
          if (note && !(looksLikePraise(note) && marks[task.id] === 'bad')) reviews[task.id] = note
        } else if (note && !/не подходит под ключ/i.test(note) && !(looksLikePraise(note) && marks[task.id] === 'bad')) {
          reviews[task.id] = note
        }
      }
      const soft = softenOpenTranslations(sheet, marks, reviews)
      marks = soft.marks
      reviews = soft.reviews
    } else {
      console.warn('[homework] review parse', raw.slice(0, 200))
    }
  } catch (error) {
    console.warn('[homework] review failed', error)
  }

  const next = sanitizeHomeworkReview({ ...sheet, marks, reviews, doneAt: Date.now() })
  return { ...next, analysis: buildAnalysis(next) }
}

