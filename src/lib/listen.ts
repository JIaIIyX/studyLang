import type { Language } from '../types'
import { looksLikeEcho, speechLocale } from './speech'

type RecCtor = new () => ContinuousRecognition

type ContinuousRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: ContinuousResultEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
}

type ContinuousResultEvent = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string; confidence?: number }>>
}

const FILLERS = new Set([
  'ah',
  'oh',
  'uh',
  'um',
  'hmm',
  'hm',
  'mm',
  'mmm',
  'mhm',
  'äh',
  'ähm',
  'euh',
  'ehm',
  'huh',
  'ha',
  'eh',
  'er',
  'a',
  'e',
  'o',
])

function lettersOf(text: string) {
  return (text.match(/\p{L}+/gu) ?? []).join('')
}

const SHORT_OK = new Set(['oui', 'non', 'ja', 'nein', 'yes', 'no', 'ok', 'si', 'да', 'нет', 'ага', 'стоп', 'ладно'])
const CUT_IN = new Set([...SHORT_OK, 'stop', 'halt', 'warte', 'хватит', 'подожди', 'wait'])

export function isInterruptCue(text: string) {
  return CUT_IN.has(lettersOf(text).toLowerCase())
}

function hasCyrillic(text: string) {
  return /[а-яё]/i.test(text)
}

export function isWeakUtterance(text: string, confidence = 1) {
  const clean = text.trim()
  const letters = lettersOf(clean)
  const key = letters.toLowerCase()
  if (!letters) return true
  if (/^(.)\1+$/u.test(letters)) return true
  if (FILLERS.has(key)) return true
  if (SHORT_OK.has(key)) return false
  if (letters.length < 3) return true
  if (hasCyrillic(clean)) return false
  if (confidence > 0 && confidence < 0.32 && letters.length < 5) return true
  return false
}

function recognitionCtor(): RecCtor | null {
  const host = window as unknown as {
    SpeechRecognition?: RecCtor
    webkitSpeechRecognition?: RecCtor
  }
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null
}

export function canListen() {
  return Boolean(recognitionCtor())
}

export function listenLocale(language: Language) {
  return speechLocale(language)
}

export function listenLocales(language: Language) {
  const practice = listenLocale(language)
  return practice === 'ru-RU' ? [practice] : [practice, 'ru-RU']
}

export function createContinuousListener(options: {
  lang?: string
  langs?: string[]
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onHeard?: (text: string) => void
  onBargeIn?: () => void
  onBlocked?: () => void
  onError?: (reason: string) => void
}) {
  const Ctor = recognitionCtor()
  const langs = [...new Set((options.langs?.length ? options.langs : [options.lang ?? 'en-GB']).filter(Boolean))]
  let live = false
  let rec: ContinuousRecognition | null = null
  let langIndex = 0
  let acceptedPass = false
  let heardPass = false
  let lastInterim = ''
  let lastCommitted = ''
  let commitTimer = 0
  let partnerTalking = false

  const emitError = (reason: string) => {
    options.onError?.(reason)
  }

  const accept = (text: string, confidence?: number) => {
    if (isInterruptCue(text)) return true
    if (isWeakUtterance(text, confidence ?? 1)) return false
    if (looksLikeEcho(text)) return false
    if (partnerTalking) {
      const words = text.trim().split(/\s+/).filter((item) => lettersOf(item).length > 1)
      if (words.length < 2 && lettersOf(text).length < 8) return false
    }
    return true
  }

  const lockLang = (text: string) => {
    const russian = langs.indexOf('ru-RU')
    const practice = langs.findIndex((item) => item !== 'ru-RU')
    langIndex = hasCyrillic(text) && russian >= 0 ? russian : Math.max(0, practice)
  }

  const clearCommit = () => {
    window.clearTimeout(commitTimer)
    commitTimer = 0
  }

  const commit = (text: string, confidence?: number) => {
    const value = text.trim()
    if (!accept(value, confidence)) return
    if (value.toLowerCase() === lastCommitted.toLowerCase()) return
    acceptedPass = true
    lastCommitted = value
    lockLang(value)
    lastInterim = ''
    clearCommit()
    options.onInterim('')
    options.onFinal(value)
  }

  const scheduleCommit = (text: string, confidence?: number) => {
    lastInterim = text
    clearCommit()
    commitTimer = window.setTimeout(() => {
      if (!live) return
      commit(lastInterim, confidence)
    }, 900)
  }

  const restart = () => {
    if (!live) return
    if (!acceptedPass && heardPass && langs.length > 1) {
      langIndex = (langIndex + 1) % langs.length
    }
    acceptedPass = false
    heardPass = false
    lastCommitted = ''
    window.setTimeout(() => {
      if (!live) return
      attach(langs[langIndex] ?? langs[0])
      try {
        rec?.start()
      } catch {
        live = false
        options.onBlocked?.()
        emitError('Не получилось включить микрофон.')
      }
    }, 180)
  }

  const attach = (lang: string) => {
    if (!Ctor) return
    rec = new Ctor()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (event) => {
      let interim = ''
      const finals: string[] = []
      let confidence = 1
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const row = event.results[i]
        const alt = row[0]
        const piece = alt?.transcript.trim() ?? ''
        if (!piece) continue
        heardPass = true
        if (accept(piece, typeof alt?.confidence === 'number' ? alt.confidence : 1)) {
          options.onHeard?.(piece)
          if (partnerTalking) options.onBargeIn?.()
        }
        const score = typeof alt?.confidence === 'number' ? alt.confidence : 1
        if (row.isFinal) {
          finals.push(piece)
          confidence = Math.min(confidence, score)
        } else {
          interim += (interim ? ' ' : '') + piece
          confidence = Math.min(confidence, score)
        }
      }
      if (interim) {
        if (accept(interim, confidence)) {
          options.onInterim(interim)
          scheduleCommit(interim, confidence)
        } else {
          options.onInterim('')
          clearCommit()
        }
      }
      if (finals.length) commit(finals.join(' '), confidence)
    }
    rec.onerror = (event) => {
      const error = event.error || ''
      if (error === 'not-allowed' || error === 'service-not-allowed' || error === 'audio-capture') {
        live = false
        options.onBlocked?.()
        emitError('Нет доступа к микрофону — разрешите его в браузере.')
        return
      }
      if (error === 'network') {
        emitError('Распознавание речи нужно с интернетом.')
      }
    }
    rec.onend = () => restart()
  }

  return {
    start() {
      if (!Ctor) {
        emitError('Голос доступен в Chrome или Edge.')
        return false
      }
      live = true
      acceptedPass = false
      heardPass = false
      lastInterim = ''
      lastCommitted = ''
      attach(langs[langIndex] ?? langs[0])
      try {
        rec?.start()
        return true
      } catch {
        live = false
        emitError('Не получилось включить микрофон.')
        return false
      }
    },
    stop() {
      live = false
      lastInterim = ''
      clearCommit()
      try {
        rec?.abort()
      } catch {
        try {
          rec?.stop()
        } catch {
          /* already stopped */
        }
      }
      rec = null
    },
    setPartnerTalking(on: boolean) {
      partnerTalking = on
      if (on) {
        lastInterim = ''
        clearCommit()
        options.onInterim('')
      }
    },
  }
}
