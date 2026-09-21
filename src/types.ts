export type Language = 'fr' | 'de' | 'en'
export type SectionKind = 'words' | 'cards' | 'puzzles' | 'sentences' | 'translations' | 'matching'
export type ThemeMode = 'light' | 'dark'

export type WordEntry = {
  id: string
  term: string
  translation?: string
  ipa?: string
  pos?: string
  example?: string
  exampleTranslation?: string
  tokens?: string[]
  hint?: string
  choices?: string[]
  termChoices?: string[]
  puzzle?: string
  heading?: string
}

export type WordFile = {
  id: string
  title: string
  language: Language
  level?: string
  kind: SectionKind
  description?: string
  entries: WordEntry[]
}

export type CatalogItem = {
  id: string
  title: string
  language: Language
  level?: string
  kind: SectionKind
  path: string
  description: string
  words: number
  source: 'builtin' | 'upload'
}

export type VocabDraftEntry = {
  term: string
  translation?: string
  tokens?: string[]
  choices?: string[]
  termChoices?: string[]
  puzzle?: string
  heading?: string
}

export type VocabDraft = {
  title: string
  kind: 'words' | 'sentences'
  description?: string
  entries: VocabDraftEntry[]
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  channel?: 'tutor' | 'partner'
  fileDraft?: VocabDraft
  fileSaved?: boolean
  fileId?: string
  refIds?: string[]
  homeworkId?: string
}

export type Virtualization = {
  sphere: string
  backstory: string
}

export type Chat = {
  id: string
  title: string
  language: Language
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  virtualization?: Virtualization
}

export type GameKind = 'cards' | 'puzzles' | 'sentences' | 'translations' | 'matching'

export type GameProgress = {
  knownIds: string[]
  reviewIds: string[]
  seenIds: string[]
}

export type FileProgress = {
  games: Partial<Record<GameKind, GameProgress>>
}
