import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { countUserAccounts, enforceUserActionCooldown } from '../db'
import type { Env } from '../index'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'

type ImportSourceType = 'tdata_zip' | 'session_json_zip' | 'string_session_txt'
type ImportJobStatus = 'pending' | 'uploaded' | 'queued' | 'running' | 'action_required' | 'done' | 'error'

type ImportJobRow = {
  id: number
  user_id: number
  project_id: number | null
  source_type: ImportSourceType
  r2_key: string | null
  status: ImportJobStatus
  stats_json: string | null
  action_json: string | null
  error: string | null
  created_at: string
}

const IMPORT_SOURCE_TYPES: ImportSourceType[] = ['tdata_zip', 'session_json_zip', 'string_session_txt']
const DOWNLOAD_TTL_SECONDS = 60 * 60

const accountImport = new Hono<{ Bindings: Env } & AuthContext>()

function ensureImportsBucket(env: Env) {
  if (!env.IMPORTS_BUCKET) {
    return {
      error: 'Импорт аккаунтов временно недоступен: R2 storage не настроен в этой среде.',
      reason: 'storage_unavailable',
    } as const
  }

  return null
}

const requireRunnerSignature = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const expires = Number(c.req.query('expires'))
  const token = c.req.query('token')?.trim() ?? ''
  const jobId = Number(c.req.param('id'))

  if (!Number.isInteger(jobId) || jobId <= 0 || !Number.isInteger(expires) || !token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (expires * 1000 < Date.now()) {
    return c.json({ error: 'Token expired' }, 401)
  }

  const expected = await signDownloadToken(jobId, expires, c.env.JWT_SECRET)
  if (token !== expected) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})

accountImport.post('/init', requireAuth, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const cooldown = await enforceUserActionCooldown(c.env.DB, {
    userId,
    action: 'account_import_init',
    cooldownSeconds: 30,
  })

  if (!cooldown.ok) {
    return c.json(
      {
        error: 'Импорт уже был инициализирован совсем недавно',
        reason: 'cooldown_active',
        next_action: 'Подождите немного и повторите создание import job.',
        retry_after_seconds: cooldown.retryAfterSeconds,
      },
      429
    )
  }

  const body = await c.req.json<{ source_type?: string; project_id?: number | null }>()

  const sourceType = normalizeSourceType(body.source_type)
  if (!sourceType) {
    return c.json({ error: 'Unsupported source_type' }, 400)
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

  const count = await countUserAccounts(c.env.DB, userId)
  if (count >= user.accounts_limit) {
    return c.json(
      { error: `Account limit for ${user.plan} plan is ${user.accounts_limit}` },
      403
    )
  }

  const result = await c.env.DB
    .prepare(
      `
        INSERT INTO account_import_jobs (user_id, project_id, source_type, status)
        VALUES (?, ?, ?, 'pending')
      `
    )
    .bind(userId, projectId, sourceType)
    .run()

  const jobId = Number(result.meta.last_row_id)
  const origin = new URL(c.req.url).origin

  return c.json(
    {
      ok: true,
      job_id: jobId,
      upload_url: `${origin}/accounts/import/upload/${jobId}`,
    },
    201
  )
})

accountImport.put('/upload/:id', requireAuth, async (c) => {
  const storageError = ensureImportsBucket(c.env)
  if (storageError) {
    return c.json(storageError, 503)
  }

  const userId = c.get('userId')
  const jobId = Number(c.req.param('id'))

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const job = await getImportJobById(c.env.DB, jobId, userId)
  if (!job) {
    return c.json({ error: 'Not found' }, 404)
  }

  if (job.status !== 'pending' && job.status !== 'uploaded') {
    return c.json({ error: 'Job cannot accept upload in current state' }, 409)
  }

  const contentLength = Number(c.req.header('content-length') ?? '0')
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return c.json({ error: 'Empty upload' }, 400)
  }

  const key = `imports/${userId}/${jobId}/archive`
  await c.env.IMPORTS_BUCKET.put(key, c.req.raw.body, {
    httpMetadata: {
      contentType: c.req.header('content-type') ?? 'application/octet-stream',
    },
  })

  await c.env.DB
    .prepare(
      `
        UPDATE account_import_jobs
        SET r2_key = ?, status = 'uploaded', error = NULL
        WHERE id = ? AND user_id = ?
      `
    )
    .bind(key, jobId, userId)
    .run()

  return c.json({ ok: true })
})

