import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { serverApiFetchSafe } from '@/lib/server-api'
import type { Project, TgAccount } from '@/lib/types'
import { getEmptyStateActionLabel } from '@/lib/types'
import { AccountsList } from './accounts-list'

export const dynamic = 'force-dynamic'

export default async function AccountsPage() {
  const [accountsResult, projectsResult] = await Promise.all([
    serverApiFetchSafe<{ accounts: TgAccount[] }>('/accounts'),
    serverApiFetchSafe<{ projects: Project[] }>('/projects'),
  ])

  const accounts = accountsResult.data?.accounts ?? []
  const projects = projectsResult.data?.projects ?? []
  const loadError = accountsResult.error ?? projectsResult.error

  return (
    <div className="max-w-6xl">
      {loadError ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6 text-sm text-gray-600">
            <p className="font-medium text-gray-900">Не удалось полностью загрузить аккаунты.</p>
            <p>{loadError}</p>
            <p>Проверьте авторизацию и доступность API, затем обновите страницу.</p>
            <div>
              <Button variant="outline" onClick={() => {}} disabled>
                {getEmptyStateActionLabel('accounts')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <AccountsList accounts={accounts} projects={projects} />
      )}
    </div>
  )
}
