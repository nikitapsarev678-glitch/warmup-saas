import { Hono } from 'hono'
import {
  countUserAccounts,
  enforceUserActionCooldown,
  getAccountById,
  getAccountsByUser,
} from '../db'
import type { Env } from '../index'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import {
  buildAccountStatusSummary,
  logBatchCheckRun,
  maybeNotifyAccountStatusChange,
  runBatchCheckForUser,
} from './notifications'

function toRunnerSetupErrorMessage(error: string) {
  return error

  if (error === 'Runner is not configured in this environment') {
    return 'SMS-вход сейчас недоступен: runner не настроен в этой среде. Подключите GitHub runner и Telegram секреты или используйте StringSession.'
  }

  if (error.startsWith('Runner dispatch failed with status ')) {
    return 'SMS-вход сейчас недоступен: не удалось запустить runner через GitHub Actions.'
  }

  if (error === 'Runner dispatch failed') {
    return 'SMS-вход сейчас недоступен: runner не отвечает.'
  }

  return error
}

type SafeAccount = Omit<
  Awaited<ReturnType<typeof getAccountsByUser>>[number],
  'session_string' | 'api_hash'
>

function sanitizeAccountProxy(proxy: string | null) {
  if (!proxy) return null

  try {
    const parsed = JSON.parse(proxy) as {
      type?: string
      host?: string
      port?: number
      user?: string
      pass?: string
    }

    return JSON.stringify({
      type: parsed.type,
      host: parsed.host,
      port: parsed.port,
      user: parsed.user,
    })
  } catch {
    return proxy
  }
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function toSafeAccount(account: Awaited<ReturnType<typeof getAccountsByUser>>[number]): SafeAccount {
  const { session_string, api_hash, proxy, ...rest } = account
  return {
    ...rest,
    proxy: sanitizeAccountProxy(proxy),
  }
}

function isDisconnectedAccount(account: { block_reason: string | null }) {
  const reason = account.block_reason ?? ''
  return reason.includes('Telegram session was terminated on another device') || reason.includes('AuthKeyUnregisteredError')
}

async function refreshUserAccountHealth(env: Env, userId: number) {
  const accountsToValidate = await env.DB
    .prepare(
      `
        SELECT id
        FROM tg_accounts
        WHERE user_id = ?
          AND session_string IS NOT NULL
          AND TRIM(session_string) != ''
          AND status IN ('active', 'warming', 'warmed', 'disabled')
        ORDER BY id ASC
      `
    )
    .bind(userId)
    .all<{ id: number }>()

  for (const account of accountsToValidate.results) {
    await triggerGithubRunner(env, 'validate_account_session', { account_id: account.id, user_id: userId })
  }
}

const accounts = new Hono<{ Bindings: Env } & AuthContext>()

accounts.use('*', requireAuth)

accounts.get('/', async (c) => {
  const userId = c.get('userId')
  const list = await getAccountsByUser(c.env.DB, userId)
  const safe: SafeAccount[] = list
    .map(toSafeAccount)
    .filter((account) => account.status !== 'pending' && account.status !== 'disabled' && !isDisconnectedAccount(account))

  return c.json({ accounts: safe })
})

accounts.post('/check-all', async (c) => {
  const userId = c.get('userId')
  const cooldown = await enforceUserActionCooldown(c.env.DB, {
    userId,
    action: 'accounts_check_all',
    cooldownSeconds: 60,
  })

  if (!cooldown.ok) {
    return c.json(
      {
        error: 'Batch-check уже запускался совсем недавно',
        reason: 'cooldown_active',
        next_action: 'Подождите минуту и повторите проверку.',
        retry_after_seconds: cooldown.retryAfterSeconds,
      },
      429
    )
  }

  const summary = await runBatchCheckForUser(c.env, userId)
  await logBatchCheckRun(c.env.DB, userId, summary)
  return c.json({ ok: true, summary })
})

accounts.get('/:id', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json({ account: toSafeAccount(account) })
})

accounts.get('/:id/login-state', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) {
    return c.json({ error: 'Not found' }, 404)
  }

  const state = await c.env.DB
    .prepare(
      `
        SELECT account_id, status, error_message, password_required, updated_at
        FROM account_login_states
        WHERE account_id = ? AND user_id = ?
        LIMIT 1
      `
    )
    .bind(accountId, userId)
    .first<{
      account_id: number
      status: string
      error_message: string | null
      password_required: number | null
      updated_at: string
    }>()

  return c.json({
    state: state
      ? {
          account_id: state.account_id,
          status: state.status,
          error_message: state.error_message,
          password_required: Boolean(state.password_required),
          updated_at: state.updated_at,
        }
      : null,
  })
})

