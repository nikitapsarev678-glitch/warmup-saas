'use client'

import nextDynamic from 'next/dynamic'
import { useState } from 'react'
import { MoreHorizontal, PauseCircle, PlayCircle, Settings2, ShieldOff, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { apiFetch } from '@/lib/api'
import type { Project, TgAccount } from '@/lib/types'

const AccountSheet = nextDynamic(() => import('./account-sheet').then((mod) => mod.AccountSheet))
const AddAccountDialog = nextDynamic(() => import('./add-account-dialog').then((mod) => mod.AddAccountDialog))
const ImportAccountsDialog = nextDynamic(() => import('./import-dialog').then((mod) => mod.ImportAccountsDialog))

interface SheetState {
  accountId: number | null
  account: TgAccount | null
  loading: boolean
  error: string | null
}

function isVisibleAccount(account: TgAccount) {
  return account.status !== 'pending' && account.status !== 'disabled'
}

function getTelegramAvatarUrl(username: string | null) {
  if (!username) return null
  return `https://t.me/i/userpic/320/${username}.jpg`
}

function isPausedAccount(account: TgAccount) {
  return Boolean(account.pause_until && new Date(account.pause_until) > new Date())
}

const STATUS_LABELS: Record<TgAccount['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Ожидает', variant: 'secondary' },
  active: { label: 'Активен', variant: 'default' },
  warming: { label: 'Прогревается', variant: 'outline' },
  warmed: { label: 'Прогрет', variant: 'default' },
  spam_block: { label: 'SpamBlock', variant: 'destructive' },
  banned: { label: 'Забанен', variant: 'destructive' },
  disabled: { label: 'Отключён', variant: 'secondary' },
}

const initialSheetState: SheetState = {
  accountId: null,
  account: null,
  loading: false,
  error: null,
}

