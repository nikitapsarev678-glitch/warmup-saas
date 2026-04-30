# Varmup — Master Specification

> Версия: 1.0 | Дата: 2026-04-26  
> Этот документ — точка входа для любого AI-агента или разработчика, берущего задание на реализацию любой фазы проекта.  
> **ВАЖНО:** Каждый агент работает ТОЛЬКО со своей фазой. Не трогай файлы других фаз без явного указания.

---

## Что это за продукт

**Varmup** — SaaS-платформа для автоматического прогрева Telegram-аккаунтов и рассылок. Пользователь добавляет свои аккаунты (через StringSession или ввод телефона + кода / импорт TData), настраивает задачу прогрева и рассылки, и система автоматически выполняет действия: вступление в группы, чтение, реакции, диалоги между аккаунтами, просмотр историй, отправка DM и (опционально) в группы/каналы. Всё с рандомными задержками для имитации живого поведения.

**Аналог:** contez.ru (раздел прогрева)  
**Рынок:** Россия, B2B (арбитражники, SMM-агентства, маркетологи)

> **Уточнение по UX (как в Contez):** в интерфейсе “кампания” = **задача прогрева** (task).  
> Опционально добавляется орг-слой **Проекты** для группировки аккаунтов и задач.

---

## Продуктовые принципы (чтобы ожидания совпали)

1) **Explainable by default**: любой “пауза/ошибка/бан/лимит/токены=0” должен иметь причину, таймер, следующее действие (кнопка/инструкция).  
2) **No silent failures**: если runner/очередь/прокси/токены ломают поток — пользователь видит это в UI и (опционально) получает TG‑уведомление.  
3) **Idempotency everywhere**: каждое действие (особенно списание токенов и отправка сообщений) должно иметь идемпотентный ключ, чтобы “повтор” не делал дубль.  
4) **Safety first**: лимиты, паузы, анти‑бан — часть продукта, а не “настройка где-то”.  
5) **MVP = Telegram only**: пока только Telegram. Другие каналы/комбайн Contez — не делаем, не отвлекаемся.  

## MVP Definition of Done (качество «как надо»)

MVP считается готовым, когда выполнены все пункты:

- **Онбординг**: новый пользователь без подсказок доходит до первого успеха за 10 минут: импорт TData → прогрев стартует → видно прогресс → “готово” → запускает 1 рассылку.  
- **Импорт TData**: поддержан обязательный путь “уже залогиненные аккаунты” + понятные ошибки (2FA/пароль/битый архив).  
- **Прокси**: прокси можно импортировать, назначить аккаунтам, проверить (alive/latency), и система использует их в runner.  
- **Прогрев**: задача прогрева управляемая (start/stop), прогресс и логи видны, аккаунты переходят по статусам, есть anti‑ban паузы + SpamBot check.  
- **Автопрогрев**: per‑account toggle “Автопрогрев” реально создаёт/поддерживает фоновые задачи по расписанию.  
- **Рассылки**: рассылка работает в DM и (по настройке) в группы/каналы; есть лимиты, авто‑пауза, auto‑switch аккаунтов; follow‑up на день 3 и 7.  
- **Токены**: токены списываются **по факту действий** (AI + обычные). При `balance=0` задачи паузятся с причиной, UI предлагает “Пополнить”, приходит уведомление.  
- **Batch check**: есть кнопка “Проверить все” и cron‑проверка по расписанию; виден итог.  
- **Уведомления**: TG‑уведомления на ключевые события включены по умолчанию, настраиваются, не спамят (дедуп).  
- **Multi-tenant**: ни один запрос/таблица не допускает утечки между пользователями (`WHERE user_id=?` везде).  

---

## Как AI понимает прогресс фаз (обязательно)

Чтобы AI не “угадывал” фазу по структуре файлов:
- Источник истины: `PHASE_STATUS.json` и `PHASE_STATUS.md` в корне репозитория.
- После завершения фазы всегда обновляй:
  - `PHASE_STATUS.json.phases["NN"] = "done"`
  - `last_completed_phase` и `current_phase`

