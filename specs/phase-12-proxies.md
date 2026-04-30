# Фаза 12 — Proxy Manager (менеджер прокси)

> Читай SPEC.md перед началом. Фазы 1, 2 (database, auth) должны быть выполнены.  
> Эта фаза добавляет: таблицу proxies, роут /proxies, страницу /proxies в дашборде.  
> НЕ трогай: accounts.ts, campaigns.ts, billing.ts, analytics.ts, runner/.

## Цель
Отдельная страница управления прокси-серверами. Прокси хранятся как отдельные сущности
и привязываются к аккаунтам. Поддерживается bulk-импорт, ручное добавление.

---

## Файл: worker/migrations/0005_proxies.sql

```sql
-- Прокси серверы (принадлежат пользователю)
CREATE TABLE IF NOT EXISTS proxies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'socks5',
    -- 'socks5' | 'http' | 'https'
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password TEXT,
  label TEXT,
    -- опциональное человеческое название
  status TEXT NOT NULL DEFAULT 'unknown',
    -- 'unknown' | 'active' | 'dead'
  last_checked_at TEXT,
  latency_ms INTEGER,
    -- задержка в мс (последняя проверка)
  accounts_count INTEGER NOT NULL DEFAULT 0,
    -- кол-во аккаунтов использующих этот прокси
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_proxies_user ON proxies(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_proxies_unique ON proxies(user_id, host, port);

-- Убрать proxy из tg_accounts (заменить на ссылку)
-- ВАЖНО: НЕ удалять поле proxy из tg_accounts — оно используется runner/
-- Вместо этого добавляем FK ссылку
ALTER TABLE tg_accounts ADD COLUMN proxy_id INTEGER REFERENCES proxies(id) ON DELETE SET NULL;
```

---

## Файл: worker/src/routes/proxies.ts (новый файл)

```typescript
import { Hono } from 'hono'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import type { Env } from '../index'

interface Proxy {
  id: number
  user_id: number
  type: string
  host: string
  port: number
  username: string | null
  password: string | null
  label: string | null
  status: string
  last_checked_at: string | null
  latency_ms: number | null
  accounts_count: number
  created_at: string
}

const proxies = new Hono<{ Bindings: Env } & AuthContext>()
proxies.use('*', requireAuth)

// GET /proxies — список прокси пользователя
proxies.get('/', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare(`
      SELECT p.*, COUNT(a.id) as accounts_count
      FROM proxies p
      LEFT JOIN tg_accounts a ON a.proxy_id = p.id AND a.status != 'banned'
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `)
    .bind(userId)
    .all<Proxy>()

  // Не отдаём пароли
  const safe = results.map(({ password, ...rest }) => rest)
  return c.json({ proxies: safe })
})

// POST /proxies — добавить один прокси
proxies.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    type: string
    host: string
    port: number
    username?: string
    password?: string
    label?: string
  }>()

  if (!body.host || !body.port) {
    return c.json({ error: 'host и port обязательны' }, 400)
  }

  const validTypes = ['socks5', 'http', 'https']
  if (!validTypes.includes(body.type)) {
    return c.json({ error: 'type должен быть socks5, http или https' }, 400)
  }

  try {
    const result = await c.env.DB
      .prepare(`
        INSERT INTO proxies (user_id, type, host, port, username, password, label)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        userId,
        body.type,
        body.host.trim(),
        body.port,
        body.username ?? null,
        body.password ?? null,
        body.label ?? null
      )
      .run()

    return c.json({ ok: true, proxy_id: result.meta.last_row_id }, 201)
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return c.json({ error: 'Такой прокси уже добавлен' }, 409)
    }
    throw e
  }
})

