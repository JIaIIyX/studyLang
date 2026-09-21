import { useEffect, useState } from 'react'
import { catalogWithUploads, loadWordFile } from '../lib/library'
import type { CatalogItem, WordFile } from '../types'

export function useWordFile(fileId?: string) {
  const [item, setItem] = useState<CatalogItem | undefined>()
  const [file, setFile] = useState<WordFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(fileId))

  useEffect(() => {
    if (!fileId) {
      setFile(null)
      setItem(undefined)
      setLoading(false)
      return
    }

    const found = catalogWithUploads().find((entry) => entry.id === fileId)
    setItem(found)
    if (!found) {
      setError('Файл не найден')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    loadWordFile(found)
      .then((data) => {
        if (!cancelled) setFile(data)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Ошибка загрузки')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [fileId])

  return { item, file, error, loading }
}
