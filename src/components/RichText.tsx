import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { extractQuizChoices, isChoiceMarker, multiKeyHint, quizQuestionText, unclearQuizHint } from '../lib/quizChoices'
import { fold } from '../lib/normalize'
import { picksFromChoices } from '../lib/quizReply'
import { extractQuizAnswers, hasPracticeTags, quizPickMode, splitPracticeTags, normalizePracticeMarkup } from '../lib/practiceTags'
import { LookupText } from './WordLookup'

type TableBlock = {
  type: 'table'
  headers: string[]
  rows: string[][]
}

type TextBlock = {
  type: 'text'
  text: string
}

type AnswersBlock = {
  type: 'answers'
  blocks: Array<TableBlock | TextBlock>
}

type PlainBlock = TableBlock | TextBlock
type Block = PlainBlock | AnswersBlock

function splitRow(line: string) {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return []
  const cells = trimmed.split('|')
  if (trimmed.startsWith('|')) cells.shift()
  if (trimmed.endsWith('|')) cells.pop()
  return cells.map((cell) => cell.trim())
}

function isPipeRow(line: string) {
  return splitRow(line).length >= 2
}

function isSeparatorRow(line: string) {
  const cells = splitRow(line)
  return cells.length >= 2 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s/g, '')) || cell === '')
}

function isAnswersMarker(line: string) {
  return isChoiceMarker(line)
}

function readTable(lines: string[], start: number): { block: TableBlock; next: number } | null {
  if (!isPipeRow(lines[start] ?? '')) return null
  const hasSeparator = isSeparatorRow(lines[start + 1] ?? '')
  if (!hasSeparator && !isPipeRow(lines[start + 1] ?? '')) return null

  const headers = splitRow(lines[start])
  let index = start + (hasSeparator ? 2 : 1)
  const rows: string[][] = []

  while (index < lines.length && isPipeRow(lines[index])) {
    if (!isSeparatorRow(lines[index])) rows.push(padRow(splitRow(lines[index]), headers.length))
    index += 1
  }

  if (rows.length === 0) return null
  return { block: { type: 'table', headers, rows }, next: index }
}

function padRow(cells: string[], size: number) {
  return Array.from({ length: size }, (_, index) => cells[index] ?? '')
}

function parsePlainBlocks(lines: string[]): PlainBlock[] {
  const blocks: PlainBlock[] = []
  let index = 0

  while (index < lines.length) {
    const table = readTable(lines, index)
    if (table) {
      blocks.push(table.block)
      index = table.next
      continue
    }

    const start = index
    index += 1
    while (index < lines.length && !readTable(lines, index) && !isAnswersMarker(lines[index] ?? '')) index += 1
    blocks.push({ type: 'text', text: lines.slice(start, index).join('\n') })
  }

  return blocks
}

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const split = lines.findIndex((line) => isAnswersMarker(line))
  if (split < 0) return parsePlainBlocks(lines)

  const before = parsePlainBlocks(lines.slice(0, split))
  const after = parsePlainBlocks(lines.slice(split + 1))
  return after.length ? [...before, { type: 'answers', blocks: after }] : before
}

function Marks({ text }: { text: string }) {
  const parts = text.split(/(\*\*.+?\*\*|\*.+?\*)/g)
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={index} className="font-semibold">
              <LookupText text={part.slice(2, -2)} />
            </strong>
          )
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return (
            <em key={index} className="text-muted">
              <LookupText text={part.slice(1, -1)} />
            </em>
          )
        }
        return (
          <span key={index}>
            <LookupText text={part} />
          </span>
        )
      })}
    </>
  )
}

function chipClass(block?: boolean) {
  return `${block ? 'block w-full' : 'mx-0.5 inline-flex align-middle'} min-h-11 rounded-2xl border px-3.5 py-2.5 text-left text-[15px] leading-6 break-words transition`
}

function isPicked(picked: string[], text: string) {
  return picked.some((item) => fold(item) === fold(text))
}

function PracticeButton({
  text,
  block,
  picked,
  disabled,
  onToggle,
}: {
  text: string
  block?: boolean
  picked: string[]
  disabled?: boolean
  onToggle?: (text: string) => void
}) {
  const selected = isPicked(picked, text)
  const canPick = Boolean(onToggle) && !disabled
  return (
    <button
      type="button"
      disabled={!canPick}
      onClick={() => onToggle?.(text)}
      className={`${chipClass(block)} ${
        selected
          ? 'border-terracotta bg-terracotta/15 text-ink'
          : canPick
            ? 'border-line bg-canvas hover:-translate-y-0.5 hover:border-terracotta/50'
            : 'border-line bg-canvas text-ink/80'
      }`}
    >
      {text}
    </button>
  )
}

