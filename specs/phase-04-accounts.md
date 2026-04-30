# Фаза 4 — Accounts (Управление аккаунтами)

> Читай SPEC.md перед началом. Фазы 1 и 2 должны быть выполнены.

## Цель
Пользователь может добавлять Telegram аккаунты (через StringSession или телефон+код), видеть их статусы, удалять, настраивать прокси.

## Не трогай
- `worker/src/routes/billing.ts`, `campaigns.ts`, `analytics.ts`
- Таблицы кроме `tg_accounts`

---

## Два способа добавить аккаунт

### Способ 1 — StringSession (простой)
Пользователь уже имеет StringSession (Telethon). Вставляет строку в форму, мы сохраняем в D1.

### Способ 2 — Телефон + код (через Runner)
1. Пользователь вводит номер телефона
2. Worker создаёт задачу в `task_queue` (action='send_code')
3. Runner получает задачу, вызывает `client.send_code_request(phone)`
4. Пользователь вводит код из Telegram
5. Worker создаёт задачу (action='confirm_code')
6. Runner подтверждает код, получает StringSession, сохраняет в D1

---

## Файл: worker/src/routes/accounts.ts

```typescript
import { Hono } from 'hono'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import { getAccountsByUser, getAccountById, countUserAccounts } from '../db'
import type { Env } from '../index'

const accounts = new Hono<{ Bindings: Env } & AuthContext>()
accounts.use('*', requireAuth)

// GET /accounts — список аккаунтов пользователя
accounts.get('/', async (c) => {
  const userId = c.get('userId')
  const list = await getAccountsByUser(c.env.DB, userId)
  // Не возвращаем session_string — это секрет!
  const safe = list.map(({ session_string, api_hash, ...rest }) => rest)
  return c.json({ accounts: safe })
})

// POST /accounts — добавить аккаунт через StringSession
accounts.post('/', async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const body = await c.req.json<{
    phone: string
    session_string: string
    api_id?: number
    api_hash?: string
    proxy?: string
  }>()

  // Проверить лимит тарифа
  const count = await countUserAccounts(c.env.DB, userId)
  if (count >= user.accounts_limit) {
    return c.json(
      { error: `Лимит аккаунтов для тарифа "${user.plan}": ${user.accounts_limit}` },
      403
    )
  }

  if (!body.phone || !body.session_string) {
    return c.json({ error: 'phone и session_string обязательны' }, 400)
  }

  const result = await c.env.DB
    .prepare(`
      INSERT INTO tg_accounts (user_id, phone, session_string, api_id, api_hash, proxy, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `)
    .bind(userId, body.phone, body.session_string, body.api_id ?? null, body.api_hash ?? null, body.proxy ?? null)
    .run()

  return c.json({ ok: true, account_id: result.meta.last_row_id }, 201)
})

// POST /accounts/send-code — начало добавления через телефон
accounts.post('/send-code', async (c) => {
  const userId = c.get('userId')
  const user = c.get('user')
  const { phone } = await c.req.json<{ phone: string }>()

  const count = await countUserAccounts(c.env.DB, userId)
  if (count >= user.accounts_limit) {
    return c.json({ error: 'Лимит аккаунтов достигнут' }, 403)
  }

  // Создать pending запись аккаунта
  const result = await c.env.DB
    .prepare(`INSERT INTO tg_accounts (user_id, phone, status) VALUES (?, ?, 'pending')`)
    .bind(userId, phone)
    .run()

  const accountId = result.meta.last_row_id

  // Поставить задачу в очередь
  await c.env.DB
    .prepare(`
      INSERT INTO task_queue (campaign_id, action, params_json)
      VALUES (0, 'send_code', ?)
    `)
    .bind(JSON.stringify({ account_id: accountId, phone, user_id: userId }))
    .run()

  // Триггернуть GitHub Actions runner
  await triggerGithubRunner(c.env, 'send_code', { account_id: accountId })

  return c.json({ ok: true, account_id: accountId, message: 'Код отправлен в Telegram' })
})

// POST /accounts/:id/confirm-code — подтверждение кода
accounts.post('/:id/confirm-code', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)
  const { code, phone_code_hash } = await c.req.json<{ code: string; phone_code_hash: string }>()

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Account not found' }, 404)

  await c.env.DB
    .prepare(`
      INSERT INTO task_queue (campaign_id, action, params_json)
      VALUES (0, 'confirm_code', ?)
    `)
    .bind(JSON.stringify({ account_id: accountId, code, phone_code_hash }))
    .run()

  await triggerGithubRunner(c.env, 'confirm_code', { account_id: accountId })

  return c.json({ ok: true, message: 'Код проверяется...' })
})

// DELETE /accounts/:id — удалить аккаунт
accounts.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  await c.env.DB
    .prepare('DELETE FROM tg_accounts WHERE id = ? AND user_id = ?')
    .bind(accountId, userId)
    .run()

  return c.json({ ok: true })
})

// PATCH /accounts/:id/proxy — обновить прокси
accounts.patch('/:id/proxy', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)
  const { proxy } = await c.req.json<{ proxy: string | null }>()

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  await c.env.DB
    .prepare('UPDATE tg_accounts SET proxy = ? WHERE id = ? AND user_id = ?')
    .bind(proxy, accountId, userId)
    .run()

  return c.json({ ok: true })
})

// PATCH /accounts/:id/status — включить/отключить аккаунт
accounts.patch('/:id/status', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)
  const { status } = await c.req.json<{ status: 'active' | 'disabled' }>()

  if (!['active', 'disabled'].includes(status)) {
    return c.json({ error: 'status должен быть active или disabled' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  await c.env.DB
    .prepare('UPDATE tg_accounts SET status = ? WHERE id = ? AND user_id = ?')
    .bind(status, accountId, userId)
    .run()

  return c.json({ ok: true })
})

async function triggerGithubRunner(env: Env, action: string, params: Record<string, unknown>) {
  await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: { action, params: JSON.stringify(params) },
    }),
  })
}

export default accounts
```

---

## Подключить в worker/src/index.ts

```typescript
import accountsRoutes from './routes/accounts'
app.route('/accounts', accountsRoutes)
```

---

## Файл: web/app/(dashboard)/accounts/page.tsx

В хедере страницы справа оставь место под кнопку **“Импорт аккаунтов”** (её добавит Фаза 15).

```tsx
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'
import type { TgAccount } from '@/lib/types'
import { AddAccountDialog } from './add-account-dialog'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Ожидает', color: 'secondary' },
  active:     { label: 'Активен', color: 'default' },
  warming:    { label: 'Прогревается', color: 'warning' },
  warmed:     { label: 'Прогрет', color: 'success' },
  spam_block: { label: 'SpamBlock', color: 'destructive' },
  banned:     { label: 'Забанен', color: 'destructive' },
  disabled:   { label: 'Отключён', color: 'secondary' },
}

export default async function AccountsPage() {
  const { accounts } = await apiFetch<{ accounts: TgAccount[] }>('/accounts')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Аккаунты</h1>
          <p className="text-gray-500 text-sm">{accounts.length} аккаунтов</p>
        </div>
        <AddAccountDialog />
      </div>

      <div className="grid gap-3">
        {accounts.length === 0 && (
          <Card className="p-8 text-center text-gray-400">
            Нет аккаунтов. Добавьте первый аккаунт для прогрева.
          </Card>
        )}
        {accounts.map((acc) => {
          const statusInfo = STATUS_LABELS[acc.status] ?? { label: acc.status, color: 'secondary' }
          return (
            <Card key={acc.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-medium">
                  {(acc.first_name?.[0] ?? acc.phone[1] ?? '?').toUpperCase()}
                </div>
                <div>
                  <div className="font-medium">
                    {acc.first_name ?? acc.phone}
                    {acc.username && <span className="text-gray-400 ml-2">@{acc.username}</span>}
                  </div>
                  <div className="text-sm text-gray-400">{acc.phone}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {acc.proxy && (
                  <Badge variant="outline" className="text-xs">🔒 Прокси</Badge>
                )}
                <Badge variant={statusInfo.color as any}>{statusInfo.label}</Badge>
                <div className="text-sm text-gray-400">{acc.messages_sent} сообщ.</div>
                <Button variant="ghost" size="sm">⚙</Button>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
```

---

## Файл: web/app/(dashboard)/accounts/add-account-dialog.tsx

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiFetch } from '@/lib/api'

