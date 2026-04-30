# Фаза 8 — Landing Page (Маркетинговый сайт)

> Читай SPEC.md перед началом. Фаза 0 (scaffold) должна быть выполнена.  
> Эта фаза работает ТОЛЬКО с `web/app/page.tsx` и `web/components/landing/`.  
> НЕ трогай: `web/app/(dashboard)/`, `worker/`, `runner/`.

## Цель
Заменить заглушку лендинга (`web/app/page.tsx`) на полноценный маркетинговый сайт.
Лендинг должен:
1) Быть доступным **без регистрации** (публичная главная для ознакомления).
2) Показать “как работает” через **скролл‑визуализацию** (scrollytelling): при прокрутке виджет “залипает”, а шаги прогрева/рассылки меняются.
3) Конвертировать посетителя в пользователя (CTA “Войти через Telegram”).

Референс-ощущения (смешать, не копировать): Railway (мини‑виджеты), Clerk (sticky header меняет стиль на скролле), Neon (glow/градиенты), Resend (чистота и типографика).

---

## Структура страницы

```
/page.tsx (лендинг)
  ├── <Header />         — sticky header: на hero прозрачный, после скролла становится “панелью”
  ├── <HeroSection />    — hero (тёмный фон + мягкий neon glow)
  ├── <MiniWidgetsRail /> — мини‑виджеты сбоку (desktop only) как у Railway: “что делает система”
  ├── <StatsSection />   — цифры (аккаунтов прогрето, пользователей, действий)
  ├── <ScrollyHowItWorks /> — scrollytelling: pinned‑виджет + шаги прогрева (join/read/react/dialog/story)
  ├── <ScrollyBroadcast /> — scrollytelling: как устроена рассылка (список → лимиты → anti‑ban → follow‑up)
  ├── <FeaturesSection /> — 6 карточек возможностей
  ├── <PricingSection /> — 5 тарифных планов
  ├── <FaqSection />     — 6 частых вопросов
  ├── <CtaSection />     — финальный призыв к действию
  └── <Footer />         — ссылки, копирайт
```

Важно:
- На mobile scrollytelling упрощается: вместо pinned‑виджета показывать обычный пошаговый список.
- Весь лендинг поддерживает light/dark по **системной теме** (ThemeProvider на базе `next-themes` задаётся в Фазе 0).

---

## Установка зависимостей

```bash
cd web
npm install lucide-react
# shadcn компоненты (если ещё не установлены):
npx shadcn@latest add accordion badge button card separator
```

---

## Файл: web/app/page.tsx

```tsx
import { Header } from '@/components/landing/header'
import { HeroSection } from '@/components/landing/hero'
import { MiniWidgetsRail } from '@/components/landing/mini-widgets-rail'
import { StatsSection } from '@/components/landing/stats'
import { ScrollyHowItWorks } from '@/components/landing/scrolly-how-it-works'
import { ScrollyBroadcast } from '@/components/landing/scrolly-broadcast'
import { FeaturesSection } from '@/components/landing/features'
import { PricingSection } from '@/components/landing/pricing'
import { FaqSection } from '@/components/landing/faq'
import { CtaSection } from '@/components/landing/cta'
import { Footer } from '@/components/landing/footer'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <HeroSection />
        <MiniWidgetsRail />
        <StatsSection />
        <ScrollyHowItWorks />
        <ScrollyBroadcast />
        <FeaturesSection />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  )
}
```

---

## Файл: web/components/landing/header.tsx