Утилита (необязательно, но удобно):
- `python3 scripts/phase_status.py` — печатает `next_phase` и отсутствующие “evidence” файлы.

---

## Тарифные планы

| План | Цена | Аккаунты | Дней прогрева | Фичи |
|------|------|----------|---------------|------|
| Бесплатный | 0 руб | 1 | 3 | Базовый прогрев |
| Стартовый | 790 руб/мес | 5 | 14 | Все действия, статистика |
| Базовый | 1 690 руб/мес | 20 | 30 | + Кастомные сценарии, расширенная аналитика |
| Профессиональный | 2 490 руб/мес | 100 | 60 | + API доступ, приоритетная поддержка |
| Агентский | 4 490 руб/мес | 500 | Без лимита | VIP поддержка, white-label |

---

## Технический стек

```
Frontend:   Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui (+ Geist font, system theme)
Backend:    Cloudflare Workers (TypeScript, Hono framework)
Database:   Cloudflare D1 (SQLite-compatible)
Auth:       Telegram Login Widget → JWT в cookie (httpOnly)
Payments:   Robokassa
Runner:     Python 3.11 + Telethon → GitHub Actions
Deploy:     Cloudflare Pages (frontend) + Cloudflare Workers (API)
Storage:    Cloudflare R2 (аватары, логи)
```

### Почему такой стек
- Cloudflare Workers + D1: serverless, дешево, тот же паттерн что в nail-parser (не надо учить новое)
- GitHub Actions runner: бесплатный хостинг для Python/Telethon, уже проверен в nail-parser
- Next.js 15: App Router + Server Actions = меньше кода, лучше SEO
- shadcn/ui: готовые компоненты, кастомизируемые, без лишних зависимостей

---

## Структура репозитория

```
warmup-saas/
├── SPEC.md                        ← этот файл
├── specs/
│   ├── phase-00-scaffold.md       ← Фаза 0: scaffold проекта
│   ├── phase-01-database.md       ← Фаза 1: D1 schema
│   ├── phase-02-auth.md           ← Фаза 2: Telegram auth
│   ├── phase-03-billing.md        ← Фаза 3: Robokassa биллинг
│   ├── phase-04-accounts.md       ← Фаза 4: управление аккаунтами
│   ├── phase-05-warmup-engine.md  ← Фаза 5: Python warmup runner
│   ├── phase-06-dashboard-ui.md   ← Фаза 6: веб-дашборд
│   ├── phase-07-analytics.md     ← Фаза 7: аналитика
│   ├── phase-08-landing.md        ← Фаза 8: лендинг
│   ├── phase-09-ai-dialogs.md     ← Фаза 9: AI-диалоги
│   ├── phase-10-tokens.md         ← Фаза 10: AI-токены
│   ├── phase-11-account-detail.md ← Фаза 11: детальная панель аккаунта (Sheet)
│   ├── phase-12-proxies.md        ← Фаза 12: менеджер прокси
│   ├── phase-13-deploy.md         ← Фаза 13: деплой-гайд
│   ├── phase-14-projects.md       ← Фаза 14: проекты (организация ресурсов)
│   ├── phase-15-account-import.md ← Фаза 15: импорт аккаунтов (TData/Session ZIP)
│   ├── phase-16-outreach-broadcast.md ← Фаза 16: рассылки (MVP как nail-parser)
│   ├── phase-17-automation-notifications.md ← Фаза 17: cron + Telegram уведомления
│   ├── phase-18-token-metering.md ← Фаза 18: списание токенов по факту
│   ├── phase-19-proxy-checker.md  ← Фаза 19: проверка прокси (alive/latency)
│   ├── phase-20-ai-parsing.md     ← Фаза 20: платный AI‑парсинг лидов
│   └── phase-21-quality-launch.md ← Фаза 21: quality & launch checklist
│
├── worker/                        ← Cloudflare Worker (API бэкенд)
│   ├── src/
│   │   ├── index.ts               ← точка входа, роуты
│   │   ├── auth.ts                ← JWT middleware
│   │   ├── db.ts                  ← D1 query helpers
│   │   └── routes/
│   │       ├── auth.ts
│   │       ├── accounts.ts
│   │       ├── campaigns.ts
│   │       ├── billing.ts
│   │       └── analytics.ts
│   ├── migrations/
│   │   └── 0001_init.sql
│   └── wrangler.toml
│
├── web/                           ← Next.js фронтенд
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx               ← лендинг
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   └── (dashboard)/
│   │       ├── layout.tsx         ← sidebar + auth guard
│   │       ├── dashboard/page.tsx
│   │       ├── accounts/page.tsx
│   │       ├── campaigns/page.tsx
│   │       ├── analytics/page.tsx
│   │       └── billing/page.tsx
│   ├── lib/
│   │   ├── api.ts                 ← fetch-клиент к Worker API
│   │   └── types.ts               ← shared TypeScript типы
│   └── components/
│       ├── sidebar.tsx
│       └── ui/                    ← shadcn компоненты
│
└── runner/                        ← Python warmup engine
    ├── main.py                    ← точка входа
    ├── warmup.py                  ← логика прогрева
    ├── actions/
    │   ├── join_groups.py
    │   ├── read_messages.py
    │   ├── reactions.py
    │   ├── dialogs.py
    │   └── profile_setup.py
    ├── d1_client.py               ← REST клиент к D1
    └── requirements.txt
```

