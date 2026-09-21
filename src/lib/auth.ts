export type Account = {
  id: string
  email: string
  name: string
  picture?: string
}

export function googleClientId() {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
}

export function googleAuthEnabled() {
  return Boolean(googleClientId())
}

export async function fetchSession() {
  const response = await fetch('/api/auth/session', { credentials: 'include' })
  if (!response.ok) return null
  const body = (await response.json()) as { user?: Account | null } & Partial<Account>
  if (body.user === null) return null
  if (body.user && typeof body.user.id === 'string') return body.user
  if (typeof body.id === 'string') return body as Account
  return null
}

export async function finishGoogleLogin(code: string, state: string) {
  const response = await fetch('/api/auth/google/callback', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state }),
  })
  if (!response.ok) throw new Error(`google-${response.status}`)
  return (await response.json()) as Account
}

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
}
export async function startGuest() {
  const response = await fetch('/api/auth/guest', {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok) throw new Error(`guest-${response.status}`)
  return (await response.json()) as Account
}
