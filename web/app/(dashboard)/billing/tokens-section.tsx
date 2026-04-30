'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TokenPackage } from '@/lib/types'

export function TokensSection() {
  const [balance, setBalance] = useState<number | null>(null)
  const [packages, setPackages] = useState<TokenPackage[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [balanceData, packagesData] = await Promise.all([
          apiFetch<{ balance: number }>('/tokens/balance'),
          apiFetch<{ packages: TokenPackage[] }>('/tokens/packages'),
        ])

        if (cancelled) return
        setBalance(balanceData.balance)
        setPackages(packagesData.packages)
      } catch {
        if (cancelled) return
        setError('Не удалось загрузить токены')
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleBuy(packageId: number) {
    setError(null)

    try {
      const result = await apiFetch<{ payment_url: string }>('/tokens/buy', {
        method: 'POST',
        body: JSON.stringify({ package_id: packageId }),
      })
      window.location.assign(result.payment_url)
    } catch {
      setError('Не удалось создать платёж')
    }
  }

  return (
    <section className="mt-10 space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">AI токены</h2>
          <p className="text-sm text-gray-500">
            Токены расходуются на AI-диалоги. Базовый запуск AI-прогрева списывает 200 токенов.
          </p>
        </div>
        <div className="text-sm font-medium text-gray-600">
          Баланс:{' '}
          <span className="text-orange-600">{balance === null ? '—' : balance.toLocaleString('ru-RU')}</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {packages.map((pkg) => (
          <Card key={pkg.id}>
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">{pkg.label}</CardTitle>
              <div className="text-2xl font-bold">{pkg.tokens.toLocaleString('ru-RU')}</div>
              <div className="text-sm text-gray-500">токенов</div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-lg font-semibold text-orange-600">{pkg.price_rub.toLocaleString('ru-RU')} ₽</div>
              <Button className="w-full" onClick={() => void handleBuy(pkg.id)} disabled>
                Скоро доступно
              </Button>
              <p className="text-xs text-gray-400">Покупка токенов откроется после публичного запуска.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
