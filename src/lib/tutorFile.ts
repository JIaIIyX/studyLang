import { readCustomFiles, saveCustomFile } from './library'
import { asRows, asText, parseModelValue } from './modelParse'
import { fold, markedSpan, stripMarks, uid } from './normalize'
import type { ChatMessage, Language, SectionKind, VocabDraft, VocabDraftEntry, WordEntry, WordFile } from '../types'

export type TutorFileDraft = VocabDraft

export type TutorPayload = {
  reply: string
  file: TutorFileDraft | null
}

function stringsOf(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : undefined
}

function entryFromRow(value: unknown): VocabDraftEntry | null {
  if (Array.isArray(value)) {
    const term = asText(value[0])
    if (!term) return null
    const translation = asText(value[1]) || undefined
    const extra = asText(value[2])
    const tokens = extra ? extra.split(/\s+/).filter(Boolean) : undefined
    return { term, translation, tokens, puzzle: markedSpan(term) }
  }
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const term = asText(row.term)
  if (!term) return null
  const translation = asText(row.translation) || undefined
  const tokens = Array.isArray(row.tokens)
    ? row.tokens.filter((token): token is string => typeof token === 'string' && token.trim().length > 0)
    : undefined
  return {
    term,
    translation,
    tokens,
    choices: stringsOf(row.choices),
    termChoices: stringsOf(row.termChoices),
    puzzle: asText(row.puzzle) || markedSpan(term),
    heading: asText(row.heading) || undefined,
  }
}

function asDraft(value: unknown): TutorFileDraft | null {
  if (Array.isArray(value)) {
    const title = asText(value[0])
    const kind = asText(value[1])
    if (!title || (kind !== 'words' && kind !== 'sentences')) return null
    const entries = asRows(value[2])
      .map((entry) => entryFromRow(entry))
      .filter((entry): entry is VocabDraftEntry => Boolean(entry))
    if (!entries.length) return null
    const description = asText(value[3]) || undefined
    return { title, kind, description, entries }
  }

  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const title = asText(item.title)
  const kind = item.kind === 'sentences' || item.kind === 'words' ? item.kind : null
  if (!title || !kind || !Array.isArray(item.entries)) return null

  const entries = item.entries
    .map((entry) => entryFromRow(entry))
    .filter((entry): entry is VocabDraftEntry => Boolean(entry))

  if (entries.length === 0) return null
  const description = asText(item.description) || undefined
  return { title, kind, description, entries }
}

function pairsDraft(rows: unknown[], title = 'Словарь'): TutorFileDraft | null {
  const entries = rows
    .map((entry) => entryFromRow(entry))
    .filter((entry): entry is VocabDraftEntry => Boolean(entry))
  if (entries.length < 2) return null
  return { title: title.slice(0, 48) || 'Словарь', kind: 'words', entries }
}

function looksLikePairRows(value: unknown) {
  if (!Array.isArray(value) || value.length < 2) return false
  const sample = value.slice(0, 6)
  return sample.every((row) => Boolean(entryFromRow(row)))
}

function payloadFromArray(value: unknown[]): TutorPayload | null {
  if (looksLikePairRows(value)) {
    const file = pairsDraft(value)
    return file ? { reply: `Собрал словарь «${file.title}».`, file } : null
  }

  const reply = asText(value[0])
  if (!reply) return null
  if (value.length === 1 || value[1] == null) return { reply, file: null }

  if (typeof value[1] === 'string' && (value[2] === 'words' || value[2] === 'sentences')) {
    return {
      reply,
      file: asDraft([value[1], value[2], value[3], value[4]]),
    }
  }

  if (looksLikePairRows(value[1])) {
    return { reply, file: pairsDraft(value[1] as unknown[], asText(value[2]) || 'Словарь') }
  }

  return { reply, file: asDraft(value[1]) }
}

