import { NotebookPen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { homeworkById, sheetTags } from '../../lib/homework'

export function TagChips({ tags, dark = false }: { tags: string[]; dark?: boolean }) {
  if (!tags.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className={
            dark
              ? 'rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/75'
              : 'rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted'
          }
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

export function HomeworkLabel({ homeworkId }: { homeworkId: string }) {
  const sheet = homeworkById(homeworkId)
  if (!sheet) return null
  const tags = sheetTags(sheet)

  return (
    <Link
      to={`/homework/${sheet.id}`}
      className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1.5 text-sm transition hover:border-terracotta/40 hover:bg-hover"
    >
      <NotebookPen className="h-3.5 w-3.5 shrink-0 text-terracotta" />
      <span className="truncate font-medium">Домашняя работа</span>
      <span className="max-w-[9rem] truncate text-muted">{sheet.title}</span>
      <span className="rounded-full bg-terracotta/15 px-1.5 text-[11px] font-medium text-terracotta">
        {sheet.tasks.length}
      </span>
      {tags[0] ? <span className="hidden text-[11px] text-muted sm:inline">{tags.slice(0, 2).join(' · ')}</span> : null}
    </Link>
  )
}
