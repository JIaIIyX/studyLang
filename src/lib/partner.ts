import { askGemini } from './llm'
import { compactHistory, LLM_BUDGET } from './llmTasks'
import { languageMeta } from './languages'
import { packPartnerLine, splitPartnerLine } from './partnerLine'
import { stripPracticeTags } from './practiceTags'
import { partnerSceneBlock } from './virtualization'
import type { ChatMessage, Language, Virtualization } from '../types'

function isDialogueOpener(text: string) {
  return (
    /(давай\s+)?диалог|поговор(?:им|ить)|пообща(?:емся|ться)|живое общение|(?:давай|хочу|открой)\s+общени|talk with me|let'?s talk|role.?play/i.test(
      text,
    ) && !/(домашн|домашк|тетрад|(?:^|[^\p{L}])д[/.]?з(?:$|[^\p{L}])|квиз|проверь меня|словар|тест|таблиц)/iu.test(text)
  )
}

const CANNED =
  /cash or card|espèces ou carte|bar oder karte|you browsing or looking|want me to show you a section|for you or a gift\?|nice\. you looking|twenty-three, nice|i’ll bring that over|i'll bring that over|sur place ou à emporter|zum hiertrinken/i

const STUB = /^(yeah\??(?: go on)?|oui \?|ah\. et ensuite \?|ja\?|okay… und dann\?|не дошло\.?\s*напишите ещё раз\.?)$/i

export type PartnerReply = { text: string }

function speechOf(text: string) {
  return splitPartnerLine(text).speech || text.trim()
}

function isCanned(text: string) {
  return CANNED.test(speechOf(text))
}

function historyLine(item: ChatMessage) {
  const { speech, action } = splitPartnerLine(item.content)
  const line = (speech || item.content).trim().slice(0, LLM_BUDGET.partner.maxChars)
  return action ? `${line}\n**${action}**` : line
}

function lastOf(messages: ChatMessage[], role: ChatMessage['role']) {
  return [...messages].reverse().find((item) => item.role === role && item.channel === 'partner')?.content ?? ''
}

function partnerHistory(messages: ChatMessage[]) {
  const lastUser = lastOf(messages, 'user').trim()
  const turns = messages
    .filter((item) => {
      const text = item.content.trim()
      if (!text) return false
      if (item.channel !== 'partner') return false
      if (isDialogueOpener(text) && item.role === 'user') return false
      if (item.role === 'assistant' && (isCanned(text) || STUB.test(speechOf(text)) || /не дошло/i.test(text))) {
        return false
      }
      return true
    })
    .slice(-LLM_BUDGET.partner.turns)
    .map((item) => ({
      role: item.role === 'assistant' ? ('model' as const) : ('user' as const),
      text: historyLine(item),
    }))
    .filter((item) => item.text)

  const userText = lastUser && !isDialogueOpener(lastUser) ? lastUser.slice(0, LLM_BUDGET.partner.maxChars) : ''
  if (userText) {
    while (turns.at(-1)?.role === 'user') turns.pop()
    turns.push({ role: 'user', text: userText })
  } else if (!turns.some((item) => item.role === 'user')) {
    const anyUser = [...messages]
      .reverse()
      .find((item) => item.role === 'user' && item.channel === 'partner' && item.content.trim())
    if (anyUser) turns.push({ role: 'user', text: anyUser.content.trim().slice(0, LLM_BUDGET.partner.maxChars) })
  }
  return turns
}

