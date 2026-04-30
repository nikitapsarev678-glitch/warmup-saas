import { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export function FeatureCard({
  icon: Icon,
  title,
  description,
  detail,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  detail?: string
  className?: string
}) {
  return (
    <div className={cn('surface-panel-soft h-full p-6 sm:p-7', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex size-12 items-center justify-center rounded-[1rem] bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="rounded-full border border-border/70 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Feature
        </div>
      </div>
      <h3 className="mt-6 text-xl font-semibold tracking-[-0.03em] text-foreground">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-[0.95rem] sm:leading-7">{description}</p>
      {detail ? <p className="mt-4 text-sm leading-6 text-foreground/72">{detail}</p> : null}
    </div>
  )
}
