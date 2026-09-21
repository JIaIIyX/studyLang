import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileLibrary } from '../components/library/FileLibrary'
import { StudyHeader } from '../components/library/StudyHeader'
import { useWordFile } from '../hooks/useWordFile'
import { SpeakButton } from '../components/SpeakButton'
import { languageMeta } from '../lib/languages'
import { matchesAnswer, stripMarks } from '../lib/normalize'
import { generateTranslationOptions, localTranslationOptions } from '../lib/quizOptions'
import { russianIpa } from '../lib/russianIpa'
import { useApp } from '../state/AppProvider'

export function TranslationsPage() {
  const { fileId } = useParams()
  if (!fileId) {
    return (
      <FileLibrary
        kind="translations"
        title="Переводы"
        subtitle="Выберите файл и проверьте перевод."
      />
    )
  }
  return <TranslationSession fileId={fileId} />
}

function TranslationSession({ fileId }: { fileId: string }) {
  const { item, file, error, loading } = useWordFile(fileId)
  const { markProgress, language } = useApp()
  const [index, setIndex] = useState(0)
  const [round, setRound] = useState(0)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<'idle' | 'ok' | 'bad'>('idle')
  const [direction, setDirection] = useState<'to-ru' | 'from-ru'>('to-ru')
  const [options, setOptions] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const pickedRef = useRef(false)
  const entry = file?.entries[index]

  useEffect(() => {
    setDraft('')
    setStatus('idle')
    pickedRef.current = false
    if (!file || !entry) {
      setOptions([])
      return
    }
    const local = localTranslationOptions(entry, file, direction)
    setOptions(local)
    setBusy(true)
    let alive = true
    void generateTranslationOptions(entry, file, direction, file.language).then((next) => {
      if (!alive) return
      if (!pickedRef.current) setOptions(next)
      setBusy(false)
    })
    return () => {
      alive = false
    }
  }, [entry?.id, direction, file, round])

  if (loading) return <Centered>Открываем файл…</Centered>
  if (error || !file || !entry) return <Centered>{error ?? 'В файле нет пар'}</Centered>

  const prompt = stripMarks((direction === 'to-ru' ? entry.term : entry.translation) ?? '')
  const expected = stripMarks((direction === 'to-ru' ? entry.translation : entry.term) ?? '')

  const check = () => {
    const ok = matchesAnswer(draft, expected ?? '')
    setStatus(ok ? 'ok' : 'bad')
    markProgress(fileId, entry.id, ok ? 'known' : 'review', 'translations')
  }

  const next = () => {
    setIndex((value) => (value + 1) % file.entries.length)
    setRound((value) => value + 1)
  }

  const label = direction === 'to-ru' ? 'Слово' : 'Перевод'
  const studyLang = languageMeta(file.language || language)
  const ipa = direction === 'to-ru' ? entry.ipa : russianIpa(entry.translation ?? '')

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col overflow-y-auto px-4 pb-4 pt-1">
      <StudyHeader kind="translations" item={item} file={file} index={index} compact />

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setDirection('to-ru')}
          className={`h-9 rounded-xl px-4 text-sm ${direction === 'to-ru' ? 'bg-walnut text-cream' : 'border border-line bg-surface hover:bg-hover'}`}
        >
          На русский
        </button>
        <button
          type="button"
          onClick={() => setDirection('from-ru')}
          className={`h-9 rounded-xl px-4 text-sm ${direction === 'from-ru' ? 'bg-walnut text-cream' : 'border border-line bg-surface hover:bg-hover'}`}
        >
          На {studyLang.label.toLowerCase()}
        </button>
      </div>

      <article
        className={`overflow-hidden rounded-2xl border bg-surface ${
          status === 'ok' ? 'border-accent' : status === 'bad' ? 'border-terracotta' : 'border-line'
        }`}
      >
        <section className="flex flex-col items-center justify-center px-6 py-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">{label}</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <p className="font-study text-5xl font-semibold leading-tight">{prompt || 'Перевод появится позже'}</p>
            <SpeakButton text={prompt} lang={direction === 'to-ru' ? file.language : 'ru'} />
          </div>
        </section>
        <section className="border-t border-line bg-canvas px-6 py-3 text-center">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${ipa ? 'text-muted' : 'invisible'}`}>
            Транскрипция
          </p>
          <p className={`font-study mt-1 text-xl ${ipa ? '' : 'invisible'}`}>[{ipa || '·'}]</p>
        </section>
      </article>

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault()
          check()
        }}
      >
        {options.length > 1 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((option) => {
              const picked = draft === option
              const show = status !== 'idle'
              const correct = matchesAnswer(option, expected ?? '')
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    pickedRef.current = true
                    setDraft(option)
                    const ok = matchesAnswer(option, expected ?? '')
                    setStatus(ok ? 'ok' : 'bad')
                    markProgress(fileId, entry.id, ok ? 'known' : 'review', 'translations')
                  }}
                  className={`rounded-xl border px-4 py-3 text-left font-print text-lg ${
                    show && correct
                      ? 'border-accent bg-active'
                      : show && picked
                        ? 'border-terracotta bg-hover'
                        : picked
                          ? 'border-walnut bg-canvas'
                          : 'border-line bg-surface hover:bg-hover'
                  }`}
                >
                  {option}
                </button>
              )
            })}
          </div>
        ) : (
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ваш перевод"
            className="font-print h-12 w-full rounded-xl border border-line bg-surface px-4 text-xl outline-none focus:ring-2 focus:ring-terracotta/30"
          />
        )}
        <p className="mt-2 min-h-5 text-center text-xs text-muted">
          {busy ? 'Подбираем новые варианты…' : 'Варианты новые на каждый вопрос'}
        </p>
        <p
          className={`mt-1 min-h-5 text-center text-sm ${
            status === 'ok' ? 'text-accent' : status === 'bad' ? 'text-terracotta' : ''
          }`}
        >
          {status === 'ok' ? 'Верно' : status === 'bad' ? `Правильно: ${expected || '—'}` : ''}
        </p>
        <div className="mt-3 flex gap-3">
          {options.length <= 1 && (
            <button type="submit" className="h-11 flex-1 rounded-xl bg-terracotta font-medium text-white">
              Проверить
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="h-11 flex-1 rounded-xl border border-line bg-surface font-medium hover:bg-hover"
          >
            Дальше
          </button>
        </div>
      </form>
    </div>
  )
}

function Centered({ children }: { children: string }) {
  return <div className="flex h-full items-center justify-center text-muted">{children}</div>
}
