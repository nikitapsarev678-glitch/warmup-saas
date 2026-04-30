'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  type ParsingJob,
  type Project,
  PARSING_STATUS_LABELS,
  buildParsingSummaryLabel,
  formatParsingActivityDate,
} from '@/lib/types'

export function LeadsParsingSection({
  projects,
  parsingProjectId,
  parsingQuery,
  parsingGeo,
  parsingLimit,
  classifyWithAi,
  parsingSubmitting,
  activeParsingJob,
  parsingJobsState,
  onParsingProjectChange,
  onParsingQueryChange,
  onParsingGeoChange,
  onParsingLimitChange,
  onClassifyWithAiChange,
  onSubmit,
  onSelectJob,
}: {
  projects: Project[]
  parsingProjectId: string
  parsingQuery: string
  parsingGeo: string
  parsingLimit: string
  classifyWithAi: boolean
  parsingSubmitting: boolean
  activeParsingJob: ParsingJob | null
  parsingJobsState: ParsingJob[]
  onParsingProjectChange: (value: string) => void
  onParsingQueryChange: (value: string) => void
  onParsingGeoChange: (value: string) => void
  onParsingLimitChange: (value: string) => void
  onClassifyWithAiChange: (value: boolean) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onSelectJob: (job: ParsingJob) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI-парсинг аудитории</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-gray-600">
              <span>Проект</span>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
                value={parsingProjectId}
                onChange={(event) => onParsingProjectChange(event.target.value)}
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
              <span>Лимит лидов</span>
              <Input value={parsingLimit} onChange={(event) => onParsingLimitChange(event.target.value)} inputMode="numeric" />
            </label>
          </div>

          <label className="block space-y-2 text-sm text-gray-600">
            <span>Запрос</span>
            <textarea
              className="min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
              placeholder={'marketing moscow\n@public_group\nai founders'}
              value={parsingQuery}
              onChange={(event) => onParsingQueryChange(event.target.value)}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-[1fr,220px]">
            <label className="space-y-2 text-sm text-gray-600">
              <span>Гео</span>
              <Input value={parsingGeo} onChange={(event) => onParsingGeoChange(event.target.value)} placeholder="Например, Moscow" />
            </label>
            <label className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm text-gray-600">
              <input type="checkbox" checked={classifyWithAi} onChange={(event) => onClassifyWithAiChange(event.target.checked)} />
              <span>AI-классификация ниш</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={parsingSubmitting || !parsingQuery.trim()}>
              {parsingSubmitting ? 'Запускаю...' : 'Запустить AI-парсинг'}
            </Button>
            <div className="text-xs text-gray-400">Токены списываются по факту добавленных лидов.</div>
          </div>
        </form>

        {activeParsingJob ? (
          <div className="rounded-lg border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">Текущий parsing job #{activeParsingJob.id}</div>
                  <Badge variant={PARSING_STATUS_LABELS[activeParsingJob.status].variant}>{PARSING_STATUS_LABELS[activeParsingJob.status].label}</Badge>
                </div>
                <div className="mt-1 text-sm text-gray-500">{activeParsingJob.query}</div>
              </div>
              <div className="text-right text-xs text-gray-400">
                <div>Старт: {formatParsingActivityDate(activeParsingJob.started_at)}</div>
                <div>Обновлено: {formatParsingActivityDate(activeParsingJob.updated_at)}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <MetricCard label="Групп" value={`${activeParsingJob.progress.groups_processed}/${activeParsingJob.progress.groups_found}`} />
              <MetricCard label="Админы / участники" value={`${activeParsingJob.progress.admins_found}/${activeParsingJob.progress.participants_found}`} />
              <MetricCard label="Результат" value={buildParsingSummaryLabel(activeParsingJob.progress)} />
            </div>

            {activeParsingJob.error ? <div className="mt-3 text-sm text-red-600">{activeParsingJob.error}</div> : null}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">
            Parsing jobs ещё не запускались. Создайте первый запрос, чтобы наполнить базу лидов автоматически.
          </div>
        )}

        {parsingJobsState.length > 1 ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Последние jobs</div>
            <div className="space-y-2">
              {parsingJobsState.slice(0, 5).map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => onSelectJob(job)}
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">#{job.id} · {job.query}</div>
                    <div className="text-xs text-gray-400">{buildParsingSummaryLabel(job.progress)}</div>
                  </div>
                  <Badge variant={PARSING_STATUS_LABELS[job.status].variant}>{PARSING_STATUS_LABELS[job.status].label}</Badge>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
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
