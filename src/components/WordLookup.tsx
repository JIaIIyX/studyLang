import { Bookmark, Check, EyeOff } from 'lucide-react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { subscribe } from '../lib/persist'
import { forgetTutorLibrary } from '../lib/tutor'
import { addWordToDialogueCollection, collectionHasTerm, dialogueCollectionTitle } from '../lib/tutorFile'
import { fold } from '../lib/normalize'
import { addIgnoreWords, ignoreWords } from '../lib/wordIgnore'
import {
  familiarKeys,
  isLookupToken,
  learnedKeys,
  lookupWord,
  wordMark,
  type WordMark,
  type WordSense,
} from '../lib/wordLookup'
import type { Language } from '../types'

type Tip = {
  word: string
  el: HTMLElement
}

type Anchor = {
  x: number
  y: number
  height: number
}

type LookupContextValue = {
  language: Language
  open: (word: string, el: HTMLElement) => void
  mark: (word: string) => WordMark
}

const LookupContext = createContext<LookupContextValue | null>(null)
const VISIBLE_VARIANTS = 3

function useWordLookup() {
  return useContext(LookupContext)
}

function readAnchor(el: HTMLElement): Anchor {
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top, height: rect.height }
}

function shownVariants(variants: string[], picked: string, expanded: boolean) {
  if (expanded || variants.length <= VISIBLE_VARIANTS) return variants
  const head = variants.slice(0, VISIBLE_VARIANTS)
  if (picked && !head.includes(picked)) head[VISIBLE_VARIANTS - 1] = picked
  return head
}

