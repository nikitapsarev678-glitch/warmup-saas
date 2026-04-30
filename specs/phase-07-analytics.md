# Фаза 7 — Analytics

> Читай SPEC.md перед началом. Фазы 1, 2, 5, 6 должны быть выполнены.  
> Эта фаза добавляет: worker/src/routes/analytics.ts и web/app/(dashboard)/analytics/page.tsx.

## Цель
Страница аналитики: графики действий по дням, статистика по аккаунтам, прогресс кампаний, хитмап активности.

## Не трогай
- Другие routes/ файлы
- Таблицы кроме чтения из warmup_actions, tg_accounts, campaigns, campaign_accounts

---

## Файл: worker/src/routes/analytics.ts

```typescript
import { Hono } from 'hono'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import type { Env } from '../index'

const analytics = new Hono<{ Bindings: Env } & AuthContext >()
analytics.use('*', requireAuth)

// GET /analytics/summary — общая статистика
analytics.get('/summary', async (c) => {
  const userId = c.get('userId')

  const [accountStats, campaignStats, actionStats, todayStats] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'warming' THEN 1 ELSE 0 END) as warming,
        SUM(CASE WHEN status = 'warmed' THEN 1 ELSE 0 END) as warmed
      FROM tg_accounts WHERE user_id = ?
    `).bind(userId).first<any>(),

    c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running
      FROM campaigns WHERE user_id = ?
    `).bind(userId).first<any>(),

    c.env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM warmup_actions wa
      JOIN campaigns c ON c.id = wa.campaign_id
      WHERE c.user_id = ?
    `).bind(userId).first<{ total: number }>(),

    c.env.DB.prepare(`
      SELECT COUNT(*) as today
      FROM warmup_actions wa
      JOIN campaigns c ON c.id = wa.campaign_id
      WHERE c.user_id = ?
        AND DATE(wa.executed_at) = DATE('now')
    `).bind(userId).first<{ today: number }>(),
  ])

  return c.json({
    stats: {
      accounts_total: accountStats?.total ?? 0,
      accounts_active: accountStats?.active ?? 0,
      accounts_warming: accountStats?.warming ?? 0,
      accounts_warmed: accountStats?.warmed ?? 0,
      campaigns_total: campaignStats?.total ?? 0,
      campaigns_running: campaignStats?.running ?? 0,
      actions_total: actionStats?.total ?? 0,
      actions_today: todayStats?.today ?? 0,
    }
  })
})

// GET /analytics/recent-actions — последние 50 действий
analytics.get('/recent-actions', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare(`
      SELECT wa.*, a.phone, a.first_name, a.username
      FROM warmup_actions wa
      JOIN tg_accounts a ON a.id = wa.account_id
      JOIN campaigns c ON c.id = wa.campaign_id
      WHERE c.user_id = ?
      ORDER BY wa.executed_at DESC
      LIMIT 50
    `)
    .bind(userId)
    .all()
  return c.json({ actions: results })
})

// GET /analytics/actions-by-day — действия по дням (последние 30 дней)
analytics.get('/actions-by-day', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare(`
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
    `)
    .bind(userId)
    .all()
  return c.json({ days: results })
})

// GET /analytics/actions-by-type — разбивка по типам действий
analytics.get('/actions-by-type', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare(`
      SELECT
        wa.action_type,
        COUNT(*) as total,
        SUM(CASE WHEN wa.status = 'ok' THEN 1 ELSE 0 END) as success
      FROM warmup_actions wa
      JOIN campaigns c ON c.id = wa.campaign_id
      WHERE c.user_id = ?
      GROUP BY wa.action_type
      ORDER BY total DESC
    `)
    .bind(userId)
    .all()
  return c.json({ types: results })
})

