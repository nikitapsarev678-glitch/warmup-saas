# Фаза 9 — AI Dialogs (OpenRouter + умные диалоги прогрева)

> Читай SPEC.md перед началом. Фаза 5 (warmup engine) должна быть выполнена.  
> Эта фаза расширяет `runner/` и добавляет один новый API-роут в `worker/`.  
> НЕ трогай: auth.ts, accounts.ts, billing.ts, analytics.ts, proxies.ts, tokens.ts.  
> **Трогай (аддитивно):** runner/warmup.py (метод _action_dialogs), runner/main.py (SQL запрос в run_campaign_day), worker/src/routes/campaigns.ts (ai_* поля в POST body и INSERT), web/campaigns/new/page.tsx (секция AI прогрева). Создаёт: runner/ai_client.py, migrations/0002_ai_dialogs.sql.

## Цель
Заменить рандомные фразы в `warmup.py::_action_dialogs()` на AI-генерированные диалоги через OpenRouter.
Добавить выбор темы и режима при создании кампании.

---

## Что меняется

### В базе данных (добавить в migrations/0002_ai_dialogs.sql)

```sql
-- Добавляем поля к campaigns для AI-диалогов
ALTER TABLE campaigns ADD COLUMN ai_dialog_enabled INTEGER NOT NULL DEFAULT 0;
  -- 1 = использовать OpenRouter для генерации сообщений
ALTER TABLE campaigns ADD COLUMN ai_topics TEXT NOT NULL DEFAULT '["daily_life"]';
  -- JSON-массив: "daily_life"|"work"|"hobbies"|"free_chat"
ALTER TABLE campaigns ADD COLUMN ai_mode TEXT NOT NULL DEFAULT '1_to_n';
  -- '1_to_1' = пары, '1_to_n' = все рандомно
ALTER TABLE campaigns ADD COLUMN ai_delay_preset TEXT NOT NULL DEFAULT 'medium';
  -- 'instant'|'fast'|'medium'|'slow'|'very_slow'|'max'|'custom'
ALTER TABLE campaigns ADD COLUMN ai_delay_min INTEGER NOT NULL DEFAULT 15;
  -- секунды, минимальная пауза между сообщениями
ALTER TABLE campaigns ADD COLUMN ai_delay_max INTEGER NOT NULL DEFAULT 45;
ALTER TABLE campaigns ADD COLUMN ai_messages_per_account INTEGER NOT NULL DEFAULT 20;
  -- лимит сообщений на аккаунт за всю кампанию
ALTER TABLE campaigns ADD COLUMN ai_dialogs_per_day INTEGER NOT NULL DEFAULT 10;
  -- диалогов в день на аккаунт
ALTER TABLE campaigns ADD COLUMN ai_series_min INTEGER NOT NULL DEFAULT 1;
  -- серия: мин сообщений подряд до ответа собеседника
ALTER TABLE campaigns ADD COLUMN ai_series_max INTEGER NOT NULL DEFAULT 3;
ALTER TABLE campaigns ADD COLUMN ai_reply_pct INTEGER NOT NULL DEFAULT 25;
  -- процент сообщений отправляемых как reply (ответ)
ALTER TABLE campaigns ADD COLUMN ai_delete_messages INTEGER NOT NULL DEFAULT 0;
  -- 1 = случайно удалять некоторые отправленные сообщения
```

---

## Файл: runner/ai_client.py (новый файл)

