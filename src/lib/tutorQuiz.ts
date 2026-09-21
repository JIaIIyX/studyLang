import { languageMeta } from './languages'
import { askGemini } from './llm'
import { inPractice, LLM_BUDGET } from './llmTasks'
import { canonicalizeQuiz, extractQuizAnswer, extractQuizAnswers, fixReplySpaces, hasTenseCue, keepFirstExercise, quizPickMode } from './practiceTags'
import { extractQuizChoices, quizQuestionText, refersToPassage, hasReadingStimulus, looksLikeLeavingQuiz, looksLikeQuizRequest } from './quizChoices'
import { picksFromChoices } from './quizReply'
import { fold, matchAnswerSet, matchesAnswer, shuffle } from './normalize'
import {
  catalogDigest,
  catalogFromMessages,
  emptyCatalog,
  keysConflict,
  keysFromQuiz,
  quizRepeatsCatalog,
  rememberAnswer,
  type QuizCatalog,
} from './quizCatalog'
import type { ChatMessage, Language, WordEntry } from '../types'

type QuizItem = {
  prompt: string
  blank?: string
  answer: string
  answers?: string[]
  options: string[]
  write?: boolean
  avoid?: string
}

type FormSeed = {
  language: Language
  blank: string
  answer: string
  options: string[]
}

const DECOYS: Record<Language, [string, string][]> = {
  en: [
    ['moment', 'мгновение'],
    ['limit', 'граница'],
    ['meeting', 'встреча'],
    ['silence', 'тишина'],
  ],
  fr: [
    ['instant', 'мгновение'],
    ['limite', 'граница'],
    ['rencontre', 'встреча'],
    ['silence', 'тишина'],
  ],
  de: [
    ['Moment', 'мгновение'],
    ['Grenze', 'граница'],
    ['Treffen', 'встреча'],
    ['Stille', 'тишина'],
  ],
}

const FORM_SEEDS: FormSeed[] = [
  { language: 'en', blank: 'I ___ to Paris last year.', answer: 'went', options: ['went', 'go', 'gone', 'going'] },
  { language: 'en', blank: 'She ___ coffee every morning.', answer: 'drinks', options: ['drinks', 'drink', 'drank', 'drunk'] },
  { language: 'en', blank: 'He ___ a book right now.', answer: 'is reading', options: ['is reading', 'reads', 'read', 'reading'] },
  { language: 'en', blank: 'We ___ dinner at 7 yesterday.', answer: 'had', options: ['had', 'have', 'has', 'having'] },
  { language: 'en', blank: 'There ___ two cats in the yard.', answer: 'are', options: ['are', 'is', 'be', 'was'] },
  { language: 'en', blank: 'I have never ___ sushi.', answer: 'eaten', options: ['eaten', 'eat', 'ate', 'eating'] },
  { language: 'en', blank: 'Please ___ the door.', answer: 'close', options: ['close', 'closes', 'closed', 'closing'] },
  { language: 'en', blank: 'This is ___ interesting book.', answer: 'an', options: ['an', 'a', 'the'] },
  { language: 'en', blank: 'They ___ in London.', answer: 'live', options: ['live', 'lives', 'lived', 'living'] },
  { language: 'en', blank: 'We ___ football on Sundays.', answer: 'play', options: ['play', 'plays', 'played', 'playing'] },
  { language: 'en', blank: 'He ___ his keys yesterday.', answer: 'lost', options: ['lost', 'lose', 'loses', 'losing'] },
  { language: 'en', blank: 'The film ___ at eight.', answer: 'starts', options: ['starts', 'start', 'started', 'starting'] },
  { language: 'fr', blank: 'Je ___ au café.', answer: 'vais', options: ['vais', 'va', 'aller', 'allons'] },
  { language: 'fr', blank: 'Elle ___ un livre.', answer: 'lit', options: ['lit', 'lire', 'lis', 'lisons'] },
  { language: 'fr', blank: 'Nous ___ français.', answer: 'parlons', options: ['parlons', 'parle', 'parlez', 'parler'] },
  { language: 'fr', blank: 'Ils ___ à Paris hier.', answer: 'sont allés', options: ['sont allés', 'vont', 'aller', 'allez'] },
  { language: 'fr', blank: 'Tu ___ du café ?', answer: 'veux', options: ['veux', 'veut', 'vouloir', 'voulons'] },
  { language: 'fr', blank: 'C’est ___ pomme.', answer: 'une', options: ['une', 'un', 'le', 'des'] },
  { language: 'fr', blank: 'J’___ un nouveau téléphone.', answer: 'ai', options: ['ai', 'as', 'a', 'avons'] },
  { language: 'de', blank: 'Ich ___ nach Hause.', answer: 'gehe', options: ['gehe', 'geht', 'gehen', 'gehst'] },
  { language: 'de', blank: 'Er hat das Buch ___.', answer: 'gelesen', options: ['gelesen', 'lesen', 'liest', 'las'] },
  { language: 'de', blank: 'Das ist ___ Buch.', answer: 'ein', options: ['ein', 'eine', 'einen', 'der'] },
  { language: 'de', blank: 'Wir ___ gern Kaffee.', answer: 'trinken', options: ['trinken', 'trinkt', 'trinke', 'trank'] },
  { language: 'de', blank: 'Sie ___ gestern im Park.', answer: 'war', options: ['war', 'ist', 'sein', 'waren'] },
  { language: 'de', blank: '___ Mann liest eine Zeitung.', answer: 'Der', options: ['Der', 'Die', 'Das', 'Den'] },
  { language: 'de', blank: 'Hast du ___ Zeit?', answer: 'eine', options: ['eine', 'ein', 'einen', 'der'] },
]

