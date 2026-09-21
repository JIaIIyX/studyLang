import { Volume2 } from 'lucide-react'
import { speak, type SpeakLang } from '../lib/speech'

type Props = {
  text?: string
  lang: SpeakLang
  className?: string
}

export function SpeakButton({ text, lang, className }: Props) {
  const value = text?.trim()
  if (!value) return null

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        speak(value, lang)
      }}
      aria-label="Прослушать"
      title="Прослушать"
      className={
        className ??
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-hover hover:text-ink'
      }
    >
      <Volume2 className="h-5 w-5" />
    </button>
  )
}
