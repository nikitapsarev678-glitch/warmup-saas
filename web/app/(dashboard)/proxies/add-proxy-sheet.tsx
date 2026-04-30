'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { apiFetch } from '@/lib/api'
import type { ProxyItem } from './proxies-client'

export function AddProxySheet({ onAdded }: { onAdded: (proxy: ProxyItem) => void }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('socks5')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('1080')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reset = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setType('socks5')
      setHost('')
      setPort('1080')
      setUsername('')
      setPassword('')
      setLabel('')
      setError(null)
      setSubmitting(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const response = await apiFetch<{ proxy_id: number }>('/proxies', {
        method: 'POST',
        body: JSON.stringify({
          type,
          host,
          port: Number(port),
          username: username || undefined,
          password: password || undefined,
          label: label || undefined,
        }),
      })
      onAdded({
        id: response.proxy_id,
        type,
        host,
        port: Number(port),
        username: username || null,
        label: label || null,
        status: 'unknown',
        latency_ms: null,
        last_checked_at: null,
        accounts_count: 0,
        created_at: new Date().toISOString(),
      })
      reset(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось добавить прокси')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={reset}>
      <SheetTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        Добавить
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Добавить прокси</SheetTitle>
          <SheetDescription>Укажите тип, адрес и при необходимости авторизацию.</SheetDescription>
        </SheetHeader>

        <form className="space-y-4 px-4 pb-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <div className="text-sm font-medium">Тип</div>
            <select
              className="flex h-8 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="socks5">SOCKS5</option>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-2">
              <div className="text-sm font-medium">Хост</div>
              <Input value={host} onChange={(event) => setHost(event.target.value)} placeholder="proxy.example.com" />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Порт</div>
              <Input value={port} onChange={(event) => setPort(event.target.value)} type="number" min="1" max="65535" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Логин</div>
              <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="optional" />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Пароль</div>
              <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="optional" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Название</div>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Например, RU pool #1" />
          </div>

          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Добавляю...' : 'Добавить'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
