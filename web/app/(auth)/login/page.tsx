'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, MessageCircleMore, ScanSearch, ShieldCheck } from 'lucide-react'

import { AssistantGuide } from '@/components/landing/assistant-guide'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'

const LOGIN_UNAVAILABLE_ERROR = 'Логин через Telegram временно недоступен: не задан bot username.'

const LOGIN_POINTS = [
  {
    title: 'Прогрев под контролем',
    description: 'Аккаунты проходят подготовку к outreach без резких сценариев и слепых действий.',
    icon: ShieldCheck,
  },
  {
    title: 'Сообщения идут по маршруту',
    description: 'Очереди, follow-up и окна работы ощущаются как один управляемый поток.',
    icon: MessageCircleMore,
  },
  {
    title: 'Parsing встроен в цикл',
    description: 'Новые сегменты и аудитории сразу возвращаются в messaging workflow.',
    icon: ScanSearch,
  },
] as const

declare global {
  interface Window {
    onTelegramAuth: (user: Record<string, string>) => void
  }
}

export default function LoginPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const botUsername = useMemo(() => process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim() ?? '', [])
  const [error, setError] = useState<string | null>(botUsername ? null : LOGIN_UNAVAILABLE_ERROR)
  const [isDevHost] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null
    const hostname = window.location.hostname
    return hostname === 'localhost' || hostname === '127.0.0.1'
  })
  const [isDevLoginPending, setIsDevLoginPending] = useState(false)

  useEffect(() => {
    const container = containerRef.current

    if (isDevHost !== false) {
      container?.replaceChildren()
      return
    }

    if (!botUsername) {
      return
    }

    window.onTelegramAuth = async (telegramData) => {
      try {
        await apiFetch('/auth/telegram', {
          method: 'POST',
          body: JSON.stringify(telegramData),
        })
        window.location.assign('/dashboard')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось завершить вход через Telegram.')
      }
    }

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
    script.async = true
    container?.replaceChildren(script)

    return () => {
      window.onTelegramAuth = () => {}
      container?.replaceChildren()
    }
  }, [botUsername, isDevHost])

  async function handleDevLogin() {
    setIsDevLoginPending(true)
    setError(null)

    try {
      await apiFetch('/auth/dev-login', {
        method: 'POST',
      })
      window.location.assign('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить тестовый вход.')
    } finally {
      setIsDevLoginPending(false)
    }
  }

  return (
    <div className="marketing-shell min-h-screen px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="editorial-section grid min-h-[calc(100vh-3rem)] gap-6 lg:grid-cols-[1.04fr_0.96fr] lg:items-stretch">
        <div className="surface-panel relative overflow-hidden p-6 sm:p-8 lg:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,var(--hero-from),transparent_22%),radial-gradient(circle_at_90%_12%,var(--hero-via),transparent_18%)] opacity-80" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div>
              <div className="flex items-center gap-3">
                <AssistantGuide className="size-14 sm:size-16" />
                <div>
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-primary/85">Varmup</div>
                  <div className="text-sm font-semibold">Messaging workflow platform</div>
                </div>
              </div>

              <Badge variant="outline" className="mt-8 rounded-full border-border/70 bg-background/60 px-3.5 py-1 text-[0.76rem] shadow-[0_10px_28px_-24px_var(--glow-blue)] backdrop-blur-sm">
                Доступ к warm-up, outreach и parsing
              </Badge>

              <h1 className="headline-section mt-6 max-w-[8ch] text-[3.15rem] font-semibold tracking-[-0.05em] sm:text-[4.15rem] lg:text-[4.85rem]">
                <span className="headline-slice">Войти</span>
                <span className="headline-slice">в кабинет</span>
              </h1>

              <p className="mt-4 max-w-lg text-sm font-semibold tracking-[-0.03em] text-foreground/76 sm:text-[1.03rem]">
                Аккаунты, сообщения и аудитории уже собраны в один рабочий контур.
              </p>

              <p className="text-pretty mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Быстрый вход без лишней витрины: открыть систему, проверить состояние аккаунтов и продолжить сценарии.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {LOGIN_POINTS.map((item) => (
                <div key={item.title} className="surface-panel-soft p-4">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                    <item.icon className="size-4.5" />
                  </div>
                  <div className="mt-4 text-sm font-semibold">{item.title}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="surface-panel flex items-center p-4 sm:p-6 lg:p-8">
          <div className="w-full rounded-[2rem] border border-border/75 bg-background/82 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="section-kicker">Вход</div>
                <h2 className="headline-capsule mt-3 max-w-[9ch] text-[2.15rem] font-semibold sm:text-[2.4rem]">
                  Войти как
                  <span className="headline-slice">пользователь</span>
                </h2>
              </div>
              <AssistantGuide className="size-12" />
            </div>

            <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Используйте Telegram-вход для рабочей среды или dev-доступ при локальном тестировании.
            </p>

            {error ? (
              <div className="mt-5 rounded-[1.3rem] border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {isDevHost === false ? <div ref={containerRef} className="mt-8 flex min-h-14 justify-center" /> : null}

            {isDevHost ? (
              <div className="mt-8 space-y-4">
                <div className="surface-panel-soft p-4 text-sm leading-6 text-muted-foreground">
                  Локально Telegram Login Widget может не работать из-за ограничений домена, поэтому для разработки доступен отдельный тестовый вход.
                </div>
                <Button className="w-full" size="lg" onClick={handleDevLogin} disabled={isDevLoginPending}>
                  {isDevLoginPending ? 'Входим...' : 'Войти как тестовый пользователь'}
                  {!isDevLoginPending ? <ArrowRight className="size-4" /> : null}
                </Button>
              </div>
            ) : null}

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="surface-panel-soft p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Что дальше</div>
                <div className="mt-2 text-sm font-semibold">Dashboard, аккаунты, кампании и аналитика</div>
              </div>
              <div className="surface-panel-soft p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Тон интерфейса</div>
                <div className="mt-2 text-sm font-semibold">Собранный, ясный, messaging-native</div>
              </div>
            </div>

            <p className="mt-6 text-xs leading-5 text-muted-foreground">
              Нажимая кнопку, вы соглашаетесь с условиями использования.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
