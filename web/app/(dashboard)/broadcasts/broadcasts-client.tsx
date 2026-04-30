'use client'

import nextDynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'
import {
  type Broadcast,
  type BroadcastActionResult,
  type BroadcastCreateResult,
  type BroadcastFormPayload,
  type BroadcastLog,
  type BroadcastLogsResponse,
  type BroadcastProgressResponse,
  type Lead,
  type Project,
  type TgAccount,
  DEFAULT_BROADCAST_FORM,
  buildBroadcastFormFromRecord,
  normalizeBroadcastForm,
} from '@/lib/types'

const BroadcastDetailsPanel = nextDynamic(
  () => import('./broadcast-details-panel').then((mod) => mod.BroadcastDetailsPanel),
  {
    loading: () => <div className="rounded-lg border p-4 text-sm text-gray-400">Загрузка прогресса...</div>,
  }
)

const BroadcastsListSection = nextDynamic(
  () => import('./broadcasts-list-section').then((mod) => mod.BroadcastsListSection),
  {
    loading: () => (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Список рассылок</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-400">Загрузка рассылок...</div>
        </CardContent>
      </Card>
    ),
  }
)

const BroadcastFormCard = nextDynamic(
  () => import('./broadcast-form-card').then((mod) => mod.BroadcastFormCard),
  {
    loading: () => (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Новая рассылка</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-10 rounded-md border bg-muted/40" />
            <div className="grid gap-3 sm:grid-cols-2"><div className="h-10 rounded-md border bg-muted/40" /><div className="h-10 rounded-md border bg-muted/40" /></div>
            <div className="h-24 rounded-md border bg-muted/40" />
            <div className="h-20 rounded-md border bg-muted/40" />
          </div>
        </CardContent>
      </Card>
    ),
  }
)

type BroadcastsClientProps = {
  broadcasts: Broadcast[]
  projects: Project[]
  accounts: TgAccount[]
  leads: Lead[]
  initialActiveId: number | null
  initialProgress: BroadcastProgressResponse | null
  initialLogs: BroadcastLog[]
  initialError: string | null
}

type ProgressState = Record<number, BroadcastProgressResponse | undefined>
type LogsState = Record<number, BroadcastLog[] | undefined>

