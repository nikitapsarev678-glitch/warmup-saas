import { Card, CardContent } from '@/components/ui/card'
import { serverApiFetchSafe } from '@/lib/server-api'
import type { Project } from '@/lib/types'
import { ProjectsClient } from './projects-client'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const result = await serverApiFetchSafe<{ projects: Project[] }>('/projects')

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Проекты</h1>
          <p className="mt-1 text-sm text-gray-500">Не удалось загрузить проекты из API.</p>
        </div>
        <Card>
          <CardContent className="p-6 text-sm text-gray-600">
            <p className="font-medium text-gray-900">Список проектов временно недоступен.</p>
            <p className="mt-2">{result.error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <ProjectsClient projects={result.data.projects} />
}
