import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { SignJWT, jwtVerify } from 'jose'
import { getUserByTelegramId, upsertUser } from '../db'
import type { Env } from '../index'

const encoder = new TextEncoder()

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function sha256Bytes(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', encoder.encode(input))
}

async function verifyTelegramAuth(data: TelegramAuthData, botToken: string): Promise<boolean> {
  const { hash, ...rest } = data

  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k as keyof typeof rest]}`)
    .join('\n')

  const authDate = parseInt(rest.auth_date, 10)
  const now = Math.floor(Date.now() / 1000)
  if (now - authDate > 86400) return false

  const secretKeyBytes = await sha256Bytes(botToken)

  const key = await crypto.subtle.importKey(
    'raw',
    secretKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  return crypto.subtle.verify(
    'HMAC',
    key,
    hexToBytes(hash),
    encoder.encode(checkString)
  )
}

const auth = new Hono<{ Bindings: Env }>()

interface TelegramAuthData {
  id: string
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: string
  hash: string
}

async function createSessionToken(user: { id: number; telegram_id: number; plan: string }, secretValue: string) {
  const secret = new TextEncoder().encode(secretValue)
  return new SignJWT({
    tg: user.telegram_id,
    plan: user.plan,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret)
}

function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string) {
  const isSecure = new URL(c.req.url).protocol === 'https:'

  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

function isLocalDevRequest(requestUrl: string) {
  const { hostname } = new URL(requestUrl)
  return hostname === '127.0.0.1' || hostname === 'localhost'
}

function resolveJwtSecret(requestUrl: string, configuredSecret: string) {
  if (configuredSecret) return configuredSecret
  if (isLocalDevRequest(requestUrl)) return 'local-dev-secret'
  return configuredSecret
}

auth.post('/telegram', async (c) => {
  const body = await c.req.json<TelegramAuthData>()

  if (!(await verifyTelegramAuth(body, c.env.TELEGRAM_BOT_TOKEN))) {
    return c.json({ error: 'Invalid Telegram auth data' }, 401)
  }

  const user = await upsertUser(c.env.DB, {
    telegram_id: parseInt(body.id, 10),
    telegram_username: body.username ?? null,
    first_name: body.first_name ?? null,
    last_name: body.last_name ?? null,
    photo_url: body.photo_url ?? null,
  })

  const token = await createSessionToken(user, resolveJwtSecret(c.req.url, c.env.JWT_SECRET))
  setSessionCookie(c, token)

  return c.json({ ok: true, user })
})

auth.post('/dev-login', async (c) => {
  if (c.env.DEV_AUTH_ENABLED !== '1' && !isLocalDevRequest(c.req.url)) {
    return c.json({ error: 'Dev login is disabled' }, 403)
  }

  const demoId = 900000001
  const user = await upsertUser(c.env.DB, {
    telegram_id: demoId,
    telegram_username: 'dev_demo',
    first_name: 'Dev',
    last_name: 'User',
    photo_url: null,
  })

  const token = await createSessionToken(user, resolveJwtSecret(c.req.url, c.env.JWT_SECRET))
  setSessionCookie(c, token)

  return c.json({ ok: true, user, mode: 'dev' as const })
})

auth.get('/me', async (c) => {
  const token = getCookie(c, 'session')
  if (!token) return c.json({ error: 'Not authenticated' }, 401)

  try {
    const secret = new TextEncoder().encode(resolveJwtSecret(c.req.url, c.env.JWT_SECRET))
    const { payload } = await jwtVerify(token, secret)

    const tg = payload.tg
    if (typeof tg !== 'number') return c.json({ error: 'Invalid token' }, 401)

    const user = await getUserByTelegramId(c.env.DB, tg)
    if (!user) return c.json({ error: 'User not found' }, 404)

    return c.json({ user })
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

auth.post('/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ ok: true })
})

export default auth
