import json
import logging
import os
from typing import Any

from telethon import TelegramClient
from telethon.sessions import StringSession

import httpx

ProxyRecord = dict[str, Any]
PUBLIC_TELEGRAM_DESKTOP_API_ID = 611335
PUBLIC_TELEGRAM_DESKTOP_API_HASH = 'd524b414d21f4d37f08684c1df41ac9c'
logger = logging.getLogger(__name__)

TOKEN_PRICES = {
    'dm_sent': 1,
    'group_or_channel_send': 2,
    'warmup_action': 1,
    'ai_generate_template': 20,
    'ai_generate_dialog': 5,
    'parsing_lead_added': 1,
    'ai_parse_classification': 5,
}


def resolve_telegram_login_credentials() -> tuple[int, str]:
    api_id = os.environ.get('TELEGRAM_API_ID')
    api_hash = os.environ.get('TELEGRAM_API_HASH')
    if api_id and api_hash:
        try:
            parsed_api_id = int(api_id)
            normalized_api_hash = str(api_hash).strip()
            if parsed_api_id > 0 and len(normalized_api_hash) >= 16 and normalized_api_hash != '***':
                return parsed_api_id, normalized_api_hash
        except ValueError:
            pass

    return PUBLIC_TELEGRAM_DESKTOP_API_ID, PUBLIC_TELEGRAM_DESKTOP_API_HASH