const ARTICLES: Record<Language, string[]> = {
  de: ['der', 'die', 'das'],
  fr: ['le', 'la', 'les', 'un', 'une'],
  en: ['a', 'an', 'the'],
}

function pick<T>(items: T[]): T | undefined {
  if (!items.length) return undefined
  return items[Math.floor(Math.random() * items.length)]
}

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function blankOnce(sentence: string, word: string) {
  if (!word.trim() || word.trim().length < 2) return ''
  const re = new RegExp(`(?<!\\p{L})${escapeRe(word)}(?!\\p{L})`, 'iu')
  if (!re.test(sentence)) return ''
  return sentence.replace(re, '___')
}

function verbForms(term: string) {
  const parts = term
    .split(/\s*\/\s*/)
    .map((item) => item.trim())
    .filter((item) => item && item.split(/\s+/).length <= 3)
  return parts.length >= 2 && parts.length <= 4 ? parts : []
}

function splitArticle(language: Language, term: string) {
  const match = term.trim().match(/^(\S+)\s+(.+)$/)
  if (!match) return null
  const article = match[1]
  const word = match[2]
  if (!ARTICLES[language].some((item) => fold(item) === fold(article))) return null
  return { article, word }
}

function quizPairs(language: Language, entries: WordEntry[]) {
  const pairs = entries
    .filter((item) => item.term.trim() && item.translation?.trim())
    .map((item) => ({
      term: item.term.trim(),
      translation: item.translation!.trim(),
      example: item.example?.trim() || '',
    }))
  for (const [term, translation] of DECOYS[language]) {
    if (!pairs.some((item) => fold(item.term) === fold(term))) {
      pairs.push({ term, translation, example: '' })
    }
  }
  return pairs
}

function quizKeys(item: QuizItem) {
  const keys = (item.answers?.length ? item.answers : [item.answer]).map((row) => row.trim()).filter(Boolean)
  return [...new Set(keys)]
}

function uniqueOptions(correct: string[], extras: string[], max = 4) {
  const list: string[] = []
  for (const item of [...correct, ...extras]) {
    if (!item || list.some((row) => fold(row) === fold(item))) continue
    list.push(item)
    if (list.length >= max) break
  }
  return list.length >= 2 ? shuffle(list) : []
}

