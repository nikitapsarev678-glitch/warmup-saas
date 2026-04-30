# Фаза 14 — Projects (организация ресурсов как в Contez)

> Читай SPEC.md перед началом. Фазы 1, 2, 4, 6 должны быть выполнены (database, auth, accounts, UI).  
> Эта фаза добавляет орг-слой “Проекты” как в Contez: группировка аккаунтов и задач прогрева.  
> Работает в `worker/` и `web/` (аддитивно). Не трогай `runner/`.

## Цель
Добавить сущность **Project**:
- пользователь создаёт проекты
- аккаунты и кампании (задачи прогрева) можно привязать к проекту
- по проекту можно фильтровать списки

---

## Файл: worker/migrations/0006_projects.sql

```sql
-- Проекты (принадлежат пользователю)
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, created_at DESC);

-- Привязка проектов к аккаунтам и кампаниям (опционально)
ALTER TABLE tg_accounts ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE campaigns  ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
```

---

## Файл: worker/src/routes/projects.ts (новый файл)

```ts
import { Hono } from 'hono'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import type { Env } from '../index'

const projects = new Hono<{ Bindings: Env } & AuthContext>()
projects.use('*', requireAuth)

projects.get('/', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all()
  return c.json({ projects: results })
})

projects.post('/', async (c) => {
  const userId = c.get('userId')
  const { name } = await c.req.json<{ name: string }>()
  if (!name?.trim()) return c.json({ error: 'name обязателен' }, 400)

  const result = await c.env.DB
    .prepare('INSERT INTO projects (user_id, name) VALUES (?, ?)')
    .bind(userId, name.trim())
    .run()
  return c.json({ ok: true, project_id: result.meta.last_row_id }, 201)
})

projects.put('/:id', async (c) => {
  const userId = c.get('userId')
  const projectId = parseInt(c.req.param('id'), 10)
  const { name } = await c.req.json<{ name: string }>()
  if (!name?.trim()) return c.json({ error: 'name обязателен' }, 400)

  const res = await c.env.DB
    .prepare('UPDATE projects SET name = ? WHERE id = ? AND user_id = ?')
    .bind(name.trim(), projectId, userId)
    .run()
  if ((res.meta.changes ?? 0) === 0) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

projects.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const projectId = parseInt(c.req.param('id'), 10)

  // Отвязать ресурсы (чтобы не ломать списки)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE tg_accounts SET project_id = NULL WHERE project_id = ? AND user_id = ?').bind(projectId, userId),
    c.env.DB.prepare('UPDATE campaigns  SET project_id = NULL WHERE project_id = ? AND user_id = ?').bind(projectId, userId),
    c.env.DB.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').bind(projectId, userId),
  ])

  return c.json({ ok: true })
})

export default projects
```

Подключить в `worker/src/index.ts` (аддитивно):

```ts
import projectsRoutes from './routes/projects'
app.route('/projects', projectsRoutes)
```

---

## Web: страница Projects

## Файл: web/app/(dashboard)/projects/page.tsx (новый файл)

- Пустой стейт “Нет проектов” + кнопка “Создать проект”
- Список проектов карточками/таблицей (name + количество ресурсов можно добавить позже)
- Диалог создания/редактирования (Input name)

---

## Интеграция Projects в Accounts/Campaigns (минимально)

**Важно:** делать аддитивно и только если уже готовы Фазы 4 и 6.

- В `AddAccountDialog` добавить dropdown проектов (optional). При создании аккаунта отправлять `project_id`.
- В форме создания кампании (задачи прогрева) добавить dropdown проектов. При создании/обновлении отправлять `project_id`.
- В списках `/accounts` и `/campaigns` добавить фильтр по проекту (опционально).

---

## Acceptance criteria

- [ ] Таблица `projects` создана
- [ ] `GET /projects` возвращает только проекты пользователя
- [ ] `POST /projects` создаёт проект, 201
- [ ] `PUT /projects/:id` обновляет, чужой проект → 404
- [ ] `DELETE /projects/:id` удаляет и отвязывает ресурсы
- [ ] Страница `/projects` открывается и позволяет создать проект
