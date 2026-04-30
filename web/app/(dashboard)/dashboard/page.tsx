import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getMe } from '@/lib/auth'
import { serverApiFetchSafe } from '@/lib/server-api'
import type { Campaign, TgAccount } from '@/lib/types'

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

interface WarmupAction {
  id: number
  action_type: string
  executed_at: string
}

async function fetchDashboardData() {
  const [campaignsResult, accountsResult] = await Promise.all([
    serverApiFetchSafe<{ campaigns: Campaign[] }>('/campaigns'),
    serverApiFetchSafe<{ accounts: TgAccount[] }>('/accounts'),
  ])

  return {
    campaigns: campaignsResult.data?.campaigns ?? [],
    accounts: accountsResult.data?.accounts ?? [],
    error: campaignsResult.error ?? accountsResult.error,
  }
}

function buildRecentActions(campaigns: Campaign[]): WarmupAction[] {
  return campaigns.slice(0, 8).map((campaign) => ({
    id: campaign.id,
    action_type:
      campaign.status === 'running'
        ? 'campaign_running'
        : campaign.status === 'completed'
          ? 'campaign_completed'
          : 'campaign_created',
    executed_at: campaign.created_at,
  }))
}

function formatActionLabel(type: string) {
  const labels: Record<string, string> = {
    campaign_running: 'кампания запущена',
    campaign_completed: 'кампания завершена',
    campaign_created: 'кампания создана',
  }

  return labels[type] ?? type.replaceAll('_', ' ')
}

function getAccountStats(accounts: TgAccount[]) {
  return {
    total: accounts.length,
    active: accounts.filter((account) => ['active', 'warming', 'warmed'].includes(account.status)).length,
    warming: accounts.filter((account) => account.status === 'warming').length,
    warmed: accounts.filter((account) => account.status === 'warmed').length,
  }
}

function isToday(value: string) {
  const date = new Date(value)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function buildStats(campaigns: Campaign[], accounts: TgAccount[], actions: WarmupAction[]): DashboardStats {
  const accountStats = getAccountStats(accounts)
  const campaignsRunning = campaigns.filter((campaign) => campaign.status === 'running').length

  return {
    accounts_total: accountStats.total,
    accounts_active: accountStats.active,
    accounts_warmed: accountStats.warmed,
    accounts_warming: accountStats.warming,
    campaigns_total: campaigns.length,
    campaigns_running: campaignsRunning,
    actions_today: actions.filter((action) => isToday(action.executed_at)).length,
    actions_total: actions.length,
  }
}

export default async function DashboardPage() {
  const user = await getMe()
  const { campaigns, accounts, error } = await fetchDashboardData()
  const recentActions = buildRecentActions(campaigns)
  const stats = buildStats(campaigns, accounts, recentActions)

  return (
    <div className="space-y-6">
      <div className="workspace-section flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="headline-capsule max-w-[13ch] text-[2.05rem] font-semibold sm:text-[2.4rem]">
            <span className="headline-slice">Панель управления</span>
          </h1>
          <p className="mt-2 text-sm font-medium tracking-[-0.01em] text-muted-foreground">Аккаунты, прогрев и события под контролем</p>
        </div>
        <Link href="/campaigns/new">
          <Button>Новая кампания</Button>
        </Link>
      </div>

      {error && (
        <Card className="border-amber-200/60 bg-amber-500/10 text-amber-900 dark:text-amber-100">
          <CardContent className="p-6 text-sm">
            <p className="font-medium">Часть данных дашборда временно недоступна.</p>
            <p className="mt-2 text-current/85">{error}</p>
            <p className="mt-2 text-current/85">Проверьте API и обновите страницу чуть позже.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Всего аккаунтов" value={stats.accounts_total} sub={`Лимит: ${user?.accounts_limit ?? 0}`} />
        <StatCard label="Прогреваются" value={stats.accounts_warming} sub={`${stats.campaigns_running} активных задач`} />
        <StatCard label="Прогреты" value={stats.accounts_warmed} sub="Готовы к работе" />
        <StatCard label="Действий сегодня" value={stats.actions_today} sub={`Всего: ${stats.actions_total}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <RecentTasks campaigns={campaigns} />
        <RecentActions actions={recentActions} />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-3xl font-bold tracking-[-0.03em] text-foreground">{value}</div>
        <div className="mt-2 text-sm font-medium text-foreground">{label}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  )
}

function RecentTasks({ campaigns }: { campaigns: Campaign[] }) {
  const recent = campaigns.slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Последние задачи</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recent.length === 0 ? (
          <div className="dashed-panel rounded-[0.95rem] px-4 py-6 text-sm text-muted-foreground">Нет задач</div>
        ) : (
          recent.map((campaign) => (
            <div key={campaign.id} className="workspace-section flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{campaign.name}</div>
                <div className="text-xs text-muted-foreground">{campaign.warmup_days} дней прогрева</div>
              </div>
              <StatusBadge status={campaign.status} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function RecentActions({ actions }: { actions: WarmupAction[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Последние действия</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {actions.length === 0 ? (
          <div className="dashed-panel rounded-[0.95rem] px-4 py-6 text-sm text-muted-foreground">Действий пока нет</div>
        ) : (
          actions.slice(0, 8).map((action) => (
            <div key={action.id} className="workspace-section flex items-center gap-3 px-4 py-3 text-foreground/88">
              <span className="surface-pill min-w-14 px-2 py-1 text-center text-[11px] font-medium text-muted-foreground">
                {new Date(action.executed_at).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span>{formatActionLabel(action.action_type)}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const map: Record<Campaign['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
    idle: { label: 'Ожидает', variant: 'secondary' },
    running: { label: 'Идёт', variant: 'default' },
    paused: { label: 'На паузе', variant: 'secondary' },
    completed: { label: 'Завершена', variant: 'secondary' },
    error: { label: 'Ошибка', variant: 'destructive' },
  }

  const info = map[status]
  return <Badge variant={info.variant}>{info.label}</Badge>
}
