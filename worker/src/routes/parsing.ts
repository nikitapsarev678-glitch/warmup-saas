import { Hono } from 'hono'
import { enforceUserActionCooldown, ensureFeatureFlags } from '../db'
import type { Env } from '../index'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import { triggerGithubPollRunner } from './notifications'

type ParsingJobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'error'

type ParsingProgress = {
  groups_found: number
  groups_processed: number
  admins_found: number
  participants_found: number
  leads_added: number
  leads_skipped: number
  tokens_spent: number
}

type ParsingJobRow = {
  id: number
  user_id: number
  project_id: number | null
  status: ParsingJobStatus
  query_text: string
  geo: string | null
  limit_count: number
  classify_with_ai: number
  progress_json: string | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

const parsing = new Hono<{ Bindings: Env } & AuthContext>()

parsing.use('*', requireAuth)

parsing.get('/', async (c) => {
  const userId = c.get('userId')
  const limitRaw = Number(c.req.query('limit') ?? 10)
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10

  const { results } = await c.env.DB
    .prepare(
      `
        SELECT *
        FROM parsing_jobs
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `
    )
    .bind(userId, limit)
    .all<ParsingJobRow>()

  return c.json({ jobs: results.map(toParsingJobResponse) })
})

parsing.post('/start', async (c) => {
  const userId = c.get('userId')
  const featureFlags = await ensureFeatureFlags(c.env.DB, userId)

  if (c.env.ENABLE_AI_PARSING === '0' || !featureFlags.ai_parsing_enabled) {
    return c.json(
      {
        error: 'AI-парсинг временно отключён',
        reason: 'feature_disabled',
        next_action: 'Используйте ручной импорт лидов или включите фичу в настройках канареечного запуска перед повтором.',
      },
      403
    )
  }

  const cooldown = await enforceUserActionCooldown(c.env.DB, {
    userId,
    action: 'parsing_start',
    cooldownSeconds: 60,
  })

  if (!cooldown.ok) {
    return c.json(
      {
        error: 'AI-парсинг уже запускался совсем недавно',
        reason: 'cooldown_active',
        next_action: 'Подождите минуту и повторите запуск.',
        retry_after_seconds: cooldown.retryAfterSeconds,
      },
      429
    )
  }

  const body = await c.req.json<{
    project_id?: number | null
    query?: string
    geo?: string | null
    limit?: number
    classify_with_ai?: boolean
  }>()

  const queryText = normalizeQuery(body.query)
  if (!queryText) {
    return c.json({ error: 'query обязателен' }, 400)
  }

  const limitCount = normalizeLimit(body.limit)
  if (limitCount === null) {
    return c.json({ error: 'limit должен быть числом от 1 до 200' }, 400)
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

  const existing = await c.env.DB
    .prepare(
      `
        SELECT id
        FROM parsing_jobs
        WHERE user_id = ?
          AND status IN ('queued', 'running')
        ORDER BY id DESC
        LIMIT 1
      `
    )
    .bind(userId)
    .first<{ id: number }>()

  if (existing) {
    return c.json({ error: 'У вас уже есть активный parsing job' }, 409)
  }

  const classifyWithAi = body.classify_with_ai ? 1 : 0
  const progress = defaultProgress()

  const insert = await c.env.DB
    .prepare(
      `
        INSERT INTO parsing_jobs (
          user_id,
          project_id,
          status,
          query_text,
          geo,
          limit_count,
          classify_with_ai,
          progress_json,
          error
        )
        VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, NULL)
      `
    )
    .bind(userId, projectId, queryText, normalizeOptional(body.geo), limitCount, classifyWithAi, JSON.stringify(progress))
    .run()

  const jobId = Number(insert.meta.last_row_id)

  await c.env.DB
    .prepare(
      `
        INSERT INTO task_queue (campaign_id, action, params_json)
        VALUES (NULL, 'run_parsing', ?)
      `
    )
    .bind(JSON.stringify({ job_id: jobId }))
    .run()

  const githubResponse = await triggerGithubPollRunner(c.env)
  if (!githubResponse.ok) {
    await c.env.DB
      .prepare(
        `
          UPDATE parsing_jobs
          SET status = 'paused',
              error = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `
      )
      .bind('Runner сейчас недоступен. Повторите запуск чуть позже.', jobId, userId)
      .run()

    const pausedJob = await getParsingJobById(c.env.DB, jobId, userId)
    return c.json(
      {
        ok: false,
        job: pausedJob ? toParsingJobResponse(pausedJob) : null,
        reason: 'runner_unavailable',
        next_action: 'Повторите запуск позже или проверьте статус runner.',
      },
      202
    )
  }

  const job = await getParsingJobById(c.env.DB, jobId, userId)
  return c.json({ ok: true, job: job ? toParsingJobResponse(job) : null }, 201)
})

parsing.get('/:id', async (c) => {
  const userId = c.get('userId')
  const jobId = Number(c.req.param('id'))
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const job = await getParsingJobById(c.env.DB, jobId, userId)
  if (!job) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json({ job: toParsingJobResponse(job) })
})

parsing.get('/:id/result', async (c) => {
  const userId = c.get('userId')
  const jobId = Number(c.req.param('id'))
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const job = await getParsingJobById(c.env.DB, jobId, userId)
  if (!job) {
    return c.json({ error: 'Not found' }, 404)
  }

  const progress = parseProgress(job.progress_json)
  const { results: leads } = await c.env.DB
    .prepare(
      `
        SELECT id, user_id, project_id, telegram_id, username, title, source, status, created_at
        FROM leads
        WHERE user_id = ?
          AND source_ref_type = 'parsing_job'
          AND source_ref_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 200
      `
    )
    .bind(userId, String(jobId))
    .all()

  const tokenTotals = await c.env.DB
    .prepare(
      `
        SELECT COALESCE(SUM(tokens_spent), 0) as tokens_spent
        FROM token_usage_events
        WHERE user_id = ?
          AND ref_type = 'parsing_job'
          AND ref_id = ?
      `
    )
    .bind(userId, String(jobId))
    .first<{ tokens_spent: number }>()

  return c.json({
    job: toParsingJobResponse(job),
    summary: {
      leads_added: progress.leads_added,
      leads_skipped: progress.leads_skipped,
      groups_found: progress.groups_found,
      groups_processed: progress.groups_processed,
      admins_found: progress.admins_found,
      participants_found: progress.participants_found,
      tokens_spent: Number(tokenTotals?.tokens_spent ?? progress.tokens_spent ?? 0),
    },
    leads,
  })
})

async function getParsingJobById(db: D1Database, jobId: number, userId: number) {
  return db
    .prepare('SELECT * FROM parsing_jobs WHERE id = ? AND user_id = ?')
    .bind(jobId, userId)
    .first<ParsingJobRow>()
}

function toParsingJobResponse(job: ParsingJobRow) {
  return {
    id: Number(job.id),
    project_id: job.project_id === null ? null : Number(job.project_id),
    status: job.status,
    query: job.query_text,
    geo: job.geo,
    limit: Number(job.limit_count),
    classify_with_ai: Boolean(job.classify_with_ai),
    progress: parseProgress(job.progress_json),
    error: job.error,
    started_at: job.started_at,
    completed_at: job.completed_at,
    created_at: job.created_at,
    updated_at: job.updated_at,
  }
}

function parseProgress(value: string | null): ParsingProgress {
  if (!value) return defaultProgress()
  try {
    const parsed = JSON.parse(value) as Partial<ParsingProgress>
    return {
      groups_found: Number(parsed.groups_found ?? 0),
      groups_processed: Number(parsed.groups_processed ?? 0),
      admins_found: Number(parsed.admins_found ?? 0),
      participants_found: Number(parsed.participants_found ?? 0),
      leads_added: Number(parsed.leads_added ?? 0),
      leads_skipped: Number(parsed.leads_skipped ?? 0),
      tokens_spent: Number(parsed.tokens_spent ?? 0),
    }
  } catch {
    return defaultProgress()
  }
}

function defaultProgress(): ParsingProgress {
  return {
    groups_found: 0,
    groups_processed: 0,
    admins_found: 0,
    participants_found: 0,
    leads_added: 0,
    leads_skipped: 0,
    tokens_spent: 0,
  }
}

function normalizeQuery(query?: string) {
  const value = query?.trim() ?? ''
  return value.slice(0, 4000)
}

function normalizeOptional(value?: string | null) {
  const normalized = value?.trim() ?? ''
  return normalized ? normalized.slice(0, 255) : null
}

function normalizeLimit(value?: number) {
  if (value === undefined) return 25
  if (!Number.isInteger(value) || value <= 0 || value > 200) {
    return null
  }
  return value
}

export default parsing
