'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'
import type { TgAccount } from '@/lib/types'

export function ProxyTab({ account, onSaved }: { account: TgAccount; onSaved: () => Promise<void> }) {
  const parsed = useMemo(() => parseProxy(account.proxy), [account.proxy])
  const [type, setType] = useState(parsed?.type ?? 'socks5')
  const [host, setHost] = useState(parsed?.host ?? '')
  const [port, setPort] = useState(String(parsed?.port ?? 1080))
  const [user, setUser] = useState(parsed?.user ?? '')
  const [pass, setPass] = useState(parsed?.pass ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (proxy: string | null) => {
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/accounts/${account.id}/proxy`, {
        method: 'PATCH',
        body: JSON.stringify({ proxy }),
      })
      await onSaved()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить прокси')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-purple-50 p-4 text-sm text-purple-700">
        Прокси привязывается к аккаунту и используется runner без показа секретов обратно в API.
      </div>
      <div className="flex gap-2">
        {['socks5', 'http'].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setType(value)}
            className={
              type === value
                ? 'rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground'
                : 'rounded-lg border px-4 py-2 text-sm text-gray-500'
            }
          >
            {value.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input className="col-span-2" placeholder="proxy.example.com" value={host} onChange={(event) => setHost(event.target.value)} />
        <Input type="number" value={port} onChange={(event) => setPort(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Логин" value={user} onChange={(event) => setUser(event.target.value)} />
        <Input type="password" placeholder="Пароль" value={pass} onChange={(event) => setPass(event.target.value)} />
      </div>
      {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}
      <div className="flex gap-2">
        <Button
          onClick={() =>
            void save(
              host
                ? JSON.stringify({
                    type,
                    host,
                    port: Number(port),
                    user: user || undefined,
                    pass: pass || undefined,
                  })
                : null
            )
          }
          disabled={saving}
          className="flex-1"
        >
          {saving ? 'Сохранение...' : 'Сохранить прокси'}
        </Button>
        {account.proxy ? (
          <Button variant="outline" onClick={() => void save(null)} disabled={saving}>
            Удалить
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function parseProxy(proxy: string | null) {
  if (!proxy) return null

  try {
    return JSON.parse(proxy) as {
      type?: string
      host?: string
      port?: number
      user?: string
      pass?: string
    }
  } catch {
    return null
  }
}
