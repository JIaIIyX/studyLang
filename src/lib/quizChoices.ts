import { fold, splitAnswerPicks, stripMarks } from './normalize'
import { extractChoiceTags, extractQuizAnswer, extractQuizAnswers, quizPickMode, stripPracticeTags, normalizePracticeMarkup } from './practiceTags'

export function isChoiceMarker(line: string) {
  return /^\s*\*\*(ответы?|варианты)\*\*\s*$/i.test(line)
}

function cleanChoice(line: string) {
  return stripMarks(line)
    .replace(/^\s*[-*•]\s+/, '')
    .replace(/^\s*[A-Da-dА-Га-г]\s*[).:]\s+/, '')
    .replace(/^\s*\d+\s*[).:]\s+/, '')
    .trim()
}

function looksLikeTable(lines: string[]) {
  return lines.filter((line) => line.includes('|') && splitCells(line).length >= 2).length >= 2
}

function splitCells(line: string) {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return []
  const cells = trimmed.split('|')
  if (trimmed.startsWith('|')) cells.shift()
  if (trimmed.endsWith('|')) cells.pop()
  return cells.map((cell) => cell.trim()).filter(Boolean)
}

function uniqueChoices(items: string[], max = 72) {
  const seen = new Set<string>()
  const list: string[] = []
  for (const item of items) {
    const value = cleanChoice(item)
    const key = fold(value)
    if (!value || value.length > max || seen.has(key)) continue
    seen.add(key)
    list.push(value)
  }
  return list
}

function fromListLines(lines: string[]) {
  if (looksLikeTable(lines)) return []
  const marked = lines.filter((line) => /^\s*(?:[-*•]|\d+\s*[).:]|[A-Da-dА-Га-г]\s*[).:])\s+\S/.test(line))
  if (marked.length >= 2) return uniqueChoices(marked)
  const plain = lines.map((line) => line.trim()).filter(Boolean)
  if (plain.length >= 2 && plain.length <= 6 && plain.every((line) => line.length <= 72 && !line.includes('?'))) {
    return uniqueChoices(plain)
  }
  return []
}

export function extractQuizChoices(text: string) {
  const source = normalizePracticeMarkup(text)
  const tagged = extractChoiceTags(source)
  if (tagged.length >= 2) return tagged
  const lines = source.split('\n')
  const split = lines.findIndex((line) => isChoiceMarker(line))
  if (split >= 0) {
    const after = lines.slice(split + 1)
    const stop = after.findIndex((line) => isChoiceMarker(line))
    const fromMarker = fromListLines(stop >= 0 ? after.slice(0, stop) : after)
    if (fromMarker.length >= 2) return fromMarker
  }
  return []
}

export function quizQuestionText(text: string) {
  const source = normalizePracticeMarkup(text)
  const tagged = extractChoiceTags(source)
  if (tagged.length >= 2) {
    return stripPracticeTags(source.replace(/<(btn|opt)>[\s\S]*?<\/\1>/gi, '')).trim()
  }
  const lines = text.split('\n')
  const split = lines.findIndex((line) => isChoiceMarker(line))
  if (split >= 0) return lines.slice(0, split).join('\n').trim()
  const body = lines.filter((line) => !/^\s*(?:[-*•]|\d+\s*[).:]|[A-Da-dА-Га-г]\s*[).:])\s+\S/.test(line))
  return body.join('\n').trim() || text
}

function matchesChoice(text: string, choices: string[]) {
  const picks = splitAnswerPicks(text)
  if (!picks.length) return false
  return picks.every((pick) => {
    const guess = fold(pick)
    if (!guess) return false
    if (/^[a-dа-г]$/i.test(guess)) return true
    return choices.some((choice) => {
      const answer = fold(choice)
      if (!answer) return false
      return answer === guess || (answer.length >= 8 && guess.includes(answer)) || (guess.length >= 8 && answer.includes(guess))
    })
  })
}

export function looksLikeQuizRequest(text: string) {
  const value = text.trim()
  if (!value) return false
  if (
    /(дай|дайте|сделай|сделать|создай|выдай|хочу|нужно|можно|ещё|еще|другую|другое|новое|новый|следующ)\s+(мне\s+)?(задач|задан|квиз|упражн|тест|провер|вопрос|практик)/i.test(
      value,
    )
  ) {
    return true
  }
  if (/(задач|задан|квиз|упражн|провер|тест|практик).{0,40}(перевод|с русск|на англий|на француз|на немец|врем|тут|выше|тем)/i.test(value)) {
    return true
  }
  if (/^(ещё|еще|дальше|следующ\w*|не это|другое)(\s+(пожалуйста|пж))?$/i.test(value)) return true
  if (/(проверь меня|давай квиз|давай тест|давай провер|давай задач|давай задан|давай практик)/i.test(value)) return true
  if (/(сделай|дай|дайте|создай|хочу|нужно|можно).{0,40}тест/i.test(value)) return true
  // «хочу сложнее», «сложнее хочу», «что-то более сложное», «уровня b2»
  if (/(хочу|дай|дайте|сделай|нужно|можно|давай|прошу).{0,48}(сложн|легче|трудн|посложн|полегч|уровн|level\s*[abc]|\bb[12]\b|\bc[12]\b)/i.test(value)) {
    return true
  }
  if (/(сложн|легче|трудн|посложн|полегч).{0,24}(задач|задан|тест|квиз|упражн|вопрос|провер|хочу)/i.test(value)) {
    return true
  }
  if (/(что[- ]?то|чтото).{0,20}(более\s+)?(сложн|трудн|легк)/i.test(value)) return true
  if (/^(посложнее|полегче|сложнее|легче|труднее|другое задание|другой тест)(\s|$|[!.])/i.test(value)) return true
  if (/^(сложнее|легче|труднее)\s+хочу\b/i.test(value)) return true
  if (/(сложн|задач|задан|тест|хочу|дай).{0,40}\b(уровн[яюе]?\s*[abc]?\s*[12]?|level\s*[abc][12]?|b[12]|c[12])\b/i.test(value)) {
    return true
  }
  return false
}

