import { useEffect } from 'react'
import { Check, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { allowDrop, beginDrag, endDrag, takeDrag } from '../../lib/dnd'
import { asStringList, asStringMap, padLines, writeDraft } from '../../lib/homeworkDraft'
import { assembleStory, type HomeworkTask } from '../../lib/homework'
import { fold } from '../../lib/normalize'

type DraftProps = {
  task: HomeworkTask
  draft: string
  onDraft: (value: string) => void
}

export function MeaningsTask({ task, draft, onDraft }: DraftProps) {
  const options = task.options ?? []
  const picked = new Set(asStringList(draft))
  const toggle = (option: string) => {
    const next = new Set(picked)
    if (next.has(option)) next.delete(option)
    else next.add(option)
    onDraft(writeDraft(options.filter((item) => next.has(item))))
  }

  return (
    <div className="mt-4 grid gap-2">
      {options.map((option) => {
        const active = picked.has(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left font-study text-base leading-6 transition sm:px-4 sm:py-3 sm:text-lg sm:leading-7 ${
              active ? 'border-terracotta bg-canvas' : 'border-line bg-surface hover:border-terracotta/35 hover:bg-hover'
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                active ? 'border-terracotta bg-terracotta text-white' : 'border-line bg-surface'
              }`}
            >
              {active ? '✓' : ''}
            </span>
            {option}
          </button>
        )
      })}
    </div>
  )
}

export function WordsTask({ task, draft, onDraft }: DraftProps) {
  const terms = task.items?.length ? task.items : []
  const map = asStringMap(draft)
  const fromRu = task.kind === 'into'
  const setValue = (term: string, value: string) => {
    onDraft(writeDraft({ ...map, [term]: value }))
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-line">
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] border-b border-line bg-canvas px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-terracotta sm:px-4 sm:py-2 sm:text-[11px] sm:tracking-[0.14em]">
        <span>{fromRu ? 'Русский' : 'Слово'}</span>
        <span>{fromRu ? 'На язык тетради' : 'Перевод'}</span>
      </div>
      {terms.map((term) => (
        <label key={term} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] items-center border-b border-line last:border-b-0">
          <span className="font-study break-words px-2 py-2 text-base sm:px-4 sm:py-3 sm:text-xl">{term}</span>
          <input
            value={map[term] ?? ''}
            onChange={(event) => setValue(term, event.target.value)}
            placeholder={fromRu ? 'на языке тетради' : 'перевод'}
            className="font-print h-11 min-w-0 border-l border-line bg-surface px-2 text-sm outline-none focus:bg-canvas focus:ring-2 focus:ring-terracotta/30 sm:h-12 sm:px-4 sm:text-base"
          />
        </label>
      ))}
    </div>
  )
}

export function RowsTask({ task, draft, onDraft }: DraftProps) {
  const words = task.rows?.length ? task.rows : []
  const lines = padLines(draft, Math.max(words.length, 5))
  const setLine = (index: number, value: string) => {
    const next = [...lines]
    next[index] = value
    onDraft(writeDraft(next))
  }

  return (
    <div className="mt-4 space-y-2">
      {words.map((word, index) => (
        <label key={`${word}-${index}`} className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">
            Строка {index + 1} · {word}
          </span>
          <input
            value={lines[index] ?? ''}
            onChange={(event) => setLine(index, event.target.value)}
            placeholder={`Предложение со словом «${word}»`}
            className="font-print mt-1 h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:ring-2 focus:ring-terracotta/30 sm:h-12 sm:px-4"
          />
        </label>
      ))}
    </div>
  )
}

export function MatchTask({ task, draft, onDraft }: DraftProps) {
  const pairs = task.pairs ?? []
  const map = asStringMap(draft)
  const used = new Set(Object.values(map).filter(Boolean))
  const pool = (task.options?.length ? task.options : pairs.map((pair) => pair.right)).filter((item) => !used.has(item))
  const dragKind = `hw-match-${task.id}`

  const place = (left: string, right: string) => {
    const next = { ...map }
    if (!right) {
      delete next[left]
    } else {
      for (const [key, value] of Object.entries(next)) {
        if (value === right && key !== left) delete next[key]
      }
      next[left] = right
    }
    onDraft(writeDraft(next))
  }

  return (
    <div className="mt-4 grid gap-3 sm:gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-2">
        {pairs.map((pair) => (
          <div
            key={pair.left}
            onDragOver={allowDrop}
            onDrop={(event) => {
              const right = takeDrag(event, dragKind)
              if (right) place(pair.left, right)
            }}
            className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
          >
            <span className="font-study min-w-0 break-words text-lg sm:flex-1 sm:text-xl">{pair.left}</span>
            <button
              type="button"
              onClick={() => map[pair.left] && place(pair.left, '')}
              className={`min-h-11 w-full rounded-lg border px-3 py-2 text-left text-sm sm:min-w-[8rem] sm:w-auto ${
                map[pair.left] ? 'border-terracotta bg-canvas font-study text-lg' : 'border-dashed border-line text-muted'
              }`}
            >
              {map[pair.left] || 'сюда перевод'}
            </button>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">Переводы</p>
        <div className="flex flex-wrap gap-2">
          {pool.map((right) => (
            <button
              key={right}
              type="button"
              draggable
              onDragStart={(event) => beginDrag(event, dragKind, right)}
              onDragEnd={endDrag}
              onClick={() => {
                const empty = pairs.find((pair) => !map[pair.left])
                if (empty) place(empty.left, right)
              }}
              className="cursor-grab rounded-xl border border-line bg-canvas px-3 py-2 font-study text-lg active:cursor-grabbing"
            >
              {right}
            </button>
          ))}
          {pool.length === 0 ? <p className="text-sm text-muted">Все карточки в строках. Нажмите перевод, чтобы снять.</p> : null}
        </div>
      </div>
    </div>
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function OrderSentence({
  text,
  words,
  correct,
}: {
  text: string
  words: string[]
  correct: boolean
}) {
  const found = [...words]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .find((word) => new RegExp(`(?:^|[^\\p{L}])${escapeRegExp(word)}(?:$|[^\\p{L}])`, 'iu').test(text))

  if (!found) {
    return (
      <p className="font-study min-w-0 flex-1 text-lg leading-7">
        {text}
        {correct ? <Check className="ml-1 inline h-4 w-4 text-accent" strokeWidth={3} /> : null}
      </p>
    )
  }

  const parts = text.split(new RegExp(`(${escapeRegExp(found)})`, 'giu'))
  return (
    <p className="font-study min-w-0 flex-1 text-lg leading-7">
      {parts.map((part, index) =>
        fold(part) === fold(found) ? (
          <span key={`${part}-${index}`} className="inline-flex items-baseline gap-1 font-semibold text-accent">
            {part}
            {correct ? <Check className="h-4 w-4 shrink-0 translate-y-[0.12em]" strokeWidth={3} /> : null}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </p>
  )
}

export function OrderTask({ task, draft, onDraft }: DraftProps) {
  const expected = task.items?.length ? task.items : []
  const current = asStringList(draft)
  const list = current.length === expected.length ? current : (task.options?.length ? task.options : expected)
  const words = task.requiredWords?.length ? task.requiredWords : task.rows ?? []
  const dragKind = `hw-order-${task.id}`

  useEffect(() => {
    if (draft.trim()) return
    const initial = task.options?.length ? task.options : task.items ?? []
    if (initial.length) onDraft(writeDraft(initial))
    // persist the shuffled order once so submit grades what the student sees
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onDraft(writeDraft(next))
  }

  const assembled = assembleStory(list)
  const original = assembleStory(expected) || task.answer || task.text || ''
  const complete = Boolean(expected.length) && fold(assembled) === fold(original)

  return (
    <div className="mt-4 space-y-2">
      {list.map((item, index) => (
        <div
          key={`${item}-${index}`}
          draggable
          onDragStart={(event) => beginDrag(event, dragKind, String(index))}
          onDragEnd={endDrag}
          onDragOver={allowDrop}
          onDrop={(event) => {
            const from = Number(takeDrag(event, dragKind))
            if (Number.isFinite(from)) move(from, index)
          }}
          className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2"
        >
          <span className="mt-2 text-muted">
            <GripVertical className="h-4 w-4" />
          </span>
          <span className="mt-1 w-6 shrink-0 text-sm font-semibold text-terracotta">{index + 1}.</span>
          <OrderSentence
            text={item}
            words={words}
            correct={Boolean(expected.length) && fold(item) === fold(expected[index] ?? '')}
          />
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              aria-label="Выше"
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Ниже"
              disabled={index === list.length - 1}
              onClick={() => move(index, index + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      {complete ? (
        <div className="rounded-2xl border border-accent/30 bg-active px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">История собралась</p>
          <p className="font-study mt-1 text-lg leading-7">{assembled}</p>
        </div>
      ) : null}
    </div>
  )
}