function draftFromLines(text: string, titleHint = 'Словарь'): TutorFileDraft | null {
  const rows: VocabDraftEntry[] = []
  let title = titleHint
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const titled = line.match(/^(?:title|заголовок|тема)\s*[:—–-]\s*(.+)$/i)
    if (titled?.[1]) {
      title = titled[1].trim().slice(0, 48)
      continue
    }
    const table = line.match(/^\|\s*\*?\*?(.+?)\*?\*?\s*\|\s*\*?\*?(.+?)\*?\*?\s*\|/)
    const dashed = line.match(/^(?:[-*•]\s+|\d+[.)]\s+)?(?:\*\*)?(.+?)(?:\*\*)?\s+[—–\-]\s+(?:\*\*)?(.+?)(?:\*\*)?$/)
    const cells = table || dashed
    if (!cells) continue
    const term = cells[1].replace(/\*+/g, '').trim()
    const translation = cells[2].replace(/\*+/g, '').trim()
    if (!term || !translation) continue
    if (/^слово$/i.test(term) && /^перевод$/i.test(translation)) continue
    if (/^-{2,}$/.test(term) || /^-{2,}$/.test(translation)) continue
    rows.push({ term, translation, puzzle: markedSpan(term) })
  }
  return pairsDraft(rows, title)
}

export function parseTutorPayload(text: string): TutorPayload {
  const value = parseModelValue(text)
  if (Array.isArray(value)) {
    const parsed = payloadFromArray(value)
    if (parsed?.file) return parsed
    const file = draftFromLines(text, asText(Array.isArray(value) ? value[1] : '') || 'Словарь')
    return { reply: parsed?.reply || text, file }
  }
  if (value && typeof value === 'object') {
    const data = value as { reply?: unknown; file?: unknown; title?: unknown; entries?: unknown }
    const reply = asText(data.reply)
    const file = asDraft(data.file) || asDraft(data) || (looksLikePairRows(data.entries) ? pairsDraft(data.entries as unknown[], asText(data.title) || 'Словарь') : null)
    if (file) return { reply: reply || `Собрал словарь «${file.title}».`, file }
    if (reply) {
      const fromText = draftFromLines(text, asText(data.title) || 'Словарь')
      return { reply, file: fromText }
    }
  }
  const file = draftFromLines(text)
  return { reply: file ? `Собрал словарь «${file.title}».` : text, file }
}

