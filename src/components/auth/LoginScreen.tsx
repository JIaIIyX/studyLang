import { useState } from 'react'

export function LoginScreen() {
  const [error] = useState('')

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-6 text-ink">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-xl">
        <p className="text-[11px] uppercase tracking-[0.18em] text-terracotta">atelier</p>
        <h1 className="mt-2 font-display text-4xl italic">StudyLang</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Войти через Google, чтобы чаты, словарь и прогресс сохранялись на сервере.
        </p>
        <a
          href="/api/auth/google/start"
          className="mt-8 flex h-12 items-center justify-center rounded-full bg-walnut text-sm font-medium text-cream hover:bg-ink"
        >
          Войти через Google
        </a>
        {error ? <p className="mt-3 text-sm text-terracotta">{error}</p> : null}
        <p className="mt-6 text-xs leading-5 text-muted">
          Google нужен, чтобы хранить прогресс между устройствами. Гостевой вход отключён.
        </p>
      </div>
    </div>
  )
}
