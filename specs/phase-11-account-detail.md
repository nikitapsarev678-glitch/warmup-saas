# Фаза 11 — Account Detail Panel (детальная панель аккаунта)

> Читай SPEC.md перед началом. Фазы 1, 2, 4 (database, auth, accounts) должны быть выполнены.  
> Эта фаза добавляет: account detail Sheet “как в Contez” (включая **Автопрогрев**), per-account лимиты рассылок, SpamBot-проверку.  
> Работает в `web/app/(dashboard)/accounts/` и `worker/src/routes/accounts.ts` (только дополнения).  
> НЕ трогай: campaigns.ts, billing.ts, analytics.ts, runner/.

## Цель
Добавить детальную боковую панель (Sheet) при клике на аккаунт. Ориентир: Contez.

Табы:
1. **Информация** — статус, username, телефон, даты, тип подключения
2. **Рассылки** — per-account лимиты (дневной, в час, на группу, ЛС) + поведение при достижении лимита
3. **Профиль** — изменение имени/bio/аватара через Telegram API
4. **Прокси** — привязка/отвязка прокси к аккаунту
5. **Пауза** — ручная отлёжка + проверка @SpamBot
6. **Автопрогрев** — toggle “Автопрогрев включён/выключен” + базовые настройки

Дополнительно (можно в отдельной кнопке/модалке, как в Contez): **Логи аккаунта** (tabs по типам задач).

---

## Файл: worker/migrations/0004_account_detail.sql

```sql
-- Добавляем per-account настройки
ALTER TABLE tg_accounts ADD COLUMN daily_limit INTEGER NOT NULL DEFAULT 0;
  -- 0 = без лимита
ALTER TABLE tg_accounts ADD COLUMN hourly_limit INTEGER NOT NULL DEFAULT 20;
  -- сообщений в час
ALTER TABLE tg_accounts ADD COLUMN group_limit INTEGER NOT NULL DEFAULT 10;
  -- макс сообщений в одну группу
ALTER TABLE tg_accounts ADD COLUMN dm_limit INTEGER NOT NULL DEFAULT 10;
  -- дневной лимит личных сообщений
ALTER TABLE tg_accounts ADD COLUMN pause_until TEXT;
  -- ISO timestamp: аккаунт на паузе до этого времени
ALTER TABLE tg_accounts ADD COLUMN spambot_status TEXT;
  -- 'clean'|'spam'|'unknown' (кэш последней проверки)
ALTER TABLE tg_accounts ADD COLUMN spambot_checked_at TEXT;
ALTER TABLE tg_accounts ADD COLUMN bio TEXT;
  -- закэшированный bio из Telegram
ALTER TABLE tg_accounts ADD COLUMN tg_id INTEGER;
  -- числовой Telegram user ID

-- Автопрогрев (как в Contez)
ALTER TABLE tg_accounts ADD COLUMN auto_warmup_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tg_accounts ADD COLUMN auto_warmup_config TEXT;
  -- JSON с настройками автопрогрева (минимально: days, dialogs_per_day, pause_preset, started_at)
```

---

## Новые API-роуты (добавить в worker/src/routes/accounts.ts)

