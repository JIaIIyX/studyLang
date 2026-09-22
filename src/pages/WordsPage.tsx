import { useEffect, useMemo, useRef, useState } from 'react'
import { MoreHorizontal, Plus, GripVertical, Trash2, Upload } from 'lucide-react'
import { CollectionMeta } from '../components/library/CollectionMeta'
import { FileEditor } from '../components/library/FileEditor'
import { ShelfSection } from '../components/library/ShelfSection'
import { useCollectionAdvice } from '../hooks/useCollectionAdvice'
import { useShelf } from '../hooks/useShelf'
import {
  allWordFiles,
  deleteLibraryFile,
  loadWordFile,
  parseUploadedJson,
  restoreLibraryFile,
  saveCustomFile,
} from '../lib/library'
import { languageMeta } from '../lib/languages'
import { uid } from '../lib/normalize'
import { beginDrag, endDrag } from '../lib/dnd'
import { organizeShelf, SHELF_SORTS, sortLabel, type ShelfSort } from '../lib/shelf'
import { forgetTutorLibrary } from '../lib/tutor'
import { useApp } from '../state/AppProvider'
import type { CatalogItem, WordFile } from '../types'

export function WordsPage() {
  const { language } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [groupName, setGroupName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [editing, setEditing] = useState<WordFile | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [undo, setUndo] = useState<WordFile | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const undoTimer = useRef(0)
  const { shelf, setSort, addGroup, renameGroup, deleteGroup, moveFile } = useShelf(language)

  const items = useMemo(() => allWordFiles(language), [language, tick])
  const { rows, advice } = useCollectionAdvice(items)
  const statsById = useMemo(() => Object.fromEntries(rows.map((row) => [row.id, row])), [rows])
  const progress = useMemo(
    () => Object.fromEntries(rows.map((row) => [row.id, { known: row.known, total: row.total }])),
    [rows],
  )
  const sections = useMemo(() => organizeShelf(items, shelf, progress), [items, shelf, progress])
  const refresh = () => setTick((value) => value + 1)

  useEffect(() => {
    if (!menuId) return
    const close = () => setMenuId(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuId])

  useEffect(() => () => window.clearTimeout(undoTimer.current), [])

  const openFile = async (item: CatalogItem) => {
    try {
      const file = await loadWordFile(item)
      setError(null)
      setEditing(file)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось открыть файл')
    }
  }

  const removeFile = async (item: CatalogItem) => {
    const snapshot = await loadWordFile(item).catch(() => null)
    deleteLibraryFile(item.id)
    forgetTutorLibrary(language)
    setMenuId(null)
    if (editing?.id === item.id) setEditing(null)
    refresh()
    if (!snapshot) return
    setUndo(snapshot)
    window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndo(null), 6000)
  }

  const undoRemove = () => {
    if (!undo) return
    restoreLibraryFile(undo)
    forgetTutorLibrary(language)
    setUndo(null)
    window.clearTimeout(undoTimer.current)
    refresh()
  }

  const createFile = () => {
    const file: WordFile = {
      id: uid('words'),
      title: title.trim() || 'Новый набор',
      language,
      kind: 'words',
      description: 'Ваш файл слов',
      entries: [{ id: uid('word'), term: '' }],
    }
    saveCustomFile(file)
    forgetTutorLibrary(language)
    setTitle('')
    setEditing(file)
    refresh()
  }

  const dropOn = (groupId: string | null, beforeId?: string | null) => (fileId: string) => {
    moveFile(fileId, groupId, shelf.sort === 'manual' ? beforeId : null)
  }

  return (
    <div className="mx-auto h-full max-w-5xl overflow-x-hidden overflow-y-auto px-3 pb-[max(4rem,env(safe-area-inset-bottom))] pt-2 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-terracotta">полка</p>
          <h1 className="font-display mt-1 text-3xl italic md:text-4xl">Слова</h1>
          <p className="mt-2 max-w-xl text-muted">
            Возьмите карточку за шесть точек и перетащите в группу. В играх полка будет той же.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm">
            <span className="text-muted">Сортировка</span>
            <select
              value={shelf.sort}
              onChange={(event) => setSort(event.target.value as ShelfSort)}
              className="bg-transparent font-medium outline-none"
            >
              {SHELF_SORTS.map((key) => (
                <option key={key} value={key}>
                  {sortLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm"
          >
            <Upload className="h-4 w-4" />
            Загрузить JSON
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            void file.text().then(async (raw) => {
              try {
                saveCustomFile(await parseUploadedJson(raw, 'words'))
                forgetTutorLibrary(language)
                setError(null)
                refresh()
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : 'Не удалось прочитать файл')
              }
            })
            event.target.value = ''
          }}
        />
      </div>

      <form
        className="mb-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          createFile()
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Название набора"
          className="h-11 w-full min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 outline-none focus:ring-2 focus:ring-terracotta/30 sm:min-w-[220px] sm:px-4"
        />
        <button type="submit" className="flex h-11 items-center gap-2 rounded-xl bg-walnut px-4 text-sm font-semibold text-cream">
          <Plus className="h-4 w-4" />
          Создать файл
        </button>
      </form>

      <form
        className="mb-6 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          addGroup(groupName)
          setGroupName('')
        }}
      >
        <input
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
          placeholder="Название группы, например «Кафе»"
          className="h-11 w-full min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 outline-none focus:ring-2 focus:ring-terracotta/30 sm:min-w-[220px] sm:px-4"
        />
        <button type="submit" className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm">
          <Plus className="h-4 w-4" />
          Добавить группу
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-2xl bg-[#f6e4d8] px-4 py-3 text-sm text-terracotta dark:bg-[#3c2418]">{error}</div>
      )}

      {sections.map((section) => (
        <ShelfSection
          key={section.group?.id ?? 'loose'}
          group={section.group}
          count={section.items.length}
          showLooseTitle={shelf.groups.length > 0}
          editable
          onRename={(name) => section.group && renameGroup(section.group.id, name)}
          onDelete={() => section.group && deleteGroup(section.group.id)}
          onDropFile={shelf.groups.length > 0 ? dropOn(section.group?.id ?? null) : undefined}
        >
          {section.items.map((item) => {
            const lang = languageMeta(item.language)
            return (
              <article
                key={item.id}
                className={`flex h-full flex-col rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-terracotta/35 ${
                  draggingId === item.id ? 'opacity-40' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3 px-5 pt-5">
                  <div
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(event) => {
                      beginDrag(event, 'file', item.id)
                      setDraggingId(item.id)
                    }}
                    onDragEnd={() => {
                      endDrag()
                      setDraggingId(null)
                    }}
                    className="mt-1 flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink active:cursor-grabbing"
                    aria-label="Перетащить в группу"
                    title="Перетащить в группу"
                  >
                    <GripVertical className="h-5 w-5" />
                  </div>
                  <button type="button" onClick={() => void openFile(item)} className="min-w-0 flex-1 text-left">
                    <p className="font-display text-xl italic">{item.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {item.words} слов · {item.source === 'upload' ? 'ваш файл' : `${item.id}.json`}
                    </p>
                  </button>
                  <div className="relative flex shrink-0 items-center gap-1">
                    <span
                      className="rounded-md px-2 py-1 text-[11px] font-semibold text-white"
                      style={{ background: lang.swatch }}
                    >
                      {item.language.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-[#f6e4d8] hover:text-terracotta"
                      aria-label="Удалить набор"
                      onClick={(event) => {
                        event.stopPropagation()
                        void removeFile(item)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink"
                      aria-label="Ещё"
                      onClick={(event) => {
                        event.stopPropagation()
                        setMenuId((current) => (current === item.id ? null : item.id))
                      }}
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                    {menuId === item.id && (
                      <div
                        className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[0_12px_30px_rgb(42_33_24/0.12)]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="flex w-full px-3.5 py-2 text-left text-sm hover:bg-hover"
                          onClick={() => {
                            setMenuId(null)
                            void openFile(item)
                          }}
                        >
                          Открыть
                        </button>
                        {shelf.groups.length > 0 && (
                          <>
                            <p className="px-3.5 pt-2 pb-1 text-[11px] uppercase tracking-[0.14em] text-muted">В группу</p>
                            <button
                              type="button"
                              className="flex w-full px-3.5 py-2 text-left text-sm hover:bg-hover"
                              onClick={() => {
                                moveFile(item.id, null)
                                setMenuId(null)
                              }}
                            >
                              Без группы
                            </button>
                            {shelf.groups.map((group) => (
                              <button
                                key={group.id}
                                type="button"
                                className="flex w-full px-3.5 py-2 text-left text-sm hover:bg-hover"
                                onClick={() => {
                                  moveFile(item.id, group.id)
                                  setMenuId(null)
                                }}
                              >
                                {group.name}
                              </button>
                            ))}
                          </>
                        )}
                        <button
                          type="button"
                          className="flex w-full px-3.5 py-2 text-left text-sm text-terracotta hover:bg-hover"
                          onClick={() => void removeFile(item)}
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => void openFile(item)} className="flex flex-1 flex-col px-5 pb-5 pt-4 text-left">
                  {item.description && <p className="text-sm text-muted">{item.description}</p>}
                  {statsById[item.id] && <CollectionMeta stats={statsById[item.id]} advice={advice[item.id]} />}
                </button>
              </article>
            )
          })}
        </ShelfSection>
      ))}

      {editing && (
        <FileEditor
          file={editing}
          onClose={() => setEditing(null)}
          onSave={(file) => {
            saveCustomFile(file)
            forgetTutorLibrary(language)
            setEditing(null)
            refresh()
          }}
          onDelete={() => {
            const item = items.find((entry) => entry.id === editing.id)
            setEditing(null)
            if (item) void removeFile(item)
          }}
        />
      )}

      {undo && (
        <div className="fixed bottom-5 left-1/2 z-40 flex w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl bg-walnut px-4 py-3 text-cream shadow-2xl">
          <p className="min-w-0 truncate text-sm">Набор «{undo.title}» убран</p>
          <button type="button" onClick={undoRemove} className="shrink-0 text-sm font-semibold text-[#f2a56c]">
            Вернуть
          </button>
        </div>
      )}
    </div>
  )
}
