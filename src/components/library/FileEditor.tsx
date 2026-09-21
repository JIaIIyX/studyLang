import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { GripVertical, Plus, X } from 'lucide-react'
import { applyTranslations, isRussian, translateRussianTerms } from '../../lib/autoTranslate'
import { allowDrop, beginDrag, endDrag, peekDrag, takeDrag } from '../../lib/dnd'
import { uid } from '../../lib/normalize'
import { languageMeta } from '../../lib/languages'
import type { WordFile } from '../../types'

type Draft = { id: string; term: string; translation: string; heading: string }
type WordSort = 'manual' | 'term' | 'translation' | 'group'

type Props = {
  file: WordFile
  onClose: () => void
  onSave: (file: WordFile) => void
  onDelete?: () => void
}

function sortDrafts(items: Draft[], sort: WordSort) {
  if (sort === 'manual') return items
  return [...items].sort((left, right) => {
    if (sort === 'group') {
      return left.heading.localeCompare(right.heading, 'ru') || left.term.localeCompare(right.term, 'ru')
    }
    if (sort === 'translation') {
      return left.translation.localeCompare(right.translation, 'ru') || left.term.localeCompare(right.term, 'ru')
    }
    return left.term.localeCompare(right.term, 'ru')
  })
}

function bucketsOf(words: Draft[], extra: string[]) {
  const order: string[] = []
  const seen = new Set<string>()
  const addName = (name: string) => {
    const key = name.trim()
    if (!key || seen.has(key.toLowerCase())) return
    seen.add(key.toLowerCase())
    order.push(key)
  }
  extra.forEach(addName)
  words.forEach((word) => addName(word.heading))
  const named = order.map((name) => ({
    name,
    items: words.filter((word) => word.heading.trim().toLowerCase() === name.toLowerCase()),
  }))
  return { named, loose: words.filter((word) => !word.heading.trim()) }
}

