import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { SpeakButton } from '../components/SpeakButton'
import { FileLibrary } from '../components/library/FileLibrary'
import { StudyHeader } from '../components/library/StudyHeader'
import { useWordFile } from '../hooks/useWordFile'
import { shuffle, stripMarks } from '../lib/normalize'
import { puzzleBlank, puzzleWord } from '../lib/puzzleWord'
import { useApp } from '../state/AppProvider'

export function PuzzlesPage() {
  const { fileId } = useParams()
  if (!fileId) {
    return (
      <FileLibrary
        kind="puzzles"
        title="Пазлы"
        subtitle="Соберите по буквам слово по теме, не всю фразу."
      />
    )
  }
  return <PuzzleSession fileId={fileId} />
}

function maskExample(example: string, term: string) {
  const core = term.replace(/^\w+\s/, '') || term
  const escaped = core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return example.replace(new RegExp(escaped, 'gi'), '…')
}

function PuzzleSession({ fileId }: { fileId: string }) {
  const { item, file, error, loading } = useWordFile(fileId)
  const { markProgress } = useApp()
  const [index, setIndex] = useState(0)
  const entry = file?.entries[index]
  const targetWord = entry ? puzzleWord(entry) : ''
  const letters = useMemo(
    () => (targetWord ? shuffle(Array.from(targetWord)) : []),
    [entry?.id, targetWord],
  )
  const [used, setUsed] = useState<number[]>([])
  const [status, setStatus] = useState<'idle' | 'ok' | 'bad'>('idle')

  useEffect(() => {
    setUsed([])
    setStatus('idle')
  }, [entry?.id])

  if (loading) return <Centered>Открываем файл…</Centered>
  if (error || !file || !entry) return <Centered>{error ?? 'В файле нет слов'}</Centered>

  const target = targetWord
  const slots = Array.from(target)
  const blank = puzzleBlank(entry.term, target)

  const pick = (letterIndex: number) => {
    if (used.includes(letterIndex) || status === 'ok') return
    const next = [...used, letterIndex]
    setUsed(next)
    const guess = next.map((i) => letters[i]).join('')
    if (guess.length === target.length) {
      const ok = guess.toLowerCase() === target.toLowerCase()
      setStatus(ok ? 'ok' : 'bad')
      if (ok) markProgress(fileId, entry.id, 'known', 'puzzles')
    } else {
      setStatus('idle')
    }
  }

  const popLast = () => {
    if (status === 'ok') return
    setUsed((prev) => prev.slice(0, -1))
    setStatus('idle')
  }

  const example = entry.example ? maskExample(entry.example, targetWord) : undefined

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col overflow-y-auto px-4 pb-4 pt-1">
      <StudyHeader kind="puzzles" item={item} file={file} index={index} compact />

      <article
        className={`rounded-2xl border bg-surface px-5 py-4 text-center ${
          status === 'ok' ? 'border-accent' : status === 'bad' ? 'border-terracotta' : 'border-line'
        }`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">
          {file.title}
        </p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <p className="font-study text-3xl font-semibold leading-tight">
            {stripMarks(entry.translation ?? '') || 'Перевод появится позже'}
          </p>
          <SpeakButton text={stripMarks(entry.translation ?? '')} lang="ru" />
        </div>
        {(example || entry.exampleTranslation) && (
          <p className="mt-1 text-sm text-muted">
            {example ? `«${example}»` : ''}
            {example && entry.exampleTranslation ? ' · ' : ''}
            {entry.exampleTranslation}
          </p>
        )}

        <div className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
          {blank.before.trim() && (
            <p className="font-study text-2xl leading-none">{blank.before.trim()}</p>
          )}
          <button
            type="button"
            onClick={popLast}
            className="inline-flex flex-wrap items-center justify-center gap-1.5"
            aria-label="Убрать последнюю букву"
          >
            {slots.map((_, slotIndex) => {
              const letterIndex = used[slotIndex]
              const filled = letterIndex !== undefined
              const next = !filled && used.length === slotIndex
              return (
                <span
                  key={slotIndex}
                  className={`font-print flex h-12 w-10 items-center justify-center rounded-xl border text-2xl ${
                    filled
                      ? 'border-walnut bg-walnut text-cream'
                      : next
                        ? 'border-terracotta/45 bg-canvas'
                        : 'border-line bg-canvas'
                  }`}
                >
                  {filled ? letters[letterIndex] : ''}
                </span>
              )
            })}
          </button>
          {blank.after.trim() && (
            <p className="font-study text-2xl leading-none">{blank.after.trim()}</p>
          )}
        </div>

        <div className="mt-2 flex min-h-5 items-center justify-center gap-1">
          <p className={`text-sm ${status === 'ok' ? 'text-accent' : status === 'bad' ? 'text-terracotta' : ''}`}>
            {status === 'ok' ? 'Верно' : status === 'bad' ? 'Соберите слово ещё раз' : ''}
          </p>
          {status === 'ok' && <SpeakButton text={targetWord} lang={file.language} />}
        </div>
      </article>

      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {letters.map((letter, letterIndex) => (
          <button
            key={`${letter}-${letterIndex}`}
            type="button"
            disabled={used.includes(letterIndex)}
            onClick={() => pick(letterIndex)}
            className="font-print h-12 min-w-12 rounded-xl bg-walnut text-xl text-cream enabled:hover:brightness-110 disabled:bg-chip disabled:text-muted"
          >
            {letter}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => {
            setUsed([])
            setStatus('idle')
          }}
          className="h-11 flex-1 rounded-xl border border-line bg-surface font-medium hover:bg-hover"
        >
          Сбросить
        </button>
        <button
          type="button"
          onClick={() => setIndex((value) => (value + 1) % file.entries.length)}
          className="h-11 flex-1 rounded-xl bg-terracotta font-medium text-white"
        >
          Дальше
        </button>
      </div>
    </div>
  )
}

function Centered({ children }: { children: string }) {
  return <div className="flex h-full items-center justify-center text-muted">{children}</div>
}
