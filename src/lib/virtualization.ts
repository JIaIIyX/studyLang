import type { Language, Virtualization } from '../types'

export const SCENE_PRESETS: { sphere: string; backstory: string }[] = [
  { sphere: 'Кафе', backstory: 'Я зашёл в маленькое кафе. Напротив — бариста. Хочу заказать напиток и что-то поесть.' },
  { sphere: 'Отель', backstory: 'Я заселяюсь. На стойке администратор. Бронь есть, но всплыла мелочь.' },
  { sphere: 'Собеседование', backstory: 'Я кандидат, напротив HR. Короткая беседа о работе.' },
  { sphere: 'Врач', backstory: 'Я на приёме. Нужно описать, что беспокоит.' },
  { sphere: 'Магазин', backstory: 'Я в магазине, напротив продавец. Ищу вещь, спрашиваю размер и цену.' },
  { sphere: 'Аэропорт', backstory: 'Я у стойки регистрации. Паспорт, багаж, куда идти на выход.' },
  { sphere: 'Знакомство', backstory: 'Вечеринка у общих друзей. Рядом новый человек, болтаем ни о чём.' },
]

export function sceneIsOn(scene?: Virtualization | null) {
  return Boolean(scene?.sphere.trim() || scene?.backstory.trim())
}

export type PartnerPersona = {
  name: string
  role: string
  hello: string
  label?: string
}

export type SceneCast = {
  student: string
  partner: string
}

function clipRole(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 120)
}

export function sceneCast(scene?: Virtualization | null): SceneCast | null {
  const text = scene?.backstory.trim() || ''
  if (!text) return null
  const student = text.match(/(?:^|[.!?…]\s*)я\s+(?:как\s+)?(.+?)(?=\s*(?:[.!?]|\s+ты\b|\s+вы\b|$))/i)
  const partner = text.match(/(?:^|[.!?…]\s*)(?:ты|вы)\s+(?:как\s+)?(.+?)(?=\s*[.!?…]|$)/i)
  const me = clipRole(student?.[1] ?? '')
  const you = clipRole(partner?.[1] ?? '')
  const namedJob = /бармен|бариста|официант|продавец|врач|доктор|администратор|рецепци|учитель|водитель|покупател|клиент|гость|кандидат/.test(
    me.toLowerCase(),
  )
  if (!you && !namedJob) return null
  return { student: me, partner: you }
}

const PEOPLE: Record<string, Record<Language, PartnerPersona>> = {
  Кафе: {
    en: { name: 'Sam', role: 'a barista in a small café', hello: 'Hey — what can I get you?' },
    fr: { name: 'Léa', role: 'une serveuse dans un petit café', hello: 'Salut, je vous écoute ?' },
    de: { name: 'Jonas', role: 'ein Kellner in einem kleinen Café', hello: 'Hey, was darf’s denn sein?' },
  },
  Отель: {
    en: { name: 'Maya', role: 'the person at the hotel desk', hello: 'Hi, checking in?' },
    fr: { name: 'Inès', role: 'la réceptionniste', hello: 'Bonjour, vous avez une réservation ?' },
    de: { name: 'Lina', role: 'die Rezeptionistin', hello: 'Hallo, Sie wollen einchecken?' },
  },
  Собеседование: {
    en: { name: 'Chris', role: 'someone from HR', hello: 'Hey, thanks for coming — shall we jump in?' },
    fr: { name: 'Noah', role: 'quelqu’un des RH', hello: 'Salut, merci d’être venu. On y va ?' },
    de: { name: 'Mira', role: 'jemand aus dem HR', hello: 'Hey, schön dass Sie da sind. Legen wir los?' },
  },
  Врач: {
    en: { name: 'Dr Hale', role: 'a GP in a clinic', hello: 'Hi, what’s going on today?' },
    fr: { name: 'Dr Morel', role: 'un médecin', hello: 'Bonjour, qu’est-ce qui vous amène ?' },
    de: { name: 'Dr Berg', role: 'eine Ärztin', hello: 'Hallo, was führt Sie her?' },
  },
  Магазин: {
    en: { name: 'Jo', role: 'a shop assistant', hello: 'Hey, looking for anything?' },
    fr: { name: 'Camille', role: 'une vendeuse', hello: 'Salut, vous cherchez quelque chose ?' },
    de: { name: 'Ben', role: 'ein Verkäufer', hello: 'Hey, suchen Sie was Bestimmtes?' },
  },
  Аэропорт: {
    en: { name: 'Priya', role: 'someone at the check-in desk', hello: 'Hi, passport and booking?' },
    fr: { name: 'Hugo', role: 'un agent d’enregistrement', hello: 'Bonjour, passeport et réservation ?' },
    de: { name: 'Eva', role: 'jemand am Check-in', hello: 'Hallo, Reisepass und Buchung?' },
  },
  Знакомство: {
    en: { name: 'Riley', role: 'someone they just met at a party', hello: 'Hey — I don’t think we’ve met yet.' },
    fr: { name: 'Milo', role: 'quelqu’un qu’on vient de croiser', hello: 'Salut, on ne se connaît pas, non ?' },
    de: { name: 'Tara', role: 'jemand Neues auf der Party', hello: 'Hey, wir kennen uns noch nicht, oder?' },
  },
}

