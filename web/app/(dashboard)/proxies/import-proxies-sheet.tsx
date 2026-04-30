'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { apiFetch } from '@/lib/api'

export function ImportProxiesSheet({ onImported }: { onImported: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('socks5')
  const [lines, setLines] = useState('')
  const [result, setResult] = useState<{ added: number; errors: string[] } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reset = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setType('socks5')
      setLines('')
      setResult(null)
      setSubmitting(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setResult(null)

    try {
      const response = await apiFetch<{ added: number; errors: string[] }>('/proxies/bulk', {
        method: 'POST',
        body: JSON.stringify({ lines, type }),
      })
      setResult(response)
      if (response.added > 0) {
        await onImported()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={reset}>
      <SheetTrigger render={<Button variant="outline" />}>
        <Upload className="mr-2 h-4 w-4" />
        Импорт
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Импорт прокси</SheetTitle>
          <SheetDescription>Поддерживаются форматы host:port, host:port:user:pass и type://user:pass@host:port.</SheetDescription>
        </SheetHeader>

        <form className="space-y-4 px-4 pb-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <div className="text-sm font-medium">Тип по умолчанию</div>
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

          <div className="space-y-2">
            <div className="text-sm font-medium">Список прокси</div>
            <textarea
              className="min-h-48 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring"
              value={lines}
              onChange={(event) => setLines(event.target.value)}
              placeholder={['host:port', 'host:port:user:pass', 'socks5://user:pass@host:port'].join('\n')}
            />
          </div>

          {result ? (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm">
              <div className="font-medium">Добавлено: {result.added}</div>
              {result.errors.length > 0 ? (
                <div className="mt-2 space-y-1 text-xs text-red-600">
                  {result.errors.slice(0, 5).map((error, index) => (
                    <div key={`${index}-${error}`}>{error}</div>
                  ))}
                  {result.errors.length > 5 ? <div>...и ещё {result.errors.length - 5} ошибок</div> : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting || !lines.trim()}>
            {submitting ? 'Импортирую...' : 'Тестировать и импортировать'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
