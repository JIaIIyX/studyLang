import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { NotebookPen, Plus, Trash2, X } from 'lucide-react'
import {
  assignHomework,
  buildAnalysis,
  deleteHomework,
  errorHomeworkWish,
  formatPoints,
  homeworkById,
  homeworkFor,
  polishHomeworkSheet,
  isLongTask,
  kindLabel,
  reviewHomework,
  saveHomework,
  sheetErrors,
  sheetScore,
  sheetTags,
  tagsOf,
  taskHint,
  type HomeworkMark,
  type HomeworkSheet,
  type HomeworkTask,
} from '../lib/homework'
import { MatchTask, MeaningsTask, OrderTask, RowsTask, WordsTask } from '../components/homework/HomeworkWidgets'
import { languageMeta } from '../lib/languages'
import { useApp } from '../state/AppProvider'
import { TagChips } from '../components/chat/HomeworkLabel'

export function HomeworkPage() {
  const { sheetId } = useParams()
  if (sheetId) return <HomeworkSheetView sheetId={sheetId} />
  return <HomeworkList />
}

function HomeworkList() {
  const navigate = useNavigate()
  const { language, displayName, tutorPrompt, progress } = useApp()
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [wish, setWish] = useState('')
  const [error, setError] = useState<string | null>(null)
  const sheets = useMemo(() => homeworkFor(language), [language, tick])
  const lang = languageMeta(language)

  const issue = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const sheet = await assignHomework({ language, displayName, tutorPrompt, progress, wish })
      saveHomework(sheet)
      navigate(`/homework/${sheet.id}`)
    } catch {
      setError('Не получилось выдать тетрадь. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto h-full max-w-5xl overflow-x-hidden overflow-y-auto px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pb-16 md:px-8">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta sm:tracking-[0.2em]">тетрадь</p>
          <h1 className="font-display mt-1 text-3xl italic sm:text-4xl">Домашняя работа</h1>
          <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">
            Тетрадь по {(lang.prep ?? lang.label.toLowerCase())}: перевод абзаца, слова, с русского на язык, значения, история по
            точкам, пары и пять строк. После сдачи — разбор и новое задание на слабые места.
          </p>
        </div>
        <form
          className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-sm sm:flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            void issue()
          }}
        >
          <input
            value={wish}
            onChange={(event) => setWish(event.target.value)}
            maxLength={160}
            placeholder="Пожелание к заданию"
            className="h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 outline-none focus:ring-2 focus:ring-terracotta/30 sm:px-4"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {busy ? 'Составляет…' : 'Выдать задание'}
          </button>
        </form>
      </div>

      {error && <div className="mb-4 rounded-2xl bg-[#f6e4d8] px-4 py-3 text-sm text-terracotta">{error}</div>}

      {sheets.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface px-4 py-8 text-center sm:px-5 sm:py-10">
          <NotebookPen className="mx-auto h-8 w-8 text-terracotta" />
          <p className="font-display mt-3 text-2xl italic">Тетрадь пока пустая</p>
          <p className="mt-2 text-muted">Нажмите «Выдать задание» — репетитор соберёт работу из слов с полки.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {sheets.map((sheet) => {
          const score = sheetScore(sheet)
          return (
            <article key={sheet.id} className="flex flex-col rounded-2xl border border-line bg-surface p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/homework/${sheet.id}`} className="min-w-0 flex-1">
                  <p className="font-display text-xl italic">{sheet.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {sheet.topic} · {sheet.tasks.length} заданий
                    {sheet.doneAt ? ' · сдано' : ''}
                  </p>
                  <div className="mt-2">
                    <TagChips tags={sheetTags(sheet)} />
                  </div>
                </Link>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-[#f6e4d8] hover:text-terracotta"
                  aria-label="Удалить тетрадь"
                  onClick={() => {
                    deleteHomework(sheet.id)
                    setTick((value) => value + 1)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-muted">{sheet.intro}</p>
              <p className="mt-4 text-sm text-ink">
                {score.checked === 0
                  ? 'Ещё не проверяли'
                  : `Баллы ${formatPoints(score.points)} из ${score.total}`}
              </p>
              <Link
                to={`/homework/${sheet.id}`}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-walnut text-sm font-semibold text-cream"
              >
                Открыть тетрадь
              </Link>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function HomeworkSheetView({ sheetId }: { sheetId: string }) {
  const navigate = useNavigate()
  const { displayName, language, tutorPrompt, progress } = useApp()
  const [sheet, setSheet] = useState<HomeworkSheet | null>(() => homeworkById(sheetId) ?? null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [repairBusy, setRepairBusy] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const openedFor = useRef<string | null>(null)

  useEffect(() => {
    const raw = homeworkById(sheetId)
    if (!raw) {
      setSheet(null)
      setAnalysisOpen(false)
      return
    }
    const next = polishHomeworkSheet(raw)
    if (next !== raw) saveHomework(next)
    setSheet(next)
    setAnalysisOpen(false)
  }, [sheetId])

  useEffect(() => {
    if (!sheet?.doneAt || openedFor.current === sheet.id) return
    openedFor.current = sheet.id
    setAnalysisOpen(true)
  }, [sheet])

  if (!sheet) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted">
        Тетрадь не найдена.{' '}
        <Link to="/homework" className="text-terracotta hover:underline">
          К списку
        </Link>
      </div>
    )
  }

  const lang = languageMeta(sheet.language)
  const score = sheetScore(sheet)
  const date = new Date(sheet.createdAt).toLocaleDateString('ru-RU')
  const commit = (next: HomeworkSheet) => {
    saveHomework(next)
    setSheet(next)
  }

  const setDraft = (taskId: string, value: string) => {
    commit({ ...sheet, drafts: { ...sheet.drafts, [taskId]: value } })
  }

  const reviewAll = async () => {
    if (reviewBusy) return
    setReviewBusy(true)
    setReviewError('')
    try {
      const next = await reviewHomework(sheet)
      commit(next)
      setAnalysisOpen(true)
    } catch {
      setReviewError('Модель не успела проверить. Нажмите ещё раз.')
    } finally {
      setReviewBusy(false)
    }
  }

  const issueRepair = async () => {
    if (repairBusy) return
    setRepairBusy(true)
    try {
      const next = await assignHomework({
        language: sheet.language || language,
        displayName,
        tutorPrompt,
        progress,
        wish: errorHomeworkWish(sheet),
      })
      saveHomework(next)
      setAnalysisOpen(false)
      navigate(`/homework/${next.id}`)
    } finally {
      setRepairBusy(false)
    }
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-x-hidden overflow-y-auto px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pb-16 md:px-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-5 sm:gap-3">
        <Link to="/homework" className="text-sm text-muted hover:text-ink">
          ← к тетрадям
        </Link>
        <button
          type="button"
          onClick={() => navigate('/homework')}
          className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm"
        >
          Закрыть
        </button>
      </div>

      <div className="paper-sheet margin-rule rounded-2xl border border-line px-3 py-4 sm:px-5 sm:py-6 sm:pl-16 md:px-8 md:py-8 md:pl-20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta sm:tracking-[0.18em]">домашняя работа</p>
        <h1 className="font-display mt-1 text-2xl italic sm:text-3xl">{sheet.title}</h1>
        <p className="mt-2 text-sm text-muted">
          {lang.label} · {sheet.topic} · {date}
        </p>
        <div className="mt-2">
          <TagChips tags={sheetTags(sheet)} />
        </div>
        <p className="mt-1 text-sm text-muted">Ученик: {displayName}</p>
        <aside className="mt-4 rounded-2xl border border-dashed border-line bg-surface/80 px-3 py-2.5 sm:mt-5 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted sm:tracking-[0.16em]">Задание учителя</p>
          <p className="font-study mt-1 text-base leading-6 italic text-ink sm:text-lg sm:leading-7">{sheet.intro}</p>
        </aside>

        <ol className="mt-4 space-y-4 sm:mt-8 sm:space-y-6">
          {sheet.tasks.map((task, index) => (
            <TaskCard
              key={task.id}
              index={index}
              task={task}
              draft={sheet.drafts[task.id] ?? ''}
              mark={sheet.marks[task.id]}
              review={sheet.reviews[task.id]}
              onDraft={(value) => setDraft(task.id, value)}
            />
          ))}
        </ol>

        <div className="mt-5 flex flex-col gap-3 border-t border-line/70 pt-4 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:pt-5">
          <p className="text-sm text-muted">
            {score.checked === 0
              ? `Заданий: ${score.total}`
              : `Баллы ${formatPoints(score.points)} из ${score.total}`}
            {sheet.doneAt ? ' · тетрадь сдана' : ''}
            {reviewError ? ` · ${reviewError}` : ''}
          </p>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            {sheet.doneAt ? (
              <button
                type="button"
                onClick={() => setAnalysisOpen(true)}
                className="h-11 rounded-xl border border-line bg-surface px-4 text-sm font-semibold sm:px-5"
              >
                Анализ результатов
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void reviewAll()}
              disabled={reviewBusy}
              className="h-11 rounded-xl bg-terracotta px-4 text-sm font-semibold text-white disabled:opacity-60 sm:px-5"
            >
              {reviewBusy ? 'Смотрит ответы…' : 'Сдать тетрадь'}
            </button>
          </div>
        </div>
      </div>
      {analysisOpen ? (
        <ErrorAnalysisWindow
          sheet={sheet}
          busy={repairBusy}
          onClose={() => setAnalysisOpen(false)}
          onRepair={() => void issueRepair()}
        />
      ) : null}
    </div>
  )
}

function exampleLabel(task: HomeworkTask) {
  if (task.kind === 'passage' || (isLongTask(task) && task.kind === 'translate')) return 'Текст'
  if (task.kind === 'meanings') return 'Слово'
  if (task.kind === 'fill') return 'Пример'
  if (task.kind === 'translate') return 'Фраза'
  if (task.kind === 'choose') return 'Вопрос'
  if (task.kind === 'correct') return 'Предложение'
  return 'Пример'
}

function StudyLine({ text, long = false }: { text: string; long?: boolean }) {
  const parts = text.split(/(__+|…{2,}|\.{3,}|\[[.\s_]*\])/g)
  return (
    <p className={`font-study whitespace-pre-wrap ${long ? 'text-base leading-7 sm:text-lg sm:leading-8' : 'text-lg leading-7 sm:text-2xl sm:leading-10'}`}>
      {parts.map((part, index) =>
        /^(__+|…{2,}|\.{3,}|\[[.\s_]*\])$/.test(part) ? (
          <span
            key={index}
            className="mx-1 inline-block min-w-[3rem] border-b-2 border-terracotta align-baseline sm:min-w-[4.75rem]"
            aria-hidden
          />
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  )
}

function markLabel(mark?: HomeworkMark) {
  if (mark === 'ok') return { text: '1 балл', className: 'text-accent' }
  if (mark === 'partial') return { text: '0.75 балла', className: 'text-terracotta' }
  if (mark === 'bad') return { text: '0 баллов', className: 'text-terracotta' }
  return null
}

function ErrorAnalysisWindow({
  sheet,
  busy,
  onClose,
  onRepair,
}: {
  sheet: HomeworkSheet
  busy: boolean
  onClose: () => void
  onRepair: () => void
}) {
  const analysis = sheet.analysis ?? buildAnalysis(sheet)
  const errors = sheetErrors(sheet)
  const score = sheetScore(sheet)
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="error-analysis-title"
        className="max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-xl sm:p-5 md:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">разбор</p>
            <h2 id="error-analysis-title" className="font-display mt-1 text-2xl italic">
              Анализ результатов
            </h2>
            <p className="mt-1 text-sm text-muted">
              {formatPoints(score.points)} из {score.total}
              {score.partial ? ` · частичных ${score.partial}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-5 text-sm leading-6 text-ink">{analysis.summary}</p>

        {analysis.problems.length ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">Проблемы</p>
            <ul className="mt-2 space-y-2">
              {analysis.problems.map((item) => (
                <li key={item} className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm leading-6 text-ink">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink">Ошибок нет — можно закрепить тему ещё одной тетрадью.</p>
        )}

        {analysis.study.length ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">Что подучить</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink">
              {analysis.study.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {errors.length ? (
          <ul className="mt-4 space-y-2">
            {errors.map((item) => (
              <li key={item.task.id} className="rounded-xl border border-dashed border-line px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {kindLabel(item.task.kind)} · {formatPoints(item.points)}
                </p>
                {item.review ? <p className="mt-1 text-sm leading-6 text-ink">{item.review}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          onClick={onRepair}
          disabled={busy}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-terracotta text-sm font-semibold text-white disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {busy ? 'Составляет…' : 'Новое задание на слабые места'}
        </button>
        <p className="mt-2 text-center text-[12px] text-muted">
          Новая тетрадь соберётся из того же набора заданий, но вокруг слабых слов и форм.
        </p>
      </div>
    </div>
  )
}

function TaskCard({
  index,
  task,
  draft,
  mark,
  review,
  onDraft,
}: {
  index: number
  task: HomeworkTask
  draft: string
  mark?: HomeworkMark
  review?: string
  onDraft: (value: string) => void
}) {
  const status = markLabel(mark)
  const hint = taskHint(task)
  return (
    <li className="rounded-2xl border border-line bg-surface/90 p-3 sm:p-4 md:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">
        Задание {index + 1}. {kindLabel(task.kind)}
      </p>
      <div className="mt-2">
        <TagChips tags={tagsOf(task)} />
      </div>
      <p className="mt-1 text-sm leading-6 text-muted">{task.prompt}</p>
      {hint ? <p className="mt-2 text-sm leading-6 text-muted">Подсказка: {hint}</p> : null}

      {task.text && task.kind !== 'words' && task.kind !== 'match' && task.kind !== 'order' && task.kind !== 'rows' && (
        <figure className="mt-3 overflow-hidden rounded-2xl border border-line bg-canvas">
          <figcaption className="border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta sm:px-4 sm:py-2 sm:tracking-[0.16em]">
            {exampleLabel(task)}
          </figcaption>
          <div className="px-3 py-3 sm:px-4 sm:py-4">
            <StudyLine text={task.text} long={isLongTask(task)} />
          </div>
        </figure>
      )}

      {task.kind === 'meanings' ? (
        <MeaningsTask task={task} draft={draft} onDraft={onDraft} />
      ) : task.kind === 'words' || task.kind === 'into' ? (
        <WordsTask task={task} draft={draft} onDraft={onDraft} />
      ) : task.kind === 'match' ? (
        <MatchTask task={task} draft={draft} onDraft={onDraft} />
      ) : task.kind === 'order' ? (
        <OrderTask task={task} draft={draft} onDraft={onDraft} />
      ) : task.kind === 'rows' ? (
        <RowsTask task={task} draft={draft} onDraft={onDraft} />
      ) : task.kind === 'choose' && task.options?.length ? (
        <div className="mt-4 grid gap-2">
          {task.options.map((option) => {
            const active = draft === option
            return (
              <button
                key={option}
                type="button"
                onClick={() => onDraft(option)}
                className={`rounded-xl border px-3 py-2.5 text-left font-study text-base leading-6 transition sm:px-4 sm:py-3 sm:text-lg sm:leading-7 ${
                  active ? 'border-terracotta bg-canvas' : 'border-line bg-surface hover:border-terracotta/35 hover:bg-hover'
                }`}
              >
                {option}
              </button>
            )
          })}
        </div>
      ) : task.kind === 'write' || task.kind === 'passage' || isLongTask(task) ? (
        <textarea
          value={draft}
          rows={task.kind === 'passage' || isLongTask(task) ? 8 : 3}
          onChange={(event) => onDraft(event.target.value)}
          placeholder={task.kind === 'passage' ? 'Перевод абзаца' : 'Пишите здесь'}
          className="font-print mt-3 w-full resize-none rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-terracotta/30 sm:mt-4 sm:px-4 sm:py-3"
        />
      ) : (
        <input
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          placeholder="Ответ"
          className="font-print mt-3 h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:ring-2 focus:ring-terracotta/30 sm:mt-4 sm:h-12 sm:px-4"
        />
      )}

      {status ? <p className={`mt-3 text-sm ${status.className}`}>{status.text}</p> : null}
      {review ? (
        <div className="mt-3 rounded-2xl border border-line bg-canvas px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">Отзыв</p>
          <p className="mt-1 text-sm leading-6 text-ink">{review}</p>
        </div>
      ) : null}
    </li>
  )
}
