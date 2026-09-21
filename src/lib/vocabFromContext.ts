import { fold } from './normalize'
import { termKey, uniqueVocab, vocabTitleFromWish } from './tutorFile'
import type { ChatMessage, Language, VocabDraft, VocabDraftEntry } from '../types'

type VocabPair = [string, string]

const VOCAB_PACKS: { keys: RegExp; title: string; en: VocabPair[]; fr: VocabPair[]; de: VocabPair[] }[] = [
  {
    keys: /еда|food|продукт|овощ|фрукт|кухн/,
    title: 'Еда',
    en: [['apple', 'яблоко'], ['bread', 'хлеб'], ['cheese', 'сыр'], ['milk', 'молоко'], ['potato', 'картофель'], ['rice', 'рис'], ['butter', 'масло'], ['chicken', 'курица']],
    fr: [['pomme', 'яблоко'], ['pain', 'хлеб'], ['fromage', 'сыр'], ['lait', 'молоко'], ['pomme de terre', 'картофель'], ['riz', 'рис'], ['beurre', 'масло'], ['poulet', 'курица']],
    de: [['Apfel', 'яблоко'], ['Brot', 'хлеб'], ['Käse', 'сыр'], ['Milch', 'молоко'], ['Kartoffel', 'картофель'], ['Reis', 'рис'], ['Butter', 'масло'], ['Hähnchen', 'курица']],
  },
  {
    keys: /кафе|кофе|cafe|ресторан|меню|официант/,
    title: 'Кафе',
    en: [['coffee', 'кофе'], ['tea', 'чай'], ['menu', 'меню'], ['bill', 'счёт'], ['table', 'столик'], ['water', 'вода'], ['cake', 'торт'], ['please', 'пожалуйста']],
    fr: [['café', 'кофе'], ['thé', 'чай'], ['menu', 'меню'], ['addition', 'счёт'], ['table', 'столик'], ['eau', 'вода'], ['gâteau', 'торт'], ['s’il vous plaît', 'пожалуйста']],
    de: [['Kaffee', 'кофе'], ['Tee', 'чай'], ['Speisekarte', 'меню'], ['Rechnung', 'счёт'], ['Tisch', 'столик'], ['Wasser', 'вода'], ['Kuchen', 'торт'], ['bitte', 'пожалуйста']],
  },
  {
    keys: /магазин|shop|store|покуп|одежд|цена/,
    title: 'Магазин',
    en: [['shop', 'магазин'], ['price', 'цена'], ['size', 'размер'], ['bag', 'пакет'], ['cash', 'наличные'], ['card', 'карта'], ['cheap', 'дешёвый'], ['receipt', 'чек']],
    fr: [['magasin', 'магазин'], ['prix', 'цена'], ['taille', 'размер'], ['sac', 'пакет'], ['espèces', 'наличные'], ['carte', 'карта'], ['pas cher', 'дешёвый'], ['ticket', 'чек']],
    de: [['Laden', 'магазин'], ['Preis', 'цена'], ['Größe', 'размер'], ['Tüte', 'пакет'], ['Bargeld', 'наличные'], ['Karte', 'карта'], ['günstig', 'дешёвый'], ['Beleg', 'чек']],
  },
  {
    keys: /аэропорт|airport|путешеств|поездк|билет|самолёт|plane/,
    title: 'Путешествие',
    en: [['airport', 'аэропорт'], ['ticket', 'билет'], ['passport', 'паспорт'], ['flight', 'рейс'], ['luggage', 'багаж'], ['gate', 'выход'], ['delay', 'задержка'], ['seat', 'место']],
    fr: [['aéroport', 'аэропорт'], ['billet', 'билет'], ['passeport', 'паспорт'], ['vol', 'рейс'], ['bagages', 'багаж'], ['porte', 'выход'], ['retard', 'задержка'], ['siège', 'место']],
    de: [['Flughafen', 'аэропорт'], ['Ticket', 'билет'], ['Reisepass', 'паспорт'], ['Flug', 'рейс'], ['Gepäck', 'багаж'], ['Gate', 'выход'], ['Verspätung', 'задержка'], ['Sitz', 'место']],
  },
  {
    keys: /дом|home|квартир|комнат|мебел/,
    title: 'Дом',
    en: [['house', 'дом'], ['room', 'комната'], ['kitchen', 'кухня'], ['window', 'окно'], ['door', 'дверь'], ['bed', 'кровать'], ['chair', 'стул'], ['key', 'ключ']],
    fr: [['maison', 'дом'], ['chambre', 'комната'], ['cuisine', 'кухня'], ['fenêtre', 'окно'], ['porte', 'дверь'], ['lit', 'кровать'], ['chaise', 'стул'], ['clé', 'ключ']],
    de: [['Haus', 'дом'], ['Zimmer', 'комната'], ['Küche', 'кухня'], ['Fenster', 'окно'], ['Tür', 'дверь'], ['Bett', 'кровать'], ['Stuhl', 'стул'], ['Schlüssel', 'ключ']],
  },
  {
    keys: /работ|job|office|собесед/,
    title: 'Работа',
    en: [['job', 'работа'], ['office', 'офис'], ['meeting', 'встреча'], ['boss', 'начальник'], ['salary', 'зарплата'], ['email', 'письмо'], ['deadline', 'срок'], ['team', 'команда']],
    fr: [['travail', 'работа'], ['bureau', 'офис'], ['réunion', 'встреча'], ['patron', 'начальник'], ['salaire', 'зарплата'], ['e-mail', 'письмо'], ['délai', 'срок'], ['équipe', 'команда']],
    de: [['Arbeit', 'работа'], ['Büro', 'офис'], ['Besprechung', 'встреча'], ['Chef', 'начальник'], ['Gehalt', 'зарплата'], ['E-Mail', 'письмо'], ['Frist', 'срок'], ['Team', 'команда']],
  },
  {
    keys: /врач|health|здоров|больн|симптом/,
    title: 'Здоровье',
    en: [['doctor', 'врач'], ['pain', 'боль'], ['headache', 'головная боль'], ['fever', 'температура'], ['pill', 'таблетка'], ['cough', 'кашель'], ['appointment', 'приём'], ['pharmacy', 'аптека']],
    fr: [['médecin', 'врач'], ['douleur', 'боль'], ['mal de tête', 'головная боль'], ['fièvre', 'температура'], ['comprimé', 'таблетка'], ['toux', 'кашель'], ['rendez-vous', 'приём'], ['pharmacie', 'аптека']],
    de: [['Arzt', 'врач'], ['Schmerz', 'боль'], ['Kopfschmerzen', 'головная боль'], ['Fieber', 'температура'], ['Tablette', 'таблетка'], ['Husten', 'кашель'], ['Termin', 'приём'], ['Apotheke', 'аптека']],
  },
]

