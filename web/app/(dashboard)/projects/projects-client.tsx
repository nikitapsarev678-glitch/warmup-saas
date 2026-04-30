'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'
import type { Project } from '@/lib/types'

export function ProjectsClient({ projects }: { projects: Project[] }) {
  const [items, setItems] = useState(projects)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startCreate = () => {
    setCreating(true)
    setEditingId(null)
    setDraftName('')
    setError(null)
  }

  const startEdit = (project: Project) => {
    setCreating(false)
    setEditingId(project.id)
    setDraftName(project.name)
    setError(null)
  }

  const resetForm = () => {
    setCreating(false)
    setEditingId(null)
    setDraftName('')
    setError(null)
  }

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = draftName.trim()
    if (!name) return

    setSubmitting(true)
    setError(null)
    try {
      const response = await apiFetch<{ project_id: number }>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setItems((current) => [
        {
          id: response.project_id,
          name,
          created_at: new Date().toISOString(),
        } as Project,
        ...current,
      ])
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать проект')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = draftName.trim()
    if (!name || editingId === null) return

    setSubmitting(true)
    setError(null)
    try {
      await apiFetch(`/projects/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      })
      setItems((current) => current.map((project) => (project.id === editingId ? { ...project, name } : project)))
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить проект')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (projectId: number) => {
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch(`/projects/${projectId}`, {
        method: 'DELETE',
      })
      setItems((current) => current.filter((project) => project.id !== projectId))
      if (editingId === projectId) {
        resetForm()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить проект')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Проекты</h1>
          <p className="mt-1 text-sm text-gray-500">Группируйте аккаунты и кампании по клиентам, нишам или воронкам.</p>
        </div>
        {!creating && editingId === null ? <Button onClick={startCreate}>Создать проект</Button> : null}
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}

      {creating || editingId !== null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{creating ? 'Новый проект' : 'Редактировать проект'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={creating ? handleCreate : handleUpdate}>
              <Input
                placeholder="Например, Клиент / Апрельский прогрев"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting || !draftName.trim()}>
                  {submitting ? 'Сохраняю...' : creating ? 'Создать' : 'Сохранить'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>
                  Отмена
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="text-lg font-semibold">Нет проектов</div>
            <div className="mt-2 text-sm text-gray-500">Создайте первый проект, чтобы привязывать к нему аккаунты и кампании.</div>
            <Button className="mt-4" onClick={startCreate}>Создать проект</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((project) => (
            <Card key={project.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold">{project.name}</div>
                  <div className="mt-1 text-xs text-gray-400">Создан: {new Date(project.created_at).toLocaleString('ru-RU')}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => startEdit(project)} disabled={submitting}>
                    Редактировать
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(project.id)} disabled={submitting}>
                    Удалить
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
