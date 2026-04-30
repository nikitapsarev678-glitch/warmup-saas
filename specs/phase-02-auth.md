# Фаза 2 — Auth (Telegram Login Widget + JWT)

> Читай SPEC.md перед началом. Фаза 1 (database) должна быть выполнена.

## Цель
Пользователь заходит на сайт, нажимает "Войти через Telegram", логинится через официальный Telegram Login Widget, получает httpOnly JWT-куку, и попадает в дашборд.

## Не трогай
- `worker/src/routes/accounts.ts`, `billing.ts`, `campaigns.ts`, `analytics.ts`
- `web/app/(dashboard)/` страницы (кроме layout.tsx для auth guard)

---

## Как работает Telegram Login Widget

1. Пользователь на сайте нажимает кнопку "Войти через Telegram"
2. Открывается всплывающее окно Telegram — пользователь подтверждает
3. Telegram перенаправляет на наш callback URL с query-параметрами:
   `id`, `first_name`, `last_name`, `username`, `photo_url`, `auth_date`, `hash`
4. **Мы ОБЯЗАНЫ проверить `hash`** на сервере через HMAC-SHA256 с `BOT_TOKEN` как ключом
5. После верификации создаём/обновляем пользователя в D1 и выдаём JWT

---

## Файл: worker/src/routes/auth.ts

```typescript
import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { createHmac, createHash } from 'node:crypto'
import { sign, verify } from '@tsndr/cloudflare-worker-jwt'
import { upsertUser, getUserByTelegramId } from '../db'
import type { Env } from '../index'

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

function verifyTelegramAuth(data: TelegramAuthData, botToken: string): boolean {
  const { hash, ...rest } = data

  // Строим data-check-string: sorted key=value\n
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k as keyof typeof rest]}`)
    .join('\n')

  // secret_key = SHA256(bot_token)
  const secretKey = createHash('sha256').update(botToken).digest()
  const expectedHash = createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex')

  // Проверяем auth_date (не старше 24 часов)
  const authDate = parseInt(rest.auth_date, 10)
  const now = Math.floor(Date.now() / 1000)
  if (now - authDate > 86400) return false

  return expectedHash === hash
}

// POST /auth/telegram — принимает данные от Telegram Login Widget
auth.post('/telegram', async (c) => {
  const body = await c.req.json<TelegramAuthData>()

  if (!verifyTelegramAuth(body, c.env.TELEGRAM_BOT_TOKEN)) {
    return c.json({ error: 'Invalid Telegram auth data' }, 401)
  }

  const user = await upsertUser(c.env.DB, {
    telegram_id: parseInt(body.id, 10),
    telegram_username: body.username ?? null,
    first_name: body.first_name ?? null,
    last_name: body.last_name ?? null,
    photo_url: body.photo_url ?? null,
  })

  const token = await sign(
    {
      sub: String(user.id),
      tg: user.telegram_id,
      plan: user.plan,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 дней
    },
    c.env.JWT_SECRET
  )

  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  return c.json({ ok: true, user })
})

