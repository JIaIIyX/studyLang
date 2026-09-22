export const MISTAKE_HINT_CLASS = 'mt-2 text-[13px] leading-5 text-muted'

export function mistakeHintView(hint?: string) {
  const text = hint?.replace(/\s+/g, ' ').trim() ?? ''
  if (!text) return null
  return { text, className: MISTAKE_HINT_CLASS }
}

export function gradeBubbleParts(content: string, hint?: string) {
  if (!hint?.trim()) return { lead: content, rest: '' }
  const match = content.match(/^([\s\S]*?)\n\s*\n([\s\S]+)$/)
  const lead = match?.[1]?.trim() ?? ''
  const rest = match?.[2]?.trim() ?? ''
  if (!lead || !rest || !/^(почти|неверно)(?![\p{L}\p{N}])/iu.test(lead)) return { lead: content, rest: '' }
  return { lead, rest }
}

export function MistakeHint({ hint }: { hint?: string }) {
  const view = mistakeHintView(hint)
  if (!view) return null
  return <p className={view.className}>{view.text}</p>
}
