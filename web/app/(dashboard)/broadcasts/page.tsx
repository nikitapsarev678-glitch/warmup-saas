import type {
  AccountsResponse,
  BroadcastListResponse,
  BroadcastLogsResponse,
  BroadcastProgressResponse,
  LeadsListResponse,
  ProjectsResponse,
} from '@/lib/types'
import { serverApiFetchSafe } from '@/lib/server-api'
import { BroadcastsClient } from './broadcasts-client'

export const dynamic = 'force-dynamic'

export default async function BroadcastsPage() {
  const [broadcastsResult, projectsResult, accountsResult, leadsResult] = await Promise.all([
    serverApiFetchSafe<BroadcastListResponse>('/broadcasts'),
    serverApiFetchSafe<ProjectsResponse>('/projects'),
    serverApiFetchSafe<AccountsResponse>('/accounts'),
    serverApiFetchSafe<LeadsListResponse>('/leads'),
  ])

  const broadcasts = broadcastsResult.data?.broadcasts ?? []
  const projects = projectsResult.data?.projects ?? []
  const accounts = accountsResult.data?.accounts ?? []
  const leads = leadsResult.data?.leads ?? []

  const initialActiveId = broadcasts[0]?.id ?? null
  const [initialProgressResult, initialLogsResult] = initialActiveId
    ? await Promise.all([
        serverApiFetchSafe<BroadcastProgressResponse>(`/broadcasts/${initialActiveId}/progress`),
        serverApiFetchSafe<BroadcastLogsResponse>(`/broadcasts/${initialActiveId}/logs`),
      ])
    : [{ data: null, error: null, ok: true as const }, { data: null, error: null, ok: true as const }]

  const initialError = broadcastsResult.error ?? projectsResult.error ?? accountsResult.error ?? leadsResult.error

  return (
    <BroadcastsClient
      broadcasts={broadcasts}
      projects={projects}
      accounts={accounts}
      leads={leads}
      initialActiveId={initialActiveId}
      initialProgress={initialProgressResult.data}
      initialLogs={initialLogsResult.data?.logs ?? []}
      initialError={initialError}
    />
  )
}
