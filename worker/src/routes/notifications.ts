import { Hono } from 'hono'
import {
  ensureFeatureFlags,
  ensureNotificationSettings,
  getRecentRunnerErrors,
  getUserById,
  markNotificationDelivered,
  recordNotificationEvent,
  updateFeatureFlags,
  updateNotificationSettings,
  type FeatureFlags,
  type NotificationSettings,
} from '../db'
import type { Env } from '../index'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'

const notifications = new Hono<{ Bindings: Env } & AuthContext>()

notifications.use('*', requireAuth)

notifications.get('/settings', async (c) => {
  const userId = c.get('userId')
  const [settings, featureFlags] = await Promise.all([
    ensureNotificationSettings(c.env.DB, userId),
    ensureFeatureFlags(c.env.DB, userId),
  ])
  return c.json({ settings: toSettingsResponse(settings), feature_flags: toFeatureFlagsResponse(featureFlags) })
})

notifications.get('/runner-errors', async (c) => {
  const userId = c.get('userId')
  const errors = await getRecentRunnerErrors(c.env.DB, userId, 100)
  return c.json({ errors })
})

notifications.put('/settings', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    tokens_zero_enabled?: boolean
    account_spam_block_enabled?: boolean
    account_banned_enabled?: boolean
    batch_check_complete_enabled?: boolean
    ai_parsing_enabled?: boolean
    ai_dialogs_enabled?: boolean
    group_broadcasts_enabled?: boolean
  }>()

  const settingsPatch = parseSettingsPatch(body)
  if ('error' in settingsPatch) {
    return c.json({ error: settingsPatch.error }, 400)
  }

  const featureFlagsPatch = parseFeatureFlagsPatch(body)
  if ('error' in featureFlagsPatch) {
    return c.json({ error: featureFlagsPatch.error }, 400)
  }

  const [settings, featureFlags] = await Promise.all([
    updateNotificationSettings(c.env.DB, userId, settingsPatch),
    updateFeatureFlags(c.env.DB, userId, featureFlagsPatch),
  ])

  return c.json({
    ok: true,
    settings: toSettingsResponse(settings),
    feature_flags: toFeatureFlagsResponse(featureFlags),
  })
})

export async function sendNotification(
  env: Env,
  userId: number,
  eventType: NotificationEventType,
  text: string,
  options?: {
    entityType?: string | null
    entityId?: number | null
    dedupeKey?: string
    dedupeWindowMinutes?: number
    payload?: Record<string, unknown>
  }
): Promise<{ sent: boolean; skipped: boolean; reason?: string }> {
  const user = await getUserById(env.DB, userId)
  if (!user?.telegram_id) {
    return { sent: false, skipped: true, reason: 'user_missing_telegram_id' }
  }

  const settings = await ensureNotificationSettings(env.DB, userId)
  if (!isNotificationEnabled(settings, eventType)) {
    return { sent: false, skipped: true, reason: 'disabled' }
  }

  const dedupeKey =
    options?.dedupeKey ??
    [eventType, userId, options?.entityType ?? 'global', options?.entityId ?? '0'].join(':')

  const recorded = await recordNotificationEvent(env.DB, {
    userId,
    eventType,
    entityType: options?.entityType ?? null,
    entityId: options?.entityId ?? null,
    dedupeKey,
    payload: options?.payload ?? { text },
    dedupeWindowMinutes: options?.dedupeWindowMinutes ?? 60,
  })

  if (!recorded.created) {
    return { sent: false, skipped: true, reason: 'deduped' }
  }

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: user.telegram_id,
      text,
      disable_web_page_preview: true,
    }),
  })

  if (!response.ok) {
    return { sent: false, skipped: true, reason: 'telegram_failed' }
  }

  await markNotificationDelivered(env.DB, recorded.id)
  return { sent: true, skipped: false }
}

export async function sendAccountStatusNotification(
  env: Env,
  params: {
    userId: number
    accountId: number
    status: 'spam_block' | 'banned'
    accountLabel: string
    reason?: string | null
  }
) {
  const title = params.status === 'banned' ? 'Аккаунт заблокирован' : 'Аккаунт на паузе из-за SpamBlock'
  const recommendation =
    params.status === 'banned'
      ? 'Исключите аккаунт из активных задач и проверьте историю ограничений.'
      : 'Дайте аккаунту отлежаться и проверьте лимиты перед следующим запуском.'

  const reasonLine = params.reason ? `\nПричина: ${params.reason}` : ''
  return sendNotification(
    env,
    params.userId,
    params.status === 'banned' ? 'account_banned' : 'account_spam_block',
    `${title}\nАккаунт: ${params.accountLabel}${reasonLine}\n${recommendation}`,
    {
      entityType: 'account',
      entityId: params.accountId,
      dedupeKey: `${params.status}:${params.accountId}:${params.reason ?? 'none'}`,
      dedupeWindowMinutes: 720,
      payload: { account_id: params.accountId, status: params.status, reason: params.reason ?? null },
    }
  )
}