---

## API контракт (Worker → Frontend)

Все эндпоинты Worker: `https://api.varmup.workers.dev/` (placeholder)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | /auth/telegram | Верификация Telegram Login Widget |
| GET | /auth/me | Текущий пользователь |
| POST | /auth/logout | Выход |
| GET | /accounts | Список аккаунтов |
| POST | /accounts | Добавить аккаунт |
| DELETE | /accounts/:id | Удалить аккаунт |
| POST | /accounts/check-all | Batch-check статусов аккаунтов |
| POST | /accounts/import/init | Импорт: создать job + upload_url |
| POST | /accounts/import/:id/commit | Импорт: commit job → task_queue |
| GET | /accounts/import/:id | Импорт: статус и stats |
| GET | /campaigns | Список кампаний прогрева |
| POST | /campaigns | Создать кампанию |
| PUT | /campaigns/:id | Обновить кампанию |
| POST | /campaigns/:id/start | Запустить прогрев |
| POST | /campaigns/:id/stop | Остановить |
| GET | /campaigns/:id/progress | Прогресс (polling) |
| GET | /projects | Список проектов |
| POST | /projects | Создать проект |
| PUT | /projects/:id | Обновить проект |
| DELETE | /projects/:id | Удалить проект |
| GET | /analytics/summary | Общая статистика |
| GET | /analytics/accounts/:id | Статистика аккаунта |
| GET | /proxies | Список прокси |
| POST | /proxies/check | Проверка прокси (alive/latency) |
| GET | /broadcasts | Список рассылок |
| POST | /broadcasts | Создать рассылку |
| PUT | /broadcasts/:id | Обновить рассылку |
| POST | /broadcasts/:id/start | Запуск рассылки |
| POST | /broadcasts/:id/stop | Остановить рассылку |
| GET | /broadcasts/:id/progress | Прогресс |
| GET | /broadcasts/:id/logs | Логи |
| POST | /leads/import | Импорт лидов (ручной) |
| POST | /parsing/start | AI‑парсинг лидов (платно) |
| GET | /parsing/:id | Статус парсинга |
| GET | /notifications/settings | Настройки уведомлений |
| PUT | /notifications/settings | Обновить настройки |
| POST | /billing/create-payment | Создать платёж Robokassa |
| POST | /billing/webhook | Вебхук от Robokassa |
| GET | /billing/plan | Текущий тариф пользователя |
| GET | /tokens/balance | Баланс токенов |
| GET | /tokens/transactions | История токенов |