const PACK_TITLES = new Set(VOCAB_PACKS.map((pack) => pack.title.toLowerCase()))

export function isReferentialVocabWish(text: string) {
  const value = text.trim()
  if (!value) return false
  return (
    /(?:эт(?:и|их|о)|те|these|those)\s+(?:слов|фраз|word|phrase)/i.test(value) ||
    /из\s+(?:примера|твоего(?:\s+сообщения)?|предыдущ)/i.test(value) ||
    /которые\s+выше/i.test(value) ||
    /из\s+твоего\s+сообщения/i.test(value) ||
    /(?:above|from\s+(?:your|the)\s+(?:message|example|list))/i.test(value)
  )
}

export function isExplicitVocabTheme(wish: string) {
  if (VOCAB_PACKS.some((pack) => pack.keys.test(wish))) return true
  const named = wish.match(/(?:про|на тему|about|тема[:\s]+)\s*([^.,!?]+)/i)?.[1]?.trim() ?? ''
  if (!named) return false
  if (isReferentialVocabWish(named) || /^(эти|те|this|that|those|these)\b/i.test(named)) return false
  return named.length >= 2
}

export function previousAssistantContent(messages: ChatMessage[]) {
  for (let index = messages.length - 2; index >= 0; index -= 1) {
    const item = messages[index]
    if (item?.role === 'assistant' && item.content.trim()) return item.content
  }
  return ''
}

