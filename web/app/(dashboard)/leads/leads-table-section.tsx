'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { type Lead, type Project, LEAD_STATUS_LABELS, formatLeadTarget, getLeadProjectLabel } from '@/lib/types'

export function LeadsTableSection({
  filteredLeads,
  visibleLeads,
  hasMoreLeads,
  visibleLeadsStep,
  projects,
  projectId,
  onProjectIdChange,
  onShowMore,
  onShowAll,
}: {
  filteredLeads: Lead[]
  visibleLeads: Lead[]
  hasMoreLeads: boolean
  visibleLeadsStep: number
  projects: Project[]
  projectId: string
  onProjectIdChange: (value: string) => void
  onShowMore: () => void
  onShowAll: () => void
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle className="text-base">База лидов</CardTitle>
          <div className="mt-1 text-sm text-gray-500">Отфильтруйте список и проверьте, кому пойдёт рассылка.</div>
        </div>
        <label className="space-y-1 text-sm text-gray-600">
          <span>Фильтр по проекту</span>
          <select
            className="flex h-10 min-w-[220px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
            value={projectId}
            onChange={(event) => onProjectIdChange(event.target.value)}
          >
            <option value="all">Все проекты</option>
            <option value="none">Без проекта</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </CardHeader>
      <CardContent>
        {filteredLeads.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">
            Лидов пока нет. Импортируйте первый список выше.
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Лид</TableHead>
                  <TableHead>Проект</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Источник</TableHead>
                  <TableHead>Создан</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLeads.map((lead) => {
                  const status = LEAD_STATUS_LABELS[lead.status]
                  return (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="font-medium">{formatLeadTarget(lead)}</div>
                        {lead.title ? <div className="text-xs text-gray-400">{lead.title}</div> : null}
                      </TableCell>
                      <TableCell>{getLeadProjectLabel(lead.project_id, projects)}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>{lead.source || 'manual'}</TableCell>
                      <TableCell>{new Date(lead.created_at).toLocaleString('ru-RU')}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {hasMoreLeads ? (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-gray-500">
                  Показано {visibleLeads.length} из {filteredLeads.length} лидов.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={onShowMore}>
                    Показать ещё {Math.min(visibleLeadsStep, filteredLeads.length - visibleLeads.length)}
                  </Button>
                  <Button type="button" variant="outline" onClick={onShowAll}>
                    Показать все
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
