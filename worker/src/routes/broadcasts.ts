import { Hono } from 'hono'
import { enforceUserActionCooldown, ensureFeatureFlags, getBroadcastById, getBroadcastsByUser } from '../db'
import type { Env } from '../index'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'

const broadcasts = new Hono<{ Bindings: Env } & AuthContext>()

broadcasts.use('*', requireAuth)

broadcasts.get('/', async (c) => {
  const userId = c.get('userId')
  const list = await getBroadcastsByUser(c.env.DB, userId)
  const broadcastsWithAccounts = await Promise.all(
    list.map(async (broadcast) => ({
      ...broadcast,
      account_ids: await getBroadcastAccountIds(c.env.DB, broadcast.id),
      message_variants: safeJsonParseArray(broadcast.message_variants_json),
      limits: safeJsonParse(broadcast.limits_json),
      settings: safeJsonParse(broadcast.settings_json),
    }))
  )
  return c.json({ broadcasts: broadcastsWithAccounts })
})

broadcasts.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<BroadcastPayload>()
  const parsed = await parsePayload(c, userId, body)
  if ('error' in parsed) {
    return c.json(
      {
        error: parsed.error,
        reason: parsed.reason,
        next_action: parsed.next_action,
      },
      parsed.status
    )
  }

  const result = await c.env.DB
    .prepare(
      `
        INSERT INTO broadcasts (
          user_id,
          project_id,
          name,
          status,
          target_mode,
          message_variants_json,
          limits_json,
          settings_json,
          error
        )
        VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, NULL)
      `
    )
    .bind(
      userId,
      parsed.projectId,
      parsed.name,
      parsed.targetMode,
      JSON.stringify(parsed.messageVariants),
      JSON.stringify(parsed.limits),
      JSON.stringify(parsed.settings)
    )
    .run()

  const broadcastId = Number(result.meta.last_row_id)
  await syncBroadcastAccounts(c.env.DB, broadcastId, parsed.accountIds)

  return c.json({ ok: true, broadcast_id: broadcastId }, 201)
})

