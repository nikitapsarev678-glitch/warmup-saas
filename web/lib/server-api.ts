import { cookies } from 'next/headers'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

export class ServerApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ServerApiError'
    this.status = status
  }
}

export async function serverApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieHeader = (await cookies()).toString()
  const headers = new Headers(init?.headers)

  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (cookieHeader) {
    headers.set('Cookie', cookieHeader)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: init?.cache ?? 'no-store',
  })

  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()

  if (!res.ok) {
    let message = `API error ${res.status}`

    if (text) {
      try {
        const data = JSON.parse(text) as {
          error?: string
          reason?: string
          message?: string
        }
        message = data.error ?? data.reason ?? data.message ?? message
      } catch {
        message = text || message
      }
    }

    throw new ServerApiError(message, res.status)
  }

  if (!text) {
    return undefined as T
  }

  if (contentType.includes('application/json')) {
    return JSON.parse(text) as T
  }

  return text as T
}

export async function serverApiFetchSafe<T>(path: string, init?: RequestInit) {
  try {
    const data = await serverApiFetch<T>(path, init)
    return {
      data,
      error: null,
      ok: true as const,
    }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Request failed',
      ok: false as const,
    }
  }
}
