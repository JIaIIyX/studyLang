import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { SpeakButton } from '../components/SpeakButton'
import { FileLibrary } from '../components/library/FileLibrary'
import { StudyHeader } from '../components/library/StudyHeader'
import { useWordFile } from '../hooks/useWordFile'
import { stripMarks } from '../lib/normalize'
import { gameProgress } from '../lib/progress'
import { useApp } from '../state/AppProvider'

export function CardsPage() {
  const { fileId } = useParams()
  if (!fileId) {
    return (
      <FileLibrary
        kind="cards"
        title="Карточки"
        subtitle="Выберите файл со словами и листайте карточки."
      />
    )
  }
  return <CardsSession fileId={fileId} />
}

function CardsSession({ fileId }: { fileId: string }) {
  const { item, file, error, loading } = useWordFile(fileId)
  const { markProgress, progress } = useApp()
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const stats = gameProgress(progress[fileId], 'cards')

  const entry = file?.entries[index]
  const known = stats.knownIds.length

  const remaining = useMemo(() => file?.entries.length ?? 0, [file])

  if (loading) return <Centered>Открываем файл…</Centered>
  if (error || !file || !entry) return <Centered>{error ?? 'В файле нет слов'}</Centered>

  const next = (status: 'known' | 'review') => {
    markProgress(fileId, entry.id, status, 'cards')
    setFlipped(false)
    setIndex((value) => (value + 1) % file.entries.length)
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto px-4 pb-16 pt-2">
      <StudyHeader kind="cards" item={item} file={file} index={index} />
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="progress-bar h-full" style={{ width: `${(known / remaining) * 100}%` }} />
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => setFlipped((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setFlipped((value) => !value)
          }
        }}
        className="block w-full [perspective:1200px]"
      >
        <div className={`card-3d relative min-h-[340px] ${flipped ? 'is-flipped' : ''}`}>
          <div className="card-face absolute inset-0 overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="flex h-full flex-col">
              <section className="flex flex-1 flex-col items-center justify-center px-6">
                {entry.heading && (
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{entry.heading}</p>
                )}
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">Слово</p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <p className="font-study text-center text-6xl font-semibold leading-tight">{stripMarks(entry.term)}</p>
                  <SpeakButton text={stripMarks(entry.term)} lang={file.language} />
                </div>
                <p className="mt-4 text-sm text-muted">Нажмите, чтобы перевернуть</p>
              </section>
              {entry.ipa && (
                <section className="border-t border-line bg-canvas px-6 py-4 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Транскрипция</p>
                  <p className="font-study mt-1 text-xl">[{entry.ipa}]</p>
                </section>
              )}
            </div>
          </div>
          <div className="card-face card-back absolute inset-0 overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="flex h-full flex-col">
              <section className="flex flex-1 flex-col items-center justify-center px-6 py-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">Перевод</p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <p className="font-study text-center text-5xl font-semibold leading-tight">
                    {stripMarks(entry.translation ?? '') || 'Перевод появится позже'}
                  </p>
                  <SpeakButton text={stripMarks(entry.translation ?? '')} lang="ru" />
                </div>
              </section>
              {(entry.example || entry.exampleTranslation) && (
                <section className="border-t border-line px-6 py-4 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Пример</p>
                  <div className="mt-2 flex items-center justify-center gap-2">
                    {entry.example && <p className="font-study text-lg">{entry.example}</p>}
                    <SpeakButton text={entry.example} lang={file.language} />
                  </div>
                  {entry.exampleTranslation && <p className="mt-1 text-sm text-muted">{entry.exampleTranslation}</p>}
                </section>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => next('review')}
          className="h-12 flex-1 rounded-xl border border-line bg-surface font-medium hover:bg-hover"
        >
          Ещё повторю
        </button>
        <button type="button" onClick={() => next('known')} className="h-12 flex-1 rounded-xl bg-terracotta font-medium text-white">
          Знаю
        </button>
      </div>
    </div>
  )
}

function Centered({ children }: { children: string }) {
  return <div className="flex h-full items-center justify-center text-muted">{children}</div>
}
