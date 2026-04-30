import Link from 'next/link'
import { ArrowRight, ShieldCheck } from 'lucide-react'

import { AssistantGuide } from '@/components/landing/assistant-guide'
import { Button } from '@/components/ui/button'

export function CtaSection() {
  return (
    <section className="section-padding pt-0">
      <div className="section-frame">
        <div className="surface-panel dashed-panel pixel-frame relative overflow-hidden px-6 py-10 sm:px-10 sm:py-12 lg:px-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,var(--hero-from),transparent_28%),radial-gradient(circle_at_85%_18%,var(--hero-via),transparent_24%)] opacity-90" />
          <div className="relative grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="flex items-center gap-4">
              <AssistantGuide className="size-16 sm:size-20" />
              <div>
                <div className="flex items-center gap-3">
                  <div className="pixel-label text-[0.72rem] font-semibold">Начало работы</div>
                  <span className="signal-light signal-green" />
                  <span className="signal-light signal-red" />
                </div>
                <h2 className="headline-section mt-2 text-[2.3rem] font-bold sm:text-[2.9rem] lg:text-[3.2rem] lg:leading-[1.02]">
                  Подключите аккаунты, прогрейте их и запускайте рассылки из одного кабинета.
                </h2>
              </div>
            </div>

            <div>
              <p className="text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Varmup нужен тем, кто хочет работать с Telegram-аккаунтами системно: без ручных таблиц, без постоянных переключений между инструментами и с понятным контролем над прогревом, рассылками и ограничениями.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <div className="surface-pill dashed-panel flex items-center gap-2 px-3 py-2">
                  <ShieldCheck className="size-4 text-primary" />
                  Плавный старт и понятные причины пауз
                </div>
                <div className="surface-pill dashed-panel px-3 py-2">Импорт аккаунтов, прокси, уведомления и контроль в одном месте</div>
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="px-5" nativeButton={false} render={<Link href="/login" />}>
                  Начать бесплатно
                  <ArrowRight className="size-4" />
                </Button>
                <Button size="lg" variant="outline" className="px-5" nativeButton={false} render={<Link href="/login" />}>
                  Войти в кабинет
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
