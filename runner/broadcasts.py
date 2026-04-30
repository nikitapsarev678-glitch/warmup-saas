import json
import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from telethon import TelegramClient
from telethon.errors import FloodWaitError, PeerFloodError, PhoneNumberBannedError, SessionRevokedError, UserDeactivatedBanError
from telethon.sessions import StringSession

from d1_client import D1Client

logger = logging.getLogger(__name__)


class TokensDepletedError(RuntimeError):
    pass


class BroadcastProcessor:
    def __init__(self, db: D1Client):
        self.db = db

    async def run(self, broadcast_id: int, step: int = 0):
        broadcast = await self._get_broadcast(broadcast_id)
        if not broadcast:
            raise RuntimeError(f'Broadcast {broadcast_id} not found')

        if broadcast['status'] == 'paused':
            logger.info('Broadcast %s is paused', broadcast_id)
            return

        await self._set_broadcast_status(broadcast_id, 'running')

        leads = await self._get_pending_leads(broadcast, step)
        if not leads:
            if step == 0:
                await self._set_broadcast_status(broadcast_id, 'completed')
            return

        accounts = await self._get_sender_accounts(broadcast_id, int(broadcast['user_id']))
        if not accounts:
            await self._set_broadcast_status(
                broadcast_id,
                'paused',
                'Нет доступных аккаунтов для отправки',
            )
            return

        limits = self._decode_json(broadcast.get('limits_json'), {})
        settings = self._decode_json(broadcast.get('settings_json'), {})
        message_variants = self._decode_json(broadcast.get('message_variants_json'), [])
        if not isinstance(message_variants, list) or not message_variants:
            raise RuntimeError(f'Broadcast {broadcast_id} has no messages configured')

        daily_limit = max(1, int(limits.get('daily_limit_per_account') or 20))
        sent_by_account: dict[int, int] = {}
        account_index = 0

        for lead in leads:
            try:
                if step > 0:
                    replied = await self._lead_has_reply(accounts, lead)
                    if replied:
                        await self._mark_lead_replied(int(lead['id']))
                        await self._cancel_followups(broadcast_id, int(lead['id']))
                        continue

                delivery = await self._ensure_message_slot(broadcast, lead, step)
                if delivery == 'duplicate':
                    continue

                message = self._pick_message(message_variants, step, settings)
                delivery_sent = False
                last_error: str | None = None
                candidate_count = len(accounts)
                attempted_account_ids: set[int] = set()

                while len(attempted_account_ids) < candidate_count:
                    selected_account, account_index, limit_hit = self._select_next_account(
                        accounts,
                        sent_by_account,
                        daily_limit,
                        account_index,
                        attempted_account_ids,
                    )

                    if selected_account is None:
                        if limit_hit:
                            await self._set_broadcast_status(
                                broadcast_id,
                                'paused',
                                'Достигнут дневной лимит по всем аккаунтам',
                            )
                            return
                        break

                    account_id = int(selected_account['id'])

                    try:
                        await self._send_message(selected_account, lead, message)
                        usage = await self.db.record_broadcast_usage(
                            user_id=int(broadcast['user_id']),
                            broadcast_id=broadcast_id,
                            message_id=int(delivery['id']),
                            target_mode=str(broadcast.get('target_mode') or 'dm'),
                        )
                        if not usage.get('ok'):
                            await self.db.pause_broadcast_and_notify_zero_tokens(broadcast_id)
                            raise TokensDepletedError(usage.get('error') or 'Недостаточно токенов')
                        sent_by_account[account_id] = sent_by_account.get(account_id, 0) + 1
                        await self._mark_delivery_sent(int(delivery['id']), account_id)
                        await self.db.execute(
                            'UPDATE tg_accounts SET messages_sent = messages_sent + 1 WHERE id = ?',
                            [account_id],
                        )

                        if step == 0:
                            await self._schedule_followups(broadcast, lead, settings)
                        else:
                            await self._mark_followup_done(broadcast_id, int(lead['id']), step)

                        delivery_sent = True
                        break
                    except TokensDepletedError:
                        raise
                    except (PeerFloodError, FloodWaitError) as exc:
                        last_error = str(exc)
                        await self._mark_account_spam_block(selected_account, last_error)
                    except (PhoneNumberBannedError, UserDeactivatedBanError, SessionRevokedError) as exc:
                        last_error = str(exc)
                        await self._mark_account_banned(selected_account, last_error)
                    except Exception as exc:
                        last_error = str(exc)

                if not delivery_sent:
                    await self._mark_delivery_failed(
                        int(delivery['id']),
                        last_error or 'Нет доступных аккаунтов для отправки',
                        None,
                    )
                    if step > 0:
                        await self._mark_followup_cancelled(broadcast_id, int(lead['id']), step)
            except TokensDepletedError:
                return


        pending = await self.db.query(
            'SELECT COUNT(*) as cnt FROM broadcast_messages WHERE broadcast_id = ? AND status = ? AND step = ?',
            [broadcast_id, 'queued', step],
        )
        failed = await self.db.query(
            'SELECT COUNT(*) as cnt FROM broadcast_messages WHERE broadcast_id = ? AND status = ? AND step = ?',
            [broadcast_id, 'failed', step],
        )

        if pending and int(pending[0].get('cnt', 0)) > 0:
            await self._set_broadcast_status(broadcast_id, 'paused', 'Остались необработанные сообщения')
        elif failed and int(failed[0].get('cnt', 0)) > 0 and step == 0:
            await self._set_broadcast_status(broadcast_id, 'paused', 'Часть сообщений не отправлена')
        else:
            await self._set_broadcast_status(broadcast_id, 'completed')

    async def queue_due_followups(self):
        due = await self.db.query(
            """
            SELECT DISTINCT broadcast_id, step
            FROM followups
            WHERE status = 'pending'
              AND due_at <= CURRENT_TIMESTAMP
            ORDER BY broadcast_id ASC, step ASC
            """
        )

        for item in due:
            await self.db.execute(
                "UPDATE followups SET status = 'queued' WHERE broadcast_id = ? AND step = ? AND status = 'pending' AND due_at <= CURRENT_TIMESTAMP",
                [item['broadcast_id'], item['step']],
            )
            await self.db.execute(
                "INSERT INTO task_queue (campaign_id, action, params_json) VALUES (0, 'send_followups', ?)",
                [json.dumps({'broadcast_id': int(item['broadcast_id']), 'step': int(item['step'])})],
            )

    async def run_followups(self, broadcast_id: int, step: int):
        await self.run(broadcast_id, step)

    def _select_next_account(
        self,
        accounts: list[dict[str, Any]],
        sent_by_account: dict[int, int],
        daily_limit: int,
        account_index: int,
        attempted_account_ids: set[int],
    ):
        checked = 0
        saw_available_under_limit = False

        while checked < len(accounts):
            candidate = accounts[account_index % len(accounts)]
            account_index += 1
            checked += 1
            account_id = int(candidate['id'])
            if account_id in attempted_account_ids:
                continue
            if sent_by_account.get(account_id, 0) >= daily_limit:
                attempted_account_ids.add(account_id)
                continue
            saw_available_under_limit = True
            attempted_account_ids.add(account_id)
            return candidate, account_index, False

        return None, account_index, not saw_available_under_limit

    async def _lead_has_reply(self, accounts: list[dict[str, Any]], lead: dict[str, Any]) -> bool:
        target = lead.get('username') or lead.get('telegram_id')
        if not target:
            return False

        for account in accounts:
            try:
                has_reply = await self._account_has_reply(account, target)
            except Exception as exc:
                logger.warning('Reply check failed for account %s and lead %s: %s', account.get('id'), lead.get('id'), exc)
                continue
            if has_reply:
                return True

        return False

    async def _account_has_reply(self, account: dict[str, Any], target: Any) -> bool:
        session_string = account.get('session_string')
        api_id = account.get('api_id')
        api_hash = account.get('api_hash')
        if not session_string or not api_id or not api_hash:
            return False

        client = TelegramClient(StringSession(str(session_string)), int(api_id), str(api_hash))
        async with client:
            entity = await client.get_entity(str(target))
            async for message in client.iter_messages(entity, limit=10):
                if message.out:
                    continue
                return True
        return False

    async def _mark_lead_replied(self, lead_id: int):
        await self.db.execute(
            "UPDATE leads SET status = 'replied' WHERE id = ?",
            [lead_id],
        )

    async def _cancel_followups(self, broadcast_id: int, lead_id: int):
        await self.db.execute(
            "UPDATE followups SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE broadcast_id = ? AND lead_id = ? AND status IN ('pending', 'queued')",
            [broadcast_id, lead_id],
        )

    async def _mark_followup_cancelled(self, broadcast_id: int, lead_id: int, step: int):
        await self.db.execute(
            "UPDATE followups SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE broadcast_id = ? AND lead_id = ? AND step = ? AND status IN ('pending', 'queued')",
            [broadcast_id, lead_id, step],
        )

    async def _get_broadcast(self, broadcast_id: int) -> dict[str, Any] | None:
        rows = await self.db.query(
            'SELECT * FROM broadcasts WHERE id = ? LIMIT 1',
            [broadcast_id],
        )
        return rows[0] if rows else None

    async def _get_sender_accounts(self, broadcast_id: int, user_id: int) -> list[dict[str, Any]]:
        return await self.db.query(
            """
            SELECT a.*
            FROM broadcast_accounts ba
            JOIN tg_accounts a ON a.id = ba.account_id
            WHERE ba.broadcast_id = ?
              AND a.user_id = ?
              AND a.status IN ('active', 'warming', 'warmed')
              AND (a.pause_until IS NULL OR a.pause_until <= CURRENT_TIMESTAMP)
            ORDER BY ba.created_at ASC, a.id ASC
            """,
            [broadcast_id, user_id],
        )

    async def _get_pending_leads(self, broadcast: dict[str, Any], step: int) -> list[dict[str, Any]]:
        if step == 0:
            return await self.db.query(
                """
                SELECT l.*
                FROM leads l
                WHERE l.user_id = ?
                  AND (? IS NULL OR l.project_id = ?)
                  AND l.status = 'active'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM broadcast_messages bm
                    WHERE bm.broadcast_id = ?
                      AND bm.lead_id = l.id
                      AND bm.step = 0
                  )
                ORDER BY l.created_at ASC, l.id ASC
                """,
                [broadcast['user_id'], broadcast.get('project_id'), broadcast.get('project_id'), broadcast['id']],
            )

        return await self.db.query(
            """
            SELECT l.*
            FROM leads l
            JOIN followups f ON f.lead_id = l.id
            WHERE f.broadcast_id = ?
              AND f.step = ?
              AND f.status IN ('pending', 'queued')
              AND f.due_at <= CURRENT_TIMESTAMP
              AND l.user_id = ?
              AND l.status = 'active'
              AND NOT EXISTS (
                SELECT 1
                FROM broadcast_messages bm
                WHERE bm.broadcast_id = ?
                  AND bm.lead_id = l.id
                  AND bm.step = ?
              )
            ORDER BY f.due_at ASC, f.id ASC
            """,
            [broadcast['id'], step, broadcast['user_id'], broadcast['id'], step],
        )

    async def _ensure_message_slot(self, broadcast: dict[str, Any], lead: dict[str, Any], step: int):
        existing = await self.db.query(
            'SELECT id FROM broadcast_messages WHERE broadcast_id = ? AND lead_id = ? AND step = ? LIMIT 1',
            [broadcast['id'], lead['id'], step],
        )
        if existing:
            return 'duplicate'

        await self.db.execute(
            """
            INSERT INTO broadcast_messages (user_id, broadcast_id, lead_id, account_id, step, status)
            VALUES (?, ?, ?, NULL, ?, 'queued')
            """,
            [broadcast['user_id'], broadcast['id'], lead['id'], step],
        )

        rows = await self.db.query(
            'SELECT id FROM broadcast_messages WHERE broadcast_id = ? AND lead_id = ? AND step = ? LIMIT 1',
            [broadcast['id'], lead['id'], step],
        )
        return rows[0]

    async def _send_message(self, account: dict[str, Any], lead: dict[str, Any], message: str):
        session_string = account.get('session_string')
        api_id = account.get('api_id')
        api_hash = account.get('api_hash')
        if not session_string or not api_id or not api_hash:
            raise RuntimeError(f"Account {account.get('id')} is missing Telegram session credentials")

        username = lead.get('username')
        telegram_id = lead.get('telegram_id')
        target = username or telegram_id
        if not target:
            raise RuntimeError(f"Lead {lead.get('id')} has no target")

        client = TelegramClient(StringSession(str(session_string)), int(api_id), str(api_hash))
        async with client:
            entity = await client.get_entity(str(target))
            await client.send_message(entity, message)

    async def _mark_delivery_sent(self, message_id: int, account_id: int):
        await self.db.execute(
            "UPDATE broadcast_messages SET status = 'sent', account_id = ?, sent_at = CURRENT_TIMESTAMP, error = NULL WHERE id = ?",
            [account_id, message_id],
        )

    async def _mark_delivery_failed(self, message_id: int, error: str, account_id: int | None):
        await self.db.execute(
            "UPDATE broadcast_messages SET status = 'failed', account_id = ?, error = ? WHERE id = ?",
            [account_id, error[:1000], message_id],
        )

    async def _schedule_followups(self, broadcast: dict[str, Any], lead: dict[str, Any], settings: dict[str, Any]):
        if settings.get('followup_day3_enabled'):
            await self._insert_followup(broadcast, lead, 1, 3)
        if settings.get('followup_day7_enabled'):
            await self._insert_followup(broadcast, lead, 2, 7)

    async def _insert_followup(self, broadcast: dict[str, Any], lead: dict[str, Any], step: int, days: int):
        due_at = (datetime.now(timezone.utc) + timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S')
        existing = await self.db.query(
            'SELECT id FROM followups WHERE broadcast_id = ? AND lead_id = ? AND step = ? LIMIT 1',
            [broadcast['id'], lead['id'], step],
        )
        if existing:
            return

        await self.db.execute(
            """
            INSERT INTO followups (user_id, broadcast_id, lead_id, step, due_at, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
            """,
            [broadcast['user_id'], broadcast['id'], lead['id'], step, due_at],
        )

    async def _mark_followup_done(self, broadcast_id: int, lead_id: int, step: int):
        await self.db.execute(
            "UPDATE followups SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE broadcast_id = ? AND lead_id = ? AND step = ?",
            [broadcast_id, lead_id, step],
        )

    async def _mark_account_spam_block(self, account: dict[str, Any], reason: str):
        pause_until = (datetime.now(timezone.utc) + timedelta(hours=12)).strftime('%Y-%m-%d %H:%M:%S')
        await self.db.execute(
            "UPDATE tg_accounts SET status = 'spam_block', block_reason = ?, blocked_at = CURRENT_TIMESTAMP, pause_until = ? WHERE id = ?",
            [reason[:255], pause_until, account['id']],
        )

    async def _mark_account_banned(self, account: dict[str, Any], reason: str):
        await self.db.execute(
            "UPDATE tg_accounts SET status = 'banned', block_reason = ?, blocked_at = CURRENT_TIMESTAMP WHERE id = ?",
            [reason[:255], account['id']],
        )

    async def _set_broadcast_status(self, broadcast_id: int, status: str, error: str | None = None):
        completed_at = self._now_sql() if status == 'completed' else None
        await self.db.execute(
            'UPDATE broadcasts SET status = ?, error = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?',
            [status, error, completed_at, broadcast_id],
        )

    def _pick_message(self, variants: list[Any], step: int, settings: dict[str, Any]) -> str:
        if step == 1 and settings.get('followup_day3_message'):
            return str(settings['followup_day3_message'])
        if step == 2 and settings.get('followup_day7_message'):
            return str(settings['followup_day7_message'])
        return str(random.choice(variants))

    def _decode_json(self, value: Any, fallback: Any):
        if value is None:
            return fallback
        if isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(value)
        except (TypeError, json.JSONDecodeError):
            return fallback

    def _now_sql(self) -> str:
        return datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