```python
"""
OpenRouter AI клиент для генерации реалистичных диалогов прогрева.
Используй модели с бесплатным тиром: meta-llama/llama-3.2-3b-instruct:free
или платные: deepseek/deepseek-chat (дешёвые).
"""
import os
import httpx
import json
import random
from typing import Literal

OPENROUTER_BASE = "https://openrouter.ai/api/v1"

# Модели по приоритету (первая доступная бесплатная)
FREE_MODELS = [
    "meta-llama/llama-3.2-3b-instruct:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "google/gemma-2-9b-it:free",
    "mistralai/mistral-7b-instruct:free",
]
PAID_MODEL = "deepseek/deepseek-chat"  # очень дешёвый, ~$0.14/M tokens

Topic = Literal["daily_life", "work", "hobbies", "free_chat"]

TOPIC_PROMPTS: dict[Topic, str] = {
    "daily_life": "Пиши о повседневных делах: покупки, еда, погода, планы на вечер, домашние дела.",
    "work": "Пиши о рабочих вопросах: задачи, проекты, встречи, коллеги, дедлайны.",
    "hobbies": "Пиши о хобби: спорт, кино, музыка, игры, путешествия, книги.",
    "free_chat": "Пиши свободно: шутки, мемы, случайные мысли, лёгкое общение.",
}

SYSTEM_PROMPT_TEMPLATE = """Ты — обычный человек в Telegram. Пишешь другу короткое сообщение.
Правила:
- Длина 1-2 предложения максимум
- Разговорный стиль, без пунктуации в конце если не нужна
- Иногда с опечатками или сокращениями (не всегда)
- На русском языке
- БЕЗ кавычек, БЕЗ пояснений — только само сообщение
- Тема: {topic_hint}
- Контекст диалога (если есть): {context}
"""

class AIClient:
    def __init__(self):
        self.api_key = os.environ.get('OPENROUTER_API_KEY', '')
        self.use_paid = os.environ.get('AI_USE_PAID_MODEL', '0') == '1'

    def _get_model(self) -> str:
        if self.use_paid:
            return PAID_MODEL
        return random.choice(FREE_MODELS)

    async def generate_message(
        self,
        topics: list[Topic],
        context: list[str] | None = None,
        is_reply: bool = False,
    ) -> str:
        """Генерирует одно сообщение для диалога прогрева."""
        topic = random.choice(topics) if topics else "daily_life"
        topic_hint = TOPIC_PROMPTS.get(topic, TOPIC_PROMPTS["daily_life"])
        context_str = "\n".join(context[-4:]) if context else "начало диалога"

        if is_reply and context:
            user_prompt = f"Ответь на последнее сообщение: {context[-1]}"
        else:
            user_prompt = "Напиши следующее сообщение в диалоге."

        payload = {
            "model": self._get_model(),
            "messages": [
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT_TEMPLATE.format(
                        topic_hint=topic_hint,
                        context=context_str,
                    )
                },
                {
                    "role": "user",
                    "content": user_prompt,
                }
            ],
            "max_tokens": 80,
            "temperature": 0.9,
        }

        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                f"{OPENROUTER_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "HTTP-Referer": "https://warmup-saas.pages.dev",
                    "X-Title": "Varmup",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if r.status_code != 200:
                # Fallback на рандомную фразу если OpenRouter недоступен
                return self._fallback_message(topic)
            
            data = r.json()
            msg = data['choices'][0]['message']['content'].strip()
            # Убираем кавычки если модель их добавила
            msg = msg.strip('"\'')
            return msg if msg else self._fallback_message(topic)

    def _fallback_message(self, topic: Topic) -> str:
        """Резервные сообщения если AI недоступен."""
        FALLBACKS = {
            "daily_life": [
                "Привет! Как дела?",
                "Что делаешь?",
                "Давно не писали 😊",
                "Всё норм у тебя?",
            ],
            "work": [
                "Как там с проектом?",
                "Успеваешь по дедлайну?",
                "Много работы сейчас?",
            ],
            "hobbies": [
                "Что смотришь сейчас?",
                "Играешь во что-нибудь?",
                "Как прошли выходные?",
            ],
            "free_chat": [
                "Привет 👋",
                "О, привет!",
                "Ну как оно?",
                "Привет, давно не виделись",
            ],
        }
        return random.choice(FALLBACKS.get(topic, FALLBACKS["free_chat"]))
```

---

## Изменения в runner/warmup.py

### Добавить import в начало файла

```python
from ai_client import AIClient
```

