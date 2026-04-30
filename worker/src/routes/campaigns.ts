import { Hono } from 'hono'
import { enforceUserActionCooldown, ensureFeatureFlags, getCampaignById, getCampaignsByUser } from '../db'
import type { Env } from '../index'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'

const campaigns = new Hono<{ Bindings: Env } & AuthContext>()

campaigns.use('*', requireAuth)

campaigns.get('/', async (c) => {
  const userId = c.get('userId')
  const list = await getCampaignsByUser(c.env.DB, userId)
  return c.json({ campaigns: list })
})

campaigns.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    name?: string
    warmup_days?: number
    daily_actions_min?: number
    daily_actions_max?: number
    delay_between_actions_min?: number
    delay_between_actions_max?: number
    work_hour_start?: number
    work_hour_end?: number
    use_pool_dialogs?: number
    actions_config?: Record<string, boolean>
    account_ids?: number[]
    project_id?: number | null
    ai_dialog_enabled?: number
    ai_topics?: string[]
    ai_mode?: '1_to_1' | '1_to_n'
    ai_delay_preset?: string
    ai_delay_min?: number
    ai_delay_max?: number
    ai_messages_per_account?: number
    ai_dialogs_per_day?: number
    ai_series_min?: number
    ai_series_max?: number
    ai_reply_pct?: number
    ai_delete_messages?: number
  }>()

  const name = body.name?.trim()
  if (!name) {
    return c.json({ error: 'Name is required' }, 400)
  }

  const warmupDays = body.warmup_days ?? 14
  const dailyMin = body.daily_actions_min ?? 5
  const dailyMax = body.daily_actions_max ?? 15
  const delayMin = body.delay_between_actions_min ?? 60
  const delayMax = body.delay_between_actions_max ?? 300
  const workHourStart = body.work_hour_start ?? 9
  const workHourEnd = body.work_hour_end ?? 22
  const usePoolDialogs = body.use_pool_dialogs ?? 1
  const actionsConfig = body.actions_config ?? {
    join_groups: true,
    read_messages: true,
    reactions: true,
    dialogs: true,
    story_views: true,
    profile_setup: true,
  }
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

  const aiDialogEnabled = body.ai_dialog_enabled ?? 0
  const featureFlags = await ensureFeatureFlags(c.env.DB, userId)
  if (aiDialogEnabled && (c.env.ENABLE_AI_DIALOGS === '0' || !featureFlags.ai_dialogs_enabled)) {
    return c.json(
      {
        error: 'AI-диалоги временно отключены',
        reason: 'feature_disabled',
        next_action: 'Отключите AI-диалоги в кампании или включите фичу в настройках канареечного запуска.',
      },
      403
    )
  }
  const aiTopics = Array.isArray(body.ai_topics) && body.ai_topics.length > 0 ? body.ai_topics : ['daily_life']
  const aiMode = body.ai_mode ?? '1_to_n'
  const aiDelayPreset = body.ai_delay_preset ?? 'medium'
  const aiDelayMin = body.ai_delay_min ?? 15
  const aiDelayMax = body.ai_delay_max ?? 45
  const aiMessagesPerAccount = body.ai_messages_per_account ?? 20
  const aiDialogsPerDay = body.ai_dialogs_per_day ?? 10
  const aiSeriesMin = body.ai_series_min ?? 1
  const aiSeriesMax = body.ai_series_max ?? 3
  const aiReplyPct = body.ai_reply_pct ?? 25
  const aiDeleteMessages = body.ai_delete_messages ?? 0

  const result = await c.env.DB
    .prepare(
      `
        INSERT INTO campaigns (
          user_id,
          name,
          warmup_days,
          daily_actions_min,
          daily_actions_max,
          delay_between_actions_min,
          delay_between_actions_max,
          work_hour_start,
          work_hour_end,
          use_pool_dialogs,
          project_id,
          actions_config,
          ai_dialog_enabled,
          ai_topics,
          ai_mode,
          ai_delay_preset,
          ai_delay_min,
          ai_delay_max,
          ai_messages_per_account,
          ai_dialogs_per_day,
          ai_series_min,
          ai_series_max,
          ai_reply_pct,
          ai_delete_messages
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      userId,
      name,
      warmupDays,
      dailyMin,
      dailyMax,
      delayMin,
      delayMax,
      workHourStart,
      workHourEnd,
      usePoolDialogs,
      projectId,
      JSON.stringify(actionsConfig),
      aiDialogEnabled,
      JSON.stringify(aiTopics),
      aiMode,
      aiDelayPreset,
      aiDelayMin,
      aiDelayMax,
      aiMessagesPerAccount,
      aiDialogsPerDay,
      aiSeriesMin,
      aiSeriesMax,
      aiReplyPct,
      aiDeleteMessages
    )
    .run()

  const campaignId = result.meta.last_row_id
  const accountIds = Array.isArray(body.account_ids) ? body.account_ids : []

  for (const accountId of accountIds) {
    await c.env.DB
      .prepare(
        `
          INSERT OR IGNORE INTO campaign_accounts (campaign_id, account_id)
          SELECT ?, id
          FROM tg_accounts
          WHERE id = ? AND user_id = ?
        `
      )
      .bind(campaignId, accountId, userId)
      .run()
  }

  return c.json({ campaign_id: campaignId }, 201)
})

campaigns.post('/:id/start', async (c) => {
  const userId = c.get('userId')
  const campaignId = Number(c.req.param('id'))
  const cooldown = await enforceUserActionCooldown(c.env.DB, {
    userId,
    action: 'campaign_start',
    refId: String(campaignId),
    cooldownSeconds: 30,
  })

  if (!cooldown.ok) {
    return c.json(
      {
        error: 'Кампания уже запускалась совсем недавно',
        reason: 'cooldown_active',
        next_action: 'Подождите немного и повторите запуск.',
        retry_after_seconds: cooldown.retryAfterSeconds,
      },
      429
    )
  }

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const campaign = await getCampaignById(c.env.DB, campaignId, userId)
  if (!campaign) return c.json({ error: 'Not found' }, 404)
  if (campaign.status === 'running') {
    return c.json(
      {
        error: 'Already running',
        reason: 'already_running',
        next_action: 'Откройте прогресс кампании или сначала остановите её.',
      },
      400
    )
  }

  const featureFlags = await ensureFeatureFlags(c.env.DB, userId)
  if (campaign.ai_dialog_enabled && (c.env.ENABLE_AI_DIALOGS === '0' || !featureFlags.ai_dialogs_enabled)) {
    return c.json(
      {
        error: 'AI-диалоги временно отключены',
        reason: 'feature_disabled',
        next_action: 'Отключите AI-диалоги в настройках кампании или включите фичу в настройках канареечного запуска.',
      },
      403
    )
  }

  const eligibleAccounts = await c.env.DB
    .prepare(
      `
        SELECT COUNT(*) as cnt
        FROM campaign_accounts ca
        INNER JOIN tg_accounts ta ON ta.id = ca.account_id
        WHERE ca.campaign_id = ?
          AND ta.user_id = ?
          AND ta.status IN ('active', 'warming', 'warmed')
          AND (ta.pause_until IS NULL OR ta.pause_until <= CURRENT_TIMESTAMP)
      `
    )
    .bind(campaignId, userId)
    .first<{ cnt: number }>()

  if (!eligibleAccounts?.cnt) {
    return c.json(
      {
        error: 'No eligible accounts for campaign start',
        reason: 'no_eligible_accounts',
        next_action: 'Подключите или разморозьте аккаунты перед повторным запуском.',
      },
      409
    )
  }

  const balance = await c.env.DB
    .prepare('SELECT balance FROM token_balance WHERE user_id = ?')
    .bind(userId)
    .first<{ balance: number }>()

  if ((balance?.balance ?? 0) <= 0) {
    return c.json(
      {
        error: 'Недостаточно токенов для запуска кампании',
        reason: 'zero_balance',
        next_action: 'Пополните баланс токенов и повторите запуск.',
      },
      402
    )
  }

  const progressRows = await c.env.DB
    .prepare(
      `
        SELECT COUNT(*) as total,
               SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
               SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errored
        FROM campaign_accounts
        WHERE campaign_id = ?
      `
    )
    .bind(campaignId)
    .first<{ total: number; done: number; errored: number }>()

  await c.env.DB
    .prepare(
      `
        INSERT INTO task_queue (campaign_id, action, params_json, progress_json)
        VALUES (?, 'run_warmup_day', ?, ?)
      `
    )
    .bind(
      campaignId,
      JSON.stringify({ campaign_id: campaignId }),
      JSON.stringify({
        current_stage: 'queued',
        total_accounts: Number(progressRows?.total ?? 0),
        done_accounts: Number(progressRows?.done ?? 0),
        errored_accounts: Number(progressRows?.errored ?? 0),
        eta_hint: 'Runner начнёт выполнение после ближайшего poll-цикла.',
      })
    )
    .run()

  await c.env.DB
    .prepare(
      `
        UPDATE campaigns
        SET status = 'running',
            error_message = NULL,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
        WHERE id = ? AND user_id = ?
      `
    )
    .bind(campaignId, userId)
    .run()

  const githubResponse = await fetch(
    `https://api.github.com/repos/${c.env.GITHUB_REPO}/actions/workflows/${c.env.GITHUB_WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { campaign_id: String(campaignId), action: 'poll' },
      }),
    }
  )

  if (!githubResponse.ok) {
    await c.env.DB
      .prepare(
        `
          UPDATE campaigns
          SET status = 'paused',
              error_message = 'Runner сейчас недоступен. Кампания поставлена на паузу.'
          WHERE id = ? AND user_id = ?
        `
      )
      .bind(campaignId, userId)
      .run()

    return c.json(
      {
        error: 'Failed to start campaign',
        reason: 'runner_unavailable',
        next_action: 'Проверьте runner и повторите запуск позже.',
      },
      502
    )
  }

  return c.json({ ok: true })
})

