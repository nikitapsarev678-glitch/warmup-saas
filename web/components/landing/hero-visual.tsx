import { ArrowUpRight, Flame, MessageCircleMore, ScanSearch } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AssistantGuide } from '@/components/landing/assistant-guide'

const METRICS = [
  { label: 'Аккаунты в работе', value: '24', note: 'мягкий прогрев без скачков', icon: Flame },
  { label: 'Активные диалоги', value: '42', note: 'очереди и follow-up синхронизированы', icon: MessageCircleMore },
  { label: 'Новые сегменты', value: '186', note: 'parsing возвращает аудитории в цикл', icon: ScanSearch },
] as const

const NARRATIVE = [
  'Аккаунты подготавливаются спокойно и без резких паттернов.',
  'Сообщения, окна активности и follow-up собираются в один поток.',
  'Новые аудитории сразу возвращаются в сценарий, а не живут отдельно.',
] as const

export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[42rem]">
      <div className="absolute inset-x-[10%] top-[6%] h-[78%] rounded-[2.7rem] bg-[radial-gradient(circle_at_top,rgba(196,206,221,0.34),transparent_62%)] blur-3xl" />
      <div className="absolute -left-5 top-16 h-20 w-20 rounded-full bg-primary/10 blur-3xl sm:-left-10 sm:h-28 sm:w-28" />
      <div className="absolute -right-4 top-10 h-24 w-24 rounded-full bg-slate-300/28 blur-3xl sm:-right-10 sm:h-32 sm:w-32" />
      <div className="absolute left-[10%] top-[18%] hidden sm:block">
        <AssistantGuide className="size-14 opacity-90" />
      </div>

      <div className="surface-panel relative overflow-hidden rounded-[2.3rem] p-4 sm:p-5">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.44)_0%,rgba(255,255,255,0.18)_100%)]" />

        <div className="relative rounded-[1.9rem] border border-white/55 bg-background/76 p-5 shadow-[0_28px_90px_-56px_rgba(39,57,91,0.28)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-[28rem]">
              <Badge variant="outline" className="rounded-full border-border/65 bg-background/70 px-3 py-1 text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">
                Workflow clarity
              </Badge>
              <h3 className="mt-4 max-w-[12ch] text-[2rem] font-semibold tracking-[-0.05em] text-foreground sm:text-[2.45rem]">
                Спокойная система для живых messaging-сценариев
              </h3>
            </div>

            <div className="min-w-[12rem] rounded-[1.35rem] border border-border/60 bg-white/58 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Состояние цикла</div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">Stable</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Прогрев, outreach и parsing двигаются в одном темпе.</p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <Card className="border-border/70 bg-white/58 shadow-none">
              <CardContent className="pt-5">
                <div className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Как ощущается работа</div>
                <div className="mt-4 space-y-3">
                  {NARRATIVE.map((item, index) => (
                    <div
                      key={item}
                      className="rounded-[1.2rem] border border-border/65 bg-background/70 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.42)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          0{index + 1}
                        </div>
                        <p className="text-sm leading-6 text-foreground/82 sm:text-[0.97rem]">{item}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              {METRICS.map((item) => (
                <Card key={item.label} className="border-border/70 bg-white/58 shadow-none">
                  <CardContent className="flex items-start gap-4 pt-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-[1rem] bg-primary/10 text-primary">
                      <item.icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="text-2xl font-semibold tracking-[-0.04em] text-foreground">{item.value}</div>
                        <ArrowUpRight className="size-4 text-muted-foreground" />
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.note}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
