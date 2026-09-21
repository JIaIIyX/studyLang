const SHOW = 'btn|ex|opt'
const HIDE = 'sec|hint|secret'
const DROP = 'answer'
const TAG = `${SHOW}|${HIDE}|${DROP}`
const PAIR = new RegExp(`<(${TAG})>([\\s\\S]*?)</\\1>`, 'gi')
const LOOSE = new RegExp(`</?(?:${TAG})>`, 'gi')
const KNOWN = 'ex|sec|btn|opt|answer|hint|secret'

const ALIAS: Record<string, 'ex' | 'sec' | 'btn' | 'answer'> = {
  ex: 'ex',
  example: 'ex',
  phrase: 'ex',
  foreign: 'ex',
  sec: 'sec',
  secret: 'sec',
  hint: 'sec',
  ru: 'sec',
  rus: 'sec',
  btn: 'btn',
  button: 'btn',
  opt: 'btn',
  option: 'btn',
  choice: 'btn',
  variant: 'btn',
  answer: 'answer',
  ans: 'answer',
  key: 'answer',
}

export type PracticeKind = 'text' | 'btn' | 'ex' | 'sec'
export type PracticePart = { type: PracticeKind; text: string }

function kindOf(tag: string): Exclude<PracticeKind, 'text'> {
  if (tag === 'ex') return 'ex'
  if (tag === 'sec' || tag === 'hint' || tag === 'secret') return 'sec'
  return 'btn'
}

export function cleanTagText(text: string) {
  return text.replace(/\*\*/g, '').replace(/<\/?(?:ex|sec|btn|opt|answer|hint|secret)>/gi, '').replace(/\s+/g, ' ').trim()
}

function wrap(kind: 'ex' | 'sec' | 'btn' | 'answer', inner: string) {
  const text = cleanTagText(inner)
  if (!text) return ''
  return `<${kind}>${text}</${kind}>`
}

function hasForeign(text: string) {
  return /[a-zäöüßàâéèêëïîôùûçæœ]/i.test(text)
}

function looksLikeSecret(text: string) {
  const value = cleanTagText(text)
  if (value.length < 2 || value.length > 90) return false
  if (!/[а-яё]/i.test(value)) return false
  if (hasForeign(value) && value.length > 24) return false
  if (
    /(объясн|используй|потому|поэтому|правило|артикл|спряжен|смотри|обрати|нужно |можно сказать|в этом случае|например,|это форма|это время|перевод не|не путай)/i.test(
      value,
    )
  ) {
    return false
  }
  return true
}

function rewriteAliases(text: string) {
  return text.replace(/<\/?([a-z]+)(?:\s[^>]*)?>/gi, (full, name: string) => {
    const mapped = ALIAS[name.toLowerCase()]
    if (!mapped) return full
    return full.startsWith('</') ? `</${mapped}>` : `<${mapped}>`
  })
}

function fromBbcode(text: string) {
  return text.replace(
    /\[(ex|example|sec|secret|hint|btn|button|opt|option|answer|ans|key)\]([\s\S]*?)\[\/\1\]/gi,
    (_, name: string, inner: string) => wrap(ALIAS[name.toLowerCase()] ?? 'ex', inner),
  )
}

function closeKind(text: string, kind: string) {
  const mapped = (ALIAS[kind] ?? 'ex') as 'ex' | 'sec' | 'btn' | 'answer'
  const re = new RegExp(`<${kind}>([^\\n]*?)(?:</${kind}>|(?=</?(?:${KNOWN})>)|\\n|$)`, 'gi')
  return text.replace(re, (_, inner: string) => {
    if (mapped === 'sec' && !looksLikeSecret(inner)) return cleanTagText(inner)
    if (mapped === 'ex' && !hasForeign(inner) && /[а-яё]/i.test(inner)) return cleanTagText(inner)
    return wrap(mapped, inner)
  })
}

function closeDangling(text: string) {
  return ['answer', 'btn', 'opt', 'ex', 'sec', 'hint', 'secret'].reduce(closeKind, text)
}

