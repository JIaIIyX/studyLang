import { useState } from 'react'

type Props = {
  onGuest: () => Promise<void>
}

export function LoginScreen({ onGuest }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-6 text-ink">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-xl">
        <p className="text-[11px] uppercase tracking-[0.18em] text-terracotta">atelier</p>
        <h1 className="mt-2 font-display text-4xl italic">StudyLang</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Учите язык в чате, на полке слов и в коротких диалогах. Можно начать сразу как гость — прогресс
          сохранится на этом устройстве.
        </p>
        <a
          href="/api/auth/google/start"
          className="mt-8 flex h-12 items-center justify-center rounded-full bg-walnut text-sm font-medium text-cream hover:bg-ink"
        >
          Войти через Google
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError('')
            setBusy(true)
            void onGuest()
              .catch(() => setError('Не удалось войти как гость. Проверьте, что API запущен.'))
              .finally(() => setBusy(false))
          }}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-full border border-line bg-canvas text-sm font-medium hover:bg-hover disabled:opacity-50"
        >
          {busy ? 'Входим…' : 'Продолжить без Google'}
        </button>
        {error ? <p className="mt-3 text-sm text-terracotta">{error}</p> : null}
        <p className="mt-6 text-xs leading-5 text-muted">
          Google нужен, если хотите синхронизировать профиль между устройствами. Для теста на этом компьютере
          достаточно гостевого входа.
        </p>
      </div>
    </div>
  )
}