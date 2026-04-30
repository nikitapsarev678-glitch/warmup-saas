# Фаза 6 — Dashboard UI (Веб-интерфейс)

> Читай SPEC.md перед началом. Фазы 0, 1, 2 должны быть выполнены (scaffold + db + auth).  
> Эта фаза работает ТОЛЬКО с `web/` директорией. Не трогай `worker/` и `runner/`.

## Цель
Полноценный веб-дашборд “как Contez”: главная с метриками, **задачи прогрева** (внутри это `campaigns`, но в UI называем “Прогрев/Задания”), страница “Подключения” (аккаунты), прокси, проекты (пустой стейт на MVP), биллинг+токены.

`/settings` на этой фазе может быть пустым экраном-заглушкой (чтобы навигация совпадала с Contez).

---

## Файл: web/components/sidebar.tsx

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { SaasUser } from '@/lib/types'

const NAV = [
  { href: '/dashboard',  icon: '📊', label: 'Дашборд' },
  { href: '/projects',   icon: '🗂️', label: 'Проекты' },
  { href: '/accounts',   icon: '🔌', label: 'Подключения' },
  { href: '/proxies',    icon: '🛡️', label: 'Прокси' },
  { href: '/campaigns',  icon: '🔥', label: 'Прогрев' },
  { href: '/analytics',  icon: '📈', label: 'Аналитика' },
  { href: '/billing',    icon: '🪙', label: 'Тариф и токены' },
  { href: '/settings',   icon: '⚙️', label: 'Настройки' },
]

export function Sidebar({ user }: { user: SaasUser }) {
  const path = usePathname()

  return (
    <aside className="w-60 border-r bg-white flex flex-col h-full">
      <div className="p-6 border-b">
        <div className="font-bold text-lg">Varmup</div>
        <div className="text-xs text-gray-400 mt-1">
          Тариф: <span className="capitalize font-medium text-gray-600">{user.plan}</span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              path.startsWith(item.href)
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50'
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t">
        <div className="flex items-center gap-3">
          {user.photo_url && (
            <img src={user.photo_url} alt="" className="w-8 h-8 rounded-full" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {user.first_name} {user.last_name}
            </div>
            {user.telegram_username && (
              <div className="text-xs text-gray-400">@{user.telegram_username}</div>
            )}
          </div>
        </div>
        <form action="/api/logout" method="POST" className="mt-3">
          <button className="text-xs text-gray-400 hover:text-gray-600 w-full text-left">
            Выйти
          </button>
        </form>
      </div>
    </aside>
  )
}
```

---

## Файл: web/app/(dashboard)/dashboard/page.tsx

```tsx
import { apiFetch } from '@/lib/api'
import { getMe } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DashboardStats {
  accounts_total: number
  accounts_active: number
  accounts_warmed: number
  accounts_warming: number
  campaigns_total: number
  campaigns_running: number
  actions_today: number
  actions_total: number
}

export default async function DashboardPage() {
  const [user, stats] = await Promise.all([
    getMe(),
    apiFetch<{ stats: DashboardStats }>('/analytics/summary').then(r => r.stats),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Дашборд</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Всего аккаунтов" value={stats.accounts_total} icon="👤"
          sub={`Лимит: ${user?.accounts_limit}`} />
        <StatCard label="Прогреваются" value={stats.accounts_warming} icon="🔥"
          sub={`${stats.campaigns_running} задач`} />
        <StatCard label="Прогреты" value={stats.accounts_warmed} icon="✅"
          sub="Готовы к работе" />
        <StatCard label="Действий сегодня" value={stats.actions_today} icon="⚡"
          sub={`Всего: ${stats.actions_total}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentTasks />
        <RecentActions />
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, sub }: {
  label: string; value: number; icon: string; sub?: string
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="text-2xl">{icon}</div>
        </div>
        <div className="mt-3">
          <div className="text-3xl font-bold">{value}</div>
          <div className="text-sm font-medium text-gray-700 mt-1">{label}</div>
          {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

async function RecentTasks() {
  const { campaigns } = await apiFetch<{ campaigns: any[] }>('/campaigns')
  const recent = campaigns.slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Последние задачи</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recent.length === 0 && (
          <div className="text-sm text-gray-400">Нет задач</div>
        )}
        {recent.map((c) => (
          <div key={c.id} className="flex items-center justify-between text-sm">
            <span className="font-medium">{c.name}</span>
            <StatusBadge status={c.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

async function RecentActions() {
  const { actions } = await apiFetch<{ actions: any[] }>('/analytics/recent-actions')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Последние действия</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {actions.slice(0, 8).map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-gray-600">
            <span className="text-xs text-gray-400">
              {new Date(a.executed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <ActionIcon type={a.action_type} />
            <span className="truncate">{a.action_type.replace('_', ' ')}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    idle: 'bg-gray-100 text-gray-600',
    running: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    paused: 'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-gray-100'}`}>
      {status}
    </span>
  )
}

function ActionIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    join_group: '👥', read_messages: '📖', reaction: '❤️',
    dialog_sent: '💬', story_view: '👁', profile_updated: '✏️',
  }
  return <span>{icons[type] ?? '⚡'}</span>
}
```

---

## Файл: web/app/(dashboard)/campaigns/page.tsx

```tsx
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Campaign } from '@/lib/types'

