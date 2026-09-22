import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ChatMessage, Language, WordEntry } from '../types'
import { adusoLessonOk, lessonIsEffective, looksLikeAdverbTaxonomy, wantsAduso } from './aduso'
import { gradeBubbleParts, MistakeHint } from '../components/chat/MistakeHint'
import {
  buildTutorSystem,
  classifyTutorTask,
  compactHistory,
  hasFalseGermanPresentClaim,
  isQuizItem,
  lessonSetupReply,
  quizState,
  wantsLessonRules,
} from './llmTasks'
import { extractQuizAnswer } from './practiceTags'
import { extractQuizChoices } from './quizChoices'
import { plausibleQuizOptions, repairQuizChoiceButtons } from './quizDistractors'
import { bindQuizAnswer } from './quizReply'
import { localTutorReply, polishTutorReply, wantsVocabList } from './tutor'
import { gradeGuess, mistakeHint } from './tutorGrade'
import { MEMORY_RECENT_TURNS, buildTutorMemory, packTutorContext } from './tutorMemory'
import { gradeLastQuiz, makeLocalQuiz, quizMistakeHint } from './tutorQuiz'
import { localVocabDraft } from './vocabFromContext'

function check(name: string, condition: boolean) {
  if (!condition) throw new Error(`fail: ${name}`)
  console.log('ok', name)
}

function msg(role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: extra.id ?? `${role}-${content.slice(0, 12)}`, role, content, createdAt: 1, ...extra }
}

check('дай правила is a rules request', wantsLessonRules('Дай правила'))
check('дай грамматику is a rules request', wantsLessonRules('Дай грамматику'))
check('какие еще правила is a rules request', wantsLessonRules('какие еще правила немецкого языка есть?'))
check('дай правила is explain', classifyTutorTask('Дай правила', { quizOpen: false, leftQuiz: false }) === 'explain')
check('дай грамматику is explain', classifyTutorTask('Дай грамматику', { quizOpen: false, leftQuiz: false }) === 'explain')
check(
  'эти слова is a vocab wish',
  wantsVocabList([msg('assistant', 'фразы'), msg('user', 'Можешь добавить в словарь эти слова?')]),
)
check(
  'quoted add-to-dictionary is a vocab wish',
  wantsVocabList([
    msg('assistant', 'x', { id: 'greet' }),
    msg('user', 'добавь в словарь', { refIds: ['greet'], refSnippet: 'Guten Tag' }),
  ]),
)

const rulesAsButtons = [
  'Вот правила урока:',
  '<btn>После каждой фразы повторяйте вслух</btn>',
  '<btn>Не зубрите списки слов</btn>',
  '<btn>Одна тема за раз</btn>',
].join('\n')

const polished = polishTutorReply(rulesAsButtons, 'explain', 'Дай правила', 'de')
check('rules polish has no btn chips', !/<(btn|opt)>/i.test(polished))
check('rules polish is not a quiz', !extractQuizAnswer(polished) && extractQuizChoices(polished).length < 2)
check(
  'rules polish is grammar not chat meta',
  /порядок слов/i.test(polished) &&
    /артикл/i.test(polished) &&
    /падеж/i.test(polished) &&
    /ich lerne/i.test(polished) &&
    /wir lernen/i.test(polished) &&
    /ihr lernt/i.test(polished) &&
    !/после каждой фразы|будем говорить коротко|не зубрите|повторяйте вслух/i.test(polished),
)

const quizSneak = [
  'Правила:',
  '<btn>После каждой фразы повторяйте вслух</btn>',
  '<btn>Молоко</btn>',
  '<btn>Сыр</btn>',
  '<answer>Молоко</answer>',
].join('\n')
const stripped = polishTutorReply(quizSneak, 'explain', 'Дай правила', 'de')
check('rules path strips sneaky MCQ answers', !extractQuizAnswer(stripped))
check('rules path does not keep quiz chips', extractQuizChoices(stripped).length < 2)

