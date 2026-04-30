# Фаза 5 — Warmup Engine (Python Runner)

> Читай SPEC.md перед началом. Фаза 1 (database) должна быть выполнена.  
> Эта фаза работает ТОЛЬКО с `runner/` директорией. Не трогай `worker/` и `web/`.

## Цель
Python runner на GitHub Actions получает задачи из D1, подключается к аккаунтам через Telethon, выполняет действия прогрева с рандомными задержками.

## Действия прогрева (в порядке исполнения)

1. **profile_setup** — установка имени, bio, аватара (первый запуск)
2. **join_groups** — вступление в 1-3 группы из `warmup_groups`
3. **read_messages** — открытие диалогов, прокрутка (имитация чтения)
4. **reactions** — лайки/реакции на посты в каналах
5. **story_views** — просмотр историй
6. **dialogs** — переписка между аккаунтами пула (если `use_pool_dialogs=1`)

---

## Файл: runner/d1_client.py

```python
import os
import httpx
from typing import Any

class D1Client:
    def __init__(self):
        self.account_id = os.environ['CF_ACCOUNT_ID']
        self.database_id = os.environ['CF_DATABASE_ID']
        self.api_token = os.environ['CF_API_TOKEN']
        self.base_url = (
            f"https://api.cloudflare.com/client/v4/accounts/"
            f"{self.account_id}/d1/database/{self.database_id}"
        )

    async def query(self, sql: str, params: list = None) -> list[dict]:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{self.base_url}/query",
                headers={"Authorization": f"Bearer {self.api_token}"},
                json={"sql": sql, "params": params or []},
            )
            r.raise_for_status()
            data = r.json()
            if not data.get('success'):
                raise RuntimeError(f"D1 error: {data}")
            return data['result'][0]['results']

    async def execute(self, sql: str, params: list = None) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{self.base_url}/query",
                headers={"Authorization": f"Bearer {self.api_token}"},
                json={"sql": sql, "params": params or []},
            )
            r.raise_for_status()
            data = r.json()
            if not data.get('success'):
                raise RuntimeError(f"D1 error: {data}")
            return data['result'][0]['meta']
```

---

## Файл: runner/warmup.py

