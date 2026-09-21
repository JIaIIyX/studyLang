import { askGemini, hasGemini } from './llm'
import { asRows, asText, parseModelValue } from './modelParse'
import { getSnapshot, updateSnapshot } from './persist'
import { languageMeta, sectionMeta } from './languages'
import { GAME_KINDS, gameProgress, normalizeFileProgress } from './progress'
import { skillProfileFor } from './skills'
import type { CatalogItem, FileProgress, GameKind, Language } from '../types'

export type GameStats = {
  kind: GameKind
  known: number
  review: number
  seen: number
}

export type CollectionStats = {
  id: string
  title: string
  total: number
  known: number
  review: number
  seen: number
  games: GameStats[]
}

export type SkillPoint = {
  title: string
  note: string
}

export type CollectionAdvice = {
  insight: string
  plan: string
  strengths: SkillPoint[]
  weaknesses: SkillPoint[]
}

export type OverallStats = {
  collections: number
  total: number
  learned: number
  review: number
  cardsDone: number
  cardsKnown: number
  games: GameStats[]
}

export function overallFromRows(rows: CollectionStats[]): OverallStats {
  const games = GAME_KINDS.map((kind) => ({
    kind,
    known: rows.reduce((sum, row) => sum + (row.games.find((game) => game.kind === kind)?.known ?? 0), 0),
    review: rows.reduce((sum, row) => sum + (row.games.find((game) => game.kind === kind)?.review ?? 0), 0),
    seen: rows.reduce((sum, row) => sum + (row.games.find((game) => game.kind === kind)?.seen ?? 0), 0),
  }))
  const cards = games.find((game) => game.kind === 'cards') ?? { known: 0, review: 0, seen: 0, kind: 'cards' as const }
  return {
    collections: rows.length,
    total: rows.reduce((sum, row) => sum + row.total, 0),
    learned: rows.reduce((sum, row) => sum + row.known, 0),
    review: rows.reduce((sum, row) => sum + row.review, 0),
    cardsDone: cards.seen,
    cardsKnown: cards.known,
    games,
  }
}

function startedGames(games: GameStats[]) {
  return games.filter((game) => game.seen > 0 || game.known > 0 || game.review > 0)
}

function pickExtreme(games: GameStats[], prefer: 'high' | 'low') {
  return games.reduce<GameStats | undefined>((best, game) => {
    if (!best) return game
    if (prefer === 'high') return game.known > best.known ? game : best
    return game.known < best.known ? game : best
  }, undefined)
}

function uniquePoints(items: SkillPoint[], limit = 4) {
  const seen = new Set<string>()
  const next: SkillPoint[] = []
  for (const item of items) {
    const key = item.title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(item)
    if (next.length >= limit) break
  }
  return next
}

