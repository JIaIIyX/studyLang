import { Moon, Sun, X } from 'lucide-react'
import { useAccount } from '../auth/AuthGate'
import { LANGUAGES } from '../../lib/languages'
import { useApp } from '../../state/AppProvider'
import { VoiceVolumeSlider } from '../VoiceVolumeSlider'
import { ExtensionInstallButton } from './ExtensionInstall'
import { LlmUsageCard } from './LlmUsageCard'

const TUTOR_PRESETS = [
  'Учи меня активнее',
  'Больше примеров, меньше теории',
  'Говори мягче и короче',
  'Сразу проверяй меня вопросом',
]

export function SettingsPanel() {
  const {
    settingsOpen,
    setSettingsOpen,
    language,
    setLanguage,
    theme,
    setTheme,
    displayName,
    setDisplayName,
    tutorPrompt,
    setTutorPrompt,
  } = useApp()
  const { account, googleRequired, logout } = useAccount()

  if (!settingsOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-walnut/40"
        aria-label="Закрыть настройки"
        onClick={() => setSettingsOpen(false)}
      />
      <div className="relative h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-terracotta">atelier</p>
            <h2 className="font-display text-3xl italic">Настройки</h2>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {googleRequired && account ? (
          <div className="mb-6 rounded-2xl border border-line bg-canvas p-4">
            <div className="flex items-center gap-3">
              {account.picture ? (
                <img
                  src={account.picture}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 rounded-xl object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-terracotta text-sm font-semibold text-white">
                  {(account.name || displayName).slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{account.name || displayName}</p>
                {account.email ? <p className="truncate text-sm text-muted">{account.email}</p> : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-4 w-full rounded-xl border border-line bg-surface py-2.5 text-sm font-medium hover:bg-hover"
            >
              Выйти
            </button>
          </div>
        ) : null}

        <label className="mb-2 block text-sm font-medium">Как к вам обращаться</label>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="mb-6 h-11 w-full rounded-xl border border-line bg-canvas px-4 outline-none focus:ring-2 focus:ring-terracotta/30"
        />

        <label className="mb-2 block text-sm font-medium" htmlFor="tutor-prompt">
          Указание репетитору
        </label>
        <p className="mb-2 text-sm text-muted">Короткий промпт для ИИ. Например: «учи меня активнее».</p>
        <textarea
          id="tutor-prompt"
          value={tutorPrompt}
          maxLength={400}
          rows={3}
          placeholder="Учи меня активнее, чаще спрашивай и сразу давай следующее слово."
          onChange={(event) => setTutorPrompt(event.target.value)}
          className="mb-3 w-full resize-none rounded-xl border border-line bg-canvas px-4 py-3 outline-none focus:ring-2 focus:ring-terracotta/30"
        />
        <div className="mb-6 flex flex-wrap gap-2">
          {TUTOR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTutorPrompt(preset)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                tutorPrompt === preset ? 'bg-walnut text-cream' : 'bg-canvas hover:bg-hover'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        <p className="mb-2 text-sm font-medium">Язык для практики</p>
        <div className="mb-6 grid gap-2">
          {LANGUAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setLanguage(item.id); setSettingsOpen(false); }}
              className={`flex items-center justify-between rounded-xl px-4 py-3 text-left ${
                language === item.id ? 'bg-walnut text-cream' : 'bg-canvas hover:bg-hover'
              }`}
            >
              <span>
                {item.flag} {item.label}
              </span>
              <span className={`text-sm ${language === item.id ? 'text-cream/70' : 'text-muted'}`}>{item.greet}</span>
            </button>
          ))}
        </div>

        <VoiceVolumeSlider />

        <LlmUsageCard />

        <p className="mb-2 text-sm font-medium">Тема</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 ${
              theme === 'light' ? 'bg-walnut text-cream' : 'bg-canvas hover:bg-hover'
            }`}
          >
            <Sun className="h-4 w-4" /> Бумага
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 ${
              theme === 'dark' ? 'bg-walnut text-cream' : 'bg-canvas hover:bg-hover'
            }`}
          >
            <Moon className="h-4 w-4" /> Чернила
          </button>
        </div>

        <p className="mb-2 mt-8 text-sm font-medium">Расширение Chrome</p>
        <p className="mb-3 text-sm text-muted">
          Клиппер сохраняет субтитры и выделенный текст в JSON для полки «Слова».
        </p>
        <ExtensionInstallButton />

        <p className="mt-8 text-sm leading-6 text-muted">
          Файлы со словами собираются в разделе «Слова». Карточки, пазлы, предложения, переводы и сопоставление только
          берут набор с этой полки.
        </p>
      </div>
    </div>
  )
}