```python
import asyncio
import random
import logging
from datetime import datetime, timezone
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import (
    FloodWaitError, UserDeactivatedBanError,
    PhoneNumberBannedError, SessionRevokedError
)
from telethon.tl.functions.messages import GetHistoryRequest, SendReactionRequest
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.tl.types import ReactionEmoji
from d1_client import D1Client

logger = logging.getLogger(__name__)

REACTIONS = ['👍', '❤️', '🔥', '👏', '🎉', '😍', '🤩', '💯']

class WarmupEngine:
    def __init__(self, db: D1Client):
        self.db = db

    async def run_campaign_day(self, campaign_id: int):
        """Запуск одного дня прогрева для кампании."""
        rows = await self.db.query(
            """
            SELECT ca.account_id, ca.days_done,
                   a.phone, a.session_string, a.api_id, a.api_hash, a.proxy,
                   c.daily_actions_min, c.daily_actions_max,
                   c.delay_between_actions_min, c.delay_between_actions_max,
                   c.work_hour_start, c.work_hour_end,
                   c.actions_config, c.use_pool_dialogs,
                   c.warmup_days
            FROM campaign_accounts ca
            JOIN tg_accounts a ON a.id = ca.account_id
            JOIN campaigns c ON c.id = ca.campaign_id
            WHERE ca.campaign_id = ?
              AND ca.status IN ('pending', 'running')
              AND a.status IN ('active', 'warming')
            """,
            [campaign_id]
        )

        import json
        for row in rows:
            actions_config = json.loads(row['actions_config'])
            proxy = json.loads(row['proxy']) if row['proxy'] else None

            try:
                await self._warmup_account(
                    account_id=row['account_id'],
                    campaign_id=campaign_id,
                    session_string=row['session_string'],
                    api_id=row['api_id'],
                    api_hash=row['api_hash'],
                    proxy=proxy,
                    actions_config=actions_config,
                    daily_min=row['daily_actions_min'],
                    daily_max=row['daily_actions_max'],
                    delay_min=row['delay_between_actions_min'],
                    delay_max=row['delay_between_actions_max'],
                )

                days_done = row['days_done'] + 1
                new_status = 'done' if days_done >= row['warmup_days'] else 'running'
                await self.db.execute(
                    "UPDATE campaign_accounts SET days_done = ?, status = ?, last_run_at = ? WHERE campaign_id = ? AND account_id = ?",
                    [days_done, new_status, datetime.now(timezone.utc).isoformat(), campaign_id, row['account_id']]
                )
                if new_status == 'done':
                    await self.db.execute(
                        "UPDATE tg_accounts SET status = 'warmed', warmed_at = ? WHERE id = ?",
                        [datetime.now(timezone.utc).isoformat(), row['account_id']]
                    )

            except (UserDeactivatedBanError, PhoneNumberBannedError, SessionRevokedError) as e:
                logger.error(f"Account {row['account_id']} permanently banned: {e}")
                await self.db.execute(
                    "UPDATE tg_accounts SET status = 'banned', block_reason = ?, blocked_at = ? WHERE id = ?",
                    [str(e), datetime.now(timezone.utc).isoformat(), row['account_id']]
                )
                await self.db.execute(
                    "UPDATE campaign_accounts SET status = 'error' WHERE campaign_id = ? AND account_id = ?",
                    [campaign_id, row['account_id']]
                )

            except FloodWaitError as e:
                logger.warning(f"Account {row['account_id']} flood wait {e.seconds}s")
                await self.db.execute(
                    "UPDATE tg_accounts SET status = 'spam_block', block_reason = ? WHERE id = ?",
                    [f"FloodWait {e.seconds}s", row['account_id']]
                )

    async def _warmup_account(
        self,
        account_id: int,
        campaign_id: int,
        session_string: str,
        api_id: int,
        api_hash: str,
        proxy: dict | None,
        actions_config: dict,
        daily_min: int,
        daily_max: int,
        delay_min: int,
        delay_max: int,
    ):
        proxy_tuple = None
        if proxy:
            import socks
            proxy_tuple = (
                socks.SOCKS5 if proxy['type'] == 'socks5' else socks.HTTP,
                proxy['host'],
                proxy['port'],
                True,
                proxy.get('user'),
                proxy.get('pass'),
            )

        client = TelegramClient(
            StringSession(session_string),
            api_id,
            api_hash,
            proxy=proxy_tuple,
        )

        async with client:
            # Обновить статус аккаунта
            await self.db.execute(
                "UPDATE tg_accounts SET status = 'warming' WHERE id = ?",
                [account_id]
            )

            actions_count = random.randint(daily_min, daily_max)
            actions_done = 0

            # 1. Profile setup (только если ещё не делали)
            if actions_config.get('profile_setup'):
                await self._action_profile_setup(client, account_id, campaign_id)
                actions_done += 1
                await self._random_delay(delay_min, delay_max)

            # 2. Join groups
            if actions_config.get('join_groups') and actions_done < actions_count:
                groups = await self.db.query(
                    "SELECT username FROM warmup_groups WHERE is_active = 1 ORDER BY RANDOM() LIMIT 2"
                )
                for g in groups:
                    try:
                        await client(JoinChannelRequest(g['username']))
                        await self._log_action(account_id, campaign_id, 'join_group', g['username'])
                        actions_done += 1
                        await self._random_delay(delay_min, delay_max)
                    except Exception as e:
                        await self._log_action(account_id, campaign_id, 'join_group', g['username'], error=str(e))

            # 3. Read messages
            if actions_config.get('read_messages') and actions_done < actions_count:
                await self._action_read_messages(client, account_id, campaign_id)
                actions_done += 1
                await self._random_delay(delay_min, delay_max)

            # 4. Reactions
            if actions_config.get('reactions') and actions_done < actions_count:
                await self._action_reactions(client, account_id, campaign_id)
                actions_done += 1
                await self._random_delay(delay_min, delay_max)

            # 5. Story views
            if actions_config.get('story_views') and actions_done < actions_count:
                await self._action_story_views(client, account_id, campaign_id)
                actions_done += 1
                await self._random_delay(delay_min, delay_max)

            # 6. Dialogs (только если есть пул аккаунтов)
            if actions_config.get('dialogs') and actions_done < actions_count:
                await self._action_dialogs(client, account_id, campaign_id)

            await self.db.execute(
                "UPDATE tg_accounts SET messages_sent = messages_sent + ? WHERE id = ?",
                [actions_done, account_id]
            )

    async def _action_profile_setup(self, client, account_id, campaign_id):
        """Обновляет имя и bio если они ещё не установлены."""
        try:
            me = await client.get_me()
            if not me.first_name or me.first_name == 'User':
                from faker import Faker
                fake = Faker('ru_RU')
                await client.update_profile(
                    first_name=fake.first_name(),
                    about=random.choice([
                        'Привет! Рад знакомству 👋',
                        'На связи 😊',
                        '',
                    ])
                )
            await self._log_action(account_id, campaign_id, 'profile_updated', me.phone)
        except Exception as e:
            await self._log_action(account_id, campaign_id, 'profile_updated', None, error=str(e))

    async def _action_read_messages(self, client, account_id, campaign_id):
        """Открывает диалоги и помечает сообщения прочитанными."""
        try:
            dialogs = await client.get_dialogs(limit=10)
            for dialog in random.sample(list(dialogs), min(3, len(dialogs))):
                await client.send_read_acknowledge(dialog.entity)
                await self._log_action(account_id, campaign_id, 'read_messages', str(dialog.id))
                await asyncio.sleep(random.uniform(2, 8))
        except Exception as e:
            await self._log_action(account_id, campaign_id, 'read_messages', None, error=str(e))

    async def _action_reactions(self, client, account_id, campaign_id):
        """Ставит реакцию на случайный пост в канале."""
        try:
            dialogs = await client.get_dialogs(limit=20)
            channels = [d for d in dialogs if hasattr(d.entity, 'broadcast') and d.entity.broadcast]
            if not channels:
                return
            channel = random.choice(channels)
            history = await client(GetHistoryRequest(
                peer=channel.entity,
                limit=10,
                offset_date=None,
                offset_id=0,
                max_id=0,
                min_id=0,
                add_offset=0,
                hash=0,
            ))
            if history.messages:
                msg = random.choice(history.messages)
                emoji = random.choice(REACTIONS)
                await client(SendReactionRequest(
                    peer=channel.entity,
                    msg_id=msg.id,
                    reaction=[ReactionEmoji(emoticon=emoji)],
                ))
                await self._log_action(account_id, campaign_id, 'reaction', f"{channel.entity.username}:{msg.id}")
        except Exception as e:
            await self._log_action(account_id, campaign_id, 'reaction', None, error=str(e))

    async def _action_story_views(self, client, account_id, campaign_id):
        """Просматривает истории контактов."""
        try:
            await self._log_action(account_id, campaign_id, 'story_view', 'skipped:not_implemented')
        except Exception as e:
            await self._log_action(account_id, campaign_id, 'story_view', None, error=str(e))

    async def _action_dialogs(self, client, account_id, campaign_id):
        """Пишет случайное сообщение другому аккаунту из пула кампании."""
        try:
            # Найти другой активный аккаунт кампании
            others = await self.db.query(
                """
                SELECT a.phone, a.session_string, a.api_id, a.api_hash
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
            messages = [
                'Привет! Как дела?',
                'Здарова! Что делаешь?',
                'Привет 👋',
                'Как жизнь?',
                'Привет! Есть минута?',
            ]
            msg = random.choice(messages)
            other_entity = await client.get_entity(other['phone'])
            await client.send_message(other_entity, msg)
            await self._log_action(account_id, campaign_id, 'dialog_sent', other['phone'])

        except Exception as e:
            await self._log_action(account_id, campaign_id, 'dialog_sent', None, error=str(e))

    async def _log_action(self, account_id, campaign_id, action_type, target, error=None):
        await self.db.execute(
            """
            INSERT INTO warmup_actions (campaign_id, account_id, action_type, target, status, error_text)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [campaign_id, account_id, action_type, target, 'error' if error else 'ok', error]
        )

    async def _random_delay(self, min_sec: int, max_sec: int):
        delay = random.uniform(min_sec, max_sec)
        # Добавляем случайность ±20%
        jitter = delay * random.uniform(-0.2, 0.2)
        await asyncio.sleep(max(5, delay + jitter))
```