// GET /auth/me — текущий пользователь
auth.get('/me', async (c) => {
  const cookie = c.req.header('Cookie') ?? ''
  const match = cookie.match(/session=([^;]+)/)
  if (!match) return c.json({ error: 'Not authenticated' }, 401)

  try {
    const payload = await verify(match[1], c.env.JWT_SECRET)
    if (!payload) return c.json({ error: 'Invalid token' }, 401)

    const user = await getUserByTelegramId(c.env.DB, payload.tg as number)
    if (!user) return c.json({ error: 'User not found' }, 404)

    return c.json({ user })
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

// POST /auth/logout
auth.post('/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ ok: true })
})

export default auth
```

## Установить зависимость в worker/
```bash
npm install @tsndr/cloudflare-worker-jwt
```

---

## Файл: worker/src/middleware/requireAuth.ts

```typescript
import { createMiddleware } from 'hono/factory'
import { verify } from '@tsndr/cloudflare-worker-jwt'
import { getUserByTelegramId } from '../db'
import type { Env } from '../index'
import type { SaasUser } from '../db'

export type AuthContext = {
  Variables: {
    user: SaasUser
    userId: number
  }
}

export const requireAuth = createMiddleware<{ Bindings: Env } & AuthContext>(
  async (c, next) => {
    const cookie = c.req.header('Cookie') ?? ''
    const match = cookie.match(/session=([^;]+)/)
    if (!match) return c.json({ error: 'Unauthorized' }, 401)

    try {
      const payload = await verify(match[1], c.env.JWT_SECRET)
      if (!payload) return c.json({ error: 'Unauthorized' }, 401)

      const user = await getUserByTelegramId(c.env.DB, payload.tg as number)
      if (!user) return c.json({ error: 'User not found' }, 404)

      c.set('user', user)
      c.set('userId', user.id)
      await next()
    } catch {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }
)
```

---

## Подключить в worker/src/index.ts

Добавь в конец файла (после существующего кода):
```typescript
import authRoutes from './routes/auth'
app.route('/auth', authRoutes)
```

---

## Файл: web/app/(auth)/login/page.tsx

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

declare global {
  interface Window {
    onTelegramAuth: (user: Record<string, string>) => void
  }
}

export default function LoginPage() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Callback который вызовет Telegram после авторизации
    window.onTelegramAuth = async (telegramData) => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(telegramData),
      })
      if (res.ok) {
        router.push('/dashboard')
      }
    }

    // Добавляем Telegram Login Widget скрипт
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME!)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
    script.async = true
    containerRef.current?.appendChild(script)

    return () => {
      delete window.onTelegramAuth
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-10 rounded-2xl shadow-sm border max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold mb-2">Varmup</h1>
        <p className="text-gray-500 mb-8 text-sm">
          Прогрев Telegram аккаунтов
        </p>
        <div ref={containerRef} className="flex justify-center" />
        <p className="text-xs text-gray-400 mt-6">
          Нажимая кнопку, вы соглашаетесь с условиями использования
        </p>
      </div>
    </div>
  )
}
```

---

## Файл: web/lib/auth.ts (хелперы на фронте)

```typescript
import { apiFetch } from './api'
import type { SaasUser } from './types'

export async function getMe(): Promise<SaasUser | null> {
  try {
    const data = await apiFetch<{ user: SaasUser }>('/auth/me')
    return data.user
  } catch {
    return null
  }
}

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' })
}
```

---

## Файл: web/app/(dashboard)/layout.tsx (auth guard)

```tsx
import { redirect } from 'next/navigation'
import { getMe } from '@/lib/auth'
import { Sidebar } from '@/components/sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getMe()
  if (!user) redirect('/login')

  return (
    <div className="flex h-screen">
      <Sidebar user={user} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
```

---

## Файл: web/lib/types.ts

```typescript
export interface SaasUser {
  id: number
  telegram_id: number
  telegram_username: string | null
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  plan: 'free' | 'starter' | 'basic' | 'pro' | 'agency'
  plan_expires_at: string | null
  accounts_limit: number
  created_at: string
}

export interface TgAccount {
  id: number
  user_id: number
  phone: string
  first_name: string | null
  username: string | null
  status: 'pending' | 'active' | 'warming' | 'warmed' | 'spam_block' | 'banned' | 'disabled'
  proxy: string | null
  block_reason: string | null
  messages_sent: number
  created_at: string
}

export interface Campaign {
  id: number
  user_id: number
  name: string
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  warmup_days: number
  daily_actions_min: number
  daily_actions_max: number
  work_hour_start: number
  work_hour_end: number
  actions_config: string
  use_pool_dialogs: number
  created_at: string
}
```

---

## Acceptance criteria

- [ ] `http://localhost:3000/login` — отображается кнопка Telegram Login
- [ ] После нажатия и подтверждения в Telegram — редирект на `/dashboard`
- [ ] `GET /auth/me` с валидной кукой — возвращает `{user: {...}}`
- [ ] `GET /auth/me` без куки — возвращает 401
- [ ] Верификация hash работает: передача поддельных данных → 401
- [ ] Повторный вход обновляет данные пользователя (username, photo_url)
- [ ] `POST /auth/logout` удаляет куку session