export function localOverallProfile(stats: OverallStats, rows: CollectionStats[]): { strengths: SkillPoint[]; weaknesses: SkillPoint[] } {
  const strengths: SkillPoint[] = []
  const weaknesses: SkillPoint[] = []

  if (stats.total === 0) {
    return {
      strengths: [],
      weaknesses: [{ title: 'Полка пуста', note: 'Пока нечего оценивать — добавьте слова.' }],
    }
  }

  const started = startedGames(stats.games)
  const untouched = stats.games.filter((game) => !started.includes(game))
  const best = pickExtreme(started, 'high')
  const worst = pickExtreme(started, 'low')

  if (best && best.known > 0) {
    strengths.push({
      title: sectionMeta(best.kind).label,
      note: `Сильнее всего этот режим: знаете ${best.known}, пройдено ${best.seen}.`,
    })
  }

  if (worst && (worst.kind !== best?.kind || worst.known < (best?.known ?? 0))) {
    weaknesses.push({
      title: sectionMeta(worst.kind).label,
      note: `Слабое место: закреплено только ${worst.known} при ${worst.seen} пройденных.`,
    })
  }

  if (untouched.length) {
    weaknesses.push({
      title: untouched.map((game) => sectionMeta(game.kind).label).join(', '),
      note: 'Эти режимы ещё не открывали.',
    })
  }

  if (stats.learned > 0) {
    strengths.push({
      title: 'Слова',
      note: `Выучено ${stats.learned} из ${stats.total} по минимуму среди игр.`,
    })
  } else {
    weaknesses.push({
      title: 'Закрепление',
      note: 'Пока ни одно слово не закрыто во всех начатых играх.',
    })
  }

  if (stats.review > stats.learned) {
    weaknesses.push({
      title: 'Повторение',
      note: `${stats.review} слов на повторе — больше, чем выученных.`,
    })
  } else if (stats.review === 0 && stats.learned > 0) {
    strengths.push({
      title: 'Повтор',
      note: 'Хвоста на повторении нет.',
    })
  }

  const ranked = [...rows].sort((left, right) => right.known - left.known || left.review - right.review)
  const strongestFile = ranked.find((row) => row.known > 0)
  const weakestFile = [...ranked].reverse().find((row) => row.total > 0)

  if (strongestFile && strongestFile.known >= Math.max(1, Math.ceil(strongestFile.total * 0.4))) {
    strengths.push({
      title: strongestFile.title,
      note: `Коллекция держится лучше других: общее ${strongestFile.known} из ${strongestFile.total}.`,
    })
  }

  if (weakestFile && weakestFile.id !== strongestFile?.id) {
    if (weakestFile.known === 0) {
      weaknesses.push({
        title: weakestFile.title,
        note: 'Эту коллекцию ещё не закрепляли.',
      })
    } else if (weakestFile.review > weakestFile.known || weakestFile.known < weakestFile.total / 2) {
      weaknesses.push({
        title: weakestFile.title,
        note: `Общее ${weakestFile.known} из ${weakestFile.total}, повторю ${weakestFile.review}.`,
      })
    }
  }

  if (stats.cardsDone > 0 && stats.cardsKnown >= stats.cardsDone * 0.6) {
    strengths.push({
      title: 'Карточки',
      note: `Из ${stats.cardsDone} пройденных карточек знаете ${stats.cardsKnown}.`,
    })
  }

  return {
    strengths: uniquePoints(strengths),
    weaknesses: uniquePoints(weaknesses),
  }
}

export function localOverallAdvice(stats: OverallStats, rows: CollectionStats[] = []): CollectionAdvice {
  const profile = localOverallProfile(stats, rows)
  const { total, learned, review, cardsDone, cardsKnown, collections } = stats
  if (total === 0) {
    return { insight: 'Пока нет слов на этом языке.', plan: 'Создайте коллекцию и откройте карточки.', ...profile }
  }
  if (cardsDone === 0 && learned === 0) {
    return {
      insight: `На полке ${total} слов в ${collections} коллекциях, но ни одна игра ещё не начата.`,
      plan: 'Сегодня: 8 карточек. Завтра: пазлы слабых слов. Послезавтра: переводы.',
      ...profile,
    }
  }
  if (review > learned) {
    return {
      insight: `Выучено ${learned} из ${total}, но на повторении уже ${review}. Карточек пройдено ${cardsDone}.`,
      plan: 'Сегодня только повтор. Завтра сопоставление. Потом снова карточки.',
      ...profile,
    }
  }
  if (learned >= total && total > 0) {
    return {
      insight: `Все ${total} слов закрыты по минимуму среди игр. Карточек пройдено ${cardsDone}, из них знаете ${cardsKnown}.`,
      plan: 'Раз в два дня прогоните самый слабый режим, чтобы не забыть.',
      ...profile,
    }
  }
  return {
    insight: `Выучено ${learned} из ${total} по самой слабой игре. Карточек пройдено ${cardsDone}.`,
    plan: 'Сегодня доберите карточки. Завтра проверьте слабый режим. Потом переводы.',
    ...profile,
  }
}