export function vocabTitleFromWish(text: string) {
  const wish = text.replace(/\s+/g, ' ').trim()
  const named = wish.match(/(?:про|на тему|about|тема[:\s]+)\s*([^.,!?]+)/i)
  if (named?.[1]) return named[1].trim().slice(0, 40)
  const leftover = wish
    .replace(/(?:придумай|составь|собери|создай|дай|дайте|нужно|хочу|мне|слов(?:арь|а|о)?|фраз\w*|набор|коллекц\w*|vocabulary|flashcards?|\d+|пять|шесть|семь|восемь|девять|десять)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return leftover.slice(0, 40) || 'Словарь'
}

export function saveTutorDraft(language: Language, draft: TutorFileDraft): WordFile {
  const kind: SectionKind = draft.kind
  const entries: WordEntry[] = draft.entries.map((entry) => ({
    id: uid('word'),
    term: entry.term,
    translation: entry.translation,
    tokens:
      kind === 'sentences'
        ? (entry.tokens?.length ? entry.tokens : entry.term.split(/\s+/)).map(stripMarks).filter(Boolean)
        : undefined,
    choices: entry.choices,
    termChoices: entry.termChoices,
    puzzle: entry.puzzle || markedSpan(entry.term),
    heading: entry.heading,
  }))

  const file: WordFile = {
    id: uid(kind),
    title: draft.title,
    language,
    kind,
    description: draft.description || 'Набор от репетитора',
    entries,
  }
  saveCustomFile(file)
  return file
}

function sameCollection(file: WordFile, language: Language, title: string) {
  return file.language === language && file.kind === 'words' && fold(file.title) === fold(title)
}

function sameTerm(entry: WordEntry, term: string) {
  const left = fold(stripMarks(entry.term))
  const right = fold(term)
  if (left === right) return true
  const lastLeft = left.split(' ').at(-1)
  const lastRight = right.split(' ').at(-1)
  return Boolean(lastLeft && lastLeft === lastRight && lastLeft.length >= 3)
}

export function dialogueCollectionTitle(title?: string) {
  return title?.trim() || 'Диалог'
}

export function collectionHasTerm(language: Language, title: string, term: string) {
  const name = dialogueCollectionTitle(title)
  const file = readCustomFiles().find((item) => sameCollection(item, language, name))
  return Boolean(file?.entries.some((entry) => sameTerm(entry, term)))
}

export function addWordToDialogueCollection(
  language: Language,
  title: string,
  entry: { term: string; translation?: string; pos?: string },
): WordFile {
  const name = dialogueCollectionTitle(title)
  const term = stripMarks(entry.term).trim()
  const translation = entry.translation?.trim()
  const existing = readCustomFiles().find((item) => sameCollection(item, language, name))

  if (existing) {
    if (existing.entries.some((item) => sameTerm(item, term))) return existing
    const next: WordFile = {
      ...existing,
      entries: [
        ...existing.entries,
        { id: uid('word'), term, translation, pos: entry.pos },
      ],
    }
    saveCustomFile(next)
    return next
  }

  const file: WordFile = {
    id: uid('words'),
    title: name,
    language,
    kind: 'words',
    description: 'Слова из диалога',
    entries: [{ id: uid('word'), term, translation, pos: entry.pos }],
  }
  saveCustomFile(file)
  return file
}

export function termKey(term: string) {
  return fold(term)
}

export function takenTermKeys(files: WordFile[], messages: ChatMessage[]) {
  const keys = new Set<string>()
  const add = (term: string) => {
    const key = termKey(term)
    if (key) keys.add(key)
  }
  for (const file of files) {
    for (const entry of file.entries) add(entry.term)
  }
  for (const message of messages) {
    for (const entry of message.fileDraft?.entries ?? []) add(entry.term)
  }
  return keys
}

export function draftTermKeys(messages: ChatMessage[]) {
  const keys = new Set<string>()
  for (const message of messages) {
    for (const entry of message.fileDraft?.entries ?? []) {
      const key = termKey(entry.term)
      if (key) keys.add(key)
    }
  }
  return keys
}

export function knownTermsLine(files: WordFile[], messages: ChatMessage[], limit = 40, wish = '') {
  const needles = fold(wish)
    .split(/[^a-zа-яё0-9]+/i)
    .filter((item) => item.length >= 3)
  const terms: string[] = []
  const later: string[] = []
  const seen = new Set<string>()
  const add = (term: string, haystack = '') => {
    const key = termKey(term)
    const label = stripMarks(term)
    if (!key || seen.has(key) || !label) return
    seen.add(key)
    const blob = fold(`${term} ${haystack}`)
    if (needles.length && needles.some((item) => blob.includes(item))) terms.push(label)
    else later.push(label)
  }
  for (const file of files) {
    const extra = `${file.title} ${file.description ?? ''}`
    for (const entry of file.entries) add(entry.term, `${extra} ${entry.translation ?? ''}`)
  }
  for (const message of messages) {
    for (const entry of message.fileDraft?.entries ?? []) add(entry.term, entry.translation ?? '')
  }
  return [...terms, ...later].slice(0, limit).join(', ')
}

export function uniqueVocab(draft: VocabDraft, taken: Set<string>): VocabDraft | null {
  const seen = new Set(taken)
  const entries: VocabDraftEntry[] = []
  for (const entry of draft.entries) {
    const key = termKey(entry.term)
    if (!key || seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
  }
  if (!entries.length) return null
  return { ...draft, entries }
}

export function vocabTableMarkdown(draft: VocabDraft) {
  const left = draft.kind === 'sentences' ? 'Фраза' : 'Слово'
  return [
    `| ${left} | Перевод |`,
    '| --- | --- |',
    ...draft.entries.map((entry) => `| **${stripMarks(entry.term)}** | ${stripMarks(entry.translation || '—')} |`),
  ].join('\n')
}

export function withoutMarkdownTable(text: string) {
  return text
    .split('\n')
    .filter((line) => !/^\s*\|/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function looksLikeVocabLine(line: string) {
  const text = line.trim()
  if (!text) return false
  if (/^\s*\*\*ответы?\*\*\s*$/i.test(text)) return true
  if (/^\s*\|/.test(text)) return true
  if (/^[-*•]\s+/.test(text)) return true
  if (/^\d+[.)]\s+\S+/.test(text)) return true
  if (/\s[—–-]\s/.test(text) && text.length < 80) return true
  if (/\*\*[^*]+\*\*/.test(text) && text.length < 80) return true
  return false
}

export function vocabPreface(reply: string, title: string) {
  const cleaned = withoutMarkdownTable(reply)
    .split('\n')
    .filter((line) => !looksLikeVocabLine(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim() ?? ''
  if (sentence && sentence.length <= 160) return sentence
  return `Собрал словарь «${title}».`
}