campaigns.post('/:id/stop', async (c) => {
  const userId = c.get('userId')
  const campaignId = Number(c.req.param('id'))
  const cooldown = await enforceUserActionCooldown(c.env.DB, {
    userId,
    action: 'campaign_stop',
    refId: String(campaignId),
    cooldownSeconds: 15,
  })

  if (!cooldown.ok) {
    return c.json(
      {
        error: 'Кампания уже останавливалась совсем недавно',
        reason: 'cooldown_active',
        next_action: 'Подождите немного и повторите остановку, если статус не обновился.',
        retry_after_seconds: cooldown.retryAfterSeconds,
      },
      429
    )
  }

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const campaign = await getCampaignById(c.env.DB, campaignId, userId)
  if (!campaign) return c.json({ error: 'Not found' }, 404)

  await c.env.DB
    .prepare(
      `
        UPDATE campaigns
        SET status = 'paused',
            error_message = 'Кампания остановлена вручную. Запустите её снова, когда будете готовы продолжить.'
        WHERE id = ? AND user_id = ?
      `
    )
    .bind(campaignId, userId)
    .run()

  return c.json({ ok: true })
})

campaigns.get('/:id/progress', async (c) => {
  const userId = c.get('userId')
  const campaignId = Number(c.req.param('id'))
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const campaign = await getCampaignById(c.env.DB, campaignId, userId)
  if (!campaign) return c.json({ error: 'Not found' }, 404)

  const accounts = await c.env.DB
    .prepare(
      `
        SELECT ca.*
        FROM campaign_accounts ca
        INNER JOIN tg_accounts ta ON ta.id = ca.account_id
        WHERE ca.campaign_id = ? AND ta.user_id = ?
        ORDER BY ca.account_id ASC
      `
    )
    .bind(campaignId, userId)
    .all()

  return c.json({ campaign, accounts: accounts.results })
})

export default campaigns
