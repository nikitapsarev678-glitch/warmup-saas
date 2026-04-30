import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from d1_client import resolve_telegram_login_credentials


class ResolveTelegramLoginCredentialsTests(unittest.TestCase):
    def test_falls_back_to_public_desktop_credentials(self):
        previous_api_id = os.environ.pop('TELEGRAM_API_ID', None)
        previous_api_hash = os.environ.pop('TELEGRAM_API_HASH', None)

        try:
            api_id, api_hash = resolve_telegram_login_credentials()
        finally:
            if previous_api_id is not None:
                os.environ['TELEGRAM_API_ID'] = previous_api_id
            if previous_api_hash is not None:
                os.environ['TELEGRAM_API_HASH'] = previous_api_hash

        self.assertEqual(api_id, 611335)
        self.assertEqual(api_hash, 'd524b414d21f4d37f08684c1df41ac9c')


if __name__ == '__main__':
    unittest.main()
