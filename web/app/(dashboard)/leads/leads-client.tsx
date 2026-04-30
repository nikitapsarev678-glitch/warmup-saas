'use client'

import nextDynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'
import {
  type Lead,
  type LeadImportResult,
  type LeadsListResponse,
  type ParsingJob,
  type ParsingJobResponse,
  type ParsingJobsListResponse,
  type ParsingStartResponse,
  type Project,
  DEFAULT_LEAD_IMPORT,
  DEFAULT_PARSING_FORM,
  buildLeadImportPayload,
  buildParsingLimit,
  buildParsingProjectPayload,
  canPollParsingJob,
  normalizeParsingPayload,
} from '@/lib/types'

const INITIAL_VISIBLE_LEADS = 100
const VISIBLE_LEADS_STEP = 100

const LeadsTableSection = nextDynamic(
  () => import('./leads-table-section').then((mod) => mod.LeadsTableSection),
  {
    loading: () => (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">База лидов</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-400">Загрузка базы лидов...</div>
        </CardContent>
      </Card>
    ),
  }
)

const LeadsParsingSection = nextDynamic(
  () => import('./leads-parsing-section').then((mod) => mod.LeadsParsingSection),
  {
    loading: () => (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI-парсинг аудитории</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-400">Загрузка блока AI-парсинга...</div>
        </CardContent>
      </Card>
    ),
  }
)

type LeadsClientProps = {
  leads: Lead[]
  projects: Project[]
  parsingJobs: ParsingJob[]
  initialError: string | null
}