broadcasts.put('/:id', async (c) => {
  const userId = c.get('userId')
  const broadcastId = Number(c.req.param('id'))
  if (!Number.isInteger(broadcastId) || broadcastId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const existing = await getBroadcastById(c.env.DB, broadcastId, userId)
  if (!existing) {
    return c.json({ error: 'Not found' }, 404)
  }

  if (existing.status === 'running') {
    return c.json({ error: 'Cannot update running broadcast' }, 409)
  }

  const body = await c.req.json<BroadcastPayload>()
  const parsed = await parsePayload(c, userId, body)
  if ('error' in parsed) {
    return c.json(
      {
        error: parsed.error,
        reason: parsed.reason,
        next_action: parsed.next_action,
      },
      parsed.status
    )
  }

  await c.env.DB
    .prepare(
      `
        UPDATE broadcasts
        SET
          project_id = ?,
          name = ?,
          target_mode = ?,
          message_variants_json = ?,
          limits_json = ?,
          settings_json = ?,
          error = NULL
        WHERE id = ? AND user_id = ?
      `
    )
    .bind(
      parsed.projectId,
      parsed.name,
      parsed.targetMode,
      JSON.stringify(parsed.messageVariants),
      JSON.stringify(parsed.limits),
      JSON.stringify(parsed.settings),
      broadcastId,
      userId
    )
    .run()

  await syncBroadcastAccounts(c.env.DB, broadcastId, parsed.accountIds)

  return c.json({ ok: true })
})

broadcasts.post('/:id/start', async (c) => {
  const userId = c.get('userId')
  const broadcastId = Number(c.req.param('id'))

  const cooldown = await enforceUserActionCooldown(c.env.DB, {
    userId,
    action: 'broadcast_start',
    refId: String(broadcastId),
    cooldownSeconds: 30,
  })

  if (!cooldown.ok) {
    return c.json(
      {
        error: 'Рассылка уже запускалась совсем недавно',
        reason: 'cooldown_active',
        next_action: 'Подождите немного и повторите запуск.',
        retry_after_seconds: cooldown.retryAfterSeconds,
      },
      429
    )
  }

  if (!Number.isInteger(broadcastId) || broadcastId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const broadcast = await getBroadcastById(c.env.DB, broadcastId, userId)
  if (!broadcast) {
    return c.json({ error: 'Not found' }, 404)
  }

  if (broadcast.status === 'running' || broadcast.status === 'queued') {
    return c.json({ error: 'Broadcast is already active' }, 409)
  }

  const leadCount = await c.env.DB
    .prepare('SELECT COUNT(*) as cnt FROM leads WHERE user_id = ?')
    .bind(userId)
    .first<{ cnt: number }>()
  if (!leadCount?.cnt) {
    return c.json(
      {
        error: 'No leads imported yet',
        reason: 'missing_leads',
        next_action: 'Сначала импортируйте лидов вручную или через AI-парсинг.',
      },
      409
    )
  }

  const accounts = await c.env.DB
    .prepare(
      `
        SELECT ta.id
        FROM broadcast_accounts ba
        INNER JOIN tg_accounts ta ON ta.id = ba.account_id
        WHERE ba.broadcast_id = ?
          AND ta.user_id = ?
          AND ta.status IN ('active', 'warming', 'warmed')
          AND (ta.pause_until IS NULL OR ta.pause_until <= CURRENT_TIMESTAMP)
      `
    )
    .bind(broadcastId, userId)
    .all<{ id: number }>()

  if (accounts.results.length === 0) {
    return c.json(
      {
        error: 'No eligible sender accounts',
        reason: 'no_eligible_accounts',
        next_action: 'Снимите паузу с аккаунтов, проверьте лимиты или подключите новые sender-аккаунты.',
      },
      409
    )
  }

  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `
          UPDATE broadcasts
          SET status = 'queued', error = NULL, started_at = COALESCE(started_at, CURRENT_TIMESTAMP), completed_at = NULL
          WHERE id = ? AND user_id = ?
        `
      )
      .bind(broadcastId, userId),
    c.env.DB
      .prepare(
        `
          INSERT INTO task_queue (campaign_id, action, params_json)
          VALUES (NULL, 'send_broadcast', ?)
        `
      )
      .bind(JSON.stringify({ broadcast_id: broadcastId, step: 0 })),
  ])

  const githubResponse = await triggerGithubRunner(c.env)

  if (!githubResponse.ok) {
    await c.env.DB
      .prepare("UPDATE broadcasts SET status = 'paused', error = ? WHERE id = ? AND user_id = ?")
      .bind('Failed to dispatch poll runner', broadcastId, userId)
      .run()
    return c.json(
      {
        error: 'Failed to dispatch runner',
        reason: 'runner_unavailable',
        next_action: 'Рассылка поставлена на паузу. Проверьте runner и повторите запуск позже.',
      },
      502
    )
  }

  return c.json({ ok: true })
})

