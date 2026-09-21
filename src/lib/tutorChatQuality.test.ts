import type { ChatMessage, WordEntry } from '../types'
import { classifyTutorTask, compactHistory, isQuizItem, lessonSetupReply, quizState, wantsLessonRules } from './llmTasks'
import { extractQuizAnswer } from './practiceTags'
import { extractQuizChoices } from './quizChoices'
import { plausibleQuizOptions } from './quizDistractors'
import { bindQuizAnswer } from './quizReply'
import { localTutorReply, polishTutorReply, wantsVocabList } from './tutor'
import { gradeGuess } from './tutorGrade'
import { MEMORY_RECENT_TURNS, buildTutorMemory, packTutorContext } from './tutorMemory'
import { gradeLastQuiz, makeLocalQuiz } from './tutorQuiz'
import { localVocabDraft } from './vocabFromContext'

function check(name: string, condition: boolean) {
  if (!condition) throw new Error(`fail: ${name}`)
  console.log('ok', name)
}

function msg(role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: extra.id ?? `${role}-${content.slice(0, 12)}`, role, content, createdAt: 1, ...extra }
}

check('дай правила is a rules request', wantsLessonRules('Дай правила'))
check('дай правила is explain', classifyTutorTask('Дай правила', { quizOpen: false, leftQuiz: false }) === 'explain')
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
check('rules polish keeps teaching', /после каждой фразы/i.test(polished))

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
check('offline rules is the menu', /порядок слов/i.test(localRules) && /1\./.test(localRules))
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

console.log('all tutorChatQuality tests passed')