function AccountsToolbar({
  projects,
  onAdded,
  onImported,
  accountCount,
}: {
  projects: Project[]
  onAdded: (account: TgAccount) => void
  onImported: () => Promise<void>
  accountCount: number
}) {
  return (
    <div className="workspace-section mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold">Аккаунты</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {accountCount === 0
            ? 'Добавьте первый аккаунт для прогрева и рассылок.'
            : `Подключено ${accountCount} аккаунтов для прогрева и отправки.`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-sm text-muted-foreground sm:block">Импорт аккаунтов</div>
        <ImportAccountsDialog projects={projects} onImported={onImported} />
        <AddAccountDialog projects={projects} onAdded={onAdded} />
      </div>
    </div>
  )
}

export function AccountsList({
  accounts,
  projects,
}: {
  accounts: TgAccount[]
  projects: Project[]
}) {
  const [items, setItems] = useState(accounts.filter(isVisibleAccount))
  const [sheetState, setSheetState] = useState<SheetState>(initialSheetState)

  const prependAccount = (account: TgAccount) => {
    if (!isVisibleAccount(account)) {
      return
    }

    setItems((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== account.id)
      return [account, ...withoutDuplicate]
    })
  }

  const refreshList = async () => {
    const response = await apiFetch<{ accounts: TgAccount[] }>('/accounts')
    setItems(response.accounts.filter(isVisibleAccount))
  }

  const patchAccount = async (accountId: number, path: string, body?: object) => {
    await apiFetch(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    })

    if (sheetState.accountId === accountId) {
      await refreshAccount()
    }
    await refreshList()
  }

  const postAccountAction = async (accountId: number, path: string, body?: object) => {
    await apiFetch(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })

    if (sheetState.accountId === accountId) {
      await refreshAccount()
    }
    await refreshList()
  }

  const deleteAccount = async (accountId: number) => {
    await apiFetch(`/accounts/${accountId}`, { method: 'DELETE' })
    if (sheetState.accountId === accountId) {
      setSheetState(initialSheetState)
    }
    await refreshList()
  }

  const openAccount = async (accountId: number) => {
    setSheetState({ accountId, account: null, loading: true, error: null })

    try {
      const response = await apiFetch<{ account: TgAccount }>(`/accounts/${accountId}`)
      setSheetState({ accountId, account: response.account, loading: false, error: null })
    } catch (error) {
      setSheetState({
        accountId,
        account: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Не удалось загрузить аккаунт',
      })
    }
  }

  const refreshAccount = async () => {
    if (!sheetState.accountId) {
      return
    }

    setSheetState((current) => ({ ...current, loading: true, error: null }))

    try {
      const response = await apiFetch<{ account: TgAccount }>(`/accounts/${sheetState.accountId}`)
      setSheetState({ accountId: sheetState.accountId, account: response.account, loading: false, error: null })
    } catch (error) {
      setSheetState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Не удалось загрузить аккаунт',
      }))
    }
  }

  const handleImported = async () => {
    await refreshList()
  }

  const handleAdded = (account: TgAccount) => {
    prependAccount(account)
  }

  const handleAccountRefresh = async () => {
    await refreshAccount()
    await refreshList()
  }

  return (
    <>
      <AccountsToolbar
        projects={projects}
        onAdded={handleAdded}
        onImported={handleImported}
        accountCount={items.length}
      />

      {items.length === 0 ? (
        <Card>
          <CardContent className="dashed-panel rounded-[0.95rem] p-8 text-center text-sm text-muted-foreground">
            Нет аккаунтов. Добавьте первый аккаунт для прогрева.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((account) => {
            const status = STATUS_LABELS[account.status]
            const title = account.first_name?.trim() || account.username?.trim() || account.phone
            const initial = (account.first_name?.[0] || account.phone.replace(/\D/g, '')[0] || '?').toUpperCase()
            const avatarUrl = getTelegramAvatarUrl(account.username)
            const isPaused = isPausedAccount(account)

            return (
              <Card key={account.id} className="cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/15" onClick={() => void openAccount(account.id)}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="flex min-w-0 items-center gap-4">
                    <Avatar size="lg" className="h-11 w-11 border border-border/70 bg-muted/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                      {avatarUrl ? <AvatarImage src={avatarUrl} alt={title} /> : null}
                      <AvatarFallback>{initial}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{title}</CardTitle>
                      <div className="mt-1 text-sm text-muted-foreground">{account.phone}</div>
                      {account.username ? <div className="text-sm text-muted-foreground">@{account.username}</div> : null}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="outline" size="icon" className="size-8" />}>
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={(event) => {
                            event.stopPropagation()
                            void openAccount(account.id)
                          }}
                        >
                          <Settings2 className="size-4" />
                          Открыть настройки
                        </DropdownMenuItem>
                        {isPaused ? (
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation()
                              void postAccountAction(account.id, `/accounts/${account.id}/unpause`)
                            }}
                          >
                            <PlayCircle className="size-4" />
                            Снять паузу
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation()
                              void postAccountAction(account.id, `/accounts/${account.id}/pause`, { hours: 24 })
                            }}
                          >
                            <PauseCircle className="size-4" />
                            Пауза на 24ч
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(event) => {
                            event.stopPropagation()
                            void patchAccount(account.id, `/accounts/${account.id}/status`, {
                              status: account.status === 'disabled' ? 'active' : 'disabled',
                            })
                          }}
                        >
                          <ShieldOff className="size-4" />
                          {account.status === 'disabled' ? 'Включить' : 'Отключить'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(event) => {
                            event.stopPropagation()
                            void deleteAccount(account.id)
                          }}
                        >
                          <Trash2 className="size-4" />
                          Удалить аккаунт
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <div>{account.messages_sent} сообщ.</div>
                  {account.proxy ? <Badge variant="outline">Прокси подключен</Badge> : <Badge variant="outline">Без прокси</Badge>}
                  <div>Добавлен {new Date(account.created_at).toLocaleDateString('ru-RU')}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AccountSheet
        accountId={sheetState.accountId}
        account={sheetState.account}
        loading={sheetState.loading}
        error={sheetState.error}
        onRefresh={handleAccountRefresh}
        onClose={() => setSheetState(initialSheetState)}
      />
    </>
  )
}
