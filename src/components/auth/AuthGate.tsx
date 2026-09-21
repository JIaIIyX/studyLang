import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { App } from '../../App'
import { fetchSession, finishGoogleLogin, googleAuthEnabled, signOut, startGuest, type Account } from '../../lib/auth'
import { bootPersist, resetPersist } from '../../lib/persist'
import { AppProvider } from '../../state/AppProvider'
import { LoginScreen } from './LoginScreen'

type AccountContextValue = {
  account: Account | null
  googleRequired: boolean
  logout: () => Promise<void>
}

const AccountContext = createContext<AccountContextValue | null>(null)

function BootScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas text-muted">
      Загрузка…
    </div>
  )
}

export function AuthGate() {
  const googleRequired = googleAuthEnabled()
  const [phase, setPhase] = useState<'boot' | 'login' | 'app'>('boot')
  const [account, setAccount] = useState<Account | null>(null)

  const enterApp = useCallback(async (next?: Account) => {
    if (next) setAccount(next)
    await bootPersist()
    setPhase('app')
  }, [])

  useEffect(() => {
    void (async () => {
      if (!googleRequired) {
        await enterApp({ id: 'local', email: '', name: 'Ученик' })
        return
      }
      const params = new URLSearchParams(window.location.search)
      if (params.get('error')) {
        window.history.replaceState({}, '', '/')
        setPhase('login')
        return
      }
      const code = params.get('code')
      const state = params.get('state')
      if (code && state) {
        try {
          const account = await finishGoogleLogin(code, state)
          window.history.replaceState({}, '', '/')
          await enterApp(account)
        } catch {
          window.history.replaceState({}, '', '/')
          setPhase('login')
        }
        return
      }
      try {
        const session = await fetchSession()
        if (!session) {
          setPhase('login')
          return
        }
        await enterApp(session)
      } catch {
        setPhase('login')
      }
    })()
  }, [enterApp, googleRequired])

  const logout = useCallback(async () => {
    await signOut()
    resetPersist()
    setAccount(null)
    setPhase('login')
  }, [])

  const value = useMemo(
    () => ({ account, googleRequired, logout }),
    [account, googleRequired, logout],
  )

  if (phase === 'boot') return <BootScreen />
  if (phase === 'login') {
    return (
      <LoginScreen
        onGuest={async () => {
          const guest = await startGuest()
          await enterApp(guest)
        }}
      />
    )
  }

  return (
    <AccountContext.Provider value={value}>
      <AppProvider key={account?.id ?? 'guest'}>
        <App />
      </AppProvider>
    </AccountContext.Provider>
  )
}

export function useAccount() {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccount must be used within AuthGate')
  return ctx
}
