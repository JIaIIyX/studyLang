import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bookmark, Gamepad2, MessagesSquare, RotateCcw, X } from 'lucide-react'
import { ChatComposer, type ChatComposerHandle } from '../components/chat/ChatComposer'
import { gradeBubbleParts, MistakeHint } from '../components/chat/MistakeHint'
import { MessageAnchor, Quotable } from '../components/chat/MessageAnchor'
import { UserMessageActions } from '../components/chat/UserMessageActions'
import { GAME_LINKS } from '../components/layout/GamesLabel'
import { LookupText, WordLookupProvider } from '../components/WordLookup'
import { Mark } from '../components/Mark'
import { RichText } from '../components/RichText'
import { MODEL_TIMEOUT_HINT } from '../lib/llm'
import { languageMeta } from '../lib/languages'
import { messageAnchor, messageNo, previewMessage } from '../lib/messageRef'
import { getSnapshot } from '../lib/persist'
import { adusoLesson, nebensatzLesson, threadMentionsNebensatz, wantsAduso, wantsNebensatz } from '../lib/aduso'
import { swissGermanLesson, wantsGrueziContrast, wantsSwissGerman } from '../lib/swissGerman'
import { forgetTutorLibrary, makeVocabReply, replyAsTutor, wantsSpokenDialogue, wantsVocabList } from '../lib/tutor'
import { isReferentialVocabWish } from '../lib/vocabFromContext'
import { bindQuizAnswer } from '../lib/quizReply'
import { extractQuizAnswer } from '../lib/practiceTags'
import { extractQuizChoices } from '../lib/quizChoices'
import { isPartnerMessage, partnerPersona, sceneIsOn } from '../lib/virtualization'
import { useApp } from '../state/AppProvider'
import type { ChatMessage, Virtualization } from '../types'

const DialogueWindow = lazy(() =>
  import('../components/chat/DialogueWindow').then((mod) => ({ default: mod.DialogueWindow })),
)
const VirtualizationPanel = lazy(() =>
  import('../components/chat/VirtualizationPanel').then((mod) => ({ default: mod.VirtualizationPanel })),
)
const ChatMatchHint = lazy(() =>
  import('../components/chat/ChatMatchHint').then((mod) => ({ default: mod.ChatMatchHint })),
)
const PhraseTranslate = lazy(() =>
  import('../components/chat/PhraseTranslate').then((mod) => ({ default: mod.PhraseTranslate })),
)
const HomeworkLabel = lazy(() =>
  import('../components/chat/HomeworkLabel').then((mod) => ({ default: mod.HomeworkLabel })),
)
const VocabCardsLabel = lazy(() =>
  import('../components/chat/VocabCardsLabel').then((mod) => ({ default: mod.VocabCardsLabel })),
)

async function loadHomework() {
  return import('../lib/homework')
}
async function loadPartner() {
  return import('../lib/partner')
}
async function loadTutorFile() {
  return import('../lib/tutorFile')
}
function isWriteQuizHint(text: string) {
  return Boolean(extractQuizAnswer(text) && extractQuizChoices(text).length < 2)
}

const suggestions = [
  { title: 'Пять минут у доски', text: 'Проверь меня по текущему языку', note: '01' },
  { title: 'Слово с полки', text: 'Дай слово и пример из файла', note: '02' },
  { title: 'Артикли', text: 'Объясни артикли der die das', note: '03' },
  { title: 'Придумай слова', text: 'Придумай 8 слов про кафе с переводом', note: '04' },
  { title: 'Таблица', text: 'Собери таблицу: слово, перевод и короткий пример', note: '05' },
]