export async function pauseUserTasksForZeroBalance(env: Env, userId: number) {
  await env.DB.batch([
    env.DB
      .prepare(
        `
          UPDATE campaigns
          SET status = 'paused',
              error_message = CASE
                WHEN error_message IS NULL OR error_message = '' THEN 'Баланс токенов исчерпан. Пополните токены, чтобы продолжить прогрев.'
                ELSE error_message
              END
          WHERE user_id = ? AND status = 'running'
        `
      )
      .bind(userId),
    env.DB
      .prepare(
        `
          UPDATE broadcasts
          SET status = 'paused',
              error = CASE
                WHEN error IS NULL OR error = '' THEN 'Баланс токенов исчерпан. Пополните токены, чтобы продолжить рассылку.'
                ELSE error
              END
          WHERE user_id = ? AND status IN ('running', 'queued')
        `
      )
      .bind(userId),
  ])

  return sendNotification(
    env,
    userId,
    'tokens_zero',
    'Токены закончились. Активные задачи поставлены на паузу. Пополните баланс, чтобы продолжить работу.',
    {
      entityType: 'user',
      entityId: userId,
      dedupeKey: `tokens_zero:${userId}`,
      dedupeWindowMinutes: 180,
      payload: { user_id: userId },
    }
  )
}

export async function runBatchCheckForUser(env: Env, userId: number) {
  const summary = await buildAccountStatusSummary(env.DB, userId)
  await sendNotification(
    env,
    userId,
    'batch_check_complete',
    [
      'Batch-check завершён.',
      `Всего аккаунтов: ${summary.total}`,
      `Активные: ${summary.active}`,
      `Прогреваются: ${summary.warming}`,
      `Прогреты: ${summary.warmed}`,
      `Spam block: ${summary.spam_block}`,
      `Banned: ${summary.banned}`,
      `Отключены: ${summary.disabled}`,
      `Pending: ${summary.pending}`,
    ].join('\n'),
    {
      entityType: 'batch_check',
      entityId: userId,
      dedupeKey: `batch_check:${userId}:${new Date().toISOString().slice(0, 13)}`,
      dedupeWindowMinutes: 30,
      payload: summaryToPayload(summary),
    }
  )

  return summary
}

export async function runScheduledBatchChecks(env: Env) {
  const users = await env.DB.prepare('SELECT id FROM saas_users ORDER BY id ASC').all<{ id: number }>()
  for (const user of users.results) {
    await runBatchCheckForUser(env, user.id)
  }
}

export function triggerGithubPollRunner(env: Env) {
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
          campaign_id: '0',
          action: 'poll',
        },
      }),
    }
  )
}

export async function maybeNotifyAccountStatusChange(
  env: Env,
  previousStatus: string,
  nextStatus: string,
  account: { id: number; user_id: number; phone: string; username: string | null },
  reason?: string | null
) {
  if (previousStatus === nextStatus) {
    return
  }

  const accountLabel = account.username?.trim() ? `@${account.username}` : account.phone

  if (nextStatus === 'spam_block') {
    await sendAccountStatusNotification(env, {
      userId: account.user_id,
      accountId: account.id,
      status: 'spam_block',
      accountLabel,
      reason,
    })
  }

  if (nextStatus === 'banned') {
    await sendAccountStatusNotification(env, {
      userId: account.user_id,
      accountId: account.id,
      status: 'banned',
      accountLabel,
      reason,
    })
  }
}

export async function logBatchCheckRun(
  db: D1Database,
  userId: number,
  summary: AccountStatusSummary
): Promise<void> {
  await recordNotificationEvent(db, {
    userId,
    eventType: 'batch_check_complete',
    entityType: 'batch_check',
    entityId: userId,
    dedupeKey: `batch_check_log:${userId}:${Date.now()}`,
    payload: summaryToPayload(summary),
    dedupeWindowMinutes: 0,
  })
}

function summaryToPayload(summary: AccountStatusSummary): Record<string, unknown> {
  return {
    total: summary.total,
    pending: summary.pending,
    active: summary.active,
    warming: summary.warming,
    warmed: summary.warmed,
    spam_block: summary.spam_block,
    banned: summary.banned,
    disabled: summary.disabled,
  }
}