---

## Карта файлов: кто что создаёт/модифицирует

> **Правило для каждого агента:** перед записью в файл — прочитай его текущее состояние.  
> Если файл уже создан другой фазой — добавляй аддитивно (новые функции, новые import-ы), не перезаписывай.

```
Файл                                        Создаёт    Модифицирует (аддитивно)
─────────────────────────────────────────────────────────────────────────────────
worker/src/index.ts                         Фаза 0     Фазы 2,3,4,7,10,12 (app.route)
worker/src/db.ts                            Фаза 1     Фаза 10 (token helpers в конец)
worker/src/routes/auth.ts                   Фаза 2     —
worker/src/routes/billing.ts               Фаза 3     Фаза 10 (handleTokenWebhook в webhook)
worker/src/routes/accounts.ts              Фаза 4     Фаза 11 (новые роуты: /id, /limits, /pause...)
worker/src/routes/campaigns.ts             Фаза 6     Фаза 9 (ai_* поля), Фаза 10 (spendTokens в /start)
worker/src/routes/analytics.ts             Фаза 7     —
worker/src/routes/tokens.ts                —          Фаза 10 (создаёт)
worker/src/routes/proxies.ts               —          Фаза 12 (создаёт)
worker/src/routes/projects.ts              —          Фаза 14 (создаёт)
worker/src/routes/accounts-import.ts        —          Фаза 15 (создаёт)
worker/src/routes/broadcasts.ts             —          Фаза 16 (создаёт)
worker/src/routes/leads.ts                  —          Фаза 16 (создаёт)
worker/src/routes/notifications.ts          —          Фаза 17 (создаёт)
worker/src/routes/parsing.ts                —          Фаза 20 (создаёт)
worker/src/middleware/requireAuth.ts       Фаза 2     —
worker/migrations/0001_init.sql            Фаза 1     —
worker/migrations/0002_ai_dialogs.sql      —          Фаза 9 (создаёт)
worker/migrations/0003_tokens.sql          —          Фаза 10 (создаёт)
worker/migrations/0004_account_detail.sql  —          Фаза 11 (создаёт)
worker/migrations/0005_proxies.sql         —          Фаза 12 (создаёт)
worker/migrations/0006_projects.sql        —          Фаза 14 (создаёт)
worker/migrations/0007_account_import.sql  —          Фаза 15 (создаёт)
worker/migrations/0008_outreach.sql        —          Фаза 16 (создаёт)
worker/migrations/0009_notifications.sql   —          Фаза 17 (создаёт)
worker/migrations/0010_token_usage.sql     —          Фаза 18 (создаёт)
worker/migrations/0011_parsing.sql         —          Фаза 20 (создаёт)

web/app/page.tsx                           Фаза 0     Фаза 8 (полная замена на лендинг)
web/app/(auth)/login/page.tsx              Фаза 2     —
web/app/(dashboard)/layout.tsx             Фаза 2     —
web/app/(dashboard)/dashboard/page.tsx     Фаза 6     —
web/app/(dashboard)/accounts/page.tsx      Фаза 4     Фаза 11 (useState + AccountSheet)
web/app/(dashboard)/accounts/add-account-dialog.tsx  Фаза 4  —
web/app/(dashboard)/accounts/account-sheet.tsx  —    Фаза 11 (создаёт)
web/app/(dashboard)/campaigns/page.tsx     Фаза 6     —
web/app/(dashboard)/campaigns/new/page.tsx Фаза 6     Фаза 9 (AI-блок в форму)
web/app/(dashboard)/analytics/page.tsx     Фаза 7     —
web/app/(dashboard)/billing/page.tsx       Фаза 3     Фаза 10 (TokensSection в конец)
web/app/(dashboard)/billing/tokens-section.tsx  —    Фаза 10 (создаёт)
web/app/(dashboard)/proxies/page.tsx       —          Фаза 12 (создаёт)
web/app/(dashboard)/projects/page.tsx      —          Фаза 14 (создаёт)
web/app/(dashboard)/accounts/import-dialog.tsx  —   Фаза 15 (создаёт)
web/app/(dashboard)/broadcasts/page.tsx    —          Фаза 16 (создаёт)
web/app/(dashboard)/leads/page.tsx         —          Фаза 16 (создаёт)
web/app/(dashboard)/settings/page.tsx      —          Фаза 6 (заглушка), Фаза 17 (настройки уведомлений)
web/components/sidebar.tsx                 Фаза 6     Фаза 12 (добавить /proxies в NAV)
web/components/landing/                    —          Фаза 8 (создаёт все файлы)
web/lib/api.ts                             Фаза 0     —
web/lib/types.ts                           Фаза 2     Фаза 10, Фаза 11 (добавить поля в конец)
web/lib/auth.ts                            Фаза 2     —

runner/main.py                             Фаза 0     Фаза 5 (полная реализация), Фаза 9 (SQL SELECT)
runner/warmup.py                           —          Фаза 5 (создаёт), Фаза 9 (_action_dialogs)
runner/d1_client.py                        Фаза 0     Фаза 5 (полная реализация)
runner/ai_client.py                        —          Фаза 9 (создаёт)
runner/requirements.txt                    Фаза 0     Фаза 5 (доп. пакеты)
runner/import_accounts.py                  —          Фаза 15 (создаёт)
runner/broadcasts.py                       —          Фаза 16 (создаёт)
runner/proxy_checker.py                    —          Фаза 19 (создаёт)
runner/parsing.py                          —          Фаза 20 (создаёт)

.github/workflows/warmup.yml               Фаза 0     Фаза 5 (schedule + inputs), Фаза 9 (env vars)
.github/workflows/deploy-worker.yml        —          Фаза 13 (создаёт)
.github/workflows/deploy-web.yml           —          Фаза 13 (создаёт)
```

