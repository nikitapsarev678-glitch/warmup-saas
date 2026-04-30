'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'
import type { TgAccount } from '@/lib/types'

export function AutoWarmupTab({ account, onSaved }: { account: TgAccount; onSaved: () => Promise<void> }) {
  const parsedConfig = useMemo(() => {
    if (!account.auto_warmup_config) return null
    try {
      return JSON.parse(account.auto_warmup_config) as {
        days?: number
        dialogs_per_day?: number
        pause_preset?: number
        started_at?: string
      }
    } catch {
      return null
    }
  }, [account.auto_warmup_config])

  const [enabled, setEnabled] = useState(Boolean(account.auto_warmup_enabled))
  const [days, setDays] = useState(parsedConfig?.days ?? 14)
  const [dialogsPerDay, setDialogsPerDay] = useState(parsedConfig?.dialogs_per_day ?? 8)
  const [pausePreset, setPausePreset] = useState(parsedConfig?.pause_preset ?? 24)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startedAt] = useState(parsedConfig?.started_at ?? null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/accounts/${account.id}/auto-warmup`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled,
          config: {
            days,
            dialogs_per_day: dialogsPerDay,
            pause_preset: pausePreset,
            ...(enabled ? { started_at: startedAt ?? new Date().toISOString() } : {}),
          },
        }),
      })
      await onSaved()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить автопрогрев')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border p-4">
        <div>
          <div className="text-sm font-medium">Автопрогрев</div>
          <div className="mt-1 text-xs text-gray-400">Фоновое поддержание активности аккаунта</div>
        </div>
        <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'Включён' : 'Выключен'}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input type="number" min={1} value={days} onChange={(event) => setDays(Number(event.target.value))} placeholder="Дней" />
        <Input type="number" min={0} value={dialogsPerDay} onChange={(event) => setDialogsPerDay(Number(event.target.value))} placeholder="Диалогов" />
        <Input type="number" min={1} value={pausePreset} onChange={(event) => setPausePreset(Number(event.target.value))} placeholder="Пауза, ч" />
      </div>
      {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}
      <div className="flex gap-2">
        <Button variant={enabled ? 'outline' : 'default'} onClick={() => setEnabled(false)} className="flex-1">
          Выключить
        </Button>
        <Button variant={enabled ? 'default' : 'outline'} onClick={() => setEnabled(true)} className="flex-1">
          Включить
        </Button>
      </div>
      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? 'Сохранение...' : 'Сохранить настройки'}
      </Button>
    </div>
  )
}
