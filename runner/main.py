import argparse
import asyncio
import json
import logging
import traceback
from collections.abc import Awaitable, Callable
from typing import Any

from telethon.errors import SessionPasswordNeededError

from broadcasts import BroadcastProcessor
from d1_client import D1Client
from import_accounts import AccountImportProcessor
from parsing import ParsingProcessor
from proxy_checker import ProxyChecker
from warmup import WarmupEngine

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)
TASK_TIMEOUT_SECONDS = 300


async def run_campaign(campaign_id: int):
    db = D1Client()
    engine = WarmupEngine(db)

    await db.execute(
        "UPDATE campaigns SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?",
        [campaign_id],
    )

    try:
        await engine.run_campaign_day(campaign_id)
        campaign_rows = await db.query('SELECT status FROM campaigns WHERE id = ? LIMIT 1', [campaign_id])
        current_status = str(campaign_rows[0]['status']) if campaign_rows else 'error'
        if current_status == 'paused':
            return
        pending = await db.query(
            "SELECT COUNT(*) as cnt FROM campaign_accounts WHERE campaign_id = ? AND status NOT IN ('done', 'error')",
            [campaign_id],
        )
        if pending and pending[0]['cnt'] == 0:
            await db.execute(
                "UPDATE campaigns SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                [campaign_id],
            )
        else:
            await db.execute(
                "UPDATE campaigns SET status = 'idle' WHERE id = ?",
                [campaign_id],
            )
    except Exception as exc:
        logger.exception('Campaign %s failed', campaign_id)
        await db.execute(
            "UPDATE campaigns SET status = 'error', error_message = ? WHERE id = ?",
            [_summarize_exception(exc), campaign_id],
        )
        raise


async def poll_queue():
    db = D1Client()
    engine = WarmupEngine(db)
    importer = AccountImportProcessor(db)
    broadcasts = BroadcastProcessor(db)
    proxy_checker = ProxyChecker(db)
    parser = ParsingProcessor(db)

    await db.send_tokens_zero_notifications()
    await broadcasts.queue_due_followups()
    tasks = await db.query(
        "SELECT * FROM task_queue WHERE status = 'queued' ORDER BY id ASC LIMIT 10"
    )

    if not tasks:
        logger.info('Task queue is empty')
        return

    handlers: dict[str, Callable[[dict[str, Any]], Awaitable[None]]] = {
        'run_warmup_day': lambda params: engine.run_campaign_day(int(params['campaign_id'])),
        'import_accounts': lambda params: importer.run(int(params['job_id']), str(params['download_url'])),
        'send_broadcast': lambda params: broadcasts.run(int(params['broadcast_id']), int(params.get('step', 0))),
        'send_followups': lambda params: broadcasts.run_followups(int(params['broadcast_id']), int(params.get('step', 0))),
        'check_proxies': lambda params: proxy_checker.run(int(params['user_id'])),
        'run_parsing': lambda params: parser.run(int(params['job_id'])),
        'check_spambot': lambda params: db.run_spambot_check(int(params['account_id']), int(params['user_id'])),
        'validate_account_session': lambda params: db.validate_account_session(int(params['account_id']), int(params['user_id'])),
        'send_code': lambda params: db.send_telegram_code(int(params['account_id']), int(params['user_id'])),
        'confirm_code': lambda params: db.confirm_telegram_code(
            account_id=int(params['account_id']),
            user_id=int(params['user_id']),
            code=str(params['code']) if params.get('code') is not None else None,
            password=str(params['password']) if params.get('password') is not None else None,
        ),
    }

    params: dict[str, Any] = {}

    for task in tasks:
        await db.execute(
            "UPDATE task_queue SET status = 'running', started_at = CURRENT_TIMESTAMP, completed_at = NULL, error = NULL WHERE id = ?",
            [task['id']],
        )
        try:
            params = json.loads(task.get('params_json') or '{}')
            handler = handlers.get(str(task['action']))
            if not handler:
                raise RuntimeError(f"Unsupported queue action: {task['action']}")

            await asyncio.wait_for(handler(params), timeout=TASK_TIMEOUT_SECONDS)
            await db.execute(
                "UPDATE task_queue SET status = 'done', completed_at = CURRENT_TIMESTAMP, error = NULL WHERE id = ?",
                [task['id']],
            )
        except SessionPasswordNeededError:
            account_id = int(params.get('account_id') or 0)
            user_id = int(params.get('user_id') or 0)
            if account_id > 0 and user_id > 0:
                await db.mark_account_login_state(
                    account_id=account_id,
                    user_id=user_id,
                    status='password_required',
                    password_required=True,
                    error_message='Telegram требует пароль двухэтапной аутентификации',
                )
            await db.execute(
                "UPDATE task_queue SET status = 'done', completed_at = CURRENT_TIMESTAMP, error = NULL WHERE id = ?",
                [task['id']],
            )
        except Exception as exc:
            error_summary = _summarize_exception(exc)
            account_id = int(params.get('account_id') or 0)
            user_id = int(params.get('user_id') or 0)
            if str(task.get('action') or '') in {'send_code', 'confirm_code'} and account_id > 0 and user_id > 0:
                await db.mark_account_login_error(
                    account_id=account_id,
                    user_id=user_id,
                    error_message=error_summary,
                )
            await db.execute(
                "UPDATE task_queue SET status = 'error', error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                [error_summary, task['id']],
            )
            await _propagate_task_error(db, task, params if 'params' in locals() else {}, error_summary)
            logger.exception('Task %s failed', task['id'])


