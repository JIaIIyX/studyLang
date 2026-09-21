import type { Language, SectionKind } from '../types'

export const LANGUAGES: {
  id: Language
  label: string
  prep: string
  native: string
  flag: string
  greet: string
  swatch: string
}[] = [
  { id: 'fr', label: 'Французский', prep: 'французскому', native: 'Français', flag: '🇫🇷', greet: 'Bonjour', swatch: '#3d6b8a' },
  { id: 'de', label: 'Немецкий', prep: 'немецкому', native: 'Deutsch', flag: '🇩🇪', greet: 'Guten Tag', swatch: '#c9a227' },
  { id: 'en', label: 'Английский', prep: 'английскому', native: 'English', flag: '🇬🇧', greet: 'Hello', swatch: '#1f6f5b' },
]

export const SECTIONS: { id: SectionKind; label: string; hint: string }[] = [
  { id: 'words', label: 'Слова', hint: 'Файлы для изучения' },
  { id: 'cards', label: 'Карточки', hint: 'Запоминание слов' },
  { id: 'puzzles', label: 'Пазлы', hint: 'Соберите слово из букв' },
  { id: 'sentences', label: 'Предложения', hint: 'Соберите фразу' },
  { id: 'translations', label: 'Переводы', hint: 'Проверка перевода' },
  { id: 'matching', label: 'Сопоставление', hint: 'Свяжите слово и перевод' },
]

export function languageMeta(id: Language) {
  return LANGUAGES.find((item) => item.id === id) ?? LANGUAGES[0]
}

export function sectionMeta(id: SectionKind) {
  return SECTIONS.find((item) => item.id === id) ?? SECTIONS[0]
}
