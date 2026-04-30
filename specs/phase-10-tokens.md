н# Фаза 10 — Token System (AI-токены + гибридная монетизация)

> Читай SPEC.md перед началом. Фазы 1, 2, 3 (database, auth, billing) должны быть выполнены.  
> Эта фаза добавляет: таблицу tokens, роут /tokens, обновляет /billing и страницу billing в web/.  
> НЕ трогай: auth.ts, accounts.ts, campaigns.ts, analytics.ts.

## Цель
Добавить систему AI-токенов. Токены — отдельная валюта, расходуемая при использовании AI-функций.
400 токенов выдаются при регистрации. Покупаются пакетами через Robokassa/YooKassa.
При создании AI-кампании списывается N токенов авансом (200 по умолчанию).

---

## Файл: worker/migrations/0003_tokens.sql

```sql
-- AI токены пользователей
CREATE TABLE IF NOT EXISTS token_balance (
  user_id INTEGER PRIMARY KEY REFERENCES saas_users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 400,
    -- начальный бонус 400 токенов
  lifetime_earned INTEGER NOT NULL DEFAULT 400,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- История транзакций токенов
CREATE TABLE IF NOT EXISTS token_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
    -- положительное = начисление, отрицательное = списание
  reason TEXT NOT NULL,
    -- 'registration_bonus' | 'purchase' | 'ai_campaign' | 'refund'
  ref_id TEXT,
    -- ID кампании или платежа (для трейсабельности)
  balance_after INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tt_user ON token_transactions(user_id, created_at DESC);

-- Пакеты токенов (справочник)
CREATE TABLE IF NOT EXISTS token_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tokens INTEGER NOT NULL,         -- количество токенов
  price_rub INTEGER NOT NULL,      -- цена в рублях
  label TEXT NOT NULL,             -- "50K", "100K", etc.
  is_active INTEGER NOT NULL DEFAULT 1
);

INSERT OR REPLACE INTO token_packages (tokens, price_rub, label) VALUES
  (50000,  500,   '50K'),
  (100000, 1000,  '100K'),
  (300000, 3000,  '300K'),
  (500000, 5000,  '500K'),
  (1000000, 10000, '1M');

-- Триггер: создать balance при регистрации пользователя
-- (Выполняется через код, не триггером SQLite — D1 не поддерживает AFTER INSERT triggers)
```

---

## Обновить worker/src/db.ts (добавить хелперы токенов)

Добавить в конец файла `worker/src/db.ts`:

```typescript
// ── Token helpers ─────────────────────────────────────────────────

export async function ensureTokenBalance(
  db: D1Database,
  userId: number
): Promise<number> {
  // Создаёт запись с бонусом 400 если не существует
  await db
    .prepare(`
      INSERT OR IGNORE INTO token_balance (user_id, balance, lifetime_earned)
      VALUES (?, 400, 400)
    `)
    .bind(userId)
    .run()

  const row = await db
    .prepare('SELECT balance FROM token_balance WHERE user_id = ?')
    .bind(userId)
    .first<{ balance: number }>()
  return row?.balance ?? 0
}

export async function getTokenBalance(
  db: D1Database,
  userId: number
): Promise<number> {
  const row = await db
    .prepare('SELECT balance FROM token_balance WHERE user_id = ?')
    .bind(userId)
    .first<{ balance: number }>()
  return row?.balance ?? 0
}

export async function spendTokens(
  db: D1Database,
  userId: number,
  amount: number,
  reason: string,
  refId?: string
): Promise<{ ok: boolean; balance: number; error?: string }> {
  const current = await getTokenBalance(db, userId)
  if (current < amount) {
    return { ok: false, balance: current, error: 'Недостаточно токенов' }
  }

  const newBalance = current - amount
  await db.batch([
    db.prepare('UPDATE token_balance SET balance = ?, lifetime_spent = lifetime_spent + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
      .bind(newBalance, amount, userId),
    db.prepare('INSERT INTO token_transactions (user_id, amount, reason, ref_id, balance_after) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, -amount, reason, refId ?? null, newBalance),
  ])

  return { ok: true, balance: newBalance }
}

export async function earnTokens(
  db: D1Database,
  userId: number,
  amount: number,
  reason: string,
  refId?: string
): Promise<number> {
  const current = await getTokenBalance(db, userId)
  const newBalance = current + amount

  await db.batch([
    db.prepare(`
      INSERT INTO token_balance (user_id, balance, lifetime_earned)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        balance = balance + ?,
        lifetime_earned = lifetime_earned + ?,
        updated_at = CURRENT_TIMESTAMP
    `).bind(userId, amount, amount, amount, amount),
    db.prepare('INSERT INTO token_transactions (user_id, amount, reason, ref_id, balance_after) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, amount, reason, refId ?? null, newBalance),
  ])

  return newBalance
}
```

