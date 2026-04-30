import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type Campaign,
  getActionableErrorCta,
  getCampaignEtaText,
  getCampaignProgressLabel,
  getCampaignProgressStats,
  getCampaignReasonFromError,
  getCampaignStatusInfo,
  summarizeProgressRatio,
} from '@/lib/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

interface CampaignAccountProgress {
  campaign_id: number
  account_id: number
  status: string
  actions_done: number
  days_done: number
  last_run_at: string | null
}

function formatActivityDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU')
}

function getAccountStageLabel(account: CampaignAccountProgress) {
  if (account.status === 'done') return 'Аккаунт завершил текущий прогрев'
  if (account.status === 'error') return 'Нужна проверка аккаунта или runner'
  if (account.actions_done > 0) return 'Идёт текущий прогревочный цикл'
  return 'Ожидает ближайший запуск runner'
}

function getLatestEvents(accounts: CampaignAccountProgress[]) {
  return [...accounts]
    .filter((account) => account.last_run_at)
    .sort((left, right) => Number(new Date(right.last_run_at ?? 0)) - Number(new Date(left.last_run_at ?? 0)))
    .slice(0, 5)
}

function getNextActionCta(status: Campaign['status'], errorMessage?: string | null) {
  if (status === 'paused' || status === 'error') {
    return getActionableErrorCta(errorMessage)
  }

  if (status === 'running') {
    return 'Следить за прогрессом аккаунтов'
  }

  return 'Вернуться к списку кампаний и запустить задачу'
}

function getProgressStage(campaign: Campaign, total: number, done: number, errored: number) {
  if (campaign.status === 'completed' || (total > 0 && done + errored >= total)) {
    return 'Финишируем кампанию'
  }

  if (campaign.status === 'running') {
    return done > 0 ? 'Runner обрабатывает аккаунты' : 'Кампания в очереди выполнения'
  }

  if (campaign.status === 'paused') {
    return 'Кампания поставлена на паузу'
  }

  if (campaign.status === 'error') {
    return 'Кампания требует внимания'
  }

  return 'Кампания готова к запуску'
}

function getApproxEta(campaign: Campaign, total: number, done: number, errored: number) {
  if (campaign.status === 'running') {
    return getCampaignEtaText(total, done, errored)
  }

  if (campaign.status === 'paused' || campaign.status === 'error') {
    return 'ETA появится после возобновления выполнения'
  }

  if (campaign.status === 'completed') {
    return 'Все аккаунты уже обработаны'
  }

  return 'Runner покажет ETA после старта'
}

export default async function CampaignProgressPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    notFound()
  }

  const cookieHeader = (await cookies()).toString()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (cookieHeader) {
    headers.Cookie = cookieHeader
  }

  const data = await fetch(`${API_BASE}/campaigns/${numericId}/progress`, {
    headers,
    cache: 'no-store',
  })
    .then(async (res) => {
      if (!res.ok) return null
      return (await res.json()) as {
        campaign: Campaign
        accounts: CampaignAccountProgress[]
      }
    })
    .catch(() => null)

  if (!data) {
    notFound()
  }

  const stats = getCampaignProgressStats(data.accounts)
  const statusInfo = getCampaignStatusInfo(data.campaign.status, data.campaign.error_message)
  const latestEvents = getLatestEvents(data.accounts)
  const progressRatio = summarizeProgressRatio(stats.done + stats.errored, stats.total)
  const progressStage = getProgressStage(data.campaign, stats.total, stats.done, stats.errored)
  const approxEta = getApproxEta(data.campaign, stats.total, stats.done, stats.errored)

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{data.campaign.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data.campaign.warmup_days} дней • {data.campaign.daily_actions_min}–{data.campaign.daily_actions_max} действий/день
          </p>
        </div>
        <StatusBadge status={data.campaign.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Общий прогресс" value={progressRatio} />
        <MetricCard label="Этап" value={progressStage} />
        <MetricCard label="ETA" value={approxEta} />
        <MetricCard label="Сводка" value={getCampaignProgressLabel(stats.total, stats.done, stats.errored)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Причина и следующее действие</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="font-medium text-foreground">{getCampaignReasonFromError(statusInfo.reason)}</p>
          <p className="text-muted-foreground">Что сделать: {statusInfo.nextAction}</p>
          <p className="text-muted-foreground">CTA: {getNextActionCta(data.campaign.status, data.campaign.error_message)}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Прогресс аккаунтов</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">
                Аккаунты пока не привязаны к кампании. Вернитесь в список кампаний и назначьте sender-аккаунты перед запуском.
              </div>
            ) : (
              data.accounts.map((account) => (
                <div key={account.account_id} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <div className="text-sm font-medium">Аккаунт #{account.account_id}</div>
                    <div className="mt-1 text-xs text-gray-500">Дней: {account.days_done} • Действий: {account.actions_done}</div>
                    <div className="mt-2 text-xs text-muted-foreground">{getAccountStageLabel(account)}</div>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <div className="mb-1">{account.status}</div>
                    <div>{formatActivityDate(account.last_run_at)}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Последние события</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestEvents.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">
                Последних событий пока нет. Они появятся после первого цикла runner.
              </div>
            ) : (
              latestEvents.map((account) => (
                <div key={`${account.account_id}-${account.last_run_at}`} className="rounded-lg border px-3 py-3 text-sm">
                  <div className="font-medium">Аккаунт #{account.account_id}</div>
                  <div className="mt-1 text-muted-foreground">{getAccountStageLabel(account)}</div>
                  <div className="mt-1 text-xs text-gray-500">{formatActivityDate(account.last_run_at)}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
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
