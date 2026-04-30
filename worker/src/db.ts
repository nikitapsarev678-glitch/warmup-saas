import type { Env } from './index'

export type Plan = 'free' | 'starter' | 'basic' | 'pro' | 'agency'
export type AccountStatus =
  | 'pending'
  | 'active'
  | 'warming'
  | 'warmed'
  | 'spam_block'
  | 'banned'
  | 'disabled'
export type CampaignStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error'
export type TaskStatus = 'queued' | 'running' | 'done' | 'error'

export interface SaasUser {
  id: number
  telegram_id: number
  telegram_username: string | null
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  plan: Plan
  plan_expires_at: string | null
  accounts_limit: number
  created_at: string
}

export interface TgAccount {
  id: number
  user_id: number
  phone: string
  session_string: string | null
  api_id: number | null
  api_hash: string | null
  first_name: string | null
  username: string | null
  status: AccountStatus
  proxy: string | null
  block_reason: string | null
  blocked_at: string | null
  warmed_at: string | null
  messages_sent: number
  daily_limit: number
  hourly_limit: number
  group_limit: number
  dm_limit: number
  pause_until: string | null
  spambot_status: 'clean' | 'spam' | 'unknown' | null
  spambot_checked_at: string | null
  bio: string | null
  tg_id: number | null
  auto_warmup_enabled: number
  auto_warmup_config: string | null
  created_at: string
}

