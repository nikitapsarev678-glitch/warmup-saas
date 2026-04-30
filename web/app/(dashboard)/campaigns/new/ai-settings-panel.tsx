'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const AI_TOPICS = [
  { key: 'daily_life', label: 'Повседневная жизнь' },
  { key: 'work', label: 'Работа и дела' },
  { key: 'hobbies', label: 'Хобби' },
  { key: 'free_chat', label: 'Свободное общение' },
] as const

const AI_MODES = [
  { key: '1_to_1', label: '1 к 1 (пары)' },
  { key: '1_to_n', label: '1 ко N (случайно)' },
] as const

const AI_DELAY_PRESETS = [
  { key: 'instant', label: 'Моментально' },
  { key: 'fast', label: 'Быстро' },
  { key: 'medium', label: 'Среднее' },
  { key: 'slow', label: 'Медленно' },
  { key: 'very_slow', label: 'Очень медленно' },
  { key: 'max', label: 'Максимум' },
] as const

type AiMode = '1_to_1' | '1_to_n'

type AiSettingsPanelProps = {
  aiEnabled: boolean
  setAiEnabled: (value: boolean) => void
  aiTopics: string[]
  toggleTopic: (topic: string) => void
  aiMode: AiMode
  setAiMode: (value: AiMode) => void
  aiDelayPreset: string
  setAiDelayPreset: (value: string) => void
  aiMessagesPerAccount: number
  setAiMessagesPerAccount: (value: number) => void
  aiDialogsPerDay: number
  setAiDialogsPerDay: (value: number) => void
  aiSeriesMin: number
  setAiSeriesMin: (value: number) => void
  aiSeriesMax: number
  setAiSeriesMax: (value: number) => void
  aiReplyPct: number
  setAiReplyPct: (value: number) => void
}

export function AiSettingsPanel({
  aiEnabled,
  setAiEnabled,
  aiTopics,
  toggleTopic,
  aiMode,
  setAiMode,
  aiDelayPreset,
  setAiDelayPreset,
  aiMessagesPerAccount,
  setAiMessagesPerAccount,
  aiDialogsPerDay,
  setAiDialogsPerDay,
  aiSeriesMin,
  setAiSeriesMin,
  aiSeriesMax,
  setAiSeriesMax,
  aiReplyPct,
  setAiReplyPct,
}: AiSettingsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">AI Прогрев</CardTitle>
            <p className="mt-1 text-xs text-gray-500">OpenRouter генерирует реалистичные диалоги. Требует AI-токены.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <span>{aiEnabled ? 'Включён' : 'Выключен'}</span>
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </div>
      </CardHeader>
      {aiEnabled ? (
        <CardContent className="space-y-5">
          <div>
            <div className="mb-2 text-sm font-medium text-gray-700">Тема общения</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {AI_TOPICS.map((topic) => {
                const active = aiTopics.includes(topic.key)
                return (
                  <button
                    key={topic.key}
                    type="button"
                    onClick={() => toggleTopic(topic.key)}
                    className={cn(
                      'rounded-lg border p-3 text-left text-sm transition-colors',
                      active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    {topic.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-gray-700">Режим взаимодействия</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {AI_MODES.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setAiMode(mode.key)}
                  className={cn(
                    'rounded-lg border p-3 text-center text-sm transition-colors',
                    aiMode === mode.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-gray-700">Пауза между сообщениями</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {AI_DELAY_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setAiDelayPreset(preset.key)}
                  className={cn(
                    'rounded-lg border p-2 text-center text-xs transition-colors',
                    aiDelayPreset === preset.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Сообщений на аккаунт">
              <Input
                type="number"
                min={5}
                max={200}
                value={aiMessagesPerAccount}
                onChange={(e) => setAiMessagesPerAccount(Number(e.target.value))}
              />
            </Field>
            <Field label="Диалогов в день">
              <Input
                type="number"
                min={1}
                max={30}
                value={aiDialogsPerDay}
                onChange={(e) => setAiDialogsPerDay(Number(e.target.value))}
              />
            </Field>
            <Field label="Серия: мин сообщений">
              <Input type="number" min={1} max={5} value={aiSeriesMin} onChange={(e) => setAiSeriesMin(Number(e.target.value))} />
            </Field>
            <Field label="Серия: макс сообщений">
              <Input type="number" min={1} max={10} value={aiSeriesMax} onChange={(e) => setAiSeriesMax(Number(e.target.value))} />
            </Field>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-gray-700">Процент reply: {aiReplyPct}%</div>
            <Input type="range" min={0} max={100} value={aiReplyPct} onChange={(e) => setAiReplyPct(Number(e.target.value))} />
          </div>
        </CardContent>
      ) : null}
    </Card>
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
