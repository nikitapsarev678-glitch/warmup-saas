import { Hono } from 'hono'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import type { Env } from '../index'

const analytics = new Hono<{ Bindings: Env } & AuthContext>()

analytics.use('*', requireAuth)

analytics.get('/summary', async (c) => {
  const userId = c.get('userId')

  const [accountStats, campaignStats, actionStats, todayStats] = await Promise.all([
    c.env.DB.prepare(
      `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'warming' THEN 1 ELSE 0 END) as warming,
          SUM(CASE WHEN status = 'warmed' THEN 1 ELSE 0 END) as warmed
        FROM tg_accounts
        WHERE user_id = ?
      `
    )
      .bind(userId)
      .first<Record<string, number | null>>(),

    c.env.DB.prepare(
      `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running
        FROM campaigns
        WHERE user_id = ?
      `
    )
      .bind(userId)
      .first<Record<string, number | null>>(),

    c.env.DB.prepare(
      `
        SELECT COUNT(*) as total
        FROM warmup_actions wa
        JOIN campaigns c ON c.id = wa.campaign_id
        WHERE c.user_id = ?
      `
    )
      .bind(userId)
      .first<{ total: number | null }>(),

    c.env.DB.prepare(
      `
        SELECT COUNT(*) as today
        FROM warmup_actions wa
        JOIN campaigns c ON c.id = wa.campaign_id
        WHERE c.user_id = ?
          AND DATE(wa.executed_at) = DATE('now')
      `
    )
      .bind(userId)
      .first<{ today: number | null }>(),
  ])

  return c.json({
    stats: {
      accounts_total: Number(accountStats?.total ?? 0),
      accounts_active: Number(accountStats?.active ?? 0),
      accounts_warming: Number(accountStats?.warming ?? 0),
      accounts_warmed: Number(accountStats?.warmed ?? 0),
      campaigns_total: Number(campaignStats?.total ?? 0),
      campaigns_running: Number(campaignStats?.running ?? 0),
      actions_total: Number(actionStats?.total ?? 0),
      actions_today: Number(todayStats?.today ?? 0),
    },
  })
})

analytics.get('/recent-actions', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare(
      `
        SELECT wa.*, a.phone, a.first_name, a.username
        FROM warmup_actions wa
        JOIN tg_accounts a ON a.id = wa.account_id
        JOIN campaigns c ON c.id = wa.campaign_id
        WHERE c.user_id = ?
        ORDER BY wa.executed_at DESC
        LIMIT 50
      `
    )
    .bind(userId)
    .all()

  return c.json({ actions: results })
})

analytics.get('/actions-by-day', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare(
      `
        SELECT
          DATE(wa.executed_at) as date,
          COUNT(*) as total,
          SUM(CASE WHEN wa.status = 'ok' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN wa.status = 'error' THEN 1 ELSE 0 END) as errors
        FROM warmup_actions wa
        JOIN campaigns c ON c.id = wa.campaign_id
        WHERE c.user_id = ?
          AND wa.executed_at >= DATE('now', '-30 days')
        GROUP BY DATE(wa.executed_at)
        ORDER BY date ASC
      `
    )
    .bind(userId)
    .all()

  return c.json({ days: results })
})

analytics.get('/actions-by-type', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare(
      `
        SELECT
          wa.action_type,
          COUNT(*) as total,
          SUM(CASE WHEN wa.status = 'ok' THEN 1 ELSE 0 END) as success
        FROM warmup_actions wa
        JOIN campaigns c ON c.id = wa.campaign_id
        WHERE c.user_id = ?
        GROUP BY wa.action_type
        ORDER BY total DESC
      `
    )
    .bind(userId)
    .all()

  return c.json({ types: results })
})

analytics.get('/accounts/:id', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const account = await c.env.DB
    .prepare('SELECT * FROM tg_accounts WHERE id = ? AND user_id = ?')
    .bind(accountId, userId)
    .first()

  if (!account) {
    return c.json({ error: 'Not found' }, 404)
  }

  const [byDay, byType, recent] = await Promise.all([
    c.env.DB
      .prepare(
        `
          SELECT DATE(executed_at) as date, COUNT(*) as total
          FROM warmup_actions
          WHERE account_id = ? AND executed_at >= DATE('now', '-14 days')
          GROUP BY DATE(executed_at)
          ORDER BY date
        `
      )
      .bind(accountId)
      .all(),

    c.env.DB
      .prepare(
        `
          SELECT action_type, COUNT(*) as total, SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as success
          FROM warmup_actions
          WHERE account_id = ?
          GROUP BY action_type
        `
      )
      .bind(accountId)
      .all(),

    c.env.DB
      .prepare(
        `
          SELECT *
          FROM warmup_actions
          WHERE account_id = ?
          ORDER BY executed_at DESC
          LIMIT 20
        `
      )
      .bind(accountId)
      .all(),
  ])

  return c.json({
    account,
    stats: {
      by_day: byDay.results,
      by_type: byType.results,
      recent: recent.results,
    },
  })
})

export default analytics