export interface Campaign {
  id: number
  user_id: number
  name: string
  status: CampaignStatus
  warmup_days: number
  daily_actions_min: number
  daily_actions_max: number
  delay_between_actions_min: number
  delay_between_actions_max: number
  work_hour_start: number
  work_hour_end: number
  actions_config: string
  use_pool_dialogs: number
  target_groups: string
  ai_dialog_enabled: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export type BroadcastStatus = 'draft' | 'queued' | 'running' | 'paused' | 'completed' | 'error'
export type BroadcastTargetMode = 'dm' | 'groups_or_channels'

export interface Lead {
  id: number
  user_id: number
  project_id: number | null
  telegram_id: number | null
  username: string | null
  title: string | null
  source: string | null
  status: 'active' | 'replied' | 'blocked'
  created_at: string
}

export interface Broadcast {
  id: number
  user_id: number
  project_id: number | null
  name: string
  status: BroadcastStatus
  target_mode: BroadcastTargetMode
  message_variants_json: string
  limits_json: string | null
  settings_json: string | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface PlanLimits {
  plan: Plan
  accounts_limit: number
  warmup_days_max: number
  price_rub: number
}

export interface NotificationSettings {
  id: number
  user_id: number
  tokens_zero_enabled: number
  account_spam_block_enabled: number
  account_banned_enabled: number
  batch_check_complete_enabled: number
  created_at: string
  updated_at: string
}

export interface FeatureFlags {
  user_id: number
  ai_parsing_enabled: number
  ai_dialogs_enabled: number
  group_broadcasts_enabled: number
  created_at: string
  updated_at: string
}

export async function getUserByTelegramId(
  db: D1Database,
  telegramId: number
): Promise<SaasUser | null> {
  return db
    .prepare('SELECT * FROM saas_users WHERE telegram_id = ?')
    .bind(telegramId)
    .first<SaasUser>()
}

export async function getUserById(db: D1Database, userId: number): Promise<SaasUser | null> {
  return db.prepare('SELECT * FROM saas_users WHERE id = ?').bind(userId).first<SaasUser>()
}

export async function createUser(
  db: D1Database,
  data: Pick<
    SaasUser,
    'telegram_id' | 'telegram_username' | 'first_name' | 'last_name' | 'photo_url'
  >
): Promise<SaasUser> {
  await db
    .prepare(
      `
      INSERT INTO saas_users (telegram_id, telegram_username, first_name, last_name, photo_url)
      VALUES (?, ?, ?, ?, ?)
    `
    )
    .bind(
      data.telegram_id,
      data.telegram_username,
      data.first_name,
      data.last_name,
      data.photo_url
    )
    .run()
  return (await getUserByTelegramId(db, data.telegram_id))!
}

export async function upsertUser(
  db: D1Database,
  data: Pick<
    SaasUser,
    'telegram_id' | 'telegram_username' | 'first_name' | 'last_name' | 'photo_url'
  >
): Promise<SaasUser> {
  await db
    .prepare(
      `
      INSERT INTO saas_users (telegram_id, telegram_username, first_name, last_name, photo_url)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        telegram_username = excluded.telegram_username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        photo_url = excluded.photo_url,
        updated_at = CURRENT_TIMESTAMP
    `
    )
    .bind(
      data.telegram_id,
      data.telegram_username,
      data.first_name,
      data.last_name,
      data.photo_url
    )
    .run()
  return (await getUserByTelegramId(db, data.telegram_id))!
}

export async function upgradePlan(
  db: D1Database,
  userId: number,
  plan: Plan,
  expiresAt: string,
  accountsLimit: number
): Promise<void> {
  await db
    .prepare(
      `
      UPDATE saas_users
      SET plan = ?, plan_expires_at = ?, accounts_limit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    )
    .bind(plan, expiresAt, accountsLimit, userId)
    .run()
}

export async function getAccountsByUser(
  db: D1Database,
  userId: number
): Promise<TgAccount[]> {
  const { results } = await db
    .prepare('SELECT * FROM tg_accounts WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all<TgAccount>()
  return results
}

export async function getAccountById(
  db: D1Database,
  accountId: number,
  userId: number
): Promise<TgAccount | null> {
  return db
    .prepare('SELECT * FROM tg_accounts WHERE id = ? AND user_id = ?')
    .bind(accountId, userId)
    .first<TgAccount>()
}

export async function countUserAccounts(
  db: D1Database,
  userId: number
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as cnt FROM tg_accounts WHERE user_id = ? AND status != 'banned'")
    .bind(userId)
    .first<{ cnt: number }>()
  return row?.cnt ?? 0
}

export async function getCampaignsByUser(
  db: D1Database,
  userId: number
): Promise<Campaign[]> {
  const { results } = await db
    .prepare('SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all<Campaign>()
  return results
}

export async function getCampaignById(
  db: D1Database,
  campaignId: number,
  userId: number
): Promise<Campaign | null> {
  return db
    .prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?')
    .bind(campaignId, userId)
    .first<Campaign>()
}

export async function getLeadsByUser(
  db: D1Database,
  userId: number,
  projectId?: number | null
): Promise<Lead[]> {
  const query =
    projectId === undefined || projectId === null
      ? db.prepare('SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC, id DESC').bind(userId)
      : db
          .prepare('SELECT * FROM leads WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC, id DESC')
          .bind(userId, projectId)

  const { results } = await query.all<Lead>()
  return results
}

export async function getBroadcastsByUser(
  db: D1Database,
  userId: number
): Promise<Broadcast[]> {
  const { results } = await db
    .prepare('SELECT * FROM broadcasts WHERE user_id = ? ORDER BY created_at DESC, id DESC')
    .bind(userId)
    .all<Broadcast>()

  return results
}

export async function getBroadcastById(
  db: D1Database,
  broadcastId: number,
  userId: number
): Promise<Broadcast | null> {
  return db
    .prepare('SELECT * FROM broadcasts WHERE id = ? AND user_id = ?')
    .bind(broadcastId, userId)
    .first<Broadcast>()
}

export async function getPlanLimits(
  db: D1Database,
  plan: Plan
): Promise<PlanLimits | null> {
  return db
    .prepare('SELECT * FROM plan_limits WHERE plan = ?')
    .bind(plan)
    .first<PlanLimits>()
}

export const TOKEN_PRICES = {
  dm_sent: 1,
  group_or_channel_send: 2,
  warmup_action: 1,
  ai_generate_template: 20,
  ai_generate_dialog: 5,
} as const

export type TokenUsageAction = keyof typeof TOKEN_PRICES

export async function ensureTokenBalance(db: D1Database, userId: number): Promise<number> {
  await db
    .prepare(
      `
        INSERT OR IGNORE INTO token_balance (user_id, balance, lifetime_earned)
        VALUES (?, 400, 400)
      `
    )
    .bind(userId)
    .run()

  const row = await db
    .prepare('SELECT balance FROM token_balance WHERE user_id = ?')
    .bind(userId)
    .first<{ balance: number }>()

  return row?.balance ?? 0
}

export async function getTokenBalance(db: D1Database, userId: number): Promise<number> {
  await ensureTokenBalance(db, userId)

  const row = await db
    .prepare('SELECT balance FROM token_balance WHERE user_id = ?')
    .bind(userId)
    .first<{ balance: number }>()

  return row?.balance ?? 0
}

export async function spendTokens(
  db: D1Database,
  userId: number,
  amount: number,
  reason: string,
  refId?: string
): Promise<{ ok: boolean; balance: number; error?: string }> {
  const current = await getTokenBalance(db, userId)
  if (current < amount) {
    return { ok: false, balance: current, error: 'Недостаточно токенов' }
  }

  const newBalance = current - amount
  await db.batch([
    db.prepare(
      `
        UPDATE token_balance
        SET balance = ?,
            lifetime_spent = lifetime_spent + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `
    ).bind(newBalance, amount, userId),
    db.prepare(
      `
        INSERT INTO token_transactions (user_id, amount, reason, ref_id, balance_after)
        VALUES (?, ?, ?, ?, ?)
      `
    ).bind(userId, -amount, reason, refId ?? null, newBalance),
  ])

  return { ok: true, balance: newBalance }
}

export async function earnTokens(
  db: D1Database,
  userId: number,
  amount: number,
  reason: string,
  refId?: string
): Promise<number> {
  const current = await getTokenBalance(db, userId)
  const newBalance = current + amount

  await db.batch([
    db.prepare(
      `
        INSERT INTO token_balance (user_id, balance, lifetime_earned)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          balance = balance + ?,
          lifetime_earned = lifetime_earned + ?,
          updated_at = CURRENT_TIMESTAMP
      `
    ).bind(userId, amount, amount, amount, amount),
    db.prepare(
      `
        INSERT INTO token_transactions (user_id, amount, reason, ref_id, balance_after)
        VALUES (?, ?, ?, ?, ?)
      `
    ).bind(userId, amount, reason, refId ?? null, newBalance),
  ])

  return newBalance
}

export async function spendTokensForUsage(
  db: D1Database,
  params: {
    userId: number
    action: TokenUsageAction
    units?: number
    refType?: string | null
    refId?: string | null
    idempotencyKey: string
  }
): Promise<{ ok: boolean; duplicate: boolean; balance: number; tokensSpent: number; error?: string }> {
  const existing = await db
    .prepare(
      `
        SELECT tue.tokens_spent, tb.balance
        FROM token_usage_events tue
        LEFT JOIN token_balance tb ON tb.user_id = tue.user_id
        WHERE tue.user_id = ? AND tue.idempotency_key = ?
        LIMIT 1
      `
    )
    .bind(params.userId, params.idempotencyKey)
    .first<{ tokens_spent: number; balance: number | null }>()

  if (existing) {
    return {
      ok: true,
      duplicate: true,
      balance: existing.balance ?? (await getTokenBalance(db, params.userId)),
      tokensSpent: Number(existing.tokens_spent ?? 0),
    }
  }

  const units = Math.max(1, Math.trunc(params.units ?? 1))
  const price = TOKEN_PRICES[params.action]
  const tokensSpent = price * units
  const currentBalance = await getTokenBalance(db, params.userId)

  if (currentBalance < tokensSpent) {
    return {
      ok: false,
      duplicate: false,
      balance: currentBalance,
      tokensSpent,
      error: 'Недостаточно токенов',
    }
  }

  const newBalance = currentBalance - tokensSpent

  try {
    await db.batch([
      db.prepare(
        `
          UPDATE token_balance
          SET balance = ?,
              lifetime_spent = lifetime_spent + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `
      ).bind(newBalance, tokensSpent, params.userId),
      db.prepare(
        `
          INSERT INTO token_transactions (user_id, amount, reason, ref_id, balance_after)
          VALUES (?, ?, ?, ?, ?)
        `
      ).bind(params.userId, -tokensSpent, params.action, params.refId ?? null, newBalance),
      db.prepare(
        `
          INSERT INTO token_usage_events (
            user_id,
            action,
            units,
            tokens_spent,
            ref_type,
            ref_id,
            idempotency_key
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).bind(
        params.userId,
        params.action,
        units,
        tokensSpent,
        params.refType ?? null,
        params.refId ?? null,
        params.idempotencyKey
      ),
    ])
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      const duplicate = await db
        .prepare(
          `
            SELECT tue.tokens_spent, tb.balance
            FROM token_usage_events tue
            LEFT JOIN token_balance tb ON tb.user_id = tue.user_id
            WHERE tue.user_id = ? AND tue.idempotency_key = ?
            LIMIT 1
          `
        )
        .bind(params.userId, params.idempotencyKey)
        .first<{ tokens_spent: number; balance: number | null }>()