export function collectionStats(item: CatalogItem, progress: Record<string, FileProgress>): CollectionStats {
  const file = normalizeFileProgress(progress[item.id])
  const games = GAME_KINDS.map((kind) => {
    const stats = gameProgress(file, kind)
    return {
      kind,
      known: stats.knownIds.length,
      review: stats.reviewIds.length,
      seen: stats.seenIds.length,
    }
  })
  const started = games.filter((game) => game.seen > 0 || game.known > 0 || game.review > 0)
  const known = started.length ? Math.min(...started.map((game) => game.known)) : 0
  const weakest = started.reduce<GameStats | undefined>(
    (min, game) => (!min || game.known < min.known ? game : min),
    undefined,
  )

  return {
    id: item.id,
    title: item.title,
    total: item.words,
    known,
    review: weakest?.review ?? 0,
    seen: started.length ? Math.min(...started.map((game) => game.seen)) : 0,
    games,
  }
}

function localFileProfile(stats: CollectionStats): { strengths: SkillPoint[]; weaknesses: SkillPoint[] } {
  const started = startedGames(stats.games)
  const best = pickExtreme(started, 'high')
  const worst = pickExtreme(started, 'low')
  const strengths: SkillPoint[] = []
  const weaknesses: SkillPoint[] = []

  if (!started.length) {
    return {
      strengths: [],
      weaknesses: [{ title: 'Ещё не начата', note: 'Откройте карточки, чтобы появился профиль.' }],
    }
  }

  if (best && best.known > 0) {
    strengths.push({
      title: sectionMeta(best.kind).label,
      note: `${best.known} из ${stats.total} уже закреплено.`,
    })
  }
  if (worst && (worst.kind !== best?.kind || worst.known < (best?.known ?? 0))) {
    weaknesses.push({
      title: sectionMeta(worst.kind).label,
      note: `Только ${worst.known} из ${stats.total}.`,
    })
  }
  if (stats.review > stats.known) {
    weaknesses.push({ title: 'Повтор', note: `${stats.review} слов ждут повторения.` })
  } else if (stats.known > 0 && stats.review === 0) {
    strengths.push({ title: 'Повтор', note: 'Хвоста на повторении нет.' })
  }

  return { strengths: uniquePoints(strengths, 3), weaknesses: uniquePoints(weaknesses, 3) }
}

export function localAdvice(stats: CollectionStats): CollectionAdvice {
  const profile = localFileProfile(stats)
  const { total, known, review, seen, games } = stats
  if (total === 0) {
    return { insight: 'В коллекции пока нет слов.', plan: 'Добавьте 5–8 слов и откройте карточки.', ...profile }
  }
  if (seen === 0) {
    return {
      insight: 'Коллекцию ещё не открывали.',
      plan: 'Сегодня: 5 карточек. Завтра: пазл. Послезавтра: переводы с вариантами.',
      ...profile,
    }
  }
  const weakest = startedGames(games).reduce<GameStats | undefined>(
    (min, game) => (!min || game.known < min.known ? game : min),
    undefined,
  )
  const weakLabel = weakest ? sectionMeta(weakest.kind).label.toLowerCase() : 'играх'
  if (review > known) {
    return {
      insight: `Общая оценка ${known} из ${total} — по самому слабому режиму (${weakLabel}). На повторении ${review}.`,
      plan: `Сегодня только ${weakLabel}. Завтра сопоставление. Потом снова карточки.`,
      ...profile,
    }
  }
  if (known >= total) {
    return {
      insight: `Во всех начатых играх закреплено ${known} из ${total}.`,
      plan: 'Раз в два дня прогоните слабый режим, чтобы не забыть.',
      ...profile,
    }
  }
  return {
    insight: `Общая оценка ${known} из ${total} по минимуму среди игр. Слабее всего ${weakLabel}.`,
    plan: `Сегодня доберите ${weakLabel}. Завтра проверьте другим режимом.`,
    ...profile,
  }
}

type AdviceStore = {
  overall: Partial<Record<Language, CollectionAdvice>>
  files: Record<string, CollectionAdvice>
}

