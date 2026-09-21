import { Check, Copy, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { MessageAnchor } from './MessageAnchor'

export function UserMessageActions({
  text,
  n,
  attached,
  disabled,
  dark,
  onAttach,
  onResend,
}: {
  text: string
  n?: number
  attached?: boolean
  disabled?: boolean
  dark?: boolean
  onAttach?: () => void
  onResend: () => void
}) {
  const [copied, setCopied] = useState(false)
  const tone = dark
    ? 'flex h-7 w-7 items-center justify-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white disabled:opacity-30'
    : 'flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink disabled:opacity-30'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="mb-0.5 flex shrink-0 flex-col items-end justify-end gap-0.5">
      {n && onAttach ? <MessageAnchor n={n} attached={attached} dark={dark} onAttach={onAttach} /> : null}
      <button type="button" className={tone} onClick={() => void copy()} aria-label="Скопировать" title="Скопировать">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        className={tone}
        disabled={disabled}
        onClick={onResend}
        aria-label="Отправить ещё раз"
        title="Отправить ещё раз"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

