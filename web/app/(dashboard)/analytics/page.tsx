import nextDynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { serverApiFetchSafe } from '@/lib/server-api'

const ActionsChart = nextDynamic(() => import('./actions-chart').then((mod) => mod.ActionsChart), {
  loading: () => <div className="flex h-48 items-center justify-center text-sm text-gray-400">Загрузка графика...</div>,
})

const ActionTypeBreakdown = nextDynamic(
  () => import('./action-type-breakdown').then((mod) => mod.ActionTypeBreakdown),
  {
    loading: () => <div className="py-4 text-center text-sm text-gray-400">Загрузка разбивки...</div>,
  }
)

export const dynamic = 'force-dynamic'

type ActionsByDayPoint = {
  date: string
  total: number | string
  success: number | string
  errors: number | string
}

type ActionTypePoint = {
  action_type: string
  total: number | string
  success: number | string
}

type RecentAction = {
  id: number
  action_type: string
  status: string
  username: string | null
  executed_at: string
}

async function getAnalyticsData() {
  const [daysResult, typesResult, actionsResult] = await Promise.all([
    serverApiFetchSafe<{ days: ActionsByDayPoint[] }>('/analytics/actions-by-day'),
    serverApiFetchSafe<{ types: ActionTypePoint[] }>('/analytics/actions-by-type'),
    serverApiFetchSafe<{ actions: RecentAction[] }>('/analytics/recent-actions'),
  ])

  return {
    days: daysResult.data?.days ?? [],
    types: typesResult.data?.types ?? [],
    actions: actionsResult.data?.actions ?? [],
    error: daysResult.error ?? typesResult.error ?? actionsResult.error,
  }
}

export default async function AnalyticsPage() {
  const { days, types, actions, error } = await getAnalyticsData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Аналитика</h1>
        <p className="mt-1 text-sm text-gray-500">Проверяйте динамику действий и последние события по аккаунтам.</p>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-gray-600">
            <p className="font-medium text-gray-900">Часть аналитики сейчас недоступна.</p>
            <p className="mt-2">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
            {actions.length === 0 ? (
              <div className="py-4 text-center text-sm text-gray-400">Нет данных</div>
            ) : (
              actions.slice(0, 15).map((action) => (
                <div key={action.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${action.status === 'ok' ? 'bg-green-400' : 'bg-red-400'}`}
                    />
                    <span className="text-gray-600">{action.action_type.replaceAll('_', ' ')}</span>
                    {action.username ? <span className="text-gray-400">@{action.username}</span> : null}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(action.executed_at).toLocaleString('ru-RU', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
