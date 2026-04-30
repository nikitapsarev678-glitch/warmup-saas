import { Hono } from 'hono'
import type { Env } from '../index'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'

const projects = new Hono<{ Bindings: Env } & AuthContext>()

projects.use('*', requireAuth)

projects.get('/', async (c) => {
  const userId = c.get('userId')

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(userId)
    .all()

  return c.json({ projects: results })
})

projects.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ name?: string }>()
  const name = body.name?.trim()

  if (!name) {
    return c.json({ error: 'name обязателен' }, 400)
  }

  const result = await c.env.DB.prepare('INSERT INTO projects (user_id, name) VALUES (?, ?)')
    .bind(userId, name)
    .run()

  return c.json({ ok: true, project_id: result.meta.last_row_id }, 201)
})

projects.put('/:id', async (c) => {
  const userId = c.get('userId')
  const projectId = Number(c.req.param('id'))

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const body = await c.req.json<{ name?: string }>()
  const name = body.name?.trim()

  if (!name) {
    return c.json({ error: 'name обязателен' }, 400)
  }

  const result = await c.env.DB.prepare('UPDATE projects SET name = ? WHERE id = ? AND user_id = ?')
    .bind(name, projectId, userId)
    .run()

  if ((result.meta.changes ?? 0) === 0) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json({ ok: true })
})

projects.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const projectId = Number(c.req.param('id'))

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE tg_accounts SET project_id = NULL WHERE project_id = ? AND user_id = ?').bind(projectId, userId),
    c.env.DB.prepare('UPDATE campaigns SET project_id = NULL WHERE project_id = ? AND user_id = ?').bind(projectId, userId),
    c.env.DB.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').bind(projectId, userId),
  ])

  return c.json({ ok: true })
})

export default projects