accounts.patch('/:id/limits', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) {
    return c.json({ error: 'Not found' }, 404)
  }

  const body = await c.req.json<{
    daily_limit?: number
    hourly_limit?: number
    group_limit?: number
    dm_limit?: number
  }>()

  const values = [body.daily_limit, body.hourly_limit, body.group_limit, body.dm_limit]
  if (values.some((value) => value !== undefined && (!Number.isInteger(value) || value < 0))) {
    return c.json({ error: 'Limits must be non-negative integers' }, 400)
  }

  await c.env.DB
    .prepare(
      `
        UPDATE tg_accounts
        SET
          daily_limit = COALESCE(?, daily_limit),
          hourly_limit = COALESCE(?, hourly_limit),
          group_limit = COALESCE(?, group_limit),
          dm_limit = COALESCE(?, dm_limit)
        WHERE id = ? AND user_id = ?
      `
    )
    .bind(
      body.daily_limit ?? null,
      body.hourly_limit ?? null,
      body.group_limit ?? null,
      body.dm_limit ?? null,
      accountId,
      userId
    )
    .run()

  return c.json({ ok: true })
})

accounts.post('/:id/pause', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) {
    return c.json({ error: 'Not found' }, 404)
  }

  const body = await c.req.json<{ hours?: number }>()
  const hours = body.hours
  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > 168) {
    return c.json({ error: 'hours должно быть от 1 до 168' }, 400)
  }

  const pauseUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

  await c.env.DB
    .prepare('UPDATE tg_accounts SET pause_until = ?, status = ? WHERE id = ? AND user_id = ?')
    .bind(pauseUntil, 'disabled', accountId, userId)
    .run()

  return c.json({ ok: true, pause_until: pauseUntil })
})

accounts.post('/:id/unpause', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) {
    return c.json({ error: 'Not found' }, 404)
  }

  await c.env.DB
    .prepare('UPDATE tg_accounts SET pause_until = NULL, status = ? WHERE id = ? AND user_id = ?')
    .bind('active', accountId, userId)
    .run()

  return c.json({ ok: true })
})

accounts.post('/:id/check-spambot', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) {
    return c.json({ error: 'Not found' }, 404)
  }

  const cooldown = await enforceUserActionCooldown(c.env.DB, {
    userId,
    action: 'account_check_spambot',
    refId: String(accountId),
    cooldownSeconds: 300,
  })

  if (!cooldown.ok) {
    return c.json(
      {
        error: 'SpamBot check уже запускался недавно',
        reason: 'cooldown_active',
        next_action: 'Дождитесь завершения предыдущей проверки или повторите позже.',
        retry_after_seconds: cooldown.retryAfterSeconds,
      },
      429
    )
  }

  await c.env.DB
    .prepare(
      `
        INSERT INTO task_queue (campaign_id, action, params_json)
        VALUES (NULL, 'check_spambot', ?)
      `
    )
    .bind(JSON.stringify({ account_id: accountId, user_id: userId }))
    .run()

  const githubResponse = await triggerGithubRunner(c.env, 'check_spambot', { account_id: accountId })
  if (!githubResponse.ok) {
    return c.json(
      {
        ok: false,
        message: 'Проверка поставлена в очередь, но runner сейчас недоступен',
        reason: 'runner_unavailable',
        next_action: 'Повторите позже или проверьте статус runner.',
      },
      202
    )
  }

  return c.json({ ok: true, message: 'Проверка запущена, результат будет через 30 сек' })
})

accounts.get('/:id/logs', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) {
    return c.json({ error: 'Not found' }, 404)
  }

  const { results } = await c.env.DB
    .prepare(
      `
        SELECT * FROM warmup_actions
        WHERE account_id = ?
        ORDER BY executed_at DESC
        LIMIT 100
      `
    )
    .bind(accountId)
    .all()

  return c.json({ logs: results })
})