      return {
        ok: true,
        duplicate: true,
        balance: duplicate?.balance ?? (await getTokenBalance(db, params.userId)),
        tokensSpent: Number(duplicate?.tokens_spent ?? tokensSpent),
      }
    }
    throw error
  }

  return {
    ok: true,
    duplicate: false,
    balance: newBalance,
    tokensSpent,
  }
}

export async function ensureNotificationSettings(
  db: D1Database,
  userId: number
): Promise<NotificationSettings> {
  await db
    .prepare(
      `
        INSERT OR IGNORE INTO user_notification_settings (
          user_id,
          tokens_zero_enabled,
          account_spam_block_enabled,
          account_banned_enabled,
          batch_check_complete_enabled
        )
        VALUES (?, 1, 1, 1, 1)
      `
    )
    .bind(userId)
    .run()

  return (await getNotificationSettings(db, userId))!
}

export async function getNotificationSettings(
  db: D1Database,
  userId: number
): Promise<NotificationSettings | null> {
  return db
    .prepare('SELECT * FROM user_notification_settings WHERE user_id = ?')
    .bind(userId)
    .first<NotificationSettings>()
}

export async function updateNotificationSettings(
  db: D1Database,
  userId: number,
  patch: Partial<{
    tokens_zero_enabled: boolean
    account_spam_block_enabled: boolean
    account_banned_enabled: boolean
    batch_check_complete_enabled: boolean
  }>
): Promise<NotificationSettings> {
  await ensureNotificationSettings(db, userId)

  await db
    .prepare(
      `
        UPDATE user_notification_settings
        SET
          tokens_zero_enabled = COALESCE(?, tokens_zero_enabled),
          account_spam_block_enabled = COALESCE(?, account_spam_block_enabled),
          account_banned_enabled = COALESCE(?, account_banned_enabled),
          batch_check_complete_enabled = COALESCE(?, batch_check_complete_enabled),
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `
    )
    .bind(
      patch.tokens_zero_enabled === undefined ? null : patch.tokens_zero_enabled ? 1 : 0,
      patch.account_spam_block_enabled === undefined ? null : patch.account_spam_block_enabled ? 1 : 0,
      patch.account_banned_enabled === undefined ? null : patch.account_banned_enabled ? 1 : 0,
      patch.batch_check_complete_enabled === undefined ? null : patch.batch_check_complete_enabled ? 1 : 0,
      userId
    )
    .run()

  return (await getNotificationSettings(db, userId))!
}

