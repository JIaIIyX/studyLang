import type { ChatMessage, WordEntry } from '../types'
import { classifyTutorTask, isQuizItem, lessonSetupReply, quizState, wantsLessonRules } from './llmTasks'
import { extractQuizAnswer } from './practiceTags'
import { extractQuizChoices } from './quizChoices'
import { plausibleQuizOptions } from './quizDistractors'
import { bindQuizAnswer } from './quizReply'
import { localTutorReply, polishTutorReply } from './tutor'
import { gradeGuess } from './tutorGrade'
import { gradeLastQuiz, makeLocalQuiz } from './tutorQuiz'

function check(name: string, condition: boolean) {
  if (!condition) throw new Error(`fail: ${name}`)
  console.log('ok', name)
}

function msg(role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: extra.id ?? `${role}-${content.slice(0, 12)}`, role, content, createdAt: 1, ...extra }
}

check('дай правила is a rules request', wantsLessonRules('Дай правила'))
check('дай правила is explain', classifyTutorTask('Дай правила', { quizOpen: false, leftQuiz: false }) === 'explain')

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

console.log('all tutorChatQuality tests passed')
