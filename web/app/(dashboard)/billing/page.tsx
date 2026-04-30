import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getMe } from '@/lib/auth'
import { createPayment } from './actions'
import { TokensSection } from './tokens-section'

const PLANS = [
  { id: 'starter', name: 'Стартовый', price: 790, accounts: 5, days: 14 },
  { id: 'basic', name: 'Базовый', price: 1690, accounts: 20, days: 30 },
  { id: 'pro', name: 'Профессиональный', price: 2490, accounts: 100, days: 60 },
  { id: 'agency', name: 'Агентский', price: 4490, accounts: 500, days: 'Без лимита' },
] as const

export default async function BillingPage() {
  const user = await getMe()
  if (!user) return null

  return (
    <div className="max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Тариф и оплата</h1>
        <p className="mt-1 text-sm text-gray-500">
          Текущий тариф:{' '}
          <Badge variant="secondary" className="capitalize">
            {user.plan === 'free' ? 'Бесплатный' : user.plan}
          </Badge>
          {user.plan_expires_at && (
            <span className="ml-2 text-gray-400">
              до {new Date(user.plan_expires_at).toLocaleDateString('ru-RU')}
            </span>
          )}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = user.plan === plan.id

          return (
            <Card key={plan.id} className={isCurrent ? 'border-blue-500 ring-1 ring-blue-500' : undefined}>
              <CardHeader>
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <div className="text-3xl font-bold">
                  {plan.price} ₽
                  <span className="ml-1 text-sm font-normal text-gray-500">/мес</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-600">
                <div>✓ {plan.accounts} аккаунтов</div>
                <div>✓ {typeof plan.days === 'number' ? `до ${plan.days} дней прогрева` : plan.days}</div>
                <div>✓ Все действия прогрева</div>
                <div>✓ Статистика и аналитика</div>

                <form action={createPayment} className="pt-4">
                  <input type="hidden" name="plan" value={plan.id} />
                  <Button type="submit" className="w-full" disabled>
                    {isCurrent ? 'Текущий тариф' : 'Скоро доступно'}
                  </Button>
                </form>
                {!isCurrent ? (
                  <p className="text-xs text-gray-400">Онлайн-оплата тарифов будет открыта после публичного запуска.</p>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <TokensSection />
    </div>
  )
}
