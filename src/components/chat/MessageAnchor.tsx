import { useRef, type ReactNode } from 'react'

export function MessageAnchor({
  n,
  attached,
  dark,
  onAttach,
}: {
  n: number
  attached?: boolean
  dark?: boolean
  onAttach: () => void
}) {
  return (
    <button
      type="button"
      onClick={onAttach}
      title="Цитировать в следующем сообщении"
      aria-label={attached ? `Убрать цитату #${n}` : `Цитировать сообщение ${n}`}
      className={
        dark
          ? `inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl px-2 font-mono text-[13px] ${
              attached ? 'bg-terracotta text-white' : 'text-white/55 hover:bg-white/10 hover:text-white'
            }`
          : `inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl px-2 font-mono text-[13px] ${
              attached ? 'bg-terracotta text-white' : 'text-muted hover:bg-hover hover:text-ink'
            }`
      }
    >
      <span aria-hidden="true">↳</span>
      <span>#{n}</span>
    </button>
  )
}

export function useQuotePress(onAttach: () => void, ms = 480) {
  const timer = useRef(0)
  const clear = () => window.clearTimeout(timer.current)
  return {
    onPointerDown: (event: { pointerType?: string; button?: number; target?: EventTarget | null }) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const node = event.target as HTMLElement | null
      if (node?.closest?.('button, a, input, textarea, [data-lookup-word]')) return
      clear()
      timer.current = window.setTimeout(onAttach, ms)
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (event: { preventDefault: () => void; target?: EventTarget | null }) => {
      const node = event.target as HTMLElement | null
      if (node?.closest?.('button, a, input, textarea')) return
      event.preventDefault()
      onAttach()
    },
  }
}

export function Quotable({
  onAttach,
  className,
  id,
  children,
}: {
  onAttach: () => void
  className?: string
  id?: string
  children: ReactNode
}) {
  const press = useQuotePress(onAttach)
  return (
    <article id={id} {...press} className={className}>
      {children}
    </article>
  )
}
