'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type NavItem = {
  href: string
  icon: string
  label: string
}

export function SidebarNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="relative flex-1 space-y-1.5 p-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'group flex items-center gap-3 rounded-[1rem] border border-transparent px-3 py-2.5 text-sm transition-all duration-200',
            pathname.startsWith(item.href)
              ? 'border-white/10 bg-white/8 font-medium text-white shadow-[0_12px_26px_-24px_rgba(120,146,196,0.4)]'
              : 'text-white/56 hover:border-white/8 hover:bg-white/5 hover:text-white/88'
          )}
        >
          <AppGlyph kind={item.icon} active={pathname.startsWith(item.href)} />
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}

function AppGlyph({ kind, active }: { kind: string; active: boolean }) {
  return (
    <span
      className={cn(
        'relative flex h-8 w-8 shrink-0 items-center justify-center',
        active ? 'text-sky-300' : 'text-white/58 group-hover:text-sky-200'
      )}
      aria-hidden="true"
    >
      <span className="absolute left-1 top-0 h-px w-3 bg-current opacity-80" />
      <span className="absolute bottom-0 right-1 h-px w-3 bg-current opacity-55" />
      <GlyphShape kind={kind} active={active} />
    </span>
  )
}

function GlyphShape({ kind, active }: { kind: string; active: boolean }) {
  const stroke = active ? 'border-sky-300' : 'border-current'
  const fill = active ? 'bg-sky-300' : 'bg-current'

  switch (kind) {
    case 'dashboard':
      return (
        <span className="grid h-4.5 w-4.5 grid-cols-2 gap-1">
          <span className={cn('rounded-[1px] border', stroke)} />
          <span className={cn('rounded-[1px] border', stroke)} />
          <span className={cn('rounded-[1px] border', stroke)} />
          <span className={cn('rounded-[1px] border', stroke)} />
        </span>
      )
    case 'projects':
      return (
        <span className="relative h-4.5 w-5">
          <span className={cn('absolute bottom-0 left-0 h-3.5 w-4.5 rounded-[2px] border', stroke)} />
          <span className={cn('absolute left-1 top-0 h-1.5 w-2.5 rounded-t-[2px] border border-b-0', stroke)} />
        </span>
      )
    case 'accounts':
      return (
        <span className="relative h-4.5 w-5">
          <span className={cn('absolute left-0 top-1/2 h-px w-3.5 -translate-y-1/2', fill)} />
          <span className={cn('absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border', stroke)} />
          <span className={cn('absolute right-1 top-0 h-4.5 w-px', fill)} />
        </span>
      )
    case 'leads':
      return (
        <span className="relative h-5 w-5">
          <span className={cn('absolute left-1/2 top-0 h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-[2px] border', stroke)} />
          <span className={cn('absolute left-1/2 top-1.5 h-1 w-1 -translate-x-1/2 rounded-full', fill)} />
        </span>
      )
    case 'broadcasts':
      return (
        <span className="relative h-4.5 w-5">
          <span className={cn('absolute left-0 top-1/2 h-px w-2 -translate-y-1/2', fill)} />
          <span className={cn('absolute left-2 top-1 h-2.5 w-2.5 rounded-[2px] border', stroke)} />
          <span className={cn('absolute right-0 top-0.5 h-1 w-1 rounded-full', fill)} />
          <span className={cn('absolute right-0 bottom-0.5 h-1 w-1 rounded-full', fill)} />
        </span>
      )
    case 'proxies':
      return (
        <span className="relative h-5 w-4.5">
          <span className={cn('absolute inset-x-0 top-0 h-2.5 rounded-t-[3px] border border-b-0', stroke)} />
          <span className={cn('absolute bottom-0 left-0 right-0 h-3.5 rounded-b-[4px] border', stroke)} />
          <span className={cn('absolute left-1/2 top-1.5 h-1 w-1 -translate-x-1/2 rounded-full', fill)} />
        </span>
      )
    case 'campaigns':
      return (
        <span className="relative h-5 w-4.5">
          <span className={cn('absolute bottom-0 left-1/2 h-4 w-px -translate-x-1/2', fill)} />
          <span className={cn('absolute bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border', stroke)} />
          <span className={cn('absolute bottom-2.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full', fill)} />
        </span>
      )
    case 'analytics':
      return (
        <span className="flex h-4.5 w-5 items-end gap-0.5">
          <span className={cn('h-2 w-px', fill)} />
          <span className={cn('h-3 w-px', fill)} />
          <span className={cn('h-4.5 w-px', fill)} />
          <span className={cn('h-3.5 w-px', fill)} />
        </span>
      )
    case 'billing':
      return (
        <span className="relative h-5 w-5">
          <span className={cn('absolute inset-0 rounded-full border', stroke)} />
          <span className={cn('absolute left-1/2 top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2', fill)} />
          <span className={cn('absolute left-1/2 top-1 h-px w-2.5 -translate-x-1/2', fill)} />
        </span>
      )
    case 'settings':
      return (
        <span className="relative h-5 w-5">
          <span className={cn('absolute inset-[4px] rounded-full border', stroke)} />
          <span className={cn('absolute left-1/2 top-0 h-2 w-px -translate-x-1/2', fill)} />
          <span className={cn('absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2', fill)} />
          <span className={cn('absolute left-0 top-1/2 h-px w-2 -translate-y-1/2', fill)} />
          <span className={cn('absolute right-0 top-1/2 h-px w-2 -translate-y-1/2', fill)} />
        </span>
      )
    default:
      return <span className={cn('h-2.5 w-2.5 rounded-full border', stroke)} />
  }
}
