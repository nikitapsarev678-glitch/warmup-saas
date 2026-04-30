'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { BroadcastFormPayload, Project, TgAccount } from '@/lib/types'
import { AccountsSection, FollowupsSection, LimitsSection, MessagesSection } from './broadcast-form-sections'

export function BroadcastFormCard({
  editingId,
  draft,
  projects,
  eligibleAccounts,
  showAccounts,
  showMessages,
  showFollowups,
  submitting,
  draftLeadCount,
  onSubmit,
  onUpdateDraft,
  onToggleShowAccounts,
  onToggleShowMessages,
  onToggleShowFollowups,
  onToggleAccount,
  onAddMessage,
  onUpdateMessage,
  onRemoveMessage,
  onReset,
}: {
  editingId: number | null
  draft: BroadcastFormPayload
  projects: Project[]
  eligibleAccounts: TgAccount[]
  showAccounts: boolean
  showMessages: boolean
  showFollowups: boolean
  submitting: boolean
  draftLeadCount: number
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onUpdateDraft: <K extends keyof BroadcastFormPayload>(key: K, value: BroadcastFormPayload[K]) => void
  onToggleShowAccounts: () => void
  onToggleShowMessages: () => void
  onToggleShowFollowups: () => void
  onToggleAccount: (accountId: number) => void
  onAddMessage: () => void
  onUpdateMessage: (index: number, value: string) => void
  onRemoveMessage: (index: number) => void
  onReset: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{editingId === null ? 'Новая рассылка' : `Редактирование #${editingId}`}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block space-y-2 text-sm text-gray-600">
            <span>Название</span>
            <Input value={draft.name} onChange={(event) => onUpdateDraft('name', event.target.value)} placeholder="Например, Outreach / Апрель" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-gray-600">
              <span>Проект</span>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
                value={draft.project_id === null ? 'none' : String(draft.project_id)}
                onChange={(event) => onUpdateDraft('project_id', event.target.value === 'none' ? null : Number(event.target.value))}
              >
                <option value="none">Все лиды</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-gray-600">
              <span>Target mode</span>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
                value={draft.target_mode}
                onChange={(event) => onUpdateDraft('target_mode', event.target.value as BroadcastFormPayload['target_mode'])}
              >
                <option value="dm">Личные сообщения</option>
                <option value="groups_or_channels">Группы/каналы</option>
              </select>
            </label>
          </div>

          <AccountsSection
            eligibleAccounts={eligibleAccounts}
            selectedAccountIds={draft.account_ids}
            show={showAccounts}
            onToggleShow={onToggleShowAccounts}
            onToggleAccount={onToggleAccount}
          />

          <MessagesSection
            messages={draft.message_variants}
            show={showMessages}
            onToggleShow={onToggleShowMessages}
            onAddMessage={onAddMessage}
            onUpdateMessage={onUpdateMessage}
            onRemoveMessage={onRemoveMessage}
          />

          {!showMessages ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onToggleShowMessages()
                onAddMessage()
              }}
            >
              Добавить вариант сообщения
            </Button>
          ) : null}

          <LimitsSection draft={draft} onUpdateDraft={onUpdateDraft} />

          <FollowupsSection
            draft={draft}
            show={showFollowups}
            onToggleShow={onToggleShowFollowups}
            onUpdateDraft={onUpdateDraft}
          />

          <div className="rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Потенциальный охват: {draftLeadCount} лидов • выбрано {draft.account_ids.length} аккаунтов.
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Сохраняю...' : editingId === null ? 'Создать рассылку' : 'Сохранить изменения'}
            </Button>
            {editingId !== null ? (
              <Button type="button" variant="outline" onClick={onReset} disabled={submitting}>
                Отмена
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
