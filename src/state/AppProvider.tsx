import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { uid } from '../lib/normalize'
import { chatsForLanguage, getSnapshot, readVoiceVolume, refreshFromApi, subscribe, updateSnapshot } from '../lib/persist'
import { normalizeFileProgress, writeGame } from '../lib/progress'
import { setVoiceVolume as applyVoiceVolume } from '../lib/speech'
import { forgetTutorLibrary } from '../lib/tutor'
import { saveTutorDraft } from '../lib/tutorFile'
import type { Chat, ChatMessage, FileProgress, GameKind, Language, ThemeMode, Virtualization } from '../types'

type AppContextValue = {
  chats: Chat[]
  language: Language
  theme: ThemeMode
  displayName: string
  tutorPrompt: string
  voiceVolume: number
  sidebarCollapsed: boolean
  mobileOpen: boolean
  settingsOpen: boolean
  progress: Record<string, FileProgress>
  setLanguage: (language: Language) => void
  setTheme: (theme: ThemeMode) => void
  setDisplayName: (name: string) => void
  setTutorPrompt: (value: string) => void
  setVoiceVolume: (value: number) => void
  setSidebarCollapsed: (value: boolean) => void
  setMobileOpen: (value: boolean) => void
  setSettingsOpen: (value: boolean) => void
  createChat: (seed?: string, virtualization?: Virtualization) => Chat
  renameChat: (id: string, title: string) => void
  setChatVirtualization: (id: string, virtualization: Virtualization) => void
  deleteChat: (id: string) => void
  appendMessage: (chatId: string, message: Omit<ChatMessage, 'id' | 'createdAt'>) => ChatMessage
  removeMessage: (chatId: string, messageId: string) => void
  clearPartnerMessages: (chatId: string) => void
  saveVocabFromMessage: (chatId: string, messageId: string) => string | null
  markProgress: (fileId: string, entryId: string, status: 'known' | 'review', kind: GameKind) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const initial = getSnapshot()
  const [chats, setChats] = useState<Chat[]>(initial.chats)
  const [language, setLanguage] = useState<Language>(initial.language)
  const [theme, setTheme] = useState<ThemeMode>(initial.theme)
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [tutorPrompt, setTutorPrompt] = useState(initial.tutorPrompt)
  const [voiceVolume, setVoiceVolumeState] = useState(() => readVoiceVolume(initial.voiceVolume))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initial.sidebarCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [progress, setProgress] = useState<Record<string, FileProgress>>(() =>
    Object.fromEntries(
      Object.entries(initial.progress).map(([id, value]) => [id, normalizeFileProgress(value)]),
    ),
  )
  const skipSave = useRef(true)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#161310' : '#f3eee4')
  }, [theme])

  useEffect(() => {
    subscribe(() => {
      const next = getSnapshot().chats
      setChats((prev) => {
        if (
          prev.length === next.length &&
          prev.every((chat, index) => chat.id === next[index]?.id && chat.updatedAt === next[index]?.updatedAt)
        ) {
          return prev
        }
        return next
      })
    })
  }, [])

  useEffect(() => {
    const pull = () => {
      if (document.visibilityState === 'visible') void refreshFromApi()
    }
    pull()
    document.addEventListener('visibilitychange', pull)
    const timer = window.setInterval(pull, 30_000)
    return () => {
      document.removeEventListener('visibilitychange', pull)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    applyVoiceVolume(voiceVolume)
  }, [voiceVolume])

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    updateSnapshot({ chats, language, theme, displayName, tutorPrompt, voiceVolume, sidebarCollapsed, progress })
  }, [chats, language, theme, displayName, tutorPrompt, voiceVolume, sidebarCollapsed, progress])

  const createChat = useCallback(
    (seed?: string, virtualization?: Virtualization) => {
      const scene = virtualization?.sphere.trim() || virtualization?.backstory.trim() ? virtualization : undefined
      const chat: Chat = {
        id: uid('chat'),
        title: seed?.slice(0, 42) || scene?.sphere.trim() || 'Новый чат',
        language,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        virtualization: scene,
      }
      setChats((prev) => [chat, ...prev])
      return chat
    },
    [language],
  )

  const renameChat = useCallback((id: string, title: string) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? { ...chat, title } : chat)))
  }, [])

  const setChatVirtualization = useCallback((id: string, virtualization: Virtualization) => {
    const scene = virtualization.sphere.trim() || virtualization.backstory.trim() ? virtualization : undefined
    setChats((prev) =>
      prev.map((chat) => (chat.id === id ? { ...chat, virtualization: scene, updatedAt: Date.now() } : chat)),
    )
  }, [])

  const deleteChat = useCallback((id: string) => {
    setChats((prev) => prev.filter((chat) => chat.id !== id))
  }, [])

  const appendMessage = useCallback((chatId: string, message: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    const full: ChatMessage = { ...message, id: uid('msg'), createdAt: Date.now() }
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat
        const title =
          chat.messages.length === 0 && message.role === 'user' ? message.content.slice(0, 42) : chat.title
        return {
          ...chat,
          title,
          updatedAt: Date.now(),
          messages: [...chat.messages, full],
        }
      }),
    )
    return full
  }, [])

  const removeMessage = useCallback((chatId: string, messageId: string) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat
        const messages = chat.messages.filter((item) => item.id !== messageId)
        if (messages.length === chat.messages.length) return chat
        return { ...chat, messages, updatedAt: Date.now() }
      }),
    )
  }, [])

  const clearPartnerMessages = useCallback((chatId: string) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat
        const messages = chat.messages.filter((item) => item.channel !== 'partner')
        if (messages.length === chat.messages.length) return chat
        return { ...chat, messages, updatedAt: Date.now() }
      }),
    )
  }, [])

  const saveVocabFromMessage = useCallback(
    (chatId: string, messageId: string): string | null => {
      const chat = chats.find((item) => item.id === chatId)
      const message = chat?.messages.find((item) => item.id === messageId)
      if (!message?.fileDraft) return message?.fileId ?? null
      if (message.fileSaved) return message.fileId ?? null
      const saved = saveTutorDraft(language, message.fileDraft)
      forgetTutorLibrary(language)
      setChats((prev) =>
        prev.map((item) =>
          item.id !== chatId
            ? item
            : {
                ...item,
                updatedAt: Date.now(),
                messages: item.messages.map((entry) =>
                  entry.id === messageId
                    ? { ...entry, fileSaved: true, fileId: saved.id }
                    : entry,
                ),
              },
        ),
      )
      return saved.id
    },
    [chats, language],
  )

  const setVoiceVolume = useCallback((value: number) => {
    applyVoiceVolume(value)
    setVoiceVolumeState(value)
  }, [])

  const markProgress = useCallback((fileId: string, entryId: string, status: 'known' | 'review', kind: GameKind) => {
    setProgress((prev) => ({ ...prev, [fileId]: writeGame(prev[fileId], kind, entryId, status) }))
  }, [])

  const visibleChats = useMemo(() => chatsForLanguage(chats, language), [chats, language])

  const value = useMemo<AppContextValue>(
    () => ({
      chats: visibleChats,
      language,
      theme,
      displayName,
      tutorPrompt,
      voiceVolume,
      sidebarCollapsed,
      mobileOpen,
      settingsOpen,
      progress,
      setLanguage,
      setTheme,
      setDisplayName,
      setTutorPrompt,
      setVoiceVolume,
      setSidebarCollapsed,
      setMobileOpen,
      setSettingsOpen,
      createChat,
      renameChat,
      setChatVirtualization,
      deleteChat,
      appendMessage,
      removeMessage,
      clearPartnerMessages,
      saveVocabFromMessage,
      markProgress,
    }),
    [
      visibleChats,
      language,
      theme,
      displayName,
      tutorPrompt,
      voiceVolume,
      sidebarCollapsed,
      mobileOpen,
      settingsOpen,
      progress,
      createChat,
      renameChat,
      setChatVirtualization,
      deleteChat,
      appendMessage,
      removeMessage,
      clearPartnerMessages,
      saveVocabFromMessage,
      markProgress,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
