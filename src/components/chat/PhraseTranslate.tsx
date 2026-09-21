import { Languages } from 'lucide-react'
import { useRef, useState, type MouseEvent } from 'react'
import { stripPracticeTags } from '../../lib/practiceTags'
import { hasForeignLetters, translatePhrase } from '../../lib/wordLookup'
import type { Language } from '../../types'

export function PhraseTranslate({
  text,
  language,
  dark = false,
}: {
  text: string
  language: Language
  dark?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [translation, setTranslation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)

  const phrase = stripPracticeTags(text)
  if (!hasForeignLetters(phrase)) return null

  const toggle = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (open) {
      setOpen(false)
      return
    }
    if (translation) {
      setOpen(true)
      return
    }
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setBusy(true)
    setError('')
    void translatePhrase(language, phrase, ac.signal)
      .then((next) => {
        if (ac.signal.aborted) return
        if (!next) {
          setError('Нет перевода.')
          setOpen(true)
          setBusy(false)
          return
        }
        setTranslation(next)
        setOpen(true)
        setBusy(false)
      })
      .catch(() => {
        if (ac.signal.aborted) return
        setError('Не получилось перевести.')
        setOpen(true)
        setBusy(false)
      })
  }

  return (
    <div className="mt-2" data-phrase-translate>
      <button
        type="button"
        onClick={toggle}
        title={open ? 'Скрыть перевод' : 'Перевести фразу'}
        aria-label={open ? 'Скрыть перевод' : 'Перевести фразу'}
        className={
          dark
            ? `inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                open || busy ? 'bg-terracotta text-white' : 'text-white/55 hover:bg-white/10 hover:text-white'
              }`
            : `inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                open || busy ? 'bg-terracotta text-white' : 'text-muted hover:bg-line hover:text-ink'
              }`
        }
      >
        <Languages className={`h-3.5 w-3.5 ${busy ? 'animate-pulse' : ''}`} />
      </button>
      {open && (translation || error) ? (
        <p className={`mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-5 ${dark ? 'text-white/60' : 'text-muted'}`}>
          {busy ? 'Перевод…' : translation || error}
        </p>
      ) : busy ? (
        <p className={`mt-1.5 text-[13px] ${dark ? 'text-white/45' : 'text-muted'}`}>Перевод…</p>
      ) : null}
    </div>
  )
}