export type NotificationEventType =
  | 'tokens_zero'
  | 'account_spam_block'
  | 'account_banned'
  | 'batch_check_complete'

export interface AccountStatusSummary {
  total: number
  pending: number
  active: number
  warming: number
  warmed: number
  spam_block: number
  banned: number
  disabled: number
}

export async function buildAccountStatusSummary(
  db: D1Database,
  userId: number
): Promise<AccountStatusSummary> {
  const rows = await db
    .prepare(
      `
        SELECT status, COUNT(*) as count
        FROM tg_accounts
        WHERE user_id = ?
        GROUP BY status
      `
    )
    .bind(userId)
    .all<{ status: keyof AccountStatusSummary; count: number }>()

  const summary: AccountStatusSummary = {
    total: 0,
    pending: 0,
    active: 0,
    warming: 0,
    warmed: 0,
    spam_block: 0,
    banned: 0,
    disabled: 0,
  }

  for (const row of rows.results) {
    if (row.status in summary && row.status !== 'total') {
      const key = row.status as Exclude<keyof AccountStatusSummary, 'total'>
      summary[key] = Number(row.count)
      summary.total += Number(row.count)
    }
  }

  return summary
}

function parseSettingsPatch(body: {
  tokens_zero_enabled?: boolean
  account_spam_block_enabled?: boolean
  account_banned_enabled?: boolean
  batch_check_complete_enabled?: boolean
}) {
  const patch: Partial<NotificationSettingsPatch> = {}

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && typeof value !== 'boolean') {
      return { error: `${key} must be boolean` as const }
    }
  }

  if (body.tokens_zero_enabled !== undefined) patch.tokens_zero_enabled = body.tokens_zero_enabled
  if (body.account_spam_block_enabled !== undefined) patch.account_spam_block_enabled = body.account_spam_block_enabled
  if (body.account_banned_enabled !== undefined) patch.account_banned_enabled = body.account_banned_enabled
  if (body.batch_check_complete_enabled !== undefined) {
    patch.batch_check_complete_enabled = body.batch_check_complete_enabled
  }

  return patch
}

type NotificationSettingsPatch = {
  tokens_zero_enabled: boolean
  account_spam_block_enabled: boolean
  account_banned_enabled: boolean
  batch_check_complete_enabled: boolean
}

type FeatureFlagsPatch = {
  ai_parsing_enabled: boolean
  ai_dialogs_enabled: boolean
  group_broadcasts_enabled: boolean
}

function parseFeatureFlagsPatch(body: {
  ai_parsing_enabled?: boolean
  ai_dialogs_enabled?: boolean
  group_broadcasts_enabled?: boolean
}) {
  const patch: Partial<FeatureFlagsPatch> = {}

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && typeof value !== 'boolean') {
      return { error: `${key} must be boolean` as const }
    }
  }

  if (body.ai_parsing_enabled !== undefined) patch.ai_parsing_enabled = body.ai_parsing_enabled
  if (body.ai_dialogs_enabled !== undefined) patch.ai_dialogs_enabled = body.ai_dialogs_enabled
  if (body.group_broadcasts_enabled !== undefined) {
    patch.group_broadcasts_enabled = body.group_broadcasts_enabled
  }

  return patch
}

function isNotificationEnabled(settings: NotificationSettings, eventType: NotificationEventType) {
  switch (eventType) {
    case 'tokens_zero':
      return Boolean(settings.tokens_zero_enabled)
    case 'account_spam_block':
      return Boolean(settings.account_spam_block_enabled)
    case 'account_banned':
      return Boolean(settings.account_banned_enabled)
    case 'batch_check_complete':
      return Boolean(settings.batch_check_complete_enabled)
  }
}

function toSettingsResponse(settings: NotificationSettings) {
  return {
    tokens_zero_enabled: Boolean(settings.tokens_zero_enabled),
    account_spam_block_enabled: Boolean(settings.account_spam_block_enabled),
    account_banned_enabled: Boolean(settings.account_banned_enabled),
    batch_check_complete_enabled: Boolean(settings.batch_check_complete_enabled),
  }
}

function toFeatureFlagsResponse(featureFlags: FeatureFlags) {
  return {
    ai_parsing_enabled: Boolean(featureFlags.ai_parsing_enabled),
    ai_dialogs_enabled: Boolean(featureFlags.ai_dialogs_enabled),
    group_broadcasts_enabled: Boolean(featureFlags.group_broadcasts_enabled),
  }
}

export default notifications