export function refersToPassage(question: string) {
  return /(paragraph|passage|абзац|\bтекст\b|the story|the article|of the text|of the paragraph)/i.test(question)
}

export function hasReadingStimulus(text: string) {
  const source = normalizePracticeMarkup(text)
  const lead = stripPracticeTags(source.split(/<(?:btn|opt)>/i)[0] ?? '')
  return lead.split(/\n/).some((line) => {
    const value = line.replace(/[*#>_]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!value || /\?\s*$/.test(value)) return false
    if (/question\s*\d|вопрос\s*\d/i.test(value)) return false
    const words = value.split(/\s+/).filter(Boolean)
    return words.length >= 8 && /[A-Za-zÀ-ÿÄÖÜß]/.test(value)
  })
}

export function unclearQuizHint(text: string) {
  const source = normalizePracticeMarkup(text)
  if (!extractQuizAnswer(source) && extractQuizChoices(source).length < 2) return ''
  const question = quizQuestionText(source)
  const lead = stripPracticeTags(source.split(/<(?:btn|opt)>/i)[0] ?? '')
  if (/выберите нужную форму/i.test(lead) && !/_{2,}/.test(lead)) {
    return 'Неясно, какую форму вставить: нет предложения.'
  }
  if (refersToPassage(lead || question) && !hasReadingStimulus(source)) {
    return 'В задании нет самого текста: спрашивают про абзац, но абзаца нет.'
  }
  return ''
}

export function multiKeyHint(text: string) {
  const source = normalizePracticeMarkup(text)
  if (extractQuizAnswers(source).length < 2) return ''
  return quizPickMode(source) === 'all' ? 'Отметьте все верные варианты.' : 'Подойдёт любой верный вариант.'
}

export function looksLikeLeavingQuiz(userText: string, choices: string[]) {
  const text = userText.trim()
  if (!text) return false
  const payload = text.replace(/^задание\s*#?\d+\s*ответ(?:\s+[A-DА-Гa-dа-г]+)?\s*:\s*/iu, '').trim()
  if (payload && payload !== text) return looksLikeLeavingQuiz(payload, choices)
  if (/^задание\s*#?\d+\s*ответ/i.test(text)) return false
  if (choices.length >= 2 && matchesChoice(text, choices)) return false
  if (looksLikeQuizRequest(text)) return true
  if (
    /^(стоп|хватит|закончи|достаточно|без теста|давай без|не хочу|отмена|потом|позже|выйти|выход)(?:\s|$|[!.])/i.test(text)
  ) {
    return true
  }
  if (/(объясн|расскаж|почему|подожди|другая тема|как сказать|исправ|разбер|а можно|а что если)/i.test(text)) {
    return true
  }
  // смена сложности / выход из пункта (не путать с ответом-словом «сложный»)
  if (
    /(хочу|дай|дайте|сделай|нужно|можно|давай|прошу|задани|тест|квиз|уровн|level).{0,40}(сложн|легче|трудн|посложн|полегч|уровн|level\s*[abc]|\bb[12]\b|\bc[12]\b)/i.test(
      text,
    ) ||
    /(сложн|легче|трудн|посложн|полегч).{0,24}(задач|задан|тест|квиз|упражн|вопрос|уровн|провер|хочу)/i.test(text) ||
    /(что[- ]?то|чтото).{0,20}(более\s+)?(сложн|трудн|легк)/i.test(text) ||
    /^(посложнее|полегче|сложнее|легче|труднее)(\s|$|[!.])/i.test(text) ||
    /^(сложнее|легче|труднее)\s+хочу\b/i.test(text) ||
    /(не то задание|другое задание|другой вопрос|следующ\w* задан|хватит задан|закончим тест|выйти из тест)/i.test(text)
  ) {
    return true
  }
  // вопрос ученика про задание/правило — выход; перевод-вопрос («как дела?») — нет
  if (
    text.includes('?') &&
    /(почему|зачем|как сказать|как будет|что значит|это правильн|праильный|верный ли|можно ли|а можно|не понял|объясн)/i.test(text)
  ) {
    return true
  }
  if (choices.length < 2) {
    if (text.split(/\s+/).length >= 5) return true
    return false
  }
  if (text.length > 72 || text.split(/\s+/).length >= 6) return true
  return false
}
