'use client'

type AccountLog = {
  id: number
  action_type: string
  target: string | null
  status: 'ok' | 'error' | 'skipped'
  error_text: string | null
  executed_at: string
}

export function LogsTab({ logs, loading }: { logs: AccountLog[]; loading: boolean }) {
  if (loading) {
    return <div className="py-10 text-center text-sm text-gray-400">Загрузка...</div>
  }

  if (logs.length === 0) {
    return <div className="rounded-xl bg-gray-50 py-10 text-center text-sm text-gray-400">Нет логов</div>
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className={log.status === 'error' ? 'rounded-lg bg-red-50 p-3 text-sm' : 'rounded-lg bg-gray-50 p-3 text-sm'}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium text-gray-800">{log.action_type.replace(/_/g, ' ')}</div>
              {log.target ? <div className="text-xs text-gray-400">{log.target}</div> : null}
              {log.error_text ? <div className="mt-1 text-xs text-red-600">{log.error_text}</div> : null}
            </div>
            <div className="shrink-0 text-xs text-gray-400">
              {new Date(log.executed_at).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
