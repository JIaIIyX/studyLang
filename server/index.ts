import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import { OAuth2Client } from 'google-auth-library'
import { buildExtensionZip, extensionInfo, installExtensionLocally } from './extensionPack.ts'
import {
  clearOauthStateCookie,
  clearSessionCookie,
  oauthStateCookie,
  readBearer,
  readOauthState,
  readSession,
  sameSecret,
  sessionCookie,
  signSession,
} from './session.ts'
import { translateIntoPractice, translatePhrase, translateWord } from './translate.ts'
import { stripThinking } from '../src/lib/modelParse.ts'

const PORT = Number(process.env.API_PORT || 5174)
const GUEST_ID = 'local'

function loadEnv() {
  const path = resolve(process.cwd(), '.env')
  try {
    for (const line of readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '')
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    /* no .env */
  }
}

loadEnv()

const url = process.env.DATABASE_URL?.trim()
if (!url) {
  console.error('Нет DATABASE_URL в .env. Пример: postgresql://postgres:ПАРОЛЬ@localhost:5433/postgres')
  process.exit(1)
}

const googleClientId = (() => {
  const primary = (process.env.GOOGLE_CLIENT_ID || '').trim()
  const vite = (process.env.VITE_GOOGLE_CLIENT_ID || '').trim()
  if (primary.endsWith('.apps.googleusercontent.com')) return primary
  return vite
})()
const googleClientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim()
const googleRedirectUri = (process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173').trim()
const google = googleClientId
  ? new OAuth2Client(googleClientId, googleClientSecret || undefined, googleRedirectUri)
  : null

const pool = new Pool({
  connectionString: url,
  ssl: false,
})

type Snapshot = {
  displayName: string
  language: string
  theme: string
  tutorPrompt: string
  sidebarCollapsed: boolean
  chats: unknown
  progress: unknown
  customFiles: unknown
  hiddenFiles: unknown
  homework: unknown
  advice: unknown
  shelf: unknown
}

type Account = {
  id: string
  email: string
  name: string
  picture?: string
}

function emptySnapshot(): Snapshot {
  return {
    displayName: 'Ученик',
    language: 'fr',
    theme: 'light',
    tutorPrompt: '',
    sidebarCollapsed: false,
    chats: [],
    progress: {},
    customFiles: [],
    hiddenFiles: [],
    homework: [],
    advice: { overall: {}, files: {} },
    shelf: {},
  }
}

function rowToSnapshot(row: Record<string, unknown>): Snapshot {
  return {
    displayName: String(row.display_name ?? 'Ученик'),
    language: String(row.language ?? 'fr'),
    theme: String(row.theme ?? 'light'),
    tutorPrompt: String(row.tutor_prompt ?? ''),
    sidebarCollapsed: Boolean(row.sidebar_collapsed),
    chats: row.chats ?? [],
    progress: row.progress ?? {},
    customFiles: row.custom_files ?? [],
    hiddenFiles: row.hidden_files ?? [],
    homework: row.homework ?? [],
    advice: row.advice ?? { overall: {}, files: {} },
    shelf: row.shelf ?? {},
  }
}

function rowToAccount(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    name: String(row.display_name ?? 'Ученик'),
    picture: row.picture ? String(row.picture) : undefined,
  }
}

function isSparseRow(row: Record<string, unknown>) {
  const chats = Array.isArray(row.chats) ? row.chats.length : 0
  const files = Array.isArray(row.custom_files) ? row.custom_files.length : 0
  const homework = Array.isArray(row.homework) ? row.homework.length : 0
  return chats === 0 && files === 0 && homework === 0
}

function currentUserId(req: IncomingMessage) {
  const session = readSession(req.headers.cookie)
  if (session) return session.uid
  if (!googleClientId) return GUEST_ID
  return null
}

async function readUser(id: string): Promise<Snapshot> {
  const result = await pool.query(`SELECT * FROM studylang.users WHERE id = $1`, [id])
  const row = result.rows[0]
  return row ? rowToSnapshot(row) : emptySnapshot()
}

