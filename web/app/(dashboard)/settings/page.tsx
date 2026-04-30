'use server'

import { revalidatePath } from 'next/cache'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { serverApiFetch, serverApiFetchSafe } from '@/lib/server-api'
import type {
  FeatureFlags,
  NotificationSettings,
  NotificationSettingsResponse,
  NotificationSettingsUpdateResponse,
  RunnerErrorLog,
  RunnerErrorsResponse,
} from '@/lib/types'
import {
  formatRunnerErrorDate,
  getRunnerActionLabel,
  getRunnerErrorCta,
  getRunnerErrorHint,
  getRunnerErrorListLimitLabel,
  getRunnerErrorSeverityLabel,
  getRunnerErrorSeverityVariant,
  getSettingsEmptyErrorsState,
  getSettingsRunnerErrorHint,
  getSettingsRunnerErrorTitle,
} from '@/lib/types'

const DEFAULT_SETTINGS: NotificationSettings = {
  tokens_zero_enabled: true,
  account_spam_block_enabled: true,
  account_banned_enabled: true,
  batch_check_complete_enabled: true,
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  ai_parsing_enabled: true,
  ai_dialogs_enabled: true,
  group_broadcasts_enabled: true,
}

async function getSettings(): Promise<{ settings: NotificationSettings; featureFlags: FeatureFlags }> {
  const result = await serverApiFetchSafe<NotificationSettingsResponse>('/notifications/settings')
  return result.ok
    ? { settings: result.data.settings, featureFlags: result.data.feature_flags }
    : { settings: DEFAULT_SETTINGS, featureFlags: DEFAULT_FEATURE_FLAGS }
}

async function getRunnerErrors(): Promise<RunnerErrorLog[]> {
  const result = await serverApiFetchSafe<RunnerErrorsResponse>('/notifications/runner-errors')
  return result.ok ? result.data.errors : []
}

async function updateSettings(formData: FormData) {
  'use server'

  const payload: NotificationSettings & FeatureFlags = {
    tokens_zero_enabled: formData.get('tokens_zero_enabled') === 'on',
    account_spam_block_enabled: formData.get('account_spam_block_enabled') === 'on',
    account_banned_enabled: formData.get('account_banned_enabled') === 'on',
    batch_check_complete_enabled: formData.get('batch_check_complete_enabled') === 'on',
    ai_parsing_enabled: formData.get('ai_parsing_enabled') === 'on',
    ai_dialogs_enabled: formData.get('ai_dialogs_enabled') === 'on',
    group_broadcasts_enabled: formData.get('group_broadcasts_enabled') === 'on',
  }

  await serverApiFetch<NotificationSettingsUpdateResponse>('/notifications/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  revalidatePath('/settings')
}

export default async function SettingsPage() {
  const [{ settings, featureFlags }, runnerErrors] = await Promise.all([getSettings(), getRunnerErrors()])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Настройки уведомлений</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Управляйте Telegram-уведомлениями по ключевым событиям прогрева и рассылок.
        </p>
      </div>

      <Card className="max-w-3xl p-6">
        <form action={updateSettings} className="space-y-5">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Telegram-уведомления</h2>
              <p className="text-sm text-muted-foreground">
                Настройте, о каких событиях прогрева и рассылок система должна сообщать автоматически.
              </p>
            </div>
            <NotificationToggle
              name="tokens_zero_enabled"
              title="Токены закончились"
              description="Сообщение придёт, когда баланс опустится до нуля и активные задачи будут поставлены на паузу."
              defaultChecked={settings.tokens_zero_enabled}
            />
            <NotificationToggle
              name="account_spam_block_enabled"
              title="Spam block"
              description="Уведомление придёт, если аккаунт словит временное ограничение и уйдёт в паузу."
              defaultChecked={settings.account_spam_block_enabled}
            />
            <NotificationToggle
              name="account_banned_enabled"
              title="Блокировка аккаунта"
              description="Уведомление о бане аккаунта с рекомендацией проверить активные задачи."
              defaultChecked={settings.account_banned_enabled}
            />
            <NotificationToggle
              name="batch_check_complete_enabled"
              title="Итог batch-check"
              description="Сводка по количеству активных, прогреваемых и проблемных аккаунтов после batch-check."
              defaultChecked={settings.batch_check_complete_enabled}
            />
          </div>

          <div className="space-y-4 border-t border-border/60 pt-5">
            <div>
              <h2 className="text-lg font-semibold">Канареечные фичи</h2>
              <p className="text-sm text-muted-foreground">
                Эти переключатели позволяют быстро отключить чувствительные возможности без нового деплоя, если нужно остановить регресс или канареечный rollout.
              </p>
            </div>
            <NotificationToggle
              name="ai_parsing_enabled"
              title="AI-парсинг"
              description="Если выключить, новые parsing job не стартуют и UI подскажет использовать ручной импорт лидов."
              defaultChecked={featureFlags.ai_parsing_enabled}
            />
            <NotificationToggle
              name="ai_dialogs_enabled"
              title="AI-диалоги"
              description="Если выключить, кампании с AI-диалогами перестанут запускаться до повторного включения."
              defaultChecked={featureFlags.ai_dialogs_enabled}
            />
            <NotificationToggle
              name="group_broadcasts_enabled"
              title="Группы и каналы"
              description="Если выключить, рассылки в группы и каналы будут заблокированы, а DM-режим останется доступен."
              defaultChecked={featureFlags.group_broadcasts_enabled}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">Сохранение применяется сразу</p>
              <p className="text-muted-foreground">Изменения влияют только на текущего пользователя и помогают быстро остановить проблемную фичу без деплоя.</p>
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Сохранить
            </button>
          </div>
        </form>
      </Card>

      <Card className="max-w-5xl">
        <CardHeader>
          <CardTitle>{getSettingsRunnerErrorTitle(runnerErrors.length)}</CardTitle>
          <CardDescription>
            {getSettingsRunnerErrorHint()} {getRunnerErrorListLimitLabel()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runnerErrors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              {getSettingsEmptyErrorsState()}
            </div>
          ) : (
            <div className="space-y-3">
              {runnerErrors.map((error) => (
                <div key={error.id} className="rounded-xl border border-border/60 px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{getRunnerActionLabel(error.action)}</span>
                        <span
                          className={
                            getRunnerErrorSeverityVariant(error.error) === 'destructive'
                              ? 'rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
                              : getRunnerErrorSeverityVariant(error.error) === 'secondary'
                                ? 'rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700'
                                : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                          }
                        >
                          {getRunnerErrorSeverityLabel(error.error)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">{error.error}</p>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>Когда: {formatRunnerErrorDate(error.created_at)}</p>
                        <p>Что делать: {getRunnerErrorHint(error.action)}</p>
                        <p>CTA: {getRunnerErrorCta(error.action)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function NotificationToggle({
  name,
  title,
  description,
  defaultChecked,
}: {
  name: keyof (NotificationSettings & FeatureFlags)
  title: string
  description: string
  defaultChecked: boolean
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-border/60 px-4 py-4">
      <div className="space-y-1">
        <div className="font-medium">{title}</div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-5 w-5 rounded border border-input bg-background accent-primary"
      />
    </label>
  )
}
