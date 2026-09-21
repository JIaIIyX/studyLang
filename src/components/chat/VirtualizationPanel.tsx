import { Clapperboard, MessagesSquare, RotateCcw, X, Phone } from 'lucide-react'
import { SCENE_PRESETS, sceneIsOn } from '../../lib/virtualization'
import type { Virtualization } from '../../types'

type Props = {
  value: Virtualization
  onChange: (next: Virtualization) => void
  open: boolean
  onToggle: () => void
  onOpenDialogue?: () => void
  onOpenCall?: () => void
  onRestartDialogue?: () => void
}

export function VirtualizationPanel({ value, onChange, open, onToggle, onOpenDialogue, onRestartDialogue, onOpenCall }: Props) {
  const active = sceneIsOn(value)

  return (
    <div className="mb-3 rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Clapperboard className="h-4 w-4 shrink-0 text-terracotta" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">
              Виртуализация
            </span>
            <span className="block truncate text-sm text-muted">
              {active
                ? [value.sphere.trim(), value.backstory.trim()].filter(Boolean).join(' · ')
                : 'Где вы и кто напротив — как в жизни, не как на уроке'}
            </span>
          </span>
        </button>
        {onRestartDialogue ? (
          <button
            type="button"
            onClick={onRestartDialogue}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 text-xs font-medium hover:bg-hover"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Начать сначала
          </button>
        ) : null}
        {onOpenDialogue ? (
          <button
            type="button"
            onClick={onOpenDialogue}
            disabled={!active}
            title={active ? undefined : 'Сначала выберите сферу или пресет'}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-terracotta px-3 py-1.5 text-xs font-medium text-white hover:bg-terracotta/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MessagesSquare className="h-3.5 w-3.5" />
            Диалог
          </button>
        ) : null}
        {onOpenCall ? (
          <button
            type="button"
            onClick={onOpenCall}
            disabled={!active}
            title={active ? "Голосовой звонок как с человеком" : "Сначала выберите сферу или пресет"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 text-xs font-medium hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Phone className="h-3.5 w-3.5" />
            Звонок
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3 border-t border-line px-3.5 py-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Сфера</span>
            <input
              value={value.sphere}
              maxLength={80}
              placeholder="Кафе, отель, собеседование…"
              onChange={(event) => onChange({ ...value, sphere: event.target.value })}
              className="h-10 w-full rounded-xl border border-line bg-canvas px-3 outline-none focus:ring-2 focus:ring-terracotta/30"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Предыстория</span>
            <textarea
              value={value.backstory}
              maxLength={400}
              rows={3}
              placeholder="Кто вы и кто напротив. Например: я зашёл за кофе, напротив бариста."
              onChange={(event) => onChange({ ...value, backstory: event.target.value })}
              className="w-full resize-none rounded-xl border border-line bg-canvas px-3 py-2 outline-none focus:ring-2 focus:ring-terracotta/30"
            />
            <span className="mt-1.5 block text-xs text-muted">
              Это сцена для ролевой игры. Сообщения репетитору пишите в поле внизу страницы.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {SCENE_PRESETS.map((preset) => (
              <button
                key={preset.sphere}
                type="button"
                onClick={() => onChange(preset)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  value.sphere === preset.sphere ? 'bg-walnut text-cream' : 'bg-canvas hover:bg-hover'
                }`}
              >
                {preset.sphere}
              </button>
            ))}
            {active ? (
              <button
                type="button"
                onClick={() => onChange({ sphere: '', backstory: '' })}
                className="inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1.5 text-sm hover:bg-hover"
              >
                <X className="h-3.5 w-3.5" /> Сбросить
              </button>
            ) : null}
          </div>
          {onOpenDialogue || onOpenCall || onRestartDialogue ? (
            <div className="flex gap-2">
              {onRestartDialogue ? (
                <button
                  type="button"
                  onClick={onRestartDialogue}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm font-medium hover:bg-hover"
                >
                  <RotateCcw className="h-4 w-4" />
                  Начать сначала
                </button>
              ) : null}
                            {onOpenCall ? (
                <button
                  type="button"
                  onClick={onOpenCall}
                  disabled={!active}
                  title={active ? "Голосовой звонок как с человеком" : "Сначала выберите сферу или пресет"}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm font-medium hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Phone className="h-4 w-4" />
                  Режим звонка
                </button>
              ) : null}
{onOpenDialogue ? (
                <button
                  type="button"
                  onClick={onOpenDialogue}
                  disabled={!active}
                  title={active ? undefined : 'Сначала выберите сферу или пресет'}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-terracotta px-4 py-2.5 text-sm font-medium text-white hover:bg-terracotta/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <MessagesSquare className="h-4 w-4" />
                  Открыть диалог
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
