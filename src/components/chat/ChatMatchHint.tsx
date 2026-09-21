import { messageAnchor } from '../../lib/messageRef'
import { matchAgainstChat } from '../../lib/taskSimilarity'
import type { ChatMessage } from '../../types'

export function ChatMatchHint({ messages, index }: { messages: ChatMessage[]; index: number }) {
  const match = matchAgainstChat(messages, index)
  if (!match) return null

  const kind = match.kind === 'quiz' ? 'задание' : 'ответ'
  if (match.first) {
    return (
      <p className="mt-2 text-[11px] leading-4 text-muted">
        Совпадение с чатом: — · первое {kind}
      </p>
    )
  }

  const tone =
    match.percent >= 70 ? 'text-terracotta' : match.percent >= 40 ? 'text-accent' : 'text-muted'

  return (
    <p className={`mt-2 text-[11px] leading-4 ${tone}`}>
      Совпадение с чатом: <span className="font-semibold tabular-nums">{match.percent}%</span>
      {match.withId ? (
        <>
          {' · '}
          <a href={`#${messageAnchor(match.withId)}`} className="underline decoration-dotted underline-offset-2">
            #{match.withN}
          </a>
        </>
      ) : null}
      {match.why ? <span className="text-muted"> · {match.why}</span> : null}
    </p>
  )
}