const CASUAL: Record<Language, PartnerPersona> = {
  en: { name: 'Alex', role: 'just a person texting', hello: "Hey, how's it going?" },
  fr: { name: 'Alex', role: 'juste quelqu’un qui discute', hello: 'Salut, ça va ?' },
  de: { name: 'Alex', role: 'einfach jemand zum Reden', hello: 'Hey, wie geht’s?' },
}

const SPHERE_HINTS: { id: string; keys: RegExp }[] = [
  { id: 'Кафе', keys: /кафе|cafe|coffee shop|бариста|кофейн/i },
  { id: 'Отель', keys: /отел|hotel|рецепци/i },
  { id: 'Собеседование', keys: /собеседован|job interview|ваканси/i },
  { id: 'Врач', keys: /врач|доктор|clinic|больниц|терапевт/i },
  { id: 'Магазин', keys: /магазин|shop assistant|продавец/i },
  { id: 'Аэропорт', keys: /аэропорт|airport|check-?in/i },
  { id: 'Знакомство', keys: /знакомств|вечеринк/i },
]

function textHasPresetName(text: string, name: string) {
  return new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)
}

export function matchSpherePreset(scene?: Virtualization | null): string {
  const sphere = scene?.sphere.trim() || ''
  if (PEOPLE[sphere]) return sphere
  for (const name of Object.keys(PEOPLE)) {
    if (textHasPresetName(sphere, name)) return name
  }
  for (const hint of SPHERE_HINTS) {
    if (hint.keys.test(sphere)) return hint.id
  }
  const backstory = scene?.backstory.trim() || ''
  for (const name of Object.keys(PEOPLE)) {
    if (textHasPresetName(backstory, name)) return name
  }
  return ''
}

function customHello(language: Language, sphere: string) {
  if (language === 'fr') return sphere ? 'Salut, je vous écoute.' : 'Salut, ça va ?'
  if (language === 'de') return sphere ? 'Hey, worum geht’s?' : 'Hey, wie geht’s?'
  return sphere ? 'Hey — what’s up?' : "Hey, how's it going?"
}

function greetingForCast(language: Language, cast: SceneCast, backstory: string) {
  const partner = cast.partner.toLowerCase()
  const mood = `${partner} ${backstory}`.toLowerCase()
  const customer = /покупател|клиент|гость|customer|client/.test(partner)
  const unhappy = /недоволен|невкусн|плох|жалоб|awful|nasty|gross|schlecht/.test(mood)
  if (customer && unhappy) {
    if (language === 'fr') return 'Euh… c’est vraiment pas bon.'
    if (language === 'de') return 'Äh… das schmeckt nicht.'
    return 'Uh… this doesn’t taste right.'
  }
  if (customer) {
    if (language === 'fr') return 'Euh, excusez-moi…'
    if (language === 'de') return 'Äh, entschuldigung…'
    return 'Hey, excuse me…'
  }
  return customHello(language, '')
}