function partnerSystem(
  language: Language,
  scene: Virtualization | null | undefined,
  options?: { displayName?: string; start?: boolean; interrupted?: boolean },
) {
  const practice = languageMeta(language).native
  const theirName = options?.displayName?.trim() || ''
  return [
    partnerSceneBlock(language, scene),
    `Speak ${practice} like this person texting. 2–4 short casual lines.`,
    'This chat is the scene only. Not a tutor, not an app. No lesson, quiz, translation, correction, or word lists.',
    'No tags: no {{ }}, no [options], no <ex>, <sec>, <btn>, HTML, tables.',
    'Plain speech, no quotation marks. If YOU do something, wrap the action in **double asterisks** on its own line: **медленно уходит**',
    `Russian in → still answer in ${practice}, in character, inside this scene.`,
    'KEEP THE DIALOGUE GOING. Every reply must leave a hook they can answer: a question, a choice, a small hitch, or a next beat of the same situation.',
    'Never close the scene. No goodbye, no “that’s all”, no waiting in silence. React to what they just said, then push one step forward.',
    'If they answer in one word or Russian, stay in character and ask something easy. Do not freeze or switch to teaching.',
    'Remember only what they said in THIS chat. Do not re-greet. Do not jump to paying unless they buy a specific thing now.',
    theirName ? `The student is called ${theirName}.` : '',
    options?.start
      ? 'The scene just started. Open in character from the locked situation, then immediately invite them into the next beat. No template hello. No “what can I get you” as the whole message.'
      : '',
    options?.interrupted ? 'They cut you off. One short beat, still in the scene, and leave a hook.' : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function cleanPartnerOutput(text: string) {
  const raw = stripPracticeTags(text)
  const { speech, action } = splitPartnerLine(raw)
  const spoken = speech
    .replace(/<(ex|btn|opt)>([\s\S]*?)<\/\1>/gi, '$2')
    .replace(/<\/?(?:ex|btn|opt|act|sec|hint|secret)>/gi, '')
    .replace(/\*\s*ты[^*]*\*/gi, '')
    .replace(/ты (?:кива|доста|делаешь|смотришь|тыка|указ|вздых|морщ)[^.?\n]*/gi, '')
    .replace(/(?:that's (?:correct|right)|well done|good job|try saying|in english we|грамматик|правильно так|попробуй сказать)[\s\S]*/i, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^<\/?(?:act|ex|sec|btn)/i.test(line))
    .slice(0, 8)
    .join('\n')
    .trim()
  const line = spoken.length > 700 ? spoken.slice(0, 700).trim() : spoken
  return packPartnerLine(line, action)
}

function usablePartnerLine(text: string) {
  const speech = splitPartnerLine(text).speech
  if (STUB.test(speech) || /не дошло/i.test(text)) return false
  if (isCanned(text)) return false
  return Boolean(speech || text.trim())
}

function hasDialogueHook(text: string) {
  const speech = speechOf(text)
  if (!speech) return false
  if (/[?]/.test(speech)) return true
  if (
    /(or not|or |ou |oder |want |need |shall |maybe |how about|what about|and you|your turn|go on|come on|tell me|try |хочешь|давай|можно |или )/i.test(
      speech,
    )
  ) {
    return true
  }
  if (/(bye|goodbye|see you|au revoir|à bientôt|tschüss|tschuss|that's all|that's it|rien d'autre)\b/i.test(speech)) {
    return false
  }
  return false
}

const HOOK_NUDGE =
  '(Stay in the same scene and character. Do not restart. Your last line closed the talk. Add one short hook they can answer — a question or a choice.)'

async function askPartnerOnce(
  language: Language,
  scene: Virtualization | null | undefined,
  history: { role: 'user' | 'model'; text: string }[],
  options?: { displayName?: string; start?: boolean; interrupted?: boolean; signal?: AbortSignal },
) {
  const raw = await askGemini(partnerSystem(language, scene, options), history, {
    maxTokens: LLM_BUDGET.partner.maxTokens,
    temperature: 0.9,
    signal: options?.signal,
    timeoutMs: LLM_BUDGET.partner.timeoutMs,
  })
  const cleaned = cleanPartnerOutput(raw)
  if (usablePartnerLine(cleaned)) return cleaned
  const loose = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(here's a thinking|thinking process|analyze user|i need to|the user)/i.test(line))
    .slice(0, 8)
    .join('\n')
    .trim()
  const fallback = cleanPartnerOutput(loose)
  if (usablePartnerLine(fallback)) return fallback
  throw new Error('empty')
}

export async function replyAsPartner(
  language: Language,
  messages: ChatMessage[],
  options?: {
    displayName?: string
    virtualization?: Virtualization | null
    start?: boolean
    interrupted?: boolean
    signal?: AbortSignal
  },
): Promise<PartnerReply> {
  const scene = options?.virtualization
  const history = compactHistory(partnerHistory(messages), 'partner')
  if (!history.some((item) => item.role === 'user')) {
    history.push({
      role: 'user',
      text: options?.start
        ? '(The student just entered. Begin the scene in character. Do not say you are starting.)'
        : lastOf(messages, 'user').trim().slice(0, LLM_BUDGET.partner.maxChars) || '…',
    })
  }

  let lastError: unknown
  let lastText = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const turns =
        attempt === 0 || !lastText
          ? history
          : [...history, { role: 'model' as const, text: lastText }, { role: 'user' as const, text: HOOK_NUDGE }]
      const text = await askPartnerOnce(language, scene, turns, options)
      lastText = text
      if (hasDialogueHook(text) || attempt === 1) return { text }
    } catch (error) {
      if (options?.signal?.aborted) throw error
      lastError = error
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400))
    }
  }
  if (lastText) return { text: lastText }
  console.warn('[partner] llm failed', lastError)
  throw lastError instanceof Error ? lastError : new Error('llm-failed')
}
