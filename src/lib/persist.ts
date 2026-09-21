import { clampVoiceVolume } from './speech'
import { emptyWordIgnore, parseWordIgnore, type WordIgnoreState } from './wordIgnoreState'
import type { Chat, ChatMemory, FileProgress, Language, ThemeMode, WordFile } from '../types'

export type UserSnapshot = {
  displayName: string
  language: Language
  theme: ThemeMode
  tutorPrompt: string
  voiceVolume: number
  sidebarCollapsed: boolean
  chats: Chat[]
  progress: Record<string, FileProgress>
  customFiles: WordFile[]
  hiddenFiles: string[]
  homework: unknown[]
  advice: unknown
  shelf: unknown
  wordIgnore: WordIgnoreState
}

const LOCAL_KEYS = {
  state: 'studylang.state',
  progress: 'studylang.progress',
  custom: 'studylang.custom-files',
  hidden: 'studylang.hidden-files',
  homework: 'studylang.homework',
  advice: 'studylang.advice',
  shelf: 'studylang.shelf',
  ignore: 'studylang.word-ignore',
  voiceOff: 'studylang.voice-starts-off',
} as const

export function readVoiceVolume(raw: unknown) {
  // Missing value → audible default. Explicit 0 stays muted.
  const saved = typeof raw === 'number' ? clampVoiceVolume(raw) : 0.85
  try {
    if (!localStorage.getItem(LOCAL_KEYS.voiceOff)) {
      localStorage.setItem(LOCAL_KEYS.voiceOff, '1')
      return 0
    }
  } catch {
    return 0
  }
  return saved
}

export function emptySnapshot(): UserSnapshot {
  return {
    displayName: 'Ученик',
    language: 'fr',
    theme: 'light',
    tutorPrompt: '',
    voiceVolume: 0.85,
    sidebarCollapsed: false,
    chats: [],
    progress: {},
    customFiles: [],
    hiddenFiles: [],
    homework: [],
    advice: { overall: {}, files: {} },
    shelf: {},
    wordIgnore: emptyWordIgnore(),
  }
}

