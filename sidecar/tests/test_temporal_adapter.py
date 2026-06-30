import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from revive.adapters.temporal import ReauthorizationSignal, TemporalRecoveryClient


class FakeHandle:
    def __init__(self):
        self.calls = []

    async def signal(self, name, payload):
        self.calls.append((name, payload))


class FakeClient:
    def __init__(self):
        self.handle = FakeHandle()
        self.request = None

    def get_workflow_handle(self, workflow_id, **kwargs):
        self.request = (workflow_id, kwargs)
        return self.handle


class TestTemporalAdapter(unittest.TestCase):
    def test_signals_existing_workflow_with_opaque_connection(self):
        client = FakeClient()
        bridge = TemporalRecoveryClient(client)
        signal = ReauthorizationSignal("rcv_1", "conn_1", 2, "microsoft")
        asyncio.run(bridge.resume("workflow_1", signal, run_id="run_7"))
        self.assertEqual(client.request, ("workflow_1", {"run_id": "run_7"}))
        name, payload = client.handle.calls[0]
        self.assertEqual(name, "revive_reauthorized")
        self.assertEqual(payload["lease_generation"], 2)
        self.assertNotIn("refresh_token", payload)


if __name__ == "__main__":
    unittest.main()
