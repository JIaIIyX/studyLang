import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CollectionMeta } from './CollectionMeta'
import { ShelfSection } from './ShelfSection'
import { useCollectionAdvice } from '../../hooks/useCollectionAdvice'
import { useShelf } from '../../hooks/useShelf'
import { allWordFiles } from '../../lib/library'
import { languageMeta } from '../../lib/languages'
import { organizeShelf } from '../../lib/shelf'
import { useApp } from '../../state/AppProvider'
import type { SectionKind } from '../../types'

type Props = {
  kind: SectionKind
  title: string
  subtitle: string
}

export function FileLibrary({ kind, title, subtitle }: Props) {
  const { language } = useApp()
  const items = useMemo(() => allWordFiles(language), [language])
  const { rows, advice } = useCollectionAdvice(items)
  const { shelf } = useShelf(language)
  const statsById = useMemo(() => Object.fromEntries(rows.map((row) => [row.id, row])), [rows])
  const progress = useMemo(
    () => Object.fromEntries(rows.map((row) => [row.id, { known: row.known, total: row.total }])),
    [rows],
  )
  const sections = useMemo(
    () => organizeShelf(items, shelf, progress).filter((section) => section.items.length > 0),
    [items, shelf, progress],
  )

  return (
    <div className="mx-auto h-full max-w-5xl overflow-x-hidden overflow-y-auto px-3 pb-[max(4rem,env(safe-area-inset-bottom))] pt-2 md:px-8">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-terracotta">выберите файл</p>
        <h1 className="font-display mt-1 text-3xl italic md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-xl text-muted">{subtitle}</p>
      </div>

      {items.length === 0 && (
        <p className="text-muted">
          Пока нет файлов на {languageMeta(language).label.toLowerCase()}. Добавьте слова в разделе{' '}
          <Link to="/words" className="text-terracotta underline underline-offset-2">
            Слова
          </Link>
          .
        </p>
      )}

      {sections.map((section) => (
        <ShelfSection
          key={section.group?.id ?? 'loose'}
          group={section.group}
          count={section.items.length}
          showLooseTitle={shelf.groups.length > 0}
        >
          {section.items.map((item) => {
            const lang = languageMeta(item.language)
            const stats = statsById[item.id]
            return (
              <Link
                key={item.id}
                to={`/${kind}/${item.id}`}
                className="flex h-full min-h-[44px] flex-col rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-terracotta/35 sm:p-5"
              >
                <div className="mb-1 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl italic">{item.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {item.words} слов · {item.source === 'upload' ? 'ваш файл' : `${item.id}.json`}
                    </p>
                  </div>
                  <span
                    className="rounded-md px-2 py-1 text-[11px] font-semibold text-white"
                    style={{ background: lang.swatch }}
                  >
                    {item.language.toUpperCase()}
                  </span>
                </div>
                {item.description && <p className="mt-2 text-sm text-muted">{item.description}</p>}
                {stats && <CollectionMeta stats={stats} advice={advice[item.id]} />}
              </Link>
            )
          })}
        </ShelfSection>
      ))}
    </div>
  )
}
