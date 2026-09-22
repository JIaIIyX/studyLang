import type { ChatMessage } from '../types'

const ADUSO_TOKEN = /(?:^|[^\p{L}\p{N}])(?:adus[oe]|адус[оаеуы])(?![\p{L}\p{N}])/iu

export function wantsAduso(text: string) {
  return ADUSO_TOKEN.test(text.normalize('NFC'))
}

export function asksWhatAdusoMeans(text: string) {
  return (
    /(?:что\s+(?:вы|ты)\s+имеете\s+в\s+виду|что\s+(?:такое|значит)|what\s+(?:do\s+you|does\s+\w+\s+)?mean|уточн(?:ите|и))/iu.test(
      text,
    ) && /adus|адус/i.test(text)
  )
}

export function adusoReplyNeedsLesson(text: string) {
  return asksWhatAdusoMeans(text) || looksLikeAdverbTaxonomy(text) || !adusoLessonOk(text)
}

export function wantsNebensatz(text: string) {
  return /придаточн|nebensatz|neben\s*satz|глагол.{0,20}в\s+конец/i.test(text)
}

export function mentionsNebensatz(text: string) {
  return /придаточн|nebensatz|\bweil\b|\bdass\b|\bwenn\b|\bob\b|глагол.{0,30}конец/i.test(text)
}

export function threadMentionsNebensatz(messages: Pick<ChatMessage, 'content'>[]) {
  return mentionsNebensatz(messages.map((item) => item.content).join('\n'))
}

export function looksLikeAdverbTaxonomy(text: string) {
  return /adverbien|\badverbs?\b|manner|zeit\s*(?:und|\/|,)\s*ort|наречия\s+(?:времени|места|образа)|образа\s+действия/i.test(
    text,
  )
}

export function adusoLessonOk(text: string) {
  return (
    /aber/i.test(text) &&
    /denn/i.test(text) &&
    /\bund\b/i.test(text) &&
    /sondern/i.test(text) &&
    /oder/i.test(text) &&
    !looksLikeAdverbTaxonomy(text)
  )
}

export function lessonIsEffective(text: string) {
  const example = /<ex>[\s\S]+?<\/ex>/i.test(text) && /<sec>[\s\S]+?<\/sec>/i.test(text)
  const trap = /ловушк|нельзя|только после|не как weil|в конец/i.test(text)
  const practice = /проверьте себя/i.test(text) && /\?/.test(text)
  const meta = /после каждой фразы|не зубрите|будем говорить коротко|повторяйте вслух/i.test(text)
  const hello = /^\s*(привет|здравствуй)/i.test(text.trim())
  return example && trap && practice && !meta && !hello
}

export function adusoLesson(contrastNebensatz = false) {
  const lines = [
    'ADUSO — пять сочинительных союзов. Они стоят на позиции 0 и соединяют два главных предложения: с обеих сторон глагол остаётся вторым.',
    '',
    '| Союз | Значение | Порядок слов | Пример |',
    '| --- | --- | --- | --- |',
    '| **aber** | но | глагол 2-й | Ich bin müde, aber ich lerne. — Я устал, но я учусь. |',
    '| **denn** | потому что / так как | глагол 2-й, не как weil | Ich lerne, denn ich habe Zeit. — Я учусь, потому что у меня есть время. |',
    '| **und** | и | глагол 2-й | Ich lerne und ich lese. — Я учусь, и я читаю. |',
    '| **sondern** | а / а наоборот | только после nicht/kein | Ich trinke keinen Kaffee, sondern Tee. — Я пью не кофе, а чай. |',
    '| **oder** | или | глагол 2-й | Lernen wir oder gehen wir? — Мы учимся или идём? |',
    '',
    '<ex>Ich lerne Deutsch, denn ich habe Zeit.</ex> <sec>Я учу немецкий: у меня есть время.</sec>',
    '',
    'Ловушка: denn не меняет порядок, а weil отправляет глагол в конец — Ich lerne Deutsch, weil ich Zeit habe.',
    'Ловушка: sondern только после отрицания (nicht/kein). После обычного утверждения берите aber.',
  ]
  if (contrastNebensatz) {
    lines.push(
      '',
      'Когда глагол в конце (weil, dass, wenn, ob) — это придаточное. Когда порядок не меняется — это ADUSO.',
    )
  }
  lines.push('', 'Проверьте себя: Ich bleibe hier, ___ ich müde bin. Здесь weil или denn?')
  return lines.join('\n')
}

export function nebensatzLesson(prior = '') {
  const fromAkkusativ = /akkusativ|den tisch|винительн|я вижу стол/i.test(prior)
  const example = fromAkkusativ
    ? ['Ich sehe den Tisch, weil er neu ist.', 'Я вижу стол: он новый.']
    : ['Ich bleibe zu Hause, weil ich müde bin.', 'Я остаюсь дома: я устал.']
  const trap = fromAkkusativ
    ? 'Ловушка: нельзя оставить глагол вторым (*weil er ist neu). С ADUSO порядок не меняется: Ich sehe den Tisch, denn er ist neu.'
    : 'Ловушка: нельзя оставить глагол вторым (*weil ich bin müde). С denn из ADUSO порядок не меняется: Ich bleibe zu Hause, denn ich bin müde.'
  return [
    'В придаточном (weil, dass, wenn, ob) спрягаемый глагол уходит в конец.',
    '',
    `<ex>${example[0]}</ex> <sec>${example[1]}</sec>`,
    '',
    trap,
    '',
    'Проверьте себя: куда поставить bin в «Ich lerne, weil ich müde ___»?',
  ].join('\n')
}

export const ADUSO_GLOSSARY =
  'Glossary: ADUSO / ADUSE / адусо / адусе / адузо is NOT adverbs and NOT Manner/Zeit/Ort. It is five coordinating conjunctions: aber (but), denn (because; verb stays 2nd, unlike weil), und (and), sondern (but rather, only after nicht/kein), oder (or). They take position 0 and keep verb-second in BOTH main clauses. After weil/dass/wenn/ob the verb goes to the end. Never ask what ADUSO means. Never answer ADUSO with Adverbien.'