---

## Файл: runner/main.py

```python
import argparse
import asyncio
import logging
import json
from d1_client import D1Client
from warmup import WarmupEngine

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

async def run_campaign(campaign_id: int):
    db = D1Client()
    engine = WarmupEngine(db)

    # Обновить статус кампании
    await db.execute("UPDATE campaigns SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?", [campaign_id])

    try:
        await engine.run_campaign_day(campaign_id)

        # Проверить все ли аккаунты завершили прогрев
        pending = await db.query(
            "SELECT COUNT(*) as cnt FROM campaign_accounts WHERE campaign_id = ? AND status NOT IN ('done', 'error')",
            [campaign_id]
        )
        if pending[0]['cnt'] == 0:
            await db.execute("UPDATE campaigns SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?", [campaign_id])
        else:
            await db.execute("UPDATE campaigns SET status = 'idle' WHERE id = ?", [campaign_id])

    except Exception as e:
        logger.exception(f"Campaign {campaign_id} failed")
        await db.execute(
            "UPDATE campaigns SET status = 'error', error_message = ? WHERE id = ?",
            [str(e), campaign_id]
        )

async def poll_queue():
    """Дрейнит task_queue — используется для send_code / confirm_code задач."""
    db = D1Client()
    tasks = await db.query(
        "SELECT * FROM task_queue WHERE status = 'queued' ORDER BY id ASC LIMIT 10"
    )
    for task in tasks:
        await db.execute("UPDATE task_queue SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?", [task['id']])
        try:
            params = json.loads(task['params_json'] or '{}')
            if task['action'] == 'run_warmup_day':
                engine = WarmupEngine(db)
                await engine.run_campaign_day(params['campaign_id'])
            await db.execute("UPDATE task_queue SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?", [task['id']])
        except Exception as e:
            await db.execute("UPDATE task_queue SET status = 'error', error = ? WHERE id = ?", [str(e), task['id']])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--campaign-id', type=int)
    parser.add_argument('--poll', action='store_true')
    args = parser.parse_args()

    if args.campaign_id:
        asyncio.run(run_campaign(args.campaign_id))
    elif args.poll:
        asyncio.run(poll_queue())
    else:
        print("Укажи --campaign-id=N или --poll")

if __name__ == '__main__':
    main()
```

