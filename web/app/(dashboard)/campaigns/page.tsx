import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { serverApiFetchSafe } from '@/lib/server-api'
import type { Campaign } from '@/lib/types'
import { getCampaignsHeaderDescription } from '@/lib/types'

export default async function CampaignsPage() {
  const result = await serverApiFetchSafe<{ campaigns: Campaign[] }>('/campaigns')
  const campaigns = result.data?.campaigns ?? []

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Кампании прогрева</h1>
          <p className="mt-1 text-sm text-gray-500">{getCampaignsHeaderDescription(campaigns.length)}</p>
        </div>
        <Link href="/campaigns/new">
          <Button>+ Новая кампания</Button>
        </Link>
      </div>

      <div className="grid gap-3">
        {result.error ? (
          <Card>
            <CardContent className="flex flex-col gap-3 p-6 text-sm text-gray-600">
              <p className="font-medium text-gray-900">Не удалось загрузить кампании.</p>
              <p>{result.error}</p>
              <p>Проверьте API, токены и runner, затем обновите страницу.</p>
            </CardContent>
          </Card>
        ) : campaigns.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-gray-500">
              Нет кампаний. Создайте первую кампанию прогрева.
            </CardContent>
          </Card>
        ) : (
          campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{campaign.name}</div>
                  <div className="mt-1 text-sm text-gray-500">
                    {campaign.warmup_days} дней • {campaign.daily_actions_min}–{campaign.daily_actions_max} действий/день
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <CampaignStatusBadge status={campaign.status} />
                  <Link href={`/campaigns/${campaign.id}/progress`}>
                    <Button variant="outline" size="sm">
                      Прогресс
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

function CampaignStatusBadge({ status }: { status: Campaign['status'] }) {
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
