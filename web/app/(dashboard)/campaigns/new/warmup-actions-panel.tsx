'use client'

import { cn } from '@/lib/utils'

type DefaultActions = {
  join_groups: boolean
  read_messages: boolean
  reactions: boolean
  dialogs: boolean
  story_views: boolean
  profile_setup: boolean
}

const ACTION_LABELS: Record<keyof DefaultActions, { label: string; desc: string }> = {
  profile_setup: { label: 'Настройка профиля', desc: 'Установить имя и bio при первом запуске' },
  join_groups: { label: 'Вступление в группы', desc: 'Вступать в 1–3 группы в день' },
  read_messages: { label: 'Чтение сообщений', desc: 'Открывать диалоги и прокручивать ленту' },
  reactions: { label: 'Реакции', desc: 'Ставить лайки и эмодзи на посты' },
  story_views: { label: 'Просмотр историй', desc: 'Смотреть stories контактов и каналов' },
  dialogs: { label: 'Диалоги', desc: 'Переписка с другими аккаунтами пула' },
}

export function WarmupActionsPanel({
  actions,
  setActions,
  usePoolDialogs,
  setUsePoolDialogs,
}: {
  actions: DefaultActions
  setActions: React.Dispatch<React.SetStateAction<DefaultActions>>
  usePoolDialogs: boolean
  setUsePoolDialogs: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
    <>
      {Object.entries(ACTION_LABELS).map(([key, info]) => {
        const checked = actions[key as keyof DefaultActions]
        return (
          <label
            key={key}
            className={cn(
              'flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-4 transition-colors',
              checked ? 'border-blue-200 bg-blue-50/60' : 'border-gray-200 bg-white'
            )}
          >
            <div>
              <div className="text-sm font-medium">{info.label}</div>
              <div className="mt-1 text-xs text-gray-500">{info.desc}</div>
            </div>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                setActions((prev) => ({
                  ...prev,
                  [key]: e.target.checked,
                }))
              }
              className="mt-1 h-4 w-4"
            />
          </label>
        )
      })}

      <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-gray-200 p-4">
        <div>
          <div className="text-sm font-medium">Диалоги внутри пула</div>
          <div className="mt-1 text-xs text-gray-500">Аккаунты переписываются между собой</div>
        </div>
        <input
          type="checkbox"
          checked={usePoolDialogs}
          onChange={(e) => setUsePoolDialogs(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
      </label>
    </>
  )
}
