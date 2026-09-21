import type { Language } from '../types'

export type SpeakLang = Language | 'ru'

const LOCALE: Record<SpeakLang, string> = {
  fr: 'fr-FR',
  de: 'de-DE',
  en: 'en-GB',
  ru: 'ru-RU',
}

let currentText = ''
let spokenPrefix = ''
let lastSpoken = ''
let lastSpokenAt = 0
let voiceVolume = 0

export function clampVoiceVolume(value: unknown) {
  const next = Number(value)
  if (!Number.isFinite(next)) return 1
  return Math.min(1, Math.max(0, next))
}

export function getVoiceVolume() {
  return voiceVolume
}

export function setVoiceVolume(value: number) {
  voiceVolume = clampVoiceVolume(value)
}

function voices() {
  return typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices()
}

const RU_VOICE = [/svetlana/i, /google.*рус/i, /google.*ru/i, /neural/i, /online/i, /pavel/i, /dmitry/i, /dariya/i, /irina/i]

const SPEAK_STYLE: Record<SpeakLang, { rate: number; pitch: number }> = {
  ru: { rate: 1.14, pitch: 1.12 },
  de: { rate: 0.96, pitch: 1 },
  fr: { rate: 0.98, pitch: 1.02 },
  en: { rate: 1, pitch: 1 },
}

function pickVoice(locale: string, lang: SpeakLang) {
  const prefix = locale.slice(0, 2)
  const match = voices().filter((voice) => voice.lang.replace('_', '-').toLowerCase().startsWith(prefix))
  if (!match.length) return undefined
  if (lang === 'ru') {
    for (const look of RU_VOICE) {
      const hit = match.find((voice) => look.test(voice.name))
      if (hit) return hit
    }
    return match.find((voice) => !voice.localService) ?? match[0]
  }
  return match.find((voice) => voice.localService) ?? match[0]
}

function fold(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripForSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[*_`#>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function speechLocale(lang: SpeakLang) {
  return LOCALE[lang]
}

export function isSpeaking() {
  return typeof speechSynthesis !== 'undefined' && (speechSynthesis.speaking || speechSynthesis.pending)
}

export function stopSpeaking() {
  lastSpoken = spokenPrefix || currentText
  lastSpokenAt = Date.now()
  currentText = ''
  spokenPrefix = ''
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.pause()
  speechSynthesis.cancel()
  window.setTimeout(() => {
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel()
  }, 0)
}

export function looksLikeEcho(heard: string) {
  const source = spokenPrefix || currentText || (Date.now() - lastSpokenAt < 2800 ? lastSpoken : '')
  if (!source) return false
  const heardWords = fold(heard)
    .split(' ')
    .filter((word) => word.length > 1)
  const spokenWords = fold(source)
    .split(' ')
    .filter((word) => word.length > 1)
  if (!heardWords.length) return true
  const heardJoin = heardWords.join(' ')
  const spokenJoin = spokenWords.join(' ')
  if (spokenJoin.includes(heardJoin)) return true
  const extra = heardWords.filter(
    (word) =>
      !spokenWords.some(
        (item) => item === word || (word.length > 3 && item.length > 3 && (item.startsWith(word) || word.startsWith(item))),
      ),
  )
  return extra.length === 0
}

export function speak(
  text: string,
  lang: SpeakLang,
  handlers?: { onstart?: () => void; onend?: () => void },
) {
  const value = stripForSpeech(text)
  if (!value || typeof speechSynthesis === 'undefined' || voiceVolume <= 0) {
    handlers?.onend?.()
    return
  }

  const locale = LOCALE[lang]
  const style = SPEAK_STYLE[lang]
  const utter = new SpeechSynthesisUtterance(value)
  utter.lang = locale
  utter.rate = style.rate
  utter.pitch = style.pitch
  utter.volume = voiceVolume
  const voice = pickVoice(locale, lang)
  if (voice) utter.voice = voice

  currentText = value
  spokenPrefix = ''
  utter.onboundary = (event) => {
    if (typeof event.charIndex === 'number') {
      spokenPrefix = value.slice(0, event.charIndex + (event.charLength || 1))
    }
  }
  utter.onstart = () => handlers?.onstart?.()
  utter.onend = () => {
    spokenPrefix = value
    currentText = ''
    handlers?.onend?.()
  }
  utter.onerror = () => {
    currentText = ''
    spokenPrefix = ''
    handlers?.onend?.()
  }

  speechSynthesis.cancel()
  speechSynthesis.speak(utter)
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener('voiceschanged', () => {
    voices()
  })
}
