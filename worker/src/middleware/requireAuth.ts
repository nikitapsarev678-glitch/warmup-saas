import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { jwtVerify } from 'jose'
import { getUserByTelegramId, type SaasUser } from '../db'
import type { Env } from '../index'

export type AuthContext = {
  Variables: {
    user: SaasUser
    userId: number
  }
}

function resolveJwtSecret(requestUrl: string, configuredSecret: string) {
  if (configuredSecret) return configuredSecret

  const { hostname } = new URL(requestUrl)
  if (hostname === '127.0.0.1' || hostname === 'localhost') {
    return 'local-dev-secret'
  }

  return configuredSecret
}

export const requireAuth = createMiddleware<{ Bindings: Env } & AuthContext>(
  async (c, next) => {
    const token = getCookie(c, 'session')
    if (!token) return c.json({ error: 'Unauthorized' }, 401)

    try {
      const secret = new TextEncoder().encode(resolveJwtSecret(c.req.url, c.env.JWT_SECRET))
      const { payload } = await jwtVerify(token, secret)

      const tg = payload.tg
      if (typeof tg !== 'number') return c.json({ error: 'Unauthorized' }, 401)

      const user = await getUserByTelegramId(c.env.DB, tg)
      if (!user) return c.json({ error: 'User not found' }, 404)

      c.set('user', user)
      c.set('userId', user.id)
      await next()
    } catch {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }
)
