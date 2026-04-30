'use client'

import nextDynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { apiFetch } from '@/lib/api'
import type { Project, TgAccount } from '@/lib/types'

const AddAccountSessionForm = nextDynamic(
  () => import('./add-account-session-form').then((mod) => mod.AddAccountSessionForm),
  {
    loading: () => <div className="mt-4 text-sm text-gray-400">Загрузка формы подключения...</div>,
  }
)

const AddAccountPhoneEntryForm = nextDynamic(
  () => import('./add-account-phone-form').then((mod) => mod.AddAccountPhoneEntryForm),
  {
    loading: () => <div className="mt-4 text-sm text-gray-400">Загрузка формы входа...</div>,
  }
)

const AddAccountCodeForm = nextDynamic(
  () => import('./add-account-phone-form').then((mod) => mod.AddAccountCodeForm),
  {
    loading: () => <div className="mt-4 text-sm text-gray-400">Загрузка формы подтверждения...</div>,
  }
)

const AddAccountPasswordForm = nextDynamic(
  () => import('./add-account-phone-form').then((mod) => mod.AddAccountPasswordForm),
  {
    loading: () => <div className="mt-4 text-sm text-gray-400">Загрузка формы пароля...</div>,
  }
)

const formTabs = {
  session: AddAccountSessionForm,
  phoneEntry: AddAccountPhoneEntryForm,
  code: AddAccountCodeForm,
  password: AddAccountPasswordForm,
} as const

const CurrentSessionForm = formTabs.session
const CurrentPhoneEntryForm = formTabs.phoneEntry
const CurrentCodeForm = formTabs.code
const CurrentPasswordForm = formTabs.password

type Mode = 'session' | 'phone'
type PhoneStep = 'enter-phone' | 'waiting-code' | 'enter-code' | 'enter-password'

type LoginStateStatus = 'queued' | 'code_sent' | 'password_required' | 'done' | 'error'

type LoginStateResponse = {
  state: {
    account_id: number
    status: LoginStateStatus | string
    error_message: string | null
    password_required: boolean
    updated_at: string
  } | null
}

export function AddAccountDialog({
  projects,
  onAdded,
}: {
  projects: Project[]
  onAdded?: (account: TgAccount) => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('session')
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('enter-phone')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isSubmittingSession, setIsSubmittingSession] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isConfirmingCode, setIsConfirmingCode] = useState(false)
  const [phone, setPhone] = useState('')
  const [session, setSession] = useState('')
  const [phoneForCode, setPhoneForCode] = useState('')
  const [projectId, setProjectId] = useState('')
  const [createdAccountId, setCreatedAccountId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loginStateStatus, setLoginStateStatus] = useState<LoginStateStatus | null>(null)
  const pollTimerRef = useRef<number | null>(null)

  const normalizedPhoneForCode = phoneForCode.replace(/\D/g, '')
  const normalizedCode = code.replace(/\D/g, '')
  const canSendCode = normalizedPhoneForCode.length >= 10
  const canConfirmCode = phoneStep === 'enter-code' && normalizedCode.length >= 4 && loginStateStatus === 'code_sent'
  const codeHelperText = phoneStep !== 'enter-code'
    ? 'Кнопка станет активной, когда runner действительно получит код.'
    : normalizedCode.length < 4
      ? 'Введите код из Telegram полностью.'
      : null

  const resetState = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
      setError(null)
      setInfo(null)
      setMode('session')
      setPhoneStep('enter-phone')
      setPhone('')
      setSession('')
      setPhoneForCode('')
      setProjectId('')
      setCreatedAccountId(null)
      setCode('')
      setPassword('')
      setLoginStateStatus(null)
      setIsSubmittingSession(false)
      setIsSendingCode(false)
      setIsConfirmingCode(false)
  }
}

