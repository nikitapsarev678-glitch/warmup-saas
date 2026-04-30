import { AssistantGuide } from '@/components/landing/assistant-guide'

const ITEMS = [
  {
    code: '01',
    title: 'Прогрев Telegram-аккаунта',
    detail: 'Статусы, лимиты, мягкий старт',
  },
  {
    code: '02',
    title: 'Outreach',
    detail: 'Очередь, окна, follow-up',
  },
  {
    code: '03',
    title: 'Parsing',
    detail: 'Новые сегменты сразу в цикл',
  },
] as const

export function MiniWidgetsRail() {
  return (
    <div className="px-4 pt-3 sm:px-6 lg:px-8">
      <div className="section-frame grid gap-2.5 md:grid-cols-3">
        {ITEMS.map((item, index) => (
          <div key={item.code} className="surface-panel-soft dashed-panel pixel-frame flex items-start justify-between gap-4 px-4 py-3">
            <div>
              <div className="pixel-label text-[0.68rem] font-semibold">{item.code}</div>
              <div className="mt-2 text-sm font-semibold text-foreground">{item.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {index === 0 ? <AssistantGuide className="size-12 sm:size-14" /> : null}
              <div className="flex items-center gap-1.5">
                <span className="signal-light signal-green" />
                {index === 1 ? <span className="signal-light signal-yellow" /> : <span className="signal-light signal-red" />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
