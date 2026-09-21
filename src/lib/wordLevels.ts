export const WORD_LEVELS = ['a1', 'a2', 'b1', 'b2'] as const
export type WordLevel = (typeof WORD_LEVELS)[number]

export function levelLabel(level: WordLevel) {
  return level.toUpperCase()
}

export function levelHint(level: WordLevel) {
  if (level === 'a1') return 'Самые частые слова: я, быть, дом, вода, день'
  if (level === 'a2') return 'Быт, поездки, магазин, простые чувства'
  if (level === 'b1') return 'Мнение, работа, город, привычные глаголы'
  return 'Более точная лексика: спор, решение, впечатление'
}