function fromBraces(text: string) {
  return text.replace(/\{\{([^{}]+)\}\}/g, (_, inner: string) => {
    const cut = inner.indexOf('|')
    if (cut < 0) {
      const phrase = inner.trim()
      return hasForeign(phrase) ? wrap('ex', phrase) : phrase
    }
    const left = inner.slice(0, cut)
    const right = inner.slice(cut + 1)
    if (!hasForeign(left)) return `${cleanTagText(left)} ${cleanTagText(right)}`.trim()
    const ex = wrap('ex', left)
    if (!looksLikeSecret(right)) return `${ex} ${cleanTagText(right)}`.trim()
    return `${ex} ${wrap('sec', right)}`
  })
}

function fromTildeSecrets(text: string) {
  return text.replace(/(<\/ex>)\s*~([^~\n]{2,90})~/gi, (_full, lead: string, inner: string) =>
    looksLikeSecret(inner) ? `${lead} ${wrap('sec', inner)}` : `${lead} ${cleanTagText(inner)}`,
  )
}

function fromBracketButtons(text: string) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.includes('](')) return line
      if (/^\[[^\]\n]{1,80}\]$/.test(trimmed)) {
        const inner = trimmed.slice(1, -1)
        if (isChoiceLabel(inner)) return ''
        if (looksLikeQuestionChoice(inner)) return inner
        return wrap('btn', inner)
      }
      const many = [...trimmed.matchAll(/\[([^\]\n]{1,80})\]/g)]
      if (many.length < 2) return line
      const packed = many.map((item) => `[${item[1]}]`).join('')
      if (packed.length < trimmed.replace(/\s+/g, '').length * 0.7) return line
      return many
        .map((item) => {
          const inner = item[1]
          if (isChoiceLabel(inner)) return ''
          if (looksLikeQuestionChoice(inner)) return inner
          return wrap('btn', inner)
        })
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
}

function fromEqualsAnswer(text: string) {
  return text.replace(/^\s*=\s*(?!=)(.{1,80})$/gm, (_, inner: string) => wrap('answer', inner))
}

function fromLetterList(text: string) {
  if (!/(?:<answer>|___|как (?:правильно|переводится|будет)|^\s*=\s*)/im.test(text)) return text
  const lines = text.split('\n')
  const marked = (line: string) =>
    /^\s*(?:[-*•]|[A-Da-dА-Га-г]\s*[).:]|[1-4]\s*[).:])\s+\S/.test(line) && !/^</.test(line.trim())
  if (lines.filter(marked).length < 2) return text
  return lines
    .map((line) => {
      if (!marked(line)) return line
      const inner = line.replace(/^\s*(?:[-*•]|[A-Da-dА-Га-г]\s*[).:]|[1-4]\s*[).:])\s+/, '')
      if (isChoiceLabel(inner)) return ''
      if (looksLikeQuestionChoice(inner)) return inner
      return wrap('btn', inner)
    })
    .join('\n')
}

function fromOptionLines(text: string) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      const tagged = trimmed.match(/^\[(?:option|opt|btn|button|choice|variant)\]\s*(.+)$/i)
      if (!tagged?.[1]) return line
      const inner = tagged[1].replace(/^(?:[A-Da-dА-Га-г]|[1-4])\s*[).:]\s+/, '').trim()
      if (!inner || isChoiceLabel(inner)) return ''
      if (looksLikeQuestionChoice(inner)) return inner
      return wrap('btn', inner)
    })
    .join('\n')
}

function fromLabeledLines(text: string) {
  return text.replace(
    /^(ex|example|phrase|btn|button|opt|option|choice|ans|answer|key)\s*[:：]\s*(.+)$/gim,
    (_, name: string, inner: string) => wrap(ALIAS[name.toLowerCase()] ?? 'ex', inner),
  )
}