function isAdvice(value: unknown): value is CollectionAdvice {
  if (!value || typeof value !== 'object') return false
  const item = value as CollectionAdvice
  return (
    typeof item.insight === 'string' &&
    typeof item.plan === 'string' &&
    Array.isArray(item.strengths) &&
    Array.isArray(item.weaknesses)
  )
}

function readAdviceStore(): AdviceStore {
  const parsed = getSnapshot().advice as { overall?: unknown; files?: unknown } | null
  if (!parsed || typeof parsed !== 'object') return { overall: {}, files: {} }
  const overall: AdviceStore['overall'] = {}
  if (parsed.overall && typeof parsed.overall === 'object') {
    for (const [key, value] of Object.entries(parsed.overall as Record<string, unknown>)) {
      if ((key === 'fr' || key === 'de' || key === 'en') && isAdvice(value)) overall[key] = value
    }
  }
  const files: Record<string, CollectionAdvice> = {}
  if (parsed.files && typeof parsed.files === 'object') {
    for (const [id, value] of Object.entries(parsed.files as Record<string, unknown>)) {
      if (isAdvice(value)) files[id] = value
    }
  }
  return { overall, files }
}

function writeAdviceStore(store: AdviceStore) {
  const prev = getSnapshot().advice
  const extra = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {}
  updateSnapshot({ advice: { ...extra, overall: store.overall, files: store.files } })
}

function hasCyrillic(text: string) {
  return /[а-яё]/i.test(text)
}

function keepRussian(text: string, fallback: string) {
  const trimmed = text.trim()
  if (!trimmed) return fallback
  return hasCyrillic(trimmed) ? trimmed : fallback
}

type AdviceBundle = {
  files: Record<string, CollectionAdvice>
  overall: CollectionAdvice
}

function takePoints(raw: unknown, fallback: SkillPoint[]): SkillPoint[] {
  if (!Array.isArray(raw)) return fallback
  const next: SkillPoint[] = []
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      if (hasCyrillic(item)) next.push({ title: item.trim(), note: '' })
    } else if (item && typeof item === 'object') {
      const title = String((item as { title?: string }).title ?? '').trim()
      const note = String((item as { note?: string }).note ?? '').trim()
      if (title && hasCyrillic(`${title} ${note}`)) next.push({ title, note })
    }
    if (next.length >= 4) break
  }
  return next.length ? next : fallback
}

function pointRows(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw
  return raw.map((item) => {
    if (Array.isArray(item)) return { title: asText(item[0]), note: asText(item[1]) }
    return item
  })
}

function fileFromRow(value: unknown): { id?: string; insight?: string; plan?: string; strengths?: unknown; weaknesses?: unknown } | null {
  if (Array.isArray(value)) {
    const id = asText(value[0])
    if (!id) return null
    return {
      id,
      insight: asText(value[1]),
      plan: asText(value[2]),
      strengths: pointRows(value[3]),
      weaknesses: pointRows(value[4]),
    }
  }
  if (!value || typeof value !== 'object') return null
  return value as { id?: string; insight?: string; plan?: string; strengths?: unknown; weaknesses?: unknown }
}

function parseAdvicePayload(text: string): {
  overall?: { insight?: string; plan?: string; strengths?: unknown; weaknesses?: unknown }
  files: { id?: string; insight?: string; plan?: string; strengths?: unknown; weaknesses?: unknown }[]
} {
  const value = parseModelValue(text)
  if (Array.isArray(value)) {
    return {
      overall: {
        insight: asText(value[0]),
        plan: asText(value[1]),
        strengths: pointRows(value[2]),
        weaknesses: pointRows(value[3]),
      },
      files: asRows(value[4])
        .map((item) => fileFromRow(item))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    }
  }
  if (value && typeof value === 'object') {
    const data = value as {
      overall?: { insight?: string; plan?: string; strengths?: unknown; weaknesses?: unknown }
      files?: unknown[]
    }
    return {
      overall: data.overall,
      files: (data.files ?? [])
        .map((item) => fileFromRow(item))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    }
  }
  return { files: [] }
}