```typescript
// GET /accounts/:id — детали аккаунта (полная запись кроме session_string)
accounts.get('/:id', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)
  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  const { session_string, api_hash, ...safe } = account
  return c.json({ account: safe })
})

// PATCH /accounts/:id/limits — обновить лимиты аккаунта
accounts.patch('/:id/limits', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)
  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  const {
    daily_limit,
    hourly_limit,
    group_limit,
    dm_limit,
  } = await c.req.json<{
    daily_limit?: number
    hourly_limit?: number
    group_limit?: number
    dm_limit?: number
  }>()

  await c.env.DB
    .prepare(`
      UPDATE tg_accounts
      SET
        daily_limit  = COALESCE(?, daily_limit),
        hourly_limit = COALESCE(?, hourly_limit),
        group_limit  = COALESCE(?, group_limit),
        dm_limit     = COALESCE(?, dm_limit)
      WHERE id = ? AND user_id = ?
    `)
    .bind(
      daily_limit ?? null,
      hourly_limit ?? null,
      group_limit ?? null,
      dm_limit ?? null,
      accountId, userId
    )
    .run()

  return c.json({ ok: true })
})

// POST /accounts/:id/pause — поставить на паузу
accounts.post('/:id/pause', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)
  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  const { hours } = await c.req.json<{ hours: number }>()
  if (!hours || hours < 0 || hours > 168) {
    return c.json({ error: 'hours должно быть от 1 до 168' }, 400)
  }

  const pauseUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

  await c.env.DB
    .prepare('UPDATE tg_accounts SET pause_until = ?, status = ? WHERE id = ? AND user_id = ?')
    .bind(pauseUntil, 'disabled', accountId, userId)
    .run()

  return c.json({ ok: true, pause_until: pauseUntil })
})

// POST /accounts/:id/unpause — снять паузу
accounts.post('/:id/unpause', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)
  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  await c.env.DB
    .prepare('UPDATE tg_accounts SET pause_until = NULL, status = ? WHERE id = ? AND user_id = ?')
    .bind('active', accountId, userId)
    .run()

  return c.json({ ok: true })
})

// POST /accounts/:id/check-spambot — триггерит проверку через runner
accounts.post('/:id/check-spambot', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)
  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  // Поставить задачу в очередь
  await c.env.DB
    .prepare(`INSERT INTO task_queue (campaign_id, action, params_json) VALUES (0, 'check_spambot', ?)`)
    .bind(JSON.stringify({ account_id: accountId, user_id: userId }))
    .run()

  await triggerGithubRunner(c.env, 'check_spambot', { account_id: accountId })

  return c.json({ ok: true, message: 'Проверка запущена, результат будет через 30 сек' })
})

// GET /accounts/:id/logs — логи действий аккаунта
accounts.get('/:id/logs', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)
  // Проверить что аккаунт принадлежит пользователю
  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  const { results } = await c.env.DB
    .prepare(`
      SELECT * FROM warmup_actions
      WHERE account_id = ?
      ORDER BY executed_at DESC
      LIMIT 100
    `)
    .bind(accountId)
    .all()

  return c.json({ logs: results })
})

// PATCH /accounts/:id/auto-warmup — включить/выключить автопрогрев + настройки
accounts.patch('/:id/auto-warmup', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)
  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{
    enabled: boolean
    config?: Record<string, unknown> | null
  }>()

  await c.env.DB
    .prepare(`
      UPDATE tg_accounts
      SET
        auto_warmup_enabled = ?,
        auto_warmup_config  = ?
      WHERE id = ? AND user_id = ?
    `)
    .bind(
      body.enabled ? 1 : 0,
      body.config ? JSON.stringify(body.config) : null,
      accountId, userId
    )
    .run()

  return c.json({ ok: true })
})
```

---

## Файл: web/app/(dashboard)/accounts/account-sheet.tsx (новый файл)

