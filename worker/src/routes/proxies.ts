import { Hono } from 'hono'
import { enforceUserActionCooldown } from '../db'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import type { Env } from '../index'
import { triggerGithubPollRunner } from './notifications'

type ProxyRow = {
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

type SafeProxyRow = Omit<ProxyRow, 'password'>

const VALID_TYPES = ['socks5', 'http', 'https'] as const

const proxies = new Hono<{ Bindings: Env } & AuthContext>()

proxies.use('*', requireAuth)

proxies.get('/', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare(
      `
        SELECT
          p.id,
          p.user_id,
          p.type,
          p.host,
          p.port,
          p.username,
          p.password,
          p.label,
          p.status,
          p.last_checked_at,
          p.latency_ms,
          COUNT(a.id) AS accounts_count,
          p.created_at
        FROM proxies p
        LEFT JOIN tg_accounts a ON a.proxy_id = p.id AND a.user_id = p.user_id AND a.status != 'banned'
        WHERE p.user_id = ?
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `
    )
    .bind(userId)
    .all<ProxyRow>()

  const proxiesList: SafeProxyRow[] = results.map(({ password, ...proxy }) => ({
    ...proxy,
    accounts_count: Number(proxy.accounts_count ?? 0),
    port: Number(proxy.port),
    id: Number(proxy.id),
    user_id: Number(proxy.user_id),
  }))

  return c.json({ proxies: proxiesList })
})