```tsx
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Menu, X, Zap } from 'lucide-react'

const NAV_LINKS = [
  { href: '#how-it-works', label: 'Как работает' },
  { href: '#features', label: 'Возможности' },
  { href: '#pricing', label: 'Тарифы' },
  { href: '#faq', label: 'FAQ' },
]

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={[
        'sticky top-0 z-50 transition-colors',
        // как у Clerk: на hero — прозрачный, дальше — “панель”
        scrolled ? 'bg-background/80 backdrop-blur border-b' : 'bg-transparent',
      ].join(' ')}
    >
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          Varmup
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(l => (
            <a key={l.href} href={l.href}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">Войти</Button>
          </Link>
          <Link href="/login">
            <Button size="sm">Начать бесплатно</Button>
          </Link>
        </div>

        {/* Mobile burger */}
        <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-background px-4 py-4 space-y-3">
          {NAV_LINKS.map(l => (
            <a key={l.href} href={l.href}
              className="block text-sm text-gray-600 py-2"
              onClick={() => setMobileOpen(false)}>
              {l.label}
            </a>
          ))}
          <Link href="/login">
            <Button className="w-full mt-2">Начать бесплатно</Button>
          </Link>
        </div>
      )}
    </header>
  )
}
```

---

## Файл: web/components/landing/hero.tsx

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Shield, Zap, Clock } from 'lucide-react'

export function HeroSection() {
  return (
    <section className="pt-28 pb-20 px-4 text-center relative overflow-hidden">
      {/* Neon-like glow background (как Neon) */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background to-background" />
      <div
        className="absolute -top-24 left-1/2 -translate-x-1/2 -z-10 h-[520px] w-[520px] rounded-full blur-3xl opacity-40"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, rgba(59,130,246,0.35), transparent 55%),' +
            'radial-gradient(circle at 70% 60%, rgba(168,85,247,0.30), transparent 55%),' +
            'radial-gradient(circle at 50% 80%, rgba(34,197,94,0.20), transparent 55%)',
        }}
      />
      <div className="max-w-4xl mx-auto">
        <Badge variant="secondary" className="mb-6">
          🔥 Прогрев + рассылки без бана
        </Badge>

        <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
          Делай Telegram‑outreach{' '}
          <span className="text-primary">смело</span>.
        </h1>

        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
          Varmup прогревает аккаунты, держит лимиты/паузы, проверяет здоровье и запускает рассылки:
          DM + (по настройке) группы/каналы. Follow‑up на день 3 и 7 — из коробки.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link href="/login">
            <Button size="lg" className="gap-2 px-8">
              Начать бесплатно
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <a href="#how-it-works">
            <Button size="lg" variant="outline" className="px-8">
              Посмотреть демо
            </Button>
          </a>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-500" />
            Безопасно для аккаунтов
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-500" />
            Запуск за 2 минуты
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-500" />
            Работает 24/7 без участия
          </div>
        </div>
      </div>
    </section>
  )
}
```

---

## Файл: web/components/landing/stats.tsx

```tsx
const STATS = [
  { value: '50,000+', label: 'Аккаунтов прогрето', color: 'text-blue-600' },
  { value: '2,300+', label: 'Активных пользователей', color: 'text-green-600' },
  { value: '8,000,000+', label: 'Действий выполнено', color: 'text-purple-600' },
  { value: '99.2%', label: 'Uptime сервиса', color: 'text-orange-600' },
]

