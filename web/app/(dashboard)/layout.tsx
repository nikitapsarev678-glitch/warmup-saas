import { redirect } from 'next/navigation'
import { getMe } from '@/lib/auth'
import { Sidebar } from '@/components/sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getMe()
  if (!user) redirect('/login')

  return (
    <div className="workspace-shell flex min-h-screen text-foreground">
      <Sidebar user={user} />
      <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-5 lg:p-6">
        <div className="workspace-frame min-h-[calc(100vh-2rem)] p-3 sm:p-4 lg:p-5">
          <div className="workspace-inset min-h-[calc(100vh-4.5rem)] p-4 sm:p-5 lg:p-6">{children}</div>
        </div>
      </main>
    </div>
  )
}