function formatQuiz(item: QuizItem) {
  const keys = quizKeys(item)
  if (!keys.length) return ''
  if (item.write) {
    return [item.prompt, item.blank ?? '', ...keys.map((row) => `<answer>${row}</answer>`)].filter((line) => line !== '').join('\n')
  }
  const options = uniqueOptions(keys, item.options, 4)
  if (options.length < 2) return ''
  return [
    item.prompt,
    item.blank ?? '',
    ...keys.map((row) => `<answer>${row}</answer>`),
    '',
    ...options.map((row) => `<btn>${row}</btn>`),
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function usedItem(item: QuizItem, catalog: QuizCatalog) {
  const cue = `${item.prompt} ${item.blank ?? ''}`.match(/[«"]([^»"]+)[»"]/)?.[1]
  return keysConflict(catalog, {
    answer: item.answer,
    extra: item.avoid,
    blank: item.blank,
    cue,
  })
}

function unusedPair(
  pairs: { term: string; translation: string; example: string }[],
  catalog: QuizCatalog,
) {
  return pick(
    pairs.filter(
      (item) =>
        !keysConflict(catalog, { answer: item.term, extra: item.translation, cue: item.term }) &&
        !keysConflict(catalog, { answer: item.translation, cue: item.translation }),
    ),
  )
}

function toRuItem(language: Language, entries: WordEntry[], catalog: QuizCatalog): QuizItem | null {
  const pairs = quizPairs(language, entries)
  const entry = unusedPair(pairs, catalog)
  if (!entry) return null
  return {
    prompt: `Как переводится «${entry.term}»?`,
    answer: entry.translation,
    options: pairs.map((item) => item.translation),
    avoid: entry.term,
  }
}

function fromRuItem(language: Language, entries: WordEntry[], catalog: QuizCatalog): QuizItem | null {
  const pairs = quizPairs(language, entries)
  const entry = unusedPair(pairs, catalog)
  if (!entry) return null
  return {
    prompt: `Как будет ${inPractice(language)} «${entry.translation}»?`,
    answer: entry.term,
    options: pairs.map((item) => item.term),
    avoid: entry.translation,
  }
}

function formSeedItem(language: Language, catalog: QuizCatalog): QuizItem | null {
  const pool = FORM_SEEDS.filter(
    (item) =>
      item.language === language &&
      !keysConflict(catalog, { answer: item.answer, blank: item.blank }),
  )
  const seed = pick(pool)
  if (!seed) return null
  return {
    prompt: 'Вставьте правильную форму.',
    blank: seed.blank,
    answer: seed.answer,
    options: seed.options,
    avoid: seed.answer,
  }
}

function verbFrames(language: Language, forms: string[]) {
  const inf = forms[0]
  const past = forms[1] || forms[0]
  const part = forms[2] || forms[1] || forms[0]
  if (language === 'en') {
    return [
      { blank: `Yesterday I ___ it.`, answer: past },
      { blank: `She has already ___ it.`, answer: part },
      { blank: `They want to ___ it.`, answer: inf },
    ]
  }
  if (language === 'fr') {
    return [
      { blank: `Hier j’ai ___ ça.`, answer: part },
      { blank: `Ils veulent ___ ça.`, answer: inf },
    ]
  }
  return [
    { blank: `Gestern ___ ich das.`, answer: past },
    { blank: `Sie hat das schon ___.`, answer: part },
  ]
}

function keepUnused(item: QuizItem | null, catalog: QuizCatalog): item is QuizItem {
  return Boolean(item && !usedItem(item, catalog))
}

function verbFormItem(language: Language, entries: WordEntry[], catalog: QuizCatalog): QuizItem | null {
  const ready = entries.flatMap((item): QuizItem[] => {
    const forms = verbForms(item.term)
    if (forms.length < 2) return []
    const example = item.example?.trim() || ''
    const hit = forms.find((form) => example && new RegExp(escapeRe(form), 'i').test(example))
    const fromExample = hit && example ? blankOnce(example, hit) : ''
    const options = forms.length >= 3 ? forms : [...forms, `${forms[0]}s`, `${forms[0]}ing`].filter(Boolean)
    const built: QuizItem[] = []
    if (fromExample.includes('___')) {
      built.push({
        prompt: 'Вставьте правильную форму.',
        blank: fromExample,
        answer: hit || forms[1],
        options,
        avoid: forms[0],
      })
    }
    for (const frame of verbFrames(language, forms)) {
      built.push({
        prompt: 'Вставьте правильную форму в предложение.',
        blank: frame.blank,
        answer: frame.answer,
        options,
        avoid: forms[0],
      })
    }
    return built.filter((row) => keepUnused(row, catalog))
  })
  return pick(ready) ?? null
}

function articleItem(language: Language, entries: WordEntry[], catalog: QuizCatalog): QuizItem | null {
  const ready = entries
    .map((item): QuizItem | null => {
      const parts = splitArticle(language, item.term)
      if (!parts) return null
      const example = item.example?.trim() || ''
      const blank = example ? blankOnce(example, parts.article) : `___ ${parts.word}`
      if (!blank.includes('___')) return null
      return {
        prompt: 'Выберите правильный артикль.',
        blank: item.translation ? `${blank} — ${item.translation}` : blank,
        answer: parts.article,
        options: ARTICLES[language],
        avoid: parts.word,
      }
    })
    .filter((item) => keepUnused(item, catalog))
  return pick(ready) ?? null
}

function gapItem(language: Language, entries: WordEntry[], catalog: QuizCatalog): QuizItem | null {
  const pairs = quizPairs(language, entries)
  const ready = pairs
    .map((item): QuizItem | null => {
      const word = verbForms(item.term)[0] || item.term.split(/\s+/)[0] || item.term
      if (!item.example || word.length < 3) return null
      const blank = blankOnce(item.example, word)
      if (!blank.includes('___')) return null
      return {
        prompt: 'Вставьте пропущенное слово.',
        blank: item.translation ? `${blank} — ${item.translation}` : blank,
        answer: word,
        options: pairs.map((row) => verbForms(row.term)[0] || row.term.split(/\s+/)[0] || row.term),
        avoid: item.term,
      }
    })
    .filter((item) => keepUnused(item, catalog))
  return pick(ready) ?? null
}

function writeRuItem(language: Language, entries: WordEntry[], catalog: QuizCatalog): QuizItem | null {
  const pairs = quizPairs(language, entries)
  const entry = unusedPair(pairs, catalog)
  if (!entry) return null
  return {
    prompt: 'Напишите перевод этого слова.',
    blank: `«${entry.term}»`,
    answer: entry.translation,
    options: [],
    write: true,
    avoid: entry.term,
  }
}

function writePracticeItem(language: Language, entries: WordEntry[], catalog: QuizCatalog): QuizItem | null {
  const pairs = quizPairs(language, entries)
  const entry = unusedPair(pairs, catalog)
  if (!entry) return null
  return {
    prompt: `Напишите слово ${inPractice(language)}.`,
    blank: `«${entry.translation}»`,
    answer: entry.term,
    options: [],
    write: true,
    avoid: entry.translation,
  }
}

function wantedKinds(wish: string) {
  const form = /(форм|грамматик|артикл|спряж|склон|вставь|пропуск|врем|предложен|практик)/i.test(wish)
  const write = /(напиш|без вариант|введи|сам перевод|письм)/i.test(wish)
  const askedTranslate = /(на русский|по-русски|что значит|как переводится)/i.test(wish)
  const askedPractice = /(на английск|на француз|на немец|по-англий|по-француз|по-немец|как будет по[- ]|с русск)/i.test(wish)
  const askedAnyTranslation = /(с перевод)/i.test(wish)
  const sense = /(смысл|текст|абзац|истори)/i.test(wish)
  if (write) return ['write-ru', 'write-practice'] as const
  if (form) return ['form', 'verb', 'article', 'gap'] as const
  if (askedTranslate && !askedPractice) return ['write-ru', 'to-ru'] as const
  if (askedPractice && !askedTranslate) return ['write-practice', 'from-ru'] as const
  if (askedAnyTranslation) return ['write-ru', 'write-practice', 'to-ru', 'from-ru'] as const
  if (sense) return ['write-ru', 'to-ru', 'from-ru'] as const
  return ['write-ru', 'write-practice', 'form', 'verb', 'article', 'gap', 'to-ru', 'from-ru'] as const
}


export type WishDifficulty = 'any' | 'easy' | 'hard'

export function wishDifficulty(wish: string): WishDifficulty {
  const value = wish.trim()
  if (!value) return 'any'
  if (/(полегч|легче|прощ|\ba1\b|\ba2\b|beginner|начальн)/i.test(value)) return 'easy'
  if (/(посложн|сложн|трудн|\bb1\b|\bb2\b|\bc1\b|\bc2\b|advanced|уровн)/i.test(value)) return 'hard'
  return 'any'
}

function filterEntriesByWish(entries: WordEntry[], wish: string) {
  const level = wishDifficulty(wish)
  if (level === 'any' || entries.length < 8) return entries
  const ranked = entries.map((entry) => {
    const hint = String((entry as { level?: string; cefr?: string }).level || (entry as { cefr?: string }).cefr || '')
    const term = String((entry as { term?: string; word?: string }).term || (entry as { word?: string }).word || '')
    const hard = /b1|b2|c1|c2/i.test(hint) || term.length >= 8
    const easy = /a1|a2/i.test(hint) || term.length <= 5
    return { entry, hard, easy }
  })
  if (level === 'hard') {
    const hard = ranked.filter((item) => item.hard).map((item) => item.entry)
    return hard.length >= 4 ? hard : entries
  }
  const easy = ranked.filter((item) => item.easy).map((item) => item.entry)
  return easy.length >= 4 ? easy : entries
}

export function makeLocalQuiz(language: Language, entries: WordEntry[], wish: string, catalog: QuizCatalog = emptyCatalog()) {
  const pool = filterEntriesByWish(entries, wish)
  const hard = wishDifficulty(wish) === 'hard'
  const makers: Record<string, () => QuizItem | null> = {
    'to-ru': () => toRuItem(language, pool, catalog),
    'from-ru': () => fromRuItem(language, pool, catalog),
    'write-ru': () => writeRuItem(language, pool, catalog),
    'write-practice': () => writePracticeItem(language, pool, catalog),
    form: () => formSeedItem(language, catalog),
    verb: () => verbFormItem(language, pool, catalog),
    article: () => articleItem(language, pool, catalog),
    gap: () => gapItem(language, pool, catalog),
  }
  const hardKinds = ['form', 'verb', 'gap', 'article'] as const
  const kinds = hard
    ? [...hardKinds, ...wantedKinds(wish).filter((kind) => !(hardKinds as readonly string[]).includes(kind))]
    : wantedKinds(wish)
  for (const kind of shuffle([...kinds])) {
    if (hard && pool.length < 4 && (kind === 'to-ru' || kind === 'from-ru' || kind === 'write-ru' || kind === 'write-practice')) {
      continue
    }
    const item = makers[kind]?.()
    if (item) {
      const text = formatQuiz(item)
      if (text && isClearQuiz(text)) return text
    }
  }
  const fallback =
    (hard ? formSeedItem(language, catalog) || gapItem(language, pool, catalog) || verbFormItem(language, pool, catalog) : null) ||
    toRuItem(language, pool, catalog) ||
    fromRuItem(language, pool, catalog) ||
    formSeedItem(language, catalog)
  const text = fallback ? formatQuiz(fallback) : ''
  return text && isClearQuiz(text) ? text : ''
}

export function isWriteQuiz(text: string) {
  return Boolean(extractQuizAnswer(text)) && extractQuizChoices(text).length < 2
}

export function lastQuizMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((item) => item.role === 'assistant' && extractQuizAnswer(item.content))
}


function joinAnswers(items: string[], joiner: 'или' | 'и' | '·') {
  const clean = items.map((item) => item.trim()).filter(Boolean)
  if (!clean.length) return ''
  if (clean.length === 1) return clean[0]
  if (joiner === '·') return clean.join(' · ')
  if (clean.length === 2) return `${clean[0]} ${joiner} ${clean[1]}`
  return `${clean.slice(0, -1).join(', ')} ${joiner} ${clean[clean.length - 1]}`
}

function explainQuizGrade(opts: {
  ok: boolean
  expected: string[]
  picks: string[]
  mode: 'all' | 'any'
  quizContent: string
}) {
  const { ok, expected, picks, mode, quizContent } = opts
  const choices = extractQuizChoices(quizContent)
  const question = quizQuestionText(quizContent) || ''
  const alternatives = expected.length > 1
  // several =answer tags / either-form gap / explicit "any"
  const eitherOk =
    alternatives &&
    (mode === 'any' ||
      expected.length === choices.length ||
      /оба вариант|любой из|подойд(?:ёт|ут)|either|both ok|любая форм/i.test(quizContent))

  if (ok) {
    if (eitherOk) {
      const label = expected.length === 2 ? 'оба варианта' : 'несколько вариантов'
      return `Верно. Здесь подходят ${label}: **${joinAnswers(expected, 'и')}**.`
    }
    if (mode === 'all' && alternatives) {
      return `Верно. Нужно было отметить все: **${joinAnswers(expected, 'и')}**.`
    }
    if (/_{2,}|\bформ|\bвремя|\btense|\barticle|\bартик/i.test(question + quizContent) && expected[0]) {
      return `Верно. Форма **${expected[0]}** подходит к этому предложению.`
    }
    if (/перевод|как будет|что значит|translate/i.test(question) && expected[0]) {
      return `Верно. Правильный перевод — **${expected[0]}**.`
    }
    return expected[0] ? `Верно. Правильный ответ — **${expected[0]}**.` : 'Верно.'
  }

  const shown = picks.map((item) => item.trim()).filter(Boolean)
  const need = eitherOk
    ? joinAnswers(expected, 'или')
    : mode === 'all' && alternatives
      ? joinAnswers(expected, 'и')
      : joinAnswers(expected, '·')

  if (eitherOk) {
    const label = expected.length === 2 ? 'оба' : 'несколько'
    return `Почти. Здесь верны ${label} варианта: **${joinAnswers(expected, 'или')}**. Ваш ответ не совпал.`
  }
  if (mode === 'all' && alternatives) {
    return `Почти. Нужно отметить все верные пункты: **${need}**.`
  }
  if (shown[0] && expected[0] && fold(shown[0]) !== fold(expected[0])) {
    return `Почти. «${shown[0]}» сюда не подходит — нужно **${need}**.`
  }
  return `Почти. Нужно: **${need}**.`
}

export function gradeLastQuiz(messages: ChatMessage[]) {
  const last = messages.at(-1)?.content.trim() ?? ''
  const previous = lastQuizMessage(messages.slice(0, -1))
  if (!previous) return ''
  const expected = extractQuizAnswers(previous.content)
  if (!expected.length) return ''
  const choices = extractQuizChoices(previous.content)
  const payload = last.replace(/^задание\s*#?\d+\s*ответ(?:\s+[A-DА-Гa-dа-г]+)?\s*:\s*/iu, '').trim() || last
  if (
    looksLikeQuizRequest(last) ||
    looksLikeQuizRequest(payload) ||
    looksLikeLeavingQuiz(last, choices) ||
    looksLikeLeavingQuiz(payload, choices)
  ) {
    return ''
  }
  const picks = picksFromChoices(payload, choices)
  const mode = quizPickMode(previous.content)
  const ok = matchAnswerSet(picks.join(' | ') || payload, expected, mode)
  return explainQuizGrade({
    ok,
    expected,
    picks: picks.length ? picks : payload ? [payload] : [],
    mode,
    quizContent: previous.content,
  })
}

export function gradeLocalQuiz(language: Language, messages: ChatMessage[], entries: WordEntry[], wish = '', catalog?: QuizCatalog) {
  const previous = lastQuizMessage(messages.slice(0, -1))
  const expected = previous ? extractQuizAnswers(previous.content) : []
  let used = catalog ?? catalogFromMessages(messages)
  for (const item of expected) used = rememberAnswer(used, item)
  const next = makeLocalQuiz(language, entries, wish, used)
  const line = gradeLastQuiz(messages)
  if (!next) return line
  if (!line) return next
  return `${line}\n\n${next}`
}

function quizJunk(text: string) {
  return /админ|зафиксировал|режим:|language pair|систем[аы] требует|как админ|what is the english word for/i.test(
    text,
  )
}

function isClearQuiz(text: string) {
  const answer = extractQuizAnswer(text)
  if (!answer) return false
  const question = quizQuestionText(text)
  if (/выберите нужную форму/i.test(question) && !/_{2,}/.test(question)) return false
  if (/_{2,}/.test(question)) {
    const words = fold(question.replace(/_{2,}/g, ' ')).split(' ').filter((word) => word.length >= 2)
    if (words.length < 1) return false
    const choices = extractQuizChoices(text)
    const answers = extractQuizAnswers(text)
    if (choices.length >= 3 && answers.length < 2 && !hasTenseCue(question)) return false
    return true
  }
  const cue = question.match(/[«"]([^»"]+)[»"]/)?.[1]?.trim() ?? ''
  if (cue && fold(cue) === fold(answer)) return false
  if (refersToPassage(question) && !hasReadingStimulus(text)) return false
  if (/(перевод|как будет|напиш|слово)/i.test(question)) return Boolean(cue)
  const choices = extractQuizChoices(text)
  if (choices.length >= 2) {
    const words = fold(question).split(' ').filter((word) => word.length >= 2)
    return words.length >= 4
  }
  return false
}

function isValidImprovisedQuiz(text: string) {
  if (!text || text.length > 900 || quizJunk(text)) return false
  if (/\p{L}___|___\p{L}/u.test(text)) return false
  const answer = extractQuizAnswer(text)
  if (!answer || answer.length > 80) return false
  if (/^answer\s*\d+$/i.test(answer)) return false
  const answers = extractQuizAnswers(text)
  if (answers.some((item) => item.length > 80 || /^answer\s*\d+$/i.test(item))) return false
  const cue = text.match(/[«"](.+?)[»"]/)?.[1]?.trim() ?? ''
  if (cue && answers.some((item) => fold(cue) === fold(item))) return false
  const buttons = extractQuizChoices(text)
  const wantsChoices = /выберите|вариант|\[option\]|<(?:btn|opt)>/i.test(text)
  if (wantsChoices && buttons.length < 2) return false
  if (buttons.length >= 2) {
    const hit = answers.every((item) =>
      buttons.some((choice) => fold(choice) === fold(item) || matchesAnswer(item, choice) || matchesAnswer(choice, item)),
    )
    if (!hit) return false
    return isClearQuiz(text)
  }
  if (buttons.length === 1) return false
  return isClearQuiz(text)
}

export function recentQuizAvoid(messages: ChatMessage[]) {
  return catalogDigest(catalogFromMessages(messages))
}

function shelfPool(language: Language, entries: WordEntry[], catalog: QuizCatalog) {
  const pairs = quizPairs(language, entries)
  const fresh = pairs.filter(
    (item) => !keysConflict(catalog, { answer: item.term, extra: item.translation, cue: item.term }),
  )
  return shuffle((fresh.length ? fresh : pairs).map((item) => `${item.term} — ${item.translation}`))
    .slice(0, 10)
    .join('; ')
}

async function askQuizDraft(system: string, wish: string, grammar: boolean, temperature: number) {
  return keepFirstExercise(
    canonicalizeQuiz(
      fixReplySpaces(
        await askGemini(system, [{ role: 'user', text: wish.trim() || (grammar ? 'Мини-тест по теме урока.' : 'Ещё одно задание.') }], {
          maxTokens: LLM_BUDGET.quiz.maxTokens,
          timeoutMs: LLM_BUDGET.quiz.timeoutMs,
          temperature,
        }),
      ),
    ),
  )
}

function quizSystem(
  language: Language,
  entries: WordEntry[],
  wish: string,
  catalog: QuizCatalog,
  options?: { grammar?: boolean; lesson?: string },
  extra = '',
) {
  const practice = languageMeta(language).native
  const grammar = Boolean(options?.grammar) || /(врем|предложен|грамматик|артикл|практик)/i.test(wish)
  const pool = grammar ? '' : shelfPool(language, entries, catalog)
  const digest = catalogDigest(catalog)
  return {
    grammar,
    system: [
      `StudyLang quiz. Practice: ${practice}. Invent ONE short item. Russian instruction only.`,
      'No preamble, admin, modes, or pair-rules.',
      grammar
        ? 'Make a grammar item about the current lesson: tense, form, or word order. MUST be a full sentence with ___ and 3–4 [options] of forms. Never ask to pick a form of a word in «quotes» without that sentence. NOT a vocabulary translation. NOT a random shelf word.'
        : 'Types you may pick: write a translation (no buttons), write the practice word (no buttons), choose a form with ___, choose an article, choose a translation with [options].',
      'Include one or more =answer lines. Copy option text (надежда), never «answer 1» or «B».',
      'No secrets, no {{ }}. Question + [options] + =answer only.',
      'Buttons: each option on its own line as [надежда], never [option] надежда, never A).',
      'If two forms both fit a blank (no tense cue like yesterday / already / now / to), mark BOTH with =answer. One blank: student may pick either.',
      'Select-all: write «Отметьте все верные варианты.» and one =answer line per correct option.',
      'If the question is about a text, quote 2–4 sentences first. Never ask about «the paragraph» without the paragraph.',
      'The question is plain text. [option] is only an answer choice, never the question, never the word options.',
      'The cue in «» must not equal <answer>. Do not quiz a language against itself.',
      pool ? `Prefer a pair from the shelf: ${pool}` : '',
      options?.lesson ? `Lesson to stay on: ${options.lesson.slice(0, 420)}` : '',
      options?.lesson ? 'MUST stay on the student topic from Lesson above. Do not switch to unrelated vocabulary or another tense.' : '',
      digest,
      extra,
      wish ? `Student asked: ${wish.slice(0, 180)}` : '',
      wishDifficulty(wish) === 'hard'
        ? 'Difficulty: B1–B2. Prefer grammar (tense/form/gap) or less common vocabulary. Avoid A1 words like apple/house/bread/train.'
        : wishDifficulty(wish) === 'easy'
          ? 'Difficulty: A1–A2. Prefer very common everyday vocabulary.'
          : '',
      /грамматик|форм|артикл|врем/.test(wish) || grammar ? 'Prefer a grammar item (form / article / gap / tense).' : '',
      /смысл|текст|абзац/.test(wish) ? 'Prefer a meaning check, not a grammar gap.' : '',
      /перевод слов/.test(wish) && !grammar ? 'Prefer a vocabulary translation item.' : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

export async function improviseQuiz(
  language: Language,
  entries: WordEntry[],
  wish: string,
  catalog: QuizCatalog = emptyCatalog(),
  options?: { grammar?: boolean; lesson?: string },
) {
  const first = quizSystem(language, entries, wish, catalog, options)
  try {
    const raw = await askQuizDraft(first.system, wish, first.grammar, 0.85)
    if (isValidImprovisedQuiz(raw) && !quizRepeatsCatalog(raw, catalog)) return raw
    if (isValidImprovisedQuiz(raw) && quizRepeatsCatalog(raw, catalog)) {
      const used = keysFromQuiz(raw)
      const extra = used
        ? `Rejected a repeat. Do not use answer ${used.answers.join(', ') || 'that'} or frame ${used.frames.join(' | ') || used.cues.join(' | ') || 'that'}.`
        : 'Rejected a repeat. Invent a different answer and sentence.'
      const retry = quizSystem(language, entries, wish, catalog, options, extra)
      const again = await askQuizDraft(retry.system, wish, retry.grammar, 0.95)
      if (isValidImprovisedQuiz(again) && !quizRepeatsCatalog(again, catalog)) return again
    }
  } catch {
    /* local fallback */
  }
  return ''
}