---

## Граница между фазами (чтобы не конфликтовать)

```
Фаза 0  → создаёт структуру файлов-скелетов, НЕ пишет бизнес-логику
Фаза 1  → только migrations/0001_init.sql и db.ts helpers, НЕ трогает routes/
Фаза 2  → только auth.ts, middleware/requireAuth.ts, routes/auth.ts, login/page.tsx
Фаза 3  → только routes/billing.ts, billing/page.tsx; НЕ трогает accounts/campaigns
Фаза 4  → только routes/accounts.ts, accounts/page.tsx, add-account-dialog.tsx
Фаза 5  → только runner/ директория; НЕ трогает worker/ и web/
Фаза 6  → только web/(dashboard)/ компоненты и routes/campaigns.ts; НЕ трогает worker/routes/
Фаза 7  → только routes/analytics.ts, analytics/page.tsx
Фаза 8  → только web/app/page.tsx + web/components/landing/**; НЕ трогает dashboard/
Фаза 9  → АДДИТИВНО: runner/ai_client.py (new), warmup.py(_action_dialogs), main.py(SQL),
           campaigns.ts(ai_* поля), campaigns/new/page.tsx(AI блок), 0002_ai_dialogs.sql
Фаза 10 → АДДИТИВНО: tokens.ts (new), db.ts (token helpers), billing.ts (webhook),
           campaigns.ts (/start спендинг), billing/page.tsx (TokensSection), 0003_tokens.sql
Фаза 11 → АДДИТИВНО: accounts.ts (новые роуты), account-sheet.tsx (new),
           accounts/page.tsx (Sheet интеграция), 0004_account_detail.sql
Фаза 12 → АДДИТИВНО: proxies.ts (new), proxies/page.tsx (new),
           sidebar.tsx (NAV запись), 0005_proxies.sql
Фаза 13 → только deploy/*.yml (new), инструкции деплоя; НЕ трогает бизнес-логику
Фаза 14 → АДДИТИВНО: projects.ts (new), projects/page.tsx (new), 0006_projects.sql
Фаза 15 → АДДИТИВНО: accounts-import.ts (new), import-dialog.tsx (new),
           runner/import_accounts.py (new), 0007_account_import.sql
Фаза 16 → АДДИТИВНО: broadcasts.ts (new), leads.ts (new),
           broadcasts/page.tsx (new), leads/page.tsx (new), 0008_outreach.sql
Фаза 17 → АДДИТИВНО: notifications.ts (new), settings/page.tsx (настройки),
           0009_notifications.sql + cron triggers
Фаза 18 → АДДИТИВНО: 0010_token_usage.sql + идемпотентное списание в runner
Фаза 19 → АДДИТИВНО: proxy_checker.py (new) + /proxies/check
Фаза 20 → АДДИТИВНО: parsing.ts (new) + parsing.py (new) + 0011_parsing.sql
```

