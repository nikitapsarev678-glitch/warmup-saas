'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'
import type { TgAccount } from '@/lib/types'

export function ProfileTab({ account, onSaved }: { account: TgAccount; onSaved: () => Promise<void> }) {
  const [firstName, setFirstName] = useState(account.first_name ?? '')
  const [bio, setBio] = useState(account.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await apiFetch(`/accounts/${account.id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({ first_name: firstName, bio }),
      })
      await onSaved()
      setSuccess('Профиль сохранён')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить профиль')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4">
        <div className="text-sm font-medium">Данные аккаунта</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Username" value={account.username ? `@${account.username}` : '—'} />
          <Field label="Telegram ID" value={account.tg_id ? String(account.tg_id) : '—'} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Имя профиля</div>
        <Input maxLength={64} placeholder="Например, Alex" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Bio</div>
        <textarea
          className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
          maxLength={300}
          placeholder="Короткое описание аккаунта"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
        />
        <div className="text-right text-xs text-gray-400">{bio.length}/300</div>
      </div>

      <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
        Фото профиля в этой фазе не загружается: сохраняются только безопасные текстовые поля аккаунта.
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}
      {success ? <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div> : null}

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? 'Сохранение...' : 'Сохранить профиль'}
      </Button>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-gray-800">{value}</div>
    </div>
  )
}
