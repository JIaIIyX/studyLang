import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { SpeakButton } from '../components/SpeakButton'
import { FileLibrary } from '../components/library/FileLibrary'
import { StudyHeader } from '../components/library/StudyHeader'
import { useWordFile } from '../hooks/useWordFile'
import { stripMarks } from '../lib/normalize'
import { generateSentenceChips, localSentenceChips, type SentenceChip } from '../lib/quizOptions'
import { useApp } from '../state/AppProvider'

export function SentencesPage() {
  const { fileId } = useParams()
  if (!fileId) {
    return (
      <FileLibrary
        kind="sentences"
        title="Предложения"
        subtitle="Выберите файл и соберите фразы из частей."
      />
    )
  }
  return <SentenceSession fileId={fileId} />
}

function SentenceSession({ fileId }: { fileId: string }) {
  const { item, file, error, loading } = useWordFile(fileId)
  const { markProgress } = useApp()
  const [index, setIndex] = useState(0)
  const [round, setRound] = useState(0)
  const entry = file?.entries[index]
  const [pool, setPool] = useState<SentenceChip[]>([])
  const [busy, setBusy] = useState(false)
  const [used, setUsed] = useState<number[]>([])
  const [status, setStatus] = useState<'idle' | 'ok' | 'bad'>('idle')
  const usedRef = useRef<number[]>([])

  useEffect(() => {
    setUsed([])
    usedRef.current = []
    setStatus('idle')
    if (!file || !entry) {
      setPool([])
      return
    }
    const local = localSentenceChips(entry, file, file.language)
    setPool(local)
    setBusy(true)
    let alive = true
    void generateSentenceChips(entry, file, file.language).then((next) => {
      if (!alive) return
      if (usedRef.current.length === 0) {
        setPool(next)
        setUsed([])
        setStatus('idle')
      }
      setBusy(false)
    })
    return () => {
      alive = false
    }
  }, [entry?.id, file, round])

  if (loading) return <Centered>Открываем файл…</Centered>
  if (error || !file || !entry) return <Centered>{error ?? 'В файле нет предложений'}</Centered>

  const expected = (entry.tokens?.length ? entry.tokens : entry.term.split(' ')).map(stripMarks)
  const built = used.map((i) => pool[i]?.token).filter(Boolean)

  const pick = (poolIndex: number) => {
    if (used.includes(poolIndex) || status === 'ok') return
    const nextUsed = [...used, poolIndex]
    usedRef.current = nextUsed
    setUsed(nextUsed)
    if (nextUsed.length === expected.length) {
      const ok = nextUsed.every((value, position) => {
        const chip = pool[value]
        return chip && !chip.decoy && chip.token === expected[position]
      })
      setStatus(ok ? 'ok' : 'bad')
      markProgress(fileId, entry.id, ok ? 'known' : 'review', 'sentences')
    } else {
      setStatus('idle')
    }
  }

  const phrase = built.join(' ').replace(/\s+([,.!?])/g, '$1')

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col overflow-y-auto px-4 pb-4 pt-1">
      <StudyHeader kind="sentences" item={item} file={file} index={index} compact />

      <article
        className={`rounded-2xl border bg-surface px-5 py-4 ${
          status === 'ok' ? 'border-accent' : status === 'bad' ? 'border-terracotta' : 'border-line'
        }`}
      >
        <div className="flex items-start justify-center gap-2 text-center">
          <p className="font-study text-3xl font-semibold leading-tight">
            {stripMarks(entry.translation ?? '') || 'Перевод появится позже'}
          </p>
          <SpeakButton text={stripMarks(entry.translation ?? '')} lang="ru" />
        </div>

        <div className="mt-4 flex min-h-20 items-center gap-2 rounded-xl bg-canvas px-3 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap justify-center gap-2">
            {built.length === 0 ? (
              <span className="text-sm text-muted">Соберите фразу. Есть лишние слова.</span>
            ) : (
              built.map((token, tokenIndex) => (
                <button
                  key={`${token}-${tokenIndex}`}
                  type="button"
                  onClick={() => {
                    if (status === 'ok') return
                    setUsed((prev) => {
                      const nextUsed = prev.filter((_, i) => i !== tokenIndex)
                      usedRef.current = nextUsed
                      return nextUsed
                    })
                    setStatus('idle')
                  }}
                  className="font-study rounded-xl border border-line bg-surface px-3 py-2 text-base"
                >
                  {token}
                </button>
              ))
            )}
          </div>
          <SpeakButton text={stripMarks(status === 'ok' ? entry.term : phrase)} lang={file.language} />
        </div>

        <p className="mt-2 min-h-5 text-center text-xs text-muted">
          {busy ? 'Подбираем новые лишние слова…' : 'Лишние слова новые на каждую фразу'}
        </p>
        <p
          className={`mt-1 min-h-5 text-center text-sm ${
            status === 'ok' ? 'text-accent' : status === 'bad' ? 'text-terracotta' : ''
          }`}
        >
          {status === 'ok' ? 'Фраза собрана верно' : status === 'bad' ? `Правильно: ${stripMarks(entry.term)}` : ''}
        </p>
      </article>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {pool.map((part, poolIndex) => (
          <button
            key={`${part.token}-${poolIndex}-${part.decoy ? 'x' : 'ok'}`}
            type="button"
            disabled={used.includes(poolIndex)}
            onClick={() => pick(poolIndex)}
            className="font-study rounded-xl bg-walnut px-4 py-2 text-base text-cream enabled:hover:brightness-110 disabled:bg-chip disabled:text-muted"
          >
            {part.token}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => {
            usedRef.current = []
            setUsed([])
            setStatus('idle')
          }}
          className="h-11 flex-1 rounded-xl border border-line bg-surface font-medium hover:bg-hover"
        >
          Сбросить
        </button>
        <button
          type="button"
          onClick={() => {
            setIndex((value) => (value + 1) % file.entries.length)
            setRound((value) => value + 1)
          }}
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
