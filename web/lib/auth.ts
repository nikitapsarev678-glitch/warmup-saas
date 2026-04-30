import { cache } from 'react'

import { apiFetch } from './api'
import { serverApiFetchSafe } from './server-api'
import type { SaasUser } from './types'

export const getMe = cache(async (): Promise<SaasUser | null> => {
  const result = await serverApiFetchSafe<{ user: SaasUser }>('/auth/me')
  return result.ok ? result.data.user : null
})

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' })
}
