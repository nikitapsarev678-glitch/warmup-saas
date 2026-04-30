import json
import logging
import random
from typing import Any

import socks
from telethon import TelegramClient, functions
from telethon.sessions import StringSession
from telethon.tl.types import ChannelParticipantsAdmins

from ai_client import AIClient
from d1_client import D1Client

logger = logging.getLogger(__name__)


class TokensDepletedError(RuntimeError):
    pass


class ParsingProcessor:
    def __init__(self, db: D1Client):
        self.db = db
        self.ai_client = AIClient()

    async def run(self, job_id: int):
        job = await self._get_job(job_id)
        if not job:
            raise RuntimeError(f'Parsing job {job_id} not found')

        if str(job['status']) == 'paused':
            logger.info('Parsing job %s is paused', job_id)
            return

        query_text = str(job.get('query_text') or '').strip()
        if not query_text:
            await self._set_status(job_id, 'error', 'Пустой parsing query')
            return

        account = await self._get_account_for_job(int(job['user_id']), job.get('project_id'))
        if not account:
            await self._set_status(job_id, 'paused', 'Нет доступного Telegram-аккаунта для парсинга')
            return

        progress = self._decode_json(job.get('progress_json'), self._default_progress())
        progress = self._normalize_progress(progress)
        limit_count = max(1, int(job.get('limit_count') or 25))
        classify_with_ai = bool(int(job.get('classify_with_ai') or 0))
        query_parts = self._extract_query_parts(query_text)

        await self.db.execute(
            """
            UPDATE parsing_jobs
            SET status = 'running',
                started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                error = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            [job_id],
        )

        client = TelegramClient(
            StringSession(str(account['session_string'])),
            int(account['api_id']),
            str(account['api_hash']),
            proxy=self._build_proxy(self._decode_json(account.get('proxy'), None)),
        )

        try:
            async with client:
                groups = await self._search_groups(client, query_parts, limit_count)
                progress['groups_found'] = len(groups)
                await self._update_progress(job_id, progress)

                leads_added = 0
                for group in groups:
                    group_key = str(group.get('username') or group.get('id') or group.get('title') or 'unknown')
                    if classify_with_ai:
                        await self._classify_group(int(job['user_id']), job_id, group_key, group.get('title') or group_key)
                        progress['tokens_spent'] += 5

                    admins = await self._collect_admins(client, group)
                    participants = []
                    if len(admins) < limit_count:
                        participants = await self._collect_participants(client, group, limit_count - len(admins))

                    progress['admins_found'] += len(admins)
                    progress['participants_found'] += len(participants)

                    for lead in admins + participants:
                        inserted = await self._insert_lead(job, job_id, lead)
                        if inserted == 'skipped':
                            progress['leads_skipped'] += 1
                            continue

                        lead_key = self._lead_key(lead)
                        usage = await self.db.record_parsing_lead_usage(int(job['user_id']), job_id, lead_key)
                        if not usage.get('ok'):
                            await self.db.pause_parsing_and_notify_zero_tokens(job_id)
                            raise TokensDepletedError(usage.get('error') or 'Недостаточно токенов')

                        if not usage.get('duplicate'):
                            progress['tokens_spent'] += int(usage.get('tokens_spent') or 0)
                        progress['leads_added'] += 1
                        leads_added += 1
                        if leads_added >= limit_count:
                            break

                    progress['groups_processed'] += 1
                    await self._update_progress(job_id, progress)
                    if leads_added >= limit_count:
                        break

                await self.db.execute(
                    """
                    UPDATE parsing_jobs
                    SET status = 'completed',
                        progress_json = ?,
                        completed_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP,
                        error = NULL
                    WHERE id = ?
                    """,
                    [json.dumps(progress), job_id],
                )
        except TokensDepletedError:
            return
        except Exception as exc:
            logger.exception('Parsing job %s failed', job_id)
            await self._set_status(job_id, 'error', str(exc))
            raise

    async def _get_job(self, job_id: int) -> dict[str, Any] | None:
        rows = await self.db.query('SELECT * FROM parsing_jobs WHERE id = ? LIMIT 1', [job_id])
        return rows[0] if rows else None

    async def _get_account_for_job(self, user_id: int, project_id: Any) -> dict[str, Any] | None:
        params: list[Any] = [user_id]
        project_sql = ''
        if project_id is not None:
            project_sql = ' AND (project_id = ? OR project_id IS NULL)'
            params.append(project_id)

        rows = await self.db.query(
            f"""
            SELECT id, session_string, api_id, api_hash, proxy, username, phone
            FROM tg_accounts
            WHERE user_id = ?
              AND status IN ('active', 'warming', 'warmed')
              AND session_string IS NOT NULL
              AND api_id IS NOT NULL
              AND api_hash IS NOT NULL
              {project_sql}
            ORDER BY CASE WHEN project_id IS NULL THEN 1 ELSE 0 END ASC, id ASC
            LIMIT 1
            """,
            params,
        )
        return rows[0] if rows else None

    async def _search_groups(self, client: TelegramClient, query_parts: list[str], limit_count: int) -> list[dict[str, Any]]:
        groups: list[dict[str, Any]] = []
        seen: set[str] = set()

        for part in query_parts:
            if part.startswith('@'):
                part = part[1:]
            if not part:
                continue

            try:
                entity = await client.get_entity(part)
                candidate = self._group_from_entity(entity)
                if candidate and self._group_identity(candidate) not in seen:
                    groups.append(candidate)
                    seen.add(self._group_identity(candidate))
            except Exception:
                pass

            try:
                result = await client(functions.contacts.SearchRequest(q=part, limit=min(max(limit_count, 5), 20)))
                for chat in list(result.chats or []):
                    candidate = self._group_from_entity(chat)
                    if not candidate:
                        continue
                    key = self._group_identity(candidate)
                    if key in seen:
                        continue
                    seen.add(key)
                    groups.append(candidate)
                    if len(groups) >= limit_count:
                        return groups
            except Exception as exc:
                logger.warning('Failed to search groups for %s: %s', part, exc)

            if len(groups) >= limit_count:
                break

        return groups

    async def _collect_admins(self, client: TelegramClient, group: dict[str, Any]) -> list[dict[str, Any]]:
        entity = await client.get_entity(group['entity'])
        results: list[dict[str, Any]] = []
        seen: set[str] = set()
        async for user in client.iter_participants(entity, filter=ChannelParticipantsAdmins()):
            lead = self._lead_from_user(user, group, 'group_admin')
            if not lead:
                continue
            key = self._lead_key(lead)
            if key in seen:
                continue
            seen.add(key)
            results.append(lead)
        return results

    async def _collect_participants(self, client: TelegramClient, group: dict[str, Any], remaining: int) -> list[dict[str, Any]]:
        if remaining <= 0:
            return []

        entity = await client.get_entity(group['entity'])
        results: list[dict[str, Any]] = []
        seen: set[str] = set()
        async for user in client.iter_participants(entity, limit=min(max(remaining * 2, remaining), 50)):
            lead = self._lead_from_user(user, group, 'group_participant')
            if not lead:
                continue
            key = self._lead_key(lead)
            if key in seen:
                continue
            seen.add(key)
            results.append(lead)
            if len(results) >= remaining:
                break
        return results

    async def _classify_group(self, user_id: int, job_id: int, group_key: str, title: str):
        usage = await self.db.record_parsing_ai_usage(user_id, job_id, group_key)
        if not usage.get('ok'):
            await self.db.pause_parsing_and_notify_zero_tokens(job_id)
            raise TokensDepletedError(usage.get('error') or 'Недостаточно токенов')
        if usage.get('duplicate'):
            return
        try:
            await self.ai_client.generate_message(['work'], context=[f'Ниша группы: {title}'], is_reply=False)
        except Exception:
            return

    async def _insert_lead(self, job: dict[str, Any], job_id: int, lead: dict[str, Any]) -> str:
        user_id = int(job['user_id'])
        username = lead.get('username')
        telegram_id = lead.get('telegram_id')
        existing = await self.db.query(
            """
            SELECT id
            FROM leads
            WHERE user_id = ?
              AND ((? IS NOT NULL AND username = ?) OR (? IS NOT NULL AND telegram_id = ?))
            LIMIT 1
            """,
            [user_id, username, username, telegram_id, telegram_id],
        )
        if existing:
            return 'skipped'

        await self.db.execute(
            """
            INSERT INTO leads (
              user_id,
              project_id,
              telegram_id,
              username,
              title,
              source,
              source_ref_type,
              source_ref_id,
              status
            )
            VALUES (?, ?, ?, ?, ?, 'parsing', 'parsing_job', ?, 'active')
            """,
            [
                user_id,
                job.get('project_id'),
                telegram_id,
                username,
                lead.get('title'),
                str(job_id),
            ],
        )
        return 'inserted'

    async def _set_status(self, job_id: int, status: str, error: str | None):
        await self.db.execute(
            """
            UPDATE parsing_jobs
            SET status = ?,
                error = ?,
                updated_at = CURRENT_TIMESTAMP,
                completed_at = CASE WHEN ? IN ('completed', 'error') THEN CURRENT_TIMESTAMP ELSE completed_at END
            WHERE id = ?
            """,
            [status, error, status, job_id],
        )

    async def _update_progress(self, job_id: int, progress: dict[str, int]):
        await self.db.execute(
            """
            UPDATE parsing_jobs
            SET progress_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            [json.dumps(progress), job_id],
        )

    def _extract_query_parts(self, query_text: str) -> list[str]:
        seen: set[str] = set()
        parts: list[str] = []
        for chunk in query_text.replace('\n', ',').split(','):
            value = chunk.strip()
            if not value:
                continue
            key = value.lower()
            if key in seen:
                continue
            seen.add(key)
            parts.append(value)
        return parts or [query_text.strip()]

    def _group_from_entity(self, entity: Any) -> dict[str, Any] | None:
        username = getattr(entity, 'username', None)
        entity_id = getattr(entity, 'id', None)
        title = getattr(entity, 'title', None) or username or str(entity_id or '')
        if entity_id is None and not username:
            return None
        return {
            'id': entity_id,
            'username': username,
            'title': title,
            'entity': username or entity_id,
        }

    def _group_identity(self, group: dict[str, Any]) -> str:
        if group.get('username'):
            return f"username:{str(group['username']).lower()}"
        return f"id:{group.get('id')}"

    def _lead_from_user(self, user: Any, group: dict[str, Any], source: str) -> dict[str, Any] | None:
        username = getattr(user, 'username', None)
        telegram_id = getattr(user, 'id', None)
        if telegram_id is None and not username:
            return None
        first_name = getattr(user, 'first_name', None) or ''
        last_name = getattr(user, 'last_name', None) or ''
        display_name = ' '.join(part for part in [first_name.strip(), last_name.strip()] if part).strip() or group.get('title')
        return {
            'telegram_id': int(telegram_id) if telegram_id is not None else None,
            'username': str(username).strip().lower() if username else None,
            'title': str(display_name)[:255] if display_name else None,
            'source': source,
        }

    def _lead_key(self, lead: dict[str, Any]) -> str:
        if lead.get('username'):
            return f"u:{lead['username']}"
        return f"id:{lead.get('telegram_id')}"

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

    def _decode_json(self, value: Any, fallback: Any):
        if not value:
            return fallback
        if isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback

    def _default_progress(self) -> dict[str, int]:
        return {
            'groups_found': 0,
            'groups_processed': 0,
            'admins_found': 0,
            'participants_found': 0,
            'leads_added': 0,
            'leads_skipped': 0,
            'tokens_spent': 0,
        }

    def _normalize_progress(self, value: Any) -> dict[str, int]:
        progress = self._default_progress()
        if not isinstance(value, dict):
            return progress
        for key in progress:
            progress[key] = max(0, int(value.get(key) or 0))
        return progress