---

## Файл: runner/requirements.txt

```
telethon==1.36.0
httpx==0.27.0
python-dotenv==1.0.1
PySocks==1.7.1
Faker==25.0.0
```

---

## GitHub Actions workflow: .github/workflows/warmup.yml

```yaml
name: Warmup Runner

on:
  workflow_dispatch:
    inputs:
      campaign_id:
        description: 'Campaign ID'
        required: false
        type: string
      action:
        description: 'Action (run_campaign | poll)'
        required: false
        default: 'poll'
        type: string

  schedule:
    # Каждый час — проверять кампании которые нужно запустить
    - cron: '0 * * * *'

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - run: pip install -r runner/requirements.txt
      - name: Run warmup
        run: |
          if [ "${{ inputs.campaign_id }}" != "" ]; then
            python runner/main.py --campaign-id=${{ inputs.campaign_id }}
          else
            python runner/main.py --poll
          fi
        env:
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_DATABASE_ID: ${{ secrets.CF_DATABASE_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
```

---

## Acceptance criteria

- [ ] `python runner/main.py --poll` выполняется без ошибок (даже если очередь пустая)
- [ ] `python runner/main.py --campaign-id=1` — обновляет статус кампании в D1
- [ ] Лог действий пишется в `warmup_actions` таблицу
- [ ] FloodWaitError → статус аккаунта = 'spam_block' (НЕ 'banned')
- [ ] Banned/Deactivated → статус аккаунта = 'banned'
- [ ] После N дней прогрева (warmup_days) → статус аккаунта = 'warmed', кампания = 'completed'
- [ ] Прокси применяется к Telethon клиенту если `tg_accounts.proxy` не NULL
- [ ] Задержки между действиями случайны (не фиксированные)
