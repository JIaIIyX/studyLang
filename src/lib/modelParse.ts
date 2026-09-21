export function stripFences(text: string) {
  return text.replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

export function looksLikeThinking(text: string) {
  return /here's a thinking process|thinking process:|analyze user input|system prompt says|the core problem:|format check:/i.test(
    text,
  )
}

function isMetaLine(line: string) {
  return /^(here's a thinking|thinking process|analyze user input|system prompt says|the core problem|format check|i need to|the user (asked|wants|said)|let me |we should|the request)/i.test(
    line.trim(),
  )
}

function dropMetaHead(text: string) {
  const lines = text.split('\n')
  while (lines.length && (!lines[0].trim() || isMetaLine(lines[0]))) lines.shift()
  return lines.join('\n').trim()
}

export function stripThinking(text: string) {
  const marked = text.replace(/<\/?(?:think|thinking|reason|reasoning)>/gi, '\n').trim()
  const hadThinking = looksLikeThinking(marked)
  const raw = marked.replace(/^here's a thinking process[:\s]*/i, '').trim()
  if (!raw) return ''
  if (!hadThinking && !looksLikeThinking(raw)) return dropMetaHead(raw)

  const jsonHits = [
    raw.search(/\n\s*\[/),
    raw.search(/\n\s*\{/),
    raw.startsWith('[') ? 0 : -1,
    raw.startsWith('{') ? 0 : -1,
  ].filter((index) => index >= 0)
  if (jsonHits.length) {
    const slice = raw.slice(Math.min(...jsonHits)).trim()
    if (slice.startsWith('[') || slice.startsWith('{')) return slice
  }

  const tagAt = raw.search(/<(ex|btn|opt|sec|hint|secret)>|\{\{|^\s*\[[^\]]+\]|^\s*=/im)
  if (tagAt >= 0) {
    const cut = raw.lastIndexOf('\n\n', tagAt)
    return dropMetaHead(raw.slice(cut >= 0 ? cut : 0))
  }

  const lines = raw.split('\n')
  const start = lines.findIndex((line) => {
    const value = line.trim()
    if (!value || isMetaLine(value)) return false
    return (
      /[а-яё]/i.test(value) ||
      /<(ex|btn|sec)/i.test(value) ||
      value.length > 48 ||
      (value.length >= 8 && /[.!?…]$/.test(value))
    )
  })
  if (start >= 0) return dropMetaHead(lines.slice(start).join('\n'))
  return dropMetaHead(
    raw
      .split('\n')
      .filter((line) => line.trim() && !isMetaLine(line))
      .join('\n'),
  )
}

function extractJson(text: string): unknown | undefined {
  const open = text[0]
  if (open !== '{' && open !== '[') return undefined
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inStr) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(0, i + 1))
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

export function parseModelValue(text: string): unknown | undefined {
  const trimmed = stripFences(text)
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    /* try a nested value */
  }

  const obj = trimmed.indexOf('{')
  const arr = trimmed.indexOf('[')
  const starts = [obj, arr].filter((index) => index >= 0).sort((left, right) => left - right)
  for (const start of starts) {
    const value = extractJson(trimmed.slice(start))
    if (value !== undefined) return value
  }
  return undefined
}

export function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function asRows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
