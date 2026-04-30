import md5 from 'md5'
import { Hono } from 'hono'
import { getPlanLimits, upgradePlan, type Plan } from '../db'
import { handleTokenWebhook } from './tokens'
import { requireAuth, type AuthContext } from '../middleware/requireAuth'
import type { Env } from '../index'

const billing = new Hono<{ Bindings: Env } & AuthContext>()
const billingWebhook = new Hono<{ Bindings: Env }>()

billing.use('*', requireAuth)

const PLAN_PRICES: Record<Exclude<Plan, 'free'>, number> = {
  starter: 790,
  basic: 1690,
  pro: 2490,
  agency: 4490,
}

function md5Upper(value: string): string {
  return md5(value).toUpperCase()
}

function isPaidPlan(plan: string): plan is Exclude<Plan, 'free'> {
  return plan in PLAN_PRICES
}

billing.post('/create-payment', async (c) => {
  const user = c.get('user')
  const { plan } = await c.req.json<{ plan?: string }>()

  if (!plan || !isPaidPlan(plan)) {
    return c.json({ error: 'Invalid plan' }, 400)
  }

  const amount = PLAN_PRICES[plan]
  const invoiceId = `${user.id}_${Date.now()}`

  await c.env.DB
    .prepare(
      `
        INSERT INTO payments (user_id, robokassa_invoice_id, plan, amount, status)
        VALUES (?, ?, ?, ?, 'pending')
      `
    )
    .bind(user.id, invoiceId, plan, amount)
    .run()

  const signature = md5Upper(
    `${c.env.ROBOKASSA_MERCHANT_ID}:${amount}.00:${invoiceId}:${c.env.ROBOKASSA_SECRET1}`
  )

  const params = new URLSearchParams({
    MerchantLogin: c.env.ROBOKASSA_MERCHANT_ID,
    OutSum: `${amount}.00`,
    InvId: invoiceId,
    Description: `Varmup ${plan}`,
    SignatureValue: signature,
  })

  return c.json({
    payment_url: `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`,
    invoice_id: invoiceId,
  })
})

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

billing.get('/payments', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB
    .prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .bind(userId)
    .all()

  return c.json({ payments: results })
})

billingWebhook.post('/webhook', async (c) => {
  const body = await c.req.parseBody()
  const outSum = body.OutSum
  const invId = body.InvId
  const signatureValue = body.SignatureValue

  if (
    typeof outSum !== 'string' ||
    typeof invId !== 'string' ||
    typeof signatureValue !== 'string'
  ) {
    return c.text('bad request', 400)
  }

  const expectedSignature = md5Upper(`${outSum}:${invId}:${c.env.ROBOKASSA_SECRET2}`)
  if (expectedSignature !== signatureValue.toUpperCase()) {
    return c.text('bad sign', 400)
  }

  const payment = await c.env.DB
    .prepare(
      `
        SELECT id, user_id, plan, amount, status
        FROM payments
        WHERE robokassa_invoice_id = ?
      `
    )
    .bind(invId)
    .first<{ id: number; user_id: number; plan: Plan; amount: number; status: string }>()

  if (!payment) {
    return c.text('not found', 404)
  }

  if (`${payment.amount}.00` !== outSum) {
    return c.text('bad amount', 400)
  }

  if (payment.status === 'paid') {
    return c.text(`OK${invId}`)
  }

  if (payment.status !== 'pending') {
    return c.text('invalid status', 400)
  }

  await c.env.DB
    .prepare("UPDATE payments SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'")
    .bind(payment.id)
    .run()

  if (payment.plan.startsWith('tokens:')) {
    await handleTokenWebhook(c.env.DB, invId)
    return c.text(`OK${invId}`)
  }

  const limits = await getPlanLimits(c.env.DB, payment.plan)
  if (!limits) {
    return c.text('unknown plan', 400)
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  await upgradePlan(c.env.DB, payment.user_id, payment.plan, expiresAt, limits.accounts_limit)

  return c.text(`OK${invId}`)
})

export { billingWebhook }
export default billing