proxies.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    type?: string
    host?: string
    port?: number
    username?: string
    password?: string
    label?: string
  }>()

  const type = body.type ?? 'socks5'
  const host = body.host?.trim() ?? ''
  const port = Number(body.port)

  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return c.json({ error: 'type должен быть socks5, http или https' }, 400)
  }

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return c.json({ error: 'host и корректный port обязательны' }, 400)
  }

  try {
    const result = await c.env.DB
      .prepare(
        `
          INSERT INTO proxies (user_id, type, host, port, username, password, label)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        userId,
        type,
        host,
        port,
        normalizeOptional(body.username),
        normalizeOptional(body.password),
        normalizeOptional(body.label)
      )
      .run()

    return c.json({ ok: true, proxy_id: result.meta.last_row_id }, 201)
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      return c.json({ error: 'Такой прокси уже добавлен' }, 409)
    }

    throw error
  }
})

proxies.post('/bulk', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ lines?: string; type?: string }>()
  const type = body.type ?? 'socks5'

  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return c.json({ error: 'type должен быть socks5, http или https' }, 400)
  }

  const lines = (body.lines ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  const errors: string[] = []
  let added = 0

  for (const line of lines) {
    try {
      const parsed = parseProxyLine(line, type)
      if (!parsed) {
        errors.push(`Неверный формат: ${line}`)
        continue
      }

      const result = await c.env.DB
        .prepare(
          `
            INSERT OR IGNORE INTO proxies (user_id, type, host, port, username, password)
            VALUES (?, ?, ?, ?, ?, ?)
          `
        )
        .bind(userId, parsed.type, parsed.host, parsed.port, parsed.username, parsed.password)
        .run()

      if (result.meta.changes > 0) {
        added += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      errors.push(`Ошибка: ${line} — ${message}`)
    }
  }

  return c.json({ added, errors })
})

proxies.post('/check', async (c) => {
  const userId = c.get('userId')
  const cooldown = await enforceUserActionCooldown(c.env.DB, {
    userId,
    action: 'proxies_check',
    cooldownSeconds: 60,
  })

  if (!cooldown.ok) {
    return c.json(
      {
        error: 'Проверка прокси уже запускалась совсем недавно',
        reason: 'cooldown_active',
        next_action: 'Подождите минуту и повторите проверку.',
        retry_after_seconds: cooldown.retryAfterSeconds,
      },
      429
    )
  }

  const existing = await c.env.DB
    .prepare(
      `
        SELECT id
        FROM task_queue
        WHERE action = 'check_proxies'
          AND status IN ('queued', 'running')
          AND json_extract(params_json, '$.user_id') = ?
        ORDER BY id DESC
        LIMIT 1
      `
    )
    .bind(userId)
    .first<{ id: number }>()

  if (existing) {
    return c.json({ ok: true, queued: true, message: 'Проверка уже выполняется или стоит в очереди' })
  }

  await c.env.DB
    .prepare(
      `
        INSERT INTO task_queue (campaign_id, action, params_json)
        VALUES (NULL, 'check_proxies', ?)
      `
    )
    .bind(JSON.stringify({ user_id: userId }))
    .run()

  const githubResponse = await triggerGithubPollRunner(c.env)
  if (!githubResponse.ok) {
    return c.json(
      {
        ok: false,
        queued: true,
        message: 'Проверка поставлена в очередь, но runner сейчас недоступен',
        reason: 'runner_unavailable',
        next_action: 'Проверьте статус runner или повторите чуть позже.',
      },
      202
    )
  }

  return c.json({ ok: true, queued: true, message: 'Проверка прокси запущена' })
})

proxies.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const proxyId = Number(c.req.param('id'))

  if (!Number.isInteger(proxyId) || proxyId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const proxy = await c.env.DB
    .prepare('SELECT id FROM proxies WHERE id = ? AND user_id = ?')
    .bind(proxyId, userId)
    .first()

  if (!proxy) {
    return c.json({ error: 'Not found' }, 404)
  }

  await c.env.DB
    .prepare('UPDATE tg_accounts SET proxy_id = NULL, proxy = NULL WHERE proxy_id = ? AND user_id = ?')
    .bind(proxyId, userId)
    .run()

  await c.env.DB
    .prepare('DELETE FROM proxies WHERE id = ? AND user_id = ?')
    .bind(proxyId, userId)
    .run()

  return c.json({ ok: true })
})

proxies.post('/:id/assign', async (c) => {
  const userId = c.get('userId')
  const proxyId = Number(c.req.param('id'))
  const body = await c.req.json<{ account_id?: number }>()
  const accountId = Number(body.account_id)

  if (!Number.isInteger(proxyId) || proxyId <= 0 || !Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid ids' }, 400)
  }

  const [proxy, account] = await Promise.all([
    c.env.DB
      .prepare('SELECT id, type, host, port, username, password FROM proxies WHERE id = ? AND user_id = ?')
      .bind(proxyId, userId)
      .first<Pick<ProxyRow, 'id' | 'type' | 'host' | 'port' | 'username' | 'password'>>(),
    c.env.DB
      .prepare('SELECT id FROM tg_accounts WHERE id = ? AND user_id = ?')
      .bind(accountId, userId)
      .first(),
  ])

  if (!proxy) {
    return c.json({ error: 'Прокси не найден' }, 404)
  }

  if (!account) {
    return c.json({ error: 'Аккаунт не найден' }, 404)
  }

  const proxyJson = JSON.stringify({
    type: proxy.type,
    host: proxy.host,
    port: Number(proxy.port),
    user: proxy.username ?? undefined,
    pass: proxy.password ?? undefined,
  })

  await c.env.DB
    .prepare('UPDATE tg_accounts SET proxy_id = ?, proxy = ? WHERE id = ? AND user_id = ?')
    .bind(proxyId, proxyJson, accountId, userId)
    .run()

  return c.json({ ok: true })
})

proxies.post('/:id/unassign', async (c) => {
  const userId = c.get('userId')
  const proxyId = Number(c.req.param('id'))
  const body = await c.req.json<{ account_id?: number }>()
  const accountId = Number(body.account_id)

  if (!Number.isInteger(proxyId) || proxyId <= 0 || !Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid ids' }, 400)
  }

  const [proxy, account] = await Promise.all([
    c.env.DB
      .prepare('SELECT id FROM proxies WHERE id = ? AND user_id = ?')
      .bind(proxyId, userId)
      .first(),
    c.env.DB
      .prepare('SELECT id, proxy_id FROM tg_accounts WHERE id = ? AND user_id = ?')
      .bind(accountId, userId)
      .first<{ id: number; proxy_id: number | null }>(),
  ])

  if (!proxy) {
    return c.json({ error: 'Прокси не найден' }, 404)
  }

  if (!account) {
    return c.json({ error: 'Аккаунт не найден' }, 404)
  }

  if (account.proxy_id !== proxyId) {
    return c.json({ error: 'Этот аккаунт не привязан к выбранному прокси' }, 400)
  }

  await c.env.DB
    .prepare('UPDATE tg_accounts SET proxy_id = NULL, proxy = NULL WHERE id = ? AND user_id = ?')
    .bind(accountId, userId)
    .run()

  return c.json({ ok: true })
})

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function parseProxyLine(line: string, fallbackType: string) {
  if (line.includes('://')) {
    const url = new URL(line)
    const type = url.protocol.replace(':', '') || fallbackType
    const port = Number(url.port)

    if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
      return null
    }

    if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
      return null
    }

    return {
      type,
      host: url.hostname,
      port,
      username: normalizeOptional(url.username),
      password: normalizeOptional(url.password),
    }
  }

  const parts = line.split(':')
  if (parts.length !== 2 && parts.length !== 4) {
    return null
  }

  const host = parts[0]?.trim()
  const port = Number(parts[1])
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null
  }

  return {
    type: fallbackType,
    host,
    port,
    username: normalizeOptional(parts[2]),
    password: normalizeOptional(parts[3]),
  }
}

export default proxies
