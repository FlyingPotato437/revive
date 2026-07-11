import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from revive import (ReviveClient, create_langgraph_interrupt_handler,
                    create_mcp_elicitation_handler,
                    create_temporal_failure_signal)


class FakeClient(ReviveClient):
    def __init__(self):
        super().__init__("https://revivelabs.app/api", "rv_test")
        self.calls = []

    def _request(self, method, path, body=None):
        self.calls.append((method, path, body))
        if path.endswith("/stats?days=7"):
            return 200, {"stats": {"totalRunsLost": 2}}
        if path.endswith("/revive"):
            return 201, {"deadRun": {"status": "resolution_requested"}, "request": {"id": "uar_1"}}
        return 201, {"run": {"id": "dr_1", "category": "expired_oauth"}}


class TestDeadRunClient(unittest.TestCase):
    def test_detect_stats_and_resolve_contract(self):
        client = FakeClient()
        run = client.detect_dead_run(
            run_id="run_1", checkpoint_id="oauth", generation=4,
            failure_message="invalid_grant", runtime="langgraph",
            trace={"status": 401}, input_tokens=100, output_tokens=20,
            estimated_cost_usd=.1,
        )
        self.assertEqual(run["category"], "expired_oauth")
        method, path, body = client.calls[0]
        self.assertEqual((method, path), ("POST", "/v1/dead-runs"))
        self.assertEqual(body["checkpointId"], "oauth")
        self.assertEqual(body["generation"], 4)
        self.assertTrue(body["idempotencyKey"])
        self.assertEqual(client.dead_run_stats()["totalRunsLost"], 2)
        result = client.revive_dead_run(
            "dr_1", recipient={"subjectId": "owner", "email": "owner@example.com"},
            destination_url="https://connect.example.com/qb",
        )
        self.assertEqual(result["request"]["id"], "uar_1")

    def test_runtime_adapters_set_runtime(self):
        factories = [
            (create_langgraph_interrupt_handler, "langgraph"),
            (create_temporal_failure_signal, "temporal"),
            (create_mcp_elicitation_handler, "mcp"),
        ]
        for factory, runtime in factories:
            client = FakeClient()
            factory(client)(run_id="run", failure_message="needs input")
            self.assertEqual(client.calls[0][2]["runtime"], runtime)


if __name__ == "__main__":
    unittest.main()