### Обновить метод `_action_dialogs` (заменить полностью)

```python
async def _action_dialogs(self, client, account_id: int, campaign_id: int, campaign_row: dict):
    """
    Генерирует AI-диалог с другим аккаунтом из пула кампании.
    campaign_row — строка из таблицы campaigns с ai_* полями.
    """
    import json as _json

    ai_enabled = bool(campaign_row.get('ai_dialog_enabled', 0))
    topics = _json.loads(campaign_row.get('ai_topics', '["daily_life"]'))
    series_min = campaign_row.get('ai_series_min', 1)
    series_max = campaign_row.get('ai_series_max', 3)
    reply_pct = campaign_row.get('ai_reply_pct', 25)
    delay_min = campaign_row.get('ai_delay_min', 15)
    delay_max = campaign_row.get('ai_delay_max', 45)

    try:
        # Найти другой активный аккаунт кампании
        others = await self.db.query(
            """
            SELECT a.phone, a.id as other_id
            FROM campaign_accounts ca
            JOIN tg_accounts a ON a.id = ca.account_id
            WHERE ca.campaign_id = (
                SELECT campaign_id FROM campaign_accounts WHERE account_id = ?
            )
            AND ca.account_id != ?
            AND a.status IN ('active', 'warming', 'warmed')
            ORDER BY RANDOM() LIMIT 1
            """,
            [account_id, account_id]
        )
        if not others:
            return

        other = others[0]
        other_entity = await client.get_entity(other['phone'])

        # Серия сообщений
        series_count = random.randint(series_min, series_max)
        context: list[str] = []

        ai = AIClient() if ai_enabled else None

        for i in range(series_count):
            # Определяем — это reply или новое сообщение
            is_reply = (i == 0) and (random.randint(1, 100) <= reply_pct) and bool(context)

            if ai_enabled and ai:
                msg = await ai.generate_message(topics=topics, context=context, is_reply=is_reply)
            else:
                # Fallback без AI
                SIMPLE_MSGS = ['Привет!', 'Как дела?', 'Что нового?', 'Привет 👋', 'О, привет!']
                msg = random.choice(SIMPLE_MSGS)

            await client.send_message(other_entity, msg)
            context.append(f"Я: {msg}")

            await self._log_action(account_id, campaign_id, 'dialog_sent', other['phone'])

            # Пауза между сообщениями серии
            if i < series_count - 1:
                await asyncio.sleep(random.uniform(delay_min, delay_max))

    except Exception as e:
        await self._log_action(account_id, campaign_id, 'dialog_sent', None, error=str(e))
```

### Обновить вызов `_action_dialogs` в методе `_warmup_account`

Найди строку:
```python
if actions_config.get('dialogs') and actions_done < actions_count:
    await self._action_dialogs(client, account_id, campaign_id)
```

Замени на:
```python
if actions_config.get('dialogs') and actions_done < actions_count:
    await self._action_dialogs(client, account_id, campaign_id, row)
    # row — это словарь строки из run_campaign_day, теперь содержит ai_* поля
```

### Обновить SQL в `run_campaign_day` (добавить ai_* поля в SELECT)

Найди SQL запрос в `run_campaign_day`, добавить к SELECT:
```sql
c.ai_dialog_enabled, c.ai_topics, c.ai_mode,
c.ai_delay_min, c.ai_delay_max, c.ai_messages_per_account,
c.ai_dialogs_per_day, c.ai_series_min, c.ai_series_max,
c.ai_reply_pct, c.ai_delete_messages
```

---

## Обновить runner/requirements.txt

Добавить строку:
```
httpx>=0.27.0  # уже есть — убедись что версия 0.27+
```
(httpx уже есть, дополнительных пакетов не требуется)

---

## Добавить в GitHub Actions secrets

```
OPENROUTER_API_KEY   — API ключ от openrouter.ai
AI_USE_PAID_MODEL    — "0" (бесплатные модели) или "1" (deepseek, платный)
```

