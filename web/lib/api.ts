const API_BASE = '/api'

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
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

    throw new Error(message)
  }

  if (!text) {
    return undefined as T
  }

  if (contentType.includes('application/json')) {
    return JSON.parse(text) as T
  }

  return text as T
}