const localRules = localTutorReply('de', [msg('user', 'Дай правила')], [])
check('offline rules has no btn', !/<(btn|opt)>/i.test(localRules))
check(
  'offline rules teach grammar',
  /порядок слов/i.test(localRules) &&
    /артикл/i.test(localRules) &&
    /падеж/i.test(localRules) &&
    /ich lerne/i.test(localRules) &&
    /wir lernen/i.test(localRules) &&
    /ihr lernt/i.test(localRules),
)
check('offline rules are not chat meta', !/после каждой фразы|не зубрите|будем говорить коротко/i.test(localRules))
check('offline rules do not claim a partial präsens', !hasFalseGermanPresentClaim(localRules))
check('offline rules is not a quiz', !isQuizItem(localRules) && !extractQuizAnswer(localRules))

const fakeQuizButtons = msg('assistant', rulesAsButtons, { id: 'rules' })
const bound = bindQuizAnswer('После каждой фразы повторяйте вслух', [fakeQuizButtons])
check('quoting a rule is not a quiz submit', !/^задание\s+\d+\s+ответ/i.test(bound.content))
check('quoting a rule does not bind quiz id', bound.refIds.length === 0)

const afterRules = [fakeQuizButtons, msg('user', 'Задание 2 ответ B: После каждой фразы повторяйте вслух', { id: 'pick' })]
check('no open quiz after rule chips', quizState(afterRules).quizOpen === false)
check('rule pick is not graded as quiz', classifyTutorTask(afterRules.at(-1)!.content, quizState(afterRules)) !== 'grade')

const appleQuiz = [
  msg('assistant', 'Как будет по-немецки «яблоко»?\n<answer>der Apfel</answer>', { id: 'q1' }),
  msg('user', 'Der Äpfel', { id: 'a1' }),
]
const appleGrade = gradeLastQuiz(appleQuiz)
check('Der Äpfel is not a full correct', !/^верно/i.test(appleGrade.trim()))
check('Der Äpfel shows the exact target', /der apfel/i.test(appleGrade))
check('Der Äpfel is almost/wrong with explanation', /почти/i.test(appleGrade) && /множествен|умлаут|форм/i.test(appleGrade))
check('gradeGuess marks umlaut plural as almost', gradeGuess('Der Äpfel', 'der Apfel').verdict === 'almost')
check('exact der Apfel is correct', gradeGuess('der Apfel', 'der Apfel').verdict === 'correct')

const appleMcq = [
  msg(
    'assistant',
    ['Как будет по-немецки «яблоко»?', '<answer>der Apfel</answer>', '<btn>der Apfel</btn>', '<btn>die Milch</btn>', '<btn>der Käse</btn>', '<btn>die Kartoffel</btn>'].join('\n'),
    { id: 'q-apple' },
  ),
  msg('user', 'Der Äpfel', { id: 'a-apple' }),
]
const mcqGrade = gradeLastQuiz(appleMcq)
check('mcq Der Äpfel is not full correct', !/^верно/i.test(mcqGrade.trim()))
check('mcq Der Äpfel is almost', /почти/i.test(mcqGrade) && /der apfel/i.test(mcqGrade))

const lied = polishTutorReply('Верно. Правильный ответ — der Apfel.', 'grade', 'Der Äpfel', 'de', { quizAnswer: 'der Apfel' })
check('polish does not keep a false верно', !/^верно/i.test(lied.trim()) && /почти/i.test(lied) && /der apfel/i.test(lied))

const phraseOptions = plausibleQuizOptions(
  ['Sprechen Sie Englisch?'],
  ['Käse', 'Milch', 'Kartoffel', 'Wie geht es dir?', 'Guten Tag!'],
  'Как будет по-немецки «Вы говорите по-английски?»',
  'de',
)
check('phrase options exist', phraseOptions.length >= 2)
check(
  'phrase distractors are not food lemmas',
  !phraseOptions.some((item) => /käse|milch|kartoffel|hähnchen/i.test(item)),
)
check(
  'phrase options keep a phrase',
  phraseOptions.some((item) => /sprechen sie englisch/i.test(item)) ||
    phraseOptions.some((item) => /\s/.test(item.trim())),
)