```tsx
'use client'

import { useState, useEffect } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'
import type { TgAccount } from '@/lib/types'

interface Props {
  accountId: number | null
  onClose: () => void
}

export function AccountSheet({ accountId, onClose }: Props) {
  const [account, setAccount] = useState<TgAccount | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!accountId) { setAccount(null); return }
    apiFetch<{ account: TgAccount }>(`/accounts/${accountId}`)
      .then(r => setAccount(r.account))
  }, [accountId])

  if (!accountId) return null

  return (
    <Sheet open={!!accountId} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {account && (
          <>
            <SheetHeader className="pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500
                  flex items-center justify-center text-white font-bold text-lg">
                  {(account.first_name?.[0] ?? account.phone[1] ?? '?').toUpperCase()}
                </div>
                <div>
                  <SheetTitle className="text-base">
                    {account.username ? `@${account.username}` : (account.first_name ?? account.phone)}
                  </SheetTitle>
                  <p className="text-sm text-gray-400">{account.phone}</p>
                </div>
              </div>
            </SheetHeader>

            <Tabs defaultValue="info" className="mt-4">
              <TabsList className="w-full grid grid-cols-6 text-xs h-9">
                <TabsTrigger value="info">Инфо</TabsTrigger>
                <TabsTrigger value="mailings">Рассылки</TabsTrigger>
                <TabsTrigger value="profile">Профиль</TabsTrigger>
                <TabsTrigger value="proxy">Прокси</TabsTrigger>
                <TabsTrigger value="pause">Пауза</TabsTrigger>
                <TabsTrigger value="autowarmup">Автопрогрев</TabsTrigger>
              </TabsList>

              {/* ── Таб: Информация ─────────────────────────── */}
              <TabsContent value="info" className="mt-4 space-y-4">
                <InfoTab account={account} />
              </TabsContent>

              {/* ── Таб: Рассылки (лимиты) ─────────────────── */}
              <TabsContent value="mailings" className="mt-4">
                <LimitsTab account={account} onSaved={() => {
                  apiFetch<{ account: TgAccount }>(`/accounts/${accountId}`)
                    .then(r => setAccount(r.account))
                }} />
              </TabsContent>

              {/* ── Таб: Прокси ─────────────────────────────── */}
              <TabsContent value="proxy" className="mt-4">
                <ProxyTab account={account} onSaved={() => {
                  apiFetch<{ account: TgAccount }>(`/accounts/${accountId}`)
                    .then(r => setAccount(r.account))
                }} />
              </TabsContent>

              {/* ── Таб: Пауза ──────────────────────────────── */}
              <TabsContent value="pause" className="mt-4">
                <PauseTab account={account} onSaved={() => {
                  apiFetch<{ account: TgAccount }>(`/accounts/${accountId}`)
                    .then(r => setAccount(r.account))
                }} />
              </TabsContent>

              {/* ── Таб: Логи ───────────────────────────────── */}
              <TabsContent value="logs" className="mt-4">
                <LogsTab accountId={account.id} />
              </TabsContent>
            </Tabs>
          </>
        )}
        {!account && (
          <div className="flex items-center justify-center h-40 text-gray-400">
            Загрузка...
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ── InfoTab ───────────────────────────────────────────────────────
function InfoTab({ account }: { account: TgAccount }) {
  const STATUS_COLORS: Record<string, string> = {
    active:     'bg-green-100 text-green-700',
    warming:    'bg-orange-100 text-orange-700',
    warmed:     'bg-blue-100 text-blue-700',
    spam_block: 'bg-red-100 text-red-700',
    banned:     'bg-red-100 text-red-700',
    disabled:   'bg-gray-100 text-gray-600',
    pending:    'bg-gray-100 text-gray-600',
  }
  const statusColor = STATUS_COLORS[account.status] ?? 'bg-gray-100 text-gray-600'
  const isPaused = account.pause_until && new Date(account.pause_until) > new Date()

  return (
    <div className="space-y-4">
      {/* Статус блок */}
      <div className={`rounded-xl p-4 ${statusColor}`}>
        <div className="font-semibold text-sm mb-0.5">
          {isPaused ? 'На паузе' : account.status === 'active' ? 'Аккаунт активен' : account.status}
        </div>
        <div className="text-xs opacity-75">
          {isPaused
            ? `До ${new Date(account.pause_until!).toLocaleString('ru-RU', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}`
            : 'Готов к работе'
          }
        </div>
      </div>

      {/* Grid данных */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Username', value: account.username ? `@${account.username}` : '—' },
          { label: 'Телефон', value: account.phone },
          { label: 'Сообщений', value: String(account.messages_sent) },
          { label: 'Добавлен', value: new Date(account.created_at).toLocaleDateString('ru-RU') },
        ].map(item => (
          <div key={item.label} className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-0.5">{item.label}</div>
            <div className="text-sm font-medium text-gray-800 truncate">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Прокси */}
      {account.proxy && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-0.5">Прокси</div>
          <div className="text-sm font-medium text-gray-800">
            {(() => {
              try {
                const p = JSON.parse(account.proxy)
                return `${p.type}://${p.host}:${p.port}`
              } catch { return account.proxy }
            })()}
          </div>
        </div>
      )}

      {/* Причина блока */}
      {account.block_reason && (
        <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">
          <span className="font-medium">Причина блока: </span>
          {account.block_reason}
        </div>
      )}
    </div>
  )
}

