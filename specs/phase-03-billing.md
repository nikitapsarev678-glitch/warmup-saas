# Фаза 3 — Billing (Robokassa)

> Читай SPEC.md перед началом. Фазы 1 и 2 должны быть выполнены.

## Цель
Пользователь выбирает тариф → оплачивает через Robokassa → получает апгрейд плана в D1 автоматически.

## Не трогай
- `worker/src/routes/accounts.ts`, `campaigns.ts`, `analytics.ts`
- Таблицы кроме `payments` и `saas_users`

---

## Как работает Robokassa

1. Фронтенд вызывает `POST /billing/create-payment` с выбранным планом
2. Worker создаёт запись в `payments` (status='pending') и возвращает URL оплаты Robokassa
3. Пользователь оплачивает на стороне Robokassa
4. Robokassa отправляет `POST /billing/webhook` с параметрами платежа
5. Worker проверяет подпись (MD5) и обновляет план пользователя

### Формула подписи для создания платежа
```
SignatureValue = MD5(MerchantLogin:OutSum:InvId:Secret1)
```

### Формула проверки вебхука (ResultURL)
```
SignatureValue = MD5(OutSum:InvId:Secret2)
```

---

## Файл: worker/src/routes/billing.ts

```typescript
import { Hono } from 'hono'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import { upgradePlan, getPlanLimits } from '../db'
import type { Env } from '../index'
import type { Plan } from '../db'

const billing = new Hono<{ Bindings: Env } & AuthContext>()

billing.use('*', requireAuth)

const PLAN_PRICES: Record<Plan, number> = {
  free: 0,
  starter: 790,
  basic: 1690,
  pro: 2490,
  agency: 4490,
}

function md5(str: string): string {
  // Cloudflare Workers не имеют встроенного MD5 через crypto.subtle,
  // используем Web Crypto API через хеш SHA-1 эмуляцию
  // или подключаем пакет: npm install @cf-wasm/md5
  // Временная реализация через TextEncoder + SHA (замени на реальный MD5):
  throw new Error('Используй пакет @cf-wasm/md5 или реализуй MD5 через ArrayBuffer')
}

async function robokassaMd5(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  // MD5 недоступен в Web Crypto API (только SHA-*)
  // Установи: npm install md5 (и добавь declare module)
  // или используй: https://www.npmjs.com/package/crypto-hash
  // Для простоты — реализация ниже использует внешний пакет
  throw new Error('Нужен MD5 пакет — см. комментарий выше')
}

// Заготовка с реальным MD5 (после установки пакета):
// import md5 from 'md5'

// POST /billing/create-payment
billing.post('/create-payment', async (c) => {
  const user = c.get('user')
  const { plan } = await c.req.json<{ plan: Plan }>()

  if (!PLAN_PRICES[plan] || plan === 'free') {
    return c.json({ error: 'Invalid plan' }, 400)
  }

  const amount = PLAN_PRICES[plan]
  const invoiceId = `${user.id}_${Date.now()}`

  // Создать запись платежа
  await c.env.DB
    .prepare(`
      INSERT INTO payments (user_id, robokassa_invoice_id, plan, amount, status)
      VALUES (?, ?, ?, ?, 'pending')
    `)
    .bind(user.id, invoiceId, plan, amount)
    .run()

  // Формируем подпись: MD5(MerchantLogin:OutSum:InvId:Secret1)
  // const sig = md5(`${c.env.ROBOKASSA_MERCHANT_ID}:${amount}.00:${invoiceId}:${c.env.ROBOKASSA_SECRET1}`)
  // const payUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${c.env.ROBOKASSA_MERCHANT_ID}&OutSum=${amount}.00&InvId=${invoiceId}&Description=Varmup+${plan}&SignatureValue=${sig}&IsTest=0`

  // Временная заглушка (замени на реальный URL после MD5):
  const payUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${c.env.ROBOKASSA_MERCHANT_ID}&OutSum=${amount}.00&InvId=${invoiceId}&Description=Varmup+${plan}&IsTest=1`

  return c.json({ payment_url: payUrl, invoice_id: invoiceId })
})

// POST /billing/webhook — ResultURL от Robokassa
// ВАЖНО: этот роут НЕ требует JWT авторизации (вызывает Robokassa, не пользователь)
// Добавь его отдельно в index.ts без requireAuth middleware

export const billingWebhook = new Hono<{ Bindings: Env }>()

billingWebhook.post('/webhook', async (c) => {
  const body = await c.req.parseBody()
  const { OutSum, InvId, SignatureValue } = body as Record<string, string>

  if (!OutSum || !InvId || !SignatureValue) {
    return c.text('bad request', 400)
  }

  // Проверка подписи: MD5(OutSum:InvId:Secret2)
  // const expectedSig = md5(`${OutSum}:${InvId}:${c.env.ROBOKASSA_SECRET2}`).toUpperCase()
  // if (expectedSig !== SignatureValue.toUpperCase()) {
  //   return c.text('bad sign', 400)
  // }

  // Найти платёж
  const payment = await c.env.DB
    .prepare("SELECT * FROM payments WHERE robokassa_invoice_id = ? AND status = 'pending'")
    .bind(InvId)
    .first<{ id: number; user_id: number; plan: string }>()

  if (!payment) return c.text('not found', 404)

  // Обновить платёж
  await c.env.DB
    .prepare("UPDATE payments SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(payment.id)
    .run()

  // Получить лимиты нового тарифа
  const limits = await getPlanLimits(c.env.DB, payment.plan as Plan)
  if (!limits) return c.text('unknown plan', 400)

  // Посчитать дату окончания (30 дней с сегодня)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  // Апгрейд пользователя
  await upgradePlan(c.env.DB, payment.user_id, payment.plan as Plan, expiresAt, limits.accounts_limit)

  // Robokassa ждёт ответа "OK{InvId}"
  return c.text(`OK${InvId}`)
})

// GET /billing/plan — текущий тариф пользователя
billing.get('/plan', async (c) => {
  const user = c.get('user')
  const limits = await getPlanLimits(c.env.DB, user.plan)

  return c.json({
    plan: user.plan,
    expires_at: user.plan_expires_at,
    accounts_limit: user.accounts_limit,
    limits,
  })
})

// GET /billing/payments — история платежей
billing.get('/payments', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB
    .prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .bind(user.id)
    .all()
  return c.json({ payments: results })
})

export default billing
```

