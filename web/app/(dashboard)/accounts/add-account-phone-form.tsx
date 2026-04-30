'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Project } from '@/lib/types'

export function AddAccountPhoneEntryForm({
  phoneForCode,
  projectId,
  projects,
  submitting,
  onPhoneChange,
  onProjectChange,
  onSubmit,
}: {
  phoneForCode: string
  projectId: string
  projects: Project[]
  submitting: boolean
  onPhoneChange: (value: string) => void
  onProjectChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  const phoneDigits = phoneForCode.replace(/\D/g, '')
  const canSubmit = phoneDigits.length >= 10

  return (
    <form className="mt-4 space-y-4" onSubmit={onSubmit}>
      <div className="text-sm text-gray-500">Введите номер, затем дождитесь кода из Telegram и подтвердите его в этой же шторке.</div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Номер телефона</div>
        <Input placeholder="+79001234567" value={phoneForCode} onChange={(event) => onPhoneChange(event.target.value)} />
      </div>
      {!canSubmit ? <div className="text-sm text-muted-foreground">Введите корректный номер телефона, чтобы запросить код.</div> : null}
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
      <Button type="submit" className="w-full" disabled={submitting || !canSubmit}>
        {submitting ? 'Отправляю код...' : 'Отправить код'}
      </Button>
    </form>
  )
}

export function AddAccountCodeForm({
  code,
  submitting,
  canSubmit,
  helperText,
  onCodeChange,
  onSubmit,
}: {
  code: string
  submitting: boolean
  canSubmit: boolean
  helperText: string | null
  onCodeChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form className="mt-4 space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <div className="text-sm font-medium">Код из Telegram</div>
        <Input placeholder="12345" value={code} onChange={(event) => onCodeChange(event.target.value)} />
      </div>
      {helperText ? <div className="text-sm text-muted-foreground">{helperText}</div> : null}
      <Button type="submit" className="w-full" disabled={submitting || !canSubmit}>
        {submitting ? 'Проверяю код...' : 'Подтвердить код'}
      </Button>
    </form>
  )
}

export function AddAccountPasswordForm({
  password,
  submitting,
  onPasswordChange,
  onSubmit,
}: {
  password: string
  submitting: boolean
  onPasswordChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form className="mt-4 space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <div className="text-sm font-medium">Пароль 2FA</div>
        <Input type="password" placeholder="Введите пароль" value={password} onChange={(event) => onPasswordChange(event.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={submitting || password.trim().length === 0}>
        {submitting ? 'Проверяю пароль...' : 'Подтвердить пароль'}
      </Button>
    </form>
  )
}