function flattenNested(text: string) {
  return text.replace(/<ex>([\s\S]*?)<\/ex>/gi, (_, inner: string) => {
    const secrets: string[] = []
    const phrase = String(inner)
      .replace(/<(sec|hint|secret)>([\s\S]*?)<\/\1>/gi, (__: string, __name: string, secret: string) => {
        secrets.push(wrap('sec', secret))
        return ' '
      })
      .replace(/<(btn|opt|answer)>([\s\S]*?)<\/\1>/gi, ' $2 ')
    return [wrap('ex', phrase), ...secrets].filter(Boolean).join(' ')
  })
}

function pairRussianExample(text: string) {
  return text.replace(/<ex>([\s\S]*?)<\/ex>\s*<ex>([\s\S]*?)<\/ex>/gi, (full, left: string, right: string) => {
    const a = cleanTagText(left)
    const b = cleanTagText(right)
    if (a && b && hasForeign(a) && looksLikeSecret(b) && !/[а-яё]/i.test(a)) {
      return `${wrap('ex', a)} ${wrap('sec', b)}`
    }
    return full
  })
}

function dropJunkTags(text: string) {
  return text.replace(
    /<\/?(?:act|button|div|span|p|br|i|b|em|strong|code|pre|a|ul|ol|li|table|tr|td|th|think|thinking)(?:\s[^>]*)?\/?>/gi,
    ' ',
  )
}

export function wrapAngleChoices(text: string) {
  return text.replace(/<([^<>\n]{2,200})>/g, (full, inner: string) => {
    const raw = inner.replace(/\s+/g, ' ').trim()
    if (raw.length < 2 || raw.length > 200) return full
    if (/^(?:\/)?(?:ex|sec|btn|opt|hint|secret|answer|act|button|div|span|p|br|i|b|em|strong|code|pre|a|ul|ol|li|table|tr|td|th)\b/i.test(raw)) {
      return full
    }
    if (!/^(?:[A-Da-dА-Га-г]|[1-4])\s*[).:]\s+\S/.test(raw)) return full
    const choice = raw.replace(/^(?:[A-Da-dА-Га-г]|[1-4])\s*[).:]\s+/, '')
    if (isChoiceLabel(choice) || looksLikeQuestionChoice(choice)) return looksLikeQuestionChoice(choice) ? choice : ''
    return wrap('btn', choice)
  })
}

function isChoiceLabel(value: string) {
  return /^(options?|вариант\w*|ответы?|choices?)$/i.test(value.trim())
}

function looksLikeQuestionChoice(value: string) {
  const text = cleanTagText(value)
  if (!text) return false
  if (/\?\s*$/.test(text)) return true
  return (
    /^(why|what|how|when|where|who|which|почему|зачем|что|как|когда|где|кто|какой|какая|какое|какие)\b/i.test(text) &&
    text.split(/\s+/).length >= 5
  )
}

function unwrapQuestionButtons(text: string) {
  return text.replace(/<(btn|opt)>([\s\S]*?)<\/\1>/gi, (_full, _kind: string, inner: string) => {
    const value = cleanTagText(inner)
    if (!value || isChoiceLabel(value)) return ''
    if (looksLikeQuestionChoice(value)) return value
    return wrap('btn', value.replace(/^(?:[A-Da-dА-Га-г]|[1-4])\s*[).:]\s+/, '').trim() || value)
  })
}

function attachSecret(phrase: string, secret: string) {
  const ex = wrap('ex', phrase)
  if (!ex) return cleanTagText(secret)
  if (!looksLikeSecret(secret)) return `${ex} ${cleanTagText(secret)}`.trim()
  return `${ex} ${wrap('sec', secret)}`
}

export function wrapBareSecrets(text: string) {
  return text
    .replace(/<ex>([\s\S]*?)<\/ex>\s*[\(（]\s*([^)）]*[а-яё][^)）]*)\s*[\)）]/gi, (_, phrase: string, secret: string) =>
      attachSecret(phrase, secret),
    )
    .replace(/<ex>([\s\S]*?)<\/ex>\s*(?:—|–|-)\s+(?![<])([^\n<]*[а-яё][^\n<]*)/g, (_, phrase: string, secret: string) =>
      attachSecret(phrase, secret),
    )
    .replace(
      /<ex>([\s\S]*?)<\/ex>\s*(?:\. )?(?:По-русски\s*[—–-]\s*)?[«"]([^»"]*[а-яё][^»"]*)[»"]/gi,
      (_, phrase: string, secret: string) => attachSecret(phrase, secret),
    )
    .replace(
      /<ex>([\s\S]*?)<\/ex>\s*(?:секрет|перевод)\s*[:：]\s*([^\n<]*[а-яё][^\n<]*)/gi,
      (_, phrase: string, secret: string) => attachSecret(phrase, secret),
    )
}