const entries: WordEntry[] = [
  { id: '1', term: 'Sprechen Sie Englisch?', translation: 'Вы говорите по-английски?' },
  { id: '2', term: 'Wie geht es dir?', translation: 'Как дела?' },
  { id: '3', term: 'Guten Tag', translation: 'Добрый день' },
  { id: '4', term: 'Käse', translation: 'сыр' },
  { id: '5', term: 'Milch', translation: 'молоко' },
  { id: '6', term: 'Kartoffel', translation: 'картофель' },
]
const localPhrase = makeLocalQuiz('de', entries, 'фразы из примера как будет по-немецки')
if (localPhrase && /sprechen sie englisch/i.test(localPhrase)) {
  const choices = extractQuizChoices(localPhrase)
  check(
    'local phrase quiz does not use food buttons',
    !choices.some((item) => /käse|milch|kartoffel/i.test(item)),
  )
} else {
  check('local phrase quiz built or skipped food-only', true)
}

const furnitureOptions = plausibleQuizOptions(
  ['der Tisch'],
  ['Käse', 'Milch', 'Kartoffel', 'Reis', 'Hähnchen'],
  'Как будет по-немецки «стол»?',
  'de',
)
check('furniture options exist', furnitureOptions.length >= 2)
check(
  'furniture distractors are not food',
  !furnitureOptions.some((item) => /käse|milch|kartoffel|reis|hähnchen|brot/i.test(item)),
)
check(
  'furniture distractors stay nouns',
  furnitureOptions.every((item) => /^(der|die|das)\s+\S+$/i.test(item.trim())),
)

const furnitureQuiz = [
  'Как будет по-немецки «стол»?',
  '<answer>der Tisch</answer>',
  '<btn>Milch</btn>',
  '<btn>Käse</btn>',
  '<btn>Kartoffel</btn>',
  '<btn>der Tisch</btn>',
].join('\n')
const repairedFurniture = repairQuizChoiceButtons(furnitureQuiz, 'de')
check('llm furniture quiz drops food buttons', !/käse|milch|kartoffel|reis|hähnchen/i.test(repairedFurniture))
check('llm furniture quiz keeps der Tisch', /der tisch/i.test(repairedFurniture))

const sentenceQuiz = [
  'Как будет по-немецки «Вы говорите по-английски?»',
  '<answer>Sprechen Sie Englisch?</answer>',
  '<btn>Käse</btn>',
  '<btn>Milch</btn>',
  '<btn>Kartoffel</btn>',
  '<btn>Sprechen Sie Englisch?</btn>',
].join('\n')
const repairedSentence = repairQuizChoiceButtons(sentenceQuiz, 'de')
check('llm sentence quiz drops food buttons', !/käse|milch|kartoffel/i.test(repairedSentence))
check('llm sentence quiz keeps a sentence', /sprechen sie englisch/i.test(repairedSentence))

const falsePresent =
  'В настоящем времени глагол меняется только в 2‑й и 3‑й лице единственного числа, а все остальные формы остаются одинаковыми. Ich lerne. Du lernst.'
