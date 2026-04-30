'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { AccountImportJob, AccountImportSourceType, Project } from '@/lib/types'
import { apiFetch } from '@/lib/api'

type ImportStep = 'idle' | 'uploading' | 'queued' | 'finished'

const SOURCE_OPTIONS: Array<{ value: AccountImportSourceType; label: string; description: string }> = [
  {
    value: 'tdata_zip',
    label: 'TData ZIP',
    description: 'Основной путь для уже залогиненных аккаунтов Telegram Desktop.',
  },
  {
    value: 'session_json_zip',
    label: 'Session+JSON ZIP',
    description: 'Архив с JSON-файлами, где уже есть session_string и phone.',
  },
  {
    value: 'string_session_txt',
    label: 'StringSession TXT',
    description: 'Текстовый файл со строками вида phone|session_string.',
  },
]

export function ImportAccountsDialog({
  projects,
  onImported,
}: {
  projects: Project[]
  onImported?: () => Promise<void> | void
}) {
  const pollTimerRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [sourceType, setSourceType] = useState<AccountImportSourceType>('tdata_zip')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [step, setStep] = useState<ImportStep>('idle')
  const [job, setJob] = useState<AccountImportJob | null>(null)

  const sourceDescription = useMemo(
    () => SOURCE_OPTIONS.find((option) => option.value === sourceType)?.description ?? '',
    [sourceType]
  )

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current)
      }
    }
  }, [])

  const resetState = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current)
      }
      setProjectId('')
      setSourceType('tdata_zip')
      setFile(null)
      setError(null)
      setIsSubmitting(false)
      setStep('idle')
      setJob(null)
    }
  }

  const pollJob = async (jobId: number) => {
    try {
      const data = await apiFetch<{ job: AccountImportJob }>(`/accounts/import/${jobId}`)
      setJob(data.job)

      if (data.job.status === 'queued' || data.job.status === 'running' || data.job.status === 'uploaded') {
        pollTimerRef.current = window.setTimeout(() => {
          void pollJob(jobId)
        }, 2500)
        setStep('queued')
        return
      }

      setStep('finished')
      if (data.job.status === 'done') {
        await onImported?.()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось получить статус импорта')
      setStep('finished')
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!file) {
      setError('Выберите ZIP-файл для импорта')
      return
    }

    setIsSubmitting(true)
    setStep('uploading')

    try {
      const init = await apiFetch<{ job_id: number; upload_url: string }>('/accounts/import/init', {
        method: 'POST',
        body: JSON.stringify({
          source_type: sourceType,
          project_id: projectId ? Number(projectId) : null,
        }),
      })

      const uploadResponse = await fetch(init.upload_url, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': file.type || 'application/zip',
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        const uploadError = await readError(uploadResponse)
        throw new Error(uploadError || `Upload failed with ${uploadResponse.status}`)
      }

      await apiFetch(`/accounts/import/${init.job_id}/commit`, {
        method: 'POST',
      })

      setStep('queued')
      await pollJob(init.job_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить импорт')
      setStep('finished')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={resetState}>
      <SheetTrigger render={<Button variant="outline" />}>Импорт аккаунтов</SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Импорт аккаунтов</SheetTitle>
          <SheetDescription>
            Загрузите архив с уже подготовленными Telegram-сессиями и дождитесь результата обработки.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <div className="text-sm font-medium">Проект</div>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Без проекта</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Формат импорта</div>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value as AccountImportSourceType)}
                disabled={isSubmitting}
              >
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="text-xs text-muted-foreground">{sourceDescription}</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">ZIP-архив</div>
              <Input
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={isSubmitting}
              />
              <div className="text-xs text-muted-foreground">
                Для TData загрузите ZIP с папкой <code>tdata</code> внутри.
              </div>
            </div>

            {error ? (
              <div className="rounded-[1rem] border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {job ? (
              <div className="workspace-section p-4 text-sm">
                <div className="font-medium">Статус: {translateStatus(job.status)}</div>
                {job.error ? <div className="mt-2 text-red-600">{job.error}</div> : null}
                {job.action ? (
                  <div className="mt-2 text-amber-700">
                    Требуется действие: {formatAction(job.action)}
                  </div>
                ) : null}
                {job.stats && typeof job.stats === 'object' && !Array.isArray(job.stats) ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <Stat label="Найдено" value={readStat(job.stats, 'found')} />
                    <Stat label="Импортировано" value={readStat(job.stats, 'imported')} />
                    <Stat label="Ошибки" value={readStat(job.stats, 'errors')} />
                    <Stat label="Пропущено" value={readStat(job.stats, 'skipped')} />
                  </div>
                ) : null}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {buttonLabel(step, isSubmitting)}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function buttonLabel(step: ImportStep, isSubmitting: boolean): string {
  if (isSubmitting && step === 'uploading') return 'Загружаю архив...'
  if (step === 'queued') return 'Импорт выполняется...'
  if (step === 'finished') return 'Запустить ещё раз'
  return 'Запустить импорт'
}

function translateStatus(status: AccountImportJob['status']): string {
  switch (status) {
    case 'pending':
      return 'ожидает загрузки'
    case 'uploaded':
      return 'архив загружен'
    case 'queued':
      return 'в очереди'
    case 'running':
      return 'выполняется'
    case 'action_required':
      return 'нужно действие'
    case 'done':
      return 'готово'
    case 'error':
      return 'ошибка'
  }
}

function readStat(stats: object, key: string): number {
  const value = (stats as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : 0
}

function formatAction(action: unknown): string {
  if (!action || typeof action !== 'object') return 'Проверьте входные данные.'
  const record = action as Record<string, unknown>
  return typeof record.hint === 'string' ? record.hint : 'Проверьте входные данные.'
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="workspace-section px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
    </div>
  )
}

async function readError(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as { error?: string }
    return payload.error ?? null
  } catch {
    return null
  }
}