accounts.patch('/:id/profile', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) {
    return c.json({ error: 'Not found' }, 404)
  }

  const body = await c.req.json<{
    first_name?: string | null
    bio?: string | null
  }>()

  const firstName = body.first_name === undefined ? null : body.first_name?.trim() ?? null
  const bio = body.bio === undefined ? null : body.bio?.trim() ?? null

  if (body.first_name !== undefined && firstName !== null && firstName.length > 64) {
    return c.json({ error: 'first_name is too long' }, 400)
  }

  if (body.bio !== undefined && bio !== null && bio.length > 300) {
    return c.json({ error: 'bio is too long' }, 400)
  }

  if (body.first_name === undefined && body.bio === undefined) {
    return c.json({ error: 'Nothing to update' }, 400)
  }

  await c.env.DB
    .prepare(
      `
        UPDATE tg_accounts
        SET
          first_name = COALESCE(?, first_name),
          bio = COALESCE(?, bio)
        WHERE id = ? AND user_id = ?
      `
    )
    .bind(
      body.first_name === undefined ? null : firstName,
      body.bio === undefined ? null : bio,
      accountId,
      userId
    )
    .run()

  return c.json({ ok: true })
})

accounts.patch('/:id/auto-warmup', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) {
    return c.json({ error: 'Not found' }, 404)
  }

  const body = await c.req.json<{
    enabled: boolean
    config?: {
      days?: number
      dialogs_per_day?: number
      pause_preset?: number
      started_at?: string
    } | null
  }>()

  if (typeof body.enabled !== 'boolean') {
    return c.json({ error: 'enabled must be boolean' }, 400)
  }

  if (body.config) {
    const { days, dialogs_per_day, pause_preset, started_at } = body.config

    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 365)) {
      return c.json({ error: 'days must be between 1 and 365' }, 400)
    }

    if (
      dialogs_per_day !== undefined &&
      (!Number.isInteger(dialogs_per_day) || dialogs_per_day < 0 || dialogs_per_day > 500)
    ) {
      return c.json({ error: 'dialogs_per_day must be between 0 and 500' }, 400)
    }

    if (
      pause_preset !== undefined &&
      (!Number.isInteger(pause_preset) || pause_preset < 1 || pause_preset > 168)
    ) {
      return c.json({ error: 'pause_preset must be between 1 and 168' }, 400)
    }

    if (started_at !== undefined && typeof started_at !== 'string') {
      return c.json({ error: 'started_at must be string' }, 400)
    }
  }

  await c.env.DB
    .prepare(
      `
        UPDATE tg_accounts
        SET auto_warmup_enabled = ?, auto_warmup_config = ?
        WHERE id = ? AND user_id = ?
      `
    )
    .bind(body.enabled ? 1 : 0, body.config ? JSON.stringify(body.config) : null, accountId, userId)
    .run()

  return c.json({ ok: true })
})

accounts.post('/', async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const body = await c.req.json<{
    phone?: string
    session_string?: string
    api_id?: number
    api_hash?: string
    proxy?: string | null
    project_id?: number | null
  }>()

  const phone = body.phone?.trim()
  const sessionString = body.session_string?.trim()

  if (!phone || !sessionString) {
    return c.json({ error: 'phone and session_string are required' }, 400)
  }

  const count = await countUserAccounts(c.env.DB, userId)
  if (count >= user.accounts_limit) {
    await refreshUserAccountHealth(c.env, userId)
    const refreshedCount = await countUserAccounts(c.env.DB, userId)
    if (refreshedCount < user.accounts_limit) {
      return c.json({ error: 'Account health refresh started. Повторите добавление через несколько секунд.' }, 409)
    }

    return c.json(
      { error: `Account limit for ${user.plan} plan is ${user.accounts_limit}` },
      403
    )
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

  const result = await c.env.DB
    .prepare(
      `
        INSERT INTO tg_accounts (user_id, phone, session_string, api_id, api_hash, proxy, project_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      `
    )
    .bind(
      userId,
      phone,
      sessionString,
      body.api_id ?? null,
      body.api_hash?.trim() || null,
      body.proxy?.trim() || null,
      projectId
    )
    .run()

  return c.json({ ok: true, account_id: result.meta.last_row_id }, 201)
})