---

## Подключить в worker/src/index.ts

```typescript
import billingRoutes, { billingWebhook } from './routes/billing'
app.route('/billing', billingRoutes)
app.route('/billing', billingWebhook)  // webhook без auth
```

---

## Файл: web/app/(dashboard)/billing/page.tsx

```tsx
import { getMe } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const PLANS = [
  { id: 'starter', name: 'Стартовый', price: 790, accounts: 5, days: 14 },
  { id: 'basic', name: 'Базовый', price: 1690, accounts: 20, days: 30 },
  { id: 'pro', name: 'Профессиональный', price: 2490, accounts: 100, days: 60 },
  { id: 'agency', name: 'Агентский', price: 4490, accounts: 500, days: 9999 },
] as const

export default async function BillingPage() {
  const user = await getMe()
  if (!user) return null

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Тариф и оплата</h1>
        <p className="text-gray-500 mt-1">
          Текущий тариф:{' '}
          <Badge variant="secondary" className="capitalize">
            {user.plan === 'free' ? 'Бесплатный' : user.plan}
          </Badge>
          {user.plan_expires_at && (
            <span className="ml-2 text-sm text-gray-400">
              до {new Date(user.plan_expires_at).toLocaleDateString('ru-RU')}
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((plan) => (
          <Card key={plan.id} className={user.plan === plan.id ? 'border-blue-500 border-2' : ''}>
            <CardHeader>
              <CardTitle className="text-lg">{plan.name}</CardTitle>
              <div className="text-3xl font-bold">
                {plan.price} ₽
                <span className="text-sm font-normal text-gray-500">/мес</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>✓ {plan.accounts} аккаунтов</div>
              <div>✓ {plan.days === 9999 ? 'Без лимита' : `до ${plan.days} дней`} прогрева</div>
              <div>✓ Все действия прогрева</div>
              <div>✓ Статистика и аналитика</div>
              <PlanButton currentPlan={user.plan} targetPlan={plan.id} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function PlanButton({ currentPlan, targetPlan }: { currentPlan: string; targetPlan: string }) {
  if (currentPlan === targetPlan) {
    return <Button disabled className="w-full mt-4">Текущий тариф</Button>
  }
  return (
    <form action={async () => {
      'use server'
      const res = await apiFetch<{ payment_url: string }>('/billing/create-payment', {
        method: 'POST',
        body: JSON.stringify({ plan: targetPlan }),
      })
      // redirect(res.payment_url) — нужен redirect из next/navigation
    }}>
      <Button type="submit" className="w-full mt-4">Оплатить</Button>
    </form>
  )
}
```

> **Примечание:** Server Action с redirect нужно вынести в отдельный `actions.ts` файл с `'use server'` директивой и `redirect()` из `next/navigation`.

---

## Установить MD5 пакет

```bash
cd worker
npm install md5
npm install -D @types/md5
```

Затем в `billing.ts` заменить заглушки:
```typescript
import md5 from 'md5'
// Использовать:
const sig = md5(`${merchantId}:${amount}.00:${invId}:${secret1}`).toUpperCase()
```

---

## Acceptance criteria

- [ ] `POST /billing/create-payment` с валидной сессией → возвращает `{payment_url: "..."}`
- [ ] `POST /billing/webhook` с корректными параметрами → обновляет план пользователя в D1, возвращает `OK{InvId}`
- [ ] `POST /billing/webhook` с некорректной подписью → возвращает 400
- [ ] `GET /billing/plan` → возвращает текущий тариф и лимиты
- [ ] Страница `/billing` отображает 4 тарифных карточки
- [ ] Текущий тариф подсвечен синей рамкой
- [ ] После оплаты: `saas_users.plan` обновился, `plan_expires_at` установлен на +30 дней
