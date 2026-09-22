/** Local Swiss German (Schweizerdeutsch) lesson — same gate pattern as ADUSO. */

const SWISS_INTENT =
  /(?:швейцарск\p{L}*\s+(?:диалект|немецк)|schweizerdeutsch|schwyzerd[uü]tsch|swiss\s+german|grüezi|gruezi|bärnd[uü]tsch|barndutsch|zürit[uü]tsch|zurituutsch|baseldytsch|walliserdeutsch)/iu

export function wantsSwissGerman(text: string) {
  const value = text.normalize('NFC')
  if (SWISS_INTENT.test(value)) return true
  if (/\bgrüezi\b|\bgruezi\b/i.test(value) && /(отлича|разниц|versus|vs\.?|сравн|чем\b|guten\s+tag)/i.test(value)) {
    return true
  }
  if (/\bvelo\b/i.test(value) && /(швейцар|schweiz|swiss|диалект|hochdeutsch)/i.test(value)) return true
  return false
}

export function wantsGrueziContrast(text: string) {
  return /grüezi|gruezi/i.test(text) && /(guten\s+tag|отлича|разниц|versus|vs\.?|сравн|чем\b)/i.test(text)
}

/** Well-known labels only — never invent canton nicknames. */
const KNOWN_SWISS_LABELS =
  /zürit[uü]tsch|zurich|zürich|bärnd[uü]tsch|bern|baseldytsch|basel|walliserdeutsch|wallis|schwyzerd[uü]tsch|schweizerdeutsch|alemann|алеманн|hochdeutsch|люцерн|luzern|st\.?\s*gallen|аргау|aargau|цюрих|берн|базел/i

const FAKE_SWISS_PLACE =
  /тюрск|тоттберг|эмили[-\s]?вегис/iu

const ALLOWED_CYRILLIC_DIALECT =
  /швейцарск|алеманнск|немецк|цюрихск|бернск|базельск|валийск|верхненемецк|литературн|стандартн|разговорн/i

/** Cyrillic *-ский dialect nicknames that are not on the allowlist. */
function inventedDialectLabel(text: string) {
  if (FAKE_SWISS_PLACE.test(text)) return true
  const labels = text.match(/[А-ЯЁа-яё]{4,}(?:ский|ская|ское|дюч|тюч)/gu) ?? []
  for (const label of labels) {
    if (ALLOWED_CYRILLIC_DIALECT.test(label)) continue
    if (KNOWN_SWISS_LABELS.test(label)) continue
    return true
  }
  return false
}

export function hasInventedSwissPlaces(text: string) {
  return inventedDialectLabel(text)
}

export function swissLessonOk(text: string) {
  const hasGreeting = /grüezi|gruezi/i.test(text)
  const hasExample = /\bvelo\b|merci\s+vilmal|adieu|\bade\b/i.test(text)
  const hasHochdeutsch = /hochdeutsch|литературн|стандартн|guten\s+tag|fahrrad/i.test(text)
  return hasGreeting && hasExample && hasHochdeutsch && !hasInventedSwissPlaces(text)
}

export function swissReplyNeedsLesson(text: string) {
  return hasInventedSwissPlaces(text) || !swissLessonOk(text)
}

export function swissGermanLesson(contrastGreeting = false) {
  const lines = [
    'Schweizerdeutsch (Schwyzerdütsch) — это не один язык, а группа алеманнских диалектов. Пишут и учат обычно на Hochdeutsch; в речи — местный диалект.',
    '',
    'Реальные региональные названия (не выдумывайте другие):',
    '- **Züritüütsch** — Цюрих',
    '- **Bärndütsch** — Берн',
    '- **Baseldytsch** — Базель',
    '- **Walliserdeutsch** — Валлис',
    '',
    'Примеры (диалект → русский; рядом Hochdeutsch, если отличается):',
    '- <ex>Grüezi</ex> <sec>здравствуйте</sec> — швейцарское приветствие; в Hochdeutsch чаще Guten Tag',
    '- <ex>Velo</ex> <sec>велосипед</sec> — в Hochdeutsch Fahrrad',
    '- <ex>merci vilmal</ex> <sec>большое спасибо</sec>',
    '- Auf Wiedersehen (Hochdeutsch) → в речи **Ade** / **Adieu**',
  ]
  if (contrastGreeting) {
    lines.push(
      '',
      '| | Schweizerdeutsch | Hochdeutsch |',
      '| --- | --- | --- |',
      '| Приветствие | **Grüezi** | **Guten Tag** |',
      '| Тон | типично для Швейцарии, устно | стандартный немецкий |',
    )
  }
  lines.push(
    '',
    'Ловушка: не называйте Schweizerdeutsch «одним швейцарским языком» и не изобретайте города или прозвища кантонов — только известные ярлыки вроде Züritüütsch / Bärndütsch.',
    '',
    'Проверьте себя: как по-швейцарски часто скажут «велосипед» — Velo или Fahrrad?',
  )
  return lines.join('\n')
}

export const SWISS_GERMAN_GLOSSARY =
  'Glossary: Schweizerdeutsch / Schwyzerdütsch / Swiss German / швейцарский диалект / швейцарский немецкий are Alemannic spoken dialects, not one uniform language. Writing/formal = Hochdeutsch. Use ONLY well-known dialect labels: Züritüütsch (Zürich), Bärndütsch (Bern), Baseldytsch (Basel), Walliserdeutsch. NEVER invent Swiss towns, canton nicknames, or fake dialect names (no Тюрский, Тоттбергский, Эмили-Вегис, etc.). Always give concrete examples with RU gloss: Grüezi (vs Guten Tag), Velo (vs Fahrrad), merci vilmal, Ade/Adieu (vs Auf Wiedersehen).'
