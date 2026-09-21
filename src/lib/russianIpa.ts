const CONSONANTS: Record<string, string> = {
  б: 'b',
  в: 'v',
  г: 'ɡ',
  д: 'd',
  ж: 'ʐ',
  з: 'z',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  ф: 'f',
  х: 'x',
  ц: 'ts',
  ч: 'tɕ',
  ш: 'ʂ',
  щ: 'ɕː',
  й: 'j',
}

const VOWELS: Record<string, string> = {
  а: 'a',
  о: 'o',
  у: 'u',
  ы: 'ɨ',
  э: 'ɛ',
  и: 'i',
}

const IOTATED: Record<string, { alone: string; after: string }> = {
  е: { alone: 'je', after: 'e' },
  ё: { alone: 'jo', after: 'o' },
  ю: { alone: 'ju', after: 'u' },
  я: { alone: 'ja', after: 'a' },
}

const HARD = new Set(['ж', 'ш', 'ц'])
const SOFT = new Set(['ч', 'щ', 'й'])

function isLetter(ch: string) {
  return Boolean(CONSONANTS[ch] || VOWELS[ch] || IOTATED[ch] || ch === 'ь' || ch === 'ъ')
}

function isVowel(ch: string) {
  return Boolean(VOWELS[ch] || IOTATED[ch])
}

function palatalize(parts: string[]) {
  const last = parts.at(-1)
  if (!last || last.endsWith('ʲ') || last === 'j' || last === 'ʐ' || last === 'ʂ' || last === 'ts' || last === 'tɕ' || last === 'ɕː') {
    return
  }
  parts[parts.length - 1] = `${last}ʲ`
}

function wordToIpa(word: string): string {
  const chars = Array.from(word.toLowerCase())
  const out: string[] = []

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]
    const prev = chars[i - 1]
    const next = chars[i + 1]

    if (ch === 'ь') {
      palatalize(out)
      continue
    }
    if (ch === 'ъ') continue

    if (IOTATED[ch]) {
      const afterConsonant = Boolean(prev && CONSONANTS[prev] && prev !== 'й')
      if (afterConsonant && !HARD.has(prev)) palatalize(out)
      out.push(afterConsonant ? IOTATED[ch].after : IOTATED[ch].alone)
      continue
    }

    if (ch === 'и') {
      if (prev && CONSONANTS[prev] && !HARD.has(prev) && !SOFT.has(prev)) palatalize(out)
      out.push('i')
      continue
    }

    if (VOWELS[ch]) {
      out.push(VOWELS[ch])
      continue
    }

    if (CONSONANTS[ch]) {
      out.push(CONSONANTS[ch])
      if (SOFT.has(ch) && next && (isVowel(next) || next === 'ь')) {
        /* already palatal in the symbol */
      }
      continue
    }

    out.push(ch)
  }

  return out.join('')
}

export function russianIpa(text: string): string {
  const source = text.trim()
  if (!source || !/[а-яё]/i.test(source)) return ''

  return source
    .split(/(\s+|\/)/)
    .map((part) => {
      if (!/[а-яё]/i.test(part)) return part
      return part
        .split(/(-)/)
        .map((chunk) => (isLetter(chunk[0]?.toLowerCase() ?? '') ? wordToIpa(chunk) : chunk))
        .join('')
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}
