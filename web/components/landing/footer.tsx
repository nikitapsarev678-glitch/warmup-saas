import Link from 'next/link'

import { AssistantGuide } from '@/components/landing/assistant-guide'

const FOOTER_COLUMNS = [
  {
    heading: 'Продукт',
    links: [
      { label: 'Как это работает', href: '#how-it-works' },
      { label: 'Возможности', href: '#capabilities' },
      { label: 'Тарифы', href: '#pricing' },
    ],
  },
  {
    heading: 'Сценарии',
    links: [
      { label: 'Прогрев аккаунтов', href: '#capabilities' },
      { label: 'Рассылки и follow-up', href: '#how-it-works' },
      { label: 'Импорт и работа с лидами', href: '#faq' },
    ],
  },
  {
    heading: 'Запуск',
    links: [
      { label: 'Войти', href: '/login' },
      { label: 'Запустить сценарий', href: '/login' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
] as const

export function Footer() {
  return (
    <footer className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="section-frame">
        <div className="surface-panel-soft dashed-panel pixel-frame p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
            <div>
              <Link href="/" className="flex items-center gap-3">
                <AssistantGuide className="size-12" />
                <div>
                  <div className="pixel-label text-[0.72rem] font-semibold">Varmup</div>
                  <div className="text-sm font-semibold">Прогрев аккаунтов и рассылки в Telegram</div>
                </div>
              </Link>
              <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
                Varmup помогает импортировать аккаунты, прогревать их, запускать рассылки и понимать, что происходит с каждым аккаунтом без ручного хаоса.
              </p>
            </div>

            {FOOTER_COLUMNS.map((column) => (
              <div key={column.heading}>
                <div className="flex items-center gap-2">
                  <div className="pixel-label text-[0.66rem] font-semibold">{column.heading}</div>
                  <span className="signal-light signal-green" />
                </div>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.href.startsWith('/') ? (
                        <Link href={link.href} className="transition-colors hover:text-foreground">
                          {link.label}
                        </Link>
                      ) : (
                        <a href={link.href} className="transition-colors hover:text-foreground">
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-2 border-t border-dashed border-border/70 pt-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Varmup. Прогрев, рассылки и контроль Telegram-аккаунтов в одном месте.</p>
            <p>Понятный интерфейс для команд, агентств и специалистов по трафику.</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
