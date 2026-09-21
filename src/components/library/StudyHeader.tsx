import { Link } from 'react-router-dom'
import { languageMeta } from '../../lib/languages'
import type { CatalogItem, SectionKind, WordFile } from '../../types'

export function StudyHeader({
  kind,
  item,
  file,
  index,
  compact = false,
}: {
  kind: SectionKind
  item?: CatalogItem
  file: WordFile | null
  index?: number
  compact?: boolean
}) {
  const meta = file ? languageMeta(file.language) : null
  const total = file?.entries.length ?? 0
  const progress = typeof index === 'number' && total > 0 ? `${index + 1} из ${total}` : ''

  if (compact) {
    return (
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display truncate text-xl italic">
            {file?.title ?? 'Загрузка…'}
          </h1>
          <p className="text-xs text-muted">
            <Link to={`/${kind}`} className="hover:text-ink">
              ← к полке
            </Link>
            {progress ? ` · ${progress}` : ''}
          </p>
        </div>
        <Link
          to={`/${kind}`}
          className="inline-flex h-9 shrink-0 items-center rounded-xl border border-line bg-surface px-3 text-sm font-medium hover:bg-hover"
        >
          Выйти
        </Link>
      </div>
    )
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link to={`/${kind}`} className="text-sm text-muted hover:text-ink">
          ← к полке файлов
        </Link>
        <h1 className="font-display mt-1 text-3xl italic">
          {meta?.flag} {file?.title ?? 'Загрузка…'}
        </h1>
        <p className="text-sm text-muted">
          {item?.id}.json
          {progress ? ` · ${progress}` : ''}
        </p>
      </div>
      <Link
        to={`/${kind}`}
        className="inline-flex h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium hover:bg-hover"
      >
        Выйти
      </Link>
    </div>
  )
}