function mergeAdvice(
  base: CollectionAdvice,
  patch?: { insight?: string; plan?: string; strengths?: unknown; weaknesses?: unknown },
): CollectionAdvice {
  return {
    insight: keepRussian(patch?.insight ?? '', base.insight),
    plan: keepRussian(patch?.plan ?? '', base.plan),
    strengths: takePoints(patch?.strengths, base.strengths),
    weaknesses: takePoints(patch?.weaknesses, base.weaknesses),
  }
}

export function loadAdvice(language: Language, rows: CollectionStats[]): AdviceBundle {
  const store = readAdviceStore()
  const files = Object.fromEntries(
    rows.map((row) => [row.id, store.files[row.id] ?? localAdvice(row)]),
  )
  return {
    files,
    overall: store.overall[language] ?? localOverallAdvice(overallFromRows(rows), rows),
  }
}

function weakestRows(rows: CollectionStats[], limit = 3) {
  return [...rows]
    .sort((left, right) => {
      const leftRatio = left.total ? left.known / left.total : 1
      const rightRatio = right.total ? right.known / right.total : 1
      return leftRatio - rightRatio || right.review - left.review
    })
    .slice(0, limit)
}

export async function refreshAdvice(
  language: Language,
  rows: CollectionStats[],
  displayName: string,
  tutorPrompt = '',
): Promise<AdviceBundle> {
  const ready = loadAdvice(language, rows)
  if (rows.length === 0) return ready
  if (!hasGemini()) throw new Error('no-key')

  const focus = weakestRows(rows)
  const localOverall = localOverallAdvice(overallFromRows(rows), rows)
  const meta = languageMeta(language)
  const totals = overallFromRows(rows)
  const skills = skillProfileFor(language)
  const system = [
    `You are the StudyLang tutor. The student is ${displayName}. Practice language: ${meta.native}.`,
    'Short review from the numbers. All prose in Russian. Do not retell the deck.',
    skills.tutorLine,
    tutorPrompt.trim() ? `Tone: ${tutorPrompt.trim().slice(0, 120)}` : '',
    'Overall review and only the listed weak collections. strengths/weaknesses — 2 each.',
    'Reply with one array, no keys:',
    '["вывод","план",[["сила","заметка"]],[["слабость","заметка"]],[["id","вывод","план",[["сила","заметка"]],[["слабость","заметка"]]]]',
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = [
    `Summary: collections ${totals.collections}, words ${totals.total}, learned ${totals.learned}, review ${totals.review}, cards ${totals.cardsDone}/${totals.cardsKnown}.`,
    `Skills: ${skills.bars.map((bar) => `${bar.label} ${bar.score ?? '—'}`).join(', ')}. ${skills.note}`,
    `Games: ${totals.games.map((game) => `${sectionMeta(game.kind).label} ${game.known}`).join(', ')}.`,
    ...focus.map((row) => {
      const games = row.games.map((game) => `${sectionMeta(game.kind).label} ${game.known}`).join(', ')
      return `${row.id} | «${row.title}» | ${row.known}/${row.total}, review ${row.review}. ${games}`
    }),
  ].join('\n')

  const raw = await askGemini(system, [{ role: 'user', text: prompt }], { maxTokens: 700 })
  const parsed = parseAdvicePayload(raw)

  ready.overall = mergeAdvice(localOverall, parsed.overall)
  const updated: Record<string, CollectionAdvice> = {}
  for (const item of parsed.files) {
    if (!item.id || !ready.files[item.id]) continue
    if (!focus.some((row) => row.id === item.id)) continue
    ready.files[item.id] = mergeAdvice(ready.files[item.id], item)
    updated[item.id] = ready.files[item.id]
  }

  const store = readAdviceStore()
  writeAdviceStore({
    overall: { ...store.overall, [language]: ready.overall },
    files: { ...store.files, ...updated },
  })
  return ready
}
