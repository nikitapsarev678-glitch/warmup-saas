import { Hono } from 'hono'
import { enforceUserActionCooldown, getLeadsByUser } from '../db'
import type { Env } from '../index'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'

const leads = new Hono<{ Bindings: Env } & AuthContext>()

leads.use('*', requireAuth)

leads.get('/', async (c) => {
  const userId = c.get('userId')
  const projectIdRaw = c.req.query('project_id')

  let projectId: number | null | undefined = undefined
  if (projectIdRaw !== undefined) {
    projectId = Number(projectIdRaw)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return c.json({ error: 'Invalid project_id' }, 400)
    }
  }

  const list = await getLeadsByUser(c.env.DB, userId, projectId)
  return c.json({ leads: list })
})

leads.post('/import', async (c) => {
  const userId = c.get('userId')

  const cooldown = await enforceUserActionCooldown(c.env.DB, {
    userId,
    action: 'leads_import',
    cooldownSeconds: 30,
  })

  if (!cooldown.ok) {
    return c.json(
      {
        error: 'Импорт лидов уже запускался совсем недавно',
        reason: 'cooldown_active',
        next_action: 'Подождите немного и повторите импорт.',
        retry_after_seconds: cooldown.retryAfterSeconds,
      },
      429
    )
  }

  const body = await c.req.json<{
    project_id?: number | null
    source?: string
    rows?: Array<{
      username?: string | null
      telegram_id?: number | string | null
      title?: string | null
    }>
    raw?: string
  }>()

  const projectId = body.project_id ?? null
  if (projectId !== null) {
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return c.json({ error: 'Invalid project_id' }, 400)
    }

    const project = await c.env.DB
      .prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
      .bind(projectId, userId)
      .first<{ id: number }>()

    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }
  }

  const source = body.source?.trim() || 'manual'
  const normalized = normalizeLeadRows(body.rows, body.raw)
  if (normalized.length === 0) {
    return c.json({ error: 'Lead list is empty' }, 400)
  }

  let imported = 0
  let skipped = 0

  for (const row of normalized) {
    const existing = await c.env.DB
      .prepare(
        `
          SELECT id
          FROM leads
          WHERE user_id = ?
            AND (
              (? IS NOT NULL AND username = ?)
              OR (? IS NOT NULL AND telegram_id = ?)
            )
          LIMIT 1
        `
      )
      .bind(userId, row.username, row.username, row.telegram_id, row.telegram_id)
      .first<{ id: number }>()

    if (existing) {
      skipped += 1
      continue
    }

    await c.env.DB
      .prepare(
        `
          INSERT INTO leads (user_id, project_id, telegram_id, username, title, source, status)
          VALUES (?, ?, ?, ?, ?, ?, 'active')
        `
      )
      .bind(userId, projectId, row.telegram_id, row.username, row.title, source)
      .run()

    imported += 1
  }

  return c.json({ ok: true, imported, skipped, total: normalized.length }, 201)
})

function normalizeLeadRows(
  rows?: Array<{ username?: string | null; telegram_id?: number | string | null; title?: string | null }>,
  raw?: string
) {
  const items = Array.isArray(rows) && rows.length > 0 ? rows : parseRawRows(raw)
  const seen = new Set<string>()
  const normalized: Array<{ username: string | null; telegram_id: number | null; title: string | null }> = []

  for (const item of items) {
    const username = normalizeUsername(item.username)
    const telegramId = normalizeTelegramId(item.telegram_id)
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 255) || null : null

    if (!username && telegramId === null) {
      continue
    }

    const key = username ? `u:${username}` : `id:${telegramId}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)

    normalized.push({ username, telegram_id: telegramId, title })
  }

  return normalized
}

function parseRawRows(raw?: string) {
  if (!raw) return []

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((part) => part.trim())
      const primary = parts[0] ?? ''
      const title = parts[1] ?? null
      const numeric = /^\d+$/.test(primary) ? primary : null

      return {
        username: numeric ? null : primary,
        telegram_id: numeric,
        title,
      }
    })
}

function normalizeUsername(value?: string | null) {
  if (!value) return null
  const username = value.trim().replace(/^@+/, '').toLowerCase()
  if (!username) return null
  return username.slice(0, 64)
}

function normalizeTelegramId(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0) return null
  return numeric
}

export default leads