export async function recordNotificationEvent(
  db: D1Database,
  params: {
    userId: number
    eventType: string
    entityType?: string | null
    entityId?: number | null
    dedupeKey: string
    payload?: Record<string, unknown>
    dedupeWindowMinutes?: number
  }
): Promise<{ created: boolean; id: number }> {
  const withinMinutes = params.dedupeWindowMinutes ?? 60
  const existing = await db
    .prepare(
      `
        SELECT id
        FROM notification_events
        WHERE user_id = ?
          AND dedupe_key = ?
          AND created_at >= datetime('now', ?)
        LIMIT 1
      `
    )
    .bind(params.userId, params.dedupeKey, `-${withinMinutes} minutes`)
    .first<{ id: number }>()

  if (existing) {
    return { created: false, id: existing.id }
  }

  const result = await db
    .prepare(
      `
        INSERT INTO notification_events (
          user_id,
          event_type,
          entity_type,
          entity_id,
          dedupe_key,
          payload_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      params.userId,
      params.eventType,
      params.entityType ?? null,
      params.entityId ?? null,
      params.dedupeKey,
      params.payload ? JSON.stringify(params.payload) : null
    )
    .run()

  return { created: true, id: Number(result.meta.last_row_id) }
}

export async function markNotificationDelivered(db: D1Database, notificationEventId: number): Promise<void> {
  await db
    .prepare('UPDATE notification_events SET sent_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(notificationEventId)
    .run()
}

export async function enforceUserActionCooldown(
  db: D1Database,
  params: {
    userId: number
    action: string
    cooldownSeconds: number
    refId?: string | null
  }
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const refId = params.refId ?? 'global'
  const dedupeKey = `cooldown:${params.action}:${refId}`
  const existing = await db
    .prepare(
      `
        SELECT created_at
        FROM notification_events
        WHERE user_id = ?
          AND event_type = 'user_action_cooldown'
          AND dedupe_key = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `
    )
    .bind(params.userId, dedupeKey)
    .first<{ created_at: string }>()

  if (existing?.created_at) {
    const elapsedMs = Date.now() - new Date(existing.created_at).getTime()
    const retryAfterSeconds = Math.max(0, params.cooldownSeconds - Math.ceil(elapsedMs / 1000))
    if (retryAfterSeconds > 0) {
      return { ok: false, retryAfterSeconds }
    }
  }

  await recordNotificationEvent(db, {
    userId: params.userId,
    eventType: 'user_action_cooldown',
    entityType: 'cooldown',
    entityId: null,
    dedupeKey,
    payload: { action: params.action, ref_id: refId },
    dedupeWindowMinutes: 0,
  })

  return { ok: true }
}

export async function ensureFeatureFlags(db: D1Database, userId: number): Promise<FeatureFlags> {
  await db
    .prepare(
      `
        INSERT OR IGNORE INTO feature_flags (
          user_id,
          ai_parsing_enabled,
          ai_dialogs_enabled,
          group_broadcasts_enabled
        )
        VALUES (?, 1, 1, 1)
      `
    )
    .bind(userId)
    .run()

  return (await getFeatureFlags(db, userId))!
}

export async function getFeatureFlags(db: D1Database, userId: number): Promise<FeatureFlags | null> {
  return db
    .prepare('SELECT * FROM feature_flags WHERE user_id = ?')
    .bind(userId)
    .first<FeatureFlags>()
}

export async function updateFeatureFlags(
  db: D1Database,
  userId: number,
  patch: Partial<{
    ai_parsing_enabled: boolean
    ai_dialogs_enabled: boolean
    group_broadcasts_enabled: boolean
  }>
): Promise<FeatureFlags> {
  await ensureFeatureFlags(db, userId)

  await db
    .prepare(
      `
        UPDATE feature_flags
        SET
          ai_parsing_enabled = COALESCE(?, ai_parsing_enabled),
          ai_dialogs_enabled = COALESCE(?, ai_dialogs_enabled),
          group_broadcasts_enabled = COALESCE(?, group_broadcasts_enabled),
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `
    )
    .bind(
      patch.ai_parsing_enabled === undefined ? null : patch.ai_parsing_enabled ? 1 : 0,
      patch.ai_dialogs_enabled === undefined ? null : patch.ai_dialogs_enabled ? 1 : 0,
      patch.group_broadcasts_enabled === undefined ? null : patch.group_broadcasts_enabled ? 1 : 0,
      userId
    )
    .run()

  return (await getFeatureFlags(db, userId))!
}

export async function getRecentRunnerErrors(
  db: D1Database,
  userId: number,
  limit = 100
): Promise<
  Array<{
    id: number
    action: string
    error: string
    created_at: string
    started_at: string | null
    completed_at: string | null
    campaign_id: number
  }>
> {
  const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const { results } = await db
    .prepare(
      `
        SELECT tq.id, tq.action, tq.error, tq.created_at, tq.started_at, tq.completed_at, tq.campaign_id
        FROM task_queue tq
        LEFT JOIN campaigns c ON c.id = tq.campaign_id
        LEFT JOIN broadcasts b ON b.id = json_extract(tq.params_json, '$.broadcast_id')
        LEFT JOIN parsing_jobs pj ON pj.id = json_extract(tq.params_json, '$.job_id')
        WHERE tq.status = 'error'
          AND tq.error IS NOT NULL
          AND (
            c.user_id = ?
            OR b.user_id = ?
            OR pj.user_id = ?
            OR json_extract(tq.params_json, '$.user_id') = ?
          )
        ORDER BY COALESCE(tq.completed_at, tq.created_at) DESC, tq.id DESC
        LIMIT ?
      `
    )
    .bind(userId, userId, userId, userId, normalizedLimit)
    .all<{
      id: number
      action: string
      error: string
      created_at: string
      started_at: string | null
      completed_at: string | null
      campaign_id: number
    }>()

  return results.map((row) => ({
    id: Number(row.id),
    action: row.action,
    error: row.error,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    campaign_id: Number(row.campaign_id ?? 0),
  }))
}

void (undefined as Env | undefined)
