import {
  CreditCard,
  Gamepad2,
  GitCompare,
  Languages,
  Layers3,
  Puzzle,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'

export const GAME_LINKS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/cards', label: 'Карточки', icon: CreditCard },
  { to: '/puzzles', label: 'Пазлы', icon: Puzzle },
  { to: '/sentences', label: 'Предложения', icon: Layers3 },
  { to: '/translations', label: 'Переводы', icon: Languages },
  { to: '/matching', label: 'Сопоставление', icon: GitCompare },
]

export function isGamePath(pathname: string) {
  return GAME_LINKS.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
}

export function GamesLabel({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ left: number; top: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const active = isGamePath(location.pathname)

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
      const width = 220
      const height = panel.current?.offsetHeight ?? 260
      let left = collapsed ? rect.right + 8 : rect.left
      left = Math.min(Math.max(8, left), window.innerWidth - width - 8)
      let top = rect.top
      if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8)
      setBox({ left, top })
    }
    update()
    const frame = requestAnimationFrame(update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, collapsed])

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
    <>
      <button
        ref={button}
        type="button"
        title="Игры"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-10 w-full items-center gap-3 rounded-xl text-sm transition ${
          collapsed ? 'justify-center px-0' : 'px-3'
        } ${
          open || active ? 'bg-cream/12 text-white' : 'text-cream/75 hover:bg-cream/8 hover:text-cream'
        }`}
      >
        <Gamepad2 className="h-[18px] w-[18px]" />
        {!collapsed && 'Игры'}
      </button>
      {open && box
        ? createPortal(
            <div
              ref={panel}
              className="fixed z-[80] w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-walnut py-1.5 text-cream shadow-[0_16px_40px_rgb(0_0_0/0.35)]"
              style={{ left: box.left, top: box.top }}
            >
              {GAME_LINKS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => {
                    setOpen(false)
                    onNavigate?.()
                  }}
                  className={({ isActive }) =>
                    `flex h-10 items-center gap-3 px-3 text-sm transition ${
                      isActive ? 'bg-cream/12 text-white' : 'text-cream/75 hover:bg-cream/8 hover:text-cream'
                    }`
                  }
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {label}
                </NavLink>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
