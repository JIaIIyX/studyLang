import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ShelfSection } from '../components/library/ShelfSection'
import { useCollectionAdvice } from '../hooks/useCollectionAdvice'
import { useShelf } from '../hooks/useShelf'
import { allWordFiles } from '../lib/library'
import { languageMeta, sectionMeta } from '../lib/languages'
import { organizeShelf } from '../lib/shelf'
import { skillProfileFor, type SkillBar } from '../lib/skills'
import { useApp } from '../state/AppProvider'

export function AnalyticsPage() {
  const { language, progress } = useApp()
  const items = useMemo(() => allWordFiles(language), [language])
  const { rows, advice, overall, overallAdvice, refresh, busy, error } = useCollectionAdvice(items)
  const { shelf } = useShelf(language)
  const lang = languageMeta(language)
  const ratio = overall.total > 0 ? Math.min(100, Math.round((overall.learned / overall.total) * 100)) : 0
  const skills = useMemo(() => skillProfileFor(language, progress), [language, progress])
  const catalogById = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item])), [items])
  const shelfProgress = useMemo(
    () => Object.fromEntries(rows.map((row) => [row.id, { known: row.known, total: row.total }])),
    [rows],
  )
  const sections = useMemo(() => {
    const listed = rows
      .map((row) => catalogById[row.id])
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
    return organizeShelf(listed, shelf, shelfProgress)
      .map((section) => ({
        group: section.group,
        rows: section.items
          .map((item) => rows.find((row) => row.id === item.id))
          .filter((row): row is NonNullable<typeof row> => Boolean(row)),
      }))
      .filter((section) => section.rows.length > 0)
  }, [rows, catalogById, shelf, shelfProgress])

  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto px-4 pb-16 pt-2 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-terracotta">сводка</p>
          <h1 className="font-display mt-1 text-4xl italic">Аналитика</h1>
          <p className="mt-2 max-w-xl text-muted">
            Три очка — слова, смысл в тексте и грамматика. Репетитор и тетрадь смотрят на слабое место.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="flex h-11 items-center rounded-xl bg-terracotta px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Обновляет…' : 'Обновить разбор'}
        </button>
      </div>
      {error && <div className="mb-4 rounded-2xl bg-[#f6e4d8] px-4 py-3 text-sm text-terracotta">{error}</div>}

      <section className="mb-6 rounded-2xl border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">Понимание</p>
            <p className="mt-1 text-sm text-muted">{skills.note}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {skills.bars.map((bar) => (
            <SkillMeter key={bar.kind} bar={bar} active={skills.weakest === bar.kind} />
          ))}
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Пройдено карточек" value={overall.cardsDone} note={`знаю ${overall.cardsKnown}`} />
        <Stat label="Выучено слов" value={overall.learned} note={`из ${overall.total}`} />
        <Stat label="На повторении" value={overall.review} note="по слабому режиму" />
        <Stat label="Коллекций" value={overall.collections} note={lang.label} />
      </section>

      <section className="mb-6 rounded-2xl border border-line bg-surface p-5">
        <div className="mb-1 flex justify-between text-[11px] text-muted">
          <span>Общая оценка — минимум среди игр</span>
          <span>{ratio}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-canvas">
          <div className="progress-bar h-full" style={{ width: `${ratio}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
          {overall.games.map((game) => (
            <div key={game.kind} className="rounded-xl bg-canvas px-3 py-2.5">
              <p className="text-[11px] text-muted">{sectionMeta(game.kind).label}</p>
              <p className="font-study mt-1 text-2xl leading-none">{game.known}</p>
              <p className="mt-1 text-[11px] text-muted">пройдено {game.seen}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-line bg-surface p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">Анализ</p>
        <p className="mt-2 text-lg text-ink">{overallAdvice.insight}</p>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">План</p>
        <p className="mt-2 whitespace-pre-line text-muted">{overallAdvice.plan}</p>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="font-display text-2xl italic">По коллекциям</h2>
          <Link to="/words" className="text-sm text-terracotta hover:underline">
            Открыть слова
          </Link>
        </div>
        {rows.length === 0 && <p className="text-muted">Пока нет файлов на этом языке.</p>}
        {sections.map((section) => (
          <ShelfSection
            key={section.group?.id ?? 'loose'}
            group={section.group}
            count={section.rows.length}
            showLooseTitle={shelf.groups.length > 0}
          >
            {section.rows.map((row) => (
                <article key={row.id} className="rounded-2xl border border-line bg-surface p-5">
                  <p className="font-display text-xl italic">{row.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    Общее {row.known} из {row.total} · повторю {row.review}
                  </p>
                  {advice[row.id]?.insight && <p className="mt-3 text-sm text-ink">{advice[row.id]?.insight}</p>}
                </article>
            ))}
          </ShelfSection>
        ))}
      </section>
    </div>
  )
}

function SkillMeter({ bar, active }: { bar: SkillBar; active: boolean }) {
  const value = bar.score
  const width = value === null ? 0 : value
  return (
    <div className={`rounded-xl px-3 py-3 ${active ? 'bg-[#f6e4d8]' : 'bg-canvas'}`}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{bar.label}</p>
      <p className="font-study mt-1 text-4xl leading-none">{value === null ? '—' : value}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line/80">
        <div className="progress-bar h-full" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {bar.samples > 0 ? `${bar.hint}. По ${bar.samples} ответам` : bar.hint}
      </p>
      {active && <p className="mt-1 text-[11px] font-semibold text-terracotta">на этом упор</p>}
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="font-study mt-2 text-4xl leading-none">{value}</p>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </div>
  )
}