// GET /analytics/accounts/:id — детальная статистика аккаунта
analytics.get('/accounts/:id', async (c) => {
  const userId = c.get('userId')
  const accountId = parseInt(c.req.param('id'), 10)

  // Проверить ownership
  const account = await c.env.DB
    .prepare('SELECT * FROM tg_accounts WHERE id = ? AND user_id = ?')
    .bind(accountId, userId)
    .first()
  if (!account) return c.json({ error: 'Not found' }, 404)

  const [byDay, byType, recent] = await Promise.all([
    c.env.DB.prepare(`
      SELECT DATE(executed_at) as date, COUNT(*) as total
      FROM warmup_actions
      WHERE account_id = ? AND executed_at >= DATE('now', '-14 days')
      GROUP BY DATE(executed_at)
      ORDER BY date
    `).bind(accountId).all(),

    c.env.DB.prepare(`
      SELECT action_type, COUNT(*) as total, SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) as success
      FROM warmup_actions WHERE account_id = ?
      GROUP BY action_type
    `).bind(accountId).all(),

    c.env.DB.prepare(`
      SELECT * FROM warmup_actions WHERE account_id = ?
      ORDER BY executed_at DESC LIMIT 20
    `).bind(accountId).all(),
  ])

  return c.json({
    account,
    stats: {
      by_day: byDay.results,
      by_type: byType.results,
      recent: recent.results,
    }
  })
})

export default analytics
```

---

## Файл: web/app/(dashboard)/analytics/page.tsx

```tsx
import { apiFetch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActionsChart } from './actions-chart'
import { ActionTypeBreakdown } from './action-type-breakdown'

export default async function AnalyticsPage() {
  const [{ days }, { types }, { actions }] = await Promise.all([
    apiFetch<{ days: any[] }>('/analytics/actions-by-day'),
    apiFetch<{ types: any[] }>('/analytics/actions-by-type'),
    apiFetch<{ actions: any[] }>('/analytics/recent-actions'),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Аналитика</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Действия по дням (30 дней)</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionsChart data={days} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Разбивка по типам</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionTypeBreakdown data={types} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Последние действия</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {actions.slice(0, 15).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${a.status === 'ok' ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="text-gray-600">{a.action_type.replace(/_/g, ' ')}</span>
                  {a.username && <span className="text-gray-400">@{a.username}</span>}
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(a.executed_at).toLocaleString('ru-RU', {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

---

## Файл: web/app/(dashboard)/analytics/actions-chart.tsx

```tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export function ActionsChart({ data }: { data: Array<{ date: string; total: number; success: number; errors: number }> }) {
  if (!data.length) {
    return <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Нет данных</div>
  }

  const formatted = data.map(d => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' }),
  }))

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="success" name="Успешно" fill="#22c55e" stackId="a" />
          <Bar dataKey="errors" name="Ошибки" fill="#ef4444" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

```bash
# Установить recharts
cd web && npm install recharts
```

---

## Файл: web/app/(dashboard)/analytics/action-type-breakdown.tsx

```tsx
'use client'

const ACTION_ICONS: Record<string, string> = {
  join_group:      '👥',
  read_messages:   '📖',
  reaction:        '❤️',
  dialog_sent:     '💬',
  dialog_received: '📨',
  story_view:      '👁',
  profile_updated: '✏️',
}

export function ActionTypeBreakdown({ data }: {
  data: Array<{ action_type: string; total: number; success: number }>
}) {
  const max = Math.max(...data.map(d => d.total), 1)

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const pct = Math.round((item.success / item.total) * 100)
        return (
          <div key={item.action_type}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="flex items-center gap-1.5">
                <span>{ACTION_ICONS[item.action_type] ?? '⚡'}</span>
                <span className="text-gray-700">{item.action_type.replace(/_/g, ' ')}</span>
              </span>
              <span className="text-gray-400 tabular-nums">{item.total} ({pct}%)</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full"
                style={{ width: `${(item.total / max) * 100}%` }}
              />
            </div>
          </div>
        )
      })}
      {data.length === 0 && (
        <div className="text-sm text-gray-400 text-center py-4">Нет данных</div>
      )}
    </div>
  )
}
```

---

## Подключить в worker/src/index.ts

```typescript
import analyticsRoutes from './routes/analytics'
app.route('/analytics', analyticsRoutes)
```

---

## Acceptance criteria

- [ ] `GET /analytics/summary` → возвращает все 8 полей статистики
- [ ] `GET /analytics/actions-by-day` → данные за 30 дней с группировкой
- [ ] `GET /analytics/actions-by-type` → разбивка по типам действий
- [ ] `GET /analytics/recent-actions` → последние 50 действий
- [ ] `GET /analytics/accounts/:id` → 404 если аккаунт не принадлежит пользователю (tenant isolation!)
- [ ] Страница `/analytics` отображает bar chart с данными по дням
- [ ] Chart не падает если данных нет (показывает заглушку)
- [ ] Разбивка по типам с прогресс-барами отображается корректно
