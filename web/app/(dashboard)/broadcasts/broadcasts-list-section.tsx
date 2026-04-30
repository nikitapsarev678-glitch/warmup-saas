'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type Broadcast,
  type Project,
  BROADCAST_STATUS_LABELS,
  BROADCAST_TARGET_LABELS,
  canStartBroadcast,
  canStopBroadcast,
  getBroadcastFollowupPreview,
  getBroadcastMessagesCount,
  getLeadProjectLabel,
} from '@/lib/types'

export function BroadcastsListSection({
  items,
  projects,
  activeId,
  submitting,
  onSelect,
  onEdit,
  onStart,
  onStop,
}: {
  items: Broadcast[]
  projects: Project[]
  activeId: number | null
  submitting: boolean
  onSelect: (broadcastId: number) => void
  onEdit: (broadcast: Broadcast) => void
  onStart: (broadcastId: number) => void
  onStop: (broadcastId: number) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Список рассылок</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">
            Пока нет рассылок. Соберите первую слева.
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map((broadcast) => {
              const status = BROADCAST_STATUS_LABELS[broadcast.status]
              return (
                <div
                  key={broadcast.id}
                  className={`rounded-xl border p-4 transition-colors ${activeId === broadcast.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <button type="button" onClick={() => onSelect(broadcast.id)} className="min-w-0 flex-1 text-left">
                      <div className="font-semibold">{broadcast.name}</div>
                      <div className="mt-1 text-sm text-gray-500">
                        {BROADCAST_TARGET_LABELS[broadcast.target_mode]} • {getLeadProjectLabel(broadcast.project_id, projects)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                        <span>{getBroadcastMessagesCount(broadcast)} вариантов</span>
                        <span>{broadcast.account_ids?.length ?? 0} sender</span>
                        <span>follow-up: {getBroadcastFollowupPreview(broadcast)}</span>
                      </div>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <Button type="button" variant="outline" size="sm" onClick={() => onEdit(broadcast)}>
                        Edit
                      </Button>
                      {canStartBroadcast(broadcast) ? (
                        <Button type="button" size="sm" onClick={() => onStart(broadcast.id)} disabled={submitting}>
                          Start
                        </Button>
                      ) : null}
                      {canStopBroadcast(broadcast) ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => onStop(broadcast.id)} disabled={submitting}>
                          Stop
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
