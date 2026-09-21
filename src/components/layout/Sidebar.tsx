import { NavLink, useNavigate, useParams } from 'react-router-dom'
import {
  BarChart3,
  BookMarked,
  EyeOff,
  MessageSquareText,
  NotebookPen,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { languageMeta } from '../../lib/languages'
import { useApp } from '../../state/AppProvider'
import { GamesLabel } from './GamesLabel'
import { Mark } from '../Mark'

export function Sidebar() {
  const navigate = useNavigate()
  const { chatId } = useParams()
  const {
    chats,
    language,
    sidebarCollapsed,
    createChat,
    deleteChat,
    setMobileOpen,
  } = useApp()
  const lang = languageMeta(language)

  const startChat = () => {
    const chat = createChat()
    setMobileOpen(false)
    navigate(`/c/${chat.id}`)
  }

  const collapsed = sidebarCollapsed

  return (
    <aside
      className={`flex h-full flex-col bg-walnut text-cream ${collapsed ? 'w-[76px] px-2' : 'w-[272px] px-4'} py-4`}
    >
      <div className={`mb-5 flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <Mark className="h-8 w-8 shrink-0" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="font-display text-[20px] italic">StudyLang</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-cream/55">atelier</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={startChat}
        className={`mb-4 flex h-11 items-center gap-2 rounded-xl bg-terracotta text-sm font-semibold text-white transition hover:brightness-110 ${
          collapsed ? 'justify-center px-0' : 'px-3.5'
        }`}
      >
        <SquarePen className="h-4 w-4" />
        {!collapsed && 'Новый разговор'}
      </button>

      <nav>
        <NavLink
          to="/analytics"
          onClick={() => setMobileOpen(false)}
          title="Аналитика"
          className={({ isActive }) =>
            `flex h-10 items-center gap-3 rounded-xl text-sm transition ${
              collapsed ? 'justify-center' : 'px-3'
            } ${isActive ? 'bg-cream/12 text-white' : 'text-cream/75 hover:bg-cream/8 hover:text-cream'}`
          }
        >
          <BarChart3 className="h-[18px] w-[18px]" />
          {!collapsed && 'Аналитика'}
        </NavLink>
        <NavLink
          to="/words"
          onClick={() => setMobileOpen(false)}
          title="Слова"
          className={({ isActive }) =>
            `flex h-10 items-center gap-3 rounded-xl text-sm transition ${
              collapsed ? 'justify-center' : 'px-3'
            } ${isActive ? 'bg-cream/12 text-white' : 'text-cream/75 hover:bg-cream/8 hover:text-cream'}`
          }
        >
          <BookMarked className="h-[18px] w-[18px]" />
          {!collapsed && 'Слова'}
        </NavLink>
        <NavLink
          to="/ignore"
          onClick={() => setMobileOpen(false)}
          title="Известные слова"
          className={({ isActive }) =>
            `flex h-10 items-center gap-3 rounded-xl text-sm transition ${
              collapsed ? 'justify-center' : 'px-3'
            } ${isActive ? 'bg-cream/12 text-white' : 'text-cream/75 hover:bg-cream/8 hover:text-cream'}`
          }
        >
          <EyeOff className="h-[18px] w-[18px]" />
          {!collapsed && 'Известные'}
        </NavLink>
        <NavLink
          to="/homework"
          onClick={() => setMobileOpen(false)}
          title="Домашняя работа"
          className={({ isActive }) =>
            `flex h-10 items-center gap-3 rounded-xl text-sm transition ${
              collapsed ? 'justify-center' : 'px-3'
            } ${isActive ? 'bg-cream/12 text-white' : 'text-cream/75 hover:bg-cream/8 hover:text-cream'}`
          }
        >
          <NotebookPen className="h-[18px] w-[18px]" />
          {!collapsed && 'Домашняя работа'}
        </NavLink>

        <div className="mt-1">
          <GamesLabel collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
        </div>
      </nav>

      {!collapsed && (
        <div className="mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-cream/40">
          Журнал
        </div>
      )}

      <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {chats.length === 0 && !collapsed && (
          <p className="px-3 text-sm text-cream/45">Пока нет разговоров на {lang.label.toLowerCase()}.</p>
        )}
        {chats.map((chat) => (
          <div key={chat.id} className="group relative">
            <NavLink
              to={`/c/${chat.id}`}
              onClick={() => setMobileOpen(false)}
              title={chat.title}
              className={`flex h-9 items-center rounded-xl text-[13px] transition ${
                collapsed ? 'justify-center px-0' : 'px-3 pr-9'
              } ${chat.id === chatId ? 'bg-cream/12 text-white' : 'text-cream/70 hover:bg-cream/8 hover:text-cream'}`}
            >
              {collapsed ? <MessageSquareText className="h-4 w-4" /> : <span className="truncate">{chat.title}</span>}
            </NavLink>
            {!collapsed && (
              <button
                type="button"
                className="absolute right-1 top-1 hidden h-7 w-7 items-center justify-center rounded-lg text-cream/50 hover:bg-cream/10 hover:text-cream group-hover:flex"
                onClick={() => {
                  deleteChat(chat.id)
                  if (chat.id === chatId) navigate('/')
                }}
                aria-label="Удалить чат"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
