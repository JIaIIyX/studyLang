import { Menu, PanelLeft, Settings } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { useAccount } from '../auth/AuthGate'
import { useApp } from '../../state/AppProvider'
import { languageMeta } from '../../lib/languages'
import { ExtensionInstallButton } from './ExtensionInstall'
import { SettingsPanel } from './SettingsPanel'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileOpen,
    setMobileOpen,
    language,
    setSettingsOpen,
    displayName,
  } = useApp()
  const { account } = useAccount()
  const meta = languageMeta(language)

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-walnut/50"
            aria-label="Закрыть меню"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[272px] shadow-2xl">
            <Sidebar />
          </div>
        </div>
      )}

      <main className="paper-sheet flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between px-3 md:px-5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-hover md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Открыть меню"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="hidden h-10 w-10 items-center justify-center rounded-xl hover:bg-hover md:flex"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label="Свернуть меню"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="ml-1 flex h-9 items-center gap-2 rounded-xl border border-line bg-surface/80 px-3 text-sm font-medium hover:bg-hover"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: meta.swatch }} />
              {meta.native}
              <span className="hidden text-muted sm:inline">· {meta.label}</span>
            </button>
          </div>
          <div className="flex items-center gap-1">
            <ExtensionInstallButton compact />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-hover"
              aria-label="Настройки"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex h-10 items-center gap-2 rounded-xl px-2 hover:bg-hover"
              aria-label="Аккаунт"
            >
              {account?.picture ? (
                <img
                  src={account.picture}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-terracotta text-xs font-semibold text-white">
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-[8rem] truncate text-sm font-medium sm:block">{displayName}</span>
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </main>
      <SettingsPanel />
    </div>
  )
}
