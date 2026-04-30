import { cn } from '@/lib/utils'

export function AssistantGuide({ className }: { className?: string }) {
  return (
    <div className={cn('relative flex size-18 items-center justify-center sm:size-24', className)}>
      <div className="absolute inset-0 rounded-[36%] bg-primary/12 blur-xl" />
      <div className="absolute right-0 top-1 flex items-center gap-1">
        <span className="signal-light signal-green" />
        <span className="signal-light signal-red" />
      </div>
      <div className="surface-panel orbit-glow relative flex size-full items-center justify-center rounded-[34%] bg-background/80">
        <div className="float-drift relative flex h-9 w-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_26px_-16px_var(--glow-blue)] sm:h-11 sm:w-16">
          <span className="absolute -left-1 top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-cyan-300/82" />
          <span className="absolute -right-1 top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-emerald-400/80" />
          <span className="h-1.5 w-5 rounded-full bg-primary-foreground/85 sm:w-6" />
        </div>
      </div>
    </div>
  )
}