function toHumanErrorMessage(value: unknown): string {
  const fallback = 'Не удалось выполнить действие. Попробуйте еще раз.'
  const raw = value instanceof Error ? value.message : typeof value === 'string' ? value : fallback
  const normalized = raw.trim()

  if (normalized === 'Runner is not configured in this environment') {
    return 'В этой среде не настроен runner для входа по SMS. Подключите GitHub runner и секреты Telegram, либо добавьте аккаунт через StringSession.'
  }

  if (normalized.startsWith('Runner dispatch failed with status ')) {
    return 'Не удалось запустить runner для входа по SMS. Проверьте настройки GitHub Actions и повторите попытку.'
  }

  if (normalized === 'Runner dispatch failed') {
    return 'Не удалось связаться с runner для входа по SMS. Повторите попытку позже.'
  }

  if (normalized.includes('AuthKeyUnregisteredError')) {
    return 'Аккаунт уже подключился, но статус входа обновился с задержкой. Проверьте список аккаунтов.'
  }

  if (normalized.includes('Cannot read "image.png"') || normalized.includes('does not support image input')) {
    return 'Этот режим не поддерживает чтение изображений. Удалите image.png из запроса или используйте модель с поддержкой картинок.'
  }

  return normalized || fallback
}

  const loadAccount = useCallback(
    async (accountId: number) => {
      const response = await apiFetch<{ account: TgAccount }>(`/accounts/${accountId}`)
      onAdded?.(response.account)
    },
    [onAdded]
  )

  useEffect(() => {
    if (!open || mode !== 'phone' || !createdAccountId) {
      return
    }

    let cancelled = false
    const poll = async () => {
      try {
        const response = await apiFetch<LoginStateResponse>(`/accounts/${createdAccountId}/login-state`)
        if (cancelled || !response.state) {
          return
        }

        setLoginStateStatus(response.state.status as LoginStateStatus)

        if (response.state.error_message && response.state.status !== 'done') {
          setError(toHumanErrorMessage(response.state.error_message))
        }

        if (response.state.status === 'done') {
          await loadAccount(createdAccountId)
          if (cancelled) {
            return
          }
          setInfo('Аккаунт успешно подключён.')
          resetState(false)
          return
        }

        if (response.state.password_required || response.state.status === 'password_required') {
          setPhoneStep('enter-password')
          setInfo('Для этого аккаунта включён дополнительный пароль Telegram. Введите его, чтобы завершить вход.')
          return
        }

        if (response.state.status === 'error') {
          if (response.state.error_message?.includes('AuthKeyUnregisteredError')) {
            await loadAccount(createdAccountId)
            if (cancelled) {
              return
            }
            setInfo('Аккаунт уже подключён. Обновили список аккаунтов.')
            resetState(false)
            return
          }

          setPhoneStep('enter-phone')
          setInfo('Не удалось запросить код. Проверьте номер и попробуйте снова.')
          setCreatedAccountId(null)
          setLoginStateStatus('error')
          return
        }

        if (response.state.status === 'code_sent') {
          setPhoneStep('enter-code')
          setInfo('Код отправлен в Telegram. Введите его ниже.')
        } else if (response.state.status === 'queued') {
          setPhoneStep('waiting-code')
          setInfo('Запрос на отправку кода принят. Ждём, пока Telegram подготовит код.')
        }

        if (!cancelled) {
          pollTimerRef.current = window.setTimeout(() => {
            void poll()
          }, 2000)
        }
      } catch (err) {
        if (!cancelled) {
          setError(toHumanErrorMessage(err instanceof Error ? err.message : 'Не удалось проверить статус логина'))
          pollTimerRef.current = window.setTimeout(() => {
            void poll()
          }, 2000)
        }
      }
    }

    void poll()

    return () => {
      cancelled = true
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [createdAccountId, loadAccount, mode, open])

  const handleAddBySession = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setIsSubmittingSession(true)

    try {
      const response = await apiFetch<{ account_id: number }>('/accounts', {
        method: 'POST',
        body: JSON.stringify({
          phone,
          session_string: session,
          project_id: projectId ? Number(projectId) : null,
        }),
      })
      await loadAccount(response.account_id)
      resetState(false)
    } catch (err) {
      setError(toHumanErrorMessage(err instanceof Error ? err.message : 'Не удалось добавить аккаунт'))
    } finally {
      setIsSubmittingSession(false)
    }
  }

  const handleSendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setInfo(null)

    if (!canSendCode) {
      setError('Введите корректный номер телефона.')
      return
    }

    setIsSendingCode(true)

    try {
      const response = await apiFetch<{ account_id: number; message?: string }>('/accounts/send-code', {
        method: 'POST',
        body: JSON.stringify({
          phone: phoneForCode,
          project_id: projectId ? Number(projectId) : null,
        }),
      })
      setCreatedAccountId(response.account_id)
      setLoginStateStatus('queued')
      setPhoneStep('waiting-code')
      setCode('')
      setInfo(response.message ?? 'Запрос на отправку кода принят. Подождите несколько секунд.')
    } catch (err) {
      setError(toHumanErrorMessage(err instanceof Error ? err.message : 'Не удалось отправить код'))
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleConfirmCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!createdAccountId) {
      setError('Сначала отправьте код.')
      return
    }

    if (phoneStep !== 'enter-code' || loginStateStatus !== 'code_sent') {
      setError('Код ещё не готов. Дождитесь, пока runner получит его из Telegram.')
      return
    }

    if (normalizedCode.length < 4) {
      setError('Введите код из Telegram полностью.')
      return
    }

    setError(null)
    setInfo('Проверяю код...')
    setIsConfirmingCode(true)

    try {
      await apiFetch(`/accounts/${createdAccountId}/confirm-code`, {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
    } catch (err) {
      setError(toHumanErrorMessage(err instanceof Error ? err.message : 'Не удалось подтвердить код'))
    } finally {
      setIsConfirmingCode(false)
    }
  }

  const handleConfirmPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!createdAccountId) {
      setError('Сначала отправьте код.')
      return
    }

    setError(null)
    setInfo('Проверяю пароль...')
    setIsConfirmingCode(true)

    try {
      await apiFetch(`/accounts/${createdAccountId}/confirm-code`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
    } catch (err) {
      setError(toHumanErrorMessage(err instanceof Error ? err.message : 'Не удалось подтвердить пароль'))
    } finally {
      setIsConfirmingCode(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={resetState}>
      <SheetTrigger render={<Button />}>Добавить аккаунт</SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Добавить Telegram аккаунт</SheetTitle>
          <SheetDescription>
            Выберите способ подключения: готовая StringSession или вход по номеру телефона.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          <div className="surface-pill grid grid-cols-2 gap-2 p-1.5">
            <button
              type="button"
              className={
                mode === 'session'
                  ? 'rounded-[0.8rem] bg-background/88 px-3 py-2 text-sm font-medium shadow-[0_12px_30px_-24px_var(--glow-blue)]'
                  : 'rounded-[0.8rem] px-3 py-2 text-sm text-muted-foreground hover:bg-accent/25'
              }
              onClick={() => {
                setMode('session')
                setPhoneStep('enter-phone')
                setError(null)
                setInfo(null)
              }}
            >
              StringSession
            </button>
            <button
              type="button"
              className={
                mode === 'phone'
                  ? 'rounded-[0.8rem] bg-background/88 px-3 py-2 text-sm font-medium shadow-[0_12px_30px_-24px_var(--glow-blue)]'
                  : 'rounded-[0.8rem] px-3 py-2 text-sm text-muted-foreground hover:bg-accent/25'
              }
              onClick={() => {
                setMode('phone')
                setError(null)
                setInfo(null)
              }}
            >
              Телефон + код
            </button>
          </div>

          {error ? <div className="mt-4 rounded-[1rem] border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive">{error}</div> : null}
          {info ? <div className="mt-4 workspace-section px-3 py-2 text-sm text-foreground">{info}</div> : null}

          {mode === 'session' ? (
            <CurrentSessionForm
              phone={phone}
              session={session}
              projectId={projectId}
              projects={projects}
              submitting={isSubmittingSession}
              onPhoneChange={setPhone}
              onSessionChange={setSession}
              onProjectChange={setProjectId}
              onSubmit={handleAddBySession}
            />
          ) : phoneStep === 'enter-phone' ? (
            <CurrentPhoneEntryForm
              phoneForCode={phoneForCode}
              projectId={projectId}
              projects={projects}
              submitting={isSendingCode}
              onPhoneChange={setPhoneForCode}
              onProjectChange={setProjectId}
              onSubmit={handleSendCode}
            />
          ) : phoneStep === 'waiting-code' ? (
            <div className="mt-6 workspace-section px-4 py-4 text-sm text-muted-foreground">
              Ждём, пока runner отправит код в Telegram. Форма ввода появится автоматически.
            </div>
          ) : phoneStep === 'enter-code' ? (
            <CurrentCodeForm
              code={code}
              submitting={isConfirmingCode}
              canSubmit={canConfirmCode}
              helperText={codeHelperText}
              onCodeChange={setCode}
              onSubmit={handleConfirmCode}
            />
          ) : (
            <CurrentPasswordForm
              password={password}
              submitting={isConfirmingCode}
              onPasswordChange={setPassword}
              onSubmit={handleConfirmPassword}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