export function FileEditor({ file, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(file.title)
  const [words, setWords] = useState<Draft[]>(
    file.entries.map((entry) => ({
      id: entry.id,
      term: entry.term,
      translation: entry.translation ?? '',
      heading: entry.heading ?? '',
    })),
  )
  const [sort, setSort] = useState<WordSort>('manual')
  const [groupDraft, setGroupDraft] = useState('')
  const [extraGroups, setExtraGroups] = useState<string[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overGroup, setOverGroup] = useState<string | null>(null)
  const enters = useRef<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const firstEmptyRef = useRef<HTMLInputElement | null>(null)
  const lang = languageMeta(file.language)
  useEffect(() => {
    const id = window.requestAnimationFrame(() => firstEmptyRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [])
  const needsTranslate = words.some((word) => isRussian(word.term) && !word.translation.trim())
  const shown = useMemo(() => sortDrafts(words, sort), [words, sort])
  const buckets = useMemo(() => bucketsOf(shown, extraGroups), [shown, extraGroups])

  const patch = (id: string, next: Partial<Draft>) => {
    setWords((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)))
  }

  const moveToGroup = (wordId: string, heading: string) => {
    setWords((prev) => prev.map((item) => (item.id === wordId ? { ...item, heading } : item)))
  }

  const addGroup = () => {
    const heading = groupDraft.trim()
    if (!heading) return
    setExtraGroups((prev) => (prev.some((name) => name.toLowerCase() === heading.toLowerCase()) ? prev : [...prev, heading]))
    setGroupDraft('')
  }

  const save = async () => {
    const drafts = sortDrafts(words, sort)
      .map((word) => ({
        ...word,
        term: word.term.trim(),
        translation: word.translation.trim(),
        heading: word.heading.trim(),
      }))
      .filter((word) => word.term)
    if (drafts.length === 0) return

    setBusy(true)
    try {
      const translated = await translateRussianTerms(file.language, drafts)
      const entries = drafts.map((word) => {
        const previous = file.entries.find((entry) => entry.id === word.id)
        const base =
          previous && previous.term === word.term
            ? { ...previous, translation: word.translation || previous.translation, heading: word.heading || undefined }
            : {
                id: word.id,
                term: word.term,
                translation: word.translation || undefined,
                heading: word.heading || undefined,
              }
        return applyTranslations([base], translated)[0]
      })
      onSave({ ...file, title: title.trim() || file.title, entries })
    } finally {
      setBusy(false)
    }
  }

  const dropOn = (heading: string) => (event: DragEvent) => {
    const wordId = takeDrag(event, 'word')
    enters.current[heading] = 0
    setOverGroup(null)
    if (wordId) moveToGroup(wordId, heading)
  }

  const hoverGroup = (key: string) => ({
    onDragEnter: (event: DragEvent) => {
      if (!peekDrag('word')) return
      event.preventDefault()
      enters.current[key] = (enters.current[key] ?? 0) + 1
      setOverGroup(key)
    },
    onDragOver: (event: DragEvent) => {
      if (!peekDrag('word')) return
      allowDrop(event)
    },
    onDragLeave: () => {
      enters.current[key] = Math.max(0, (enters.current[key] ?? 0) - 1)
      if (enters.current[key] === 0) setOverGroup((current) => (current === key ? null : current))
    },
  })

  const renderRow = (word: Draft, index: number) => (
    <li
      key={word.id}
      className={`flex items-center gap-2 ${draggingId === word.id ? 'opacity-40' : ''}`}
    >
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(event) => {
          beginDrag(event, 'word', word.id)
          setDraggingId(word.id)
        }}
        onDragEnd={() => {
          endDrag()
          setDraggingId(null)
          setOverGroup(null)
        }}
        className="flex h-9 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink active:cursor-grabbing"
        aria-label="Перетащить в группу"
        title="Перетащить в группу"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <span className="w-6 shrink-0 text-xs text-muted">{String(index + 1).padStart(2, '0')}</span>
      <input
        value={word.term}
        onChange={(event) => patch(word.id, { term: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            setWords((prev) => [...prev, { id: uid('word'), term: '', translation: '', heading: word.heading }])
          }
        }}
        ref={!word.term.trim() && index === 0 ? firstEmptyRef : undefined}
        placeholder={`${String(file.language).toUpperCase()} слово`}
        className="font-study h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-lg outline-none focus:ring-2 focus:ring-terracotta/30"
      />
      <input
        value={word.translation}
        onChange={(event) => patch(word.id, { translation: event.target.value })}
        placeholder="RU перевод"
        className="font-study h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-lg outline-none focus:ring-2 focus:ring-terracotta/30"
      />
      <button
        type="button"
        onClick={() => setWords((prev) => prev.filter((item) => item.id !== word.id))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink"
        aria-label="Убрать слово"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  )

  let index = 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-walnut/40" aria-label="Закрыть" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-terracotta">
              {lang.flag} коллекция
            </p>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Заголовок коллекции"
              className="font-display mt-1 w-full bg-transparent text-3xl italic outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-sm text-muted">
            Создайте группу и перетащите слова за шесть точек. Русские слова при сохранении сами получат перевод на{' '}
            {lang.label.toLowerCase()}.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as WordSort)}
              className="h-10 rounded-xl border border-line bg-canvas px-3 text-sm outline-none"
            >
              <option value="manual">Как в списке</option>
              <option value="term">По слову</option>
              <option value="translation">По переводу</option>
              <option value="group">По группе</option>
            </select>
            <input
              value={groupDraft}
              onChange={(event) => setGroupDraft(event.target.value)}
              placeholder="Новая группа, например «Кафе»"
              className="h-10 min-w-[160px] flex-1 rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:ring-2 focus:ring-terracotta/30"
            />
            <button type="button" onClick={addGroup} className="h-10 rounded-xl border border-line px-3 text-sm">
              Добавить группу
            </button>
          </div>

          <div className="mb-2 flex gap-2 pl-[4.25rem] pr-11 text-[11px] uppercase tracking-[0.14em] text-muted">
            <span className="flex-1">{String(file.language).toUpperCase()} слово</span>
            <span className="flex-1">RU перевод</span>
          </div>

          {buckets.named.map((bucket) => {
            const key = bucket.name
            return (
              <section
                key={key}
                className={`mb-4 rounded-2xl border border-dashed p-3 ${
                  overGroup === key ? 'border-terracotta bg-terracotta/8' : 'border-line'
                }`}
                {...hoverGroup(key)}
                onDrop={dropOn(key)}
              >
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <h3 className="font-display text-xl italic">{bucket.name}</h3>
                  <button
                    type="button"
                    className="text-[11px] text-muted hover:text-terracotta"
                    onClick={() => {
                      setExtraGroups((prev) => prev.filter((name) => name !== bucket.name))
                      setWords((prev) =>
                        prev.map((item) =>
                          item.heading.trim().toLowerCase() === bucket.name.toLowerCase()
                            ? { ...item, heading: '' }
                            : item,
                        ),
                      )
                    }}
                  >
                    Убрать группу
                  </button>
                </div>
                <ol className="space-y-2">
                  {bucket.items.map((word) => renderRow(word, (index += 1) - 1))}
                  {bucket.items.length === 0 && (
                    <p className="rounded-xl bg-canvas px-3 py-6 text-center text-sm text-muted">
                      Перетащите слово сюда
                    </p>
                  )}
                </ol>
              </section>
            )
          })}

          <section
            className={`rounded-2xl border border-dashed p-3 ${
              overGroup === '' ? 'border-terracotta bg-terracotta/8' : buckets.named.length ? 'border-line' : 'border-transparent p-0'
            }`}
            {...(buckets.named.length ? hoverGroup('') : {})}
            onDrop={buckets.named.length ? dropOn('') : undefined}
          >
            {buckets.named.length > 0 && (
              <h3 className="font-display mb-2 px-1 text-xl italic">Без группы</h3>
            )}
            <ol className="space-y-2">
              {buckets.loose.map((word) => renderRow(word, (index += 1) - 1))}
            </ol>
          </section>

          <button
            type="button"
            onClick={() =>
              setWords((prev) => [
                ...prev,
                { id: uid('word'), term: '', translation: '', heading: prev.at(-1)?.heading ?? '' },
              ])
            }
            className="mt-4 flex items-center gap-2 text-sm text-muted hover:text-terracotta"
          >
            <Plus className="h-4 w-4" />
            Добавить слово
          </button>
        </div>

        <div className="flex gap-2 border-t border-line px-5 py-4">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="h-11 rounded-xl border border-line px-4 text-terracotta hover:bg-[#f6e4d8] disabled:opacity-60"
            >
              Удалить
            </button>
          )}
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-line" disabled={busy}>
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="h-11 flex-1 rounded-xl bg-terracotta font-medium text-white disabled:opacity-60"
          >
            {busy && needsTranslate ? 'Переводим…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
