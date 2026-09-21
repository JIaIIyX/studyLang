import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'

const ChatPage = lazy(() => import('./pages/ChatPage').then((mod) => ({ default: mod.ChatPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((mod) => ({ default: mod.AnalyticsPage })))
const HomeworkPage = lazy(() => import('./pages/HomeworkPage').then((mod) => ({ default: mod.HomeworkPage })))
const WordsPage = lazy(() => import('./pages/WordsPage').then((mod) => ({ default: mod.WordsPage })))
const IgnorePage = lazy(() => import('./pages/IgnorePage').then((mod) => ({ default: mod.IgnorePage })))
const CardsPage = lazy(() => import('./pages/CardsPage').then((mod) => ({ default: mod.CardsPage })))
const PuzzlesPage = lazy(() => import('./pages/PuzzlesPage').then((mod) => ({ default: mod.PuzzlesPage })))
const SentencesPage = lazy(() => import('./pages/SentencesPage').then((mod) => ({ default: mod.SentencesPage })))
const TranslationsPage = lazy(() =>
  import('./pages/TranslationsPage').then((mod) => ({ default: mod.TranslationsPage })),
)
const MatchingPage = lazy(() => import('./pages/MatchingPage').then((mod) => ({ default: mod.MatchingPage })))

function PageFallback() {
  return <div className="flex flex-1 items-center justify-center px-4 py-16 text-sm text-muted">Загрузка…</div>
}

export function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<ChatPage />} />
          <Route path="c/:chatId" element={<ChatPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="homework" element={<HomeworkPage />} />
          <Route path="homework/:sheetId" element={<HomeworkPage />} />
          <Route path="words" element={<WordsPage />} />
          <Route path="ignore" element={<IgnorePage />} />
          <Route path="cards" element={<CardsPage />} />
          <Route path="cards/:fileId" element={<CardsPage />} />
          <Route path="puzzles" element={<PuzzlesPage />} />
          <Route path="puzzles/:fileId" element={<PuzzlesPage />} />
          <Route path="sentences" element={<SentencesPage />} />
          <Route path="sentences/:fileId" element={<SentencesPage />} />
          <Route path="translations" element={<TranslationsPage />} />
          <Route path="translations/:fileId" element={<TranslationsPage />} />
          <Route path="matching" element={<MatchingPage />} />
          <Route path="matching/:fileId" element={<MatchingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