async function writeUser(id: string, body: Snapshot): Promise<Snapshot> {
  await pool.query(
    `INSERT INTO studylang.users (
      id, display_name, language, theme, tutor_prompt, sidebar_collapsed,
      chats, progress, custom_files, hidden_files, homework, advice, shelf, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      language = EXCLUDED.language,
      theme = EXCLUDED.theme,
      tutor_prompt = EXCLUDED.tutor_prompt,
      sidebar_collapsed = EXCLUDED.sidebar_collapsed,
      chats = EXCLUDED.chats,
      progress = EXCLUDED.progress,
      custom_files = EXCLUDED.custom_files,
      hidden_files = EXCLUDED.hidden_files,
      homework = EXCLUDED.homework,
      advice = EXCLUDED.advice,
      shelf = EXCLUDED.shelf,
      updated_at = now()`,
    [
      id,
      body.displayName || 'Ученик',
      body.language || 'fr',
      body.theme || 'light',
      body.tutorPrompt ?? '',
      Boolean(body.sidebarCollapsed),
      JSON.stringify(body.chats ?? []),
      JSON.stringify(body.progress ?? {}),
      JSON.stringify(body.customFiles ?? []),
      JSON.stringify(body.hiddenFiles ?? []),
      JSON.stringify(body.homework ?? []),
      JSON.stringify(body.advice ?? { overall: {}, files: {} }),
      JSON.stringify(body.shelf ?? {}),
    ],
  )
  return readUser(id)
}

async function upsertGoogleUser(payload: { sub: string; email?: string; name?: string; picture?: string }) {
  const id = `google:${payload.sub}`
  const found = await pool.query(`SELECT * FROM studylang.users WHERE id = $1 OR google_sub = $2`, [id, payload.sub])
  if (found.rows[0]) {
    const existingId = String(found.rows[0].id)
    await pool.query(
      `UPDATE studylang.users SET email = $2, picture = $3, google_sub = $4, display_name = CASE
         WHEN display_name = 'Ученик' AND $5 <> '' THEN $5 ELSE display_name END
       WHERE id = $1`,
      [existingId, payload.email ?? '', payload.picture ?? '', payload.sub, payload.name ?? ''],
    )
    const next = await pool.query(`SELECT * FROM studylang.users WHERE id = $1`, [existingId])
    return rowToAccount(next.rows[0])
  }

  const guest = await pool.query(`SELECT * FROM studylang.users WHERE id = $1`, [GUEST_ID])
  const inherit = guest.rows[0] && !isSparseRow(guest.rows[0]) ? rowToSnapshot(guest.rows[0]) : emptySnapshot()
  const name = payload.name?.trim() || inherit.displayName
  await pool.query(
    `INSERT INTO studylang.users (
      id, display_name, language, theme, tutor_prompt, sidebar_collapsed,
      chats, progress, custom_files, hidden_files, homework, advice, shelf,
      email, picture, google_sub, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16, now())`,
    [
      id,
      name,
      inherit.language,
      inherit.theme,
      inherit.tutorPrompt,
      inherit.sidebarCollapsed,
      JSON.stringify(inherit.chats),
      JSON.stringify(inherit.progress),
      JSON.stringify(inherit.customFiles),
      JSON.stringify(inherit.hiddenFiles),
      JSON.stringify(inherit.homework),
      JSON.stringify(inherit.advice),
      JSON.stringify(inherit.shelf),
      payload.email ?? '',
      payload.picture ?? '',
      payload.sub,
    ],
  )
  return { id, email: payload.email ?? '', name, picture: payload.picture }
}

function send(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    ...extraHeaders,
  })
  res.end(json)
}