function unwrapPart(value: string) {
  return value
    .replace(/\*+/g, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/^[„“”«»"'‚‘’]+|[„“”«»"'‚‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function skipHeaderPair(term: string, translation: string) {
  if (!term || !translation) return true
  if (term.length > 80 || translation.length > 80) return true
  if (/^-{2,}$/.test(term) || /^-{2,}$/.test(translation)) return true
  if (/^(слово|фраза|term|phrase|de|en|fr|ru|[a-z]{2})$/i.test(term) && /^(перевод|translation|ru)$/i.test(translation)) {
    return true
  }
  return !/\p{Script=Latin}/u.test(term)
}

function collectPair(rows: VocabDraftEntry[], seen: Set<string>, termRaw: string, translationRaw: string) {
  const term = unwrapPart(termRaw)
  const translation = unwrapPart(translationRaw)
  if (skipHeaderPair(term, translation)) return
  const key = termKey(term)
  if (!key || seen.has(key) || fold(term) === fold(translation)) return
  seen.add(key)
  rows.push({ term, translation })
}

const QUOTED_PAIR =
  /[„«"“]([^„«»"“”]{1,80})[“”»"]\s*[—–−\-:]\s*[«„"“]([^«»„"“”]{1,80})[“”»"]/g

export function extractVocabEntriesFromText(text: string): VocabDraftEntry[] {
  const rows: VocabDraftEntry[] = []
  const seen = new Set<string>()
  if (!text.trim()) return rows

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const table = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/)
    const dashed = line.match(
      /^(?:[-*•]\s+|\d+[.)]\s+)?(?:\*\*)?(.+?)(?:\*\*)?\s+[—–−\-]\s+(?:\*\*)?(.+?)(?:\*\*)?$/,
    )
    const cells = table || dashed
    if (cells) {
      collectPair(rows, seen, cells[1], cells[2])
      continue
    }
    QUOTED_PAIR.lastIndex = 0
    let quoted: RegExpExecArray | null
    while ((quoted = QUOTED_PAIR.exec(line))) {
      collectPair(rows, seen, quoted[1], quoted[2])
    }
  }

  const tagged = text.matchAll(/<ex>([\s\S]*?)<\/ex>\s*<sec>([\s\S]*?)<\/sec>/gi)
  for (const match of tagged) collectPair(rows, seen, match[1], match[2])

  const mustache = text.matchAll(/\{+\s*([^|{}]+?)\s*\|\s*([^|{}]+?)\s*\}+/g)
  for (const match of mustache) collectPair(rows, seen, match[1], match[2])

  if (rows.length < 2) {
    QUOTED_PAIR.lastIndex = 0
    let quoted: RegExpExecArray | null
    while ((quoted = QUOTED_PAIR.exec(text))) {
      collectPair(rows, seen, quoted[1], quoted[2])
    }
  }

  return rows
}

export function vocabTitleFromPrior(text: string) {
  const heading = text.match(/^\s{0,3}#{1,3}\s+(.+)$/m)?.[1]
  if (heading) return unwrapPart(heading).slice(0, 40)
  if (/стартов/i.test(text)) return 'Стартовые фразы'
  if (/приветств/i.test(text)) return 'Приветствия'
  if (/фраз/i.test(text)) return 'Фразы из чата'
  return 'Слова из чата'
}

export function vocabDraftFromContext(prior: string, taken: Set<string> = new Set()): VocabDraft | null {
  const seen = new Set(taken)
  const entries: VocabDraftEntry[] = []
  for (const entry of extractVocabEntriesFromText(prior)) {
    const key = termKey(entry.term)
    if (!key || seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
  }
  if (entries.length < 2) return null
  return {
    title: vocabTitleFromPrior(prior),
    kind: 'words',
    description: 'Набор от репетитора',
    entries,
  }
}

function looksLikeInventedTitle(title: string) {
  const value = title.trim().toLowerCase()
  return !value || value === 'словарь' || PACK_TITLES.has(value)
}

export function groundVocabInContext(
  draft: VocabDraft | null,
  prior: string,
  taken: Set<string> = new Set(),
): VocabDraft | null {
  const extracted = vocabDraftFromContext(prior, taken)
  if (!draft) return extracted
  const blob = fold(prior)
  const allowed = new Set((extracted?.entries ?? []).map((entry) => termKey(entry.term)))
  const grounded = draft.entries.filter((entry) => {
    const key = termKey(entry.term)
    if (!key) return false
    return allowed.has(key) || (blob.includes(key) && key.length >= 3)
  })
  if (grounded.length >= 2) {
    const title = looksLikeInventedTitle(draft.title) ? extracted?.title || draft.title : draft.title
    return uniqueVocab({ ...draft, title, entries: grounded }, taken)
  }
  return extracted
}

export function localVocabDraft(
  language: Language,
  wish: string,
  taken: Set<string> = new Set(),
  prior = '',
): VocabDraft | null {
  if (isReferentialVocabWish(wish) && !isExplicitVocabTheme(wish)) {
    return vocabDraftFromContext(prior, taken)
  }

  const title = vocabTitleFromWish(wish)
  const pack = VOCAB_PACKS.find((item) => item.keys.test(wish))
  const preferred = pack?.[language] ?? pack?.en ?? []
  const rest = VOCAB_PACKS.flatMap((item) => (item === pack ? [] : item[language] ?? item.en))
  const entries: VocabDraft['entries'] = []
  const seen = new Set(taken)
  for (const [term, translation] of [...preferred, ...rest]) {
    const key = termKey(term)
    if (!key || seen.has(key)) continue
    seen.add(key)
    entries.push({ term, translation })
    if (entries.length >= 8) break
  }
  if (entries.length < 4) return null
  return {
    title: title || pack?.title || 'Словарь',
    kind: 'words',
    description: 'Набор от репетитора',
    entries,
  }
}
