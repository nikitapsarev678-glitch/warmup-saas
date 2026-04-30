# Фаза 13 — Deploy Guide (деплой в продакшн)

> Читай SPEC.md перед началом. Все предыдущие фазы должны быть выполнены.  
> Эта фаза — инструкция по деплою. Не создаёт бизнес-логику.  
> Порядок важен: сначала D1 → Worker → Pages → Secrets → Runner.

## Цель
Задеплоить Varmup в продакшн:
- Cloudflare Workers (API)
- Cloudflare Pages (фронт)
- Cloudflare D1 (база данных)
- GitHub Actions (Python runner)

---

## Шаг 0 — Предварительные требования

```bash
# Убедиться что всё установлено:
node --version    # >= 20
python --version  # >= 3.11
wrangler --version  # >= 3.x

# Залогиниться в Cloudflare:
wrangler login

# Проверить аккаунт:
wrangler whoami
```

---

## Шаг 1 — Создать D1 базу данных

```bash
# Создать базу в Cloudflare D1:
wrangler d1 create warmup-saas

# Вывод покажет database_id — СКОПИРОВАТЬ ЕГО
# Пример вывода:
# Created database 'warmup-saas' (id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)

# Вставить database_id в worker/wrangler.toml:
# [[d1_databases]]
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  <-- сюда
```

---

## Шаг 2 — Применить все миграции к D1

```bash
cd worker/

# Применить все миграции последовательно:
wrangler d1 execute warmup-saas --remote --file=migrations/0001_init.sql
wrangler d1 execute warmup-saas --remote --file=migrations/0002_ai_dialogs.sql
wrangler d1 execute warmup-saas --remote --file=migrations/0003_tokens.sql
wrangler d1 execute warmup-saas --remote --file=migrations/0004_account_detail.sql
wrangler d1 execute warmup-saas --remote --file=migrations/0005_proxies.sql

# Проверить что таблицы созданы:
wrangler d1 execute warmup-saas --remote --command="SELECT name FROM sqlite_master WHERE type='table'"
# Должно показать: saas_users, tg_accounts, campaigns, ...

# Проверить тарифные планы:
wrangler d1 execute warmup-saas --remote --command="SELECT * FROM plan_limits"
# Должно показать 5 строк: free, starter, basic, pro, agency
```

---

## Шаг 3 — Установить secrets для Worker

```bash
cd worker/

# Обязательные секреты (вводятся интерактивно, не хранятся в коде):

wrangler secret put JWT_SECRET
# Введи случайную строку 32+ символа (генерировать: openssl rand -base64 32)

wrangler secret put TELEGRAM_BOT_TOKEN
# Токен бота (@BotFather). Этот бот используется для Telegram Login Widget.
# Важно: в @BotFather → Bot Settings → Allow Groups: off, Domain: warmup-saas.pages.dev

wrangler secret put ROBOKASSA_MERCHANT_ID
# ID магазина в личном кабинете Robokassa

wrangler secret put ROBOKASSA_SECRET1
# Secret1 из кабинета Robokassa → Технические настройки

wrangler secret put ROBOKASSA_SECRET2
# Secret2 из кабинета Robokassa → Технические настройки

wrangler secret put GITHUB_PAT
# GitHub Personal Access Token
# Создать: GitHub → Settings → Developer settings → Fine-grained tokens
# Разрешения: Actions → Read and write (только для репозитория warmup-saas)

wrangler secret put GITHUB_REPO
# Формат: owner/repo (например: nikitapsarev/warmup-saas)

wrangler secret put GITHUB_WORKFLOW
# Имя workflow файла: warmup.yml
```

---

## Шаг 4 — Задеплоить Worker

```bash
cd worker/

# Собрать и задеплоить:
npm run deploy
# Эквивалентно: wrangler deploy

# Вывод покажет URL:
# Deployed warmup-saas-api (version: xxx)
# https://warmup-saas-api.<your-subdomain>.workers.dev

# Проверить:
curl https://warmup-saas-api.<your-subdomain>.workers.dev/
# Должно вернуть: {"ok":true,"service":"warmup-saas-api"}

# СОХРАНИТЬ URL WORKER — он нужен для фронта
```

---

## Шаг 5 — Настроить Custom Domain для Worker (опционально)

```bash
# В Cloudflare Dashboard → Workers → warmup-saas-api → Triggers → Custom Domains:
# Добавить: api.warmup-saas.ru (или любой твой домен)
# DNS запись создастся автоматически если домен в Cloudflare

# Или через wrangler.toml добавить:
# [routes]
# pattern = "api.warmup-saas.ru/*"
# zone_name = "warmup-saas.ru"
```

---

## Шаг 6 — Задеплоить фронт на Cloudflare Pages

```bash
cd web/

# Создать .env.production.local:
# NEXT_PUBLIC_API_URL=https://warmup-saas-api.<your-subdomain>.workers.dev
# NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=<username_бота_без_@>

# Собрать:
npm run build

# Опция A — через CLI (разово):
npx wrangler pages deploy .next/
# Следовать инструкциям: создать проект, привязать к Cloudflare

# Опция B — через GitHub (рекомендуется):
# 1. Cloudflare Dashboard → Pages → Create project → Connect to Git
# 2. Выбрать репозиторий warmup-saas
# 3. Build settings:
#    Framework: Next.js
#    Build command: cd web && npm run build
#    Output directory: web/.next
# 4. Environment variables добавить:
#    NEXT_PUBLIC_API_URL = https://warmup-saas-api.<subdomain>.workers.dev
#    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = ваш_бот_username
# 5. Deploy!
```

---

## Шаг 7 — Настроить Telegram Login Widget