// ── LimitsTab ─────────────────────────────────────────────────────
function LimitsTab({ account, onSaved }: { account: TgAccount & {
  daily_limit?: number; hourly_limit?: number; group_limit?: number; dm_limit?: number
}, onSaved: () => void }) {
  const [daily, setDaily] = useState(account.daily_limit ?? 0)
  const [hourly, setHourly] = useState(account.hourly_limit ?? 20)
  const [group, setGroup] = useState(account.group_limit ?? 10)
  const [dm, setDm] = useState(account.dm_limit ?? 10)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch(`/accounts/${account.id}/limits`, {
        method: 'PATCH',
        body: JSON.stringify({
          daily_limit: daily,
          hourly_limit: hourly,
          group_limit: group,
          dm_limit: dm,
        }),
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <LimitField
        label="Дневной лимит рассылки"
        desc="0 = без лимита"
        value={daily}
        onChange={setDaily}
        presets={[0, 50, 100, 200, 500, 1000]}
        presetLabels={['∞', '50', '100', '200', '500', '1000']}
        unit="сообщ/день"
      />
      <LimitField
        label="Лимит в час"
        desc="Защита от спам-блока"
        value={hourly}
        onChange={setHourly}
        presets={[10, 20, 30, 50, 100]}
        unit="сообщ/час"
      />
      <LimitField
        label="Лимит на группу"
        desc="Макс. сообщений в одну группу за день"
        value={group}
        onChange={setGroup}
        presets={[1, 3, 5, 10, 20]}
        unit="сообщ/группу"
      />
      <LimitField
        label="Лимит ЛС"
        desc="Дневной лимит личных сообщений"
        value={dm}
        onChange={setDm}
        presets={[0, 10, 20, 50, 100, 200]}
        presetLabels={['∞', '10', '20', '50', '100', '200']}
        unit="сообщ/день"
      />

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? 'Сохранение...' : 'Сохранить лимиты'}
      </Button>
    </div>
  )
}