broadcasts.post('/:id/stop', async (c) => {
  const userId = c.get('userId')
  const broadcastId = Number(c.req.param('id'))

  const cooldown = await enforceUserActionCooldown(c.env.DB, {
    userId,
    action: 'broadcast_stop',
    refId: String(broadcastId),
    cooldownSeconds: 15,
  })

  if (!cooldown.ok) {
    return c.json(
      {
        error: 'Рассылка уже останавливалась совсем недавно',
        reason: 'cooldown_active',
        next_action: 'Подождите немного и повторите остановку, если статус ещё не обновился.',
        retry_after_seconds: cooldown.retryAfterSeconds,
      },
      429
    )
  }

  if (!Number.isInteger(broadcastId) || broadcastId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const broadcast = await getBroadcastById(c.env.DB, broadcastId, userId)
  if (!broadcast) {
    return c.json({ error: 'Not found' }, 404)
  }

  await c.env.DB
    .prepare("UPDATE broadcasts SET status = 'paused', error = COALESCE(error, 'Рассылка остановлена вручную. Запустите её снова, когда будете готовы продолжить.') WHERE id = ? AND user_id = ?")
    .bind(broadcastId, userId)
    .run()

  return c.json({ ok: true })
})

broadcasts.get('/:id/progress', async (c) => {
  const userId = c.get('userId')
  const broadcastId = Number(c.req.param('id'))
  if (!Number.isInteger(broadcastId) || broadcastId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const broadcast = await getBroadcastById(c.env.DB, broadcastId, userId)
  if (!broadcast) {
    return c.json({ error: 'Not found' }, 404)
  }

  const leadCount = await c.env.DB
    .prepare('SELECT COUNT(*) as cnt FROM leads WHERE user_id = ? AND (? IS NULL OR project_id = ?)')
    .bind(userId, broadcast.project_id, broadcast.project_id)
    .first<{ cnt: number }>()

  const stats = await c.env.DB
    .prepare(
      `
        SELECT
          COUNT(*) as total_events,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
        FROM broadcast_messages
        WHERE broadcast_id = ? AND user_id = ?
      `
    )
    .bind(broadcastId, userId)
    .first<{ total_events: number; sent: number; failed: number; skipped: number }>()

  const followups = await c.env.DB
    .prepare(
      `
        SELECT step, status, due_at, completed_at
        FROM followups
        WHERE broadcast_id = ? AND user_id = ?
        ORDER BY step ASC, due_at ASC
        LIMIT 50
      `
    )
    .bind(broadcastId, userId)
    .all()

  return c.json({
    broadcast: {
      ...broadcast,
      message_variants: safeJsonParseArray(broadcast.message_variants_json),
      limits: safeJsonParse(broadcast.limits_json),
      settings: safeJsonParse(broadcast.settings_json),
    },
    summary: {
      leads_total: leadCount?.cnt ?? 0,
      total_events: stats?.total_events ?? 0,
      sent: stats?.sent ?? 0,
      failed: stats?.failed ?? 0,
      skipped: stats?.skipped ?? 0,
      followups_pending: followups.results.filter((item) => item.status === 'pending' || item.status === 'queued').length,
      followups_cancelled: followups.results.filter((item) => item.status === 'cancelled').length,
    },
    followups: followups.results,
  })
})

broadcasts.get('/:id/logs', async (c) => {
  const userId = c.get('userId')
  const broadcastId = Number(c.req.param('id'))
  if (!Number.isInteger(broadcastId) || broadcastId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const broadcast = await getBroadcastById(c.env.DB, broadcastId, userId)
  if (!broadcast) {
    return c.json({ error: 'Not found' }, 404)
  }

  const { results } = await c.env.DB
    .prepare(
      `
        SELECT
          bm.id,
          bm.step,
          bm.status,
          bm.error,
          bm.sent_at,
          bm.created_at,
          bm.account_id,
          l.username,
          l.telegram_id,
          l.title
        FROM broadcast_messages bm
        INNER JOIN leads l ON l.id = bm.lead_id
        WHERE bm.broadcast_id = ? AND bm.user_id = ?
        ORDER BY COALESCE(bm.sent_at, bm.created_at) DESC, bm.id DESC
        LIMIT 200
      `
    )
    .bind(broadcastId, userId)
    .all()

  return c.json({ logs: results })
})

type BroadcastPayload = {
  name?: string
  project_id?: number | null
  target_mode?: 'dm' | 'groups_or_channels'
  account_ids?: number[]
  message_variants?: string[]
  daily_limit_per_account?: number
  interval_min_seconds?: number
  interval_max_seconds?: number
  followup_day3_enabled?: boolean
  followup_day3_message?: string | null
  followup_day7_enabled?: boolean
  followup_day7_message?: string | null
}

type BroadcastRouteContext = {
  env: Env
}

async function parsePayload(c: BroadcastRouteContext, userId: number, body: BroadcastPayload) {
  const name = body.name?.trim()
  if (!name) {
    return { error: 'Name is required', status: 400 as const }
  }

  const targetMode = body.target_mode === 'groups_or_channels' ? 'groups_or_channels' : 'dm'
  const featureFlags = await ensureFeatureFlags(c.env.DB, userId)
  if (targetMode === 'groups_or_channels' && (c.env.ENABLE_GROUP_BROADCASTS === '0' || !featureFlags.group_broadcasts_enabled)) {
    return {
      error: 'Отправка в группы и каналы временно отключена',
      status: 403 as const,
      reason: 'feature_disabled',
      next_action: 'Переключите рассылку в личные сообщения или включите фичу в настройках канареечного запуска.',
    }
  }
  const messageVariants = Array.isArray(body.message_variants)
    ? body.message_variants.map((message) => message.trim()).filter(Boolean)
    : []
  if (messageVariants.length === 0) {
    return { error: 'At least one message variant is required', status: 400 as const }
  }

  const accountIds = Array.isArray(body.account_ids)
    ? [...new Set(body.account_ids.filter((value) => Number.isInteger(value) && value > 0))]
    : []
  if (accountIds.length === 0) {
    return { error: 'Select at least one sender account', status: 400 as const }
  }

  const projectId = body.project_id ?? null
  if (projectId !== null) {
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return { error: 'Invalid project_id', status: 400 as const }
    }

    const project = await c.env.DB
      .prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
      .bind(projectId, userId)
      .first()

    if (!project) {
      return { error: 'Project not found', status: 404 as const }
    }
  }

  for (const accountId of accountIds) {
    const account = await c.env.DB
      .prepare(
        `
          SELECT id
          FROM tg_accounts
          WHERE id = ?
            AND user_id = ?
            AND status IN ('active', 'warming', 'warmed')
        `
      )
      .bind(accountId, userId)
      .first()

    if (!account) {
      return { error: `Account ${accountId} not found or unavailable`, status: 404 as const }
    }
  }

  const dailyLimit = normalizeInt(body.daily_limit_per_account, 20)
  const intervalMin = normalizeInt(body.interval_min_seconds, 45)
  const intervalMax = normalizeInt(body.interval_max_seconds, Math.max(intervalMin, 180))

  if (dailyLimit < 1 || dailyLimit > 500) {
    return { error: 'daily_limit_per_account must be between 1 and 500', status: 400 as const }
  }

  if (intervalMin < 1 || intervalMax < intervalMin) {
    return { error: 'Invalid interval range', status: 400 as const }
  }

  const followupDay3Enabled = Boolean(body.followup_day3_enabled)
  const followupDay7Enabled = Boolean(body.followup_day7_enabled)
  const followupDay3Message = body.followup_day3_message?.trim() || null
  const followupDay7Message = body.followup_day7_message?.trim() || null

  if (followupDay3Enabled && !followupDay3Message) {
    return { error: 'followup_day3_message is required when day 3 follow-up is enabled', status: 400 as const }
  }

  if (followupDay7Enabled && !followupDay7Message) {
    return { error: 'followup_day7_message is required when day 7 follow-up is enabled', status: 400 as const }
  }

  return {
    name,
    projectId,
    targetMode,
    accountIds,
    messageVariants,
    limits: {
      daily_limit_per_account: dailyLimit,
      interval_min_seconds: intervalMin,
      interval_max_seconds: intervalMax,
    },
    settings: {
      followup_day3_enabled: followupDay3Enabled,
      followup_day3_message: followupDay3Message,
      followup_day7_enabled: followupDay7Enabled,
      followup_day7_message: followupDay7Message,
    },
  }
}

async function syncBroadcastAccounts(db: D1Database, broadcastId: number, accountIds: number[]) {
  await db.prepare('DELETE FROM broadcast_accounts WHERE broadcast_id = ?').bind(broadcastId).run()

  for (const accountId of accountIds) {
    await db
      .prepare('INSERT INTO broadcast_accounts (broadcast_id, account_id) VALUES (?, ?)')
      .bind(broadcastId, accountId)
      .run()
  }
}

async function getBroadcastAccountIds(db: D1Database, broadcastId: number) {
  const { results } = await db
    .prepare('SELECT account_id FROM broadcast_accounts WHERE broadcast_id = ? ORDER BY created_at ASC, account_id ASC')
    .bind(broadcastId)
    .all<{ account_id: number }>()

  return results.map((row) => Number(row.account_id))
}

function normalizeInt(value: number | undefined, fallback: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return fallback
  return Math.trunc(value)
}

function safeJsonParse(value: string | null) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function safeJsonParseArray(value: string | null) {
  const parsed = safeJsonParse(value)
  return Array.isArray(parsed) ? parsed : []
}

function triggerGithubRunner(env: Env) {
  return fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          action: 'poll',
        },
      }),
    }
  )
}

export default broadcasts