function keepPairedSecrets(text: string) {
  return text.replace(/<sec>([\s\S]*?)<\/sec>/gi, (_full, inner: string, offset: number) => {
    const before = text.slice(0, offset).replace(/\s+$/, '')
    if (/<\/ex>$/i.test(before) && looksLikeSecret(inner)) return ` <sec>${cleanTagText(inner)}</sec>`
    return cleanTagText(inner) ? ` ${cleanTagText(inner)}` : ''
  })
}

function dropSecretsInQuiz(text: string) {
  if (!/<(?:btn|opt|answer)>/i.test(text)) return text
  return text.replace(/\s*<sec>([\s\S]*?)<\/sec>/gi, '')
}

function tidySpaces(text: string) {
  return text
    .replace(/<(ex|sec|btn|opt|answer|hint|secret)>([\s\S]*?)<\/\1>/gi, (_, kind: string, inner: string) =>
      `<${kind}>${cleanTagText(inner)}</${kind}>`,
    )
    .replace(/(<\/(?:ex|sec|btn|opt|answer|hint|secret)>)([^\s<\n])/gi, '$1 $2')
    .replace(/([^\s>\n])(<(?:ex|sec|btn|opt|answer|hint|secret)>)/gi, '$1 $2')
    .replace(/([а-яё])([A-Za-z])/gi, '$1 $2')
    .replace(/([A-Za-z])([а-яё])/gi, '$1 $2')
    .replace(/([.!?])([А-ЯЁA-Z])/g, '$1 $2')
    .replace(/(\p{L})(\*\*)/gu, '$1 $2')
    .replace(/(\*\*)(\p{L})/gu, '$1 $2')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizePracticeMarkup(text: string) {
  let next = String(text ?? '').replace(/\r/g, '')
  next = fromBbcode(next)
  next = rewriteAliases(next)
  next = closeDangling(next)
  next = fromBraces(next)
  next = fromTildeSecrets(next)
  next = fromLabeledLines(next)
  next = fromBracketButtons(next)
  next = fromOptionLines(next)
  next = fromLetterList(next)
  next = fromEqualsAnswer(next)
  next = wrapAngleChoices(next)
  next = closeDangling(next)
  next = flattenNested(next)
  next = wrapBareSecrets(next)
  next = pairRussianExample(next)
  next = keepPairedSecrets(next)
  next = dropSecretsInQuiz(next)
  next = dropJunkTags(next)
  next = unwrapQuestionButtons(next)
  return tidySpaces(next)
}

export function toCompactMarkup(text: string) {
  return normalizePracticeMarkup(text)
    .replace(/<ex>([\s\S]*?)<\/ex>\s*<sec>([\s\S]*?)<\/sec>/gi, (_, phrase: string, secret: string) => `{{${cleanTagText(phrase)}|${cleanTagText(secret)}}}`)
    .replace(/<ex>([\s\S]*?)<\/ex>/gi, (_, phrase: string) => `{{${cleanTagText(phrase)}}}`)
    .replace(/<(sec|hint|secret)>([\s\S]*?)<\/\1>/gi, (_, __kind: string, secret: string) => cleanTagText(secret))
    .replace(/<(btn|opt)>([\s\S]*?)<\/\1>/gi, (_, __kind: string, inner: string) => `\n[${cleanTagText(inner)}]`)
    .replace(/<answer>([\s\S]*?)<\/answer>/gi, (_, inner: string) => `\n=${cleanTagText(inner)}`)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim()
}

function asMarkup(text: string) {
  return normalizePracticeMarkup(text)
}

export function splitPracticeTags(text: string): PracticePart[] {
  const source = asMarkup(text)
  const parts: PracticePart[] = []
  let last = 0
  const re = new RegExp(PAIR.source, PAIR.flags)
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    if (match.index > last) {
      const prose = stripLooseTags(source.slice(last, match.index))
      if (prose) parts.push({ type: 'text', text: prose })
    }
    const tag = (match[1] ?? '').toLowerCase()
    const inner = cleanTagText(match[2] ?? '')
    if (inner && tag !== 'answer') parts.push({ type: kindOf(tag), text: inner })
    last = match.index + match[0].length
  }
  if (last < source.length) {
    const prose = stripLooseTags(source.slice(last))
    if (prose) parts.push({ type: 'text', text: prose })
  }
  return parts
}

