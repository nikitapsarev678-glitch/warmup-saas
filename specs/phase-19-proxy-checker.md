# Фаза 19 — Proxy Checker (статусы “работает/активный” как в Contez)

> Читай SPEC.md перед началом. Фазы 12 и 5 должны быть выполнены (proxies, runner).  
> Эта фаза добавляет проверку прокси (latency + alive/dead) и обновление статусов в D1.

## Цель
Сделать прокси‑менеджер “живым”:
- `status` = active/dead/unknown
- `latency_ms`
- `last_checked_at`
- в UI карточки “Всего / Работает / Активных”

---

## Runner action

Добавить `task_queue.action = 'check_proxies'`:
- runner берёт список прокси пользователя (или все `unknown`)
- для каждого делает тест (TCP connect + простой HTTP request через прокси)
- пишет результат в `proxies`

---

## Worker API

- `POST /proxies/check` → ставит задачу `check_proxies` (можно запускать кнопкой)

---

## Acceptance criteria

- [ ] “Проверить” на странице `/proxies` запускает проверку
- [ ] Таблица прокси показывает актуальные статусы и latency
- [ ] Ошибочные прокси помечаются `dead`
