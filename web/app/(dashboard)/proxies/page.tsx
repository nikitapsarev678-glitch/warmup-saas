import { Card, CardContent } from '@/components/ui/card'
import { serverApiFetchSafe } from '@/lib/server-api'
import { ProxiesClient } from './proxies-client'
import type { ProxyItem } from './proxies-client'

export const dynamic = 'force-dynamic'

export default async function ProxiesPage() {
  const result = await serverApiFetchSafe<{ proxies: ProxyItem[] }>('/proxies')

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Прокси менеджер</h1>
          <p className="mt-1 text-sm text-gray-500">Не удалось загрузить список прокси из API.</p>
        </div>
        <Card>
          <CardContent className="p-6 text-sm text-gray-600">
            <p className="font-medium text-gray-900">Список прокси временно недоступен.</p>
            <p className="mt-2">{result.error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <ProxiesClient proxies={result.data.proxies} />
}
