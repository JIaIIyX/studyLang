import { builtinCatalog } from './catalog'
import { getSnapshot, updateSnapshot } from './persist'
import type { CatalogItem, SectionKind, WordFile, WordEntry, Language } from '../types'

function isLanguage(value: unknown): value is Language {
  return value === 'fr' || value === 'de' || value === 'en'
}

function isKind(value: unknown): value is SectionKind {
  return (
    value === 'words' ||
    value === 'cards' ||
    value === 'puzzles' ||
    value === 'sentences' ||
    value === 'translations' ||
    value === 'matching'
  )
}

function isEntry(value: unknown): value is WordEntry {
  if (!value || typeof value !== 'object') return false
  const item = value as WordEntry
  return typeof item.id === 'string' && typeof item.term === 'string'
}

export function isWordFile(value: unknown): value is WordFile {
  if (!value || typeof value !== 'object') return false
  const file = value as WordFile
  return (
    typeof file.id === 'string' &&
    typeof file.title === 'string' &&
    isLanguage(file.language) &&
    isKind(file.kind) &&
    Array.isArray(file.entries) &&
    file.entries.every(isEntry)
  )
}

export function readCustomFiles(): WordFile[] {
  return getSnapshot().customFiles.filter(isWordFile)
}

export function saveCustomFile(file: WordFile): WordFile[] {
  const next = [file, ...readCustomFiles().filter((item) => item.id !== file.id)]
  updateSnapshot({ customFiles: next })
  return next
}

export function removeCustomFile(id: string): WordFile[] {
  const next = readCustomFiles().filter((item) => item.id !== id)
  updateSnapshot({ customFiles: next })
  return next
}

function readHiddenIds(): string[] {
  return getSnapshot().hiddenFiles
}

function hideBuiltinFile(id: string) {
  updateSnapshot({ hiddenFiles: [...new Set([...readHiddenIds(), id])] })
}

export function deleteLibraryFile(id: string) {
  removeCustomFile(id)
  if (builtinCatalog.some((item) => item.id === id)) {
    hideBuiltinFile(id)
  }
}

export function restoreLibraryFile(file: WordFile) {
  if (builtinCatalog.some((item) => item.id === file.id)) {
    updateSnapshot({ hiddenFiles: readHiddenIds().filter((id) => id !== file.id) })
  }
  saveCustomFile(file)
}

function toCatalogItem(file: WordFile, source: CatalogItem['source'], path: string): CatalogItem {
  return {
    id: file.id,
    title: file.title,
    language: file.language,
    level: file.level,
    kind: file.kind,
    path,
    description: file.description ?? 'Файл слов',
    words: file.entries.length,
    source,
  }
}

export function catalogWithUploads(): CatalogItem[] {
  const hidden = new Set(readHiddenIds())
  const uploaded = readCustomFiles()
  const uploadedIds = new Set(uploaded.map((file) => file.id))
  const customItems = uploaded.map((file) => toCatalogItem(file, 'upload', `custom:${file.id}`))
  const builtins = builtinCatalog.filter((item) => !hidden.has(item.id) && !uploadedIds.has(item.id))
  return [...customItems, ...builtins]
}

export async function loadWordFile(item: CatalogItem): Promise<WordFile> {
  const custom = readCustomFiles().find((file) => file.id === item.id)
  if (custom) return custom
  if (item.source === 'upload') throw new Error('Файл не найден')

  const response = await fetch(item.path)
  if (!response.ok) throw new Error('Не удалось открыть файл')
  const data: unknown = await response.json()
  if (!isWordFile(data)) throw new Error('Неверный формат файла слов')
  return data
}

export function filesFor(kind: SectionKind, language?: Language): CatalogItem[] {
  return catalogWithUploads().filter((item) => item.kind === kind && (!language || item.language === language))
}

export function allWordFiles(language?: Language): CatalogItem[] {
  return catalogWithUploads().filter((item) => !language || item.language === language)
}

export async function parseUploadedJson(raw: string, kind: SectionKind): Promise<WordFile> {
  const data: unknown = JSON.parse(raw)
  if (!isWordFile(data)) {
    throw new Error('Ожидается JSON с полями id, title, language, kind, entries[]')
  }
  return {
    ...data,
    kind,
    id: data.id || `upload-${crypto.randomUUID()}`,
  }
}
