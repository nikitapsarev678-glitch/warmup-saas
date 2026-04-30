import Link from 'next/link'
import { Check, Sparkles } from 'lucide-react'

import { SectionShell } from '@/components/landing/section-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const PLANS = [
  {
    id: 'starter',
    name: 'Старт',
    price: 'Быстрый вход',
    subtitle: 'Для первых аккаунтов и аккуратного запуска',
    features: ['Прогрев и базовые статусы', 'Первый сценарий без лишнего setup', 'Подходит для solo и small teams'],
    featured: false,
  },
  {
    id: 'growth',
    name: 'Рост',
    price: 'Основной режим',
    subtitle: 'Для стабильных outreach-потоков и нескольких сценариев',
    features: ['Больше аккаунтов и сегментов', 'Follow-up и orchestration', 'Усиленная аналитика и parsing-ready workflow'],
    featured: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 'Для команд',
    subtitle: 'Когда warm-up, outreach и parsing становятся операционной системой',
    features: ['Масштабирование сценариев', 'Shared control surface для команды', 'Гибкая работа с новыми аудиториями'],
    featured: false,
  },
] as const

export function PricingSection() {
  return (
    <SectionShell
      id="pricing"
      kicker="Тарифная логика"
      title="Сначала важен понятный вход, потом — масштабирование сценариев."
      description="На главной достаточно показать, что продукт дружелюбен для старта и при этом готов к росту без смены инструмента."
      align="center"
      contentClassName="grid gap-5 lg:grid-cols-[1.05fr_0.95fr_1.05fr]"
    >
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={cn(
            'surface-panel-soft dashed-panel pixel-frame flex h-full flex-col p-6 text-left sm:p-7',
            plan.featured && 'border-primary/30 bg-primary/8 shadow-[0_24px_70px_-38px_var(--glow-blue)]'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="pixel-label text-[0.68rem] font-semibold">{plan.id}</div>
              <div className="text-lg font-semibold">{plan.name}</div>
              <div className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{plan.price}</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">{plan.subtitle}</div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-2">
                <span className={cn('signal-light', plan.featured ? 'signal-green' : 'signal-yellow')} />
                <span className="signal-light signal-red" />
              </div>
              {plan.featured ? (
                <Badge className="rounded-[0.7rem] px-3">
                  <Sparkles className="size-3.5" />
                  Рекомендуем
                </Badge>
              ) : null}
            </div>
          </div>

          <ul className="mt-6 space-y-3.5">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm leading-6 text-muted-foreground">
                <Check className="mt-1 size-4 shrink-0 text-primary" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <Button
            className="mt-7 w-full"
            variant={plan.featured ? 'default' : 'outline'}
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Начать с {plan.name.toLowerCase()}
          </Button>
        </div>
      ))}
    </SectionShell>
  )
}
