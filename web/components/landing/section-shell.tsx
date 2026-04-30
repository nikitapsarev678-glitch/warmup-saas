'use client'

import { cn } from '@/lib/utils'

export function SectionShell({
  id,
  kicker,
  title,
  description,
  align = 'left',
  className,
  contentClassName,
  children,
}: {
  id?: string
  kicker?: string
  title: string
  description?: string
  align?: 'left' | 'center'
  className?: string
  contentClassName?: string
  children?: React.ReactNode
}) {
  return (
    <section id={id} className={cn('section-padding scroll-mt-28', className)}>
      <div className="editorial-section">
        <div
          className={cn(
            'max-w-3xl',
            align === 'center' && 'mx-auto text-center'
          )}
        >
          {kicker ? (
            <div className={cn('flex items-center gap-3', align === 'center' && 'justify-center')}>
              <div className="rounded-full border border-border/70 bg-background/55 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">{kicker}</div>
            </div>
          ) : null}
          <h2 className="headline-section mt-3 text-[2.5rem] font-semibold tracking-[-0.05em] sm:text-[3.15rem] lg:text-[3.5rem] lg:leading-[1.01]">
            {title}
          </h2>
          {description ? (
            <p className="text-pretty mt-4 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              {description}
            </p>
          ) : null}
        </div>

        <div className={cn('mt-12', contentClassName)}>{children}</div>
      </div>
    </section>
  )
}
