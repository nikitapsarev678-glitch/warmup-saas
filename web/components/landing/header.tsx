'use client'

import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ThemeToggle } from '@/components/landing/theme-toggle'
import { AssistantGuide } from '@/components/landing/assistant-guide'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '#how-it-works', label: 'Как это работает' },
  { href: '#capabilities', label: 'Возможности' },
  { href: '#pricing', label: 'Тарифы' },
  { href: '#faq', label: 'FAQ' },
]

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="pointer-events-none sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-5">
      <div
        className={cn(
          'pointer-events-auto mx-auto transition-all duration-300 ease-out',
          scrolled ? 'max-w-5xl' : 'max-w-6xl'
        )}
      >
        <div
          className={cn(
            'transition-all duration-300 ease-out',
            scrolled
              ? 'header-shell-scrolled'
              : 'rounded-[2rem] border border-border/35 bg-background/38 shadow-[0_18px_44px_-34px_var(--glow-blue)] backdrop-blur-md'
          )}
        >
          <div
            className={cn(
              'flex items-center justify-between gap-3 transition-all duration-300 ease-out',
              scrolled ? 'px-3 py-2 sm:px-4' : 'px-1 py-1 sm:px-2'
            )}
          >
            <Link
              href="/"
              className={cn(
                'flex items-center gap-3 px-3 py-2 transition-opacity hover:opacity-90',
                scrolled ? 'rounded-[0.95rem] text-slate-900' : 'rounded-[1rem] text-foreground'
              )}
            >
              <AssistantGuide className="size-10 sm:size-11" />
              <div>
                <div className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-primary/85">Varmup</div>
                <div className={cn('text-sm sm:text-[0.95rem]', scrolled ? 'font-medium text-slate-700' : 'font-semibold')}>
                  Прогрев аккаунтов и рассылки в Telegram
                </div>
              </div>
            </Link>

            <nav
              className={cn(
                'hidden items-center gap-1.5 p-1.5 backdrop-blur-xl lg:flex',
                scrolled
                  ? 'rounded-[1.1rem] border border-slate-200/85 bg-white/82 shadow-[0_16px_40px_-34px_rgba(15,23,42,0.18)]'
                  : 'rounded-[1.1rem] border border-border/55 bg-background/48 shadow-[0_12px_34px_-32px_var(--glow-blue)]'
              )}
            >
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'px-4 py-2 text-sm font-medium transition-colors',
                    scrolled
                      ? 'rounded-[0.85rem] text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                      : 'rounded-[0.85rem] text-muted-foreground hover:bg-background/70 hover:text-foreground'
                  )}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="hidden items-center gap-2 lg:flex">
              <ThemeToggle />
              <Button
                variant={scrolled ? 'outline' : 'ghost'}
                size="sm"
                className={cn(scrolled && 'border-slate-200 bg-white/70 text-slate-700 hover:bg-slate-100 hover:text-slate-950')}
                nativeButton={false}
                render={<Link href="/login" />}
              >
                Войти
              </Button>
              <Button size="sm" nativeButton={false} render={<Link href="/login" />}>
                Начать прогрев
              </Button>
            </div>

            <div className="flex items-center gap-2 lg:hidden">
              <ThemeToggle />
              <Button
                variant="outline"
                size="icon-sm"
                className="border-border/80 bg-background/55 backdrop-blur-xl"
                onClick={() => setMobileOpen((open) => !open)}
                aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'}
              >
                {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
              </Button>
            </div>
          </div>

          {mobileOpen ? (
            <div className="mx-1 mb-1 rounded-[1rem] border border-border/80 bg-background/82 p-3 shadow-[0_24px_60px_-34px_var(--glow-blue)] backdrop-blur-xl lg:hidden">
              <div className="space-y-1.5">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="block rounded-[0.82rem] px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="w-full"
                  nativeButton={false}
                  render={<Link href="/login" />}
                  onClick={() => setMobileOpen(false)}
                >
                  Войти
                </Button>
                <Button
                  className="w-full"
                  nativeButton={false}
                  render={<Link href="/login" />}
                  onClick={() => setMobileOpen(false)}
                >
                  Запустить сценарий
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
