import type { Metadata } from 'next'
import { GeistMono } from 'geist/font/mono'
import { IBM_Plex_Sans, Roboto_Condensed } from 'next/font/google'

import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
})

const robotoCondensed = Roboto_Condensed({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-heading',
})

export const metadata: Metadata = {
  title: 'Varmup — прогрев, outreach и parsing для messaging-команд',
  description:
    'Varmup помогает прогревать аккаунты, запускать outreach-рассылки и собирать аудитории в одном понятном messaging workflow.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${ibmPlexSans.variable} ${robotoCondensed.variable} ${GeistMono.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
