import { Bookmark, Check, CreditCard, Play, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { LookupText } from '../WordLookup'
import { stripMarks } from '../../lib/normalize'
import type { VocabDraft } from '../../types'

export function VocabCardsLabel({
  draft,
  saved,
  fileId,
  onSave,
}: {
  draft: VocabDraft
  saved?: boolean
  fileId?: string
  onSave?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const count = draft.entries.length
  const left = draft.kind === 'sentences' ? 'Фраза' : 'Слово'
  const studyTo = fileId ? `/cards/${fileId}` : null

  useLayoutEffect(() => {
    if (!open) {
      setBox(null)
      return
    }
    const update = () => {
      const el = button.current
      if (!el?.isConnected) {
        setOpen(false)
        return
      }
      const rect = el.getBoundingClientRect()
      const width = Math.min(22 * 16, Math.max(rect.width, 280), window.innerWidth - 24)
      const leftPos = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)
      const below = rect.bottom + 8
      const panelH = panel.current?.offsetHeight ?? 280
      const top = below + panelH > window.innerHeight - 12 ? Math.max(12, rect.top - 8 - panelH) : below
      setBox({ left: leftPos, top, width })
    }
    update()
    const frame = requestAnimationFrame(update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      const node = event.target as Node
      if (button.current?.contains(node) || panel.current?.contains(node)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
          open ? 'border-terracotta bg-terracotta/10' : 'border-line bg-canvas hover:bg-hover'
        }`}
      >
        <CreditCard className="h-3.5 w-3.5 text-terracotta" />
        Карточки
        <span className="max-w-[10rem] truncate text-muted">{draft.title}</span>
        <span className="rounded-full bg-terracotta/15 px-1.5 text-[11px] font-medium text-terracotta">{count}</span>
      </button>
      {studyTo ? (
        <Link
          to={studyTo}
          className="inline-flex items-center gap-1.5 rounded-full border border-terracotta/40 bg-terracotta/10 px-3 py-1.5 text-sm font-medium text-terracotta hover:bg-terracotta/20"
        >
          <Play className="h-3.5 w-3.5" />
          Учить карточки
        </Link>
      ) : null}

      {open && box
        ? createPortal(
            <div
              ref={panel}
              className="fixed z-[70] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_16px_40px_rgb(42_33_24/0.18)]"
              style={{ left: box.left, top: box.top, width: box.width }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">
                  {draft.title}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-hover"
                  aria-label="Закрыть"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full border-collapse text-left text-[14px]">
                  <thead>
                    <tr className="bg-canvas">
                      <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {left}
                      </th>
                      <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Перевод
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.entries.map((entry, index) => (
                      <tr key={`${entry.term}-${index}`} className="border-t border-line">
                        <td className="px-3 py-2 align-top font-medium">
                          <LookupText text={stripMarks(entry.term)} />
                        </td>
                        <td className="px-3 py-2 align-top text-muted">
                          {stripMarks(entry.translation || '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {saved ? (
                <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[12px] text-accent">
                    <Check className="h-3.5 w-3.5" />
                    На полке
                  </p>
                  {studyTo ? (
                    <Link
                      to={studyTo}
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-terracotta hover:underline"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Учить
                    </Link>
                  ) : null}
                </div>
              ) : onSave ? (
                <button
                  type="button"
                  onClick={onSave}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-line px-3 py-2 text-[13px] font-medium hover:bg-hover"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  Сохранить словарь
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