export function LeadsClient({ leads, projects, parsingJobs, initialError }: LeadsClientProps) {
  const [raw, setRaw] = useState(DEFAULT_LEAD_IMPORT.raw)
  const [projectId, setProjectId] = useState<string>(DEFAULT_LEAD_IMPORT.project_id ? String(DEFAULT_LEAD_IMPORT.project_id) : 'all')
  const [importProjectId, setImportProjectId] = useState<string>('none')
  const [parsingProjectId, setParsingProjectId] = useState<string>(DEFAULT_PARSING_FORM.project_id === null ? 'none' : String(DEFAULT_PARSING_FORM.project_id))
  const [parsingQuery, setParsingQuery] = useState(DEFAULT_PARSING_FORM.query)
  const [parsingGeo, setParsingGeo] = useState(DEFAULT_PARSING_FORM.geo ?? '')
  const [parsingLimit, setParsingLimit] = useState(String(DEFAULT_PARSING_FORM.limit))
  const [classifyWithAi, setClassifyWithAi] = useState(DEFAULT_PARSING_FORM.classify_with_ai)
  const [submitting, setSubmitting] = useState(false)
  const [parsingSubmitting, setParsingSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [result, setResult] = useState<LeadImportResult | null>(null)
  const [leadsState, setLeadsState] = useState<Lead[]>(leads)
  const [parsingJobsState, setParsingJobsState] = useState<ParsingJob[]>(parsingJobs)
  const [activeParsingJob, setActiveParsingJob] = useState<ParsingJob | null>(parsingJobs[0] ?? null)
  const [visibleLeadsCount, setVisibleLeadsCount] = useState(INITIAL_VISIBLE_LEADS)

  const loadLeads = async () => {
    const response = await apiFetch<LeadsListResponse>('/leads')
    setLeadsState(response.leads)
  }

  const loadParsingJobs = async () => {
    const response = await apiFetch<ParsingJobsListResponse>('/parsing?limit=10')
    setParsingJobsState(response.jobs)
    setActiveParsingJob((current) => {
      if (!current) {
        return response.jobs[0] ?? null
      }
      return response.jobs.find((job) => job.id === current.id) ?? current
    })
  }

  const filteredLeads = useMemo(() => {
    if (projectId === 'all') return leadsState
    if (projectId === 'none') return leadsState.filter((lead) => lead.project_id === null)
    return leadsState.filter((lead) => lead.project_id === Number(projectId))
  }, [leadsState, projectId])

  const activeCount = leadsState.filter((lead) => lead.status === 'active').length
  const repliedCount = leadsState.filter((lead) => lead.status === 'replied').length
  const blockedCount = leadsState.filter((lead) => lead.status === 'blocked').length
  const effectiveVisibleLeadsCount = Math.min(visibleLeadsCount, filteredLeads.length)
  const visibleLeads = useMemo(
    () => filteredLeads.slice(0, effectiveVisibleLeadsCount),
    [filteredLeads, effectiveVisibleLeadsCount]
  )
  const hasMoreLeads = filteredLeads.length > effectiveVisibleLeadsCount

  useEffect(() => {
    const job = activeParsingJob
    if (!job || !canPollParsingJob(job)) return

    let cancelled = false
    const jobId = job.id

    const poll = async () => {
      try {
        const response = await apiFetch<ParsingJobResponse>(`/parsing/${jobId}`)
        if (cancelled) {
          return
        }
        setActiveParsingJob(response.job)
        setParsingJobsState((current) => {
          const next = current.filter((item) => item.id !== response.job.id)
          return [response.job, ...next]
        })
        if (!canPollParsingJob(response.job)) {
          await Promise.all([loadLeads(), loadParsingJobs()])
          return
        }
        window.setTimeout(() => {
          void poll()
        }, 4000)
      } catch {
        if (!cancelled) {
          window.setTimeout(() => {
            void poll()
          }, 4000)
        }
      }
    }

    void poll()

    return () => {
      cancelled = true
    }
  }, [activeParsingJob])

  const handleImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!raw.trim()) return

    setSubmitting(true)
    setError(null)
    setResult(null)

    try {
      const payload = buildLeadImportPayload(importProjectId === 'none' ? null : Number(importProjectId), raw)
      const response = await apiFetch<LeadImportResult>('/leads/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setResult(response)
      setRaw('')
      await loadLeads()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось импортировать лиды')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartParsing = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!parsingQuery.trim()) return

    setParsingSubmitting(true)
    setError(null)
    setResult(null)

    try {
      const payload = normalizeParsingPayload({
        project_id: buildParsingProjectPayload(parsingProjectId),
        query: parsingQuery,
        geo: parsingGeo,
        limit: buildParsingLimit(parsingLimit),
        classify_with_ai: classifyWithAi,
      })

      const response = await apiFetch<ParsingStartResponse>('/parsing/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      if (response.job) {
        setActiveParsingJob(response.job)
        setParsingJobsState((current) => [response.job!, ...current.filter((job) => job.id !== response.job!.id)])
      }
      setParsingQuery('')
      setParsingGeo('')
      setParsingLimit(String(DEFAULT_PARSING_FORM.limit))
      setClassifyWithAi(false)
      await loadParsingJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить AI-парсинг')
    } finally {
      setParsingSubmitting(false)
    }
  }

  const handleProjectFilterChange = (value: string) => {
    setProjectId(value)
    setVisibleLeadsCount(INITIAL_VISIBLE_LEADS)
  }

  const showMoreLeads = () => {
    setVisibleLeadsCount((current) => current + VISIBLE_LEADS_STEP)
  }

  const showAllLeads = () => {
    setVisibleLeadsCount(filteredLeads.length)
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Лиды</h1>
          <p className="mt-1 text-sm text-gray-500">Импортируйте usernames или numeric Telegram IDs для outreach-рассылок.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm sm:min-w-[320px]">
          <MetricCard label="Всего" value={String(leadsState.length)} />
          <MetricCard label="Активные" value={String(activeCount)} />
          <MetricCard label="Ответили / блок" value={`${repliedCount}/${blockedCount}`} />
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}
      {result ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Импорт завершён: добавлено {result.imported}, пропущено {result.skipped}, обработано {result.total}.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Импорт лидов</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleImport}>
              <div className="grid gap-3 sm:grid-cols-[220px,1fr]">
                <label className="space-y-2 text-sm text-gray-600">
                  <span>Проект</span>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
                    value={importProjectId}
                    onChange={(event) => setImportProjectId(event.target.value)}
                  >
                    <option value="none">Без проекта</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-gray-600">
                  <span>Формат</span>
                  <Input value="@username или 123456789, optional title" readOnly />
                </label>
              </div>

              <label className="block space-y-2 text-sm text-gray-600">
                <span>Список лидов</span>
                <textarea
                  className="min-h-48 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
                  placeholder={'@lead_one\n123456789\n@lead_two, CEO'}
                  value={raw}
                  onChange={(event) => setRaw(event.target.value)}
                />
              </label>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={submitting || !raw.trim()}>
                  {submitting ? 'Импортирую...' : 'Импортировать лидов'}
                </Button>
                <div className="text-xs text-gray-400">Дубли по username / telegram_id будут пропущены автоматически.</div>
              </div>
            </form>
          </CardContent>
        </Card>

        <LeadsParsingSection
          projects={projects}
          parsingProjectId={parsingProjectId}
          parsingQuery={parsingQuery}
          parsingGeo={parsingGeo}
          parsingLimit={parsingLimit}
          classifyWithAi={classifyWithAi}
          parsingSubmitting={parsingSubmitting}
          activeParsingJob={activeParsingJob}
          parsingJobsState={parsingJobsState}
          onParsingProjectChange={setParsingProjectId}
          onParsingQueryChange={setParsingQuery}
          onParsingGeoChange={setParsingGeo}
          onParsingLimitChange={setParsingLimit}
          onClassifyWithAiChange={setClassifyWithAi}
          onSubmit={handleStartParsing}
          onSelectJob={setActiveParsingJob}
        />
      </div>

      <LeadsTableSection
        filteredLeads={filteredLeads}
        visibleLeads={visibleLeads}
        hasMoreLeads={hasMoreLeads}
        visibleLeadsStep={VISIBLE_LEADS_STEP}
        projects={projects}
        projectId={projectId}
        onProjectIdChange={handleProjectFilterChange}
        onShowMore={showMoreLeads}
        onShowAll={showAllLeads}
      />
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}
