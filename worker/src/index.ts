import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes from './routes/auth'
import accountsRoutes from './routes/accounts'
import billingRoutes, { billingWebhook } from './routes/billing'
import campaignsRoutes from './routes/campaigns'
import analyticsRoutes from './routes/analytics'
import tokensRoutes from './routes/tokens'
import proxiesRoutes from './routes/proxies'
import projectsRoutes from './routes/projects'
import accountImportRoutes from './routes/accounts-import'
import broadcastsRoutes from './routes/broadcasts'
import leadsRoutes from './routes/leads'
import parsingRoutes from './routes/parsing'
import notificationsRoutes, { runScheduledBatchChecks, triggerGithubPollRunner } from './routes/notifications'

export interface Env {
  DB: D1Database
  IMPORTS_BUCKET?: R2Bucket
  JWT_SECRET: string
  TELEGRAM_BOT_TOKEN: string
  ROBOKASSA_MERCHANT_ID: string
  ROBOKASSA_SECRET1: string
  ROBOKASSA_SECRET2: string
  GITHUB_PAT: string
  GITHUB_REPO: string
  GITHUB_WORKFLOW: string
  DEV_AUTH_ENABLED?: string
  ENABLE_AI_PARSING?: string
  ENABLE_GROUP_BROADCASTS?: string
  ENABLE_AI_DIALOGS?: string
}

const app = new Hono<{ Bindings: Env }>()

app.use(
  '*',
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://warmup-saas.pages.dev'],
    credentials: true,
  })
)

app.get('/', (c) => c.json({ ok: true, service: 'warmup-saas-api' }))

app.route('/auth', authRoutes)
app.route('/accounts', accountsRoutes)
app.route('/billing', billingWebhook)
app.route('/billing', billingRoutes)
app.route('/campaigns', campaignsRoutes)
app.route('/analytics', analyticsRoutes)
app.route('/tokens', tokensRoutes)
app.route('/proxies', proxiesRoutes)
app.route('/projects', projectsRoutes)
app.route('/accounts/import', accountImportRoutes)
app.route('/broadcasts', broadcastsRoutes)
app.route('/leads', leadsRoutes)
app.route('/parsing', parsingRoutes)
app.route('/notifications', notificationsRoutes)

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    switch (controller.cron) {
      case '0 */6 * * *':
        await runScheduledBatchChecks(env)
        break
      case '*/30 * * * *':
        await triggerGithubPollRunner(env)
        break
      default:
        break
    }
  },
}