export function extractTaggedButtons(text: string) {
  return splitPracticeTags(text)
    .filter((part) => part.type === 'btn' || part.type === 'ex')
    .map((part) => part.text)
}

export function extractQuizAnswers(text: string) {
  const source = asMarkup(text)
  const tags: string[] = []
  const re = /<answer>([\s\S]*?)<\/answer>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    const inner = cleanTagText(match[1] ?? '')
    if (inner) tags.push(inner)
  }
  const parts = tags.flatMap((item) => item.split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean))
  const choices = extractChoiceTags(source)
  const resolved = parts.map((item) => resolveLetterAnswer(item, choices))
  const seen = new Set<string>()
  const list: string[] = []
  for (const item of resolved) {
    const key = item.toLowerCase()
    if (!item || seen.has(key)) continue
    seen.add(key)
    list.push(item)
  }
  if (gapAllowsEitherForm(source, choices, list)) return choices
  return list
}

function looksLikeArticleChoices(choices: string[]) {
  return choices.every((item) => /^(a|an|the|der|die|das|den|dem|le|la|les|un|une|ein|eine|einen)$/i.test(item.trim()))
}

export function hasTenseCue(text: string) {
  return /(yesterday|last (night|week|year)|ago|\balready\b|\bnever\b|\bjust\b|\byet\b|right now|\bnow\b|every (day|morning|evening|night|week|year)|\bon \w+days?\b|\balways\b|\busually\b|want to|to ___|\bto\b|hier |gestern |вчера|\bуже\b|\bсейчас\b|\bкаждый\b|\bhas \b|\bhave \b|\bhad \b)/i.test(
    text,
  )
}

function gapAllowsEitherForm(source: string, choices: string[], answers: string[]) {
  if (answers.length !== 1 || choices.length !== 2) return false
  if (!/_{2,}/.test(source)) return false
  if (looksLikeArticleChoices(choices)) return false
  if (hasTenseCue(source)) return false
  return choices.every((item) => item.trim().split(/\s+/).length <= 3 && item.trim().length <= 16)
}

export function quizPickMode(text: string): 'all' | 'any' {
  const source = asMarkup(text)
  const answers = extractQuizAnswers(source)
  if (answers.length < 2) return 'any'
  if (/(все верн|все правильн|выберите все|отметьте все|all that apply)/i.test(source)) return 'all'
  if (/_{2,}/.test(source)) return 'any'
  return 'all'
}

function resolveLetterAnswer(value: string, choices: string[]) {
  if (!choices.length) return value
  const raw = value.trim()
  const numbered = raw.match(/^(?:answer|option|вариант|key)?\s*([1-4])$/i)
  if (numbered) return choices[Number(numbered[1]) - 1] || raw
  const letter = raw.match(/^(?:answer|option|вариант|key)?\s*([a-dа-г])$/i)?.[1]
  if (!letter) return raw
  const lower = letter.toLowerCase()
  const index = 'абвг'.includes(lower) ? 'абвг'.indexOf(lower) : lower.charCodeAt(0) - 97
  return choices[index] || raw
}

export function extractQuizAnswer(text: string) {
  return extractQuizAnswers(text)[0] ?? ''
}

