import { Hono } from 'hono'
import type { Env } from '../index'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import { earnTokens, ensureTokenBalance, spendTokens } from '../db'
import { pauseUserTasksForZeroBalance } from './notifications'
import md5 from 'md5'

const tokens = new Hono<{ Bindings: Env } & AuthContext>()

tokens.use('*', requireAuth)

tokens.get('/balance', async (c) => {
  const userId = c.get('userId')
  const balance = await ensureTokenBalance(c.env.DB, userId)
  return c.json({ balance })
})

tokens.get('/transactions', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare('SELECT * FROM token_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(userId)
    .all()

  return c.json({ transactions: results })
})

tokens.get('/packages', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT id, tokens, price_rub, label, is_active FROM token_packages WHERE is_active = 1 ORDER BY tokens ASC')
    .all()

  return c.json({ packages: results })
})

tokens.post('/buy', async (c) => {
  const user = c.get('user')
  const { package_id } = await c.req.json<{ package_id?: number }>()

  if (typeof package_id !== 'number' || !Number.isInteger(package_id) || package_id <= 0) {
    return c.json({ error: 'Некорректный пакет' }, 400)
  }

  const packageId = package_id

  const pkg = await c.env.DB
    .prepare('SELECT id, tokens, price_rub, label FROM token_packages WHERE id = ? AND is_active = 1')
    .bind(packageId)
    .first<{ id: number; tokens: number; price_rub: number; label: string }>()

  if (!pkg) {
    return c.json({ error: 'Пакет не найден' }, 404)
  }

  const invoiceId = `tok_${user.id}_${Date.now()}`

  await c.env.DB
    .prepare(
      `
        INSERT INTO payments (user_id, robokassa_invoice_id, plan, amount, status)
        VALUES (?, ?, ?, ?, 'pending')
      `
    )
    .bind(user.id, invoiceId, `tokens:${pkg.tokens}`, pkg.price_rub)
    .run()

  const signature = md5(
    `${c.env.ROBOKASSA_MERCHANT_ID}:${pkg.price_rub}.00:${invoiceId}:${c.env.ROBOKASSA_SECRET1}`
  ).toUpperCase()

  const params = new URLSearchParams({
    MerchantLogin: c.env.ROBOKASSA_MERCHANT_ID,
    OutSum: `${pkg.price_rub}.00`,
    InvId: invoiceId,
    Description: `Varmup AI tokens ${pkg.label}`,
    SignatureValue: signature,
  })

  return c.json({
    payment_url: `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`,
    invoice_id: invoiceId,
    tokens: pkg.tokens,
  })
})

tokens.post('/spend', async (c) => {
  const userId = c.get('userId')
  const { amount, reason, ref_id } = await c.req.json<{
    amount?: number
    reason?: string
    ref_id?: string
  }>()

  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || !reason) {
    return c.json({ error: 'Некорректные данные' }, 400)
  }

  const spendAmount = amount
  const result = await spendTokens(c.env.DB, userId, spendAmount, reason, ref_id)
  if (!result.ok) {
    return c.json({ error: result.error }, 402)
  }

  if (result.balance === 0) {
    await pauseUserTasksForZeroBalance(c.env, userId)
  }

  return c.json({ ok: true, balance: result.balance })
})

export async function handleTokenWebhook(db: D1Database, invoiceId: string): Promise<void> {
  const payment = await db
    .prepare('SELECT id, user_id, plan FROM payments WHERE robokassa_invoice_id = ? AND status = ?')
    .bind(invoiceId, 'paid')
    .first<{ id: number; user_id: number; plan: string }>()

  if (!payment || !payment.plan.startsWith('tokens:')) {
    return
  }

  const tokensCount = Number.parseInt(payment.plan.slice('tokens:'.length), 10)
  if (!Number.isInteger(tokensCount) || tokensCount <= 0) {
    return
  }

  const existing = await db
    .prepare('SELECT id FROM token_transactions WHERE user_id = ? AND reason = ? AND ref_id = ? LIMIT 1')
    .bind(payment.user_id, 'purchase', invoiceId)
    .first<{ id: number }>()

  if (existing) {
    return
  }

  await earnTokens(db, payment.user_id, tokensCount, 'purchase', invoiceId)
}

export default tokens
