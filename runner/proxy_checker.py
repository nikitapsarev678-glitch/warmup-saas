import logging
import time
from typing import Any
from urllib.parse import quote

import httpx

from d1_client import D1Client

logger = logging.getLogger(__name__)

TEST_URL = 'http://example.com/'


class ProxyChecker:
    def __init__(self, db: D1Client):
        self.db = db

    async def run(self, user_id: int):
        proxies = await self.db.get_proxies_for_check(user_id)
        for proxy in proxies:
            status, latency_ms = await self._check_proxy(proxy)
            await self.db.update_proxy_check_result(
                proxy_id=int(proxy['id']),
                user_id=user_id,
                status=status,
                latency_ms=latency_ms,
            )
            logger.info(
                'Checked proxy id=%s user_id=%s host=%s port=%s status=%s latency_ms=%s',
                proxy['id'],
                user_id,
                proxy['host'],
                proxy['port'],
                status,
                latency_ms,
            )

    async def _check_proxy(self, proxy: dict[str, Any]) -> tuple[str, int | None]:
        proxy_url = build_proxy_url(proxy)
        started_at = time.perf_counter()
        try:
            async with httpx.AsyncClient(proxy=proxy_url, timeout=15, follow_redirects=True) as client:
                response = await client.get(TEST_URL)
            latency_ms = max(1, int((time.perf_counter() - started_at) * 1000))
            if response.status_code >= 500:
                return 'dead', latency_ms
            return 'active', latency_ms
        except Exception:
            return 'dead', None


def build_proxy_url(proxy: dict[str, Any]) -> str:
    scheme = str(proxy['type']).strip().lower()
    host = str(proxy['host']).strip()
    port = int(proxy['port'])
    username = proxy.get('username')
    password = proxy.get('password')

    if username:
        auth = quote(str(username), safe='')
        if password:
            auth = f"{auth}:{quote(str(password), safe='')}"
        return f'{scheme}://{auth}@{host}:{port}'

    return f'{scheme}://{host}:{port}'
