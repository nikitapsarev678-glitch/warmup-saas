'use client'

import nextDynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { Globe, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetch } from '@/lib/api'

export type ProxyItem = {
  id: number
  type: string
  host: string
  port: number
  username: string | null
  label: string | null
  status: string
  latency_ms: number | null
  last_checked_at?: string | null
  accounts_count: number
  created_at: string
}

const AddProxySheet = nextDynamic(() => import('./add-proxy-sheet').then((mod) => mod.AddProxySheet), {
  loading: () => <Button disabled>Загрузка...</Button>,
})
const ImportProxiesSheet = nextDynamic(() => import('./import-proxies-sheet').then((mod) => mod.ImportProxiesSheet), {
  loading: () => <Button variant="outline" disabled>Загрузка...</Button>,
})

export function ProxiesClient({ proxies }: { proxies: ProxyItem[] }) {
  const [items, setItems] = useState(proxies)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const loadProxies = async () => {
    const response = await apiFetch<{ proxies: ProxyItem[] }>('/proxies')
    setItems(response.proxies)
  }

  const stats = useMemo(() => {
    const total = items.length
    const working = items.filter((proxy) => proxy.status === 'active').length
    const assigned = items.filter((proxy) => proxy.accounts_count > 0).length
    return { total, working, assigned }
  }, [items])

  const handleDelete = async (id: number) => {
    if (!window.confirm('Удалить прокси? Он будет отвязан от всех аккаунтов.')) return
    await apiFetch(`/proxies/${id}`, { method: 'DELETE' })
    setItems((current) => current.filter((proxy) => proxy.id !== id))
  }

  const handleAdd = (proxy: ProxyItem) => {
    setItems((current) => [proxy, ...current])
  }

  const handleBulkImport = async () => {
    await loadProxies()
    setMessage('Список прокси обновлён после импорта')
  }

  const handleCheck = async () => {
    setChecking(true)
    setMessage(null)

    try {
      const response = await apiFetch<{ message?: string }>('/proxies/check', { method: 'POST' })
      await loadProxies()
      setMessage(response.message ?? 'Проверка прокси завершена')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось запустить проверку')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Прокси менеджер</h1>
          <p className="mt-1 text-sm text-gray-500">Управление прокси-серверами и массовый импорт.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => void handleCheck()} disabled={checking || items.length === 0}>
            {checking ? 'Проверяем...' : 'Проверить'}
          </Button>
          <ImportProxiesSheet onImported={handleBulkImport} />
          <AddProxySheet onAdded={handleAdd} />
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard title="Всего" value={stats.total} />
        <StatCard title="Работает" value={stats.working} valueClassName="text-green-600" />
        <StatCard title="Активных" value={stats.assigned} valueClassName="text-blue-600" />
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-gray-600">{message}</div>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Globe className="mb-4 h-10 w-10 text-gray-300" />
            <p className="mb-4 text-sm text-gray-500">Нет прокси. Добавьте первый прокси или импортируйте список.</p>
            <AddProxySheet onAdded={handleAdd} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Прокси</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Проверка</TableHead>
                  <TableHead>Аккаунтов</TableHead>
                  <TableHead className="px-4 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((proxy) => (
                  <TableRow key={proxy.id}>
                    <TableCell className="px-4 py-3 align-top whitespace-normal">
                      <div className="font-medium text-gray-900">{proxy.label ?? `${proxy.host}:${proxy.port}`}</div>
                      {proxy.label ? <div className="text-xs text-gray-400">{proxy.host}:{proxy.port}</div> : null}
                      {proxy.username ? <div className="text-xs text-gray-400">@{proxy.username}</div> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase">
                        {proxy.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            proxy.status === 'active'
                              ? 'bg-green-500'
                              : proxy.status === 'dead'
                                ? 'bg-red-500'
                                : 'bg-gray-300'
                          }`}
                        />
                        <span>{getStatusLabel(proxy.status)}</span>
                        {proxy.latency_ms !== null ? <span className="text-xs text-gray-400">{proxy.latency_ms}ms</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-600">
                        <div>{proxy.latency_ms !== null ? `${proxy.latency_ms}ms` : '—'}</div>
                        <div className="text-xs text-gray-400">{formatCheckedAt(proxy.last_checked_at, proxy.status)}</div>
                      </div>
                    </TableCell>
                    <TableCell>{proxy.accounts_count}</TableCell>
                    <TableCell className="px-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => void handleDelete(proxy.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({
  title,
  value,
  valueClassName,
}: {
  title: string
  value: number
  valueClassName?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-gray-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${valueClassName ?? 'text-gray-900'}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function getStatusLabel(status: string) {
  if (status === 'active') return 'Работает'
  if (status === 'dead') return 'Недоступен'
  return 'Неизвестен'
}

function formatCheckedAt(value: string | null | undefined, status: string) {
  if (!value || status === 'unknown') return 'Не проверялся'

  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