function LimitField({
  label, desc, value, onChange, presets, presetLabels, unit
}: {
  label: string; desc: string; value: number; onChange: (v: number) => void
  presets: number[]; presetLabels?: string[]; unit: string
}) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number" min={0} value={value}
          onChange={e => onChange(+e.target.value)}
          className="w-24"
        />
        <span className="text-xs text-gray-400">{unit}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p, i) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
              value === p
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {presetLabels?.[i] ?? String(p)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── ProxyTab ──────────────────────────────────────────────────────
function ProxyTab({ account, onSaved }: { account: TgAccount; onSaved: () => void }) {
  const [type, setType] = useState('socks5')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('1080')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (account.proxy) {
      try {
        const p = JSON.parse(account.proxy)
        setType(p.type ?? 'socks5')
        setHost(p.host ?? '')
        setPort(String(p.port ?? 1080))
        setUser(p.user ?? '')
        setPass(p.pass ?? '')
      } catch {}
    }
  }, [account.proxy])

  const save = async () => {
    setSaving(true)
    try {
      const proxy = host ? JSON.stringify({ type, host, port: +port, user: user || undefined, pass: pass || undefined }) : null
      await apiFetch(`/accounts/${account.id}/proxy`, {
        method: 'PATCH',
        body: JSON.stringify({ proxy }),
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    try {
      await apiFetch(`/accounts/${account.id}/proxy`, {
        method: 'PATCH',
        body: JSON.stringify({ proxy: null }),
      })
      setHost(''); setUser(''); setPass('')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 rounded-xl p-4 text-sm text-purple-700">
        Используйте прокси для маршрутизации трафика аккаунта через отдельный сервер.
        Повышает безопасность и помогает обходить ограничения.
      </div>

      <div>
        <Label>Тип прокси</Label>
        <div className="flex gap-2 mt-1.5">
          {['socks5', 'http'].map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                type === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200'
              }`}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <Label>Хост</Label>
          <Input placeholder="proxy.example.com" value={host} onChange={e => setHost(e.target.value)} />
        </div>
        <div>
          <Label>Порт</Label>
          <Input type="number" value={port} onChange={e => setPort(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Логин <span className="text-gray-400">(опц.)</span></Label>
          <Input value={user} onChange={e => setUser(e.target.value)} />
        </div>
        <div>
          <Label>Пароль <span className="text-gray-400">(опц.)</span></Label>
          <Input type="password" value={pass} onChange={e => setPass(e.target.value)} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving} className="flex-1">
          {saving ? '...' : 'Сохранить прокси'}
        </Button>
        {account.proxy && (
          <Button variant="outline" onClick={remove} disabled={saving}>
            Удалить
          </Button>
        )}
      </div>
    </div>
  )
}

// ── PauseTab ──────────────────────────────────────────────────────
function PauseTab({ account, onSaved }: { account: TgAccount & { pause_until?: string }; onSaved: () => void }) {
  const [hours, setHours] = useState(24)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)

  const isPaused = account.pause_until && new Date(account.pause_until) > new Date()

  const handlePause = async () => {
    setLoading(true)
    try {
      await apiFetch(`/accounts/${account.id}/pause`, {
        method: 'POST',
        body: JSON.stringify({ hours }),
      })
      onSaved()
    } finally {
      setLoading(false)
    }
  }

  const handleUnpause = async () => {
    setLoading(true)
    try {
      await apiFetch(`/accounts/${account.id}/unpause`, { method: 'POST' })
      onSaved()
    } finally {
      setLoading(false)
    }
  }

  const handleCheckSpambot = async () => {
    setChecking(true)
    try {
      await apiFetch(`/accounts/${account.id}/check-spambot`, { method: 'POST' })
      alert('Проверка запущена. Результат появится через ~30 секунд.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Статус */}
      <div className={`rounded-xl p-4 ${isPaused ? 'bg-orange-50' : 'bg-green-50'}`}>
        <div className={`font-semibold text-sm ${isPaused ? 'text-orange-700' : 'text-green-700'}`}>
          {isPaused ? 'Аккаунт на паузе' : 'Аккаунт активен'}
        </div>
        <div className={`text-xs mt-0.5 ${isPaused ? 'text-orange-600' : 'text-green-600'}`}>
          {isPaused
            ? `До: ${new Date(account.pause_until!).toLocaleString('ru-RU')}`
            : 'Пауза не установлена, аккаунт готов к работе'}
        </div>
      </div>

      {/* SpamBot проверка */}
      <div className="border rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Проверка @SpamBot</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {(account as any).spambot_status === 'clean' ? '✅ Чистый' :
             (account as any).spambot_status === 'spam' ? '❌ Спам-блок' :
             'Статус неизвестен'}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleCheckSpambot} disabled={checking}>
          {checking ? '...' : 'Проверить'}
        </Button>
      </div>

      {/* Инфо о паузе */}
      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500 leading-relaxed">
        Пауза — временная приостановка активности аккаунта.
        Автоматически включается при PEER_FLOOD (проверка каждую минуту 20 мин),
        достижении дневного лимита или спамблоке.
      </div>

      {/* Установить паузу */}
      {!isPaused && (
        <div className="space-y-3">
          <Label>Установить паузу</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number" min={1} max={168} value={hours}
              onChange={e => setHours(+e.target.value)}
              className="w-24"
            />
            <span className="text-sm text-gray-400">часов</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[1, 6, 12, 24, 48, 72].map(h => (
              <button key={h} type="button" onClick={() => setHours(h)}
                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                  hours === h ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 hover:border-gray-300'
                }`}>
                {h}ч
              </button>
            ))}
          </div>
          <Button
            onClick={handlePause}
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
          >
            {loading ? '...' : 'Поставить на отлёжку'}
          </Button>
        </div>
      )}

      {isPaused && (
        <Button variant="outline" onClick={handleUnpause} disabled={loading} className="w-full">
          {loading ? '...' : 'Снять паузу'}
        </Button>
      )}

      {/* Автоматическая пауза инфо */}
      <div className="border rounded-xl p-4">
        <div className="text-sm font-medium text-blue-700 mb-2">⚡ Автоматическая отлёжка</div>
        <ul className="text-xs text-blue-600 space-y-1">
          <li>• Достижение дневного лимита любого типа</li>
          <li>• Получение временного спамблока</li>
          <li>• Ошибки PEER_FLOOD или FLOOD_WAIT</li>
        </ul>
      </div>
    </div>
  )
}