accounts.post('/send-code', async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const body = await c.req.json<{ phone?: string; project_id?: number | null }>()
  const phone = body.phone?.trim()
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

  if (!phone) {
    return c.json({ error: 'phone is required' }, 400)
  }

  const normalizedPhone = normalizePhone(phone)
  const existingAttempt = await c.env.DB
    .prepare(
      `
        SELECT a.id, als.status, als.updated_at
        FROM tg_accounts a
        LEFT JOIN account_login_states als ON als.account_id = a.id AND als.user_id = a.user_id
        WHERE a.user_id = ?
          AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(a.phone, '+', ''), ' ', ''), '(', ''), ')', ''), '-', '') = ?
          AND a.status IN ('pending', 'disabled')
        ORDER BY a.id DESC
        LIMIT 1
      `
    )
    .bind(userId, normalizedPhone)
    .first<{ id: number; status: string | null; updated_at: string | null }>()

  if (existingAttempt) {
    const updatedAt = existingAttempt.updated_at ? new Date(existingAttempt.updated_at).getTime() : 0
    const secondsSinceLastUpdate = updatedAt ? Math.floor((Date.now() - updatedAt) / 1000) : Number.POSITIVE_INFINITY

    if (existingAttempt.status === 'queued' || existingAttempt.status === 'code_sent' || secondsSinceLastUpdate < 300) {
      return c.json(
        {
          ok: true,
          account_id: existingAttempt.id,
          message: 'Для этого номера уже запущено подключение. Дождитесь обновления статуса или введите код.',
          next_step: 'poll_login_state',
        },
        200
      )
    }
  }

  const count = await countUserAccounts(c.env.DB, userId)
  if (count >= user.accounts_limit) {
    await refreshUserAccountHealth(c.env, userId)
    const refreshedCount = await countUserAccounts(c.env.DB, userId)
    if (refreshedCount < user.accounts_limit) {
      return c.json({ error: 'Account health refresh started. Повторите добавление через несколько секунд.' }, 409)
    }

    return c.json(
      { error: `Account limit for ${user.plan} plan is ${user.accounts_limit}` },
      403
    )
  }

  const accountResult = await c.env.DB
    .prepare(`INSERT INTO tg_accounts (user_id, phone, project_id, status) VALUES (?, ?, ?, 'pending')`)
    .bind(userId, phone, projectId)
    .run()

  const accountId = Number(accountResult.meta.last_row_id)

  await c.env.DB
    .prepare(
      `
        INSERT INTO account_login_states (
          account_id,
          user_id,
          phone,
          status,
          password_required,
          error_message
        ) VALUES (?, ?, ?, 'queued', 0, NULL)
      `
    )
    .bind(accountId, userId, phone)
    .run()

  await c.env.DB
    .prepare(
      `
        INSERT INTO task_queue (campaign_id, action, params_json)
        VALUES (NULL, 'send_code', ?)
      `
    )
    .bind(JSON.stringify({ account_id: accountId, phone, user_id: userId }))
    .run()

  const githubDispatch = await triggerGithubRunner(c.env, 'send_code', { account_id: accountId, user_id: userId })
  if (!githubDispatch.ok) {
    const runnerError = toRunnerSetupErrorMessage(githubDispatch.error)
    await c.env.DB.batch([
      c.env.DB
        .prepare(
          `
            UPDATE account_login_states
            SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP
            WHERE account_id = ? AND user_id = ?
          `
        )
        .bind(runnerError, accountId, userId),
      c.env.DB
        .prepare(
          `
            UPDATE tg_accounts
            SET status = 'disabled', block_reason = ?
            WHERE id = ? AND user_id = ?
          `
        )
        .bind(runnerError, accountId, userId),
    ])

    return c.json({ error: runnerError, reason: 'runner_unavailable' }, 502)
  }

  return c.json(
    {
      ok: true,
      account_id: accountId,
      message: 'Code dispatch started',
      next_step: 'wait_for_code',
    },
    201
  )
})