export function StatsSection() {
  return (
    <section className="py-16 px-4 border-y bg-gray-50">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {STATS.map((s) => (
          <div key={s.label}>
            <div className={`text-3xl md:text-4xl font-bold ${s.color} mb-2`}>{s.value}</div>
            <div className="text-sm text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

---

## Файл: web/components/landing/scrolly-how-it-works.tsx

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'

const STEPS = [
  { key: 'accounts', title: 'Подключения', desc: 'Добавьте аккаунты (StringSession / телефон) и прокси. Импорт TData — bulk.', badge: '01' },
  { key: 'warmup', title: 'Прогрев', desc: 'Join/read/react/story/dialogs с рандомными задержками и расписанием.', badge: '02' },
  { key: 'antiBan', title: 'Anti‑ban', desc: 'Лимиты, паузы, SpamBot check, авто‑отлёжка, health‑статусы.', badge: '03' },
  { key: 'ready', title: 'Готов к рассылкам', desc: 'После прогрева включается отправка + follow‑up (день 3 и 7).', badge: '04' },
]

export function ScrollyHowItWorks() {
  const [active, setActive] = useState(0)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    const els = itemRefs.current.filter(Boolean) as HTMLDivElement[]
    if (els.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0]
        if (!visible) return
        const idx = els.indexOf(visible.target as HTMLDivElement)
        if (idx >= 0) setActive(idx)
      },
      { root: null, threshold: [0.35, 0.55, 0.75] }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const current = useMemo(() => STEPS[active], [active])

  return (
    <section id="how-it-works" className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Как это работает</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Скролль ниже — виджет справа “залипает”, а шаги меняются (как Railway/Clerk).
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_420px] gap-10 items-start">
          {/* Steps (scroll) */}
          <div className="space-y-8">
            {STEPS.map((s, idx) => (
              <div
                key={s.key}
                ref={(el) => { itemRefs.current[idx] = el }}
                className={[
                  'rounded-2xl border p-6 transition-colors',
                  idx === active ? 'bg-muted/60 border-primary/30' : 'bg-background'
                ].join(' ')}
              >
                <div className="text-xs font-bold text-primary mb-2">ШАГ {s.badge}</div>
                <div className="text-lg font-semibold mb-1">{s.title}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>

          {/* Pinned widget (desktop) */}
          <div className="hidden lg:block sticky top-24">
            <Card className="p-6 rounded-2xl">
              <div className="text-xs text-muted-foreground mb-2">Визуализация</div>
              <div className="text-xl font-semibold mb-3">{current.title}</div>
              <div className="text-sm text-muted-foreground mb-6">{current.desc}</div>

              {/* Мини‑“панель” как в Contez/Railway */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">Статус</div>
                  <div className="font-medium mt-1">{active < 3 ? 'В процессе' : 'Готово'}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">Действие</div>
                  <div className="font-medium mt-1">
                    {['Подключение','Прогрев','Anti‑ban','Рассылка'][active]}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
```

---

## Файл: web/components/landing/scrolly-broadcast.tsx

Задача: в стиле “скролл‑демо” показать что MVP включает **рассылки** (как в `nail-parser`): отправка в ЛС и (опционально) в группы/каналы по настройкам пользователя, лимиты, anti‑ban, follow‑up.

Скелет (аналогично `ScrollyHowItWorks`, но шаги про рассылку):

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'

const STEPS = [
  { key: 'list', title: 'Список получателей', desc: 'Ручной импорт или платный AI‑парсинг групп/админов.' },
  { key: 'templates', title: 'Шаблоны', desc: 'Варианты сообщений + персонализация. (AI = токены).' },
  { key: 'limits', title: 'Лимиты и расписание', desc: 'Per‑account лимиты, рабочие часы, паузы, авто‑замена аккаунта.' },
  { key: 'send', title: 'Отправка', desc: 'DM / группы/каналы (по настройке). Логи, прогресс, ошибки.' },
  { key: 'followup', title: 'Follow‑up', desc: 'Авто‑догон на день 3 и 7 не ответившим.' },
]

export function ScrollyBroadcast() {
  const [active, setActive] = useState(0)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])
  useEffect(() => {
    const els = itemRefs.current.filter(Boolean) as HTMLDivElement[]
    const io = new IntersectionObserver((entries) => {
      const v = entries.filter(e => e.isIntersecting).sort((a,b) => (b.intersectionRatio??0)-(a.intersectionRatio??0))[0]
      if (!v) return
      const idx = els.indexOf(v.target as HTMLDivElement)
      if (idx >= 0) setActive(idx)
    }, { threshold: [0.35, 0.55, 0.75] })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  const current = useMemo(() => STEPS[active], [active])

  return (
    <section className="py-24 px-4 border-t">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_420px] gap-10 items-start">
        <div className="space-y-8">
          <h2 className="text-2xl md:text-3xl font-bold">Рассылки (MVP)</h2>
          {STEPS.map((s, idx) => (
            <div key={s.key} ref={(el) => { itemRefs.current[idx] = el }}
              className={['rounded-2xl border p-6', idx === active ? 'bg-muted/60 border-primary/30' : 'bg-background'].join(' ')}>
              <div className="text-lg font-semibold mb-1">{s.title}</div>
              <div className="text-sm text-muted-foreground">{s.desc}</div>
            </div>
          ))}
        </div>

        <div className="hidden lg:block sticky top-24">
          <Card className="p-6 rounded-2xl">
            <div className="text-xs text-muted-foreground mb-2">Pipeline</div>
            <div className="text-xl font-semibold mb-3">{current.title}</div>
            <div className="text-sm text-muted-foreground mb-6">{current.desc}</div>
            <div className="rounded-xl border p-3 text-sm">
              {['queued → running → done', 'rate limit → pause', 'tokens → pause + notify'][active] ?? 'logs → analytics'}
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
```

---

## Файл: web/components/landing/mini-widgets-rail.tsx

Мини‑виджеты вдоль страницы (как Railway). Поведение:
- Только desktop (`lg:`), чтобы не ломать mobile.
- “Плавающий” фиксированный rail справа, но в пределах читаемости (не перекрывает контент).
- Содержит 4–6 мини‑карточек: Прогрев / Рассылки / Anti‑ban / Прокси / Токены.

```tsx
import { Card } from '@/components/ui/card'

const WIDGETS = [
  { title: 'Прогрев', hint: 'join/read/react/dialogs', value: '24/7' },
  { title: 'Рассылки', hint: 'DM + follow-up', value: 'день 3/7' },
  { title: 'Anti‑ban', hint: 'лимиты + паузы', value: 'авто' },
  { title: 'Токены', hint: 'AI + действия', value: 'pay-as-you-go' },
]

export function MiniWidgetsRail() {
  return (
    <div className="hidden lg:block fixed right-8 top-24 z-40 w-60 pointer-events-none">
      <div className="space-y-3 pointer-events-auto">
        {WIDGETS.map((w) => (
          <Card key={w.title} className="p-3 rounded-xl">
            <div className="text-sm font-medium">{w.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{w.hint}</div>
            <div className="text-xs mt-2 text-primary">{w.value}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

## Файл: web/components/landing/features.tsx

```tsx
import { Shield, Zap, BarChart3, Users, Clock, Globe } from 'lucide-react'

const FEATURES = [
  {
    icon: Zap,
    color: 'text-blue-600 bg-blue-50',
    title: 'AI-диалоги',
    description: 'OpenRouter генерирует уникальные реалистичные диалоги между аккаунтами по выбранным темам.',
  },
  {
    icon: Shield,
    color: 'text-green-600 bg-green-50',
    title: 'Случайные задержки',
    description: 'Рандомные паузы между действиями имитируют живого пользователя. Telegram не подозревает автоматизации.',
  },
  {
    icon: Users,
    color: 'text-purple-600 bg-purple-50',
    title: 'Пул диалогов',
    description: 'Аккаунты переписываются между собой — самый эффективный способ прогрева trust-score.',
  },
  {
    icon: Globe,
    color: 'text-orange-600 bg-orange-50',
    title: 'Прокси поддержка',
    description: 'SOCKS5/HTTP прокси per-account. Bulk-импорт с автопроверкой. Интеграция с Proxy6.',
  },
  {
    icon: BarChart3,
    color: 'text-pink-600 bg-pink-50',
    title: 'Детальная аналитика',
    description: 'График действий по дням, разбивка по типам, прогресс каждого аккаунта в реальном времени.',
  },
  {
    icon: Clock,
    color: 'text-indigo-600 bg-indigo-50',
    title: 'Рабочие часы',
    description: 'Настройте время активности (например 9:00–22:00 МСК). За пределами окна аккаунты отдыхают.',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 px-4 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Всё что нужно для прогрева
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Ни одна другая платформа не даёт столько контроля над процессом прогрева
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white rounded-2xl p-6 border hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-xl ${f.color} flex items-center justify-center mb-4`}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

---

## Файл: web/components/landing/pricing.tsx

```tsx
'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'

const PLANS = [
  {
    id: 'free',
    name: 'Бесплатный',
    price: 0,
    period: null,
    accounts: 1,
    days: 3,
    features: ['1 аккаунт', '3 дня прогрева', 'Базовые действия', 'Статистика'],
    cta: 'Начать бесплатно',
    highlight: false,
  },
  {
    id: 'starter',
    name: 'Стартовый',
    price: 790,
    period: '/мес',
    accounts: 5,
    days: 14,
    features: ['5 аккаунтов', 'до 14 дней прогрева', 'Все действия', 'Детальная статистика', 'Прокси поддержка'],
    cta: 'Выбрать тариф',
    highlight: false,
  },
  {
    id: 'basic',
    name: 'Базовый',
    price: 1690,
    period: '/мес',
    accounts: 20,
    days: 30,
    features: ['20 аккаунтов', 'до 30 дней прогрева', 'AI-диалоги', 'Кастомные сценарии', 'Расширенная аналитика'],
    cta: 'Выбрать тариф',
    highlight: true,
    badge: 'Популярный',
  },
  {
    id: 'pro',
    name: 'Профессиональный',
    price: 2490,
    period: '/мес',
    accounts: 100,
    days: 60,
    features: ['100 аккаунтов', 'до 60 дней прогрева', 'API доступ', 'Приоритетная поддержка', 'Всё из Базового'],
    cta: 'Выбрать тариф',
    highlight: false,
  },
  {
    id: 'agency',
    name: 'Агентский',
    price: 4490,
    period: '/мес',
    accounts: 500,
    days: -1,
    features: ['500 аккаунтов', 'Без лимита дней', 'VIP поддержка', 'White-label возможность', 'Всё из Про'],
    cta: 'Связаться с нами',
    highlight: false,
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Прозрачные тарифы
          </h2>
          <p className="text-gray-500 text-lg">
            Начните бесплатно. Масштабируйтесь вместе с бизнесом.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-start">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-5 flex flex-col ${
                plan.highlight
                  ? 'border-blue-500 border-2 shadow-lg shadow-blue-100'
                  : 'border-gray-200'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-blue-600 text-white text-xs px-3">{plan.badge}</Badge>
                </div>
              )}

              <div className="mb-4">
                <div className="font-semibold text-gray-900 mb-1">{plan.name}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-gray-900">
                    {plan.price === 0 ? 'Бесплатно' : `${plan.price.toLocaleString('ru')} ₽`}
                  </span>
                  {plan.period && (
                    <span className="text-gray-400 text-sm">{plan.period}</span>
                  )}
                </div>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link href="/login">
                <Button
                  className="w-full"
                  variant={plan.highlight ? 'default' : 'outline'}
                  size="sm"
                >
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-400 mt-8">
          AI-токены для диалогов приобретаются отдельно. 400 токенов бесплатно при регистрации.
        </p>
      </div>
    </section>
  )
}
```

---

## Файл: web/components/landing/faq.tsx

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const FAQ = [
  {
    q: 'Безопасен ли прогрев для моих аккаунтов?',
    a: 'Да — мы используем случайные задержки, рабочие часы и разнообразие действий, чтобы имитировать живого пользователя. Наш алгоритм разработан с учётом ограничений Telegram API.',
  },
  {
    q: 'Что такое StringSession и как его получить?',
    a: 'StringSession — это строка авторизации Telethon. Запустите скрипт create_session.py из нашей документации, введите номер телефона и код — получите строку для вставки в форму.',
  },
  {
    q: 'Сколько аккаунтов можно прогревать одновременно?',
    a: 'Зависит от тарифа: 1 на бесплатном, до 500 на Агентском. Все аккаунты прогреваются параллельно через GitHub Actions.',
  },
  {
    q: 'Что происходит если аккаунт получил SpamBlock?',
    a: 'Система автоматически переводит аккаунт в статус "spam_block" и делает паузу. При FloodWait — временная пауза на указанное Telegram время. При бане — статус "banned", уведомление вам.',
  },
  {
    q: 'Можно ли использовать прокси для каждого аккаунта?',
    a: 'Да. Поддерживаются SOCKS5 и HTTP прокси. Можно задать прокси отдельно для каждого аккаунта через менеджер прокси.',
  },
  {
    q: 'Что такое AI-токены?',
    a: 'Токены расходуются при использовании AI-диалогов (OpenRouter генерирует реалистичные тексты). 400 токенов выдаются бесплатно. Дополнительные пакеты: от 50K токенов за 500 ₽.',
  },
]

export function FaqSection() {
  return (
    <section id="faq" className="py-20 px-4 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Частые вопросы
          </h2>
        </div>

        <Accordion type="single" collapsible className="space-y-3">
          {FAQ.map((item, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="bg-white border rounded-xl px-4 py-1"
            >
              <AccordionTrigger className="text-left font-medium text-gray-900 hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-gray-500 leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
```

---

## Файл: web/components/landing/cta.tsx

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export function CtaSection() {
  return (
    <section className="py-24 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Готовы начать прогрев?
        </h2>
        <p className="text-gray-500 text-lg mb-8">
          Зарегистрируйтесь через Telegram за 30 секунд.
          1 аккаунт и 3 дня прогрева — бесплатно, без карты.
        </p>
        <Link href="/login">
          <Button size="lg" className="gap-2 px-10">
            Начать бесплатно
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </section>
  )
}
```

---

## Файл: web/components/landing/footer.tsx

```tsx
import Link from 'next/link'
import { Zap } from 'lucide-react'

const LINKS = [
  {
    heading: 'Продукт',
    items: [
      { label: 'Как работает', href: '#how-it-works' },
      { label: 'Возможности', href: '#features' },
      { label: 'Тарифы', href: '#pricing' },
    ],
  },
  {
    heading: 'Поддержка',
    items: [
      { label: 'FAQ', href: '#faq' },
      { label: 'Документация', href: '/docs' },
      { label: 'Telegram-канал', href: 'https://t.me/warmupsaas' },
    ],
  },
  {
    heading: 'Компания',
    items: [
      { label: 'Политика конфиденциальности', href: '/privacy' },
      { label: 'Условия использования', href: '/terms' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 font-bold text-lg mb-3">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              Varmup
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              Автоматический прогрев Telegram аккаунтов для безопасного маркетинга.
            </p>
          </div>

          {LINKS.map((col) => (
            <div key={col.heading}>
              <h4 className="font-semibold text-gray-900 mb-3 text-sm">{col.heading}</h4>
              <ul className="space-y-2">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t pt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-sm text-gray-400">© 2026 Varmup. Все права защищены.</p>
          <p className="text-sm text-gray-400">Для маркетологов и арбитражников</p>
        </div>
      </div>
    </footer>
  )
}
```

---

## Acceptance criteria

- [ ] `http://localhost:3000/` — лендинг открывается, НЕ заглушка
- [ ] Навбар: логотип + 4 ссылки + кнопки "Войти" и "Начать бесплатно"
- [ ] Hero: заголовок, описание, 2 кнопки, 3 trust-badge
- [ ] Stats: 4 числа отображаются
- [ ] HowItWorks: 3 шага с иконками и соединительными линиями
- [ ] Features: 6 карточек с иконками
- [ ] Pricing: 5 тарифов, "Базовый" выделен синей рамкой с бейджем "Популярный"
- [ ] FAQ: аккордеон, при клике раскрывается ответ
- [ ] CTA: финальный экран с кнопкой
- [ ] Footer: 3 колонки ссылок + копирайт
- [ ] Мобильная адаптация: бургер-меню работает, колонки становятся 1-2
- [ ] Все `<Link href="/login">` ведут на страницу входа
- [ ] `npx tsc --noEmit` в web/ — 0 ошибок
