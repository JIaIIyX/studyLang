import type { ChatMessage } from '../types'

export function messageNo(messages: ChatMessage[], id: string) {
  const index = messages.findIndex((item) => item.id === id)
  return index >= 0 ? index + 1 : 0
}

export function messageAnchor(id: string) {
  return `msg-${id}`
}

export function previewMessage(text: string, limit = 42) {
  const value = text.replace(/\s+/g, ' ').trim()
  if (value.length <= limit) return value
  return `${value.slice(0, limit).trim()}…`
}

export function parseMessageRefs(text: string, messages: ChatMessage[]) {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(/#(\d+)|задание\s*#?(\d+)/gi)) {
    const n = Number(match[1] || match[2])
    const message = messages[n - 1]
    if (!message || seen.has(message.id)) continue
    seen.add(message.id)
    ids.push(message.id)
  }
  return ids
}

export function resolveMessageRefs(messages: ChatMessage[], ids: string[]) {
  const seen = new Set<string>()
  const refs: ChatMessage[] = []
  const add = (item?: ChatMessage) => {
    if (!item || seen.has(item.id)) return
    seen.add(item.id)
    refs.push(item)
  }
  for (const id of ids) {
    const index = messages.findIndex((item) => item.id === id)
    if (index < 0) continue
    if (messages[index].role === 'user' && index > 0) add(messages[index - 1])
    add(messages[index])
  }
  return refs
}

export function referencedContext(messages: ChatMessage[]) {
  const last = messages.at(-1)
  const ids = last?.refIds ?? []
  if (ids.length) {
    const prior = messages.filter((item) => item.id !== last?.id)
    const refs = resolveMessageRefs(prior, ids)
    const blob = refs
      .map((item) => item.content.trim())
      .filter(Boolean)
      .join('\n\n')
    if (blob) return blob
    if (last?.refSnippet?.trim()) return last.refSnippet.trim()
  }
  return ''
}

export function formatRefBlock(messages: ChatMessage[], refs: ChatMessage[]) {
  if (!refs.length) return ''
  return [
    'The student attached messages. These are anchors to a past task — use them, do not invent.',
    'If they ask to recheck or point at a mistake — recheck and correct yourself, do not defend the old answer.',
    ...refs.map((item) => {
      const n = messageNo(messages, item.id)
      const who = item.role === 'assistant' ? 'tutor' : 'student'
      return `[#${n} ${who}]\n${item.content.trim().slice(0, 500)}`
    }),
  ].join('\n\n')
}