```bash
# 1. В BotFather — выполнить команду /setdomain
# 2. Выбрать своего бота
# 3. Ввести домен Pages без https://: warmup-saas.pages.dev (или свой)
# БЕЗ этого шага кнопка "Войти через Telegram" не будет работать!

# Проверить:
# Открыть https://warmup-saas.pages.dev/login
# Нажать кнопку Telegram — должно открыться окно авторизации
```

---

## Шаг 8 — Настроить GitHub Actions для Runner

```bash
# В репозитории GitHub → Settings → Secrets and variables → Actions:

# Repository secrets (добавить):
CF_ACCOUNT_ID        # Cloudflare Account ID (Dashboard → правый sidebar)
CF_DATABASE_ID       # ID D1 базы (из шага 1)
CF_API_TOKEN         # Cloudflare API Token
                     # Создать: Dashboard → My Profile → API Tokens → Create Token
                     # Template: Edit Cloudflare Workers, добавить D1: Edit

OPENROUTER_API_KEY   # API ключ от openrouter.ai (для AI-диалогов)
                     # Получить: openrouter.ai → Keys → Create

# Repository variables (переменные, не секреты):
AI_USE_PAID_MODEL = 0   # 0 = бесплатные модели, 1 = deepseek платный
```

---

## Шаг 9 — Проверить Robokassa webhook

```bash
# В кабинете Robokassa → Магазины → Технические настройки:
# ResultURL: https://warmup-saas-api.<subdomain>.workers.dev/billing/webhook
# Method: POST

# Проверить через Robokassa Test:
# Создать тестовый платёж через /billing/create-payment
# Убедиться что webhook получен и план обновился
```

---

## Шаг 10 — Smoke тест (финальная проверка)

```bash
# 1. Открыть лендинг:
curl -I https://warmup-saas.pages.dev/
# → 200 OK

# 2. API жив:
curl https://warmup-saas-api.<subdomain>.workers.dev/
# → {"ok":true,"service":"warmup-saas-api"}

# 3. Войти через Telegram:
# → Открыть /login, авторизоваться, попасть в /dashboard

# 4. Добавить аккаунт:
# → Вставить StringSession, убедиться что статус "active"

# 5. Создать кампанию:
# → Нажать "Старт", убедиться что триггернулся GitHub Actions workflow

# 6. GitHub Actions:
# → Перейти Actions → Warmup Runner → убедиться что job запустился
# → Через 1-2 минуты в /analytics появятся первые действия
```

---

## Настройка custom domain (опционально)

```bash
# Если нужен свой домен (warmup-saas.ru):
# 1. Добавить домен в Cloudflare (Nameservers → Cloudflare)
# 2. Pages: Settings → Custom domains → Add → warmup-saas.ru
# 3. Worker: wrangler.toml добавить routes или Custom Domain в Dashboard
# 4. Обновить NEXT_PUBLIC_API_URL и CORS в worker/src/index.ts

# В worker/src/index.ts обновить origins в cors():
app.use('*', cors({
  origin: ['https://warmup-saas.ru', 'https://www.warmup-saas.ru'],
  credentials: true,
}))
```

---

## CI/CD — GitHub Actions для автодеплоя Worker

Создать файл `.github/workflows/deploy-worker.yml`:

```yaml
name: Deploy Worker

on:
  push:
    branches: [main]
    paths: ['worker/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: worker/package-lock.json
      - run: cd worker && npm ci
      - run: cd worker && npm run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_DEPLOY_TOKEN }}
```

Создать файл `.github/workflows/deploy-web.yml`:

```yaml
name: Deploy Web

on:
  push:
    branches: [main]
    paths: ['web/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: web/package-lock.json
      - run: cd web && npm ci
      - run: cd web && npm run build
        env:
          NEXT_PUBLIC_API_URL: ${{ vars.API_URL }}
          NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: ${{ vars.TG_BOT_USERNAME }}
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_DEPLOY_TOKEN }}
          command: pages deploy web/.next --project-name=warmup-saas
```

---

## Мониторинг и логи

```bash
# Стримить логи Worker в реальном времени:
wrangler tail warmup-saas-api

# Посмотреть последние ошибки D1:
wrangler d1 execute warmup-saas --remote --command="
  SELECT * FROM task_queue WHERE status = 'error' ORDER BY id DESC LIMIT 10
"

# Посмотреть статусы кампаний:
wrangler d1 execute warmup-saas --remote --command="
  SELECT id, name, status, error_message FROM campaigns WHERE status = 'error'
"

# GitHub Actions history:
gh run list --workflow=warmup.yml --limit=10
```

---

## Acceptance criteria

- [ ] Worker задеплоен, отвечает на `/` с `{"ok":true}`
- [ ] D1 база создана, все 9 таблиц присутствуют, plan_limits = 5 строк
- [ ] Все Worker secrets установлены (`wrangler secret list` показывает их)
- [ ] Pages сайт открывается по URL, лендинг отображается корректно
- [ ] `/login` → Telegram Login Widget работает (не выдаёт ошибку домена)
- [ ] Авторизация через Telegram → пользователь создаётся в D1 (`SELECT * FROM saas_users`)
- [ ] Добавить аккаунт через StringSession → статус `active` в списке
- [ ] Создать кампанию → запустить → GitHub Actions job стартует
- [ ] GitHub Actions завершается успешно (зелёная галочка)
- [ ] После runner: в `warmup_actions` появились записи, аналитика обновилась
- [ ] Robokassa webhook URL настроен, тестовый платёж обновляет план
- [ ] `wrangler tail` показывает логи без ошибок при нормальных запросах
