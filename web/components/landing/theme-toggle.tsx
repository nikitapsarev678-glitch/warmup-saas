'use client'

import { Check, LaptopMinimal, MoonStar, SunMedium } from 'lucide-react'
import { useTheme } from 'next-themes'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

const THEMES = [
  { value: 'light', label: 'Светлая', icon: SunMedium },
  { value: 'dark', label: 'Тёмная', icon: MoonStar },
  { value: 'system', label: 'Системная', icon: LaptopMinimal },
] as const

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  const ActiveIcon = resolvedTheme === 'dark' ? MoonStar : SunMedium

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            className="border-border/80 bg-background/55 text-foreground shadow-[0_16px_40px_-30px_var(--glow-blue)] backdrop-blur-xl"
            aria-label="Переключить тему"
          />
        }
      >
        <ActiveIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44 rounded-2xl border border-border/80 bg-popover/92 p-1.5 shadow-[0_24px_60px_-34px_var(--glow-blue)] backdrop-blur-xl"
      >
        {THEMES.map((item) => (
          <DropdownMenuItem
            key={item.value}
            className="rounded-xl px-3 py-2.5"
            onClick={() => setTheme(item.value)}
          >
            <item.icon className="size-4" />
            <span>{item.label}</span>
            {theme === item.value ? <Check className="ml-auto size-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
