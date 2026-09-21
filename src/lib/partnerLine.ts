function cleanAction(text: string) {
  return text
    .replace(/^[\s*"'«»]+|[\s*"'«»]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(он|она|they)\s+/i, '')
    .trim()
}

export function stripSpeechQuotes(text: string) {
  return text
    .replace(/^[«»„“”"']+|[«»„“”"']+$/g, '')
    .replace(/[«»„“”]/g, '')
    .replace(/(^|\s)["']+|["']+(?=\s|$)/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function takeAction(bucket: { value: string }, next: string) {
  const action = cleanAction(next.replace(/\s+/g, ' '))
  if (!action) return
  if (!bucket.value) bucket.value = action
  else if (!bucket.value.includes(action)) bucket.value = `${bucket.value} · ${action}`
}

function pullWrapped(speech: string, bucket: { value: string }, open: string, close: string) {
  const start = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const end = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return speech.replace(new RegExp(`${start}([\\s\\S]+?)${end}`, 'g'), (_, inner: string) => {
    takeAction(bucket, inner)
    return ' '
  })
}

export function splitPartnerLine(text: string): { speech: string; action: string } {
  const found = { value: '' }
  let speech = String(text ?? '').replace(/\r/g, '')

  speech = speech.replace(/<act>([\s\S]*?)<\/act>/gi, (_, inner: string) => {
    takeAction(found, inner)
    return ' '
  })

  speech = pullWrapped(speech, found, '**', '**')
  speech = pullWrapped(speech, found, '__', '__')

  speech = speech.replace(/(^|\n)\*([^*\n]{2,200})\*(?=\s|$|\n|[.,!?])/g, (_, lead: string, inner: string) => {
    takeAction(found, inner)
    return lead
  })

  speech = speech.replace(/(?:^|\n)\(([^)]{3,200})\)\s*$/g, (_, inner: string) => {
    takeAction(found, inner)
    return ''
  })

  speech = speech
    .replace(/\*{1,}/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()

  return {
    speech: stripSpeechQuotes(speech),
    action: found.value,
  }
}

export function packPartnerLine(speech: string, action: string) {
  const line = stripSpeechQuotes(speech)
  const note = cleanAction(action)
  if (!note) return line
  return line ? `${line}\n**${note}**` : `**${note}**`
}