accountImport.post('/:id/commit', requireAuth, async (c) => {
  const userId = c.get('userId')
  const jobId = Number(c.req.param('id'))

  const cooldown = await enforceUserActionCooldown(c.env.DB, {
    userId,
    action: 'account_import_commit',
    refId: String(jobId),
    cooldownSeconds: 30,
  })

  if (!cooldown.ok) {
    return c.json(
      {
        error: 'Импорт уже отправлен в очередь совсем недавно',
        reason: 'cooldown_active',
        next_action: 'Дождитесь постановки job в очередь и повторите позже при необходимости.',
        retry_after_seconds: cooldown.retryAfterSeconds,
      },
      429
    )
  }

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const job = await getImportJobById(c.env.DB, jobId, userId)
  if (!job) {
    return c.json({ error: 'Not found' }, 404)
  }

  if (!job.r2_key) {
    return c.json({ error: 'Archive is not uploaded yet' }, 409)
  }

  if (!['uploaded', 'action_required', 'error'].includes(job.status)) {
    return c.json({ error: 'Job cannot be committed in current state' }, 409)
  }

  const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SECONDS
  const token = await signDownloadToken(jobId, expires, c.env.JWT_SECRET)
  const origin = new URL(c.req.url).origin
  const downloadUrl = `${origin}/accounts/import/download/${jobId}?expires=${expires}&token=${token}`

  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `
          UPDATE account_import_jobs
          SET status = 'queued', error = NULL
          WHERE id = ? AND user_id = ?
        `
      )
      .bind(jobId, userId),
    c.env.DB
      .prepare(
        `
          INSERT INTO task_queue (campaign_id, action, params_json)
          VALUES (NULL, 'import_accounts', ?)
        `
      )
      .bind(JSON.stringify({ job_id: jobId, download_url: downloadUrl })),
  ])

  const githubResponse = await triggerGithubRunner(c.env, 'import_accounts', { job_id: jobId })
  if (!githubResponse.ok) {
    return c.json(
      {
        error: 'Failed to dispatch runner',
        reason: 'runner_unavailable',
        next_action: 'Job уже в очереди. Проверьте runner или повторите чуть позже.',
      },
      502
    )
  }

  return c.json({ ok: true, job_id: jobId, status: 'queued' })
})

accountImport.get('/download/:id', requireRunnerSignature, async (c) => {
  const storageError = ensureImportsBucket(c.env)
  if (storageError) {
    return c.json(storageError, 503)
  }

  const jobId = Number(c.req.param('id'))
  const job = await c.env.DB
    .prepare('SELECT r2_key FROM account_import_jobs WHERE id = ?')
    .bind(jobId)
    .first<{ r2_key: string | null }>()

  if (!job?.r2_key) {
    return c.json({ error: 'Not found' }, 404)
  }

  const object = await c.env.IMPORTS_BUCKET.get(job.r2_key)
  if (!object) {
    return c.json({ error: 'Archive not found' }, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('Content-Disposition', `attachment; filename="import-${jobId}.bin"`)

  return new Response(object.body, { headers })
})

accountImport.get('/:id', requireAuth, async (c) => {
  const userId = c.get('userId')
  const jobId = Number(c.req.param('id'))

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const job = await getImportJobById(c.env.DB, jobId, userId)
  if (!job) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json({
    job: {
      id: job.id,
      project_id: job.project_id,
      source_type: job.source_type,
      status: job.status,
      stats: safeJsonParse(job.stats_json),
      action: safeJsonParse(job.action_json),
      error: job.error,
      created_at: job.created_at,
    },
  })
})

async function getImportJobById(
  db: D1Database,
  jobId: number,
  userId: number
): Promise<ImportJobRow | null> {
  return db
    .prepare('SELECT * FROM account_import_jobs WHERE id = ? AND user_id = ?')
    .bind(jobId, userId)
    .first<ImportJobRow>()
}

function normalizeSourceType(sourceType?: string): ImportSourceType | null {
  if (!sourceType) return null
  return IMPORT_SOURCE_TYPES.includes(sourceType as ImportSourceType)
    ? (sourceType as ImportSourceType)
    : null
}

function safeJsonParse(value: string | null): unknown {
  if (!value) return null

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function triggerGithubRunner(
  env: Env,
  action = 'run_warmup_day',
  extraInputs?: Record<string, string | number | boolean>
) {
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
          action,
          ...Object.fromEntries(
            Object.entries(extraInputs ?? {}).map(([key, value]) => [key, String(value)])
          ),
        },
      }),
    }
  )
}

async function signDownloadToken(jobId: number, expires: number, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${jobId}:${expires}`)
  )

  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export default accountImport