### Обновить .github/workflows/warmup.yml (добавить env переменные)

```yaml
        env:
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_DATABASE_ID: ${{ secrets.CF_DATABASE_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          AI_USE_PAID_MODEL: ${{ vars.AI_USE_PAID_MODEL || '0' }}
```

---

## Обновить worker/src/routes/campaigns.ts

В POST `/campaigns` добавить парсинг новых полей (добавить к `body` типу):

```typescript
// Добавить к типу body в POST /campaigns:
ai_dialog_enabled?: number      // 0 или 1
ai_topics?: string[]             // ['daily_life', 'work', ...]
ai_mode?: string                 // '1_to_1' | '1_to_n'
ai_delay_preset?: string
ai_delay_min?: number
ai_delay_max?: number
ai_messages_per_account?: number
ai_dialogs_per_day?: number
ai_series_min?: number
ai_series_max?: number
ai_reply_pct?: number
ai_delete_messages?: number
```

И добавить в INSERT SQL запрос:
```sql
-- Добавить к INSERT INTO campaigns:
ai_dialog_enabled, ai_topics, ai_mode,
ai_delay_min, ai_delay_max, ai_messages_per_account,
ai_dialogs_per_day, ai_series_min, ai_series_max,
ai_reply_pct, ai_delete_messages
-- Значения (добавить к .bind()):
body.ai_dialog_enabled ?? 0,
JSON.stringify(body.ai_topics ?? ['daily_life']),
body.ai_mode ?? '1_to_n',
body.ai_delay_min ?? 15,
body.ai_delay_max ?? 45,
body.ai_messages_per_account ?? 20,
body.ai_dialogs_per_day ?? 10,
body.ai_series_min ?? 1,
body.ai_series_max ?? 3,
body.ai_reply_pct ?? 25,
body.ai_delete_messages ?? 0,
```

---

## Обновить web/app/(dashboard)/campaigns/new/page.tsx

Добавить секцию "AI Прогрев" в форму (после секции "Действия прогрева"):