export function BroadcastsClient({
  broadcasts,
  projects,
  accounts,
  leads,
  initialActiveId,
  initialProgress,
  initialLogs,
  initialError,
}: BroadcastsClientProps) {
  const [items, setItems] = useState(broadcasts)
  const [draft, setDraft] = useState<BroadcastFormPayload>(DEFAULT_BROADCAST_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [activeId, setActiveId] = useState<number | null>(initialActiveId)
  const [showAccounts, setShowAccounts] = useState(false)
  const [showMessages, setShowMessages] = useState(false)
  const [showFollowups, setShowFollowups] = useState(false)
  const [progressById, setProgressById] = useState<ProgressState>(
    initialActiveId !== null && initialProgress ? { [initialActiveId]: initialProgress } : {}
  )
  const [logsById, setLogsById] = useState<LogsState>(initialActiveId !== null ? { [initialActiveId]: initialLogs } : {})
  const [loadingDetails, setLoadingDetails] = useState(false)

  const activeBroadcast = items.find((broadcast) => broadcast.id === activeId) ?? null
  const activeProgress = activeId ? progressById[activeId] : undefined
  const activeLogs = activeId ? logsById[activeId] ?? [] : []

  const eligibleAccounts = useMemo(
    () => accounts.filter((account) => ['active', 'warming', 'warmed'].includes(account.status)),
    [accounts]
  )

  const draftLeadCount = useMemo(() => {
    if (draft.project_id === null) return leads.length
    return leads.filter((lead) => lead.project_id === draft.project_id).length
  }, [draft.project_id, leads])

  async function loadDetails(broadcastId: number) {
    setLoadingDetails(true)
    try {
      const [progress, logs] = await Promise.all([
        apiFetch<BroadcastProgressResponse>(`/broadcasts/${broadcastId}/progress`),
        apiFetch<BroadcastLogsResponse>(`/broadcasts/${broadcastId}/logs`),
      ])
      setProgressById((current) => ({ ...current, [broadcastId]: progress }))
      setLogsById((current) => ({ ...current, [broadcastId]: logs.logs }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить детали рассылки')
    } finally {
      setLoadingDetails(false)
    }
  }

  const selectBroadcast = (broadcastId: number) => {
    setActiveId(broadcastId)
    if (!progressById[broadcastId] || !logsById[broadcastId]) {
      void loadDetails(broadcastId)
    }
  }

  const resetForm = () => {
    setDraft(DEFAULT_BROADCAST_FORM)
    setEditingId(null)
    setShowAccounts(false)
    setShowMessages(false)
    setShowFollowups(false)
  }

  const startEdit = (broadcast: Broadcast) => {
    setDraft(buildBroadcastFormFromRecord(broadcast, broadcast.account_ids ?? []))
    setEditingId(broadcast.id)
    setShowAccounts(true)
    setShowMessages(true)
    setShowFollowups(true)
    selectBroadcast(broadcast.id)
    setError(null)
  }

  const updateDraft = <K extends keyof BroadcastFormPayload>(key: K, value: BroadcastFormPayload[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const mergeBroadcast = (broadcastId: number, patch: Partial<Broadcast>) => {
    setItems((current) => current.map((broadcast) => (broadcast.id === broadcastId ? { ...broadcast, ...patch } : broadcast)))
  }

  const markBroadcastStatus = (broadcastId: number, status: Broadcast['status']) => {
    mergeBroadcast(broadcastId, {
      status,
      error: null,
      started_at: status === 'running' ? new Date().toISOString() : null,
      completed_at: status === 'running' ? null : undefined,
    })
  }

  const buildLocalBroadcast = (broadcastId: number, payload: BroadcastFormPayload): Broadcast => ({
    id: broadcastId,
    user_id: 0,
    project_id: payload.project_id,
    name: payload.name,
    status: 'draft',
    target_mode: payload.target_mode,
    message_variants_json: JSON.stringify(payload.message_variants),
    limits_json: JSON.stringify({
      daily_limit_per_account: payload.daily_limit_per_account,
      interval_min_seconds: payload.interval_min_seconds,
      interval_max_seconds: payload.interval_max_seconds,
    }),
    settings_json: JSON.stringify({
      followup_day3_enabled: payload.followup_day3_enabled,
      followup_day3_message: payload.followup_day3_message,
      followup_day7_enabled: payload.followup_day7_enabled,
      followup_day7_message: payload.followup_day7_message,
    }),
    account_ids: payload.account_ids,
    message_variants: payload.message_variants,
    limits: {
      daily_limit_per_account: payload.daily_limit_per_account,
      interval_min_seconds: payload.interval_min_seconds,
      interval_max_seconds: payload.interval_max_seconds,
    },
    settings: {
      followup_day3_enabled: payload.followup_day3_enabled,
      followup_day3_message: payload.followup_day3_message,
      followup_day7_enabled: payload.followup_day7_enabled,
      followup_day7_message: payload.followup_day7_message,
    },
    error: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
  })

  const updateMessageVariant = (index: number, value: string) => {
    setDraft((current) => ({
      ...current,
      message_variants: current.message_variants.map((item, itemIndex) => (itemIndex === index ? value : item)),
    }))
  }

  const toggleAccount = (accountId: number) => {
    setDraft((current) => ({
      ...current,
      account_ids: current.account_ids.includes(accountId)
        ? current.account_ids.filter((id) => id !== accountId)
        : [...current.account_ids, accountId],
    }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const payload = normalizeBroadcastForm(draft)
      if (editingId === null) {
        const response = await apiFetch<BroadcastCreateResult>('/broadcasts', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        const newBroadcast = buildLocalBroadcast(response.broadcast_id, payload)
        setProgressById((current) => ({
          ...current,
          [response.broadcast_id]: {
            broadcast: newBroadcast,
            summary: {
              leads_total: 0,
              total_events: 0,
              sent: 0,
              failed: 0,
              skipped: 0,
              followups_pending: 0,
              followups_cancelled: 0,
            },
            followups: [],
          },
        }))
        setLogsById((current) => ({ ...current, [response.broadcast_id]: [] }))
        setItems((current) => [newBroadcast, ...current])
        resetForm()
        setActiveId(response.broadcast_id)
      } else {
        await apiFetch<BroadcastActionResult>(`/broadcasts/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        mergeBroadcast(editingId, {
          name: payload.name,
          project_id: payload.project_id,
          target_mode: payload.target_mode,
          account_ids: payload.account_ids,
          message_variants_json: JSON.stringify(payload.message_variants),
          limits_json: JSON.stringify({
            daily_limit_per_account: payload.daily_limit_per_account,
            interval_min_seconds: payload.interval_min_seconds,
            interval_max_seconds: payload.interval_max_seconds,
          }),
          settings_json: JSON.stringify({
            followup_day3_enabled: payload.followup_day3_enabled,
            followup_day3_message: payload.followup_day3_message,
            followup_day7_enabled: payload.followup_day7_enabled,
            followup_day7_message: payload.followup_day7_message,
          }),
          message_variants: payload.message_variants,
          limits: {
            daily_limit_per_account: payload.daily_limit_per_account,
            interval_min_seconds: payload.interval_min_seconds,
            interval_max_seconds: payload.interval_max_seconds,
          },
          settings: {
            followup_day3_enabled: payload.followup_day3_enabled,
            followup_day3_message: payload.followup_day3_message,
            followup_day7_enabled: payload.followup_day7_enabled,
            followup_day7_message: payload.followup_day7_message,
          },
        })
        setProgressById((current) =>
          current[editingId]
            ? {
                ...current,
                [editingId]: {
                  ...current[editingId],
                  broadcast: {
                    ...current[editingId].broadcast,
                    ...buildLocalBroadcast(editingId, payload),
                    status: current[editingId].broadcast.status,
                    started_at: current[editingId].broadcast.started_at,
                    completed_at: current[editingId].broadcast.completed_at,
                    error: current[editingId].broadcast.error,
                    created_at: current[editingId].broadcast.created_at,
                  },
                },
              }
            : current
        )
        resetForm()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить рассылку')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStart = async (broadcastId: number) => {
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch<BroadcastActionResult>(`/broadcasts/${broadcastId}/start`, { method: 'POST' })
      markBroadcastStatus(broadcastId, 'running')
      await loadDetails(broadcastId)
    } catch (err) {
      markBroadcastStatus(broadcastId, 'error')
      setError(err instanceof Error ? err.message : 'Не удалось запустить рассылку')
      return
    } finally {
      setSubmitting(false)
    }
  }

  const handleStop = async (broadcastId: number) => {
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch<BroadcastActionResult>(`/broadcasts/${broadcastId}/stop`, { method: 'POST' })
      markBroadcastStatus(broadcastId, 'paused')
      await loadDetails(broadcastId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось остановить рассылку')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Broadcasts</h1>
          <p className="mt-1 text-sm text-gray-500">Собирайте outreach-рассылки, выбирайте аккаунты и следите за прогрессом без дублей.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm xl:min-w-[360px]">
          <MetricCard label="Рассылки" value={String(items.length)} />
          <MetricCard label="Лиды в базе" value={String(leads.length)} />
          <MetricCard label="Аккаунты sender" value={String(eligibleAccounts.length)} />
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[420px,1fr]">
        <BroadcastFormCard
          editingId={editingId}
          draft={draft}
          projects={projects}
          eligibleAccounts={eligibleAccounts}
          showAccounts={showAccounts}
          showMessages={showMessages}
          showFollowups={showFollowups}
          submitting={submitting}
          draftLeadCount={draftLeadCount}
          onSubmit={handleSubmit}
          onUpdateDraft={updateDraft}
          onToggleShowAccounts={() => setShowAccounts((current) => !current)}
          onToggleShowMessages={() => setShowMessages((current) => !current)}
          onToggleShowFollowups={() => setShowFollowups((current) => !current)}
          onToggleAccount={toggleAccount}
          onAddMessage={() => updateDraft('message_variants', [...draft.message_variants, ''])}
          onUpdateMessage={updateMessageVariant}
          onRemoveMessage={(index) =>
            updateDraft(
              'message_variants',
              draft.message_variants.filter((_, itemIndex) => itemIndex !== index)
            )
          }
          onReset={resetForm}
        />

        <div className="space-y-6">
          <BroadcastsListSection
            items={items}
            projects={projects}
            activeId={activeId}
            submitting={submitting}
            onSelect={selectBroadcast}
            onEdit={startEdit}
            onStart={(broadcastId) => void handleStart(broadcastId)}
            onStop={(broadcastId) => void handleStop(broadcastId)}
          />

          <BroadcastDetailsPanel
            activeBroadcast={activeBroadcast}
            activeProgress={activeProgress}
            activeLogs={activeLogs}
            loadingDetails={loadingDetails}
          />
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}
