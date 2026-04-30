'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Project } from '@/lib/types'

export function AddAccountSessionForm({
  phone,
  session,
  projectId,
  projects,
  submitting,
  onPhoneChange,
  onSessionChange,
  onProjectChange,
  onSubmit,
}: {
  phone: string
  session: string
  projectId: string
  projects: Project[]
  submitting: boolean
  onPhoneChange: (value: string) => void
  onSessionChange: (value: string) => void
  onProjectChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form className="mt-4 space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <div className="text-sm font-medium">Номер телефона</div>
        <Input placeholder="+79001234567" value={phone} onChange={(event) => onPhoneChange(event.target.value)} />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">StringSession</div>
        <Input placeholder="1BQANOTEuA..." value={session} onChange={(event) => onSessionChange(event.target.value)} />
        <div className="text-xs text-gray-400">Вставьте готовую строку сессии без дополнительных данных.</div>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Проект</div>
        <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs" value={projectId} onChange={(event) => onProjectChange(event.target.value)}>
          <option value="">Без проекта</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Добавляю...' : 'Добавить'}
      </Button>
    </form>
  )
}