```tsx
{/* Добавить в NewCampaignPage state */}
const [aiEnabled, setAiEnabled] = useState(false)
const [aiTopics, setAiTopics] = useState<string[]>(['daily_life'])
const [aiMode, setAiMode] = useState<'1_to_1' | '1_to_n'>('1_to_n')
const [aiDelayPreset, setAiDelayPreset] = useState<string>('medium')
const [aiMessagesPerAccount, setAiMessagesPerAccount] = useState(20)
const [aiDialogsPerDay, setAiDialogsPerDay] = useState(10)
const [aiSeriesMin, setAiSeriesMin] = useState(1)
const [aiSeriesMax, setAiSeriesMax] = useState(3)
const [aiReplyPct, setAiReplyPct] = useState(25)

{/* Добавить карточку в форму (перед кнопкой submit) */}
<Card>
  <CardHeader>
    <CardTitle className="text-base flex items-center justify-between">
      <span>⚡ AI Прогрев</span>
      <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
    </CardTitle>
    <p className="text-xs text-gray-400">
      OpenRouter генерирует реалистичные диалоги. Требует AI-токены.
    </p>
  </CardHeader>
  {aiEnabled && (
    <CardContent className="space-y-4">
      {/* Тема общения */}
      <div>
        <Label className="mb-2 block">Тема общения (можно несколько)</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: 'daily_life', label: '🧑 Повседневная жизнь' },
            { key: 'work', label: '💼 Работа и дела' },
            { key: 'hobbies', label: '🎮 Хобби' },
            { key: 'free_chat', label: '💬 Свободное общение' },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setAiTopics(prev =>
                prev.includes(t.key)
                  ? prev.filter(x => x !== t.key)
                  : [...prev, t.key]
              )}
              className={`p-3 rounded-lg border text-sm text-left transition-colors ${
                aiTopics.includes(t.key)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Режим взаимодействия */}
      <div>
        <Label className="mb-2 block">Режим взаимодействия</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: '1_to_1', label: '👥 1 к 1 (пары)' },
            { key: '1_to_n', label: '⚡ 1 ко N (случайно)' },
          ].map(m => (
            <button
              key={m.key}
              type="button"
              onClick={() => setAiMode(m.key as '1_to_1' | '1_to_n')}
              className={`p-3 rounded-lg border text-sm text-center transition-colors ${
                aiMode === m.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Пауза между сообщениями */}
      <div>
        <Label className="mb-2 block">Пауза между сообщениями</Label>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[
            { key: 'instant', label: 'Моментально', min: 2, max: 5 },
            { key: 'fast', label: 'Быстро', min: 5, max: 15 },
            { key: 'medium', label: 'Среднее', min: 15, max: 45 },
            { key: 'slow', label: 'Медленно', min: 45, max: 90 },
            { key: 'very_slow', label: 'Очень медл.', min: 120, max: 300 },
            { key: 'max', label: 'Максимум', min: 300, max: 600 },
          ].map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setAiDelayPreset(p.key)}
              className={`p-2 rounded border text-center transition-colors ${
                aiDelayPreset === p.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Числовые лимиты */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400">Сообщений на аккаунт</Label>
          <Input type="number" min={5} max={200} value={aiMessagesPerAccount}
            onChange={e => setAiMessagesPerAccount(+e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-gray-400">Диалогов в день</Label>
          <Input type="number" min={1} max={30} value={aiDialogsPerDay}
            onChange={e => setAiDialogsPerDay(+e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-gray-400">Серия: мин сообщений</Label>
          <Input type="number" min={1} max={5} value={aiSeriesMin}
            onChange={e => setAiSeriesMin(+e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-gray-400">Серия: макс сообщений</Label>
          <Input type="number" min={1} max={10} value={aiSeriesMax}
            onChange={e => setAiSeriesMax(+e.target.value)} />
        </div>
      </div>

      {/* % ответов */}
      <div>
        <Label className="mb-1 block">% ответов (reply): {aiReplyPct}%</Label>
        <input
          type="range" min={0} max={100} value={aiReplyPct}
          onChange={e => setAiReplyPct(+e.target.value)}
          className="w-full"
        />
      </div>
    </CardContent>
  )}
</Card>

{/* Добавить к объекту body в handleSubmit: */}
ai_dialog_enabled: aiEnabled ? 1 : 0,
ai_topics: aiTopics,
ai_mode: aiMode,
ai_delay_min: { instant:2, fast:5, medium:15, slow:45, very_slow:120, max:300 }[aiDelayPreset] ?? 15,
ai_delay_max: { instant:5, fast:15, medium:45, slow:90, very_slow:300, max:600 }[aiDelayPreset] ?? 45,
ai_messages_per_account: aiMessagesPerAccount,
ai_dialogs_per_day: aiDialogsPerDay,
ai_series_min: aiSeriesMin,
ai_series_max: aiSeriesMax,
ai_reply_pct: aiReplyPct,
ai_delete_messages: 0,
```

---

## Acceptance criteria

- [ ] `runner/ai_client.py` создан и импортируется без ошибок
- [ ] `python -c "from ai_client import AIClient; print('ok')"` — выводит ok
- [ ] `_action_dialogs` принимает `campaign_row` как параметр
- [ ] Если `ai_dialog_enabled=0` — используются fallback-фразы (без запроса к OpenRouter)
- [ ] Если `OPENROUTER_API_KEY` не задан — fallback, НЕ исключение
- [ ] Если OpenRouter вернул ошибку (4xx/5xx) — fallback, НЕ крэш runner
- [ ] Новые поля `ai_*` сохраняются в campaigns через POST /campaigns
- [ ] Форма создания кампании показывает секцию AI Прогрев с переключателем
- [ ] При `aiEnabled=false` — AI-поля в форме скрыты
- [ ] Выбор нескольких тем работает (toggle кнопок)
