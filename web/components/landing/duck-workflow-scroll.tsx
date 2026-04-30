'use client'

import { Flame, MessageSquareMore, ScanSearch, Waypoints } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { SectionShell } from '@/components/landing/section-shell'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const STEPS = [
  {
    title: 'Duck включает прогрев и поднимает trust-слой',
    body: 'Сначала оживают безопасные действия и мягкие лимиты: аккаунты не стартуют резко, а входят в рабочий ритм постепенно.',
    meta: 'Warm-up core',
    icon: Flame,
  },
  {
    title: 'Маршруты сообщений выстраиваются в один поток',
    body: 'Очереди, паузы и follow-up не расползаются по разным экранам — продукт показывает единый lane вокруг одной понятной сцены.',
    meta: 'Message routing',
    icon: MessageSquareMore,
  },
  {
    title: 'Parsing возвращает новые сегменты прямо в цикл',
    body: 'Новые аудитории и лиды не висят отдельно: они сразу попадают обратно в messaging workflow и усиливают следующий запуск.',
    meta: 'Parsing loop',
    icon: ScanSearch,
  },
  {
    title: 'Система собирается в один управляемый контур',
    body: 'Финал секции должен ощущаться как порядок после хаоса: один mascot, один экран, один ясный маршрут движения данных.',
    meta: 'Unified control',
    icon: Waypoints,
  },
] as const

export function DuckWorkflowScroll() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const section = sectionRef.current
    const video = videoRef.current
    if (!section || !video) return

    let frame = 0
    let visible = false

    const playVideo = async () => {
      try {
        await video.play()
      } catch {
        // Ignore autoplay rejections in non-user-driven contexts.
      }
    }

    const update = () => {
      frame = 0

      const rect = section.getBoundingClientRect()
      const viewport = window.innerHeight
      const total = rect.height - viewport
      const rawProgress = total <= 0 ? 0 : (viewport - rect.top) / total
      const progress = Math.min(Math.max(rawProgress, 0), 1)
      const isVisible = rect.top < viewport * 0.85 && rect.bottom > viewport * 0.2

      const nextIndex =
        progress >= 1
          ? STEPS.length - 1
          : Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length))
      setActiveIndex(nextIndex)

      if (isVisible && !visible) {
        visible = true
        playVideo()
      } else if (!isVisible && visible) {
        visible = false
        video.pause()
      }
    }

    const requestUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      video.pause()
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
    }
  }, [])

  const progressLabel = useMemo(() => `${String(activeIndex + 1).padStart(2, '0')} / ${String(STEPS.length).padStart(2, '0')}`, [activeIndex])

  return (
    <SectionShell
      id="duck-workflow"
      kicker="Duck Motion"
      title="Одна живая сцена показывает, как warm-up, outreach и parsing собираются в рабочий flow."
      description="Ролик остаётся в фокусе, а справа коротко показано, как вокруг утки собирается рабочий messaging flow."
      className="pt-0"
      contentClassName="mt-0"
    >
      <section ref={sectionRef} className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_24rem] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <div className="surface-panel pixel-frame relative overflow-hidden p-3 sm:p-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,var(--hero-from),transparent_22%),radial-gradient(circle_at_88%_10%,var(--hero-via),transparent_18%),linear-gradient(180deg,color-mix(in_oklab,var(--background)_88%,white_12%),color-mix(in_oklab,var(--background)_96%,transparent))]" />
            <div className="absolute inset-0 bg-noise opacity-35" />

            <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-background/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
                <div>
                  <div className="pixel-label text-[0.72rem] font-semibold">Duck workflow reel</div>
                  <div className="mt-1 text-sm font-medium text-foreground/72">Scroll-driven mascot section</div>
                </div>
                <div className="rounded-full border border-border/80 bg-background/72 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-primary">
                  {progressLabel}
                </div>
              </div>

              <div className="relative aspect-video bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(236,245,255,0.98))]">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  src="/media/duck-workflow.mp4"
                  muted
                  playsInline
                  loop
                  preload="metadata"
                />

                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
                  <div className="rounded-full border border-border/70 bg-background/82 px-3 py-1 text-[0.72rem] font-medium text-foreground/78">
                    2D mascot motion
                  </div>
                  <div className="rounded-full border border-border/70 bg-background/82 px-3 py-1 text-[0.72rem] font-medium text-foreground/78">
                    Routing visible
                  </div>
                  <div className="rounded-full border border-border/70 bg-background/82 px-3 py-1 text-[0.72rem] font-medium text-foreground/78">
                    Telegram-like mood
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:pt-2">
          {STEPS.map((step, index) => (
            <Card
              key={step.title}
              className={cn(
                'bg-background/70 transition-all duration-300',
                index === activeIndex
                  ? 'border-primary/30 shadow-[0_24px_60px_-36px_var(--glow-blue)]'
                  : 'border-border/70 bg-background/52'
              )}
            >
              <CardContent className="pt-5">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-[1.15rem] border bg-primary/10 text-primary transition-all duration-300',
                      index === activeIndex ? 'border-primary/30 scale-100' : 'border-border/70 scale-[0.98]'
                    )}
                  >
                    <step.icon className="size-5" />
                  </div>

                  <div className="min-w-0">
                    <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary/88">
                      {step.meta}
                    </div>
                    <h3 className="mt-2 text-lg font-semibold leading-snug text-foreground sm:text-[1.28rem]">
                      {step.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-[0.98rem] sm:leading-7">
                      {step.body}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </SectionShell>
  )
}