export function WordLookupProvider({
  language,
  collection,
  children,
}: {
  language: Language
  collection?: string
  children: ReactNode
}) {
  const collectionTitle = dialogueCollectionTitle(collection)
  const [tip, setTip] = useState<Tip | null>(null)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [sense, setSense] = useState<WordSense | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [learned, setLearned] = useState(() => learnedKeys(language))
  const [familiar, setFamiliar] = useState(() => familiarKeys(language))
  const [ignored, setIgnored] = useState(false)
  const [picked, setPicked] = useState('')
  const [expanded, setExpanded] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    const refresh = () => {
      setLearned(learnedKeys(language))
      setFamiliar(familiarKeys(language))
    }
    refresh()
    const stop = subscribe(refresh)
    return () => {
      stop()
    }
  }, [language])

  const open = (word: string, el: HTMLElement) => {
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setTip({ word, el })
    setAnchor(readAnchor(el))
    setSense(null)
    setSaved(false)
    setIgnored(false)
    setPicked('')
    setExpanded(false)
    setBusy(true)
    void lookupWord(language, word, ac.signal)
      .then((next) => {
        if (ac.signal.aborted) return
        setSense(next)
        setPicked(next.translation)
        setSaved(collectionHasTerm(language, collectionTitle, next.article ? `${next.article} ${next.word}` : next.word))
        setIgnored(ignoreWords(language).some((item) => fold(item) === fold(next.word)))
        setBusy(false)
      })
      .catch(() => {
        if (ac.signal.aborted) return
        setBusy(false)
        setSense({ word, translation: 'Не получилось перевести.' })
      })
  }

  useLayoutEffect(() => {
    if (!tip) {
      setAnchor(null)
      return
    }
    const update = () => {
      if (!tip.el.isConnected) {
        setTip(null)
        return
      }
      setAnchor(readAnchor(tip.el))
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
    }
  }, [tip])

  useEffect(() => {
    if (!tip) return
    const close = (event: Event) => {
      const node = event.target as HTMLElement | null
      if (node?.closest('[data-word-tip], [data-lookup-word]')) return
      setTip(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTip(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [tip])

  useEffect(
    () => () => {
      abort.current?.abort()
    },
    [],
  )

  const place = anchor ?? { x: 0, y: 0, height: 0 }
  const above = place.y > 96
  const left = Math.min(Math.max(place.x, 88), typeof window === 'undefined' ? 88 : window.innerWidth - 88)
  const variants = sense?.variants ?? []
  const visible = shownVariants(variants, picked, expanded)
  const hiddenCount = Math.max(0, variants.length - visible.length)

  return (
    <LookupContext.Provider
      value={{
        language,
        open,
        mark: (word) => wordMark(language, word, learned, familiar),
      }}
    >
      {children}
      {tip && anchor
        ? createPortal(
            <div
              data-word-tip
              className="night-panel pointer-events-auto fixed z-[80] w-max max-w-[min(28rem,calc(100vw-1.5rem))] rounded-2xl border border-white/15 bg-black px-3 py-2.5 text-left text-white shadow-[0_16px_40px_rgb(0_0_0/0.55)]"
              style={{
                left,
                top: above ? place.y - 8 : place.y + place.height + 8,
                transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">
                {sense?.article ? `${sense.article} ` : ''}
                {sense?.word || tip.word}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-6 text-white">
                {busy ? 'Перевод…' : picked || sense?.translation}
              </p>
              {sense?.note ? <p className="mt-0.5 text-[12px] text-white/55">{sense.note}</p> : null}
              {!busy && variants.length > 1 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {visible.map((item) => {
                    const active = item === picked
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPicked(item)}
                        className={
                          active
                            ? 'rounded-full bg-terracotta px-2 py-0.5 text-[12px] text-white'
                            : 'rounded-full bg-white/10 px-2 py-0.5 text-[12px] text-white/80 hover:bg-white/16'
                        }
                      >
                        {item}
                      </button>
                    )
                  })}
                  {hiddenCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(true)}
                      title={`Ещё ${hiddenCount}`}
                      className="rounded-full bg-white/10 px-2 py-0.5 text-[12px] tracking-[0.2em] text-white/80 hover:bg-white/16"
                    >
                      …
                    </button>
                  ) : null}
                  {expanded && variants.length > VISIBLE_VARIANTS ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(false)}
                      className="rounded-full bg-white/10 px-2 py-0.5 text-[12px] text-white/70 hover:bg-white/16"
                    >
                      скрыть
                    </button>
                  ) : null}
                </div>
              ) : null}
              {sense && /[а-яё]/i.test(picked || sense.translation) && !/не получилось|нет русского перевода/i.test(picked || sense.translation) ? (
                saved ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[12px] text-white/70">
                    <Check className="h-3.5 w-3.5" />
                    В словаре «{collectionTitle}»
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const term = sense.article ? `${sense.article} ${sense.word}` : sense.word
                      addWordToDialogueCollection(language, collectionTitle, {
                        term,
                        translation: picked || sense.translation,
                        pos: sense.note,
                      })
                      forgetTutorLibrary(language)
                      setLearned(learnedKeys(language))
                      setFamiliar(familiarKeys(language))
                      setSaved(true)
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-terracotta px-2.5 py-1 text-[12px] font-medium text-white hover:bg-terracotta/90"
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                    В словарь «{collectionTitle}»
                  </button>
                )
              ) : null}
              {ignored ? (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-white/70">
                  <EyeOff className="h-3.5 w-3.5" />
                  В игноре — не подсвечивается
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    addIgnoreWords(language, sense?.word || tip.word)
                    setLearned(learnedKeys(language))
                    setFamiliar(familiarKeys(language))
                    setIgnored(true)
                  }}
                  className="mt-2 ml-1 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-white/16"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Не подсвечивать
                </button>
              )}
              <span
                className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-white/15 bg-black ${
                  above ? 'bottom-[-5px] border-b border-r' : 'top-[-5px] border-l border-t'
                }`}
              />
            </div>,
            document.body,
          )
        : null}
    </LookupContext.Provider>
  )
}

export function LookupText({ text }: { text: string }) {
  const ctx = useWordLookup()
  if (!ctx) return text

  return text.split(/([^\p{L}]+)/u).map((part, index) => {
    if (!isLookupToken(part)) {
      return <span key={`${part}-${index}`}>{part}</span>
    }
    const mark = ctx.mark(part)
    const look =
      mark === 'new'
        ? 'underline decoration-solid decoration-current/45 underline-offset-4'
        : mark === 'learned'
          ? 'underline decoration-dotted decoration-current/35 underline-offset-4'
          : ''
    return (
      <button
        key={`${part}-${index}`}
        type="button"
        data-lookup-word
        title={mark === 'new' ? 'Новое слово' : mark === 'learned' ? 'Выучено' : undefined}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          ctx.open(part, event.currentTarget)
        }}
        className={`cursor-pointer rounded-sm hover:text-terracotta ${look}`}
      >
        {part}
      </button>
    )
  })
}
