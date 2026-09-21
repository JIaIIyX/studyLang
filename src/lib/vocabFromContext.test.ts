import { compactVocabHistory } from './llmTasks'
import {
  contextForVocab,
  extractVocabEntriesFromText,
  groundVocabInContext,
  isExplicitVocabTheme,
  isReferentialVocabWish,
  localVocabDraft,
} from './vocabFromContext'
import type { ChatMessage } from '../types'

function check(name: string, condition: boolean) {
  if (!condition) throw new Error(`fail: ${name}`)
  console.log('ok', name)
}

const prior = [
  'Начнём с простого. Вот несколько стартовых фраз:',
  '',
  '- „Guten Tag!“ – «Добрый день!»',
  '- „Wie geht es dir?“ – «Как дела?»',
  '- „Ich heiße …“ – «Меня зовут …»',
].join('\n')

const wish = 'Можешь добавить в словарь эти слова?'

check('referential these words', isReferentialVocabWish(wish))
check('referential from example', isReferentialVocabWish('добавь из примера'))
check('referential above', isReferentialVocabWish('те слова которые выше'))
check('referential your message', isReferentialVocabWish('из твоего сообщения'))
check('not referential food', !isReferentialVocabWish('слова про еду'))
check('not referential travel', !isReferentialVocabWish('20 слов про путешествия'))
check('explicit food', isExplicitVocabTheme('слова про еду'))
check('explicit travel', isExplicitVocabTheme('20 слов про путешествия'))
check('referential is not explicit', !isExplicitVocabTheme(wish))

const extracted = extractVocabEntriesFromText(prior)
const terms = extracted.map((entry) => entry.term.toLowerCase())
check('extract count', extracted.length === 3)
check('extract guten tag', terms.some((term) => term.includes('guten tag')))
check('extract wie geht', terms.some((term) => term.includes('wie geht es dir')))
check('extract ich heisse', terms.some((term) => term.includes('ich heiße') || term.includes('ich heisse')))
check(
  'extract translations',
  extracted.some((entry) => /добрый день/i.test(entry.translation ?? '')) &&
    extracted.some((entry) => /как дела/i.test(entry.translation ?? '')),
)

const tablePrior = [
  '| DE | RU |',
  '| --- | --- |',
  '| **Guten Tag** | Добрый день |',
  '| **Wie geht es dir?** | Как дела? |',
].join('\n')
const tableRows = extractVocabEntriesFromText(tablePrior)
check('table rows', tableRows.length === 2 && tableRows[0].term.includes('Guten Tag'))

const draft = localVocabDraft('de', wish, new Set(), prior)
check('referential draft exists', Boolean(draft))
check('referential not food', Boolean(draft && !draft.entries.some((entry) => /käse|milch|kartoffel|hähnchen/i.test(entry.term))))
check(
  'referential uses examples',
  Boolean(
    draft &&
      draft.entries.some((entry) => /guten tag/i.test(entry.term)) &&
      draft.entries.some((entry) => /wie geht es dir/i.test(entry.term)) &&
      draft.entries.some((entry) => /ich heiße|ich heisse/i.test(entry.term)),
  ),
)
check('referential title from source', Boolean(draft && /фраз/i.test(draft.title)))

const noPrior = localVocabDraft('de', wish, new Set(), '')
check('referential without prior does not invent pack', noPrior === null)

const food = localVocabDraft('de', 'слова про еду')
check('food pack', Boolean(food && food.entries.some((entry) => entry.term === 'Käse') && !food.entries.some((entry) => /guten tag/i.test(entry.term))))
check('food title', Boolean(food && /ед/i.test(food.title)))

const foodHallucination = {
  title: 'Еда',
  kind: 'words' as const,
  entries: [
    { term: 'Käse', translation: 'сыр' },
    { term: 'Milch', translation: 'молоко' },
    { term: 'Kartoffel', translation: 'картофель' },
    { term: 'Reis', translation: 'рис' },
  ],
}
const grounded = groundVocabInContext(foodHallucination, prior)
check(
  'grounded rejects food pack',
  Boolean(
    grounded &&
      grounded.entries.some((entry) => /guten tag/i.test(entry.term)) &&
      !grounded.entries.some((entry) => /käse|milch/i.test(entry.term)),
  ),
)

const travel = localVocabDraft('de', '20 слов про путешествия')
check('travel pack', Boolean(travel && travel.entries.some((entry) => /flughafen|ticket|reisepass/i.test(entry.term))))

const history = compactVocabHistory(
  [
    { role: 'user', text: 'Давай немецкие фразы для начала' },
    { role: 'model', text: prior },
    { role: 'user', text: wish },
  ],
  true,
)
const blob = history.map((item) => item.text).join('\n')
check('history keeps previous assistant', history.some((item) => item.role === 'model' && /guten tag/i.test(item.text)))
check('history keeps user wish', history.some((item) => item.role === 'user' && /эти слова/i.test(item.text)))
check('history keeps quoted phrases', /wie geht es dir/i.test(blob) && /ich heiße|ich heisse/i.test(blob))

const themed = compactVocabHistory([{ role: 'user', text: 'слова про еду' }], false)
check('theme history is only the wish', themed.length === 1 && themed[0]?.role === 'user' && themed[0].text === 'слова про еду')

const greetings: ChatMessage = {
  id: 'greet',
  role: 'assistant',
  content: prior,
  createdAt: 1,
}
const laterFood: ChatMessage = {
  id: 'food',
  role: 'assistant',
  content: '- **Käse** — сыр\n- **Milch** — молоко',
  createdAt: 2,
}
const withRef: ChatMessage = {
  id: 'ask',
  role: 'user',
  content: 'Можешь добавить в словарь эти слова?',
  createdAt: 3,
  refIds: ['greet'],
  refSnippet: 'Guten Tag / Wie geht es dir',
}
const refContext = contextForVocab([greetings, laterFood, withRef])
check('explicit ref ignores later-unrelated food', /guten tag/i.test(refContext) && !/käse/i.test(refContext))
const refDraft = localVocabDraft('de', withRef.content, new Set(), refContext, true)
check(
  'explicit message ref uses greetings',
  Boolean(
    refDraft &&
      refDraft.entries.some((entry) => /guten tag/i.test(entry.term)) &&
      !refDraft.entries.some((entry) => /käse|milch/i.test(entry.term)),
  ),
)
const focused = compactVocabHistory([{ role: 'user', text: 'добавь из этого' }], true, prior)
check('focused history injects referenced phrases', focused.some((item) => /guten tag/i.test(item.text)))

console.log('all vocabFromContext tests passed')