async def run_single_action(action: str, *, account_id: int | None, user_id: int | None):
    db = D1Client()
    try:
        if action == 'send_code':
            if not account_id or not user_id:
                raise RuntimeError('send_code requires account_id and user_id')
            await db.send_telegram_code(account_id, user_id)
            return

        if action == 'confirm_code':
            if not account_id or not user_id:
                raise RuntimeError('confirm_code requires account_id and user_id')

            state = await db.get_account_login_state(account_id, user_id)
            if not state:
                raise RuntimeError(f'Login state for account {account_id} not found')

            task_rows = await db.query(
                """
                SELECT params_json
                FROM task_queue
                WHERE status = 'queued' AND action = 'confirm_code'
                ORDER BY id DESC
                LIMIT 1
                """,
            )

            params: dict[str, Any] = {}
            for row in task_rows:
                candidate = json.loads(str(row.get('params_json') or '{}'))
                if int(candidate.get('account_id') or 0) == account_id and int(candidate.get('user_id') or 0) == user_id:
                    params = candidate
                    break

            await db.confirm_telegram_code(
                account_id=account_id,
                user_id=user_id,
                code=str(params['code']) if params.get('code') is not None else None,
                password=str(params['password']) if params.get('password') is not None else None,
            )
            return

        raise RuntimeError(f'Unsupported direct action: {action}')
    except SessionPasswordNeededError:
        if account_id and user_id:
            await db.mark_account_login_state(
                account_id=account_id,
                user_id=user_id,
                status='password_required',
                password_required=True,
                error_message='Telegram требует пароль двухэтапной аутентификации',
            )
        raise
    except Exception as exc:
        if action in {'send_code', 'confirm_code'} and account_id and user_id:
            await db.mark_account_login_error(
                account_id=account_id,
                user_id=user_id,
                error_message=_summarize_exception(exc),
            )
        raise


async def _propagate_task_error(db: D1Client, task: dict[str, Any], params: dict[str, Any], error_summary: str):
    action = str(task.get('action') or '')
    if action == 'run_warmup_day':
        campaign_id = int(params.get('campaign_id') or task.get('campaign_id') or 0)
        if campaign_id > 0:
            await db.execute(
                "UPDATE campaigns SET status = 'error', error_message = ? WHERE id = ?",
                [error_summary, campaign_id],
            )
    elif action == 'send_broadcast':
        broadcast_id = int(params.get('broadcast_id') or 0)
        if broadcast_id > 0:
            await db.execute(
                "UPDATE broadcasts SET status = 'paused', error = ? WHERE id = ?",
                [error_summary, broadcast_id],
            )
    elif action == 'send_followups':
        broadcast_id = int(params.get('broadcast_id') or 0)
        if broadcast_id > 0:
            await db.execute(
                "UPDATE broadcasts SET error = ? WHERE id = ?",
                [error_summary, broadcast_id],
            )
    elif action == 'run_parsing':
        job_id = int(params.get('job_id') or 0)
        if job_id > 0:
            await db.execute(
                "UPDATE parsing_jobs SET status = 'error', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [error_summary, job_id],
            )
    elif action == 'import_accounts':
        job_id = int(params.get('job_id') or 0)
        if job_id > 0:
            await db.execute(
                "UPDATE account_import_jobs SET status = 'error', error = ? WHERE id = ?",
                [error_summary, job_id],
            )


def _summarize_exception(exc: Exception) -> str:
    detail = ''.join(traceback.format_exception_only(type(exc), exc)).strip()
    return detail[:1000] if detail else exc.__class__.__name__


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--action', type=str)
    parser.add_argument('--campaign-id', type=int)
    parser.add_argument('--account-id', type=int)
    parser.add_argument('--user-id', type=int)
    parser.add_argument('--poll', action='store_true')
    args = parser.parse_args()

    if args.action and args.action != 'poll':
        asyncio.run(run_single_action(args.action, account_id=args.account_id, user_id=args.user_id))
    elif args.campaign_id:
        asyncio.run(run_campaign(args.campaign_id))
    elif args.poll:
        asyncio.run(poll_queue())
    else:
        print('Укажи --action=send_code|confirm_code --account-id=N --user-id=N, --campaign-id=N или --poll')


if __name__ == '__main__':
    main()
