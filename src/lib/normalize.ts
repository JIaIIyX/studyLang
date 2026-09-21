export function stripMarks(text: string) {
  return text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
}

export function markedSpan(text: string) {
  const match = text.match(/\*\*([^*]+)\*\*/)
  const inner = match?.[1]?.trim()
  return inner || undefined
}

export function fold(value: string): string {
  return stripMarks(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function answersOf(translation: string): string[] {
  return translation
    .split(/[/;,]| или /i)
    .map((part) => fold(part))
    .filter(Boolean)
}

export function splitAnswerPicks(text: string) {
  return text
    .split(/\s*\|\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function matchesAnswer(input: string, expected: string): boolean {
  const guess = fold(input)
  if (!guess) return false
  return answersOf(expected).some((answer) => answer === guess || answer.includes(guess) || guess.includes(answer))
}

export function matchAnswerSet(input: string, expected: string[], mode: 'all' | 'any' = 'all') {
  const wants = expected.map((item) => item.trim()).filter(Boolean)
  if (!wants.length) return false
  const picks = splitAnswerPicks(input)
  if (wants.length === 1) return matchesAnswer(picks.join(' | ') || input, wants[0])
  if (!picks.length) return false
  const ok = (pick: string, want: string) => matchesAnswer(pick, want) || matchesAnswer(want, pick)
  if (picks.some((pick) => !wants.some((want) => ok(pick, want)))) return false
  if (mode === 'any') return picks.every((pick) => wants.some((want) => ok(pick, want)))
  if (picks.length !== wants.length) return false
  const used = new Set<number>()
  for (const pick of picks) {
    const index = wants.findIndex((want, i) => !used.has(i) && ok(pick, want))
    if (index < 0) return false
    used.add(index)
  }
  return used.size === wants.length
}

export function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${crypto.randomUUID()}`
}
