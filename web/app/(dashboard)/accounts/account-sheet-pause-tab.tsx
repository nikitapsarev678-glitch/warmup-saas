'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'
import type { TgAccount } from '@/lib/types'

export function PauseTab({ account, onSaved }: { account: TgAccount; onSaved: () => Promise<void> }) {
  const [hours, setHours] = useState(24)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isPaused = Boolean(account.pause_until && new Date(account.pause_until) > new Date())

  const send = async (path: string, body?: object) => {
    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      const response = await apiFetch<{ ok: boolean; message?: string }>(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      })
      if (response.message) {
        setMessage(response.message)
      }
      await onSaved()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось выполнить действие')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={isPaused ? 'rounded-xl bg-orange-50 p-4 text-orange-700' : 'rounded-xl bg-green-50 p-4 text-green-700'}>
        <div className="text-sm font-semibold">{isPaused ? 'Аккаунт на паузе' : 'Аккаунт активен'}</div>
        <div className="mt-1 text-xs opacity-80">
          {isPaused && account.pause_until ? `До ${new Date(account.pause_until).toLocaleString('ru-RU')}` : 'Пауза не установлена'}
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border p-4">
        <div>
          <div className="text-sm font-medium">Проверка SpamBot</div>
          <div className="mt-1 text-xs text-gray-400">{account.spambot_status ?? 'unknown'}</div>
        </div>
        <Button variant="outline" onClick={() => void send(`/accounts/${account.id}/check-spambot`)} disabled={loading}>
          Проверить
        </Button>
      </div>
      {!isPaused ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={168} value={hours} onChange={(event) => setHours(Number(event.target.value))} className="w-24" />
            <span className="text-sm text-gray-400">часов</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 6, 12, 24, 48, 72].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setHours(preset)}
                className={
                  hours === preset
                    ? 'rounded-lg bg-orange-500 px-3 py-1 text-xs text-white'
                    : 'rounded-lg border px-3 py-1 text-xs text-gray-500'
                }
              >
                {preset}ч
              </button>
            ))}
          </div>
          <Button onClick={() => void send(`/accounts/${account.id}/pause`, { hours })} disabled={loading} className="w-full">
            Поставить на паузу
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => void send(`/accounts/${account.id}/unpause`)} disabled={loading} className="w-full">
          Снять паузу
        </Button>
      )}
      {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}
      {message ? <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
    </div>
  )
}
