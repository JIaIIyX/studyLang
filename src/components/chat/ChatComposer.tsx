import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { ArrowUp, MessagesSquare, Mic, Plus } from 'lucide-react'

export type ChatComposerHandle = {
  setText: (value: string | ((prev: string) => string)) => void
  clear: () => void
}

type Props = {
  placeholder: string
  hasAttachments: boolean
  busy?: boolean
  onSend: (text: string) => void
  onToggleMenu: () => void
  onOpenDialogue: () => void
  onListen: () => void
}

export const ChatComposer = forwardRef<ChatComposerHandle, Props>(function ChatComposer(
  { placeholder, hasAttachments, busy = false, onSend, onToggleMenu, onOpenDialogue, onListen },
  ref,
) {
  const [draft, setDraft] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    setText: (value) => {
      setDraft(value)
      queueMicrotask(() => areaRef.current?.focus())
    },
    clear: () => setDraft(''),
  }))

  const submit = () => {
    if ((!draft.trim() && !hasAttachments) || busy) return
    const text = draft
    setDraft('')
    onSend(text)
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggleMenu}
        className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-hover"
        aria-label="Инструменты"
      >
        <Plus className="h-5 w-5" />
      </button>
      <textarea
        ref={areaRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        rows={1}
        placeholder={placeholder}
        className="max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted"
      />
      <button
        type="button"
        onClick={onOpenDialogue}
        className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-hover"
        aria-label="Диалог"
      >
        <MessagesSquare className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onListen}
        className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-hover"
        aria-label="Голос"
      >
        <Mic className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={submit}
        disabled={busy || (!draft.trim() && !hasAttachments)}
        className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-terracotta text-white disabled:opacity-30"
        aria-label="Отправить"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </>
  )
})
