'use client'

import nextDynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { apiFetch } from '@/lib/api'
import type { TgAccount } from '@/lib/types'

type TabKey = 'info' | 'mailings' | 'profile' | 'proxy' | 'pause' | 'autowarmup' | 'logs'

type AccountLog = {
  id: number
  action_type: string
  target: string | null
  status: 'ok' | 'error' | 'skipped'
  error_text: string | null
  executed_at: string
}

interface Props {
  accountId: number | null
  account: TgAccount | null
  loading: boolean
  error: string | null
  onRefresh: () => Promise<void>
  onClose: () => void
}

const detailTabFallback = <div className="workspace-section py-10 text-center text-sm text-muted-foreground">Загрузка вкладки...</div>

const ProfileTab = nextDynamic(() => import('./account-sheet-profile-tab').then((mod) => mod.ProfileTab), {
  loading: () => detailTabFallback,
})
const ProxyTab = nextDynamic(() => import('./account-sheet-proxy-tab').then((mod) => mod.ProxyTab), {
  loading: () => detailTabFallback,
})
const PauseTab = nextDynamic(() => import('./account-sheet-pause-tab').then((mod) => mod.PauseTab), {
  loading: () => detailTabFallback,
})
const AutoWarmupTab = nextDynamic(() => import('./account-sheet-autowarmup-tab').then((mod) => mod.AutoWarmupTab), {
  loading: () => detailTabFallback,
})
const MailingsTab = nextDynamic(() => import('./account-sheet-limits-tab').then((mod) => mod.LimitsTab), {
  loading: () => detailTabFallback,
})
const LogsTab = nextDynamic(() => import('./account-sheet-logs-tab').then((mod) => mod.LogsTab), {
  loading: () => detailTabFallback,
})

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'info', label: 'Инфо' },
  { key: 'mailings', label: 'Рассылки' },
  { key: 'profile', label: 'Профиль' },
  { key: 'proxy', label: 'Прокси' },
  { key: 'pause', label: 'Пауза' },
  { key: 'autowarmup', label: 'Автопрогрев' },
  { key: 'logs', label: 'Логи' },
]

