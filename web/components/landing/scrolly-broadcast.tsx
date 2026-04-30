'use client'

import { CalendarClock, ListFilter, ScanSearch, Send, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { SectionShell } from '@/components/landing/section-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const STEPS = [
  {
    key: 'audience',
    title: 'Соберите сегмент и подготовьте получателей',
    description: 'Контакты и аудитории складываются в понятную стартовую точку для кампании.',
    icon: ListFilter,
    note: 'Сюда же могут приходить новые данные из parsing-потока.',
    lane: 'Segment → qualify → queue',
  },
  {
    key: 'message',
    title: 'Подготовьте сообщение под живой сценарий',
    description: 'Текст, персонализация и логика follow-up работают вместе, а не через ручной копипаст.',
    icon: WandSparkles,
    note: 'Продукт помогает масштабировать касания, сохраняя ощущение управляемости.',
    lane: 'Draft → personalize → review',
  },
  {
    key: 'send',
    title: 'Запустите очередь отправки без резких скачков',
    description: 'Рабочие окна, ограничения и постепенный ритм не дают outreach превратиться в спам-машину.',
    icon: Send,
    note: 'Именно это делает продукт ближе к messaging-native практике, а не к бездушной рассылке.',
    lane: 'Window → send → hold',
  },
  {
    key: 'followup',
    title: 'Доведите цепочку до follow-up и реакции',
    description: 'Follow-up и отслеживание касаний встроены в маршрут, а не живут в отдельном инструменте.',
    icon: CalendarClock,
    note: 'Команда видит, кто уже получил сообщение и кто требует следующего шага.',
    lane: 'Touch 1 → wait → follow-up',
  },
  {
    key: 'optimize',
    title: 'Переиспользуйте новые данные и усиливайте следующий цикл',
    description: 'Ответившие, найденные сегменты и свежие контакты снова попадают в систему принятия решений.',
    icon: ScanSearch,
    note: 'Так warm-up, outreach и parsing начинают работать как единый операционный цикл.',
    lane: 'Reply → enrich → relaunch',
  },
] as const

export function ScrollyBroadcast() {
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
      kicker="Message movement"
      title="Outreach здесь выглядит как движение сообщений и решений, а не как скучная таблица отправок."
      description="Секция должна визуально объяснять механику очередей, рабочих окон, follow-up и возврата новых данных назад в систему."
      className="pt-0"
      contentClassName="grid gap-10 lg:grid-cols-[25rem_minmax(0,1fr)] lg:items-start"
    >
      <Card className="dashed-panel pixel-frame hidden lg:sticky lg:top-26 lg:block">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="pixel-label text-[0.68rem] font-semibold">Message lane</div>
            <span className="signal-light signal-green" />
            <span className="signal-light signal-red" />
          </div>
          <CardTitle className="mt-3 text-2xl">{current.title}</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          <div className="route-grid rounded-[1rem] border border-dashed border-border/70 bg-background/56 p-4">
            <div className="rounded-[0.9rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-semibold text-primary">
              {current.lane}
            </div>
            <div className="space-y-3 pt-4">
              {STEPS.map((step, index) => (
                <div
                  key={step.key}
                  className={cn(
                    'rounded-[0.9rem] border border-dashed px-4 py-3 text-sm transition-all',
                    index === active
                      ? 'border-primary/25 bg-background/78 text-foreground shadow-[0_16px_38px_-26px_var(--glow-blue)]'
                      : 'border-border/70 bg-background/52 text-muted-foreground'
                  )}
                >
                  {step.title}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        {STEPS.map((step, index) => (
          <div
            key={step.key}
            ref={(element) => {
              itemRefs.current[index] = element
            }}
            className={cn(
              'surface-panel-soft dashed-panel pixel-frame p-6 transition-all sm:p-7',
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
                <h3 className="mt-2 text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-3 text-base leading-7 text-muted-foreground">{step.description}</p>
                <p className="mt-4 text-sm leading-6 text-foreground/72">{step.note}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}
