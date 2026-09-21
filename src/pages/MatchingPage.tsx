import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SpeakButton } from '../components/SpeakButton'
import { FileLibrary } from '../components/library/FileLibrary'
import { StudyHeader } from '../components/library/StudyHeader'
import { useWordFile } from '../hooks/useWordFile'
import { fillMissingTranslations, isRussian, needsTranslation } from '../lib/autoTranslate'
import { readCustomFiles, saveCustomFile } from '../lib/library'
import { shuffle, stripMarks } from '../lib/normalize'
import { forgetTutorLibrary } from '../lib/tutor'
import { useApp } from '../state/AppProvider'
import type { WordEntry, WordFile } from '../types'

const ROUND_SIZE = 6

type Pair = { id: string; term: string; translation: string }

export function MatchingPage() {
  const { fileId } = useParams()
  if (!fileId) {
    return (
      <FileLibrary
        kind="matching"
        title="Сопоставление"
        subtitle="Выберите файл и сопоставьте слово с переводом."
      />
    )
  }
  return <MatchingSession fileId={fileId} />
}

function MatchingSession({ fileId }: { fileId: string }) {
  const loaded = useWordFile(fileId)
  const { markProgress } = useApp()
  const [file, setFile] = useState<WordFile | null>(null)
  const [filling, setFilling] = useState(false)
  const [round, setRound] = useState(0)
  const [picked, setPicked] = useState<{ side: Side; id: string } | null>(null)
  const [matched, setMatched] = useState<string[]>([])
  const [wrong, setWrong] = useState<string[]>([])
  const [leftOrder, setLeftOrder] = useState<string[]>([])
  const [rightOrder, setRightOrder] = useState<string[]>([])
  const wrongTimer = useRef(0)

  useEffect(() => {
    if (!loaded.file) {
      setFile(null)
      return
    }

    const source = loaded.file
    let cancelled = false
    const missing = needsTranslation(source.entries)
    setFilling(missing)

    void (async () => {
      const entries = missing ? await fillMissingTranslations(source.language, source.entries) : source.entries
      if (cancelled) return
      const next = { ...source, entries }
      setFile(next)
      setFilling(false)
      const changed = source.entries.some(
        (entry, index) =>
          entry.term !== entries[index]?.term || entry.translation !== entries[index]?.translation,
      )
      if (changed && readCustomFiles().some((item) => item.id === source.id)) {
        saveCustomFile(next)
        forgetTutorLibrary(source.language)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [loaded.file])

  const pairs = useMemo(() => matchingPairs(file?.entries ?? []), [file])
  const rounds = useMemo(() => chunk(pairs, ROUND_SIZE), [pairs])
  const current = rounds[round] ?? []
  const roundKey = current.map((pair) => pair.id).join('|')
  const byId = useMemo(() => new Map(current.map((pair) => [pair.id, pair])), [current])

  useEffect(() => {
    const ids = roundKey ? roundKey.split('|') : []
    setMatched([])
    setPicked(null)
    setWrong([])
    setLeftOrder(shuffle(ids))
    setRightOrder(shuffle(ids))
  }, [file?.id, round, roundKey])

  useEffect(() => () => window.clearTimeout(wrongTimer.current), [])

  if (loaded.loading || filling) return <Centered>Собираем пары…</Centered>
  if (loaded.error || !file) return <Centered>{loaded.error ?? 'Файл не найден'}</Centered>
  if (pairs.length === 0) {
    return (
      <div className="mx-auto flex h-full max-w-lg flex-col justify-center px-4 text-center">
        <p className="font-display text-3xl italic">Нет пар для сопоставления</p>
        <p className="mt-3 text-muted">
          В этом файле нет перевода. Откройте коллекцию в «Слова», напишите слова по-русски и сохраните — перевод
          подставится сам.
        </p>
        <Link to="/words" className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-terracotta px-5 text-white">
          Открыть слова
        </Link>
      </div>
    )
  }

  const done = current.length > 0 && matched.length === current.length

  const choose = (side: Side, id: string) => {
    if (matched.includes(id) || wrong.length > 0) return
    if (!picked || picked.side === side) {
      setPicked({ side, id })
      return
    }
    if (picked.id === id) {
      setMatched((prev) => [...prev, id])
      markProgress(fileId, id, 'known', 'matching')
      setPicked(null)
      return
    }
    setWrong([picked.id, id])
    markProgress(fileId, picked.id, 'review', 'matching')
    window.clearTimeout(wrongTimer.current)
    wrongTimer.current = window.setTimeout(() => {
      setWrong([])
      setPicked(null)
    }, 650)
  }

  const tileClass = (id: string, side: Side) => {
    const isPicked = picked?.side === side && picked.id === id
    if (matched.includes(id)) return 'border-accent/30 bg-active text-muted'
    if (wrong.includes(id)) return 'border-terracotta bg-[#f6e4d8] dark:bg-[#3c2418]'
    if (isPicked) return 'border-terracotta bg-canvas'
    return 'border-line bg-surface hover:border-terracotta/35'
  }

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto px-4 pb-16 pt-2">
      <StudyHeader kind="matching" item={loaded.item} file={file} />
      <p className="mb-5 text-sm text-muted">
        Раунд {round + 1} из {rounds.length}. Нажмите слово слева и его перевод справа.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <Column
          title="Слово"
          order={leftOrder}
          byId={byId}
          side="left"
          lang={file.language}
          matched={matched}
          tileClass={tileClass}
          onChoose={choose}
        />
        <Column
          title="Перевод"
          order={rightOrder}
          byId={byId}
          side="right"
          lang="ru"
          matched={matched}
          tileClass={tileClass}
          onChoose={choose}
        />
      </div>

      {done && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="font-display text-2xl italic">Все пары на месте.</p>
          {round + 1 < rounds.length ? (
            <button
              type="button"
              onClick={() => setRound((value) => value + 1)}
              className="h-12 rounded-xl bg-terracotta px-6 text-white"
            >
              Следующий раунд
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setRound(0)}
              className="h-12 rounded-xl border border-line bg-surface px-6"
            >
              Ещё раз
            </button>
          )}
        </div>
      )}
    </div>
  )
}

type Side = 'left' | 'right'

function Column({
  title,
  order,
  byId,
  side,
  lang,
  matched,
  tileClass,
  onChoose,
}: {
  title: string
  order: string[]
  byId: Map<string, Pair>
  side: Side
  lang: WordFile['language'] | 'ru'
  matched: string[]
  tileClass: (id: string, side: Side) => string
  onChoose: (side: Side, id: string) => void
}) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">{title}</p>
      <div className="space-y-2">
        {order.map((id, index) => {
          const entry = byId.get(id)
          if (!entry) return null
          const text = side === 'left' ? entry.term : entry.translation
          return (
            <div
              key={`${side}-${id}-${index}`}
              className={`flex w-full items-center gap-2 rounded-xl border px-2 py-1.5 transition ${tileClass(id, side)}`}
            >
              <button
                type="button"
                disabled={matched.includes(id)}
                onClick={() => onChoose(side, id)}
                className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left"
              >
                <span className="font-study text-2xl">{text}</span>
              </button>
              <SpeakButton text={text} lang={lang} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function matchingPairs(entries: WordEntry[]): Pair[] {
  const seen = new Set<string>()
  const pairs: Pair[] = []

  for (const entry of entries) {
    let term = stripMarks(entry.term)
    let translation = stripMarks(entry.translation ?? '')
    if (!term || !translation || seen.has(entry.id)) continue
    if (isRussian(term) && !isRussian(translation)) {
      ;[term, translation] = [translation, term]
    }
    if (term === translation) continue
    seen.add(entry.id)
    pairs.push({ id: entry.id, term, translation })
  }

  return pairs
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size))
  return groups
}

function Centered({ children }: { children: string }) {
  return <div className="flex h-full items-center justify-center text-muted">{children}</div>
}
