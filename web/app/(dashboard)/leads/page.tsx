import type {
  LeadsListResponse,
  ParsingJob,
  ParsingJobsListResponse,
  ProjectsResponse,
} from '@/lib/types'
import { serverApiFetchSafe } from '@/lib/server-api'
import { LeadsClient } from './leads-client'

const EMPTY_PARSING_JOBS: ParsingJob[] = []

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const [leadsResult, projectsResult, parsingJobsResult] = await Promise.all([
    serverApiFetchSafe<LeadsListResponse>('/leads'),
    serverApiFetchSafe<ProjectsResponse>('/projects'),
    serverApiFetchSafe<ParsingJobsListResponse>('/parsing?limit=10'),
  ])

  return (
    <LeadsClient
      leads={leadsResult.data?.leads ?? []}
      projects={projectsResult.data?.projects ?? []}
      parsingJobs={parsingJobsResult.data?.jobs ?? EMPTY_PARSING_JOBS}
      initialError={leadsResult.error ?? projectsResult.error ?? parsingJobsResult.error}
    />
  )
}