**Правило АДДИТИВНОЙ модификации:**  
Если фаза помечена АДДИТИВНО — агент обязан прочитать текущий файл, найти точку вставки и добавить код, не удаляя существующее.  
Файл `worker/src/index.ts` модифицируется каждой фазой одинаково: добавить `import` + `app.route(...)` в конец.

---

## Environment Variables

### Worker (wrangler secrets)
```
TELEGRAM_BOT_TOKEN      — токен бота для Telegram Login Widget
JWT_SECRET              — секрет для подписи JWT (32+ символа)
ROBOKASSA_MERCHANT_ID   — ID магазина в Robokassa
ROBOKASSA_SECRET1       — Secret1 из кабинета Robokassa
ROBOKASSA_SECRET2       — Secret2 из кабинета Robokassa
GITHUB_PAT              — PAT для workflow_dispatch (Actions: write)
GITHUB_REPO             — owner/repo
GITHUB_WORKFLOW         — warmup.yml
```

### Runner (GitHub Actions secrets)
```
CF_ACCOUNT_ID           — ID аккаунта Cloudflare
CF_DATABASE_ID          — ID D1 базы
CF_API_TOKEN            — Cloudflare API token (D1: edit)
```

---

## Ключевые инварианты (читать каждому агенту!)

1. **D1 — единственный источник правды.** Никакого in-memory стейта между запросами.
2. **Worker stateless.** Никаких глобальных Map/Set для хранения состояния пользователей.
3. **JWT в httpOnly cookie**, не в localStorage — защита от XSS.
4. **Tenant isolation:** каждый запрос к D1 ВСЕГДА добавляет `WHERE user_id = ?` через middleware. Никаких cross-tenant утечек.
5. **Telethon работает только в runner.** Worker никогда не подключается к MTProto напрямую.
6. **Robokassa webhook** проверяется через MD5 подпись — никогда не доверяй телу запроса без проверки.
7. **Лимиты тарифа проверяются на Worker**, не на фронтенде — фронт может быть обойдён.

---

## Статус‑машины (обязательно для консистентности)

### Account (`tg_accounts.status`)
- `pending` → `active` → `warming` → `warmed`
- `active|warming|warmed` → `spam_block` (временный) → `active` (после паузы)
- `*` → `disabled` (ручное выключение)
- `*` → `banned` (перманент)

### Warmup task (`campaigns.status`)
- `idle` → `running` → `completed`
- `running` → `paused` (reason: tokens/limits/manual/spam_block)
- `running` → `error` (неожиданная системная ошибка)

### Broadcast (`broadcasts.status`, фаза 16)
- `draft` → `queued` → `running` → `completed`
- `running` → `paused` (tokens/limits/health)
- `running` → `error`

### Import job (`account_import_jobs.status`, фаза 15)
- `pending` → `uploaded` → `queued` → `running` → `done`
- `running` → `action_required` (нужен код/2FA/пароль от пользователя)
- `*` → `error`