export function partnerPersona(language: Language, scene?: Virtualization | null): PartnerPersona {
  const cast = sceneCast(scene)
  const sphere = scene?.sphere.trim() || ''
  const backstory = scene?.backstory.trim() || ''
  if (cast) {
    const you = cast.partner || 'whoever «ты» is in the situation — never «я»'
    return {
      ...CASUAL[language],
      role: `«ты» in the situation: ${you}. The student is «я»${cast.student ? `: ${cast.student}` : ''}. Do not swap these roles.`,
      hello: greetingForCast(language, cast, backstory),
      label: cast.partner || undefined,
    }
  }
  const preset = matchSpherePreset(scene)
  if (preset && PEOPLE[sphere]) return PEOPLE[preset][language]
  if (preset) {
    const stock = PEOPLE[preset][language]
    return {
      ...stock,
      role: sphere
        ? `the other person in «${sphere}» — stay that person, not a generic extra`
        : stock.role,
    }
  }
  if (sphere || backstory) {
    return {
      name: CASUAL[language].name,
      role: sphere
        ? `exactly the other person in «${sphere}», as the student’s situation describes`
        : 'exactly the other person in the student’s situation — no other role',
      hello: customHello(language, sphere),
    }
  }
  return CASUAL[language]
}

export function partnerSceneBlock(language: Language, scene?: Virtualization | null) {
  const who = partnerPersona(language, scene)
  const cast = sceneCast(scene)
  const sphere = scene?.sphere.trim() || ''
  const backstory = scene?.backstory.trim() || ''
  if (!sphere && !backstory) {
    return 'VIRTUALIZATION IS EMPTY. You are just a person texting. Do not invent a café, shop, airport, hospital, classroom, or any other place.'
  }
  return [
    'LOCKED VIRTUALIZATION — these settings are the only reality. Follow them exactly. Do not change, expand, soften, or leave them.',
    cast
      ? [
          'ROLES ARE LOCKED. Never invert them. Never use a default café script (you barista, they customer) unless the text says that.',
          `«я» = the human student typing. They are: ${cast.student || 'the other person in the situation'}.`,
          `«ты» / «вы» = YOU. You are: ${cast.partner || 'whoever is not «я»'}.`,
          'You never speak as «я». You never treat the student as the customer if they wrote that they are staff (бармен, бариста, продавец).',
        ].join('\n')
      : `You are ONLY ${who.name}, ${who.role}. The student is «я» in the situation. Do not steal their role.`,
    sphere
      ? `Place (сфера), verbatim: «${sphere}». You are physically here and nowhere else.`
      : 'No place name — stay only inside the situation below. Do not pick a default café or shop.',
    backstory
      ? `Situation (предыстория), verbatim. Live it. Do not quote it. Do not rewrite it. Do not add facts that are not here:\n«${backstory}»`
      : 'No backstory — stay only in the place above. Do not invent a plot.',
    'If earlier chat lines contradict these settings, the settings win. Do not continue a wrong place, job, or plot.',
    'If they drift, answer as this person and pull the talk back into this scene. Do not follow them to another location.',
    'Keep talking inside this scene until they clearly leave. Always give them a reason to reply.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function sceneLine(scene?: Virtualization | null, options?: { replyLang?: 'practice' | 'ru'; explain?: boolean }) {
  if (!sceneIsOn(scene)) return ''
  const sphere = scene?.sphere.trim()
  const backstory = scene?.backstory.trim()
  const place = [sphere && `Setting: ${sphere}.`, backstory && `Backstory: ${backstory}`].filter(Boolean).join(' ')
  if (options?.explain) {
    return `A scene is on, but this is an explanation, not a live line. ${place} Example sentences stay in the practice language.`
  }
  if (options?.replyLang === 'ru') {
    return `Live scene, not a lesson. ${place} Short spoken lines in Russian. Not a teacher.`
  }
  return `Live scene, not a lesson. ${place} Short spoken lines in the practice language. Russian only for a translation or if they drop out of role.`
}

export function isPartnerMessage(message: { channel?: 'tutor' | 'partner' }) {
  return message.channel === 'partner'
}
