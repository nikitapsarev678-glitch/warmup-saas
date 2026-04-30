import type { SaasUser } from '@/lib/types'
import { SidebarNav } from './sidebar-nav'

const NAV = [
  { href: '/dashboard', icon: 'dashboard', label: 'Дашборд' },
  { href: '/projects', icon: 'projects', label: 'Проекты' },
  { href: '/accounts', icon: 'accounts', label: 'Подключения' },
  { href: '/leads', icon: 'leads', label: 'Лиды' },
  { href: '/broadcasts', icon: 'broadcasts', label: 'Broadcasts' },
  { href: '/proxies', icon: 'proxies', label: 'Прокси' },
  { href: '/campaigns', icon: 'campaigns', label: 'Прогрев' },
  { href: '/analytics', icon: 'analytics', label: 'Аналитика' },
  { href: '/billing', icon: 'billing', label: 'Тариф и токены' },
  { href: '/settings', icon: 'settings', label: 'Настройки' },
] as const

export function Sidebar({ user }: { user: SaasUser }) {
  return (
    <aside className="workspace-shell relative hidden w-72 shrink-0 p-4 text-white lg:block">
      <div className="surface-panel relative flex h-[calc(100vh-2rem)] flex-col overflow-hidden border-white/8 bg-[linear-gradient(180deg,rgba(24,26,31,0.96)_0%,rgba(21,23,28,0.94)_100%)] text-white shadow-[18px_0_54px_-44px_rgba(7,10,18,0.62)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(118,140,180,0.12),transparent_24%),radial-gradient(circle_at_100%_12%,rgba(153,175,214,0.08),transparent_18%)] opacity-70" />

        <div className="relative m-3 rounded-[1.35rem] border border-white/10 bg-white/6 px-5 pb-5 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-white/52">Workspace</div>
              <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">Varmup</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="signal-light signal-green" />
              <span className="signal-light signal-red" />
            </div>
          </div>
          <div className="mt-3 text-xs text-white/45">
            Тариф: <span className="font-medium capitalize text-white/75">{user.plan}</span>
          </div>
        </div>

        <SidebarNav items={NAV} />

        <div className="relative mt-auto p-3">
          <div className="rounded-[1.25rem] border border-white/10 bg-white/7 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[0.9rem] border border-white/10 bg-white/8 text-xs font-medium text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                {getUserInitials(user)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">
                  {[user.first_name, user.last_name].filter(Boolean).join(' ') || 'User'}
                </div>
                {user.telegram_username && <div className="text-xs text-white/42">@{user.telegram_username}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function getUserInitials(user: SaasUser) {
  const source =
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
    user.telegram_username ||
    'U'

  return source.slice(0, 2).toUpperCase()
}