export function AddAccountDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // StringSession форма
  const [phone, setPhone] = useState('')
  const [session, setSession] = useState('')

  const handleAddBySession = async () => {
    setLoading(true)
    try {
      await apiFetch('/accounts', {
        method: 'POST',
        body: JSON.stringify({ phone, session_string: session }),
      })
      setOpen(false)
      window.location.reload()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Добавить аккаунт</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить Telegram аккаунт</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="session">
          <TabsList className="w-full">
            <TabsTrigger value="session" className="flex-1">StringSession</TabsTrigger>
            <TabsTrigger value="phone" className="flex-1">Телефон + код</TabsTrigger>
          </TabsList>

          <TabsContent value="session" className="space-y-4 mt-4">
            <div>
              <Label>Номер телефона</Label>
              <Input
                placeholder="+79001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <Label>StringSession</Label>
              <Input
                placeholder="1BQANOTEuA..."
                value={session}
                onChange={(e) => setSession(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                Получить: python create_session.py
              </p>
            </div>
            <Button onClick={handleAddBySession} disabled={loading} className="w-full">
              {loading ? 'Добавляю...' : 'Добавить'}
            </Button>
          </TabsContent>

          <TabsContent value="phone" className="space-y-4 mt-4">
            <p className="text-sm text-gray-500">
              Введите номер телефона — мы отправим код в Telegram
            </p>
            <div>
              <Label>Номер телефона</Label>
              <Input placeholder="+79001234567" />
            </div>
            <Button className="w-full">Отправить код</Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
```

---

## Acceptance criteria

- [ ] `GET /accounts` → возвращает список аккаунтов пользователя (без session_string!)
- [ ] `POST /accounts` → добавляет аккаунт через StringSession, соблюдает лимит тарифа
- [ ] `POST /accounts` сверх лимита → возвращает 403 с понятным сообщением
- [ ] `DELETE /accounts/:id` → удаляет аккаунт, проверяет ownership (user_id)
- [ ] `PATCH /accounts/:id/status` → переключает active/disabled
- [ ] Страница `/accounts` отображает список с цветными статус-бейджами
- [ ] Диалог "Добавить аккаунт" с двумя вкладками работает
- [ ] session_string никогда НЕ возвращается в API ответах