export function ChatPage() {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const [studyToast, setStudyToast] = useState<{ fileId: string; title: string } | null>(null)

  useEffect(() => {
    if (!studyToast) return
    const timer = window.setTimeout(() => setStudyToast(null), 12000)
    return () => window.clearTimeout(timer)
  }, [studyToast])
  const {
    chats,
    createChat,
    appendMessage,
    removeMessage,
    clearPartnerMessages,
    saveVocabFromMessage,
    setChatVirtualization,
    displayName,
    language,
    progress,
    tutorPrompt,
  } = useApp()
  const [localChatId, setLocalChatId] = useState<string | null>(null)
  const activeChatId = chatId || localChatId
  const chat = chats.find((item) => item.id === activeChatId)
  const tutorMessages = useMemo(
    () => (chat?.messages ?? []).filter((item) => !isPartnerMessage(item)),
    [chat?.messages],
  )
  const partnerMessages = useMemo(
    () => (chat?.messages ?? []).filter(isPartnerMessage),
    [chat?.messages],
  )
  const composerRef = useRef<ChatComposerHandle>(null)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [gamesMenuOpen, setGamesMenuOpen] = useState(false)
  const [sceneOpen, setSceneOpen] = useState(false)
  const [dialogueOpen, setDialogueOpen] = useState(false)
  const [dialogueMode, setDialogueMode] = useState<'chat' | 'call'>('chat')
  const [scene, setScene] = useState<Virtualization>({ sphere: '', backstory: '' })
  const who = partnerPersona(language, scene)
  const [attachedIds, setAttachedIds] = useState<string[]>([])
  const [sendError, setSendError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const dialogueAbort = useRef<AbortController | null>(null)
  const dialogueGen = useRef(0)
  const sendGen = useRef(0)
  const meta = languageMeta(language)

  useEffect(() => {
    setScene(chat?.virtualization ?? { sphere: '', backstory: '' })
    setSceneOpen(Boolean(chat?.virtualization?.sphere || chat?.virtualization?.backstory))
    setAttachedIds([])
    setBusy(false)
    if (chatId) setLocalChatId(chatId)
  }, [chatId])

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash.startsWith('msg-')) return
    document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [chat?.messages.length])

  useEffect(() => {
    if (!chatId || chat) return
    const stored = getSnapshot().chats.find((item) => item.id === chatId)
    if (stored && stored.language !== language) navigate('/', { replace: true })
  }, [chat, chatId, language, navigate])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat?.messages.length, busy])

  const applyScene = (next: Virtualization) => {
    setScene(next)
    if (chatId && chats.some((item) => item.id === chatId)) setChatVirtualization(chatId, next)
  }

  const toggleAttach = (id: string) => {
    setAttachedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id].slice(-5)))
  }

  const postVocab = async (id: string, history: ChatMessage[], gen?: number) => {
    setBusy(true)
    try {
      const reply = await makeVocabReply(language, history, chat?.memory)
      if (gen != null && gen !== sendGen.current) return
      let fileId: string | undefined
      if (reply.file) {
        const saved = (await loadTutorFile()).saveTutorDraft(language, reply.file)
        fileId = saved.id
        forgetTutorLibrary(language)
        setStudyToast({ fileId: saved.id, title: reply.file.title })
      }
      appendMessage(id, {
        role: 'assistant',
        content: reply.text,
        fileDraft: reply.file || undefined,
        fileSaved: Boolean(reply.file),
        fileId,
        channel: 'tutor',
      })
    } catch {
      if (gen != null && gen !== sendGen.current) return
      appendMessage(id, { role: 'assistant', content: 'Словарь сейчас не собрался. Напишите тему ещё раз.' })
    } finally {
      if (gen == null || gen === sendGen.current) setBusy(false)
    }
  }

  const send = async (text: string, existingId = chatId, refs: string[] = attachedIds) => {
    const content = text.trim() || (refs.length ? 'Про прикреплённое сообщение.' : '')
    if (!content) return
    composerRef.current?.clear()
    setMenuOpen(false)
    setAttachedIds([])
    sendGen.current += 1
    const gen = sendGen.current
    dialogueAbort.current?.abort()

    let id = existingId || localChatId
    if (!id || !chats.some((item) => item.id === id)) {
      const created = createChat(content, scene)
      id = created.id
      setLocalChatId(id)
      navigate(`/c/${id}`, { replace: true })
    } else {
      setChatVirtualization(id, scene)
    }

    const history = chats.find((item) => item.id === id)?.messages ?? chat?.messages ?? []
    const thread = history.filter((item) => !isPartnerMessage(item))
    const bound = bindQuizAnswer(content, thread, { skip: refs.length > 0 })
    const refIds = [...new Set([...refs, ...bound.refIds])].filter(
      (item) => history.some((message) => message.id === item) || chat?.messages.some((message) => message.id === item),
    )
    const posted = bound.content
    const refSnippet = refIds
      .map((item) => {
        const target = history.find((message) => message.id === item) ?? chat?.messages.find((message) => message.id === item)
        return target ? previewMessage(target.content, 80) : ''
      })
      .filter(Boolean)
      .join(' · ')
    const nextHistory: ChatMessage[] = [
      ...history,
      {
        id: 'tmp',
        role: 'user',
        content: posted,
        createdAt: Date.now(),
        refIds: refIds.length ? refIds : undefined,
        refSnippet: refSnippet || undefined,
        channel: 'tutor',
      },
    ]
    const user = appendMessage(id, {
      role: 'user',
      content: posted,
      refIds: refIds.length ? refIds : undefined,
      refSnippet: refSnippet || undefined,
      channel: 'tutor',
    })
    setSendError('')

    if (wantsAduso(content) || wantsAduso(posted)) {
      setBusy(true)
      try {
        const text = adusoLesson(threadMentionsNebensatz(nextHistory))
        if (gen !== sendGen.current) return
        appendMessage(id, { role: 'assistant', content: text, channel: 'tutor' })
      } finally {
        if (gen === sendGen.current) setBusy(false)
      }
      return
    }

    if (wantsSwissGerman(content) || wantsSwissGerman(posted)) {
      setBusy(true)
      try {
        const text = swissGermanLesson(wantsGrueziContrast(content) || wantsGrueziContrast(posted))
        if (gen !== sendGen.current) return
        appendMessage(id, { role: 'assistant', content: text, channel: 'tutor' })
      } finally {
        if (gen === sendGen.current) setBusy(false)
      }
      return
    }

    if (wantsNebensatz(content) || wantsNebensatz(posted)) {
      setBusy(true)
      try {
        const text = nebensatzLesson(nextHistory.slice(0, -1).map((item) => item.content).join('\n'))
        if (gen !== sendGen.current) return
        appendMessage(id, { role: 'assistant', content: text, channel: 'tutor' })
      } finally {
        if (gen === sendGen.current) setBusy(false)
      }
      return
    }

    if (wantsSpokenDialogue(content)) {
      setDialogueMode('call')
      setDialogueOpen(true)
      setBusy(false)
      return
    }




    const homework = await loadHomework()
    if (homework.wantsHomework(content)) {
      setBusy(true)
      try {
        const sheet = await homework.assignHomework({ language, displayName, tutorPrompt, wish: content, progress })
        if (gen !== sendGen.current) return
        homework.saveHomework(sheet)
        appendMessage(id, {
          role: 'assistant',
          content: `Собрал тетрадь «${sheet.title}»: ${sheet.tasks.length} заданий${sheet.tags?.length ? ` · ${sheet.tags.slice(0, 3).join(', ')}` : ''}.`,
          homeworkId: sheet.id,
          channel: 'tutor',
        })
      } catch {
        if (gen !== sendGen.current) return
        appendMessage(id, { role: 'assistant', content: 'Тетрадь сейчас не собралась. Напишите ещё раз.' })
      } finally {
        if (gen === sendGen.current) setBusy(false)
      }
      return
    }

    if (wantsVocabList(nextHistory) || isReferentialVocabWish(posted) || (refIds.length > 0 && /слов|фраз|словар|добав/i.test(posted))) {
      await postVocab(id, nextHistory, gen)
      return
    }

    setBusy(true)
    try {
      const reply = await replyAsTutor(language, nextHistory, {
        displayName,
        progress,
        tutorPrompt,
        memory: chat?.memory,
      })
      if (gen !== sendGen.current) return
      if (reply.retry) {
        removeMessage(id, user.id)
        composerRef.current?.setText(content)
        setSendError(reply.text || MODEL_TIMEOUT_HINT)
        return
      }
      appendMessage(id, {
        role: 'assistant',
        content: reply.text,
        fileDraft: reply.file || undefined,
        mistakeHint: reply.mistakeHint,
        channel: 'tutor',
      })
    } catch {
      if (gen !== sendGen.current) return
      removeMessage(id, user.id)
      composerRef.current?.setText(content)
      setSendError(MODEL_TIMEOUT_HINT)
    } finally {
      if (gen === sendGen.current) setBusy(false)
    }
  }

  const ensureChat = () => {
    const current = chatId || localChatId
    if (current && chats.some((item) => item.id === current)) {
      setChatVirtualization(current, scene)
      return current
    }
    const created = createChat(scene.sphere.trim() || 'Диалог', scene)
    setLocalChatId(created.id)
    navigate(`/c/${created.id}`, { replace: true })
    return created.id
  }

  const askPartner = async (
    id: string,
    history: ChatMessage[],
    userMessageId: string,
    options?: { start?: boolean; interrupted?: boolean },
  ): Promise<'ok' | 'dropped' | 'failed'> => {
    dialogueAbort.current?.abort()
    const ac = new AbortController()
    dialogueAbort.current = ac
    const gen = ++dialogueGen.current
    setBusy(true)
    try {
      const reply = await (await loadPartner()).replyAsPartner(language, history, {
        displayName,
        virtualization: scene,
        start: options?.start,
        interrupted: options?.interrupted,
        signal: ac.signal,
      })
      if (gen !== dialogueGen.current || ac.signal.aborted) {
        removeMessage(id, userMessageId)
        return 'dropped'
      }
      appendMessage(id, { role: 'assistant', content: reply.text, channel: 'partner' })
      return 'ok'
    } catch {
      removeMessage(id, userMessageId)
      if (gen !== dialogueGen.current || ac.signal.aborted) return 'dropped'
      return 'failed'
    } finally {
      if (gen === dialogueGen.current) setBusy(false)
    }
  }

  const startScene = async () => {
    const id = ensureChat()
    const history = chats.find((item) => item.id === id)?.messages ?? []
    if (history.some((item) => item.channel === 'partner' && item.role === 'assistant')) return 'ok' as const
    dialogueAbort.current?.abort()
    const ac = new AbortController()
    dialogueAbort.current = ac
    const gen = ++dialogueGen.current
    setBusy(true)
    try {
      const reply = await (await loadPartner()).replyAsPartner(language, history, {
        displayName,
        virtualization: scene,
        start: true,
        signal: ac.signal,
      })
      if (gen !== dialogueGen.current || ac.signal.aborted) return 'dropped' as const
      appendMessage(id, { role: 'assistant', content: reply.text, channel: 'partner' })
      return 'ok' as const
    } catch {
      if (gen !== dialogueGen.current || ac.signal.aborted) return 'dropped' as const
      return 'failed' as const
    } finally {
      if (gen === dialogueGen.current) setBusy(false)
    }
  }

  const openDialogue = (nextMode: 'chat' | 'call' = 'chat') => {
    setDialogueMode(nextMode)
    const id = ensureChat()
    setSceneOpen(false)
    setDialogueOpen(true)
    const history = chats.find((item) => item.id === id)?.messages ?? []
    const hasPartner = history.some(
      (item) => item.channel === 'partner' && item.role === 'assistant',
    )
    if (!hasPartner) void startScene()
  }

  const openCall = () => openDialogue('call')


  const sendDialogue = async (text: string, options?: { interrupted?: boolean }) => {
    const content = text.trim()
    if (!content) return 'failed' as const
    const id = ensureChat()
    const history = chats.find((item) => item.id === id)?.messages ?? []
    const user = appendMessage(id, { role: 'user', content, channel: 'partner' })
    return askPartner(id, [...history, user], user.id, { interrupted: options?.interrupted })
  }

  const restartDialogue = async () => {
    const id = ensureChat()
    dialogueAbort.current?.abort()
    const ac = new AbortController()
    dialogueAbort.current = ac
    const gen = ++dialogueGen.current
    clearPartnerMessages(id)
    setDialogueOpen(true)
    setBusy(true)
    try {
      const reply = await (await loadPartner()).replyAsPartner(language, [], {
        displayName,
        virtualization: scene,
        start: true,
        signal: ac.signal,
      })
      if (gen !== dialogueGen.current || ac.signal.aborted) return 'dropped' as const
      appendMessage(id, { role: 'assistant', content: reply.text, channel: 'partner' })
      return 'ok' as const
    } catch {
      if (gen !== dialogueGen.current || ac.signal.aborted) return 'dropped' as const
      return 'failed' as const
    } finally {
      if (gen === dialogueGen.current) setBusy(false)
    }
  }

  const listen = () => {
    const Speech = (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition
    if (!Speech) return
    const recognition = new Speech()
    recognition.lang = language === 'fr' ? 'fr-FR' : language === 'de' ? 'de-DE' : 'en-GB'
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const said = event.results[0]?.[0]?.transcript
      if (said) composerRef.current?.setText((prev) => `${prev} ${said}`.trim())
    }
    recognition.start()
  }

  return (
    <WordLookupProvider language={language} collection={scene.sphere.trim() || chat?.title || 'Диалог'}>
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!chat || tutorMessages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-start px-3 pb-6 pt-3 sm:justify-center sm:px-4 sm:pb-8 sm:pt-6">
            <div className="rise-in mb-5 sm:mb-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta sm:tracking-[0.22em]">
                {meta.native} · мастерская
              </p>
              <h1 className="font-display mt-2 text-3xl italic leading-tight sm:text-5xl md:text-6xl">
                {meta.greet}, {displayName}.
              </h1>
              <p className="mt-4 max-w-md text-muted">
                Разговор слева, файлы слов — в карточках, пазлах, предложениях и переводах. Сегодня держим{' '}
                {meta.label.toLowerCase()}.
              </p>
            </div>

            <div className="mb-4 rounded-2xl border border-terracotta/30 bg-canvas px-4 py-3 text-sm text-ink">
              <p className="font-medium">С чего начать</p>
              <p className="mt-1 text-muted">
                Напишите репетитору в поле внизу — или откройте «Виртуализацию», выберите место и нажмите «Открыть диалог».
              </p>
            </div>

            <Suspense fallback={null}><VirtualizationPanel
              value={scene}
              onChange={applyScene}
              open={sceneOpen}
              onToggle={() => setSceneOpen((value) => !value)}
              onOpenDialogue={() => openDialogue('chat')}
              onOpenCall={openCall}
              onRestartDialogue={partnerMessages.length > 0 ? () => void restartDialogue() : undefined}
            /></Suspense>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => openDialogue('chat')}
                className="rounded-2xl border border-terracotta/40 bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-terracotta"
              >
                <p className="font-display text-xs text-terracotta">00</p>
                <p className="mt-1 font-semibold">Просто поговорить</p>
                <p className="mt-1 text-sm text-muted">Как с человеком в чате, без урока и правок</p>
              </button>
              {suggestions.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => void send(item.text)}
                  className="rounded-2xl border border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-terracotta/40"
                >
                  <p className="font-display text-xs text-terracotta">{item.note}</p>
                  <p className="mt-1 font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-muted">{item.text}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 overflow-x-hidden px-3 py-4 sm:space-y-5 sm:px-4 sm:py-6">
            {tutorMessages.map((message, index) =>
              message.role === 'assistant' ? (
                <Quotable
                  key={message.id}
                  id={messageAnchor(message.id)}
                  onAttach={() => toggleAttach(message.id)}
                  className="rise-in flex gap-2 sm:gap-3"
                >
                  <Mark className="mt-1 h-8 w-8 shrink-0" />
                  <div className={`min-w-0 flex-1 rounded-2xl border px-3.5 py-3 sm:px-5 sm:py-4 ${
                    attachedIds.includes(message.id) ? 'border-terracotta/50 bg-surface' : 'border-line bg-surface'
                  }`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
                        {extractQuizAnswer(message.content)
                          ? `Задание ${index + 1}`
                          : 'Репетитор'}
                      </p>
                      <MessageAnchor
                        n={index + 1}
                        attached={attachedIds.includes(message.id)}
                        onAttach={() => toggleAttach(message.id)}
                      />
                    </div>
                    {(() => {
                      const parts = gradeBubbleParts(message.content, message.mistakeHint)
                      const pick =
                        !busy && tutorMessages.at(-1)?.id === message.id && extractQuizAnswer(message.content)
                          ? (choice: string) => void send(choice, chatId, [])
                          : undefined
                      const picked =
                        tutorMessages[index + 1]?.role === 'user' ? tutorMessages[index + 1]?.content : undefined
                      return (
                        <>
                          <RichText text={parts.lead} pickedAnswer={picked} pickDisabled={busy} onPickAnswer={pick} />
                          <MistakeHint hint={message.mistakeHint} />
                          {parts.rest ? (
                            <div className="mt-3">
                              <RichText text={parts.rest} pickedAnswer={picked} pickDisabled={busy} onPickAnswer={pick} />
                            </div>
                          ) : null}
                        </>
                      )
                    })()}
                    <Suspense fallback={null}><ChatMatchHint messages={tutorMessages} index={index} /></Suspense>
                    <Suspense fallback={null}><PhraseTranslate text={message.content} language={language} /></Suspense>
                    {message.fileDraft ? (
                      <Suspense fallback={null}>
                        <VocabCardsLabel
                          draft={message.fileDraft}
                          saved={message.fileSaved}
                          fileId={message.fileId}
                          onSave={
                            message.fileSaved || !chatId
                              ? undefined
                              : () => {
                                  const id = saveVocabFromMessage(chatId, message.id)
                                  if (id) {
                                    setStudyToast({
                                      fileId: id,
                                      title: message.fileDraft?.title || 'Словарь',
                                    })
                                  }
                                }
                          }
                        />
                      </Suspense>
                    ) : null}
                    {message.homeworkId ? <Suspense fallback={null}><HomeworkLabel homeworkId={message.homeworkId} /></Suspense> : null}
                  </div>
                </Quotable>
              ) : (
                <Quotable
                  key={message.id}
                  id={messageAnchor(message.id)}
                  onAttach={() => toggleAttach(message.id)}
                  className="rise-in flex items-end justify-end gap-1"
                >
                  <UserMessageActions
                    text={message.content}
                    n={index + 1}
                    attached={attachedIds.includes(message.id)}
                    disabled={busy}
                    onAttach={() => toggleAttach(message.id)}
                    onResend={() => void send(message.content, chatId, [])}
                  />
                  <div className="max-w-[min(85%,22rem)] rounded-2xl rounded-br-md bg-walnut px-3.5 py-2.5 text-[15px] leading-6 text-cream sm:max-w-[80%] sm:px-4 sm:py-3 sm:leading-7">
                    {message.refIds?.length ? (
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        {message.refIds.map((id) => (
                          <a
                            key={id}
                            href={`#${messageAnchor(id)}`}
                            className="inline-flex min-h-8 items-center rounded-full bg-white/10 px-2 font-mono text-[11px] text-cream/70 hover:text-cream"
                          >
                            ↳ #{messageNo(tutorMessages, id)}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {message.refSnippet ? (
                      <p className="mb-1.5 line-clamp-2 min-w-0 break-words border-l-2 border-cream/30 pl-2 text-[12px] leading-4 text-cream/55">
                        {message.refSnippet}
                      </p>
                    ) : null}
                    <LookupText text={message.content} />
                    <Suspense fallback={null}><PhraseTranslate text={message.content} language={language} dark /></Suspense>
                  </div>
                </Quotable>
              ),
            )}
            {busy && !dialogueOpen && (
              <div className="flex items-center gap-3 text-sm text-muted">
                <Mark className="h-8 w-8" />
                Думает…
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 bg-canvas/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm">
        <div className="relative mx-auto max-w-3xl">
          {chat && tutorMessages.length > 0 ? (
            <Suspense fallback={null}><VirtualizationPanel
              value={scene}
              onChange={applyScene}
              open={sceneOpen}
              onToggle={() => setSceneOpen((value) => !value)}
              onOpenDialogue={() => openDialogue('chat')}
              onOpenCall={openCall}
              onRestartDialogue={partnerMessages.length > 0 ? () => void restartDialogue() : undefined}
            /></Suspense>
          ) : null}
          {menuOpen && (
            <div className="absolute bottom-[84px] left-0 z-10 w-64 overflow-hidden rounded-2xl border border-line bg-surface py-2 shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-hover"
                onClick={() => {
                  setMenuOpen(false)
                  setGamesMenuOpen(false)
                  if (!sceneIsOn(scene)) {
                    setSceneOpen(true)
                    return
                  }
                  openDialogue()
                }}
              >
                <MessagesSquare className="h-4 w-4 text-terracotta" /> Открыть диалог
              </button>
              {partnerMessages.length > 0 ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-hover"
                  onClick={() => {
                    setMenuOpen(false)
                    void restartDialogue()
                  }}
                >
                  <RotateCcw className="h-4 w-4 text-terracotta" /> Начать сначала
                </button>
              ) : null}
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-hover"
                onClick={() => void send('Проверь меня')}
              >
                <Bookmark className="h-4 w-4 text-terracotta" /> Пять минут у доски
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-hover"
                onClick={() => {
                  setMenuOpen(false)
                  setGamesMenuOpen(false)
                  navigate('/analytics')
                }}
              >
                Открыть аналитику
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-hover"
                onClick={() => {
                  setMenuOpen(false)
                  setGamesMenuOpen(false)
                  navigate('/homework')
                }}
              >
                Домашняя работа
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-hover"
                onClick={() => {
                  setMenuOpen(false)
                  setGamesMenuOpen(false)
                  navigate('/words')
                }}
              >
                Открыть слова
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-hover"
                onClick={() => setGamesMenuOpen((value) => !value)}
              >
                <Gamepad2 className="h-4 w-4 text-terracotta" /> Игры
              </button>
              {gamesMenuOpen
                ? GAME_LINKS.map(({ to, label, icon: Icon }) => (
                    <button
                      key={to}
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2 pl-11 text-left text-sm text-muted hover:bg-hover hover:text-ink"
                      onClick={() => {
                        setMenuOpen(false)
                        setGamesMenuOpen(false)
                        navigate(to)
                      }}
                    >
                      <Icon className="h-4 w-4 text-terracotta" /> {label}
                    </button>
                  ))
                : null}
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault()
            }}
            className="rounded-2xl border border-line bg-surface px-2 py-2 shadow-[0_10px_30px_rgb(42_33_24/0.06)]"
          >
            {attachedIds.length ? (
              <div className="mb-1.5 flex flex-wrap gap-1.5 px-1 pt-0.5">
                {attachedIds.map((id) => {
                  const messages = chat?.messages ?? []
                  const target = messages.find((item) => item.id === id)
                  if (!target) return null
                  const n = messageNo(messages, id)
                  return (
                    <span
                      key={id}
                      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-canvas py-1 pl-2 pr-1 text-[12px]"
                    >
                      <a href={`#${messageAnchor(id)}`} className="shrink-0 font-mono text-terracotta">
                        ↳ #{n}
                      </a>
                      <span className="min-w-0 truncate text-muted">{previewMessage(target.content, 28)}</span>
                      <button
                        type="button"
                        onClick={() => toggleAttach(id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-hover"
                        aria-label="Убрать"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                })}
              </div>
            ) : null}
                        <div className="flex items-end gap-2">
              <ChatComposer
                ref={composerRef}
                placeholder={attachedIds.length
                  ? 'Спросите про прикреплённое…'
                  : tutorMessages.at(-1)?.role === 'assistant' && isWriteQuizHint(tutorMessages.at(-1)?.content ?? '')
                    ? 'Напишите перевод или форму…'
                    : `Напишите на ${meta.native.toLowerCase()} или по-русски…`}
                hasAttachments={attachedIds.length > 0}
                busy={busy}
                onSend={(text) => void send(text)}
                onToggleMenu={() => {
                  setGamesMenuOpen(false)
                  setMenuOpen((open) => !open)
                }}
                onOpenDialogue={openDialogue}
                onListen={listen}
              />
            </div>
          </form>
          <p className={`mt-2 text-center text-[11px] ${sendError ? 'text-terracotta' : 'text-muted'}`}>
            {sendError
              ? sendError
              : sceneIsOn(scene)
                ? `Сцена «${scene.sphere.trim() || 'ситуация'}» — в кнопке «Диалог». Здесь только репетитор.`
                : 'Диалог — просто чат с человеком. Репетитор остаётся в этом окне.'}
          </p>
        </div>
      </div>
      
      {studyToast ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex w-[min(28rem,calc(100%-1.5rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-[0_12px_40px_rgb(42_33_24/0.2)]">
          <p className="min-w-0 truncate text-sm">«{studyToast.title}» на полке</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const id = studyToast.fileId
                setStudyToast(null)
                navigate(`/cards/${id}`)
              }}
              className="rounded-full bg-terracotta px-3 py-1.5 text-sm font-medium text-white"
            >
              Учить карточки
            </button>
            <button
              type="button"
              onClick={() => setStudyToast(null)}
              className="rounded-full px-2 py-1.5 text-sm text-muted hover:bg-hover"
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}

      <Suspense fallback={null}>
      <DialogueWindow
        open={dialogueOpen}
        language={language}
        who={who}
        scene={scene}
        messages={partnerMessages}
        busy={busy}
        mode={dialogueMode}
        onModeChange={setDialogueMode}
        onClose={() => {
          dialogueAbort.current?.abort()
          setDialogueOpen(false)
        }}
        onSend={sendDialogue}
        onStart={startScene}
        onRestart={restartDialogue}
      />
      </Suspense>
    </div>
    </WordLookupProvider>
  )
}

type SpeechRecognition = {
  lang: string
  start: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
}

type SpeechRecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}