function ExampleChip({ text, block }: { text: string; block?: boolean }) {
  return (
    <span className={`${chipClass(block)} border-line bg-canvas text-ink`}>
      <LookupText text={text} />
    </span>
  )
}

function SecretHint({ text, block }: { text: string; block?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      aria-expanded={open}
      className={`${chipClass(block)} ${
        open
          ? 'border-terracotta/40 bg-terracotta/10 text-ink'
          : 'border-dashed border-terracotta/50 bg-canvas text-terracotta hover:border-terracotta'
      }`}
    >
      {open ? <LookupText text={text} /> : 'Секрет'}
    </button>
  )
}

function PracticePartView({
  part,
  block,
  picked,
  disabled,
  onToggle,
}: {
  part: { type: 'btn' | 'ex' | 'sec'; text: string }
  block?: boolean
  picked: string[]
  disabled?: boolean
  onToggle?: (text: string) => void
}) {
  if (part.type === 'ex') return <ExampleChip text={part.text} block={block} />
  if (part.type === 'sec') return <SecretHint text={part.text} block={block} />
  return <PracticeButton text={part.text} block={block} picked={picked} disabled={disabled} onToggle={onToggle} />
}

function Inline({
  text,
  picked,
  disabled,
  onToggle,
}: {
  text: string
  picked: string[]
  disabled?: boolean
  onToggle?: (text: string) => void
}) {
  const chunks = splitPracticeTags(text)
  if (chunks.length === 1 && chunks[0]?.type === 'text') return <Marks text={chunks[0].text} />
  return (
    <>
      {chunks.map((chunk, index) =>
        chunk.type === 'text' ? (
          <Marks key={`t-${index}`} text={chunk.text} />
        ) : (
          <PracticePartView
            key={`${chunk.type}-${chunk.text}-${index}`}
            part={chunk as { type: 'btn' | 'ex' | 'sec'; text: string }}
            picked={picked}
            disabled={disabled}
            onToggle={onToggle}
          />
        ),
      )}
    </>
  )
}

function ChatTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
            <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-0 sm:min-w-[18rem] border-collapse text-left">
        <thead>
          <tr className="bg-canvas">
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className="whitespace-nowrap px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta"
              >
                <Inline text={header} picked={[]} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-line odd:bg-surface even:bg-canvas">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3.5 py-2.5 align-top text-[15px] leading-6">
                  <Inline text={cell} picked={[]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TextLines({
  text,
  prefix,
  picked,
  disabled,
  onToggle,
}: {
  text: string
  prefix: string
  picked: string[]
  disabled?: boolean
  onToggle?: (text: string) => void
}) {
  return text.split('\n').map((line, lineIndex) => {
    if (!line) return <div key={`${prefix}-${lineIndex}`} className="h-1" />
    const chunks = splitPracticeTags(line)
    const onlyChip = chunks.length === 1 && chunks[0] && chunks[0].type !== 'text'
    if (onlyChip && chunks[0] && chunks[0].type !== 'text') {
      return (
        <PracticePartView
          key={`${prefix}-${lineIndex}`}
          part={chunks[0] as { type: 'btn' | 'ex' | 'sec'; text: string }}
          block
          picked={picked}
          disabled={disabled}
          onToggle={onToggle}
        />
      )
    }
    return (
      <p key={`${prefix}-${lineIndex}`} className="whitespace-pre-wrap">
        <Inline text={line} picked={picked} disabled={disabled} onToggle={onToggle} />
      </p>
    )
  })
}

function renderPlain(
  blocks: PlainBlock[],
  prefix: string,
  pick?: { picked: string[]; disabled?: boolean; onToggle?: (text: string) => void },
) {
  return blocks.map((block, index) => {
    if (block.type === 'table') {
      return <ChatTable key={`${prefix}-table-${index}`} headers={block.headers} rows={block.rows} />
    }
    return (
      <TextLines
        key={`${prefix}-text-${index}`}
        text={block.text}
        prefix={`${prefix}-${index}`}
        picked={pick?.picked ?? []}
        disabled={pick?.disabled}
        onToggle={pick?.onToggle}
      />
    )
  })
}

function ChoiceButtons({
  choices,
  picked,
  disabled,
  onToggle,
}: {
  choices: string[]
  picked: string[]
  disabled?: boolean
  onToggle?: (text: string) => void
}) {
  return (
    <div className="mt-1 flex flex-col gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">Варианты</p>
      {choices.map((choice, index) => {
        const selected = isPicked(picked, choice)
        return (
          <button
            key={`${choice}-${index}`}
            type="button"
            disabled={disabled || !onToggle}
            onClick={() => onToggle?.(choice)}
            className={`min-h-11 rounded-2xl border px-3.5 py-2.5 text-left text-[15px] leading-6 break-words transition ${
              selected
                ? 'border-terracotta bg-terracotta/15 text-ink'
                : onToggle && !disabled
                  ? 'border-line bg-canvas hover:-translate-y-0.5 hover:border-terracotta/50'
                  : 'border-line bg-canvas text-ink/80'
            }`}
          >
            <span className="mr-2 font-display text-xs text-terracotta">{String.fromCharCode(65 + index)}</span>
            {choice}
          </button>
        )
      })}
    </div>
  )
}

function AnswerFold({ children }: { children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line bg-canvas">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta [&::-webkit-details-marker]:hidden">
        Ответы
        <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-line px-4 py-3">{children}</div>
    </details>
  )
}

export function RichText({
  text,
  onPickAnswer,
  pickedAnswer,
  pickDisabled,
}: {
  text: string
  onPickAnswer?: (text: string) => void
  pickedAnswer?: string
  pickDisabled?: boolean
}) {
  const source = normalizePracticeMarkup(text)
  const tagged = hasPracticeTags(source)
  const choices = extractQuizChoices(source)
  const question = tagged ? source : choices.length ? quizQuestionText(source) : source
  const locked = pickedAnswer ? picksFromChoices(pickedAnswer, choices) : null
  const [draft, setDraft] = useState<string[]>([])
  const picked = locked ?? draft
  const canPick = Boolean(onPickAnswer) && !pickDisabled && !locked
  const toggle = (value: string) => {
    if (!canPick) return
    setDraft((prev) => (isPicked(prev, value) ? prev.filter((item) => fold(item) !== fold(value)) : [...prev, value]))
  }
  const pick = { picked, disabled: !canPick, onToggle: canPick ? toggle : undefined }
  const hasButtons = choices.length >= 2 || splitPracticeTags(source).some((part) => part.type === 'btn')

  const hint = unclearQuizHint(source) || multiKeyHint(source)
  const pickHint =
    extractQuizAnswers(source).length >= 2
      ? quizPickMode(source) === 'all'
        ? 'Отметьте все верные варианты'
        : 'Подойдёт любой верный вариант'
      : 'Можно отметить несколько вариантов'

  return (
    <div className="space-y-3 text-[15px] leading-7 text-ink">
      {hint ? <p className="rounded-2xl bg-canvas px-3.5 py-2 text-[13px] leading-5 text-terracotta">{hint}</p> : null}
      {parseBlocks(question).map((block, index) => {
        if (block.type === 'table') {
          return <ChatTable key={`table-${index}`} headers={block.headers} rows={block.rows} />
        }
        if (block.type === 'answers') {
          return (
            <AnswerFold key={`answers-${index}`}>
              {renderPlain(block.blocks, `answers-${index}`, pick)}
            </AnswerFold>
          )
        }
        return (
          <TextLines
            key={`text-${index}`}
            text={block.text}
            prefix={`text-${index}`}
            picked={pick.picked}
            disabled={pick.disabled}
            onToggle={pick.onToggle}
          />
        )
      })}
      {!tagged && choices.length >= 2 ? (
        <ChoiceButtons
          choices={choices}
          picked={picked}
          disabled={pick.disabled}
          onToggle={pick.onToggle}
        />
      ) : null}
      {canPick && hasButtons ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <p className="text-[11px] text-muted">{pickHint}</p>
          <button
            type="button"
            disabled={!draft.length}
            onClick={() => onPickAnswer?.(draft.join(' | '))}
            className="min-h-11 rounded-full bg-walnut px-4 py-2 text-sm font-medium text-cream enabled:hover:brightness-110 disabled:opacity-30"
          >
            Ответить{draft.length > 1 ? ` · ${draft.length}` : ''}
          </button>
        </div>
      ) : null}
    </div>
  )
}