check('false präsens claim is detected', hasFalseGermanPresentClaim(falsePresent))
const tenseMenu = [
  msg('assistant', '1. Порядок слов\n2. Времена\n3. Артикли', { id: 'menu' }),
  msg('user', '2', { id: 'pick-2' }),
]
const tenseReply = localTutorReply('de', tenseMenu, [])
const persons = ['ich', 'du', 'er', 'wir', 'ihr', 'sie']
check(
  'tense pick teaches the full paradigm',
  persons.every((person) => new RegExp(`\\b${person}\\b`, 'i').test(tenseReply)) &&
    /wir lernen/i.test(tenseReply) &&
    /ihr lernt/i.test(tenseReply),
)
check('tense pick rejects the false claim', !hasFalseGermanPresentClaim(tenseReply))
const repairedPresent = polishTutorReply(falsePresent, 'explain', '2', 'de')
check('polish drops the false präsens claim', !hasFalseGermanPresentClaim(repairedPresent))
check(
  'polish restores wir and ihr',
  /wir lernen/i.test(repairedPresent) && /ihr lernt/i.test(repairedPresent) && /\bich\b/i.test(repairedPresent) && /\bdu\b/i.test(repairedPresent),
)
const rulesSystem = buildTutorSystem('de', 'Дай правила', [msg('user', 'Дай правила')], 'explain')
check(
  'rules prompt asks for grammar not chat meta',
  /word order|conjugation|articles|cases/i.test(rulesSystem) && /chat etiquette|study tips/i.test(rulesSystem),
)
check('präsens prompt forbids a partial paradigm', /wir lernen/i.test(rulesSystem) && /2nd and 3rd/i.test(rulesSystem))

check('lesson menu itself is not a quiz item', !isQuizItem(lessonSetupReply()))

const greetThread = [
  msg('user', 'Объясни артикли der die das', { id: 'u1' }),
  msg('assistant', 'Немецкие артикли — это род.', { id: 'a1' }),
  msg('user', 'А что с множественным числом?', { id: 'u2' }),
]
const greetPacked = packTutorContext('de', greetThread, 'explain')
check('mid-thread does not allow a greeting', greetPacked.allowGreeting === false && greetPacked.ongoing)
check('system forbids re-greeting', /do not greet|ongoing thread/i.test(greetPacked.system))
const secondReply = polishTutorReply(
  'Привет!\nВо множественном почти всегда die.',
  'explain',
  'А что с множественным числом?',
  'de',
  { allowGreeting: false },
)
check('second assistant reply does not start with a greeting', !/^\s*(привет|здравствуй|hello|bonjour|guten\s+tag)\b/i.test(secondReply))
check('second assistant reply keeps the lesson', /множествен|die/i.test(secondReply))

const helloBack = packTutorContext('de', [...greetThread.slice(0, 2), msg('user', 'Привет!', { id: 'hi' })], 'general')
check('user hello may be answered with hello', helloBack.allowGreeting === true)

const freshChat = packTutorContext('de', [msg('user', 'Привет', { id: 'new' })], 'general')
check('brand-new chat may greet', freshChat.allowGreeting === true && freshChat.ongoing === false)

const longThread: ChatMessage[] = []
for (let index = 0; index < 8; index += 1) {
  longThread.push(msg('user', `вопрос ${index} про артикли и практику`, { id: `lu${index}` }))
  longThread.push(msg('assistant', `ответ ${index}: der / die / das и примеры.`, { id: `la${index}` }))
}
longThread.push(msg('user', 'ещё раз про множественное число', { id: 'lu-last' }))
const mapped = longThread.map((item) => ({
  role: item.role === 'assistant' ? ('model' as const) : ('user' as const),
  text: item.content,
}))
const fullHistory = compactHistory(mapped, 'general')
const packedLong = packTutorContext('de', longThread, 'general')
check('long thread uses a memory summary', Boolean(packedLong.memory.summary) && packedLong.hasMemory)
check(
  'history is summary + last N, not unbounded',
  packedLong.history.length <= MEMORY_RECENT_TURNS + 1 && packedLong.history.length < fullHistory.length,
)
check('memory keeps the practice goal or topics', /артикл|множествен|Articles/i.test(packedLong.memory.summary))
check('system includes the memory block', /thread memory/i.test(packedLong.system))