accounts.post('/:id/confirm-code', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const body = await c.req.json<{ code?: string; password?: string }>()
  const code = body.code?.trim()
  const password = body.password?.trim()

  if (!code && !password) {
    return c.json({ error: 'code or password is required' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  const loginState = await c.env.DB
    .prepare(
      `
        SELECT phone_code_hash, password_required, status
        FROM account_login_states
        WHERE account_id = ? AND user_id = ?
        LIMIT 1
      `
    )
    .bind(accountId, userId)
    .first<{ phone_code_hash: string | null; password_required: number | null; status: string }>()

  if (!loginState) {
    return c.json({ error: 'Login state not found. Send code first.' }, 409)
  }

  if (account.session_string && account.api_id && account.api_hash) {
    return c.json({ ok: true, message: 'Account is already connected', next_step: 'done' })
  }

  if (loginState.status === 'done') {
    return c.json({ ok: true, message: 'Account is already connected', next_step: 'done' })
  }

  if (!password && !loginState.phone_code_hash) {
    return c.json({ error: 'Code is not ready yet. Wait until the runner sends it.' }, 409)
  }

  await c.env.DB
    .prepare(
      `
        UPDATE account_login_states
        SET status = 'confirming_code', error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE account_id = ? AND user_id = ?
      `
    )
    .bind(accountId, userId)
    .run()

  await c.env.DB
    .prepare(
      `
        INSERT INTO task_queue (campaign_id, action, params_json)
        VALUES (NULL, 'confirm_code', ?)
      `
    )
    .bind(JSON.stringify({ account_id: accountId, code: code ?? null, password: password ?? null, user_id: userId }))
    .run()

  const githubDispatch = await triggerGithubRunner(c.env, 'confirm_code', { account_id: accountId, user_id: userId })
  if (!githubDispatch.ok) {
    const runnerError = toRunnerSetupErrorMessage(githubDispatch.error)
    await c.env.DB.batch([
      c.env.DB
        .prepare(
          `
            UPDATE account_login_states
            SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP
            WHERE account_id = ? AND user_id = ?
          `
        )
        .bind(runnerError, accountId, userId),
      c.env.DB
        .prepare(
          `
            UPDATE tg_accounts
            SET status = 'disabled', block_reason = ?
            WHERE id = ? AND user_id = ?
          `
        )
        .bind(runnerError, accountId, userId),
    ])

    return c.json({ error: runnerError, reason: 'runner_unavailable' }, 502)
  }

  return c.json({ ok: true, message: 'Code confirmation started', next_step: 'poll_login_state' })
})

accounts.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  await c.env.DB
    .prepare('DELETE FROM tg_accounts WHERE id = ? AND user_id = ?')
    .bind(accountId, userId)
    .run()

  return c.json({ ok: true })
})

accounts.patch('/:id/proxy', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const body = await c.req.json<{ proxy?: string | null }>()
  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  await c.env.DB
    .prepare('UPDATE tg_accounts SET proxy = ? WHERE id = ? AND user_id = ?')
    .bind(body.proxy?.trim() || null, accountId, userId)
    .run()

  return c.json({ ok: true })
})

accounts.patch('/:id/status', async (c) => {
  const userId = c.get('userId')
  const accountId = Number(c.req.param('id'))

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const body = await c.req.json<{ status?: 'active' | 'disabled' }>()
  if (body.status !== 'active' && body.status !== 'disabled') {
    return c.json({ error: 'Status must be active or disabled' }, 400)
  }

  const account = await getAccountById(c.env.DB, accountId, userId)
  if (!account) return c.json({ error: 'Not found' }, 404)

  await c.env.DB
    .prepare('UPDATE tg_accounts SET status = ? WHERE id = ? AND user_id = ?')
    .bind(body.status, accountId, userId)
    .run()

  await maybeNotifyAccountStatusChange(c.env, account.status, body.status, account)

  return c.json({ ok: true })
})

async function triggerGithubRunner(
  env: Env,
  action = 'run_warmup_day',
  extraInputs?: Record<string, string | number | boolean>
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!env.GITHUB_PAT || !env.GITHUB_REPO || !env.GITHUB_WORKFLOW) {
    return { ok: false, error: 'Runner is not configured in this environment' }
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_PAT}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'warmup-saas-worker',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            campaign_id: '0',
            action,
            ...Object.fromEntries(
              Object.entries(extraInputs ?? {}).map(([key, value]) => [key, String(value)])
            ),
          },
        }),
      }
    )

    if (!response.ok) {
      const detail = (await response.text()).trim()
      return {
        ok: false,
        error: detail
          ? `Runner dispatch failed with status ${response.status}: ${detail.slice(0, 500)}`
          : `Runner dispatch failed with status ${response.status}`,
      }
    }

    return { ok: true }
  } catch {
    return { ok: false, error: 'Runner dispatch failed' }
  }
}

export default accounts
