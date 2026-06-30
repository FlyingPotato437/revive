import hashlib
import hmac
import json
import os
import sys
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from revive.rendezvous import Kind, Rendezvous, webhook_channel


class Response:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class TestWebhookChannel(unittest.TestCase):
    def rendezvous(self):
        return Rendezvous("rdv_1", "run_1", Kind.AUTH, "Reconnect", "https://revive.test/r/1")

    def test_signs_timestamped_payload(self):
        with patch("urllib.request.urlopen", return_value=Response()) as send:
            webhook_channel("https://consumer.test/revive", secret="secret")(self.rendezvous())
        request = send.call_args.args[0]
        body = request.data
        event = json.loads(body)
        timestamp = request.get_header("Webhook-timestamp")
        expected = hmac.new(
            b"secret", f'{event["id"]}.{timestamp}.'.encode() + body, hashlib.sha256
        ).hexdigest()
        self.assertEqual(request.get_header("Webhook-signature"), "v1," + expected)
        self.assertEqual(request.get_header("Idempotency-key"), event["id"])

    def test_retries_transient_transport_failure(self):
        with patch("urllib.request.urlopen", side_effect=[urllib.error.URLError("down"), Response()]) as send:
            with patch("time.sleep"):
                webhook_channel("https://consumer.test/revive", secret="secret", max_attempts=3)(self.rendezvous())
        self.assertEqual(send.call_count, 2)


if __name__ == "__main__":
    unittest.main()