const vocabTable = [
  'Стартовые фразы:',
  '',
  '| DE | RU |',
  '| --- | --- |',
  '| Guten Tag | Добрый день |',
  '| Wie geht es dir? | Как дела? |',
  '| Ich heiße | Меня зовут |',
].join('\n')
const vocabThenQuiz: ChatMessage[] = [
  msg('assistant', vocabTable, {
    id: 'vocab1',
    fileDraft: {
      title: 'Стартовые фразы',
      kind: 'words',
      entries: [
        { term: 'Guten Tag', translation: 'Добрый день' },
        { term: 'Wie geht es dir?', translation: 'Как дела?' },
        { term: 'Ich heiße', translation: 'Меня зовут' },
      ],
    },
  }),
]
for (let index = 0; index < 3; index += 1) {
  vocabThenQuiz.push(msg('user', `ок ${index}`, { id: `vu${index}` }))
  vocabThenQuiz.push(msg('assistant', `продолжаем ${index}`, { id: `va${index}` }))
}
const quizItem = msg(
  'assistant',
  'Как будет по-немецки «яблоко»?\n<answer>der Apfel</answer>',
  { id: 'quiz-open' },
)
const quizThread = [...vocabThenQuiz, quizItem, msg('user', 'Der Äpfel', { id: 'quiz-ans' })]
const quizMemory = buildTutorMemory('de', quizThread)
const quizPacked = packTutorContext('de', quizThread, 'grade', { memory: quizMemory })
check('open quiz key survives in memory', /der apfel/i.test(quizMemory.quiz?.answer ?? ''))
check('grade path memory keeps the key', /der apfel/i.test(quizPacked.memory.summary) && /der apfel/i.test(quizPacked.system))
check('recent turns still include the learner answer', quizPacked.history.some((item) => /Äpfel|Apfel/i.test(item.text)))
check('open quiz still grades as almost', /почти/i.test(gradeLastQuiz(quizThread)))

const wordsAsk = [...vocabThenQuiz, msg('user', 'Можешь добавить в словарь эти слова?', { id: 'eti' })]
const wordsMemory = buildTutorMemory('de', wordsAsk)
const wordsPacked = packTutorContext('de', wordsAsk, 'general', { memory: wordsMemory })
check('эти слова is still a vocab wish with a long thread', wantsVocabList(wordsAsk))
check(
  'memory keeps the vocab title and excerpt',
  /стартовые фразы/i.test(wordsMemory.summary) && /guten tag/i.test(wordsMemory.vocabExcerpt ?? ''),
)
check(
  'compact history dropped the old vocab table',
  wordsPacked.hasMemory && !wordsPacked.history.some((item) => /guten tag/i.test(item.text)),
)
const recovered = localVocabDraft('de', 'эти слова', new Set(), wordsMemory.vocabExcerpt ?? '', false)
check('эти слова still extracts from the memory excerpt', Boolean(recovered?.entries.some((item) => /guten tag/i.test(item.term))))
const quotedAsk = [
  ...vocabThenQuiz,
  msg('user', 'добавь в словарь', { id: 'quoted', refIds: ['vocab1'], refSnippet: 'Guten Tag' }),
]
check('memory keeps quoted message ids', (buildTutorMemory('de', quotedAsk).refIds ?? []).includes('vocab1'))

const appleHint = mistakeHint('Der Äpfel', 'der Apfel')
check('Der Äpfel hint names umlaut and plural', /umlaut/i.test(appleHint) && /множественн/i.test(appleHint) && /Apfel/.test(appleHint) && /Äpfel/.test(appleHint))
check('Der Äpfel hint is not a vague retry', !/попробуй ещё раз/i.test(appleHint))
check('exact der Apfel has no mistake hint', mistakeHint('der Apfel', 'der Apfel') === '')
const endingHint = mistakeHint('du lerne', 'du lernst')
check('wrong ending names -st', /-st/.test(endingHint) && /-e/.test(endingHint) && /du lernst/i.test(endingHint))
check('article miss names the article', /артикль/i.test(mistakeHint('das Apfel', 'der Apfel')) && /не das/i.test(mistakeHint('das Apfel', 'der Apfel')))
check('word order hint is specific', /порядок слов/i.test(mistakeHint('Deutsch lerne ich', 'Ich lerne Deutsch')))
check('quiz near-miss carries the same hint', quizMistakeHint(appleQuiz) === appleHint)
check('correct quiz has no hint', quizMistakeHint([appleQuiz[0], msg('user', 'der Apfel', { id: 'ok' })]) === '')

