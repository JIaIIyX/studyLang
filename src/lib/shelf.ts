import { uid } from './normalize'
import { getSnapshot, updateSnapshot } from './persist'
import type { Language } from '../types'

export const SHELF_SORTS = ['title', 'words', 'progress', 'manual'] as const
export type ShelfSort = (typeof SHELF_SORTS)[number]

export type ShelfGroup = {
  id: string
  name: string
}

export type LanguageShelf = {
  groups: ShelfGroup[]
  fileGroup: Record<string, string>
  order: string[]
  sort: ShelfSort
}

export type ShelfSection<T> = {
  group: ShelfGroup | null
  items: T[]
}

export type ShelfProgress = Record<string, { known: number; total: number }>

const EMPTY: LanguageShelf = { groups: [], fileGroup: {}, order: [], sort: 'title' }

type ShelfStore = Partial<Record<Language, LanguageShelf>>

function isSort(value: unknown): value is ShelfSort {
  return value === 'title' || value === 'words' || value === 'progress' || value === 'manual'
}

function asGroup(value: unknown): ShelfGroup | null {
  if (!value || typeof value !== 'object') return null
  const item = value as { id?: unknown; name?: unknown }
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  if (!name) return null
  return { id: item.id, name }
}

function asShelf(value: unknown): LanguageShelf {
  if (!value || typeof value !== 'object') return { ...EMPTY, fileGroup: {}, order: [] }
  const item = value as Partial<LanguageShelf>
  const groups = Array.isArray(item.groups)
    ? item.groups.map(asGroup).filter((group): group is ShelfGroup => Boolean(group))
    : []
  const known = new Set(groups.map((group) => group.id))
  const fileGroup: Record<string, string> = {}
  if (item.fileGroup && typeof item.fileGroup === 'object') {
    for (const [id, groupId] of Object.entries(item.fileGroup)) {
      if (typeof groupId === 'string' && known.has(groupId)) fileGroup[id] = groupId
    }
  }
  const order = Array.isArray(item.order) ? item.order.filter((id): id is string => typeof id === 'string') : []
  return {
    groups,
    fileGroup,
    order,
    sort: isSort(item.sort) ? item.sort : 'title',
  }
}

function readStore(): ShelfStore {
  const parsed = getSnapshot().shelf
  if (!parsed || typeof parsed !== 'object') return {}
  const store: ShelfStore = {}
  for (const id of ['fr', 'de', 'en'] as const) {
    const value = (parsed as Record<string, unknown>)[id]
    if (value) store[id] = asShelf(value)
  }
  return store
}

function writeStore(store: ShelfStore) {
  updateSnapshot({ shelf: store })
}

export function loadShelf(language: Language): LanguageShelf {
  return asShelf(readStore()[language])
}

export function saveShelf(language: Language, shelf: LanguageShelf) {
  writeStore({ ...readStore(), [language]: shelf })
  return shelf
}

export function sortLabel(sort: ShelfSort) {
  if (sort === 'words') return 'По числу слов'
  if (sort === 'progress') return 'По прогрессу'
  if (sort === 'manual') return 'Вручную'
  return 'По названию'
}

function compareItems<T extends { id: string; title: string; words: number }>(
  left: T,
  right: T,
  shelf: LanguageShelf,
  progress?: ShelfProgress,
) {
  if (shelf.sort === 'words') return right.words - left.words || left.title.localeCompare(right.title, 'ru')
  if (shelf.sort === 'progress') {
    const leftStats = progress?.[left.id]
    const rightStats = progress?.[right.id]
    const leftRatio = leftStats && leftStats.total ? leftStats.known / leftStats.total : -1
    const rightRatio = rightStats && rightStats.total ? rightStats.known / rightStats.total : -1
    return rightRatio - leftRatio || left.title.localeCompare(right.title, 'ru')
  }
  if (shelf.sort === 'manual') {
    const leftIndex = shelf.order.indexOf(left.id)
    const rightIndex = shelf.order.indexOf(right.id)
    const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
    const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex
    return leftRank - rightRank || left.title.localeCompare(right.title, 'ru')
  }
  return left.title.localeCompare(right.title, 'ru')
}

export function organizeShelf<T extends { id: string; title: string; words: number }>(
  items: T[],
  shelf: LanguageShelf,
  progress?: ShelfProgress,
): ShelfSection<T>[] {
  const byGroup = new Map<string | null, T[]>()
  byGroup.set(null, [])
  for (const group of shelf.groups) byGroup.set(group.id, [])

  for (const item of items) {
    const groupId = shelf.fileGroup[item.id]
    const key = groupId && byGroup.has(groupId) ? groupId : null
    byGroup.get(key)?.push(item)
  }

  const sortPart = (part: T[]) => [...part].sort((left, right) => compareItems(left, right, shelf, progress))

  const loose = sortPart(byGroup.get(null) ?? [])
  if (shelf.groups.length === 0) return [{ group: null, items: loose }]
  return [
    ...shelf.groups.map((group) => ({
      group,
      items: sortPart(byGroup.get(group.id) ?? []),
    })),
    { group: null, items: loose },
  ]
}

export function addGroup(shelf: LanguageShelf, name: string): LanguageShelf {
  const trimmed = name.trim()
  if (!trimmed) return shelf
  return {
    ...shelf,
    groups: [...shelf.groups, { id: uid('group'), name: trimmed }],
  }
}

export function renameGroup(shelf: LanguageShelf, id: string, name: string): LanguageShelf {
  const trimmed = name.trim()
  if (!trimmed) return shelf
  return {
    ...shelf,
    groups: shelf.groups.map((group) => (group.id === id ? { ...group, name: trimmed } : group)),
  }
}

export function deleteGroup(shelf: LanguageShelf, id: string): LanguageShelf {
  const fileGroup = { ...shelf.fileGroup }
  for (const [fileId, groupId] of Object.entries(fileGroup)) {
    if (groupId === id) delete fileGroup[fileId]
  }
  return {
    ...shelf,
    groups: shelf.groups.filter((group) => group.id !== id),
    fileGroup,
  }
}

function placeInOrder(order: string[], fileId: string, beforeId?: string | null) {
  const without = order.filter((id) => id !== fileId)
  if (!beforeId) return [...without, fileId]
  const index = without.indexOf(beforeId)
  if (index === -1) return [...without, fileId]
  return [...without.slice(0, index), fileId, ...without.slice(index)]
}

export function moveFile(
  shelf: LanguageShelf,
  fileId: string,
  groupId: string | null,
  beforeId?: string | null,
): LanguageShelf {
  const fileGroup = { ...shelf.fileGroup }
  if (groupId && shelf.groups.some((group) => group.id === groupId)) fileGroup[fileId] = groupId
  else delete fileGroup[fileId]
  return {
    ...shelf,
    fileGroup,
    order: placeInOrder(shelf.order, fileId, beforeId),
    sort: beforeId || shelf.sort === 'manual' ? 'manual' : shelf.sort,
  }
}

export function setSort(shelf: LanguageShelf, sort: ShelfSort): LanguageShelf {
  return { ...shelf, sort }
}
