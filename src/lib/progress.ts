import type { FileProgress, GameKind, GameProgress } from '../types'

export const GAME_KINDS: GameKind[] = ['cards', 'puzzles', 'sentences', 'translations', 'matching']

export function emptyGame(): GameProgress {
  return { knownIds: [], reviewIds: [], seenIds: [] }
}

function stringsOf(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function normalizeFileProgress(raw: unknown): FileProgress {
  if (!raw || typeof raw !== 'object') return { games: {} }
  const item = raw as Record<string, unknown>
  if (item.games && typeof item.games === 'object') {
    return { games: item.games as FileProgress['games'] }
  }
  if ('knownIds' in item || 'reviewIds' in item || 'seenIds' in item) {
    return {
      games: {
        cards: {
          knownIds: stringsOf(item.knownIds),
          reviewIds: stringsOf(item.reviewIds),
          seenIds: stringsOf(item.seenIds),
        },
      },
    }
  }
  return { games: {} }
}

export function gameProgress(file: FileProgress | undefined, kind: GameKind): GameProgress {
  return file?.games?.[kind] ?? emptyGame()
}

export function writeGame(
  prev: FileProgress | undefined,
  kind: GameKind,
  entryId: string,
  status: 'known' | 'review',
): FileProgress {
  const current = gameProgress(prev, kind)
  const knownIds = current.knownIds.filter((id) => id !== entryId)
  const reviewIds = current.reviewIds.filter((id) => id !== entryId)
  if (status === 'known') knownIds.push(entryId)
  if (status === 'review') reviewIds.push(entryId)
  const seenIds = current.seenIds.includes(entryId) ? current.seenIds : [...current.seenIds, entryId]
  return {
    games: {
      ...prev?.games,
      [kind]: { knownIds, reviewIds, seenIds },
    },
  }
}
