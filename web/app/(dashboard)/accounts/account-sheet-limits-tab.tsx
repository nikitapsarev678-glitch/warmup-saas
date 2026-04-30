'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'
import type { TgAccount } from '@/lib/types'

export function LimitsTab({ account, onSaved }: { account: TgAccount; onSaved: () => Promise<void> }) {
  const [daily, setDaily] = useState(account.daily_limit)
  const [hourly, setHourly] = useState(account.hourly_limit)
  const [group, setGroup] = useState(account.group_limit)
  const [dm, setDm] = useState(account.dm_limit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/accounts/${account.id}/limits`, {
        method: 'PATCH',
        body: JSON.stringify({
          daily_limit: daily,
          hourly_limit: hourly,
          group_limit: group,
          dm_limit: dm,
        }),
      })
      await onSaved()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить лимиты')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <LimitField label="Дневной лимит рассылки" description="0 = без лимита" value={daily} onChange={setDaily} presets={[0, 50, 100, 200, 500]} unit="сообщ/день" />
      <LimitField label="Лимит в час" description="Защита от спам-блока" value={hourly} onChange={setHourly} presets={[10, 20, 30, 50, 100]} unit="сообщ/час" />
      <LimitField label="Лимит на группу" description="Максимум сообщений в одну группу" value={group} onChange={setGroup} presets={[1, 3, 5, 10, 20]} unit="сообщ/группу" />
      <LimitField label="Лимит ЛС" description="Дневной лимит личных сообщений" value={dm} onChange={setDm} presets={[0, 10, 20, 50, 100]} unit="сообщ/день" />
      {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}
      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? 'Сохранение...' : 'Сохранить лимиты'}
      </Button>
    </div>
  )
}

function LimitField({
  label,
  description,
  value,
  onChange,
  presets,
  unit,
}: {
  label: string
  description: string
  value: number
  onChange: (value: number) => void
  presets: number[]
  unit: string
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-400">{description}</div>
      </div>
      <div className="flex items-center gap-2">
        <Input type="number" min={0} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-28" />
        <span className="text-xs text-gray-400">{unit}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={
              value === preset
                ? 'rounded-lg bg-primary px-3 py-1 text-xs text-primary-foreground'
                : 'rounded-lg border px-3 py-1 text-xs text-gray-500'
            }
          >
            {preset === 0 ? '∞' : preset}
          </button>
        ))}
      </div>
    </div>
  )
}
