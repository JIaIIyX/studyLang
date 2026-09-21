import { ArrowUp, Mic, MicOff, Phone, PhoneOff, Play, RotateCcw, Square, X, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { languageMeta } from '../../lib/languages'
import { canListen, createContinuousListener, isWeakUtterance, listenLocales } from '../../lib/listen'
import { getVoiceVolume, isSpeaking, looksLikeEcho, setVoiceVolume as applySpeakVolume, speak, stopSpeaking } from '../../lib/speech'
import { splitPartnerLine } from '../../lib/partnerLine'
import { MODEL_TIMEOUT_HINT } from '../../lib/llm'
import { sceneIsOn, type PartnerPersona } from '../../lib/virtualization'
import type { ChatMessage, Language, Virtualization } from '../../types'
import { LookupText } from '../WordLookup'
import { PhraseTranslate } from './PhraseTranslate'
import { useApp } from '../../state/AppProvider'

type Props = {
  open: boolean
  language: Language
  who: PartnerPersona
  scene: Virtualization
  messages: ChatMessage[]
  busy: boolean
  mode?: 'chat' | 'call'
  onModeChange?: (mode: 'chat' | 'call') => void
  onClose: () => void
  onSend: (text: string, options?: { interrupted?: boolean }) => Promise<'ok' | 'dropped' | 'failed'>
  onStart: () => Promise<'ok' | 'dropped' | 'failed'>
  onRestart: () => Promise<'ok' | 'dropped' | 'failed'>
}

export function DialogueWindow({
  open,
  language,
  who,
  scene,
  messages,
  busy,
  mode = 'chat',
  onModeChange,
  onClose,
  onSend,
  onStart,
  onRestart,
}: Props) {
  const meta = languageMeta(language)
  const { voiceVolume, setVoiceVolume } = useApp()
  useEffect(() => {
    applySpeakVolume(voiceVolume)
  }, [voiceVolume])
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [live, setLive] = useState('')
  const [heard, setHeard] = useState('')
  const [micHint, setMicHint] = useState('')
  const [sendError, setSendError] = useState('')
  const [talking, setTalking] = useState(false)
  const talkingRef = useRef(false)
  talkingRef.current = talking
  const end = useRef<HTMLDivElement>(null)
  const spokenId = useRef('')
  const pending = useRef('')
  const interrupted = useRef(false)
  const sendTimer = useRef(0)
  const sending = useRef(false)
  const listenRef = useRef<ReturnType<typeof createContinuousListener> | null>(null)
  const onSendRef = useRef(onSend)
  const busyRef = useRef(busy)
  const callBooted = useRef(false)
  const wantMic = useRef(false)
  onSendRef.current = onSend
  busyRef.current = busy

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy, open, live])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      listenRef.current?.stop()
      listenRef.current = null
      window.clearTimeout(sendTimer.current)
      stopSpeaking()
      setListening(false)
      setTalking(false)
      setLive('')
      setHeard('')
      setMicHint('')
      pending.current = ''
      interrupted.current = false
      callBooted.current = false
      wantMic.current = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const last = messages.at(-1)
    if (!last || last.role !== 'assistant' || last.id === spokenId.current) return
    spokenId.current = last.id
    speak(splitPartnerLine(last.content).speech || last.content, language, {
      onstart: () => {
        setTalking(true)
        talkingRef.current = true
        listenRef.current?.setPartnerTalking(true)
      },
      onend: () => {
        setTalking(false)
        listenRef.current?.setPartnerTalking(false)
      },
    })
  }, [messages, open, language, mode])

  useEffect(() => {
    if (messages.length === 0) spokenId.current = ''
  }, [messages.length])

  useEffect(
    () => () => {
      listenRef.current?.stop()
      window.clearTimeout(sendTimer.current)
      stopSpeaking()
    },
    [],
  )

  const flushVoice = () => {
    const text = pending.current.trim()
    pending.current = ''
    setLive('')
    setHeard('')
    if (!text || isWeakUtterance(text) || looksLikeEcho(text) || busyRef.current) {
      interrupted.current = false
      return
    }
    const wasInterrupted = interrupted.current
    interrupted.current = false
    void onSendRef.current(text, { interrupted: wasInterrupted }).then((result) => {
      if (result === 'failed') {
        setDraft((prev) => prev || text)
        setSendError(MODEL_TIMEOUT_HINT)
      }
    })
  }

  const cutPartner = () => {
    stopSpeaking()
    setTalking(false)
    talkingRef.current = false
    interrupted.current = true
    listenRef.current?.setPartnerTalking(false)
  }

  const restartScene = () => {
    cutPartner()
    spokenId.current = ''
    window.clearTimeout(sendTimer.current)
    pending.current = ''
    interrupted.current = false
    sending.current = false
    setDraft('')
    setLive('')
    setHeard('')
    setSendError('')
    void onRestart().then((result) => {
      if (result === 'failed') setSendError(MODEL_TIMEOUT_HINT)
    })
  }

  const noteInterrupt = (heardText: string) => {
    if (!isSpeaking() && !talkingRef.current) return
    if (looksLikeEcho(heardText)) return
    cutPartner()
  }

  const sendTyped = (text: string) => {
    const value = text.trim()
    if (!value || sending.current || busy) return
    const wasTalking = isSpeaking()
    if (wasTalking) {
      stopSpeaking()
      setTalking(false)
    }
    window.clearTimeout(sendTimer.current)
    pending.current = ''
    interrupted.current = false
    setLive('')
    setHeard('')
    setDraft('')
    setSendError('')
    sending.current = true
    void onSend(value, { interrupted: wasTalking })
      .then((result) => {
        if (result === 'failed') {
          setDraft((prev) => prev || value)
          setSendError(MODEL_TIMEOUT_HINT)
        }
      })
      .finally(() => {
        sending.current = false
      })
  }

  const toggleListen = () => {
    if (listening) {
      listenRef.current?.stop()
      listenRef.current = null
      window.clearTimeout(sendTimer.current)
      setListening(false)
      setLive('')
      if (pending.current.trim()) flushVoice()
      return
    }
    if (!canListen()) {
      setMicHint('Голос доступен в Chrome или Edge.')
      return
    }
    setMicHint('')
    const session = createContinuousListener({
      langs: listenLocales(language),
      onBargeIn: () => cutPartner(),
      onHeard: (text) => noteInterrupt(text),
      onInterim: (text) => {
        if (!text.trim()) {
          setLive('')
          return
        }
        noteInterrupt(text)
        if ((isSpeaking() || talkingRef.current) && looksLikeEcho(text)) return
        setLive(text)
        if (pending.current) {
          window.clearTimeout(sendTimer.current)
          sendTimer.current = window.setTimeout(flushVoice, 900)
        }
      },
      onFinal: (text) => {
        if (isWeakUtterance(text)) return
        if ((isSpeaking() || talkingRef.current) && looksLikeEcho(text)) return
        noteInterrupt(text)
        pending.current = `${pending.current} ${text}`.trim()
        if (isWeakUtterance(pending.current)) return
        setHeard(pending.current)
        setLive('')
        window.clearTimeout(sendTimer.current)
        sendTimer.current = window.setTimeout(flushVoice, 900)
      },
      onBlocked: () => {
        setListening(false)
        setLive('')
        setMicHint('Нет доступа к микрофону — разрешите его в браузере.')
      },
      onError: (reason) => setMicHint(reason),
    })
    if (!session.start()) {
      setMicHint('Не получилось включить микрофон.')
      return
    }
    listenRef.current = session
    setListening(true)
  }



  useEffect(() => {
    if (!open || mode !== 'call') return
    if (getVoiceVolume() <= 0) {
      setVoiceVolume(0.85)
    }
    // In call mode always voice the latest partner line (chat may have already "spoken" it silently at volume 0).
    const last = messages.at(-1)
    if (!last || last.role !== 'assistant') return
    spokenId.current = last.id
    speak(splitPartnerLine(last.content).speech || last.content, language, {
      onstart: () => {
        setTalking(true)
        talkingRef.current = true
        listenRef.current?.setPartnerTalking(true)
      },
      onend: () => {
        setTalking(false)
        listenRef.current?.setPartnerTalking(false)
      },
    })
  }, [open, mode, setVoiceVolume, language])

  useEffect(() => {
    if (!open || mode !== 'call') return
    wantMic.current = true
    if (messages.length === 0 && !busy && !callBooted.current) {
      callBooted.current = true
      setSendError('')
      void onStart().then((result) => {
        if (result === 'failed') {
          callBooted.current = false
          setSendError(MODEL_TIMEOUT_HINT)
        }
      })
    }
  }, [open, mode, messages.length, busy, onStart])

  useEffect(() => {
    if (!open || mode !== 'call') return
    if (!wantMic.current) return
    if (busy || talking || listening) return
    const timer = window.setTimeout(() => {
      if (!wantMic.current || busyRef.current || talkingRef.current) return
      if (listening || listenRef.current) return
      wantMic.current = true
      toggleListen()
    }, 450)
    return () => window.clearTimeout(timer)
  }, [open, mode, busy, talking, listening, messages.length])

  if (!open) return null

  const place = sceneIsOn(scene)
    ? [scene.sphere.trim(), scene.backstory.trim()].filter(Boolean).join(' · ')
    : ''
  const lastAssistant = [...messages].reverse().find((item) => item.role === 'assistant')
  const initial = who.name.slice(0, 1).toUpperCase()

  const lastSpeech = lastAssistant
    ? splitPartnerLine(lastAssistant.content).speech || lastAssistant.content
    : ''
  const callStatus = talking
    ? 'говорит…'
    : busy
      ? 'на линии…'
      : listening
        ? 'слушает вас'
        : live || heard
          ? 'вас слышно'
          : messages.length === 0
            ? 'соединяем…'
            : 'на линии'

  if (mode === 'call') {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-3 sm:items-center">
        <button type="button" className="absolute inset-0" aria-label="Сбросить" onClick={onClose} />
        <section className="night-panel relative flex h-[min(720px,92dvh)] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-zinc-900 to-black text-white shadow-[0_24px_80px_rgb(0_0_0/0.55)]">
          <header className="flex items-center justify-between px-4 pt-4">
            <button
              type="button"
              onClick={() => onModeChange?.('chat')}
              className="rounded-full bg-white/10 px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/15"
            >
              Чат
            </button>
            <p className="text-[12px] uppercase tracking-[0.18em] text-white/45">Звонок</p>
            {messages.length > 0 ? (
              <button
                type="button"
                onClick={restartScene}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Начать сначала"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="inline-block w-8" />
            )}
          </header>

          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
            <div className="relative">
              {talking || busy ? (
                <span
                  className={
                    'absolute inset-[-12px] rounded-full border border-white/25 ' +
                    (talking ? 'animate-ping' : 'animate-pulse')
                  }
                />
              ) : null}
              <div
                className={
                  'relative flex h-28 w-28 items-center justify-center rounded-full text-4xl font-semibold shadow-lg ' +
                  (talking
                    ? 'ring-4 ring-terracotta/70'
                    : listening
                      ? 'ring-2 ring-emerald-400/50'
                      : 'ring-1 ring-white/15')
                }
                style={{ background: `${meta.swatch}55` }}
              >
                {initial}
              </div>
            </div>
            <div>
              <p className="text-2xl font-medium">{who.name}</p>
              <p className="mt-1 text-sm text-white/50">{place || who.label || 'виртуальный собеседник'}</p>
              <p
                className={
                  'mt-3 text-sm ' +
                  (talking ? 'text-terracotta' : listening ? 'text-emerald-300' : 'text-white/60')
                }
              >
                {callStatus}
              </p>
            </div>
            {lastSpeech ? (
              <p className="line-clamp-3 max-w-sm text-[15px] leading-6 text-white/75">{lastSpeech}</p>
            ) : (
              <p className="text-[13px] text-white/40">Говорите как с человеком — микрофон уже слушает.</p>
            )}
            {live || heard ? (
              <p className="max-w-sm rounded-2xl bg-terracotta/25 px-4 py-2 text-[14px] text-white/85">
                {`${heard} ${live}`.trim()}
              </p>
            ) : null}
            {sendError ? <p className="text-[12px] text-terracotta">{sendError}</p> : null}
            {micHint ? <p className="text-[12px] text-terracotta">{micHint}</p> : null}
          </div>

          <div className="flex flex-col items-center gap-4 px-6 pb-8 pt-2">

            <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2">
              <button
                type="button"
                onClick={() => setVoiceVolume(voiceVolume > 0 ? 0 : 0.85)}
                className="text-white/80 hover:text-white"
                aria-label={voiceVolume > 0 ? 'Выключить голос' : 'Включить голос'}
              >
                {voiceVolume > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(voiceVolume * 100)}
                onChange={(event) => setVoiceVolume(Number(event.target.value) / 100)}
                className="h-1.5 w-24 cursor-pointer accent-terracotta"
                aria-label="Громкость голоса"
              />
            </div>
            <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => {
                if (listening) wantMic.current = false
                else wantMic.current = true
                toggleListen()
              }}
              className={
                'flex h-14 w-14 items-center justify-center rounded-full ' +
                (listening ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white hover:bg-white/15')
              }
              aria-label={listening ? 'Выключить микрофон' : 'Включить микрофон'}
            >
              {listening ? <Mic className="h-6 w-6 animate-pulse" /> : <MicOff className="h-6 w-6" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-400"
              aria-label="Сбросить звонок"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            {talking ? (
              <button
                type="button"
                onClick={cutPartner}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/15"
                aria-label="Перебить"
              >
                <Square className="h-5 w-5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onModeChange?.('chat')}
                className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-white/10 text-[11px] font-medium text-white hover:bg-white/15"
                aria-label="Открыть чат"
              >
                Чат
              </button>
            )}
            </div>
          </div>
        </section>
      </div>
    )
  }


  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 p-3 sm:items-center">
                <button
            type="button"
            onClick={() => onModeChange?.('call')}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-2.5 text-[12px] text-white hover:bg-white/15"
            aria-label="Режим звонка"
          >
            <Phone className="h-3.5 w-3.5" />
            Звонок
          </button>
