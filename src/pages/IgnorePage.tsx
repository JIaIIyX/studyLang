import { useEffect, useMemo, useState } from 'react'
import { EyeOff, Plus, X } from 'lucide-react'
import { languageMeta } from '../lib/languages'
import { WORD_LEVELS, levelHint, levelLabel, levelWordCount, levelWords } from '../lib/levelLexicon'
import {
  addIgnoreWords,
  enabledLevels,
  ignoreWords,
  removeIgnoreWord,
  toggleIgnoreLevel,
} from '../lib/wordIgnore'
import { subscribe } from '../lib/persist'
import { useApp } from '../state/AppProvider'

export function IgnorePage() {
  const { language } = useApp()
  const meta = languageMeta(language)
  const [draft, setDraft] = useState('')
  const [openLevel, setOpenLevel] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    subscribe(() => setTick((value) => value + 1))
  }, [])

  const ignored = useMemo(() => ignoreWords(language), [language, tick])
  const levels = useMemo(() => enabledLevels(language), [language, tick])

  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto px-4 pb-16 pt-2 md:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-terracotta">подсветка</p>
      <h1 className="font-display mt-1 text-4xl italic">Известные слова</h1>
      <p className="mt-2 max-w-xl text-muted">
        Слова из игнора и выбранных уровней не подсвечиваются в чате. Сравнение локальное, без модели. Сейчас{' '}
        {meta.label.toLowerCase()}.
      </p>

      <section className="mt-8 rounded-3xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <EyeOff className="h-4 w-4 text-terracotta" />
          <h2 className="font-display text-2xl italic">Игнор-список</h2>
        </div>
        <p className="mb-4 text-sm text-muted">Добавьте слова через пробел, запятую или с новой строки.</p>
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            addIgnoreWords(language, draft)
            setDraft('')
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder={language === 'de' ? 'schon, wirklich, eigentlich' : 'слово, ещё слово'}
            className="min-h-12 flex-1 resize-none rounded-2xl border border-line bg-canvas px-4 py-3 outline-none focus:ring-2 focus:ring-terracotta/30"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-walnut px-4 text-sm font-medium text-cream disabled:opacity-30"
          >
            <Plus className="h-4 w-4" />
            В игнор
          </button>
        </form>
        {ignored.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Пока пусто. Можно также нажать «Не подсвечивать» в чате.</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {ignored.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => removeIgnoreWord(language, word)}
                className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 text-sm hover:bg-hover"
                title="Убрать из игнора"
              >
                {word}
                <X className="h-3.5 w-3.5 text-muted" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl italic">Готовые наборы по уровням</h2>
        <p className="mt-2 mb-4 text-sm text-muted">
          Включите уровень — эти слова перестанут подсвечиваться, как уже известные.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {WORD_LEVELS.map((level) => {
            const on = levels.includes(level)
            const count = levelWordCount(language, level)
            const open = openLevel === level
            return (
              <article key={level} className="rounded-2xl border border-line bg-canvas p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl italic">{levelLabel(level)}</p>
                    <p className="mt-1 text-sm text-muted">{levelHint(level)}</p>
                    <p className="mt-1 text-[12px] text-muted">{count} слов</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleIgnoreLevel(language, level)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      on ? 'bg-walnut text-cream' : 'bg-surface hover:bg-hover'
                    }`}
                  >
                    {on ? 'Включён' : 'Включить'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenLevel(open ? null : level)}
                  className="mt-3 text-sm text-terracotta hover:underline"
                >
                  {open ? 'Скрыть список' : 'Показать слова'}
                </button>
                {open ? (
                  <p className="mt-3 text-sm leading-7 text-ink">{levelWords(language, level).join(' · ')}</p>
                ) : null}
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