export default async function CampaignsPage() {
  const { campaigns } = await apiFetch<{ campaigns: Campaign[] }>('/campaigns')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Кампании прогрева</h1>
        <Link href="/campaigns/new">
          <Button>+ Новая кампания</Button>
        </Link>
      </div>

      <div className="grid gap-3">
        {campaigns.length === 0 && (
          <Card className="p-8 text-center text-gray-400">
            Нет кампаний. Создайте первую кампанию прогрева.
          </Card>
        )}
        {campaigns.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-sm text-gray-400 mt-0.5">
                  {c.warmup_days} дней • {c.daily_actions_min}–{c.daily_actions_max} действий/день
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CampaignStatusBadge status={c.status} />
                <Link href={`/campaigns/${c.id}`}>
                  <Button variant="outline" size="sm">Открыть</Button>
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function CampaignStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
    idle:      { label: 'Ожидает', variant: 'secondary' },
    running:   { label: 'Идёт', variant: 'default' },
    completed: { label: 'Завершена', variant: 'secondary' },
    error:     { label: 'Ошибка', variant: 'destructive' },
    paused:    { label: 'На паузе', variant: 'secondary' },
  }
  const info = map[status] ?? { label: status, variant: 'secondary' }
  return <Badge variant={info.variant}>{info.label}</Badge>
}
```

---

## Файл: web/app/(dashboard)/campaigns/new/page.tsx

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'

const DEFAULT_ACTIONS = {
  join_groups: true,
  read_messages: true,
  reactions: true,
  dialogs: true,
  story_views: true,
  profile_setup: true,
}

const ACTION_LABELS: Record<string, { label: string; desc: string }> = {
  profile_setup: { label: 'Настройка профиля', desc: 'Установить имя и bio при первом запуске' },
  join_groups:   { label: 'Вступление в группы', desc: 'Вступать в 1-3 группы в день' },
  read_messages: { label: 'Чтение сообщений', desc: 'Открывать диалоги и прокручивать ленту' },
  reactions:     { label: 'Реакции', desc: 'Ставить лайки и эмодзи на посты' },
  story_views:   { label: 'Просмотр историй', desc: 'Смотреть stories контактов и каналов' },
  dialogs:       { label: 'Диалоги', desc: 'Переписка с другими аккаунтами пула' },
}

export default function NewCampaignPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [warmupDays, setWarmupDays] = useState(14)
  const [dailyMin, setDailyMin] = useState(5)
  const [dailyMax, setDailyMax] = useState(15)
  const [delayMin, setDelayMin] = useState(60)
  const [delayMax, setDelayMax] = useState(300)
  const [workStart, setWorkStart] = useState(9)
  const [workEnd, setWorkEnd] = useState(22)
  const [usePoolDialogs, setUsePoolDialogs] = useState(true)
  const [actions, setActions] = useState(DEFAULT_ACTIONS)
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await apiFetch<{ campaign_id: number }>('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name,
          warmup_days: warmupDays,
          daily_actions_min: dailyMin,
          daily_actions_max: dailyMax,
          delay_between_actions_min: delayMin,
          delay_between_actions_max: delayMax,
          work_hour_start: workStart,
          work_hour_end: workEnd,
          use_pool_dialogs: usePoolDialogs ? 1 : 0,
          actions_config: actions,
          account_ids: selectedAccounts,
        }),
      })
      router.push(`/campaigns/${res.campaign_id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Новая кампания прогрева</h1>
      <form onSubmit={handleSubmit} className="space-y-6">

        <Card>
          <CardHeader><CardTitle className="text-base">Основное</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Название кампании</Label>
              <Input placeholder="Мой прогрев #1" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <Label>Дней прогрева: <span className="font-bold">{warmupDays}</span></Label>
              <Slider min={3} max={60} value={[warmupDays]} onValueChange={([v]) => setWarmupDays(v)} className="mt-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Интенсивность</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Действий в день: <span className="font-bold">{dailyMin}–{dailyMax}</span></Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="text-xs text-gray-400">Минимум</Label>
                  <Input type="number" min={2} max={30} value={dailyMin} onChange={e => setDailyMin(+e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Максимум</Label>
                  <Input type="number" min={2} max={50} value={dailyMax} onChange={e => setDailyMax(+e.target.value)} />
                </div>
              </div>
            </div>
            <div>
              <Label>Задержка между действиями (сек): <span className="font-bold">{delayMin}–{delayMax}</span></Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="text-xs text-gray-400">Минимум</Label>
                  <Input type="number" min={10} value={delayMin} onChange={e => setDelayMin(+e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Максимум</Label>
                  <Input type="number" min={30} value={delayMax} onChange={e => setDelayMax(+e.target.value)} />
                </div>
              </div>
            </div>
            <div>
              <Label>Рабочие часы (МСК): <span className="font-bold">{workStart}:00 – {workEnd}:00</span></Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <Input type="number" min={0} max={23} value={workStart} onChange={e => setWorkStart(+e.target.value)} />
                <Input type="number" min={0} max={23} value={workEnd} onChange={e => setWorkEnd(+e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Действия прогрева</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(ACTION_LABELS).map(([key, info]) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{info.label}</div>
                  <div className="text-xs text-gray-400">{info.desc}</div>
                </div>
                <Switch
                  checked={actions[key as keyof typeof actions]}
                  onCheckedChange={(v) => setActions(prev => ({ ...prev, [key]: v }))}
                />
              </div>
            ))}
            <div className="border-t pt-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Диалоги внутри пула</div>
                <div className="text-xs text-gray-400">Аккаунты переписываются между собой</div>
              </div>
              <Switch checked={usePoolDialogs} onCheckedChange={setUsePoolDialogs} />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={loading || !name.trim()} className="w-full">
          {loading ? 'Создаю...' : 'Создать кампанию'}
        </Button>
      </form>
    </div>
  )
}
```

---

## Файл: worker/src/routes/campaigns.ts

```typescript
import { Hono } from 'hono'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import { getCampaignsByUser, getCampaignById } from '../db'
import type { Env } from '../index'

const campaigns = new Hono<{ Bindings: Env } & AuthContext >()
campaigns.use('*', requireAuth)

campaigns.get('/', async (c) => {
  const userId = c.get('userId')
  const list = await getCampaignsByUser(c.env.DB, userId)
  return c.json({ campaigns: list })
})

campaigns.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    name: string
    warmup_days: number
    daily_actions_min: number
    daily_actions_max: number
    delay_between_actions_min: number
    delay_between_actions_max: number
    work_hour_start: number
    work_hour_end: number
    use_pool_dialogs: number
    actions_config: Record<string, boolean>
    account_ids: number[]
  }>()

  const result = await c.env.DB
    .prepare(`
      INSERT INTO campaigns (user_id, name, warmup_days, daily_actions_min, daily_actions_max,
        delay_between_actions_min, delay_between_actions_max, work_hour_start, work_hour_end,
        use_pool_dialogs, actions_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId, body.name, body.warmup_days,
      body.daily_actions_min, body.daily_actions_max,
      body.delay_between_actions_min, body.delay_between_actions_max,
      body.work_hour_start, body.work_hour_end,
      body.use_pool_dialogs,
      JSON.stringify(body.actions_config)
    )
    .run()

  const campaignId = result.meta.last_row_id

  // Привязать аккаунты к кампании
  for (const accId of body.account_ids ?? []) {
    await c.env.DB
      .prepare('INSERT OR IGNORE INTO campaign_accounts (campaign_id, account_id) VALUES (?, ?)')
      .bind(campaignId, accId)
      .run()
  }

  return c.json({ campaign_id: campaignId }, 201)
})

campaigns.post('/:id/start', async (c) => {
  const userId = c.get('userId')
  const campaignId = parseInt(c.req.param('id'), 10)

  const campaign = await getCampaignById(c.env.DB, campaignId, userId)
  if (!campaign) return c.json({ error: 'Not found' }, 404)
  if (campaign.status === 'running') return c.json({ error: 'Already running' }, 400)

  // Триггернуть GitHub Actions
  await fetch(
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
        inputs: { campaign_id: String(campaignId), action: 'run_campaign' },
      }),
    }
  )

  return c.json({ ok: true })
})

campaigns.post('/:id/stop', async (c) => {
  const userId = c.get('userId')
  const campaignId = parseInt(c.req.param('id'), 10)
  const campaign = await getCampaignById(c.env.DB, campaignId, userId)
  if (!campaign) return c.json({ error: 'Not found' }, 404)

  await c.env.DB
    .prepare("UPDATE campaigns SET status = 'paused' WHERE id = ? AND user_id = ?")
    .bind(campaignId, userId)
    .run()

  return c.json({ ok: true })
})

campaigns.get('/:id/progress', async (c) => {
  const userId = c.get('userId')
  const campaignId = parseInt(c.req.param('id'), 10)
  const campaign = await getCampaignById(c.env.DB, campaignId, userId)
  if (!campaign) return c.json({ error: 'Not found' }, 404)

  const accounts = await c.env.DB
    .prepare('SELECT * FROM campaign_accounts WHERE campaign_id = ?')
    .bind(campaignId)
    .all()

  return c.json({ campaign, accounts: accounts.results })
})

export default campaigns
```

---

## Acceptance criteria

- [ ] Sidebar отображается на всех страницах дашборда
- [ ] `/dashboard` показывает 4 карточки со статистикой
- [ ] `/campaigns` список кампаний с цветными статус-бейджами
- [ ] `/campaigns/new` форма создания с кастомизацией всех параметров
- [ ] Переключатели действий прогрева работают (включить/выключить каждое)
- [ ] `POST /campaigns` создаёт кампанию и возвращает `{campaign_id}`
- [ ] `POST /campaigns/:id/start` триггерит GitHub Actions
- [ ] `POST /campaigns/:id/stop` меняет статус на 'paused'
