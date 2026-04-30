# Фаза 0 — Scaffold проекта

> Читай SPEC.md перед началом. Твоя задача: создать структуру файлов и базовые конфиги. НЕ пиши бизнес-логику.

## Цель
Создать рабочий skeleton: Worker возвращает `{"ok":true}` на GET `/`, Next.js показывает hello world, всё деплоится.

## Не трогай
- Никакую бизнес-логику (auth, accounts, campaigns и т.д.)
- Файлы других фаз

---

## Шаг 1 — Worker (Cloudflare Workers + Hono)

```bash
cd warmup-saas/
mkdir worker && cd worker
npm init -y
npm install hono
npm install -D wrangler typescript @cloudflare/workers-types
```

### worker/wrangler.toml
```toml
name = "warmup-saas-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "warmup-saas"
database_id = "REPLACE_WITH_REAL_ID"

[vars]
ENVIRONMENT = "production"
```

### worker/tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true
  }
}
```

### worker/src/index.ts
```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'

export interface Env {
  DB: D1Database
  JWT_SECRET: string
  TELEGRAM_BOT_TOKEN: string
  ROBOKASSA_MERCHANT_ID: string
  ROBOKASSA_SECRET1: string
  ROBOKASSA_SECRET2: string
  GITHUB_PAT: string
  GITHUB_REPO: string
  GITHUB_WORKFLOW: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({
  origin: ['http://localhost:3000', 'https://warmup-saas.pages.dev'],
  credentials: true,
}))

app.get('/', (c) => c.json({ ok: true, service: 'warmup-saas-api' }))

// Роуты будут подключены в следующих фазах:
// import authRoutes from './routes/auth'
// import accountsRoutes from './routes/accounts'
// app.route('/auth', authRoutes)
// app.route('/accounts', accountsRoutes)

export default app
```

### worker/package.json scripts
```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "db:init": "wrangler d1 execute warmup-saas --remote --file=migrations/0001_init.sql",
    "db:local": "wrangler d1 execute warmup-saas --local --file=migrations/0001_init.sql",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Шаг 2 — Next.js Frontend

```bash
cd warmup-saas/
npx create-next-app@latest web \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*"

cd web
npx shadcn@latest init
# Выбрать: Default style, Zinc color, CSS variables: yes

# Vercel-like typography + theme (как Railway/Clerk/Resend)
npm i next-themes geist

# Установить базовые компоненты
npx shadcn@latest add button card badge sidebar avatar dropdown-menu table
```

### web/lib/api.ts (базовый клиент — только skeleton)
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}
```

### web/.env.local
```
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=your_bot_username
```

### web/app/layout.tsx — базовый layout (system theme + Geist)
```tsx
import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'

export const metadata: Metadata = {
  title: 'Varmup — Прогрев и рассылки в Telegram',
  description: 'Автоматический прогрев Telegram-аккаунтов + рассылки с anti-ban и follow-up',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

### web/components/theme-provider.tsx (новый файл)
```tsx
'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ThemeProviderProps } from 'next-themes/dist/types'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

### web/app/page.tsx — временная заглушка лендинга
```tsx
export default function LandingPage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Varmup</h1>
        <p className="text-gray-500">Прогрев и рассылки в Telegram</p>
        <a href="/login" className="mt-6 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg">
          Войти
        </a>
      </div>
    </main>
  )
}
```

---

## Шаг 3 — Runner (Python skeleton)

```bash
cd warmup-saas/
mkdir runner && cd runner
```

### runner/requirements.txt
```
telethon==1.36.0
httpx==0.27.0
python-dotenv==1.0.1
```

### runner/main.py (skeleton)
```python
import argparse
import asyncio

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--campaign-id', type=int, help='ID кампании для запуска')
    parser.add_argument('--poll', action='store_true', help='Дрейнить очередь задач')
    args = parser.parse_args()

    if args.campaign_id:
        asyncio.run(run_campaign(args.campaign_id))
    elif args.poll:
        asyncio.run(poll_queue())
    else:
        print("Укажи --campaign-id=N или --poll")

async def run_campaign(campaign_id: int):
    print(f"[TODO] Запуск кампании {campaign_id}")

async def poll_queue():
    print("[TODO] Дрейн очереди задач")

if __name__ == '__main__':
    main()
```

### runner/d1_client.py (skeleton — реализация в Фазе 5)
```python
import os
import httpx

class D1Client:
    def __init__(self):
        self.account_id = os.environ['CF_ACCOUNT_ID']
        self.database_id = os.environ['CF_DATABASE_ID']
        self.api_token = os.environ['CF_API_TOKEN']
        self.base_url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/d1/database/{self.database_id}"

    async def execute(self, sql: str, params: list = None):
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/query",
                headers={"Authorization": f"Bearer {self.api_token}"},
                json={"sql": sql, "params": params or []},
            )
            r.raise_for_status()
            return r.json()['result'][0]['results']
```

---

## Шаг 4 — GitHub Actions workflow (skeleton)

### .github/workflows/warmup.yml
```yaml
name: Warmup Runner

on:
  workflow_dispatch:
    inputs:
      campaign_id:
        description: 'Campaign ID to run'
        required: true
        type: number

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r runner/requirements.txt
      - run: python runner/main.py --campaign-id=${{ inputs.campaign_id }}
        env:
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_DATABASE_ID: ${{ secrets.CF_DATABASE_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
```

---

## Acceptance criteria (как проверить что фаза готова)

- [ ] `cd worker && npm run dev` → Worker стартует на localhost:8787
- [ ] `curl localhost:8787/` → `{"ok":true,"service":"warmup-saas-api"}`
- [ ] `cd web && npm run dev` → Next.js стартует на localhost:3000
- [ ] `http://localhost:3000` → отображается заглушка лендинга
- [ ] `cd runner && python main.py` → выводит "Укажи --campaign-id=N или --poll"
- [ ] `npx tsc --noEmit` в worker/ → 0 ошибок