// ── LogsTab ───────────────────────────────────────────────────────
function LogsTab({ accountId }: { accountId: number }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<{ logs: any[] }>(`/accounts/${accountId}/logs`)
      .then(r => setLogs(r.logs))
      .finally(() => setLoading(false))
  }, [accountId])

  const ACTION_ICONS: Record<string, string> = {
    join_group: '👥', read_messages: '📖', reaction: '❤️',
    dialog_sent: '💬', story_view: '👁', profile_updated: '✏️',
  }

  if (loading) return <div className="text-center text-gray-400 py-8">Загрузка...</div>

  if (!logs.length) {
    return (
      <div className="text-center text-gray-400 py-12">
        <div className="text-4xl mb-3">📋</div>
        <div className="text-sm">Нет логов</div>
        <div className="text-xs mt-1">Логи появятся после запуска прогрева</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div key={log.id} className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
          log.status === 'error' ? 'bg-red-50' : 'bg-gray-50'
        }`}>
          <span className="text-base mt-0.5">{ACTION_ICONS[log.action_type] ?? '⚡'}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-700">
              {log.action_type.replace(/_/g, ' ')}
              {log.target && <span className="text-gray-400 font-normal ml-1">→ {log.target}</span>}
            </div>
            {log.error_text && <div className="text-xs text-red-600 mt-0.5">{log.error_text}</div>}
          </div>
          <div className="text-xs text-gray-400 shrink-0">
            {new Date(log.executed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

## Обновить web/app/(dashboard)/accounts/page.tsx

Добавить Sheet и обработчик клика:

```tsx
// Добавить в AccountsPage:
'use client'  // страница становится client (или вынести в отдельный wrapper)
import { useState } from 'react'
import { AccountSheet } from './account-sheet'

// В компоненте:
const [selectedId, setSelectedId] = useState<number | null>(null)

// В карточке аккаунта — сделать строку кликабельной:
<Card key={acc.id} className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
  onClick={() => setSelectedId(acc.id)}>

// После списка карточек:
<AccountSheet accountId={selectedId} onClose={() => setSelectedId(null)} />
```

Добавить shadcn компонент Sheet:
```bash
cd web && npx shadcn@latest add sheet
```

---

## Обновить web/lib/types.ts

Добавить к интерфейсу `TgAccount`:
```typescript
// Добавить поля в TgAccount:
daily_limit?: number
hourly_limit?: number
group_limit?: number
dm_limit?: number
pause_until?: string | null
spambot_status?: 'clean' | 'spam' | 'unknown' | null
spambot_checked_at?: string | null
bio?: string | null
tg_id?: number | null
```

---

## Acceptance criteria

- [ ] Клик на карточку аккаунта → открывается Sheet справа
- [ ] Таб "Инфо": статус (цветной блок), grid 2x2 с данными, причина блока если есть
- [ ] Таб "Лимиты": 4 поля с пресетами, кнопка "Сохранить лимиты"
- [ ] `PATCH /accounts/:id/limits` → обновляет поля, возвращает `{ok:true}`
- [ ] Таб "Прокси": форма с хостом/портом/логином/паролем, сохранение и удаление
- [ ] Таб "Пауза": показывает текущий статус паузы, форма с пресетами часов
- [ ] `POST /accounts/:id/pause` → ставит pause_until, статус → disabled
- [ ] `POST /accounts/:id/unpause` → сбрасывает pause_until, статус → active
- [ ] Кнопка "Проверить" SpamBot → триггерит задачу (не крэшится если runner офлайн)
- [ ] Таб "Логи": список последних 100 действий, пустой стейт если нет
- [ ] `GET /accounts/:id/logs` → 404 если аккаунт не принадлежит пользователю
- [ ] Sheet закрывается при клике вне или на ×
