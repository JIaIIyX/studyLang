import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadAdvice,
  refreshAdvice,
  collectionStats,
  localAdvice,
  localOverallAdvice,
  overallFromRows,
  type CollectionAdvice,
} from '../lib/collectionAdvice'
import { useApp } from '../state/AppProvider'
import type { CatalogItem } from '../types'

export function useCollectionAdvice(items: CatalogItem[]) {
  const { language, progress, displayName, tutorPrompt } = useApp()
  const rows = useMemo(() => items.map((item) => collectionStats(item, progress)), [items, progress])
  const overall = useMemo(() => overallFromRows(rows), [rows])
  const fileKey = useMemo(() => `${language}:${items.map((item) => item.id).join('|')}`, [language, items])
  const [advice, setAdvice] = useState<Record<string, CollectionAdvice>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, localAdvice(row)])),
  )
  const [overallAdvice, setOverallAdvice] = useState<CollectionAdvice>(() => localOverallAdvice(overall, rows))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef({ rows, displayName, tutorPrompt })
  latest.current = { rows, displayName, tutorPrompt }

  useEffect(() => {
    const next = loadAdvice(language, latest.current.rows)
    setAdvice(next.files)
    setOverallAdvice(next.overall)
    setError(null)
  }, [language, fileKey])

  const refresh = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await refreshAdvice(language, latest.current.rows, latest.current.displayName, latest.current.tutorPrompt)
      setAdvice(next.files)
      setOverallAdvice(next.overall)
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message === 'no-key'
          ? 'Нет ключа OpenRouter — разбор остаётся локальным.'
          : 'Не получилось обновить разбор. Подождите минуту и нажмите ещё раз.',
      )
    } finally {
      setBusy(false)
    }
  }, [busy, language])

  return { rows, advice, overall, overallAdvice, refresh, busy, error }
}