class D1Client:
    def __init__(self):
        self.account_id = os.environ['CF_ACCOUNT_ID']
        self.database_id = os.environ['CF_DATABASE_ID']
        self.api_token = os.environ['CF_API_TOKEN']
        self.base_url = (
            'https://api.cloudflare.com/client/v4/accounts/'
            f'{self.account_id}/d1/database/{self.database_id}'
        )
        self.headers = {
            'Authorization': f'Bearer {self.api_token}',
            'Content-Type': 'application/json',
        }

    async def query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        data = await self._request(sql, params)
        return data['result'][0]['results']

    async def execute(self, sql: str, params: list[Any] | None = None) -> dict[str, Any]:
        data = await self._request(sql, params)
        return data['result'][0]['meta']

    async def _request(self, sql: str, params: list[Any] | None = None) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f'{self.base_url}/query',
                headers=self.headers,
                json={'sql': sql, 'params': params or []},
            )

        response.raise_for_status()
        data = response.json()
        if not data.get('success'):
            raise RuntimeError(f'D1 error: {data}')

        result = data.get('result') or []
        if not result:
            raise RuntimeError(f'D1 empty result: {data}')

        return data

    async def spend_tokens_for_usage(
        self,
        *,
        user_id: int,
        action: str,
        idempotency_key: str,
        ref_type: str | None = None,
        ref_id: str | None = None,
        units: int = 1,
    ) -> dict[str, Any]:
        existing = await self.query(
            """
            SELECT tue.tokens_spent, tb.balance
            FROM token_usage_events tue
            LEFT JOIN token_balance tb ON tb.user_id = tue.user_id
            WHERE tue.user_id = ? AND tue.idempotency_key = ?
            LIMIT 1
            """,
            [user_id, idempotency_key],
        )
        if existing:
            return {
                'ok': True,
                'duplicate': True,
                'balance': int(existing[0].get('balance') or 0),
                'tokens_spent': int(existing[0].get('tokens_spent') or 0),
            }

        normalized_units = max(1, int(units))
        tokens_spent = int(TOKEN_PRICES[action]) * normalized_units
        await self.execute(
            """
            INSERT OR IGNORE INTO token_balance (user_id, balance, lifetime_earned)
            VALUES (?, 400, 400)
            """,
            [user_id],
        )
        balance_rows = await self.query(
            'SELECT balance FROM token_balance WHERE user_id = ? LIMIT 1',
            [user_id],
        )
        balance = int(balance_rows[0]['balance']) if balance_rows else 0
        if balance < tokens_spent:
            return {
                'ok': False,
                'duplicate': False,
                'balance': balance,
                'tokens_spent': tokens_spent,
                'error': 'Недостаточно токенов',
            }

        usage_insert = await self.execute(
            """
            INSERT OR IGNORE INTO token_usage_events (
                user_id,
                action,
                units,
                tokens_spent,
                ref_type,
                ref_id,
                idempotency_key
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [user_id, action, normalized_units, tokens_spent, ref_type, ref_id, idempotency_key],
        )
        if int(usage_insert.get('changes', 0)) == 0:
            duplicate = await self.query(
                """
                SELECT tue.tokens_spent, tb.balance
                FROM token_usage_events tue
                LEFT JOIN token_balance tb ON tb.user_id = tue.user_id
                WHERE tue.user_id = ? AND tue.idempotency_key = ?
                LIMIT 1
                """,
                [user_id, idempotency_key],
            )
            return {
                'ok': True,
                'duplicate': True,
                'balance': int(duplicate[0].get('balance') or balance) if duplicate else balance,
                'tokens_spent': int(duplicate[0].get('tokens_spent') or tokens_spent) if duplicate else tokens_spent,
            }

        new_balance = balance - tokens_spent
        await self.execute(
            """
            UPDATE token_balance
            SET balance = ?,
                lifetime_spent = lifetime_spent + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            [new_balance, tokens_spent, user_id],
        )
        await self.execute(
            """
            INSERT INTO token_transactions (user_id, amount, reason, ref_id, balance_after)
            VALUES (?, ?, ?, ?, ?)
            """,
            [user_id, -tokens_spent, action, ref_id, new_balance],
        )
        return {
            'ok': True,
            'duplicate': False,
            'balance': new_balance,
            'tokens_spent': tokens_spent,
        }

    async def pause_campaign_for_zero_tokens(self, campaign_id: int):
        await self.execute(
            """
            UPDATE campaigns
            SET status = 'paused',
                error_message = 'Баланс токенов исчерпан. Пополните токены, чтобы продолжить прогрев.'
            WHERE id = ?
            """,
            [campaign_id],
        )

    async def pause_broadcast_for_zero_tokens(self, broadcast_id: int):
        await self.execute(
            """
            UPDATE broadcasts
            SET status = 'paused',
                error = 'Баланс токенов исчерпан. Пополните токены, чтобы продолжить рассылку.'
            WHERE id = ?
            """,
            [broadcast_id],
        )

    async def get_campaign_owner_id(self, campaign_id: int) -> int | None:
        rows = await self.query('SELECT user_id FROM campaigns WHERE id = ? LIMIT 1', [campaign_id])
        return int(rows[0]['user_id']) if rows else None

    async def get_broadcast_owner_id(self, broadcast_id: int) -> int | None:
        rows = await self.query('SELECT user_id FROM broadcasts WHERE id = ? LIMIT 1', [broadcast_id])
        return int(rows[0]['user_id']) if rows else None

    async def record_tokens_zero_notification(self, user_id: int):
        await self.execute(
            """
            INSERT INTO notification_events (user_id, event_type, entity_type, entity_id, dedupe_key, payload_json)
            SELECT ?, 'tokens_zero', 'user', ?, ?, ?
            WHERE NOT EXISTS (
                SELECT 1
                FROM notification_events
                WHERE user_id = ?
                  AND dedupe_key = ?
                  AND created_at >= datetime('now', '-180 minutes')
            )
            """,
            [
                user_id,
                user_id,
                f'tokens_zero:{user_id}',
                '{"user_id": %d}' % user_id,
                user_id,
                f'tokens_zero:{user_id}',
            ],
        )

    async def pause_campaign_and_notify_zero_tokens(self, campaign_id: int):
        owner_id = await self.get_campaign_owner_id(campaign_id)
        await self.pause_campaign_for_zero_tokens(campaign_id)
        if owner_id is not None:
            await self.record_tokens_zero_notification(owner_id)

    async def pause_broadcast_and_notify_zero_tokens(self, broadcast_id: int):
        owner_id = await self.get_broadcast_owner_id(broadcast_id)
        await self.pause_broadcast_for_zero_tokens(broadcast_id)
        if owner_id is not None:
            await self.record_tokens_zero_notification(owner_id)

    async def record_ai_template_usage(self, user_id: int, campaign_id: int, idempotency_key: str) -> dict[str, Any]:
        return await self.spend_tokens_for_usage(
            user_id=user_id,
            action='ai_generate_template',
            idempotency_key=idempotency_key,
            ref_type='campaign',
            ref_id=str(campaign_id),
        )

    async def record_ai_dialog_usage(self, user_id: int, campaign_id: int, account_id: int, message_index: int) -> dict[str, Any]:
        return await self.spend_tokens_for_usage(
            user_id=user_id,
            action='ai_generate_dialog',
            idempotency_key=f'ai_dialog:{campaign_id}:{account_id}:{message_index}',
            ref_type='campaign_account',
            ref_id=f'{campaign_id}:{account_id}',
        )

    async def record_warmup_action_usage(self, user_id: int, campaign_id: int, account_id: int, action_type: str, target: str | None) -> dict[str, Any]:
        target_key = target or 'none'
        return await self.spend_tokens_for_usage(
            user_id=user_id,
            action='warmup_action',
            idempotency_key=f'warmup:{campaign_id}:{account_id}:{action_type}:{target_key}',
            ref_type='campaign_account',
            ref_id=f'{campaign_id}:{account_id}',
        )

    async def record_broadcast_usage(self, user_id: int, broadcast_id: int, message_id: int, target_mode: str) -> dict[str, Any]:
        action = 'group_or_channel_send' if target_mode == 'groups_or_channels' else 'dm_sent'
        return await self.spend_tokens_for_usage(
            user_id=user_id,
            action=action,
            idempotency_key=f'broadcast:{broadcast_id}:message:{message_id}',
            ref_type='broadcast_message',
            ref_id=str(message_id),
        )

    async def record_parsing_lead_usage(self, user_id: int, job_id: int, lead_key: str) -> dict[str, Any]:
        return await self.spend_tokens_for_usage(
            user_id=user_id,
            action='parsing_lead_added',
            idempotency_key=f'parsing:{job_id}:lead:{lead_key}',
            ref_type='parsing_job',
            ref_id=str(job_id),
        )

    async def record_parsing_ai_usage(self, user_id: int, job_id: int, group_key: str) -> dict[str, Any]:
        return await self.spend_tokens_for_usage(
            user_id=user_id,
            action='ai_parse_classification',
            idempotency_key=f'parsing:{job_id}:classify:{group_key}',
            ref_type='parsing_job',
            ref_id=str(job_id),
        )

    async def pause_parsing_and_notify_zero_tokens(self, job_id: int):
        rows = await self.query('SELECT user_id FROM parsing_jobs WHERE id = ? LIMIT 1', [job_id])
        user_id = int(rows[0]['user_id']) if rows else None
        await self.execute(
            """
            UPDATE parsing_jobs
            SET status = 'paused',
                error = 'Баланс токенов исчерпан. Пополните токены, чтобы продолжить парсинг.',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            [job_id],
        )
        if user_id is not None:
            await self.record_tokens_zero_notification(user_id)

    async def get_notification_chat_target(self, user_id: int) -> int | None:
        rows = await self.query('SELECT telegram_id FROM saas_users WHERE id = ? LIMIT 1', [user_id])
        if not rows or rows[0].get('telegram_id') is None:
            return None
        return int(rows[0]['telegram_id'])

    async def mark_latest_tokens_zero_notification_sent(self, user_id: int):
        await self.execute(
            """
            UPDATE notification_events
            SET sent_at = CURRENT_TIMESTAMP
            WHERE id = (
                SELECT id
                FROM notification_events
                WHERE user_id = ?
                  AND event_type = 'tokens_zero'
                  AND dedupe_key = ?
                  AND sent_at IS NULL
                ORDER BY created_at DESC, id DESC
                LIMIT 1
            )
            """,
            [user_id, f'tokens_zero:{user_id}'],
        )

    async def get_unsent_tokens_zero_users(self) -> list[int]:
        rows = await self.query(
            """
            SELECT DISTINCT user_id
            FROM notification_events
            WHERE event_type = 'tokens_zero'
              AND dedupe_key LIKE 'tokens_zero:%'
              AND sent_at IS NULL
            ORDER BY user_id ASC
            """
        )
        return [int(row['user_id']) for row in rows]

    async def get_zero_token_notification_enabled(self, user_id: int) -> bool:
        await self.execute(
            """
            INSERT OR IGNORE INTO user_notification_settings (
                user_id,
                tokens_zero_enabled,
                account_spam_block_enabled,
                account_banned_enabled,
                batch_check_complete_enabled
            )
            VALUES (?, 1, 1, 1, 1)
            """,
            [user_id],
        )
        rows = await self.query(
            'SELECT tokens_zero_enabled FROM user_notification_settings WHERE user_id = ? LIMIT 1',
            [user_id],
        )
        return bool(int(rows[0].get('tokens_zero_enabled') or 0)) if rows else False

    async def get_proxies_for_check(self, user_id: int) -> list[ProxyRecord]:
        rows = await self.query(
            """
            SELECT id, user_id, type, host, port, username, password, status
            FROM proxies
            WHERE user_id = ?
            ORDER BY id ASC
            """,
            [user_id],
        )
        return [
            {
                'id': int(row['id']),
                'user_id': int(row['user_id']),
                'type': str(row['type']),
                'host': str(row['host']),
                'port': int(row['port']),
                'username': row.get('username'),
                'password': row.get('password'),
                'status': str(row.get('status') or 'unknown'),
            }
            for row in rows
        ]

    async def update_proxy_check_result(
        self,
        *,
        proxy_id: int,
        user_id: int,
        status: str,
        latency_ms: int | None,
    ):
        await self.execute(
            """
            UPDATE proxies
            SET status = ?,
                latency_ms = ?,
                last_checked_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
            """,
            [status, latency_ms, proxy_id, user_id],
        )

    async def send_tokens_zero_notifications(self):
        bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '').strip()
        if not bot_token:
            return

        for user_id in await self.get_unsent_tokens_zero_users():
            if not await self.get_zero_token_notification_enabled(user_id):
                await self.mark_latest_tokens_zero_notification_sent(user_id)
                continue
            chat_id = await self.get_notification_chat_target(user_id)
            if chat_id is None:
                continue
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    f'https://api.telegram.org/bot{bot_token}/sendMessage',
                    json={
                        'chat_id': chat_id,
                        'text': 'Токены закончились. Активные задачи поставлены на паузу. Пополните баланс, чтобы продолжить работу.',
                        'disable_web_page_preview': True,
                    },
                )
            if response.is_success:
                await self.mark_latest_tokens_zero_notification_sent(user_id)

    async def get_account_login_state(self, account_id: int, user_id: int) -> dict[str, Any] | None:
        rows = await self.query(
            """
            SELECT als.account_id, als.user_id, als.phone, als.temp_session_string,
                   als.phone_code_hash, als.status, als.password_required, als.error_message, a.proxy
            FROM account_login_states als
            JOIN tg_accounts a ON a.id = als.account_id
            WHERE als.account_id = ? AND als.user_id = ?
            LIMIT 1
            """,
            [account_id, user_id],
        )
        return rows[0] if rows else None

    async def mark_account_login_state(
        self,
        *,
        account_id: int,
        user_id: int,
        status: str,
        temp_session_string: str | None = None,
        phone_code_hash: str | None = None,
        password_required: bool | None = None,
        error_message: str | None = None,
    ):
        await self.execute(
            """
            UPDATE account_login_states
            SET status = ?,
                temp_session_string = COALESCE(?, temp_session_string),
                phone_code_hash = COALESCE(?, phone_code_hash),
                password_required = COALESCE(?, password_required),
                error_message = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE account_id = ? AND user_id = ?
            """,
            [
                status,
                temp_session_string,
                phone_code_hash,
                None if password_required is None else int(password_required),
                error_message,
                account_id,
                user_id,
            ],
        )

    async def activate_account_session(
        self,
        *,
        account_id: int,
        user_id: int,
        phone: str,
        session_string: str,
        api_id: int,
        api_hash: str,
        first_name: str | None,
        username: str | None,
        tg_id: int | None,
    ):
        await self.execute(
            """
            UPDATE tg_accounts
            SET phone = ?,
                session_string = ?,
                api_id = ?,
                api_hash = ?,
                first_name = ?,
                username = ?,
                tg_id = ?,
                status = 'active',
                block_reason = NULL
            WHERE id = ? AND user_id = ?
            """,
            [phone, session_string, api_id, api_hash, first_name, username, tg_id, account_id, user_id],
        )
        await self.execute(
            """
            UPDATE account_login_states
            SET status = 'done',
                temp_session_string = NULL,
                phone_code_hash = NULL,
                password_required = 0,
                error_message = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE account_id = ? AND user_id = ?
            """,
            [account_id, user_id],
        )

    async def mark_account_login_error(self, *, account_id: int, user_id: int, error_message: str):
        await self.execute(
            """
            UPDATE account_login_states
            SET status = 'error',
                error_message = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE account_id = ? AND user_id = ?
            """,
            [error_message[:1000], account_id, user_id],
        )
        await self.execute(
            """
            UPDATE tg_accounts
            SET block_reason = ?
            WHERE id = ? AND user_id = ?
            """,
            [error_message[:1000], account_id, user_id],
        )

    async def get_account_for_spambot_check(self, account_id: int, user_id: int) -> dict[str, Any] | None:
        rows = await self.query(
            """
            SELECT id, user_id, session_string, api_id, api_hash, proxy
            FROM tg_accounts
            WHERE id = ? AND user_id = ?
            LIMIT 1
            """,
            [account_id, user_id],
        )
        return rows[0] if rows else None

    async def get_telegram_login_credentials(self) -> tuple[int, str]:
        return resolve_telegram_login_credentials()

    async def send_telegram_code(self, account_id: int, user_id: int):
        state = await self.get_account_login_state(account_id, user_id)
        if not state:
            raise RuntimeError(f'Login state for account {account_id} not found')

        phone = str(state['phone'])
        api_id, api_hash = await self.get_telegram_login_credentials()
        client = TelegramClient(
            session=StringSession(),
            api_id=int(api_id),
            api_hash=str(api_hash).strip(),
            proxy=self._decode_proxy(state.get('proxy')),
        )
        logger.info(
            'send_code credentials types: api_id=%s api_hash=%s client.api_id=%s client.api_hash=%s',
            type(api_id).__name__,
            type(api_hash).__name__,
            type(getattr(client, 'api_id', None)).__name__,
            type(getattr(client, 'api_hash', None)).__name__,
        )

        try:
            await client.connect()
            sent = await client.send_code_request(phone)
            await self.mark_account_login_state(
                account_id=account_id,
                user_id=user_id,
                status='code_sent',
                temp_session_string=client.session.save(),
                phone_code_hash=getattr(sent, 'phone_code_hash', None),
                password_required=False,
                error_message=None,
            )
        finally:
            await client.disconnect()

    async def confirm_telegram_code(
        self,
        *,
        account_id: int,
        user_id: int,
        code: str | None,
        password: str | None,
    ):
        state = await self.get_account_login_state(account_id, user_id)
        if not state:
            raise RuntimeError(f'Login state for account {account_id} not found')

        phone = str(state['phone'])
        temp_session_string = state.get('temp_session_string')
        phone_code_hash = state.get('phone_code_hash')
        api_id, api_hash = await self.get_telegram_login_credentials()
        client = TelegramClient(
            session=StringSession(str(temp_session_string or '')),
            api_id=int(api_id),
            api_hash=str(api_hash).strip(),
            proxy=self._decode_proxy(state.get('proxy')),
        )

        try:
            await client.connect()
            if password:
                user = await client.sign_in(password=password)
            else:
                if not code or not phone_code_hash:
                    raise RuntimeError('Code confirmation is not ready yet')
                user = await client.sign_in(phone=phone, code=code, phone_code_hash=str(phone_code_hash))

            session_string = client.session.save()
            await self.activate_account_session(
                account_id=account_id,
                user_id=user_id,
                phone=phone,
                session_string=session_string,
                api_id=api_id,
                api_hash=api_hash,
                first_name=getattr(user, 'first_name', None),
                username=getattr(user, 'username', None),
                tg_id=getattr(user, 'id', None),
            )
        finally:
            await client.disconnect()

    async def update_spambot_check_result(
        self,
        *,
        account_id: int,
        user_id: int,
        status: str,
        raw_text: str | None,
    ):
        block_reason = raw_text[:1000] if raw_text else None
        await self.execute(
            """
            UPDATE tg_accounts
            SET spambot_status = ?,
                spambot_checked_at = CURRENT_TIMESTAMP,
                block_reason = CASE
                    WHEN ? IN ('spam', 'unknown') THEN COALESCE(?, block_reason)
                    ELSE block_reason
                END,
                status = CASE
                    WHEN ? = 'spam' AND status NOT IN ('banned', 'disabled') THEN 'spam_block'
                    WHEN ? = 'clean' AND status = 'spam_block' THEN 'active'
                    ELSE status
                END
            WHERE id = ? AND user_id = ?
            """,
            [status, status, block_reason, status, status, account_id, user_id],
        )

    async def run_spambot_check(self, account_id: int, user_id: int):
        account = await self.get_account_for_spambot_check(account_id, user_id)
        if not account:
            raise RuntimeError(f'Account {account_id} not found for SpamBot check')

        session_string = account.get('session_string')
        api_id = account.get('api_id')
        api_hash = account.get('api_hash')
        if not session_string or not api_id or not api_hash:
            raise RuntimeError(f'Account {account_id} is missing Telegram session credentials')

        client = TelegramClient(
            StringSession(str(session_string)),
            int(api_id),
            str(api_hash),
            proxy=self._decode_proxy(account.get('proxy')),
        )

        async with client:
            async with client.conversation('@SpamBot', timeout=45) as conv:
                await conv.send_message('/start')
                response = await conv.get_response()

        status = self._detect_spambot_status(getattr(response, 'raw_text', None))
        await self.update_spambot_check_result(
            account_id=account_id,
            user_id=user_id,
            status=status,
            raw_text=getattr(response, 'raw_text', None),
        )

    def _decode_proxy(self, proxy_value: Any) -> Any:
        if not proxy_value:
            return None
        if isinstance(proxy_value, dict):
            return proxy_value
        if isinstance(proxy_value, str):
            try:
                return json.loads(proxy_value)
            except json.JSONDecodeError:
                return None
        return None

    def _detect_spambot_status(self, text: str | None) -> str:
        value = (text or '').lower()
        if not value:
            return 'unknown'
        if 'no limits are currently applied' in value or 'good news' in value or 'ограничений нет' in value:
            return 'clean'
        if 'limit' in value or 'spam' in value or 'ограничен' in value or 'жалоб' in value:
            return 'spam'
        return 'unknown'