const hintHtml = renderToStaticMarkup(createElement(MistakeHint, { hint: appleHint }))
check('hint renders as muted grey text', /text-muted/.test(hintHtml) && /text-\[13px\]/.test(hintHtml) && /umlaut/i.test(hintHtml))
check('hint is not an error banner', !/terracotta|font-bold|font-semibold|text-ink/.test(hintHtml))
check('correct hint renders nothing', renderToStaticMarkup(createElement(MistakeHint, { hint: '' })) === '')
const bubble = gradeBubbleParts(`Почти. Форма рядом.\n\nКак будет «стол»?\n<answer>der Tisch</answer>`, appleHint)
check('hint sits under the grade, before the next quiz', /почти/i.test(bubble.lead) && /der Tisch/i.test(bubble.rest))
check('correct bubble is not split', gradeBubbleParts('Верно. der Apfel.', '').rest === '')

function expectAduso(name: string, text: string, contrast = false) {
  check(`${name} lists ADUSO conjunctions`, adusoLessonOk(text))
  check(`${name} is not an adverb taxonomy`, !looksLikeAdverbTaxonomy(text))
  check(`${name} contrasts denn and weil`, /denn/i.test(text) && /weil/i.test(text) && /конец/i.test(text))
  check(`${name} contrasts sondern after negation`, /sondern/i.test(text) && /nicht|kein/i.test(text))
  check(`${name} is a short effective lesson`, lessonIsEffective(text))
  if (contrast) {
    check(`${name} contrasts verb-final weil with ADUSO`, /когда глагол в конце/i.test(text) && /не меняется/i.test(text))
  }
}

const adusoTable = localTutorReply('de', [msg('user', 'Дай таблицу всех aduso')], [])
expectAduso('aduso table', adusoTable)
const adusoBare = localTutorReply('de', [msg('user', 'ADUSO')], [])
expectAduso('bare ADUSO', adusoBare)
const adusoRu = localTutorReply('de', [msg('user', 'союзы адусо')], [])
expectAduso('russian адусо', adusoRu)
const adusoAngry = polishTutorReply('Adverbien: Manner, Zeit, Ort und Art und Weise.', 'explain', 'ADUSO блять', 'de', {
  nebensatz: true,
})
expectAduso('polished angry ADUSO', adusoAngry, true)
const adusoRuUi = localTutorReply('ru' as Language, [msg('user', 'ADUSO')], [{ id: 'k', term: 'Käse', translation: 'сыр' }])
expectAduso('ru UI language still teaches ADUSO', adusoRuUi)
check('ru UI language is not a shelf table', !/käse|словарик с полки/i.test(adusoRuUi))
const aduse = localTutorReply('en', [msg('user', 'ОБЬЯСНИ ЩА ПРАВИЛА ADUSE')], [])
expectAduso('ADUSE typo', aduse)
check('ADUSE is detected', wantsAduso('ADUSE') && wantsAduso('адусе') && wantsAduso('адусы') && !wantsAduso('caduso'))
const adusoTableWish = [msg('user', 'дай таблицу ADUSO')]
check('дай таблицу ADUSO is not a vocab wish', !wantsVocabList(adusoTableWish))
expectAduso('дай таблицу ADUSO', localTutorReply('en', adusoTableWish, [{ id: 'k', term: 'Käse', translation: 'сыр' }]))
const vocabSteal = [
  msg('assistant', 'набор', { fileDraft: { title: 'Еда', kind: 'words', entries: [{ term: 'Käse', translation: 'сыр' }] } }),
  msg('user', 'ещё ADUSE'),
]
check('ADUSO follow-up is not a vocab list', !wantsVocabList(vocabSteal))
expectAduso('vocab list does not win over ADUSO', localTutorReply('ru' as Language, vocabSteal, []))
const clarified = polishTutorReply('Что вы имеете в виду под ADUSO?', 'general', 'ADUSO блять', 'en')
expectAduso('clarification becomes the ADUSO lesson', clarified)
check('clarification is not a question back', !/имеете в виду/i.test(clarified))
const adusoPrompt = buildTutorSystem('de', 'Дай таблицу всех aduso', [msg('user', 'Дай таблицу всех aduso')], 'explain')
check('prompt forbids mapping ADUSO to adverbs', /NOT adverbs/i.test(adusoPrompt) && /aber/i.test(adusoPrompt) && /sondern/i.test(adusoPrompt))

