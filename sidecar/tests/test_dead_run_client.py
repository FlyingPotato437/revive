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
        if path == "/v1/action-requests":
            return 201, {"request": {"id": "uar_2", "status": "pending"}}
        if path == "/v1/action-requests/uar_2":
            return 200, {"request": {"id": "uar_2", "status": "cancelled" if method == "DELETE" else "pending"}}
        if path == "/v1/transactions":
            return 201, {"transaction": {"id": "txn_1", "state": "planned"}}
        if path.startswith("/v1/transactions/txn_1/steps/"):
            return 200, {"transaction": {"id": "txn_1", "state": "executing"}}
        if path == "/v1/transactions/txn_1/approval":
            return 200, {"transaction": {"id": "txn_1", "state": "planned"}}
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

    def test_human_action_and_outcome_contract_parity(self):
        client = FakeClient()
        action = client.request_action(
            run_id="run_1", checkpoint_id="approve", generation=3,
            idem_key="run_1:approve", action_type="approval", title="Approve refund",
            recipient={"subjectId": "finance", "email": "finance@example.com"},
        )
        self.assertEqual(action["id"], "uar_2")
        self.assertEqual(client.get_action_request("uar_2")["status"], "pending")
        self.assertEqual(client.cancel_action_request("uar_2")["status"], "cancelled")
        transaction = client.create_transaction(
            run_id="run_1", contract_key="refund-settled", idem_key="txn-key",
            steps=[{"key": "refund", "actionKey": "payments.refund", "connectionId": "conn_1"}],
        )
        self.assertEqual(transaction["id"], "txn_1")
        transitioned = client.transition_transaction_step(
            "txn_1", "refund", to="executing", expected_version=1
        )
        self.assertEqual(transitioned["state"], "executing")
        self.assertEqual(client.decide_transaction("txn_1", "approve")["state"], "planned")


class ReconcileClient(ReviveClient):
    def __init__(self):
        super().__init__("https://revivelabs.app/api", "rv_test")
        self.calls = []

    def _request(self, method, path, body=None):
        self.calls.append((method, path, body))
        if path == "/v1/actions":
            return 200, {"id": "act_1", "replayVerdict": "reconcile_first"}
        if path == "/v1/actions/act_1/reconciled":
            return 200, {"id": "act_1", "state": "reconciled"}
        return 200, {}


class TestProtectActionParity(unittest.TestCase):
    def test_uncertain_action_reconciles_without_reexecution(self):
        client = ReconcileClient()
        executed = []
        result = client.protect_action(
            run_id="run_1", connection_id="conn_1", action_key="payments.refund",
            execute=lambda: executed.append(True),
            risk_context={"operation": "money_movement", "monetary": True},
            reconcile=lambda context: {
                "committed": True, "value": {"status": "posted"},
                "remote_id": "refund_1", "note": "provider confirmed",
            },
        )
        self.assertEqual(result, {"status": "posted"})
        self.assertEqual(executed, [])
        self.assertEqual(client.calls[0][2]["riskContext"]["monetary"], True)
        self.assertEqual(client.calls[1][1], "/v1/actions/act_1/reconciled")


if __name__ == "__main__":
    unittest.main()
