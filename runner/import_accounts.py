import io
import json
import logging
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import httpx
from opentele.api import UseCurrentSession
from opentele.td import TDesktop
from telethon.sessions import StringSession

from d1_client import D1Client

logger = logging.getLogger(__name__)

SUPPORTED_SOURCE_TYPES = {'tdata_zip', 'session_json_zip', 'string_session_txt'}


class AccountImportProcessor:
    def __init__(self, db: D1Client):
        self.db = db

    async def run(self, job_id: int, download_url: str):
        job = await self._get_job(job_id)
        if not job:
            raise RuntimeError(f'Import job {job_id} not found')

        source_type = str(job['source_type'])
        if source_type not in SUPPORTED_SOURCE_TYPES:
            raise RuntimeError(f'Unsupported source_type: {source_type}')

        await self._set_job_status(job_id, 'running')
        archive_bytes = await self._download_archive(download_url)

        with tempfile.TemporaryDirectory(prefix=f'varmup-import-{job_id}-') as temp_dir:
            extract_dir = Path(temp_dir) / 'extract'
            extract_dir.mkdir(parents=True, exist_ok=True)
            self._extract_archive(archive_bytes, extract_dir)

            if source_type == 'tdata_zip':
                result = await self._import_tdata(job, extract_dir)
            elif source_type == 'session_json_zip':
                result = await self._import_session_json(job, extract_dir)
            else:
                result = await self._import_string_sessions(job, extract_dir)

        status = result.get('status', 'done')
        await self._finish_job(job_id, status, result)

    async def _import_tdata(self, job: dict[str, Any], extract_dir: Path) -> dict[str, Any]:
        stats = {'found': 0, 'imported': 0, 'errors': 0, 'skipped': 0}
        action_required: dict[str, Any] | None = None

        candidates = self._find_tdata_dirs(extract_dir)
        stats['found'] = len(candidates)

        if not candidates:
            return {
                'status': 'error',
                'stats': stats,
                'error': 'TData архив не содержит папок tdata',
            }

        for tdata_dir in candidates:
            try:
                payload = await self._convert_tdata_dir(tdata_dir)
            except ActionRequiredError as exc:
                stats['errors'] += 1
                action_required = exc.payload
                break
            except Exception as exc:
                stats['errors'] += 1
                logger.warning('TData import failed for %s: %s', tdata_dir, exc)
                continue

            created = await self._insert_account(job, payload)
            if created == 'imported':
                stats['imported'] += 1
            else:
                stats['skipped'] += 1

        if action_required:
            return {
                'status': 'action_required',
                'stats': stats,
                'action': action_required,
            }

        if stats['imported'] == 0 and stats['errors'] > 0:
            return {
                'status': 'error',
                'stats': stats,
                'error': 'Не удалось импортировать ни одного аккаунта из TData',
            }

        return {'status': 'done', 'stats': stats}

    async def _import_session_json(self, job: dict[str, Any], extract_dir: Path) -> dict[str, Any]:
        stats = {'found': 0, 'imported': 0, 'errors': 0, 'skipped': 0}
        json_files = sorted(extract_dir.rglob('*.json'))
        stats['found'] = len(json_files)

        for json_file in json_files:
            try:
                data = json.loads(json_file.read_text(encoding='utf-8'))
            except Exception:
                stats['errors'] += 1
                continue

            session_string = str(data.get('session_string') or '').strip()
            phone = str(data.get('phone') or '').strip()
            if not session_string or not phone:
                stats['errors'] += 1
                continue

            created = await self._insert_account(
                job,
                {
                    'phone': phone,
                    'session_string': session_string,
                    'api_id': self._to_optional_int(data.get('api_id')),
                    'api_hash': self._to_optional_str(data.get('api_hash')),
                    'first_name': self._to_optional_str(data.get('first_name')),
                    'username': self._to_optional_str(data.get('username')),
                    'tg_id': self._to_optional_int(data.get('tg_id')),
                },
            )
            if created == 'imported':
                stats['imported'] += 1
            else:
                stats['skipped'] += 1

        if stats['imported'] == 0 and stats['errors'] > 0:
            return {'status': 'error', 'stats': stats, 'error': 'Не найдено валидных session JSON'}

        return {'status': 'done', 'stats': stats}

    async def _import_string_sessions(self, job: dict[str, Any], extract_dir: Path) -> dict[str, Any]:
        stats = {'found': 0, 'imported': 0, 'errors': 0, 'skipped': 0}
        txt_files = sorted(extract_dir.rglob('*.txt'))

        rows: list[str] = []
        for txt_file in txt_files:
            rows.extend(line.strip() for line in txt_file.read_text(encoding='utf-8').splitlines() if line.strip())

        stats['found'] = len(rows)

        for index, row in enumerate(rows, start=1):
            parts = [part.strip() for part in row.split('|')]
            if len(parts) < 2:
                stats['errors'] += 1
                continue

            phone, session_string = parts[0], parts[1]
            if not phone or not session_string:
                stats['errors'] += 1
                continue

            created = await self._insert_account(
                job,
                {
                    'phone': phone,
                    'session_string': session_string,
                    'api_id': None,
                    'api_hash': None,
                    'first_name': None,
                    'username': None,
                    'tg_id': None,
                    'label': f'line-{index}',
                },
            )
            if created == 'imported':
                stats['imported'] += 1
            else:
                stats['skipped'] += 1

        if stats['imported'] == 0 and stats['errors'] > 0:
            return {'status': 'error', 'stats': stats, 'error': 'StringSession файл не содержит валидных строк'}

        return {'status': 'done', 'stats': stats}

    async def _convert_tdata_dir(self, tdata_dir: Path) -> dict[str, Any]:
        client = None
        try:
            tdesk = TDesktop(str(tdata_dir))
            client = await tdesk.ToTelethon(session=None, flag=UseCurrentSession)
            await client.connect()
            if not await client.is_user_authorized():
                raise ActionRequiredError({'type': 'code', 'hint': 'TData требует повторной авторизации'})

            me = await client.get_me()
            session_string = StringSession.save(client.session)
            return {
                'phone': str(getattr(me, 'phone', '') or '').strip(),
                'session_string': session_string,
                'api_id': None,
                'api_hash': None,
                'first_name': str(getattr(me, 'first_name', '') or '').strip() or None,
                'username': str(getattr(me, 'username', '') or '').strip() or None,
                'tg_id': int(getattr(me, 'id', 0) or 0) or None,
            }
        except Exception as exc:
            message = str(exc).lower()
            if 'password' in message or '2fa' in message:
                raise ActionRequiredError({'type': '2fa', 'hint': 'Для TData нужен пароль 2FA'}) from exc
            if 'qr' in message or 'login' in message or 'authorize' in message:
                raise ActionRequiredError({'type': 'code', 'hint': 'TData требует подтверждение входа'}) from exc
            raise
        finally:
            try:
                await client.disconnect()  # type: ignore[name-defined]
            except Exception:
                pass

    async def _insert_account(self, job: dict[str, Any], payload: dict[str, Any]) -> str:
        user_id = int(job['user_id'])
        project_id = job.get('project_id')
        phone = str(payload.get('phone') or '').strip()
        session_string = str(payload.get('session_string') or '').strip()

        if not phone or not session_string:
            return 'skipped'

        count_row = await self.db.query(
            "SELECT COUNT(*) as cnt FROM tg_accounts WHERE user_id = ? AND status != 'banned'",
            [user_id],
        )
        plan_row = await self.db.query(
            'SELECT accounts_limit FROM saas_users WHERE id = ?',
            [user_id],
        )
        current_count = int((count_row[0] if count_row else {}).get('cnt', 0))
        accounts_limit = int((plan_row[0] if plan_row else {}).get('accounts_limit', 0))

        if accounts_limit > 0 and current_count >= accounts_limit:
            raise RuntimeError('Account limit reached during import')

        existing = await self.db.query(
            'SELECT id FROM tg_accounts WHERE user_id = ? AND (phone = ? OR (tg_id IS NOT NULL AND tg_id = ?)) LIMIT 1',
            [user_id, phone, payload.get('tg_id')],
        )
        if existing:
            return 'skipped'

        await self.db.execute(
            """
            INSERT INTO tg_accounts (
              user_id, phone, session_string, api_id, api_hash, first_name, username, tg_id, project_id, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
            """,
            [
                user_id,
                phone,
                session_string,
                payload.get('api_id'),
                payload.get('api_hash'),
                payload.get('first_name'),
                payload.get('username'),
                payload.get('tg_id'),
                project_id,
            ],
        )
        return 'imported'

    async def _get_job(self, job_id: int) -> dict[str, Any] | None:
        rows = await self.db.query(
            'SELECT * FROM account_import_jobs WHERE id = ? LIMIT 1',
            [job_id],
        )
        return rows[0] if rows else None

    async def _set_job_status(self, job_id: int, status: str):
        await self.db.execute(
            'UPDATE account_import_jobs SET status = ?, error = NULL WHERE id = ?',
            [status, job_id],
        )

    async def _finish_job(self, job_id: int, status: str, result: dict[str, Any]):
        await self.db.execute(
            'UPDATE account_import_jobs SET status = ?, stats_json = ?, action_json = ?, error = ? WHERE id = ?',
            [
                status,
                json.dumps(result.get('stats') or {}),
                json.dumps(result.get('action')) if result.get('action') is not None else None,
                result.get('error'),
                job_id,
            ],
        )

    async def _download_archive(self, download_url: str) -> bytes:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.get(download_url)
            response.raise_for_status()
            return response.content

    def _extract_archive(self, archive_bytes: bytes, extract_dir: Path):
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zip_file:
            zip_file.extractall(extract_dir)

    def _find_tdata_dirs(self, root: Path) -> list[Path]:
        directories: list[Path] = []
        if (root / 'tdata').is_dir():
            directories.append(root / 'tdata')

        for path in root.rglob('tdata'):
            if path.is_dir():
                directories.append(path)

        unique: list[Path] = []
        seen: set[str] = set()
        for item in directories:
            key = str(item.resolve())
            if key not in seen:
                seen.add(key)
                unique.append(item)
        return unique

    def _to_optional_int(self, value: Any) -> int | None:
        if value is None or value == '':
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _to_optional_str(self, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None


class ActionRequiredError(RuntimeError):
    def __init__(self, payload: dict[str, Any]):
        super().__init__(payload.get('hint') or 'Action required')
        self.payload = payload