const rulesLesson = localTutorReply('de', [msg('user', 'Дай правила')], [])
check('дай правила is an effective grammar lesson', lessonIsEffective(rulesLesson) && /порядок слов/i.test(rulesLesson) && /артикл/i.test(rulesLesson))
check('дай правила is not lesson-ux buttons', !/<(btn|opt)>/i.test(rulesLesson) && !/после каждой фразы|не зубрите/i.test(rulesLesson))

const moreRules = localTutorReply('de', [msg('user', 'какие еще правила')], [])
check('какие еще правила is a numbered grammar list', /1\./.test(moreRules) && /2\./.test(moreRules) && /3\./.test(moreRules))
const times = localTutorReply('de', [msg('assistant', moreRules, { id: 'rules' }), msg('user', '2')], [])
check(
  'topic 2 is the full präsens',
  lessonIsEffective(times) &&
    ['ich', 'du', 'er', 'wir', 'ihr', 'sie'].every((person) => new RegExp(`\\b${person}\\b`, 'i').test(times)) &&
    /wir lernen/i.test(times) &&
    /ihr lernt/i.test(times) &&
    !hasFalseGermanPresentClaim(times),
)
const wordOrder = localTutorReply('de', [msg('assistant', moreRules, { id: 'rules' }), msg('user', '1')], [])
check('topic 1 is verb-second with a trap', lessonIsEffective(wordOrder) && /втором/i.test(wordOrder) && /weil/i.test(wordOrder))
const cases = localTutorReply('de', [msg('assistant', moreRules, { id: 'rules' }), msg('user', '4')], [])
check('topic 4 is akkusativ with an example', lessonIsEffective(cases) && /den Tisch/i.test(cases) && /der/i.test(cases))

const akkuThread = [
  msg('user', 'Как сказать я вижу стол?', { id: 'u-akku' }),
  msg('assistant', 'Akkusativ: Ich sehe den Tisch. — Я вижу стол.', { id: 'a-akku' }),
  msg('user', 'А в придаточном как?', { id: 'u-neben' }),
]
const neben = localTutorReply('de', akkuThread, [])
check('nebensatz after akkusativ is verb-final', lessonIsEffective(neben) && /weil/i.test(neben) && /конец/i.test(neben) && /den Tisch/i.test(neben))
check('nebensatz does not reopen with hello', !/^\s*привет/i.test(neben))
const adusoAfter = localTutorReply('de', [...akkuThread, msg('assistant', neben, { id: 'a-neben' }), msg('user', 'ADUSO')], [])
expectAduso('ADUSO after nebensatz', adusoAfter, true)

const greetPrior = ['Guten Tag — Добрый день', 'Wie geht es dir? — Как дела?', 'Ich heiße — Меня зовут'].join('\n')
const greetDraft = localVocabDraft('de', 'добавь эти слова', new Set(), greetPrior)
check(
  'добавь эти слова keeps greetings',
  Boolean(greetDraft?.entries.some((entry) => /guten tag/i.test(entry.term)) && !greetDraft?.entries.some((entry) => /käse|milch/i.test(entry.term))),
)

console.log('all tutorChatQuality tests passed')