function redirect(res: ServerResponse, location: string, cookies?: string[]) {
  if (cookies?.length) res.setHeader('Set-Cookie', cookies)
  res.writeHead(302, { Location: location })
  res.end()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sendHtml(res: ServerResponse, status: number, message: string) {
  const html = `<!doctype html><meta charset="utf-8"><title>StudyLang</title>
<body style="font-family:Manrope,sans-serif;background:#f3eee4;color:#2a2118;padding:48px;max-width:40rem">
<p>${escapeHtml(message)}</p>
<p><a href="/" style="color:#c45c26">Назад ко входу</a></p>
</body>`
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

const MAX_BODY = 700_000
const rateHits = new Map<string, number[]>()

function clientKey(req: IncomingMessage) {
  return String(req.socket.remoteAddress || 'local')
}

function rateLimit(req: IncomingMessage, bucket: string, max: number, windowMs: number) {
  const id = `${bucket}:${clientKey(req)}`
  const now = Date.now()
  const list = (rateHits.get(id) ?? []).filter((stamp) => now - stamp < windowMs)
  if (list.length >= max) return false
  list.push(now)
  rateHits.set(id, list)
  return true
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        req.destroy()
        reject(new Error('too-large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function needAuth(req: IncomingMessage) {
  return Boolean(googleClientId) && !readSession(req.headers.cookie)
}

function requireUser(req: IncomingMessage) {
  if (needAuth(req)) return null
  return currentUserId(req)
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/** Free Groq models (no paid plan). Prefer the small/fast one for chat volume. */
const GROQ_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b']

/** Free OpenRouter fallbacks if Groq key is missing. */
const OPENROUTER_MODELS = [
  'nvidia/nemotron-nano-9b-v2:free',
  'google/gemma-3-27b-it:free',
]

function readEnvFileKey(name: string) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '')
      if (key !== name) continue
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      return value
    }
  } catch {
    /* no .env */
  }
  return ''
}

function groqKey() {
  return (
    readEnvFileKey('GROQ_API_KEY') ||
    process.env.GROQ_API_KEY ||
    ''
  ).trim()
}

function openrouterKey() {
  return (
    readEnvFileKey('OPENROUTER_API_KEY') ||
    readEnvFileKey('VITE_OPENROUTER_API_KEY') ||
    process.env.OPENROUTER_API_KEY ||
    process.env.VITE_OPENROUTER_API_KEY ||
    ''
  ).trim()
}

type LlmProvider = 'groq' | 'openrouter'

function llmProvider(): LlmProvider | null {
  if (groqKey()) return 'groq'
  if (openrouterKey()) return 'openrouter'
  return null
}

function llmApiKey() {
  return groqKey() || openrouterKey()
}

function hasLlmKey() {
  return Boolean(llmApiKey())
}

function llmHeaders(apiKey: string, provider: LlmProvider) {
  if (provider === 'groq') {
    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.APP_ORIGIN?.trim() || 'http://localhost:5173',
    'X-Title': 'StudyLang',
  }
}

type OpenRouterMessage = {
  content?: string | Array<{ type?: string; text?: string }> | null
  reasoning?: string | null
  reasoning_details?: Array<{ text?: string; content?: string }> | null
}

let skipGemmaUntil = 0

function cleanLlmText(text: string) {
  return stripThinking(text)
}

function modelsToTry(provider: LlmProvider) {
  if (provider === 'groq') return GROQ_MODELS
  if (Date.now() < skipGemmaUntil) {
    return OPENROUTER_MODELS.filter((model) => !model.includes('gemma'))
  }
  return OPENROUTER_MODELS
}

function pickMessageText(message?: OpenRouterMessage | null) {
  if (!message) return ''
  const raw = message.content
  const fromContent =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.map((part) => (typeof part === 'string' ? part : part.text || '')).join('')
        : ''
  if (fromContent.trim()) return fromContent.trim()
  if (message.reasoning?.trim()) return message.reasoning.trim()
  return (message.reasoning_details ?? [])
    .map((item) => item.text || item.content || '')
    .join('')
    .trim()
}

function llmMessages(system: string, history: { role: 'user' | 'assistant'; content: string }[]) {
  return [{ role: 'system' as const, content: system }, ...history]
}

function llmPayload(
  provider: LlmProvider,
  model: string,
  system: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  extra: Record<string, unknown>,
) {
  const base: Record<string, unknown> = {
    model,
    messages: llmMessages(system, history),
    ...extra,
  }
  // OpenRouter-only knobs; Groq rejects unknown fields like `reasoning`.
  if (provider === 'openrouter') {
    base.reasoning = { effort: 'none', enabled: false }
  }
  return base
}

function isRetryableLlm(message: string) {
  return /provider returned|rate.?limit|temporarily|overloaded|no (allowed )?providers|429|empty|model_decommissioned|not.?found/i.test(
    message,
  )
}

function openRouterError(data: {
  error?: { message?: string; metadata?: { raw?: string } }
  choices?: { message?: OpenRouterMessage }[]
}) {
  const raw = data.error?.metadata?.raw
  const message = data.error?.message
  return [message, typeof raw === 'string' ? raw.slice(0, 220) : ''].filter(Boolean).join(' — ')
}

function providerError(data: {
  error?: { message?: string; metadata?: { raw?: string } } | string
  choices?: { message?: OpenRouterMessage }[]
}) {
  if (typeof data.error === 'string') return data.error
  return openRouterError({ error: data.error, choices: data.choices })
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

type ClipMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: number }
type ClipChat = {
  id: string
  title: string
  language: string
  createdAt: number
  updatedAt: number
  messages: ClipMessage[]
}

function explainUserId(req: IncomingMessage) {
  return readBearer(req.headers.authorization)?.uid ?? currentUserId(req)
}

function asClipChats(value: unknown): ClipChat[] {
  return Array.isArray(value) ? (value as ClipChat[]) : []
}

function mergeChatsForPut(serverChats: unknown, clientChats: unknown) {
  const client = asClipChats(clientChats)
  const known = new Set(client.map((item) => item.id))
  const fresh = Date.now() - 60_000
  const extras = asClipChats(serverChats).filter(
    (item) => !known.has(item.id) && String(item.id).startsWith('clip-') && (item.updatedAt || 0) > fresh,
  )
  return [...extras, ...client].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

async function googleAccountId(userId: string | null) {
  if (!userId?.startsWith('google:')) return null
  const found = await pool.query(`SELECT id FROM studylang.users WHERE id = $1`, [userId])
  return found.rows[0] ? userId : null
}

async function upsertClipChat(userId: string, chat: ClipChat) {
  const snap = await readUser(userId)
  const chats = asClipChats(snap.chats).filter((item) => item.id !== chat.id)
  chats.unshift(chat)
  await writeUser(userId, { ...snap, chats })
}

function deltaText(delta?: OpenRouterMessage | null) {
  return pickMessageText(delta)
}

async function streamOpenAi(
  provider: LlmProvider,
  apiKey: string,
  system: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  onDelta: (chunk: string) => void,
) {
  const url = provider === 'groq' ? GROQ_URL : OPENROUTER_URL
  const model = modelsToTry(provider)[0]
  const response = await fetch(url, {
    method: 'POST',
    headers: llmHeaders(apiKey, provider),
    body: JSON.stringify(
      llmPayload(provider, model, system, history, {
        stream: true,
        temperature: 0.5,
        max_tokens: 800,
      }),
    ),
  })
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail.slice(0, 240) || `llm-${response.status}`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const payload = line.trim()
      if (!payload.startsWith('data:')) continue
      const data = payload.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as { choices?: { delta?: OpenRouterMessage }[] }
        const piece = deltaText(json.choices?.[0]?.delta)
        if (piece) {
          full += piece
          onDelta(piece)
        }
      } catch {
        /* skip */
      }
    }
  }
  if (!full.trim()) throw new Error('empty')
  return full.trim()
}

type LlmUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

type LlmResult = {
  text: string
  usage: LlmUsage
  model: string
  provider: LlmProvider
}

function readUsage(data: {
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}): LlmUsage {
  const usage = data.usage ?? {}
  const promptTokens = Number(usage.prompt_tokens ?? usage.promptTokens) || 0
  const completionTokens = Number(usage.completion_tokens ?? usage.completionTokens) || 0
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokens) || promptTokens + completionTokens
  return { promptTokens, completionTokens, totalTokens }
}

async function completeOpenAi(
  provider: LlmProvider,
  apiKey: string,
  system: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  options: { maxTokens: number; temperature: number },
): Promise<LlmResult> {
  const url = provider === 'groq' ? GROQ_URL : OPENROUTER_URL
  let lastError = 'llm-failed'
  for (const model of modelsToTry(provider)) {
    const attempts = model.includes('gemma') ? 1 : 2
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await sleep(350)
      const response = await fetch(url, {
        method: 'POST',
        headers: llmHeaders(apiKey, provider),
        body: JSON.stringify(
          llmPayload(provider, model, system, history, {
            temperature: options.temperature,
            max_tokens: options.maxTokens,
          }),
        ),
      })
      const data = (await response.json()) as {
        error?: { message?: string; metadata?: { raw?: string } } | string
        choices?: { message?: OpenRouterMessage }[]
        usage?: {
          prompt_tokens?: number
          completion_tokens?: number
          total_tokens?: number
        }
      }
      const text = cleanLlmText(pickMessageText(data.choices?.[0]?.message))
      if (text) {
        return {
          text,
          usage: readUsage(data),
          model,
          provider,
        }
      }
      lastError = providerError(data) || (response.ok ? 'empty' : `llm-${response.status}`)
      if (/free-models-per-day|10 credits/i.test(lastError)) break
      if (model.includes('gemma') && isRetryableLlm(lastError)) {
        skipGemmaUntil = Date.now() + 90_000
        break
      }
      if (!isRetryableLlm(lastError)) break
    }
  }
  throw new Error(lastError)
}

