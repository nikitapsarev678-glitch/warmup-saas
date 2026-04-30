'use client'

import { Flame, MessageCircleMore, ScanSearch, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { SectionShell } from '@/components/landing/section-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const STEPS = [
  {
    key: 'warmup',
    title: 'Сначала система готовит аккаунты к работе',
    description: 'Прогрев раскладывается на безопасные действия, задержки и естественное наращивание активности.',
    detail: 'Команда видит не только, что аккаунт активен, но и насколько он готов к следующему этапу.',
    icon: Flame,
    status: 'Подготовка trust-layer',
    next: 'Открыть окно для outreach',
  },
  {
    key: 'outreach',
    title: 'Потом сообщения идут по управляемому маршруту',
    description: 'Очереди, follow-up и временные окна работают как единый сценарий, а не как ручной набор задач.',
    detail: 'Система показывает текущий объём касаний, статус отправки и причины пауз без лишней техничности.',
    icon: MessageCircleMore,
    status: 'Очередь отправки активна',
    next: 'Собрать ответивших и расширить сегмент',
  },
  {
    key: 'parsing',
    title: 'Parsing подключается как источник нового потока',
    description: 'Аудитории, каналы и новые лиды попадают в ту же систему принятия решений и сегментации.',
    detail: 'Вместо отдельного сервиса пользователь получает целостную картину того, откуда пришли контакты и что с ними делать дальше.',
    icon: ScanSearch,
    status: 'Новые сегменты готовы',
    next: 'Перезапустить цикл с новыми данными',
  },
] as const

export function ScrollyHowItWorks() {
  const [active, setActive] = useState(0)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    const elements = itemRefs.current.filter(Boolean) as HTMLDivElement[]
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

        if (!visible) return

        const nextIndex = elements.indexOf(visible.target as HTMLDivElement)
        if (nextIndex >= 0) setActive(nextIndex)
      },
      { threshold: [0.35, 0.55, 0.75] }
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  const current = useMemo(() => STEPS[active] ?? STEPS[0], [active])

  return (
    <SectionShell
      id="how-it-works"
      kicker="Как это работает"
      title="Varmup ощущается как одна messaging-система, а не как набор разрозненных действий."
      description="Пользователь не прыгает между прогревом, отправкой и сбором аудиторий: продукт ведёт его по понятному маршруту от готовности аккаунта до следующего касания."
      contentClassName="grid gap-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-start"
    >
      <div className="space-y-6">
        {STEPS.map((step, index) => (
          <div key={step.key} className="relative">
            {index < STEPS.length - 1 ? (
              <div className="absolute left-6 top-18 hidden h-[calc(100%-1rem)] w-px bg-[linear-gradient(to_bottom,var(--route-line),transparent)] lg:block" />
            ) : null}
            <div
              ref={(element) => {
                itemRefs.current[index] = element
              }}
              className={cn(
                'surface-panel-soft dashed-panel pixel-frame p-6 transition-all sm:p-8',
                index === active && 'border-primary/30 bg-primary/8 shadow-[0_24px_70px_-40px_var(--glow-blue)]'
              )}
            >
              <div className="flex items-start gap-4">
                <div className="relative flex size-12 shrink-0 items-center justify-center rounded-[0.95rem] bg-primary/12 text-primary">
                  <step.icon className="size-5" />
                  <span className="signal-light signal-green absolute -right-1 -top-1" />
                </div>
                <div>
                  <div className="pixel-label text-[0.68rem] font-semibold">Этап {index + 1}</div>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight sm:text-[1.45rem]">{step.title}</h3>
                  <p className="mt-3 text-base leading-7 text-muted-foreground">{step.description}</p>
                  <p className="mt-4 text-sm leading-6 text-foreground/72">{step.detail}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card className="dashed-panel pixel-frame hidden lg:sticky lg:top-26 lg:block">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="pixel-label text-[0.68rem] font-semibold">Активный маршрут</div>
            <span className="signal-light signal-green" />
            <span className="signal-light signal-yellow" />
          </div>
          <CardTitle className="mt-3 text-2xl">{current.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-5">
          <p className="text-sm leading-6 text-muted-foreground">{current.description}</p>
          <div className="route-grid rounded-[1rem] border border-dashed border-border/70 bg-background/58 p-4">
            <div className="rounded-[0.9rem] border border-border/70 bg-background/78 p-4">
              <div className="pixel-label text-[0.66rem] font-semibold">Сейчас</div>
              <div className="mt-2 text-sm font-semibold">{current.status}</div>
            </div>
            <div className="my-3 ml-3 h-7 w-px bg-[linear-gradient(to_bottom,var(--route-line),transparent)]" />
            <div className="rounded-[0.9rem] border border-dashed border-primary/20 bg-primary/8 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <ShieldCheck className="size-4" />
                Следующее действие
              </div>
              <div className="mt-2 text-sm leading-6 text-foreground/80">{current.next}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </SectionShell>
  )
}
