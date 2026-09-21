import { useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { allowDrop, peekDrag, takeDrag } from '../../lib/dnd'
import type { ShelfGroup } from '../../lib/shelf'

type Props = {
  group: ShelfGroup | null
  count: number
  showLooseTitle?: boolean
  editable?: boolean
  dragKind?: string
  onRename?: (name: string) => void
  onDelete?: () => void
  onDropFile?: (fileId: string) => void
  children: ReactNode
}

export function ShelfSection({
  group,
  count,
  showLooseTitle,
  editable,
  dragKind = 'file',
  onRename,
  onDelete,
  onDropFile,
  children,
}: Props) {
  const [draft, setDraft] = useState(group?.name ?? '')
  const [editing, setEditing] = useState(false)
  const [over, setOver] = useState(false)
  const enters = useRef(0)

  const title = group?.name ?? 'Без группы'
  const droppable = Boolean(onDropFile)

  if (!group && !showLooseTitle && !droppable) {
    return <div className="grid gap-3 sm:grid-cols-2">{children}</div>
  }

  const highlight = () => {
    enters.current += 1
    setOver(true)
  }

  const unhighlight = () => {
    enters.current = Math.max(0, enters.current - 1)
    if (enters.current === 0) setOver(false)
  }

  return (
    <section
      className={`mb-6 rounded-2xl border border-dashed p-3 transition ${
        over ? 'border-terracotta bg-terracotta/8' : droppable ? 'border-line' : 'border-transparent'
      }`}
      onDragEnter={(event) => {
        if (!droppable || !peekDrag(dragKind)) return
        event.preventDefault()
        highlight()
      }}
      onDragOver={(event) => {
        if (!droppable || !peekDrag(dragKind)) return
        allowDrop(event)
      }}
      onDragLeave={unhighlight}
      onDrop={(event) => {
        if (!onDropFile) return
        enters.current = 0
        setOver(false)
        const fileId = takeDrag(event, dragKind)
        if (fileId) onDropFile(fileId)
      }}
    >
      {(group || showLooseTitle) && (
        <div className="mb-3 flex items-center gap-2 px-1">
          {editing && group ? (
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                onRename?.(draft)
                setEditing(false)
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                autoFocus
                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-terracotta/30"
              />
              <button type="submit" className="h-9 rounded-lg bg-walnut px-3 text-sm text-cream">
                Ок
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="min-w-0 text-left"
              onClick={() => {
                if (!editable || !group) return
                setDraft(group.name)
                setEditing(true)
              }}
            >
              <h2 className="font-display text-2xl italic">{title}</h2>
              <p className="text-[11px] text-muted">
                {count} наборов{droppable ? ' · перетащите карточку сюда' : ''}
              </p>
            </button>
          )}
          {editable && group && !editing && (
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-[#f6e4d8] hover:text-terracotta"
              aria-label="Удалить группу"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      <div className={`grid gap-3 sm:grid-cols-2 ${count === 0 && droppable ? 'min-h-28' : ''}`}>
        {children}
        {count === 0 && droppable && (
          <p className="col-span-full flex items-center justify-center rounded-xl bg-canvas px-4 py-8 text-sm text-muted">
            Перетащите набор в эту группу
          </p>
        )}
      </div>
    </section>
  )
}