---

## Файл: worker/src/routes/tokens.ts (новый файл)

```typescript
import { Hono } from 'hono'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import { getTokenBalance, spendTokens, earnTokens, ensureTokenBalance } from '../db'
import type { Env } from '../index'
import md5 from 'md5'

const tokens = new Hono<{ Bindings: Env } & AuthContext>()
tokens.use('*', requireAuth)

// GET /tokens/balance — баланс токенов
tokens.get('/balance', async (c) => {
  const userId = c.get('userId')
  const balance = await ensureTokenBalance(c.env.DB, userId)
  return c.json({ balance })
})

// GET /tokens/transactions — история
tokens.get('/transactions', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare('SELECT * FROM token_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(userId)
    .all()
  return c.json({ transactions: results })
})

// GET /tokens/packages — доступные пакеты
tokens.get('/packages', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM token_packages WHERE is_active = 1 ORDER BY tokens ASC')
    .all()
  return c.json({ packages: results })
})

// POST /tokens/buy — создать платёж на покупку токенов
tokens.post('/buy', async (c) => {
  const user = c.get('user')
  const { package_id } = await c.req.json<{ package_id: number }>()

  const pkg = await c.env.DB
    .prepare('SELECT * FROM token_packages WHERE id = ? AND is_active = 1')
    .bind(package_id)
    .first<{ id: number; tokens: number; price_rub: number; label: string }>()

  if (!pkg) return c.json({ error: 'Пакет не найден' }, 404)

  const invoiceId = `tok_${user.id}_${Date.now()}`

  // Создать pending платёж (переиспользуем таблицу payments)
  await c.env.DB
    .prepare(`
      INSERT INTO payments (user_id, robokassa_invoice_id, plan, amount, status)
      VALUES (?, ?, 'tokens', ?, 'pending')
    `)
    .bind(user.id, invoiceId, pkg.price_rub)
    .run()

  // Сохранить кол-во токенов в ref (через отдельную колонку или в plan как JSON)
  // Простое решение: сохранить tokens в plan поле как "tokens:50000"
  await c.env.DB
    .prepare(`UPDATE payments SET plan = ? WHERE robokassa_invoice_id = ?`)
    .bind(`tokens:${pkg.tokens}`, invoiceId)
    .run()

  const sig = md5(
    `${c.env.ROBOKASSA_MERCHANT_ID}:${pkg.price_rub}.00:${invoiceId}:${c.env.ROBOKASSA_SECRET1}`
  ).toUpperCase()

  const payUrl =
    `https://auth.robokassa.ru/Merchant/Index.aspx` +
    `?MerchantLogin=${c.env.ROBOKASSA_MERCHANT_ID}` +
    `&OutSum=${pkg.price_rub}.00` +
    `&InvId=${invoiceId}` +
    `&Description=Varmup+AI+токены+${pkg.label}` +
    `&SignatureValue=${sig}` +
    `&IsTest=0`

  return c.json({ payment_url: payUrl, invoice_id: invoiceId, tokens: pkg.tokens })
})

// POST /tokens/spend — списать токены (вызывается из campaigns route перед запуском)
tokens.post('/spend', async (c) => {
  const userId = c.get('userId')
  const { amount, reason, ref_id } = await c.req.json<{
    amount: number
    reason: string
    ref_id?: string
  }>()

  const result = await spendTokens(c.env.DB, userId, amount, reason, ref_id)
  if (!result.ok) {
    return c.json({ error: result.error }, 402)
  }
  return c.json({ ok: true, balance: result.balance })
})

export default tokens

// ── Webhook обработчик для токенов (без auth) ─────────────────────

