import asyncio
import json
import logging
import random
from datetime import datetime, timezone
from typing import Any

import socks
from faker import Faker
from telethon import TelegramClient, functions
from telethon.errors import (
    FloodWaitError,
    PhoneNumberBannedError,
    SessionRevokedError,
    UserDeactivatedBanError,
)
from telethon.sessions import StringSession
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.tl.functions.messages import GetHistoryRequest, SendReactionRequest
from telethon.tl.types import ReactionEmoji

from ai_client import AIClient
from d1_client import D1Client

logger = logging.getLogger(__name__)
fake = Faker('ru_RU')
REACTIONS = ['👍', '❤️', '🔥', '👏', '🎉', '😍', '🤩', '💯']
DIALOG_MESSAGES = [
    'Привет! Как дела?',
    'Здарова! Что делаешь?',
    'Привет 👋',
    'Как жизнь?',
    'Привет! Есть минута?',
]


class TokensDepletedError(RuntimeError):
    pass


class WarmupEngine:
    def __init__(self, db: D1Client):
        self.db = db

    async def run_campaign_day(self, campaign_id: int):
        rows = await self.db.query(
            """
            SELECT
                ca.account_id,
                ca.days_done,
                a.user_id,
                a.session_string,
                a.api_id,
                a.api_hash,
                a.proxy,
                c.daily_actions_min,
                c.daily_actions_max,
                c.delay_between_actions_min,
                c.delay_between_actions_max,
                c.actions_config,
                c.use_pool_dialogs,
                c.warmup_days,
                c.ai_dialog_enabled,
                c.ai_topics,
                c.ai_mode,
                c.ai_delay_preset,
                c.ai_delay_min,
                c.ai_delay_max,
                c.ai_messages_per_account,
                c.ai_dialogs_per_day,
                c.ai_series_min,
                c.ai_series_max,
                c.ai_reply_pct,
                c.ai_delete_messages
            FROM campaign_accounts ca
            JOIN tg_accounts a ON a.id = ca.account_id
            JOIN campaigns c ON c.id = ca.campaign_id
            WHERE ca.campaign_id = ?
              AND ca.status IN ('pending', 'running')
              AND a.status IN ('active', 'warming')
            """,
            [campaign_id],
        )

        for row in rows:
            actions_config = self._decode_json(row['actions_config'], {})
            proxy = self._decode_json(row['proxy'], None)

            try:
                await self._warmup_account(
                    user_id=int(row['user_id']),
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
                    use_pool_dialogs=bool(row['use_pool_dialogs']),
                    campaign_row=row,
                )

                days_done = int(row['days_done']) + 1
                campaign_account_status = 'done' if days_done >= int(row['warmup_days']) else 'running'
                await self.db.execute(
                    "UPDATE campaign_accounts SET days_done = ?, status = ?, last_run_at = ? WHERE campaign_id = ? AND account_id = ?",
                    [days_done, campaign_account_status, self._now_iso(), campaign_id, row['account_id']],
                )
                if campaign_account_status == 'done':
                    await self.db.execute(
                        "UPDATE tg_accounts SET status = 'warmed', warmed_at = ? WHERE id = ?",
                        [self._now_iso(), row['account_id']],
                    )
            except (UserDeactivatedBanError, PhoneNumberBannedError, SessionRevokedError) as exc:
                logger.error('Account %s permanently banned', row['account_id'])
                await self.db.execute(
                    "UPDATE tg_accounts SET status = 'banned', block_reason = ?, blocked_at = ? WHERE id = ?",
                    [exc.__class__.__name__, self._now_iso(), row['account_id']],
                )
                await self.db.execute(
                    "UPDATE campaign_accounts SET status = 'error' WHERE campaign_id = ? AND account_id = ?",
                    [campaign_id, row['account_id']],
                )
            except FloodWaitError as exc:
                logger.warning('Account %s flood wait %ss', row['account_id'], exc.seconds)
                await self.db.execute(
                    "UPDATE tg_accounts SET status = 'spam_block', block_reason = ?, blocked_at = ? WHERE id = ?",
                    [f'FloodWait {exc.seconds}s', self._now_iso(), row['account_id']],
                )
                await self.db.execute(
                    "UPDATE campaign_accounts SET status = 'running', last_run_at = ? WHERE campaign_id = ? AND account_id = ?",
                    [self._now_iso(), campaign_id, row['account_id']],
                )
            except TokensDepletedError:
                await self._pause_campaign_for_zero_tokens(campaign_id)
                return

    async def _warmup_account(
        self,
        user_id: int,
        account_id: int,
        campaign_id: int,
        session_string: str | None,
        api_id: int | None,
        api_hash: str | None,
        proxy: dict[str, Any] | None,
        actions_config: dict[str, Any],
        daily_min: int,
        daily_max: int,
        delay_min: int,
        delay_max: int,
        use_pool_dialogs: bool,
        campaign_row: dict[str, Any],
    ):
        if not session_string or not api_id or not api_hash:
            raise RuntimeError(f'Account {account_id} is missing Telegram session credentials')

        client = TelegramClient(
            StringSession(session_string),
            int(api_id),
            api_hash,
            proxy=self._build_proxy(proxy),
        )

        async with client:
            await self.db.execute(
                "UPDATE tg_accounts SET status = 'warming' WHERE id = ?",
                [account_id],
            )
            await self.db.execute(
                "UPDATE campaign_accounts SET status = 'running', last_run_at = ? WHERE campaign_id = ? AND account_id = ?",
                [self._now_iso(), campaign_id, account_id],
            )

            actions_count = random.randint(int(daily_min), int(daily_max))
            actions_done = 0

            if actions_config.get('profile_setup') and actions_done < actions_count:
                did_action = await self._action_profile_setup(client, user_id, account_id, campaign_id)
                actions_done += 1 if did_action else 0
                if did_action:
                    await self._random_delay(delay_min, delay_max)

            if actions_config.get('join_groups') and actions_done < actions_count:
                actions_done += await self._action_join_groups(
                    client,
                    user_id,
                    account_id,
                    campaign_id,
                    delay_min,
                    delay_max,
                )

            if actions_config.get('read_messages') and actions_done < actions_count:
                did_action = await self._action_read_messages(client, user_id, account_id, campaign_id)
                actions_done += 1 if did_action else 0
                if did_action:
                    await self._random_delay(delay_min, delay_max)

            if actions_config.get('reactions') and actions_done < actions_count:
                did_action = await self._action_reactions(client, user_id, account_id, campaign_id)
                actions_done += 1 if did_action else 0
                if did_action:
                    await self._random_delay(delay_min, delay_max)

            if actions_config.get('story_views') and actions_done < actions_count:
                did_action = await self._action_story_views(user_id, account_id, campaign_id)
                actions_done += 1 if did_action else 0
                if did_action:
                    await self._random_delay(delay_min, delay_max)

            if actions_config.get('dialogs') and use_pool_dialogs and actions_done < actions_count:
                actions_done += await self._action_dialogs(client, user_id, account_id, campaign_id, campaign_row)

            await self.db.execute(
                "UPDATE tg_accounts SET messages_sent = messages_sent + ? WHERE id = ?",
                [actions_done, account_id],
            )
            await self.db.execute(
                "UPDATE campaign_accounts SET actions_done = actions_done + ?, last_run_at = ? WHERE campaign_id = ? AND account_id = ?",
                [actions_done, self._now_iso(), campaign_id, account_id],
            )

    async def _action_profile_setup(self, client: TelegramClient, user_id: int, account_id: int, campaign_id: int) -> bool:
        try:
            me = await client.get_me()
            if not me.first_name or me.first_name == 'User':
                await client(functions.account.UpdateProfileRequest(
                    first_name=fake.first_name(),
                    about=random.choice([
                        'Привет! Рад знакомству 👋',
                        'На связи 😊',
                        '',
                    ]),
                ))
            target = str(me.id if me else 'self')
            await self._charge_warmup_action(user_id, campaign_id, account_id, 'profile_updated', target)
            await self._log_action(account_id, campaign_id, 'profile_updated', target)
            return True
        except TokensDepletedError:
            raise
        except Exception as exc:
            await self._log_action(account_id, campaign_id, 'profile_updated', None, error=str(exc))
            return False

    async def _action_join_groups(
        self,
        client: TelegramClient,
        user_id: int,
        account_id: int,
        campaign_id: int,
        delay_min: int,
        delay_max: int,
    ) -> int:
        actions_done = 0
        groups = await self.db.query(
            'SELECT username FROM warmup_groups WHERE is_active = 1 ORDER BY RANDOM() LIMIT 2'
        )
        for group in groups:
            try:
                await client(JoinChannelRequest(group['username']))
                await self._charge_warmup_action(user_id, campaign_id, account_id, 'join_group', group['username'])
                await self._log_action(account_id, campaign_id, 'join_group', group['username'])
                actions_done += 1
                await self._random_delay(delay_min, delay_max)
            except TokensDepletedError:
                raise
            except Exception as exc:
                await self._log_action(account_id, campaign_id, 'join_group', group['username'], error=str(exc))
        return actions_done

    async def _action_read_messages(self, client: TelegramClient, user_id: int, account_id: int, campaign_id: int) -> bool:
        try:
            dialogs = await client.get_dialogs(limit=10)
            if not dialogs:
                await self._log_action(account_id, campaign_id, 'read_messages', 'skipped:no_dialogs')
                return False
            for dialog in random.sample(list(dialogs), min(3, len(dialogs))):
                await client.send_read_acknowledge(dialog.entity)
                target = str(dialog.id)
                await self._charge_warmup_action(user_id, campaign_id, account_id, 'read_messages', target)
                await self._log_action(account_id, campaign_id, 'read_messages', target)
                await asyncio.sleep(random.uniform(2, 8))
                return True
            return False
        except TokensDepletedError:
            raise
        except Exception as exc:
            await self._log_action(account_id, campaign_id, 'read_messages', None, error=str(exc))
            return False

    async def _action_reactions(self, client: TelegramClient, user_id: int, account_id: int, campaign_id: int) -> bool:
        try:
            dialogs = await client.get_dialogs(limit=20)
            channels = [dialog for dialog in dialogs if getattr(dialog.entity, 'broadcast', False)]
            if not channels:
                await self._log_action(account_id, campaign_id, 'reaction', 'skipped:no_channels')
                return False

            channel = random.choice(channels)
            history = await client(
                GetHistoryRequest(
                    peer=channel.entity,
                    limit=10,
                    offset_date=None,
                    offset_id=0,
                    max_id=0,
                    min_id=0,
                    add_offset=0,
                    hash=0,
                )
            )
            if not history.messages:
                await self._log_action(account_id, campaign_id, 'reaction', 'skipped:no_messages')
                return False

            message = random.choice(history.messages)
            emoji = random.choice(REACTIONS)
            await client(
                SendReactionRequest(
                    peer=channel.entity,
                    msg_id=message.id,
                    reaction=[ReactionEmoji(emoticon=emoji)],
                )
            )
            target = f"{getattr(channel.entity, 'username', None) or channel.id}:{message.id}"
            await self._charge_warmup_action(user_id, campaign_id, account_id, 'reaction', target)
            await self._log_action(account_id, campaign_id, 'reaction', target)
            return True
        except TokensDepletedError:
            raise
        except Exception as exc:
            await self._log_action(account_id, campaign_id, 'reaction', None, error=str(exc))
            return False

    async def _action_story_views(self, user_id: int, account_id: int, campaign_id: int) -> bool:
        target = 'skipped:not_implemented'
        await self._charge_warmup_action(user_id, campaign_id, account_id, 'story_view', target)
        await self._log_action(account_id, campaign_id, 'story_view', target)
        return True

    async def _action_dialogs(self, client: TelegramClient, user_id: int, account_id: int, campaign_id: int, campaign_row: dict[str, Any]) -> int:
        ai_enabled = bool(campaign_row.get('ai_dialog_enabled', 0))
        topics = self._decode_json(campaign_row.get('ai_topics'), ['daily_life'])
        if not isinstance(topics, list):
            topics = ['daily_life']
        topics = [str(topic) for topic in topics if topic]
        series_min = int(campaign_row.get('ai_series_min') or 1)
        series_max = int(campaign_row.get('ai_series_max') or 3)
        reply_pct = int(campaign_row.get('ai_reply_pct') or 25)
        delay_min = int(campaign_row.get('ai_delay_min') or 15)
        delay_max = int(campaign_row.get('ai_delay_max') or 45)

        series_min = max(1, series_min)
        series_max = max(series_min, series_max)
        reply_pct = max(0, min(100, reply_pct))
        delay_min = max(1, delay_min)
        delay_max = max(delay_min, delay_max)

        try:
            others = await self.db.query(
                """
                SELECT a.phone, a.id as other_id
                FROM campaign_accounts ca
                JOIN tg_accounts a ON a.id = ca.account_id
                WHERE ca.campaign_id = ?
                  AND ca.account_id != ?
                  AND a.status IN ('active', 'warming', 'warmed')
                ORDER BY RANDOM() LIMIT 1
                """,
                [campaign_id, account_id],
            )
            if not others:
                await self._log_action(account_id, campaign_id, 'dialog_sent', 'skipped:no_peer')
                return 0

            other = others[0]
            other_entity = await client.get_entity(other['phone'])
            series_count = random.randint(series_min, series_max)
            context: list[str] = []
            ai = AIClient() if ai_enabled else None
            completed = 0

            for i in range(series_count):
                is_reply = i > 0 and random.randint(1, 100) <= reply_pct and bool(context)
                if ai_enabled and ai:
                    message = await ai.generate_message(topics=topics, context=context, is_reply=is_reply)
                else:
                    message = random.choice(DIALOG_MESSAGES)

                await client.send_message(other_entity, message)
                context.append(f'Я: {message}')
                if ai_enabled and ai:
                    template_charge = await self.db.record_ai_template_usage(
                        user_id=user_id,
                        campaign_id=campaign_id,
                        idempotency_key=f'ai_template:{campaign_id}:{account_id}:{i}',
                    )
                    if not template_charge.get('ok'):
                        await self.db.pause_campaign_and_notify_zero_tokens(campaign_id)
                        raise TokensDepletedError(template_charge.get('error') or 'Недостаточно токенов')
                    dialog_charge = await self.db.record_ai_dialog_usage(user_id, campaign_id, account_id, i)
                    if not dialog_charge.get('ok'):
                        await self.db.pause_campaign_and_notify_zero_tokens(campaign_id)
                        raise TokensDepletedError(dialog_charge.get('error') or 'Недостаточно токенов')
                else:
                    await self._charge_warmup_action(user_id, campaign_id, account_id, 'dialog_sent', str(other['phone']))
                await self._log_action(account_id, campaign_id, 'dialog_sent', other['phone'])
                completed += 1

                if i < series_count - 1:
                    await asyncio.sleep(random.uniform(delay_min, delay_max))
            return completed
        except TokensDepletedError:
            raise
        except Exception as exc:
            await self._log_action(account_id, campaign_id, 'dialog_sent', None, error=str(exc))
            return 0

    async def _charge_warmup_action(self, user_id: int, campaign_id: int, account_id: int, action_type: str, target: str | None):
        charge = await self.db.record_warmup_action_usage(user_id, campaign_id, account_id, action_type, target)
        if charge.get('ok'):
            return
        await self.db.pause_campaign_and_notify_zero_tokens(campaign_id)
        raise TokensDepletedError(charge.get('error') or 'Недостаточно токенов')

    async def _pause_campaign_for_zero_tokens(self, campaign_id: int):
        await self.db.pause_campaign_and_notify_zero_tokens(campaign_id)

    async def _log_action(
        self,
        account_id: int,
        campaign_id: int,
        action_type: str,
        target: str | None,
        error: str | None = None,
    ):
        status = 'error' if error else 'ok'
        await self.db.execute(
            """
            INSERT INTO warmup_actions (campaign_id, account_id, action_type, target, status, error_text)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [campaign_id, account_id, action_type, target, status, error],
        )

    async def _random_delay(self, min_sec: int, max_sec: int):
        delay = random.uniform(float(min_sec), float(max_sec))
        jitter = delay * random.uniform(-0.2, 0.2)
        await asyncio.sleep(max(5, delay + jitter))

    def _build_proxy(self, proxy: dict[str, Any] | None):
        if not proxy:
            return None

        proxy_type = str(proxy.get('type', 'socks5')).lower()
        scheme = socks.SOCKS5 if proxy_type == 'socks5' else socks.HTTP
        return (
            scheme,
            proxy['host'],
            int(proxy['port']),
            True,
            proxy.get('user'),
            proxy.get('pass'),
        )

    def _decode_json(self, value: str | None, fallback: Any):
        if not value:
            return fallback
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()


    async def _log_action(
        self,
        account_id: int,
        campaign_id: int,
        action_type: str,
        target: str | None,
        error: str | None = None,
    ):
        status = 'error' if error else 'ok'
        await self.db.execute(
            """
            INSERT INTO warmup_actions (campaign_id, account_id, action_type, target, status, error_text)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [campaign_id, account_id, action_type, target, status, error],
        )

    async def _random_delay(self, min_sec: int, max_sec: int):
        delay = random.uniform(float(min_sec), float(max_sec))
        jitter = delay * random.uniform(-0.2, 0.2)
        await asyncio.sleep(max(5, delay + jitter))

    def _build_proxy(self, proxy: dict[str, Any] | None):
        if not proxy:
            return None

        proxy_type = str(proxy.get('type', 'socks5')).lower()
        scheme = socks.SOCKS5 if proxy_type == 'socks5' else socks.HTTP
        return (
            scheme,
            proxy['host'],
            int(proxy['port']),
            True,
            proxy.get('user'),
            proxy.get('pass'),
        )

    def _decode_json(self, value: str | None, fallback: Any):
        if not value:
            return fallback
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

