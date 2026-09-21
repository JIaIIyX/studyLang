import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE = 'studylang_session'
const MAX_AGE = 60 * 60 * 24 * 30

function secret() {
  const value = process.env.SESSION_SECRET?.trim()
  if (value) return value
  const generated = randomBytes(32).toString('hex')
  process.env.SESSION_SECRET = generated
  console.warn('SESSION_SECRET не задан — сессия сбросится при перезапуске API.')
  return generated
}

export type Session = { uid: string; exp: number }

export function signSession(uid: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const payload = Buffer.from(JSON.stringify({ uid, exp }), 'utf8').toString('base64url')
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function readToken(raw?: string | null): Session | null {
  if (!raw) return null
  const [payload, sig] = raw.split('.')
  if (!payload || !sig) return null
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session
    if (!data.uid || data.exp < Math.floor(Date.now() / 1000)) return null
    return data
  } catch {
    return null
  }
}

export function readSession(cookieHeader?: string): Session | null {
  if (!cookieHeader) return null
  const raw = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1)
  return readToken(raw)
}

export function readBearer(header?: string): Session | null {
  if (!header) return null
  const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  return readToken(raw)
}

function cookieFlags(maxAge: number) {
  const secure = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production'
  return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}

export function sessionCookie(token: string) {
  return `${COOKIE}=${token}; ${cookieFlags(MAX_AGE)}`
}

export function clearSessionCookie() {
  return `${COOKIE}=; ${cookieFlags(0)}`
}

const OAUTH_COOKIE = 'studylang_oauth'

export function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null
  return (
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  )
}

export function oauthStateCookie(state: string) {
  return `${OAUTH_COOKIE}=${state}; ${cookieFlags(600)}`
}

export function clearOauthStateCookie() {
  return `${OAUTH_COOKIE}=; ${cookieFlags(0)}`
}

export function readOauthState(cookieHeader?: string) {
  return readCookie(cookieHeader, OAUTH_COOKIE)
}

export function sameSecret(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}
