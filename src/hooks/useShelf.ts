import { useCallback, useEffect, useState } from 'react'
import {
  addGroup,
  deleteGroup,
  loadShelf,
  moveFile,
  renameGroup,
  saveShelf,
  setSort,
  type LanguageShelf,
  type ShelfSort,
} from '../lib/shelf'
import type { Language } from '../types'

export function useShelf(language: Language) {
  const [shelf, setShelf] = useState<LanguageShelf>(() => loadShelf(language))

  useEffect(() => {
    setShelf(loadShelf(language))
  }, [language])

  const commit = useCallback(
    (next: LanguageShelf) => {
      setShelf(next)
      saveShelf(language, next)
    },
    [language],
  )

  return {
    shelf,
    setSort: (sort: ShelfSort) => commit(setSort(shelf, sort)),
    addGroup: (name: string) => commit(addGroup(shelf, name)),
    renameGroup: (id: string, name: string) => commit(renameGroup(shelf, id, name)),
    deleteGroup: (id: string) => commit(deleteGroup(shelf, id)),
    moveFile: (fileId: string, groupId: string | null, beforeId?: string | null) =>
      commit(moveFile(shelf, fileId, groupId, beforeId)),
  }
}