export function AccountSheet({ accountId, account, loading, error, onRefresh, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('info')
  const [logs, setLogs] = useState<AccountLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const displayedAccount = accountId ? account : null

  const title = useMemo(() => {
    if (!displayedAccount) return 'Аккаунт'
    return displayedAccount.username ? `@${displayedAccount.username}` : displayedAccount.first_name?.trim() || displayedAccount.phone
  }, [displayedAccount])

  const handleSelectTab = async (tab: TabKey) => {
    setActiveTab(tab)

    if (tab !== 'logs' || !displayedAccount) {
      if (tab !== 'logs') {
        setLogs([])
      }
      return
    }

    setLogsLoading(true)
    try {
      const response = await apiFetch<{ logs: AccountLog[] }>(`/accounts/${displayedAccount.id}/logs`)
      setLogs(response.logs)
    } catch {
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }

  return (
    <Sheet open={Boolean(accountId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b border-border/60 pb-4">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-4 pt-4">
          <div className="surface-pill mb-4 flex flex-wrap gap-2 p-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => void handleSelectTab(tab.key)}
                className={
                  activeTab === tab.key
                    ? 'rounded-[0.8rem] bg-primary px-3 py-1.5 text-sm text-primary-foreground shadow-[0_10px_24px_-18px_var(--glow-blue)]'
                    : 'rounded-[0.8rem] border border-transparent px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/30'
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? <div className="workspace-section py-10 text-center text-sm text-muted-foreground">Загрузка...</div> : null}
          {error ? <div className="rounded-[1rem] border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive">{error}</div> : null}

          {!loading && !error && displayedAccount ? (
            <AccountTabContent
              activeTab={activeTab}
              account={displayedAccount}
              onRefresh={onRefresh}
              logs={logs}
              logsLoading={logsLoading}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AccountTabContent({
  activeTab,
  account,
  onRefresh,
  logs,
  logsLoading,
}: {
  activeTab: TabKey
  account: TgAccount
  onRefresh: () => Promise<void>
  logs: AccountLog[]
  logsLoading: boolean
}) {
  if (activeTab === 'info') {
    return <InfoTab account={account} />
  }

  if (activeTab === 'mailings') {
    return <MailingsTab key={`mailings-${account.id}`} account={account} onSaved={onRefresh} />
  }

  if (activeTab === 'profile') {
    return <ProfileTab key={`profile-${account.id}`} account={account} onSaved={onRefresh} />
  }

  if (activeTab === 'proxy') {
    return <ProxyTab key={`proxy-${account.id}`} account={account} onSaved={onRefresh} />
  }

  if (activeTab === 'pause') {
    return <PauseTab account={account} onSaved={onRefresh} />
  }

  if (activeTab === 'autowarmup') {
    return <AutoWarmupTab key={`autowarmup-${account.id}`} account={account} onSaved={onRefresh} />
  }

  return <LogsTab logs={logs} loading={logsLoading} />
}

function InfoTab({ account }: { account: TgAccount }) {
  const isPaused = Boolean(account.pause_until && new Date(account.pause_until) > new Date())
  const statusTone = isPaused
    ? 'border-orange-200/70 bg-orange-500/10 text-orange-700 dark:text-orange-200'
    : account.status === 'active'
      ? 'border-emerald-200/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
      : account.status === 'spam_block' || account.status === 'banned'
        ? 'border-destructive/20 bg-destructive/8 text-destructive'
        : 'border-border/70 bg-muted/45 text-foreground'

  const statusLabel = isPaused
    ? 'На паузе'
    : {
        pending: 'Ожидает вход',
        active: 'Аккаунт активен',
        warming: 'Прогревается',
        warmed: 'Прогрет',
        spam_block: 'Spam-block',
        banned: 'Забанен',
        disabled: 'Отключён',
      }[account.status]

  return (
    <div className="space-y-4">
      <div className={`rounded-[1rem] border p-4 shadow-[0_16px_40px_-34px_var(--glow-blue)] ${statusTone}`}>
        <div className="text-sm font-semibold">{statusLabel}</div>
        <div className="mt-1 text-xs opacity-80">
          {isPaused && account.pause_until ? `До ${new Date(account.pause_until).toLocaleString('ru-RU')}` : 'Готов к работе'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Username', value: account.username ? `@${account.username}` : '—' },
          { label: 'Телефон', value: account.phone },
          { label: 'Сообщений', value: String(account.messages_sent) },
          { label: 'Добавлен', value: new Date(account.created_at).toLocaleDateString('ru-RU') },
        ].map((item) => (
          <div key={item.label} className="workspace-section p-3">
            <div className="text-xs text-muted-foreground">{item.label}</div>
            <div className="mt-1 text-sm font-medium text-foreground">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="workspace-section p-3">
          <div className="text-xs text-muted-foreground">Тип подключения</div>
          <div className="mt-1 text-sm font-medium text-foreground">{account.tg_id ? 'Telegram ID сохранён' : 'Session / ручной импорт'}</div>
        </div>
        <div className="workspace-section p-3">
          <div className="text-xs text-muted-foreground">SpamBot</div>
          <div className="mt-1 text-sm font-medium text-foreground">{account.spambot_status ?? 'unknown'}</div>
        </div>
      </div>

      {account.proxy ? (
        <div className="workspace-section p-3 text-sm text-foreground">
          <span className="font-medium">Прокси:</span> {formatProxyPreview(account.proxy)}
        </div>
      ) : null}

      {account.block_reason ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/8 p-3 text-sm text-destructive">
          <span className="font-medium">Причина блока: </span>
          {account.block_reason}
        </div>
      ) : null}
    </div>
  )
}

function formatProxyPreview(proxy: string) {
  try {
    const parsed = JSON.parse(proxy) as {
      type?: string
      host?: string
      port?: number
    }

    if (!parsed?.host || !parsed?.port) {
      return proxy
    }

    return `${parsed.type ?? 'proxy'}://${parsed.host}:${parsed.port}`
  } catch {
    return proxy
  }
}
