import { ArrowUpRight, Flame, MessageCircleMore, ScanSearch, ShieldCheck } from 'lucide-react'

const STATS = [
  { value: '24/7', label: 'автопрогрев и фоновые проверки аккаунтов', icon: Flame },
  { value: '3', label: 'ключевых режима: прогрев, рассылки и работа с лидами', icon: MessageCircleMore },
  { value: '1', label: 'кабинет вместо ручных таблиц, заметок и нескольких сервисов', icon: ShieldCheck },
  { value: '0', label: 'тихих ошибок: паузы и ограничения объясняются прямо в интерфейсе', icon: ScanSearch },
] as const

export function StatsSection() {
  return (
    <section className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="section-frame">
        <div className="surface-panel-soft grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4 xl:p-6">
          {STATS.map((stat) => (
            <div key={stat.label} className="dashed-panel pixel-frame rounded-[0.92rem] bg-background/54 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <stat.icon className="size-5" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="signal-light signal-green" />
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </div>
              </div>
              <div className="mt-5 text-3xl font-semibold tracking-tight">{stat.value}</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