export async function handleTokenWebhook(
  db: D1Database,
  invoiceId: string
): Promise<void> {
  const payment = await db
    .prepare("SELECT * FROM payments WHERE robokassa_invoice_id = ? AND status = 'pending'")
    .bind(invoiceId)
    .first<{ id: number; user_id: number; plan: string }>()

  if (!payment) return

  // plan вида "tokens:50000"
  if (!payment.plan.startsWith('tokens:')) return

  const tokensCount = parseInt(payment.plan.split(':')[1], 10)
  if (isNaN(tokensCount)) return

  await db
    .prepare("UPDATE payments SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(payment.id)
    .run()

  await earnTokens(db, payment.user_id, tokensCount, 'purchase', invoiceId)
}
```

---

## Обновить worker/src/routes/billing.ts

В функции webhook (`billingWebhook`) ПОСЛЕ обновления статуса платежа добавить:

```typescript
import { handleTokenWebhook } from './tokens'

// В billingWebhook.post('/webhook', ...) после:
// await db.prepare("UPDATE payments SET status = 'paid'...").run()
// добавить:

if (payment.plan.startsWith('tokens:')) {
  await handleTokenWebhook(c.env.DB, InvId)
  return c.text(`OK${InvId}`)
}
// ... остальная логика апгрейда плана
```

---

## Подключить в worker/src/index.ts

```typescript
import tokensRoutes from './routes/tokens'
app.route('/tokens', tokensRoutes)
```

---

## Обновить web/app/(dashboard)/billing/page.tsx

Добавить секцию токенов ПОСЛЕ карточек тарифов:

```tsx
// Добавить в BillingPage — импортировать apiFetch, useState, useEffect
// Вынести в отдельный client компонент TokensSection

'use client' // вынести TokensSection в отдельный файл
// web/app/(dashboard)/billing/tokens-section.tsx

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

interface TokenPackage {
  id: number
  tokens: number
  price_rub: number
  label: string
}

export function TokensSection() {
  const [balance, setBalance] = useState<number | null>(null)
  const [packages, setPackages] = useState<TokenPackage[]>([])
  const [loading, setLoading] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      apiFetch<{ balance: number }>('/tokens/balance'),
      apiFetch<{ packages: TokenPackage[] }>('/tokens/packages'),
    ]).then(([b, p]) => {
      setBalance(b.balance)
      setPackages(p.packages)
    })
  }, [])

  const handleBuy = async (pkgId: number) => {
    setLoading(pkgId)
    try {
      const res = await apiFetch<{ payment_url: string }>('/tokens/buy', {
        method: 'POST',
        body: JSON.stringify({ package_id: pkgId }),
      })
      window.location.href = res.payment_url
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">AI Токены</h2>
        {balance !== null && (
          <div className="text-sm font-medium">
            Баланс: <span className="text-orange-600 font-bold">{balance.toLocaleString('ru')} 🪙</span>
          </div>
        )}
      </div>

      <p className="text-sm text-gray-400 mb-4">
        Токены расходуются при использовании AI-диалогов. 200 токенов = 7 дней AI-прогрева.
        Токены действительны 3 месяца с покупки.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className="border rounded-xl p-4 text-center hover:border-orange-300 transition-colors"
          >
            <div className="text-xl font-bold text-gray-900 mb-1">{pkg.label}</div>
            <div className="text-sm text-gray-400 mb-3">токенов</div>
            <div className="text-lg font-semibold text-orange-600 mb-3">
              {pkg.price_rub.toLocaleString('ru')} ₽
            </div>
            <button
              onClick={() => handleBuy(pkg.id)}
              disabled={loading === pkg.id}
              className="w-full py-1.5 px-3 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {loading === pkg.id ? '...' : 'Купить'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Обновить worker/src/routes/campaigns.ts (списание токенов при запуске)

В `POST /campaigns/:id/start` перед триггером GitHub Actions добавить:

```typescript
// Списать токены если AI-режим включён
const campaignFull = await c.env.DB
  .prepare('SELECT ai_dialog_enabled, warmup_days FROM campaigns WHERE id = ?')
  .bind(campaignId)
  .first<{ ai_dialog_enabled: number; warmup_days: number }>()

if (campaignFull?.ai_dialog_enabled) {
  const tokensNeeded = 200  // базовая стоимость AI-прогрева
  const spend = await spendTokens(c.env.DB, userId, tokensNeeded, 'ai_campaign', String(campaignId))
  if (!spend.ok) {
    return c.json({ error: `Недостаточно AI-токенов. Нужно: ${tokensNeeded}, есть: ${spend.balance}` }, 402)
  }
}
```

Добавить импорт в campaigns.ts:
```typescript
import { spendTokens } from '../db'
```

---

## Обновить web/lib/types.ts

Добавить:
```typescript
export interface TokenPackage {
  id: number
  tokens: number
  price_rub: number
  label: string
  is_active: number
}

export interface TokenTransaction {
  id: number
  user_id: number
  amount: number
  reason: string
  ref_id: string | null
  balance_after: number
  created_at: string
}
```

---

## Acceptance criteria

- [ ] Таблицы `token_balance`, `token_transactions`, `token_packages` созданы
- [ ] `GET /tokens/balance` → `{balance: 400}` для нового пользователя
- [ ] `GET /tokens/packages` → 5 пакетов токенов
- [ ] `POST /tokens/buy` с валидным package_id → возвращает `payment_url`
- [ ] После успешного webhook Robokassa → баланс токенов увеличился
- [ ] `POST /campaigns/:id/start` с ai_dialog_enabled=1 → списывает 200 токенов
- [ ] `POST /campaigns/:id/start` при нехватке токенов → 402 с понятным сообщением
- [ ] Страница `/billing` показывает секцию токенов с балансом и 5 пакетами
- [ ] Кнопка "Купить" → редирект на Robokassa
- [ ] История транзакций: `GET /tokens/transactions` → возвращает список
- [ ] Tenant isolation: нельзя получить баланс чужого пользователя (всегда userId из JWT)