async function streamLlm(
  system: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  onDelta: (chunk: string) => void,
) {
  const provider = llmProvider()
  const apiKey = llmApiKey()
  if (!provider || !apiKey) throw new Error('no-llm-key')
  return streamOpenAi(provider, apiKey, system, history, onDelta)
}

async function completeLlm(
  system: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  options: { maxTokens: number; temperature: number },
): Promise<LlmResult> {
  const provider = llmProvider()
  const apiKey = llmApiKey()
  if (!provider || !apiKey) throw new Error('no-llm-key')
  return completeOpenAi(provider, apiKey, system, history, options)
}

function allowedOrigin(req: IncomingMessage) {
  const origin = String(req.headers.origin || '')
  if (!origin) return ''
  if (origin.startsWith('chrome-extension://')) return origin
  if (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173') return origin
  const extra = (process.env.APP_ORIGIN || '').trim()
  if (extra && origin === extra) return origin
  return ''
}

function corsExplain(req: IncomingMessage, res: ServerResponse) {
  const origin = allowedOrigin(req)
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function writeSse(res: ServerResponse, event: unknown) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

const server = createServer(async (req, res) => {
  const urlPath = req.url?.split('?')[0] ?? '/'
  try {
    if (req.method === 'OPTIONS' && (urlPath === '/api/explain' || urlPath === '/api/explain/chat')) {
      corsExplain(req, res)
      res.writeHead(204)
      res.end()
      return
    }

    if ((req.method === 'GET' || req.method === 'POST') && urlPath === '/api/translate') {
      if (!requireUser(req)) {
        send(res, 401, { translation: '', variants: [], error: 'unauthenticated' })
        return
      }
      if (!rateLimit(req, 'translate', 80, 60_000)) {
        send(res, 429, { translation: '', variants: [], error: 'rate-limit' })
        return
      }
      const params = new URL(req.url ?? '/', 'http://localhost').searchParams
      const body =
        req.method === 'POST'
          ? (JSON.parse((await readBody(req)) || '{}') as { q?: string; lang?: string; mode?: string; dir?: string })
          : {}
      const word = String(body.q || params.get('q') || '').trim()
      const language =
        body.lang === 'fr' || body.lang === 'de' || params.get('lang') === 'fr' || params.get('lang') === 'de'
          ? String(body.lang || params.get('lang'))
          : 'en'
      const mode = String(body.mode || params.get('mode') || '')
      const dir = String(body.dir || params.get('dir') || '')
      if (!word) {
        send(res, 400, { translation: '', variants: [] })
        return
      }
      if (mode === 'phrase') {
        send(res, 200, await translatePhrase(word, language))
        return
      }
      if (dir === 'into') {
        send(res, 200, await translateIntoPractice(word, language))
        return
      }
      send(res, 200, await translateWord(word, language))
      return
    }

    if (req.method === 'POST' && urlPath === '/api/llm') {
      if (!requireUser(req)) {
        send(res, 401, { error: 'unauthenticated' })
        return
      }
      if (!rateLimit(req, 'llm', 40, 60_000)) {
        send(res, 429, { error: 'rate-limit' })
        return
      }
      const parsed = JSON.parse((await readBody(req)) || '{}') as {
        system?: string
        history?: { role?: string; content?: string }[]
        maxTokens?: number
        temperature?: number
      }
      const system = String(parsed.system || '').slice(0, 12_000)
      const history = (Array.isArray(parsed.history) ? parsed.history : [])
        .slice(0, 40)
        .map((item) => ({
          role: item.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: String(item.content || '').slice(0, 8_000),
        }))
        .filter((item) => item.content.trim())
      if (!system || !history.some((item) => item.role === 'user')) {
        send(res, 400, { error: 'empty' })
        return
      }
      const maxTokens = Math.min(Math.max(Number(parsed.maxTokens) || 800, 40), 2500)
      const temperature = Math.min(Math.max(Number(parsed.temperature) || 0.7, 0), 1.2)
      console.log('[llm] start', history.length, 'turns')
      try {
        const result = await completeLlm(system, history, { maxTokens, temperature })
        console.log('[llm] ok', result.text.length, result.usage.totalTokens, result.model)
        send(res, 200, { text: result.text, usage: result.usage, model: result.model, provider: result.provider })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[llm]', message.slice(0, 400))
        const code = message === 'no-llm-key' ? 503 : 502
        send(res, code, { error: code === 503 ? 'no-key' : 'llm-failed' })
      }
      return
    }

    if (req.method === 'GET' && urlPath === '/api/extension/token') {
      const uid = currentUserId(req)
      const owner = await googleAccountId(uid)
      if (!owner) {
        send(res, uid ? 403 : 401, { user: null })
        return
      }
      const account = await pool.query(`SELECT * FROM studylang.users WHERE id = $1`, [owner])
      send(res, 200, {
        token: signSession(owner),
        user: rowToAccount(account.rows[0]),
      })
      return
    }

    if (req.method === 'GET' && urlPath === '/api/explain/chat') {
      corsExplain(req, res)
      if (!explainUserId(req)) {
        send(res, 401, { chat: null })
        return
      }
      const collectionId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('id') || ''
      const owner = await googleAccountId(explainUserId(req))
      if (!owner) {
        send(res, 200, { chat: null })
        return
      }
      const snap = await readUser(owner)
      const chat = asClipChats(snap.chats).find((item) => item.id === collectionId) ?? null
      send(res, 200, { chat })
      return
    }

    if (req.method === 'POST' && urlPath === '/api/explain') {
      corsExplain(req, res)
      if (!explainUserId(req)) {
        send(res, 401, { error: 'unauthenticated' })
        return
      }
      if (!rateLimit(req, 'explain', 20, 60_000)) {
        send(res, 429, { error: 'rate-limit' })
        return
      }
      const parsed = JSON.parse((await readBody(req)) || '{}') as {
        collectionTitle?: string
        term?: string
        language?: string
        lexicon?: string
        chatId?: string
      }
      const term = String(parsed.term || '').trim().slice(0, 200)
      if (!term) {
        send(res, 400, { error: 'no-term' })
        return
      }
      const languageCode = parsed.language === 'fr' || parsed.language === 'de' ? parsed.language : 'en'
      const languageLabel =
        languageCode === 'fr' ? 'французский' : languageCode === 'de' ? 'немецкий' : 'английский'
      const owner = await googleAccountId(explainUserId(req))
      const now = Date.now()
      const title = String(parsed.collectionTitle || '').trim() || term.slice(0, 42)
      const askedId = String(parsed.chatId || '').trim()
      const existing =
        owner && askedId.startsWith('clip-')
          ? asClipChats((await readUser(owner)).chats).find((item) => item.id === askedId)
          : undefined
      const userMessage: ClipMessage = {
        id: `msg-${now}`,
        role: 'user',
        content: `Объясни: ${term}`,
        createdAt: now,
      }
      const chat: ClipChat = existing
        ? {
            ...existing,
            title,
            language: languageCode,
            updatedAt: now,
            messages: [...existing.messages, userMessage],
          }
        : {
            id: `clip-${now.toString(36)}-${randomBytes(3).toString('hex')}`,
            title,
            language: languageCode,
            createdAt: now,
            updatedAt: now,
            messages: [userMessage],
          }
      const created = !existing

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        ...(allowedOrigin(req) ? { 'Access-Control-Allow-Origin': allowedOrigin(req) } : {}),
        Vary: 'Origin',
      })
      writeSse(res, { type: 'user', message: userMessage, chatId: chat.id, title: chat.title, created })

      const system = [
        'You are the StudyLang tutor. The student\'s native language is Russian.',
        `Practice language: ${languageLabel}.`,
        'Three short sentences: meaning and when people say it — Russian; the example phrase — practice language only, never Russian. A gloss in parentheses is ok.',
        'No lists, JSON, or headings.',
        parsed.lexicon ? `Collection words:\n${String(parsed.lexicon).slice(0, 4000)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      const history = chat.messages.slice(-10).map((item) => ({
        role: item.role,
        content: item.content,
      }))

      try {
        const text = await streamLlm(system, history, (chunk) => {
          writeSse(res, { type: 'delta', text: chunk })
        })
        const assistant: ClipMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: text,
          createdAt: Date.now(),
        }
        chat.messages.push(assistant)
        chat.updatedAt = assistant.createdAt
        if (owner) await upsertClipChat(owner, chat)
        writeSse(res, { type: 'done', message: assistant, chatId: chat.id, saved: Boolean(owner), created })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        writeSse(res, { type: 'error', error: 'llm-failed' })
      }
      res.end()
      return
    }

    if (req.method === 'GET' && urlPath === '/api/extension') {
      if (!requireUser(req)) {
        send(res, 401, { error: 'unauthenticated' })
        return
      }
      const info = extensionInfo()
      send(res, info.ready ? 200 : 404, {
        ready: info.ready,
        name: info.name,
        version: info.version,
      })
      return
    }

    if (req.method === 'GET' && urlPath === '/api/extension.zip') {
      if (!requireUser(req)) {
        send(res, 401, { error: 'unauthenticated' })
        return
      }
      try {
        const zip = buildExtensionZip()
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="studylang-clipper.zip"',
          'Content-Length': zip.length,
          'Cache-Control': 'no-store',
        })
        res.end(zip)
      } catch {
        send(res, 404, { error: 'extension-missing' })
      }
      return
    }

    if (req.method === 'POST' && urlPath === '/api/extension/install') {
      if (!requireUser(req)) {
        send(res, 401, { error: 'unauthenticated' })
        return
      }
      try {
        send(res, 200, { ok: true, ...installExtensionLocally() })
      } catch {
        send(res, 404, { error: 'extension-missing' })
      }
      return
    }

    if (req.method === 'GET' && urlPath === '/api/health') {
      await pool.query('SELECT 1')
      send(res, 200, {
        ok: true,
        google: Boolean(googleClientId),
        llm: hasLlmKey(),
      })
      return
    }

    if (req.method === 'GET' && urlPath === '/api/auth/session') {
      const uid = currentUserId(req)
      if (!uid) {
        send(res, 200, { user: null })
        return
      }
      if (uid === GUEST_ID) {
        send(res, 200, { user: { id: GUEST_ID, email: '', name: 'Ученик' } })
        return
      }
      const result = await pool.query(`SELECT * FROM studylang.users WHERE id = $1`, [uid])
      send(res, 200, { user: result.rows[0] ? rowToAccount(result.rows[0]) : null })
      return
    }

    if (req.method === 'GET' && urlPath === '/api/auth/google/start') {
      if (!google || !googleClientId) {
        sendHtml(res, 503, 'Google вход не настроен. Добавьте VITE_GOOGLE_CLIENT_ID в .env.')
        return
      }
      if (!googleClientSecret) {
        sendHtml(
          res,
          503,
          'Добавьте GOOGLE_CLIENT_SECRET в .env — это Client secret с той же страницы Credentials, не Client ID.',
        )
        return
      }
      const state = randomBytes(16).toString('hex')
      const location = google.generateAuthUrl({
        access_type: 'online',
        prompt: 'select_account',
        scope: ['openid', 'email', 'profile'],
        state,
        redirect_uri: googleRedirectUri,
      })
      redirect(res, location, [oauthStateCookie(state)])
      return
    }

    if (req.method === 'POST' && urlPath === '/api/auth/google/callback') {
      if (!google || !googleClientId) {
        send(res, 503, { error: 'google-not-configured' })
        return
      }
      const parsed = JSON.parse((await readBody(req)) || '{}') as { code?: string; state?: string }
      const expected = readOauthState(req.headers.cookie)
      if (!parsed.code || !parsed.state || !expected || !sameSecret(parsed.state, expected)) {
        send(res, 401, { error: 'oauth-state' })
        return
      }
      const { tokens } = await google.getToken({ code: parsed.code, redirect_uri: googleRedirectUri })
      if (!tokens.id_token) {
        send(res, 401, { error: 'no-id-token' })
        return
      }
      const ticket = await google.verifyIdToken({ idToken: tokens.id_token, audience: googleClientId })
      const payload = ticket.getPayload()
      if (!payload?.sub || payload.email_verified === false) {
        send(res, 401, { error: 'invalid-google' })
        return
      }
      const account = await upsertGoogleUser({
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      })
      res.setHeader('Set-Cookie', [sessionCookie(signSession(account.id)), clearOauthStateCookie()])
      send(res, 200, account)
      return
    }

    if (req.method === 'POST' && urlPath === '/api/auth/google') {
      if (!google || !googleClientId) {
        send(res, 503, { error: 'google-not-configured' })
        return
      }
      const parsed = JSON.parse((await readBody(req)) || '{}') as { credential?: string }
      if (!parsed.credential) {
        send(res, 400, { error: 'no-credential' })
        return
      }
      const ticket = await google.verifyIdToken({ idToken: parsed.credential, audience: googleClientId })
      const payload = ticket.getPayload()
      if (!payload?.sub || payload.email_verified === false) {
        send(res, 401, { error: 'invalid-google' })
        return
      }
      const account = await upsertGoogleUser({
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      })
      send(res, 200, account, { 'Set-Cookie': sessionCookie(signSession(account.id)) })
      return
    }

    if (req.method === 'POST' && urlPath === '/api/auth/guest') {
      const host = String(req.headers.host || '')
      const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)
      if (!local && process.env.ALLOW_GUEST_LOGIN !== '1') {
        send(res, 403, { error: 'guest-forbidden' })
        return
      }
      await pool.query(`INSERT INTO studylang.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [GUEST_ID])
      const account = { id: GUEST_ID, email: '', name: '\u0423\u0447\u0435\u043d\u0438\u043a' }
      send(res, 200, account, { 'Set-Cookie': sessionCookie(signSession(GUEST_ID)) })
      return
    }

    if (req.method === 'POST' && urlPath === '/api/auth/logout') {
      send(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() })
      return
    }

    if (req.method === 'GET' && urlPath === '/api/me') {
      if (needAuth(req)) {
        send(res, 401, { error: 'unauthenticated' })
        return
      }
      const id = currentUserId(req)
      if (!id) {
        send(res, 401, { error: 'unauthenticated' })
        return
      }
      if (id === GUEST_ID) {
        await pool.query(`INSERT INTO studylang.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [GUEST_ID])
      }
      send(res, 200, await readUser(id))
      return
    }

    if (req.method === 'PUT' && urlPath === '/api/me') {
      if (needAuth(req)) {
        send(res, 401, { error: 'unauthenticated' })
        return
      }
      const id = currentUserId(req)
      if (!id) {
        send(res, 401, { error: 'unauthenticated' })
        return
      }
      const raw = await readBody(req)
      if (raw.length > 600_000) {
        send(res, 413, { error: 'too-large' })
        return
      }
      const parsed = JSON.parse(raw || '{}') as Snapshot
      const existing = await readUser(id)
      send(
        res,
        200,
        await writeUser(id, {
          ...emptySnapshot(),
          ...parsed,
          chats: mergeChatsForPut(existing.chats, parsed.chats),
        }),
      )
      return
    }

    send(res, 404, { error: 'not-found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    send(res, 500, { error: 'server-error' })
  }
})

server.listen(PORT, () => {
  console.log(`StudyLang API http://localhost:${PORT}${googleClientId ? ' · Google auth' : ' · без Google (гость local)'}`)
})