export function extractChoiceTags(text: string) {
  const list: string[] = []
  const re = /<(btn|opt)>([\s\S]*?)<\/\1>/gi
  let match: RegExpExecArray | null
  const source = asMarkup(text)
  while ((match = re.exec(source))) {
    const inner = cleanTagText(match[2] ?? '')
    if (inner) list.push(inner)
  }
  return list
}

export function canonicalizeQuiz(text: string) {
  const source = asMarkup(text)
  const choices = extractChoiceTags(source)
  const answers = extractQuizAnswers(source)
  if (choices.length < 2 || !answers.length) return source
  const trimmed = source.trim()
  const chunks = trimmed.split(/\n\s*\n/)
  const lead = /^(верно\.|почти\.)/i.test(chunks[0] ?? '') ? (chunks[0] ?? '').trim() : ''
  const body = lead ? trimmed.slice(lead.length).trim() : trimmed
  const prompt = stripLooseTags(
    body.replace(/<(btn|opt|answer|sec|hint|secret)>[\s\S]*?<\/\1>/gi, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!prompt) return source
  const note =
    answers.length >= 2
      ? quizPickMode(source) === 'all'
        ? 'Отметьте все верные варианты.'
        : 'Подойдёт любой верный вариант.'
      : ''
  const promptWithNote = note && !prompt.includes(note) ? `${note}\n${prompt}` : prompt
  return [lead, promptWithNote, ...answers.map((item) => `<answer>${item}</answer>`), '', ...choices.map((item) => `<btn>${item}</btn>`)]
    .filter((line) => line !== '')
    .join('\n')
}

export function stripPracticeTags(text: string) {
  return stripLooseTags(
    asMarkup(text)
      .replace(/<(sec|hint|secret|answer)>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(btn|ex|opt)>([\s\S]*?)<\/\1>/gi, '$2'),
  )
}

export function stripLooseTags(text: string) {
  return text.replace(LOOSE, '')
}

export function hasPracticeTags(text: string) {
  return splitPracticeTags(text).some((part) => part.type !== 'text')
}

export function fixReplySpaces(text: string) {
  return asMarkup(text)
}

export function keepFirstExercise(text: string) {
  const source = asMarkup(text)
  const parts = source.split(
    /\n(?=\s*(?:\d+\s*[).:]|#{1,3}\s+|(?:\*\*)?(?:вопрос|задание|упражнение|task|question)\s*\d))/i,
  )
  let first = (parts[0] ?? source).trim()
  if ((first.match(/<(btn|opt)>[\s\S]*?<\/\1>/gi) ?? []).length < 2 && parts[1]) {
    first = `${first}\n${parts[1].trim()}`
  }
  const tags = first.match(/<(btn|opt)>[\s\S]*?<\/\1>/gi) ?? []
  if (tags.length <= 4) return first
  let count = 0
  return first
    .replace(/<(btn|opt)>[\s\S]*?<\/\1>/gi, (block) => {
      count += 1
      return count <= 4 ? block : ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function limitExamples(text: string, max = 1) {
  let count = 0
  return asMarkup(text)
    .replace(/<ex>[\s\S]*?<\/ex>\s*(?:<sec>[\s\S]*?<\/sec>)?/gi, (block) => {
      count += 1
      return count <= max ? block : ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function sealDanglingPrompt(text: string, language: 'fr' | 'de' | 'en') {
  const trimmed = asMarkup(text)
  if (!/\*{0,2}\s*(твоя задача|ваше задание|задание такое)\s*\*{0,2}\s*:?\s*\*{0,2}\s*$/i.test(trimmed)) return trimmed
  const extra =
    language === 'fr'
      ? 'Напишите одно предложение в passé composé — что вы делали вчера.'
      : language === 'de'
        ? 'Напишите одно предложение в Perfekt — что вы делали вчера.'
        : 'Напишите одно предложение в Past Simple — что вы делали вчера.'
  return `${trimmed.replace(/\s*[:：]\s*$/, '.')} ${extra}`
}