### Proxy (`proxies.status`)
- `unknown` → `active|dead`

---

## Идемпотентность (обязательный механизм)

В D1 храним ключи, чтобы повторы runner не создавали дубликаты:
- для отправок: `broadcast_id + lead_id + step` UNIQUE
- для списаний токенов: `idempotency_key` UNIQUE в `token_usage_events`

---

## Порядок выполнения фаз

```
Фаза 0 (scaffold) ──┐
                    ↓
Фаза 1 (database) ──┤
                    ├──→ Фаза 2 (auth) ──────→ Фаза 3 (billing + tokens)
                    │                              ↓
                    └──→ Фаза 5 (runner)    Фаза 4 (accounts)
                                                   ↓
                                             Фаза 6 (UI)
                                                   ↓
                                             Фаза 7 (analytics)
                                                   ↓
                    ┌──────────────────────────────┤
                    ↓                              ↓
              Фаза 8 (landing)             Фаза 9 (AI dialogs)
                    ↓                              ↓
              Фаза 10 (tokens)            Фаза 11 (account detail)
                    ↓
              Фаза 12 (proxies)
                    ↓
              Фаза 13 (deploy)
                    ↓
              Фаза 14 (projects)    (опционально, но желательно как в Contez)
                    ↓
              Фаза 15 (account import) (опционально, для паритета с Contez)
                    ↓
              Фаза 16 (outreach/broadcast) (MVP: рассылки + follow-up)
                    ↓
              Фаза 18 (token metering) (по факту действий)
                    ↓
              Фаза 17 (automation+notifications) (cron + TG уведомления)
                    ↓
              Фаза 19 (proxy checker)
                    ↓
              Фаза 20 (AI parsing) (платный парсинг лидов)
                    ↓
              Фаза 21 (quality & launch) (чеклист качества)
```

Фазы 2 и 5 можно делать **параллельно** после Фазы 1.  
Фазы 3 и 4 можно делать **параллельно** после Фазы 2.  
Фазы 8–12 можно делать **параллельно** после Фазы 7.

---

## Ссылки на spec-файлы

- [Фаза 0 — Scaffold](specs/phase-00-scaffold.md)
- [Фаза 1 — Database Schema](specs/phase-01-database.md)
- [Фаза 2 — Auth](specs/phase-02-auth.md)
- [Фаза 3 — Billing](specs/phase-03-billing.md)
- [Фаза 4 — Accounts](specs/phase-04-accounts.md)
- [Фаза 5 — Warmup Engine](specs/phase-05-warmup-engine.md)
- [Фаза 6 — Dashboard UI](specs/phase-06-dashboard-ui.md)
- [Фаза 7 — Analytics](specs/phase-07-analytics.md)
- [Фаза 8 — Landing Page](specs/phase-08-landing.md)
- [Фаза 9 — AI Dialogs](specs/phase-09-ai-dialogs.md)
- [Фаза 10 — Token System](specs/phase-10-tokens.md)
- [Фаза 11 — Account Detail Panel](specs/phase-11-account-detail.md)
- [Фаза 12 — Proxy Manager](specs/phase-12-proxies.md)
- [Фаза 13 — Deploy Guide](specs/phase-13-deploy.md)
- [Фаза 14 — Projects](specs/phase-14-projects.md)
- [Фаза 15 — Account Import](specs/phase-15-account-import.md)
- [Фаза 16 — Outreach / Broadcast](specs/phase-16-outreach-broadcast.md)
- [Фаза 17 — Automation + Notifications](specs/phase-17-automation-notifications.md)
- [Фаза 18 — Token Metering](specs/phase-18-token-metering.md)
- [Фаза 19 — Proxy Checker](specs/phase-19-proxy-checker.md)
- [Фаза 20 — AI Parsing](specs/phase-20-ai-parsing.md)
- [Фаза 21 — Quality & Launch](specs/phase-21-quality-launch.md)
