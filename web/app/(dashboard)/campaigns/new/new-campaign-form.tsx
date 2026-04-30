'use client'

import nextDynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'
import type { Project } from '@/lib/types'

const AI_DELAY_PRESETS = [
  { key: 'instant', label: 'Моментально', min: 2, max: 5 },
  { key: 'fast', label: 'Быстро', min: 5, max: 15 },
  { key: 'medium', label: 'Среднее', min: 15, max: 45 },
  { key: 'slow', label: 'Медленно', min: 45, max: 90 },
  { key: 'very_slow', label: 'Очень медленно', min: 120, max: 300 },
  { key: 'max', label: 'Максимум', min: 300, max: 600 },
] as const

const AI_DELAY_MAP = Object.fromEntries(AI_DELAY_PRESETS.map((preset) => [preset.key, { min: preset.min, max: preset.max }]))

const LazyAiSettingsPanel = nextDynamic(
  () => import('./ai-settings-panel').then((mod) => mod.AiSettingsPanel),
  {
    loading: () => <div className="rounded-lg border p-4 text-sm text-gray-400">Загрузка AI-настроек...</div>,
  }
)

const LazyWarmupActionsPanel = nextDynamic(
  () => import('./warmup-actions-panel').then((mod) => mod.WarmupActionsPanel),
  {
    loading: () => <div className="rounded-lg border p-4 text-sm text-gray-400">Загрузка действий прогрева...</div>,
  }
)

const DEFAULT_ACTIONS = {
  join_groups: true,
  read_messages: true,
  reactions: true,
  dialogs: true,
  story_views: true,
  profile_setup: true,
}

export function NewCampaignForm({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [warmupDays, setWarmupDays] = useState(14)
  const [dailyMin, setDailyMin] = useState(5)
  const [dailyMax, setDailyMax] = useState(15)
  const [delayMin, setDelayMin] = useState(60)
  const [delayMax, setDelayMax] = useState(300)
  const [workStart, setWorkStart] = useState(9)
  const [workEnd, setWorkEnd] = useState(22)
  const [usePoolDialogs, setUsePoolDialogs] = useState(true)
  const [actions, setActions] = useState(DEFAULT_ACTIONS)
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiTopics, setAiTopics] = useState<string[]>(['daily_life'])
  const [aiMode, setAiMode] = useState<'1_to_1' | '1_to_n'>('1_to_n')
  const [aiDelayPreset, setAiDelayPreset] = useState<string>('medium')
  const [aiMessagesPerAccount, setAiMessagesPerAccount] = useState(20)
  const [aiDialogsPerDay, setAiDialogsPerDay] = useState(10)
  const [aiSeriesMin, setAiSeriesMin] = useState(1)
  const [aiSeriesMax, setAiSeriesMax] = useState(3)
  const [aiReplyPct, setAiReplyPct] = useState(25)

  const toggleTopic = (topic: string) => {
    setAiTopics((prev) => {
      if (prev.includes(topic)) {
        const next = prev.filter((item) => item !== topic)
        return next.length > 0 ? next : prev
      }
      return [...prev, topic]
    })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    try {
      const preset = AI_DELAY_MAP[aiDelayPreset as keyof typeof AI_DELAY_MAP] ?? AI_DELAY_MAP.medium
      const res = await apiFetch<{ campaign_id: number }>('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name,
          project_id: projectId ? Number(projectId) : null,
          warmup_days: warmupDays,
          daily_actions_min: dailyMin,
          daily_actions_max: dailyMax,
          delay_between_actions_min: delayMin,
          delay_between_actions_max: delayMax,
          work_hour_start: workStart,
          work_hour_end: workEnd,
          use_pool_dialogs: usePoolDialogs ? 1 : 0,
          actions_config: actions,
          account_ids: [],
          ai_dialog_enabled: aiEnabled ? 1 : 0,
          ai_topics: aiTopics,
          ai_mode: aiMode,
          ai_delay_preset: aiDelayPreset,
          ai_delay_min: preset.min,
          ai_delay_max: preset.max,
          ai_messages_per_account: aiMessagesPerAccount,
          ai_dialogs_per_day: aiDialogsPerDay,
          ai_series_min: aiSeriesMin,
          ai_series_max: aiSeriesMax,
          ai_reply_pct: aiReplyPct,
          ai_delete_messages: 0,
        }),
      })

      router.push(`/campaigns/${res.campaign_id}/progress`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Новая кампания прогрева</h1>
        <p className="mt-1 text-sm text-gray-500">Настройте интенсивность, окна работы и типы действий.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Основное</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Название кампании">
              <Input placeholder="Мой прогрев #1" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Проект">
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Без проекта</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Дней прогрева: ${warmupDays}`}>
              <Input
                type="range"
                min={3}
                max={60}
                value={warmupDays}
                onChange={(e) => setWarmupDays(Number(e.target.value))}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Интенсивность</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Минимум действий в день">
              <Input type="number" min={2} max={30} value={dailyMin} onChange={(e) => setDailyMin(Number(e.target.value))} />
            </Field>
            <Field label="Максимум действий в день">
              <Input type="number" min={2} max={50} value={dailyMax} onChange={(e) => setDailyMax(Number(e.target.value))} />
            </Field>
            <Field label="Минимальная задержка (сек)">
              <Input type="number" min={10} value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} />
            </Field>
            <Field label="Максимальная задержка (сек)">
              <Input type="number" min={30} value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value))} />
            </Field>
            <Field label="Начало окна (МСК)">
              <Input type="number" min={0} max={23} value={workStart} onChange={(e) => setWorkStart(Number(e.target.value))} />
            </Field>
            <Field label="Конец окна (МСК)">
              <Input type="number" min={0} max={23} value={workEnd} onChange={(e) => setWorkEnd(Number(e.target.value))} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Действия прогрева</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <LazyWarmupActionsPanel
              actions={actions}
              setActions={setActions}
              usePoolDialogs={usePoolDialogs}
              setUsePoolDialogs={setUsePoolDialogs}
            />
          </CardContent>
        </Card>

        <LazyAiSettingsPanel
          aiEnabled={aiEnabled}
          setAiEnabled={setAiEnabled}
          aiTopics={aiTopics}
          toggleTopic={toggleTopic}
          aiMode={aiMode}
          setAiMode={setAiMode}
          aiDelayPreset={aiDelayPreset}
          setAiDelayPreset={setAiDelayPreset}
          aiMessagesPerAccount={aiMessagesPerAccount}
          setAiMessagesPerAccount={setAiMessagesPerAccount}
          aiDialogsPerDay={aiDialogsPerDay}
          setAiDialogsPerDay={setAiDialogsPerDay}
          aiSeriesMin={aiSeriesMin}
          setAiSeriesMin={setAiSeriesMin}
          aiSeriesMax={aiSeriesMax}
          setAiSeriesMax={setAiSeriesMax}
          aiReplyPct={aiReplyPct}
          setAiReplyPct={setAiReplyPct}
        />

        <Button type="submit" disabled={loading || !name.trim()} className="w-full">
          {loading ? 'Создаю...' : 'Создать кампанию'}
        </Button>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-gray-700">{label}</div>
      {children}
    </div>
  )
}
