'use client'

const ACTION_ICONS: Record<string, string> = {
  join_group: '👥',
  read_messages: '📖',
  reaction: '❤️',
  dialog_sent: '💬',
  dialog_received: '📨',
  story_view: '👁',
  profile_updated: '✏️',
}

type ActionTypePoint = {
  action_type: string
  total: number | string
  success: number | string
}

export function ActionTypeBreakdown({ data }: { data: ActionTypePoint[] }) {
  if (data.length === 0) {
    return <div className="py-4 text-center text-sm text-gray-400">Нет данных</div>
  }

  const formatted = data.map((item) => ({
    ...item,
    total: Number(item.total),
    success: Number(item.success),
  }))
  const max = Math.max(...formatted.map((item) => item.total), 1)

  return (
    <div className="space-y-3">
      {formatted.map((item) => {
        const pct = item.total === 0 ? 0 : Math.round((item.success / item.total) * 100)

        return (
          <div key={item.action_type}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <span>{ACTION_ICONS[item.action_type] ?? '⚡'}</span>
                <span className="text-gray-700">{item.action_type.replaceAll('_', ' ')}</span>
              </span>
              <span className="tabular-nums text-gray-400">
                {item.total} ({pct}%)
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-blue-400"
                style={{ width: `${(item.total / max) * 100}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
