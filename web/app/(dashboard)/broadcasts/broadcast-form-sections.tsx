'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BroadcastFormPayload, TgAccount } from '@/lib/types'
import { getAccountDisplayName } from '@/lib/types'

export function AccountsSection({
  eligibleAccounts,
  selectedAccountIds,
  show,
  onToggleShow,
  onToggleAccount,
}: {
  eligibleAccounts: TgAccount[]
  selectedAccountIds: number[]
  show: boolean
  onToggleShow: () => void
  onToggleAccount: (accountId: number) => void
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <button type="button" onClick={onToggleShow} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-medium text-gray-600">Аккаунты-отправители</span>
        <span className="text-xs text-gray-400">
          {selectedAccountIds.length} выбрано • {show ? 'Скрыть' : 'Показать'}
        </span>
      </button>
      {show ? (
        <div className="grid gap-2">
          {eligibleAccounts.map((account) => {
            const checked = selectedAccountIds.includes(account.id)
            return (
              <label key={account.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <input type="checkbox" checked={checked} onChange={() => onToggleAccount(account.id)} />
                <span className="font-medium">{getAccountDisplayName(account)}</span>
                <span className="text-gray-400">{account.phone}</span>
              </label>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function MessagesSection({
  messages,
  show,
  onToggleShow,
  onAddMessage,
  onUpdateMessage,
  onRemoveMessage,
}: {
  messages: string[]
  show: boolean
  onToggleShow: () => void
  onAddMessage: () => void
  onUpdateMessage: (index: number, value: string) => void
  onRemoveMessage: (index: number) => void
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onToggleShow} className="flex flex-1 items-center justify-between text-left">
          <span className="text-sm font-medium text-gray-600">Сообщения</span>
          <span className="text-xs text-gray-400">
            {messages.length} вариантов • {show ? 'Скрыть' : 'Показать'}
          </span>
        </button>
        {show ? (
          <Button type="button" variant="outline" size="sm" onClick={onAddMessage}>
            Добавить вариант
          </Button>
        ) : null}
      </div>
      {show ? (
        <div className="space-y-2">
          {messages.map((message, index) => (
            <div key={index} className="space-y-2">
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
                placeholder={`Вариант ${index + 1}`}
                value={message}
                onChange={(event) => onUpdateMessage(index, event.target.value)}
              />
              {messages.length > 1 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onRemoveMessage(index)}>
                  Удалить вариант
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function FollowupsSection({
  draft,
  show,
  onToggleShow,
  onUpdateDraft,
}: {
  draft: BroadcastFormPayload
  show: boolean
  onToggleShow: () => void
  onUpdateDraft: <K extends keyof BroadcastFormPayload>(key: K, value: BroadcastFormPayload[K]) => void
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <button type="button" onClick={onToggleShow} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-medium text-gray-600">Follow-up</span>
        <span className="text-xs text-gray-400">{show ? 'Скрыть' : 'Показать'}</span>
      </button>
      {show ? (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.followup_day3_enabled}
              onChange={(event) => onUpdateDraft('followup_day3_enabled', event.target.checked)}
            />
            День 3
          </label>
          <textarea
            className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
            placeholder="Сообщение follow-up day 3"
            value={draft.followup_day3_message ?? ''}
            onChange={(event) => onUpdateDraft('followup_day3_message', event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.followup_day7_enabled}
              onChange={(event) => onUpdateDraft('followup_day7_enabled', event.target.checked)}
            />
            День 7
          </label>
          <textarea
            className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
            placeholder="Сообщение follow-up day 7"
            value={draft.followup_day7_message ?? ''}
            onChange={(event) => onUpdateDraft('followup_day7_message', event.target.value)}
          />
        </>
      ) : null}
    </div>
  )
}

export function LimitsSection({
  draft,
  onUpdateDraft,
}: {
  draft: BroadcastFormPayload
  onUpdateDraft: <K extends keyof BroadcastFormPayload>(key: K, value: BroadcastFormPayload[K]) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-2 text-sm text-gray-600">
        <span>Лимит / день</span>
        <Input
          type="number"
          min={1}
          max={500}
          value={draft.daily_limit_per_account}
          onChange={(event) => onUpdateDraft('daily_limit_per_account', Number(event.target.value) || 0)}
        />
      </label>
      <label className="space-y-2 text-sm text-gray-600">
        <span>Интервал min</span>
        <Input
          type="number"
          min={1}
          value={draft.interval_min_seconds}
          onChange={(event) => onUpdateDraft('interval_min_seconds', Number(event.target.value) || 0)}
        />
      </label>
      <label className="space-y-2 text-sm text-gray-600">
        <span>Интервал max</span>
        <Input
          type="number"
          min={draft.interval_min_seconds}
          value={draft.interval_max_seconds}
          onChange={(event) => onUpdateDraft('interval_max_seconds', Number(event.target.value) || 0)}
        />
      </label>
    </div>
  )
}