// POST /proxies/bulk — bulk-импорт из текста (host:port или host:port:user:pass)
proxies.post('/bulk', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    lines: string       // текст, каждая строка = один прокси
    type: string        // тип по умолчанию: 'socks5'
  }>()

  const type = body.type ?? 'socks5'
  const lines = body.lines
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))

  const added: number[] = []
  const errors: string[] = []

  for (const line of lines) {
    try {
      let host: string, port: number, username: string | null = null, password: string | null = null

      // Форматы:
      // host:port
      // host:port:user:pass
      // type://user:pass@host:port
      if (line.includes('://')) {
        const url = new URL(line)
        host = url.hostname
        port = parseInt(url.port, 10)
        username = url.username || null
        password = url.password || null
      } else {
        const parts = line.split(':')
        if (parts.length < 2) { errors.push(`Неверный формат: ${line}`); continue }
        host = parts[0]
        port = parseInt(parts[1], 10)
        username = parts[2] ?? null
        password = parts[3] ?? null
      }

      if (!host || isNaN(port) || port < 1 || port > 65535) {
        errors.push(`Неверный адрес: ${line}`)
        continue
      }

      const result = await c.env.DB
        .prepare(`
          INSERT OR IGNORE INTO proxies (user_id, type, host, port, username, password)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(userId, type, host, port, username, password)
        .run()

      if (result.meta.changes > 0) {
        added.push(result.meta.last_row_id as number)
      }
    } catch (e: any) {
      errors.push(`Ошибка: ${line} — ${e.message}`)
    }
  }

  return c.json({ added: added.length, errors })
})

// DELETE /proxies/:id — удалить прокси
proxies.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const proxyId = parseInt(c.req.param('id'), 10)

  const proxy = await c.env.DB
    .prepare('SELECT id FROM proxies WHERE id = ? AND user_id = ?')
    .bind(proxyId, userId)
    .first()
  if (!proxy) return c.json({ error: 'Not found' }, 404)

  // Отвязать от аккаунтов
  await c.env.DB
    .prepare('UPDATE tg_accounts SET proxy_id = NULL WHERE proxy_id = ? AND user_id = ?')
    .bind(proxyId, userId)
    .run()

  await c.env.DB
    .prepare('DELETE FROM proxies WHERE id = ? AND user_id = ?')
    .bind(proxyId, userId)
    .run()

  return c.json({ ok: true })
})

// POST /proxies/:id/assign — привязать прокси к аккаунту
proxies.post('/:id/assign', async (c) => {
  const userId = c.get('userId')
  const proxyId = parseInt(c.req.param('id'), 10)
  const { account_id } = await c.req.json<{ account_id: number }>()

  // Проверить что прокси и аккаунт принадлежат пользователю
  const [proxy, account] = await Promise.all([
    c.env.DB.prepare('SELECT id, host, port, type, username, password FROM proxies WHERE id = ? AND user_id = ?')
      .bind(proxyId, userId).first<{ id: number; host: string; port: number; type: string; username: string | null; password: string | null }>(),
    c.env.DB.prepare('SELECT id FROM tg_accounts WHERE id = ? AND user_id = ?')
      .bind(account_id, userId).first(),
  ])

  if (!proxy) return c.json({ error: 'Прокси не найден' }, 404)
  if (!account) return c.json({ error: 'Аккаунт не найден' }, 404)

  // Обновить proxy_id и proxy JSON (для совместимости с runner)
  const proxyJson = JSON.stringify({
    type: proxy.type,
    host: proxy.host,
    port: proxy.port,
    user: proxy.username ?? undefined,
    pass: proxy.password ?? undefined,
  })

  await c.env.DB
    .prepare('UPDATE tg_accounts SET proxy_id = ?, proxy = ? WHERE id = ? AND user_id = ?')
    .bind(proxyId, proxyJson, account_id, userId)
    .run()

  return c.json({ ok: true })
})

// POST /proxies/:id/unassign — отвязать от аккаунта
proxies.post('/:id/unassign', async (c) => {
  const userId = c.get('userId')
  const { account_id } = await c.req.json<{ account_id: number }>()

  const account = await c.env.DB
    .prepare('SELECT id FROM tg_accounts WHERE id = ? AND user_id = ?')
    .bind(account_id, userId).first()
  if (!account) return c.json({ error: 'Аккаунт не найден' }, 404)

  await c.env.DB
    .prepare('UPDATE tg_accounts SET proxy_id = NULL, proxy = NULL WHERE id = ? AND user_id = ?')
    .bind(account_id, userId)
    .run()

  return c.json({ ok: true })
})

export default proxies
```

---

## Подключить в worker/src/index.ts

```typescript
import proxiesRoutes from './routes/proxies'
app.route('/proxies', proxiesRoutes)
```

---

## Файл: web/app/(dashboard)/proxies/page.tsx (новый файл)

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'
import { Globe, Plus, Trash2, Upload } from 'lucide-react'

interface ProxyItem {
  id: number
  type: string
  host: string
  port: number
  username: string | null
  label: string | null
  status: string
  latency_ms: number | null
  accounts_count: number
  created_at: string
}

export default function ProxiesPage() {
  const [proxies, setProxies] = useState<ProxyItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    apiFetch<{ proxies: ProxyItem[] }>('/proxies')
      .then(r => setProxies(r.proxies))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить прокси? Он будет отвязан от всех аккаунтов.')) return
    await apiFetch(`/proxies/${id}`, { method: 'DELETE' })
    load()
  }

  const total = proxies.length
  const active = proxies.filter(p => p.status === 'active').length

  return (
    <div>
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Прокси менеджер</h1>
          <p className="text-gray-500 text-sm">Управление прокси-серверами</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportProxiesDialog onImported={load} />
          <AddProxyDialog onAdded={load} />
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{total}</div>
          <div className="text-xs text-gray-400 mt-1">Всего</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{active}</div>
          <div className="text-xs text-gray-400 mt-1">Работает</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">
            {proxies.reduce((sum, p) => sum + p.accounts_count, 0)}
          </div>
          <div className="text-xs text-gray-400 mt-1">Аккаунтов</div>
        </Card>
      </div>

      {/* Таблица прокси */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Загрузка...</div>
      ) : proxies.length === 0 ? (
        <Card className="p-12 text-center">
          <Globe className="w-10 h-10 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-400 mb-4">Нет прокси. Добавьте первый прокси.</p>
          <AddProxyDialog onAdded={load} />
        </Card>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Прокси</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Тип</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Статус</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Аккаунтов</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {proxies.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {p.label ?? `${p.host}:${p.port}`}
                    </div>
                    {p.label && (
                      <div className="text-xs text-gray-400">{p.host}:{p.port}</div>
                    )}
                    {p.username && (
                      <div className="text-xs text-gray-400">@{p.username}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="uppercase text-xs">
                      {p.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${
                        p.status === 'active' ? 'bg-green-400' :
                        p.status === 'dead' ? 'bg-red-400' :
                        'bg-gray-300'
                      }`} />
                      <span className="text-gray-600 capitalize">
                        {p.status === 'active' ? 'Работает' :
                         p.status === 'dead' ? 'Недоступен' : 'Неизвестен'}
                      </span>
                      {p.latency_ms !== null && (
                        <span className="text-xs text-gray-400">{p.latency_ms}ms</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.accounts_count}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Диалог добавления одного прокси ──────────────────────────────
function AddProxyDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('socks5')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('1080')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [label, setLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAdd = async () => {
    setError('')
    if (!host || !port) { setError('Укажите хост и порт'); return }
    setLoading(true)
    try {
      await apiFetch('/proxies', {
        method: 'POST',
        body: JSON.stringify({
          type, host: host.trim(),
          port: parseInt(port, 10),
          username: username || undefined,
          password: password || undefined,
          label: label || undefined,
        }),
      })
      setOpen(false)
      setHost(''); setPort('1080'); setUsername(''); setPassword(''); setLabel('')
      onAdded()
    } catch (e: any) {
      setError(e.message ?? 'Ошибка добавления')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Добавить
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Добавить прокси</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Тип */}
          <div>
            <Label>Тип</Label>
            <div className="flex gap-2 mt-1.5">
              {['socks5', 'http', 'https'].map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    type === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200'
                  }`}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Хост + порт */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label>Хост</Label>
              <Input placeholder="proxy.example.com" value={host}
                onChange={e => setHost(e.target.value)} />
            </div>
            <div>
              <Label>Порт</Label>
              <Input type="number" value={port} onChange={e => setPort(e.target.value)} />
            </div>
          </div>

          {/* Auth */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Логин <span className="text-gray-400 text-xs">(опц.)</span></Label>
              <Input value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div>
              <Label>Пароль <span className="text-gray-400 text-xs">(опц.)</span></Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          </div>

          {/* Label */}
          <div>
            <Label>Название <span className="text-gray-400 text-xs">(опц.)</span></Label>
            <Input placeholder="Мой прокси #1" value={label} onChange={e => setLabel(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button onClick={handleAdd} disabled={loading} className="w-full">
            {loading ? 'Добавляю...' : 'Добавить'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Диалог bulk-импорта прокси ────────────────────────────────────
function ImportProxiesDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('socks5')
  const [lines, setLines] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ added: number; errors: string[] } | null>(null)

  const handleImport = async () => {
    if (!lines.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await apiFetch<{ added: number; errors: string[] }>('/proxies/bulk', {
        method: 'POST',
        body: JSON.stringify({ lines, type }),
      })
      setResult(res)
      if (res.added > 0) onImported()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="w-4 h-4 mr-2" />
          Импорт
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Импорт прокси</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Тип по умолчанию */}
          <div>
            <Label>Тип по умолчанию</Label>
            <div className="flex gap-2 mt-1.5">
              {['socks5', 'http'].map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    type === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200'
                  }`}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Список прокси (по одному на строку)</Label>
            <Textarea
              className="mt-1.5 font-mono text-sm"
              rows={8}
              placeholder={`Форматы:\nhost:port\nhost:port:user:pass\nsocks5://user:pass@host:port`}
              value={lines}
              onChange={e => setLines(e.target.value)}
            />
          </div>

          {result && (
            <div className={`rounded-lg p-3 text-sm ${result.added > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
              <div className="font-medium">Добавлено: {result.added}</div>
              {result.errors.length > 0 && (
                <div className="mt-1 text-xs text-red-600">
                  {result.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                  {result.errors.length > 5 && <div>...и ещё {result.errors.length - 5} ошибок</div>}
                </div>
              )}
            </div>
          )}

          <Button onClick={handleImport} disabled={loading || !lines.trim()} className="w-full">
            {loading ? 'Импортирую...' : 'Тестировать и импортировать'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

---

## Обновить sidebar (web/components/sidebar.tsx)

Проверить что "Прокси" уже есть в навигации (см. обновлённый NAV в Фазе 6).  
Если ссылки ещё нет — добавить "Прокси" в навигацию:

```typescript
// Найти массив NAV и добавить после аккаунтов:
{ href: '/proxies',   icon: '🛡️', label: 'Прокси' },
```

---

## Acceptance criteria

- [ ] Таблица `proxies` создана с UNIQUE(user_id, host, port)
- [ ] `GET /proxies` → список прокси пользователя (без паролей!)
- [ ] `POST /proxies` с корректными данными → создаёт прокси, 201
- [ ] `POST /proxies` с дублем (тот же host:port) → 409
- [ ] `POST /proxies/bulk` с 5 строками "host:port" → `{added: 5, errors: []}`
- [ ] `POST /proxies/bulk` с неверными строками → ошибки в errors[], не крэшится
- [ ] `DELETE /proxies/:id` → удаляет, отвязывает от аккаунтов (proxy_id = NULL)
- [ ] `DELETE /proxies/:id` чужого пользователя → 404
- [ ] `POST /proxies/:id/assign` → proxy_id и proxy JSON обновились у аккаунта
- [ ] Страница `/proxies` отображает таблицу с 5 колонками
- [ ] 3 stat-карточки показывают Всего/Работает/Аккаунтов
- [ ] Диалог "Добавить" — форма с типом, хостом, портом, auth
- [ ] Диалог "Импорт" — textarea + кнопка, показывает результат добавления
- [ ] Кнопка удаления с confirm-диалогом
- [ ] Sidebar содержит ссылку на /proxies
