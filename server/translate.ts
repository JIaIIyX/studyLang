function takeRussianParts(raw: string) {
  return String(raw || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/[,;/|·•]+/)
    .map((item) => item.replace(/^["«'\s]+|["»'\s]+$/g, '').trim())
    .filter(
      (item) =>
        item.length >= 2 &&
        item.length <= 80 &&
        /[а-яё]/i.test(item) &&
        !/[a-z]/i.test(item) &&
        !/query length|mymemory warning|limit/i.test(item),
    )
}

function collectVariants(rawItems: string[]) {
  const list: string[] = []
  const seen = new Set<string>()
  for (const raw of rawItems) {
    for (const item of takeRussianParts(raw)) {
      const key = item.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      list.push(item)
    }
  }
  return list
}

function cleanSentence(raw: string) {
  return String(raw || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function goodSentence(text: string, source: string, needRussian: boolean) {
  const value = cleanSentence(text)
  if (!value) return ''
  if (needRussian && !/[а-яё]/i.test(value)) return ''
  if (/query length|mymemory warning|limit/i.test(value)) return ''
  if (value.toLowerCase() === source.toLowerCase()) return ''
  return value
}

function splitChunks(text: string, max = 900) {
  if (text.length <= max) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length) {
    if (rest.length <= max) {
      parts.push(rest)
      break
    }
    const window = rest.slice(0, max)
    const cut = Math.max(
      window.lastIndexOf('\n'),
      window.lastIndexOf('. '),
      window.lastIndexOf('? '),
      window.lastIndexOf('! '),
      window.lastIndexOf(' '),
    )
    const at = cut > max * 0.4 ? cut + 1 : max
    parts.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  return parts.filter(Boolean)
}

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) return null
  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

function chromeText(data: unknown): string {
  if (typeof data === 'string') return data.trim()
  if (!Array.isArray(data) || data.length === 0) return ''
  if (typeof data[0] === 'string') return data[0].trim()
  return data.map(chromeText).filter(Boolean).join(' ').trim()
}

function googleSegments(rows: unknown) {
  const pieces: string[] = []
  const extras: string[] = []
  if (!Array.isArray(rows)) return { text: '', extras }
  const main = Array.isArray(rows[0]) ? rows[0] : []
  for (const item of main) {
    if (Array.isArray(item) && typeof item[0] === 'string') pieces.push(item[0])
  }
  const dict = Array.isArray(rows[1]) ? rows[1] : []
  for (const group of dict) {
    const alts = Array.isArray(group) ? group[1] : null
    if (!Array.isArray(alts)) continue
    for (const alt of alts.slice(0, 4)) {
      if (typeof alt === 'string') extras.push(alt)
    }
  }
  return { text: pieces.join(''), extras }
}

async function fromGoogle(text: string, source: string, target: string) {
  const pieces: string[] = []
  const extras: string[] = []
  for (const chunk of splitChunks(text)) {
    const encoded = encodeURIComponent(chunk)
    const chrome = await fetchJson(
      `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${source}&tl=${target}&q=${encoded}`,
    )
    const chromeValue = chromeText(chrome)
    if (chromeValue) {
      pieces.push(chromeValue)
      continue
    }
    for (const url of [
      `https://clients5.google.com/translate_a/single?client=dict-chrome-ex&sl=${source}&tl=${target}&dt=t&dt=bd&dt=at&q=${encoded}`,
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&dt=bd&dt=at&q=${encoded}`,
    ]) {
      const parsed = googleSegments(await fetchJson(url))
      if (parsed.text.trim()) {
        pieces.push(parsed.text)
        extras.push(...parsed.extras)
        break
      }
    }
  }
  return { text: pieces.join(' '), extras }
}

async function fromMyMemory(text: string, source: string, target: string) {
  const pieces: string[] = []
  for (const chunk of splitChunks(text, 450)) {
    const data = (await fetchJson(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${source}|${target}`,
    )) as { responseData?: { translatedText?: string; match?: number }; responseStatus?: number } | null
    if (!data || Number(data.responseStatus) >= 400) continue
    const value = cleanSentence(data.responseData?.translatedText || '')
    if (!value || /query length|mymemory warning|limit/i.test(value)) continue
    if (value.toLowerCase() === chunk.toLowerCase()) continue
    pieces.push(value)
  }
  return pieces.join(' ')
}

async function machineTranslate(text: string, source: string, target: string) {
  const google = await fromGoogle(text, source, target).catch(() => ({ text: '', extras: [] as string[] }))
  if (google.text.trim() && google.text.trim().toLowerCase() !== text.trim().toLowerCase()) return google
  const memory = await fromMyMemory(text, source, target).catch(() => '')
  return { text: memory, extras: [] as string[] }
}

export async function translateWord(word: string, language: string) {
  const source = word.trim()
  const [wiki, machine] = await Promise.all([
    fromWiktionary(source, language).catch(() => [] as string[]),
    machineTranslate(source, language, 'ru'),
  ])
  const variants = collectVariants([...wiki, machine.text, ...machine.extras])
  return { translation: variants[0] || '', variants: variants.slice(0, 8) }
}

export async function translatePhrase(text: string, language: string) {
  const source = text.trim()
  if (!source) return { translation: '' }
  const machine = await machineTranslate(source, language, 'ru')
  return { translation: goodSentence(machine.text, source, true) }
}

export async function translateIntoPractice(text: string, language: string) {
  const source = text.trim()
  if (!source) return { translation: '' }
  const machine = await machineTranslate(source, 'ru', language)
  const value = cleanSentence(machine.text)
  if (!value || value.toLowerCase() === source.toLowerCase()) return { translation: '' }
  return { translation: value }
}

function wikiTitles(word: string) {
  const trimmed = word.trim()
  const lower = trimmed.toLowerCase()
  const titled = lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : trimmed
  return [...new Set([trimmed, titled, lower])]
}

function wikiLanguageBlock(text: string, language: string) {
  const mark = `{{-${language}-`
  const start = text.indexOf(mark)
  if (start < 0) return ''
  const rest = text.slice(start)
  const next = rest.slice(mark.length).search(/=\s*\{\{-/)
  return next >= 0 ? rest.slice(0, mark.length + next) : rest
}

function wikiMeanings(section: string) {
  const sense = section.split(/====\s*Значение\s*====/)[1] || section.split(/===\s*Значение\s*===/)[1]
  if (!sense) return []
  const body = sense.split(/\n={3,}/)[0]
  return collectVariants([...body.matchAll(/\[\[([^\]|#]+)\]\]/g)].map((item) => item[1]))
}

async function wikiPage(title: string, seen = new Set<string>()): Promise<string> {
  const key = title.toLowerCase()
  if (seen.has(key) || seen.size > 2) return ''
  seen.add(key)
  const response = await fetch(
    `https://ru.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`,
    { headers: { 'User-Agent': 'StudyLang/1.0 (language-learning app)' }, signal: AbortSignal.timeout(8_000) },
  )
  if (!response.ok) return ''
  const data = (await response.json()) as { parse?: { wikitext?: { '*': string } } }
  const page = data.parse?.wikitext?.['*'] || ''
  const redirect = page.match(/^#(?:REDIRECT|перенаправление)\s*\[\[([^\]|#]+)\]\]/i)
  return redirect ? wikiPage(redirect[1], seen) : page
}

async function fromWiktionary(word: string, language: string) {
  for (const title of wikiTitles(word)) {
    const page = await wikiPage(title)
    if (!page) continue
    const meanings = wikiMeanings(wikiLanguageBlock(page, language) || page)
    if (meanings.length) return meanings
  }
  return []
}