function parseJson(raw: string | null) {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function isLanguage(value: unknown): value is Language {
  return value === 'fr' || value === 'de' || value === 'en'
}

function asChatMemory(value: unknown): ChatMemory | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Partial<ChatMemory>
  if (typeof item.summary !== 'string' || !item.summary.trim()) return undefined
  const language = isLanguage(item.language) ? item.language : undefined
  if (!language) return undefined
  return {
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
    language,
    summary: item.summary.slice(0, 800),
    goal: typeof item.goal === 'string' ? item.goal : undefined,
    level: typeof item.level === 'string' ? item.level : undefined,
    topics: Array.isArray(item.topics) ? item.topics.filter((entry): entry is string => typeof entry === 'string') : undefined,
    quiz:
      item.quiz && typeof item.quiz === 'object' && typeof item.quiz.answer === 'string'
        ? { id: String(item.quiz.id ?? ''), question: String(item.quiz.question ?? ''), answer: item.quiz.answer }
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

function asChats(value: unknown, fallback: Language): Chat[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Chat => Boolean(item && typeof item === 'object' && typeof (item as Chat).id === 'string'))
    .map((chat) => ({
      ...chat,
      language: isLanguage(chat.language) ? chat.language : fallback,
      memory: asChatMemory(chat.memory),
    }))
}

export function chatsForLanguage(chats: Chat[], language: Language) {
  return chats.filter((chat) => chat.language === language)
}

export function readLocalSnapshot(): UserSnapshot {
  const base = emptySnapshot()
  const state = parseJson(localStorage.getItem(LOCAL_KEYS.state)) as Partial<{
    chats: Chat[]
    language: Language
    theme: ThemeMode
    displayName: string
    tutorPrompt: string
    voiceVolume: number
    sidebarCollapsed: boolean
  }> | null
  if (state) {
    if (state.language === 'fr' || state.language === 'de' || state.language === 'en') base.language = state.language
    if (Array.isArray(state.chats)) base.chats = asChats(state.chats, base.language)
    if (state.theme === 'light' || state.theme === 'dark') base.theme = state.theme
    if (typeof state.displayName === 'string' && state.displayName.trim()) base.displayName = state.displayName
    if (typeof state.tutorPrompt === 'string') base.tutorPrompt = state.tutorPrompt
    if (typeof state.voiceVolume === 'number') base.voiceVolume = readVoiceVolume(state.voiceVolume)
    if (typeof state.sidebarCollapsed === 'boolean') base.sidebarCollapsed = state.sidebarCollapsed
  }
  const progress = parseJson(localStorage.getItem(LOCAL_KEYS.progress))
  if (progress && typeof progress === 'object') base.progress = progress as UserSnapshot['progress']
  const custom = parseJson(localStorage.getItem(LOCAL_KEYS.custom))
  if (Array.isArray(custom)) base.customFiles = custom as WordFile[]
  const hidden = parseJson(localStorage.getItem(LOCAL_KEYS.hidden))
  if (Array.isArray(hidden)) base.hiddenFiles = hidden.filter((item): item is string => typeof item === 'string')
  const homework = parseJson(localStorage.getItem(LOCAL_KEYS.homework))
  if (Array.isArray(homework)) base.homework = homework
  const advice = parseJson(localStorage.getItem(LOCAL_KEYS.advice))
  if (advice && typeof advice === 'object') base.advice = advice
  const shelf = parseJson(localStorage.getItem(LOCAL_KEYS.shelf))
  if (shelf && typeof shelf === 'object') base.shelf = shelf
  const ignore = parseJson(localStorage.getItem(LOCAL_KEYS.ignore))
  if (ignore) base.wordIgnore = parseWordIgnore(ignore)
  return base
}

export function isSparse(snapshot: UserSnapshot) {
  const shelf =
    snapshot.shelf && typeof snapshot.shelf === 'object' ? Object.keys(snapshot.shelf as object).length : 0
  return (
    snapshot.chats.length === 0 &&
    snapshot.customFiles.length === 0 &&
    snapshot.homework.length === 0 &&
    snapshot.hiddenFiles.length === 0 &&
    Object.keys(snapshot.progress).length === 0 &&
    shelf === 0
  )
}

function asSnapshot(value: unknown): UserSnapshot {
  const fallback = emptySnapshot()
  if (!value || typeof value !== 'object') return fallback
  const item = value as Partial<UserSnapshot>
  const language = isLanguage(item.language) ? item.language : fallback.language
  return {
    displayName: typeof item.displayName === 'string' && item.displayName.trim() ? item.displayName : fallback.displayName,
    language,
    theme: item.theme === 'dark' ? 'dark' : 'light',
    tutorPrompt: typeof item.tutorPrompt === 'string' ? item.tutorPrompt : '',
    voiceVolume: readVoiceVolume(item.voiceVolume),
    sidebarCollapsed: Boolean(item.sidebarCollapsed),
    chats: asChats(item.chats, language),
    progress: item.progress && typeof item.progress === 'object' ? item.progress : {},
    customFiles: Array.isArray(item.customFiles) ? item.customFiles : [],
    hiddenFiles: Array.isArray(item.hiddenFiles)
      ? item.hiddenFiles.filter((entry): entry is string => typeof entry === 'string')
      : [],
    homework: Array.isArray(item.homework) ? item.homework : [],
    advice: item.advice && typeof item.advice === 'object' ? item.advice : fallback.advice,
    shelf: item.shelf && typeof item.shelf === 'object' ? item.shelf : {},
    wordIgnore: parseWordIgnore(item.wordIgnore),
  }
}

let data = emptySnapshot()
let timer = 0
let saving = false
let queued = false
let apiReady = false
let unloadBound = false
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function getSnapshot() {
  return data
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function mergeChats(local: Chat[], remote: Chat[]) {
  const map = new Map<string, Chat>()
  for (const chat of local) map.set(chat.id, chat)
  for (const chat of remote) {
    const prev = map.get(chat.id)
    if (!prev || (chat.updatedAt || 0) > (prev.updatedAt || 0)) map.set(chat.id, chat)
  }
  return [...map.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export async function refreshFromApi() {
  if (!apiReady) return
  try {
    const response = await fetch('/api/me', { credentials: 'include' })
    if (!response.ok) return
    const remote = asSnapshot(await response.json())
    const chats = mergeChats(data.chats, remote.chats)
    if (chats.length === data.chats.length && chats.every((chat, index) => chat.id === data.chats[index]?.id && chat.updatedAt === data.chats[index]?.updatedAt)) {
      return
    }
    data = { ...data, chats }
    notify()
  } catch {
    /* keep local */
  }
}

export function replaceSnapshot(next: UserSnapshot, persist = true) {
  data = next
  notify()
  if (persist) scheduleSave()
}

export function updateSnapshot(patch: Partial<UserSnapshot>) {
  data = { ...data, ...patch }
  try {
    localStorage.setItem(LOCAL_KEYS.ignore, JSON.stringify(data.wordIgnore))
  } catch {
    /* quota */
  }
  notify()
  scheduleSave()
}

async function push() {
  const payload = data
  const response = await fetch('/api/me', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`save-${response.status}`)
  apiReady = true
}

export function scheduleSave() {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    void flushSave()
  }, 800)
}

export async function flushSave() {
  window.clearTimeout(timer)
  if (!apiReady) return
  if (saving) {
    queued = true
    return
  }
  saving = true
  try {
    await push()
  } catch (error) {
    apiReady = false
    console.warn('Не удалось сохранить в Postgres.', error)
  } finally {
    saving = false
    if (queued) {
      queued = false
      void flushSave()
    }
  }
}

export function resetPersist() {
  window.clearTimeout(timer)
  data = emptySnapshot()
  apiReady = false
  queued = false
  notify()
}

export async function bootPersist() {
  const local = readLocalSnapshot()
  try {
    const response = await fetch('/api/me', { credentials: 'include' })
    if (!response.ok) throw new Error(`load-${response.status}`)
    const remote = asSnapshot(await response.json())
    if (isSparse(remote) && !isSparse(local)) {
      data = local
      apiReady = true
      await push()
    } else {
      data = remote
      apiReady = true
    }
  } catch {
    data = local
  }
  notify()
  if (!unloadBound) {
    unloadBound = true
    window.addEventListener('beforeunload', () => {
      if (timer) void flushSave()
    })
  }
}
