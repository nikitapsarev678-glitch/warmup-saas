import { cookies } from 'next/headers'
import type { Project } from '@/lib/types'
import { NewCampaignForm } from './new-campaign-form'

export const dynamic = 'force-dynamic'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

async function getProjects(): Promise<Project[]> {
  const cookieHeader = (await cookies()).toString()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (cookieHeader) {
    headers.Cookie = cookieHeader
  }

  const res = await fetch(`${API_BASE}/projects`, {
    headers,
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`Failed to load projects: ${res.status}`)
  }

  const data = (await res.json()) as { projects: Project[] }
  return data.projects
}

export default async function NewCampaignPage() {
  const projects = await getProjects()
  return <NewCampaignForm projects={projects} />
}
