import Link from 'next/link'
import { ArrowRight, Flame, MessageCircleMore, ScanSearch, ShieldCheck } from 'lucide-react'

import { HeroVisual } from '@/components/landing/hero-visual'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const PRODUCT_FACTS = [
  {
    icon: Flame,
    title: 'Плавный прогрев аккаунтов',
    description: 'Сервис постепенно подготавливает аккаунты к работе, чтобы снизить риск блокировок и резких ограничений.',
  },
  {
    icon: MessageCircleMore,
    title: 'Рассылки с лимитами и паузами',
    description: 'Сообщения отправляются по правилам: с лимитами, follow-up и автопаузами, если аккаунт нужно притормозить.',
  },
  {
    icon: ScanSearch,
    title: 'Импорт и новые аудитории',
    description: 'Можно загрузить готовые аккаунты, работать с лидами и не собирать процесс вручную из разных сервисов.',
  },
] as const

export function HeroSection() {
  return (
    <section className="marketing-shell relative px-4 pb-18 pt-12 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8 lg:pb-28 lg:pt-20">
      <div className="absolute inset-x-0 top-0 -z-10 h-[40rem] bg-[radial-gradient(circle_at_15%_18%,var(--hero-from),transparent_26%),radial-gradient(circle_at_86%_18%,var(--hero-via),transparent_18%),radial-gradient(circle_at_50%_0%,var(--hero-orbit),transparent_28%)]" />
      <div className="editorial-section relative">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:items-center lg:gap-18">
          <div className="max-w-2xl pt-6 sm:pt-10 lg:pt-12 editorial-stack">
            <Badge variant="outline" className="rounded-full border-border/70 bg-background/60 px-3.5 py-1 text-[0.76rem] shadow-[0_10px_28px_-24px_var(--glow-blue)] backdrop-blur-sm">
              Varmup • Прогрев Telegram-аккаунтов и рассылки
            </Badge>

            <h1 className="headline-hero max-w-[11ch] text-[3.1rem] font-semibold tracking-[-0.05em] sm:text-[4.15rem] lg:text-[5rem]">
              <span className="headline-slice">Подготовьте</span>
              <span className="headline-slice">аккаунты</span>
              <span className="headline-slice">и запускайте</span>
              <span className="headline-slice">рассылки</span>
            </h1>

            <p className="max-w-xl text-sm font-semibold tracking-[-0.03em] text-foreground/76 sm:text-[1.03rem]">
              Один сервис для прогрева, лимитов, прокси, уведомлений и безопасной работы с Telegram-аккаунтами.
            </p>

            <p className="text-pretty mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Varmup помогает сначала аккуратно прогреть аккаунты, а потом запускать рассылки в личные сообщения, группы и каналы без хаоса, ручных таблиц и постоянного страха словить бан.
            </p>

            <p className="mt-6 max-w-xl text-xs font-semibold uppercase tracking-[0.16em] text-foreground/72 sm:text-sm">
              Понятно показывает, что происходит с аккаунтами, когда можно отправлять сообщения и почему задача поставлена на паузу.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="px-5" nativeButton={false} render={<Link href="/login" />}>
                Начать прогрев
                <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" className="px-5" nativeButton={false} render={<Link href="/login" />}>
                Открыть кабинет
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {PRODUCT_FACTS.map((item) => (
                <div key={item.title} className="surface-panel-soft p-4">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                    <item.icon className="size-4.5" />
                  </div>
                  <div className="mt-4 text-sm font-semibold">{item.title}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <div className="surface-pill flex items-center gap-2 px-3 py-2">
                <ShieldCheck className="size-4 text-primary" />
                Понятные статусы и причины пауз
              </div>
              <div className="surface-pill px-3 py-2">Импорт TData, StringSession и аккаунтов по номеру</div>
              <div className="surface-pill px-3 py-2">Подходит для арбитражников, агентств и маркетологов</div>
            </div>
          </div>

          <HeroVisual />
        </div>
      </div>
    </section>
  )
}