<button type="button" className="absolute inset-0" aria-label="Закрыть" onClick={onClose} />
      <section className="night-panel relative flex h-[min(720px,92dvh)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-black text-white shadow-[0_24px_80px_rgb(0_0_0/0.55)]">
        <header className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
          <div
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold"
            style={{ background: `${meta.swatch}33` }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{who.name}</p>
            <p className="truncate text-[12px] text-white/45" title={place || undefined}>
              {talking
                ? who.name
                : listening
                  ? 'слушает'
                  : busy
                    ? 'печатает…'
                    : who.label || place || 'в сети'}
            </p>
          </div>
          {talking ? (
            <button
              type="button"
              onClick={cutPartner}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-2.5 text-[12px] text-white hover:bg-white/15"
              aria-label="Перебить"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : null}
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={restartScene}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[12px] text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Начать сначала"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Начать сначала
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white hover:bg-white/10"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !busy ? (
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 px-4 text-center">
              <p className="text-[13px] text-white/45">
                {place ? `Сцена: ${place}` : 'Нажмите старт — собеседник сам начнёт из настроек.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSendError('')
                  void onStart().then((result) => {
                    if (result === 'failed') setSendError(MODEL_TIMEOUT_HINT)
                  })
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-terracotta px-5 py-2.5 text-[15px] font-medium text-white hover:bg-terracotta/90"
              >
                <Play className="h-4 w-4 fill-current" />
                Старт
              </button>
            </div>
          ) : null}
          {messages.map((item) => {
            const speakingNow = talking && item.id === lastAssistant?.id
            const mine = item.role === 'user'
            const { speech, action } = splitPartnerLine(item.content)
            const line = speech || (action ? '' : item.content)
            return (
              <article
                key={item.id}
                onPointerDown={(event) => {
                  if (!speakingNow) return
                  const node = event.target as HTMLElement | null
                  if (node?.closest('[data-lookup-word], [data-word-tip], [data-phrase-translate]')) return
                  cutPartner()
                }}
                className={mine ? 'ml-10' : 'mr-10'}
              >
                {line ? (
                  <div
                    className={
                      mine
                        ? 'rounded-2xl rounded-br-md bg-terracotta px-3.5 py-2.5 text-[15px] leading-6 text-white'
                        : `rounded-2xl rounded-bl-md bg-white/8 px-3.5 py-2.5 text-[15px] leading-6 text-white ${
                            speakingNow ? 'cursor-pointer' : ''
                          }`
                    }
                  >
                    <LookupText text={line} />
                    <PhraseTranslate text={line} language={language} dark />
                  </div>
                ) : null}
                {action ? (
                  <p className={`mt-1 px-1 text-[11px] italic leading-4 ${mine ? 'text-right text-white/40' : 'text-white/35'}`}>
                    {action}
                  </p>
                ) : null}
              </article>
            )
          })}
          {busy ? (
            <p className="mr-10 px-1 text-[13px] text-white/40">{who.name} печатает…</p>
          ) : null}
          {live || heard ? (
            <p className="ml-10 rounded-2xl rounded-br-md bg-terracotta/70 px-3.5 py-2.5 text-[15px] text-white/80">
              {`${heard} ${live}`.trim()}
            </p>
          ) : null}
          <div ref={end} />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            sendTyped(draft)
          }}
          className="border-t border-white/10 bg-black px-3 py-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendTyped(draft)
                }
              }}
              rows={1}
              placeholder={`Сообщение для ${who.name}…`}
              className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl bg-white/8 px-3 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35"
            />
            <button
              type="button"
              onClick={toggleListen}
              className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                listening ? 'bg-terracotta text-white' : 'hover:bg-white/10'
              }`}
              aria-label={listening ? 'Выключить микрофон' : 'Включить микрофон'}
            >
              <Mic className={`h-5 w-5 ${listening ? 'animate-pulse' : ''}`} />
            </button>
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-terracotta text-white disabled:opacity-30"
              aria-label="Отправить"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
          {sendError ? <p className="mt-2 text-center text-[11px] text-terracotta">{sendError}</p> : null}
          {micHint ? <p className="mt-2 text-center text-[11px] text-terracotta">{micHint}</p> : null}
        </form>
      </section>
    </div>
  )
}
