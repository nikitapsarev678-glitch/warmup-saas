'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  type Broadcast,
  type BroadcastLog,
  type BroadcastProgressResponse,
  BROADCAST_LOG_STATUS_LABELS,
  BROADCAST_STATUS_LABELS,
  FOLLOWUP_STEP_LABELS,
  formatBroadcastActivityDate,
  formatBroadcastRatio,
  getBroadcastFollowupEta,
  getBroadcastHealthSummary,
  getBroadcastLogTarget,
  getBroadcastStatusInfo,
} from '@/lib/types'

export function BroadcastDetailsPanel({
  activeBroadcast,
  activeProgress,
  activeLogs,
  loadingDetails,
}: {
  activeBroadcast: Broadcast | null
  activeProgress: BroadcastProgressResponse | undefined
  activeLogs: BroadcastLog[]
  loadingDetails: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Прогресс и логи</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!activeBroadcast ? (
          <div className="workspace-section px-4 py-5 text-sm text-muted-foreground">Выберите рассылку, чтобы увидеть прогресс.</div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <MetricCard label="Статус" value={BROADCAST_STATUS_LABELS[activeBroadcast.status].label} />
              <MetricCard
                label="Отправлено"
                value={activeProgress ? getProgressValue(activeProgress.summary.sent, activeProgress.summary.leads_total) : '—'}
              />
              <MetricCard label="Ошибки" value={activeProgress ? String(activeProgress.summary.failed) : '—'} />
              <MetricCard label="Последняя активность" value={formatBroadcastActivityDate(activeBroadcast.completed_at ?? activeBroadcast.started_at)} />
            </div>

            <div className="workspace-section px-3 py-3 text-sm">
              <div className="font-medium">{getBroadcastStatusInfo(activeBroadcast).reason}</div>
              <div className="mt-1 text-muted-foreground">Что сделать: {getBroadcastStatusInfo(activeBroadcast).nextAction}</div>
              {activeProgress ? <div className="mt-1 text-muted-foreground">Сводка: {getBroadcastHealthSummary(activeProgress.summary)}</div> : null}
            </div>

            {activeBroadcast.error ? (
              <div className="rounded-[1rem] border border-amber-200/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
                {activeBroadcast.error}
              </div>
            ) : null}

            <div className="workspace-section p-3">
              <div className="flex items-center justify-between gap-3 text-sm font-medium">
                <span>Follow-up queue</span>
                {activeProgress ? (
                  <span className="text-xs text-muted-foreground">
                    {getBroadcastFollowupEta(activeProgress.summary.followups_pending)} • cancelled {activeProgress.summary.followups_cancelled}
                  </span>
                ) : null}
              </div>
              {loadingDetails && !activeProgress ? (
                <div className="mt-2 text-sm text-muted-foreground">Загружаю...</div>
              ) : activeProgress?.followups.length ? (
                <div className="mt-2 grid gap-2">
                  {activeProgress.followups.map((item, index) => (
                    <div key={`${item.step}-${item.due_at}-${index}`} className="workspace-section flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div>{FOLLOWUP_STEP_LABELS[item.step] ?? `Step ${item.step}`}</div>
                      <div className="text-muted-foreground">{item.status}</div>
                      <div className="text-muted-foreground">due {formatBroadcastActivityDate(item.due_at)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">Follow-up задач пока нет.</div>
              )}
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Лид</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Ошибка</TableHead>
                    <TableHead>Время</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-gray-500">
                        Логов пока нет.
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{getBroadcastLogTarget(log)}</TableCell>
                        <TableCell>{log.step === 0 ? 'Initial' : FOLLOWUP_STEP_LABELS[log.step] ?? `Step ${log.step}`}</TableCell>
                        <TableCell>{BROADCAST_LOG_STATUS_LABELS[log.status]}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{log.error || '—'}</TableCell>
                        <TableCell>{formatBroadcastActivityDate(log.sent_at ?? log.created_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="workspace-section px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

function getProgressValue(sent: number, total: number) {
  return `${sent}/${total} • ${formatBroadcastRatio(sent, total)}`
}
