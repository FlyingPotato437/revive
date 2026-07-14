from __future__ import annotations
import hashlib
import hmac
import json
import os
import sys
import tempfile
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from revive.receiver import ResumeReceiver, verify_signature

SECRET = "test-shared-secret-32-bytes-long!"


def signed_delivery(event: dict, *, secret: str = SECRET, timestamp: str | None = None):
    body = json.dumps(event, separators=(",", ":")).encode()
    ts = timestamp or str(int(time.time()))
    signed = f'{event["id"]}.{ts}.'.encode() + body
    signature = "v1," + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    headers = {"Webhook-Id": event["id"], "Webhook-Timestamp": ts,
               "Webhook-Signature": signature, "Idempotency-Key": event["id"]}
    return headers, body


def resume_event(webhook_id: str = "job_1") -> dict:
    return {"id": webhook_id, "type": "recovery.resume_requested",
            "createdAt": "2026-07-05T00:00:00Z",
            "data": {"caseId": "rcv_1", "workspaceId": "ws_1", "runId": "run_1",
                     "checkpointId": "cp_4", "connectionId": "conn_1",
                     "actionKey": "graph.files", "idempotencyKey": "idem_1",
                     "generation": 2}}


def action_event(webhook_id: str = "action_job_1") -> dict:
    return {"id": webhook_id, "type": "action_request.completed",
            "createdAt": "2026-07-05T00:00:00Z",
            "data": {"actionRequestId": "uar_1", "workspaceId": "ws_1",
                     "runId": "run_1", "checkpointId": "cp_4",
                     "actionType": "clarification", "generation": 2,
                     "response": {"billing_contact_email": "billing@example.com"}}}


class TestVerifySignature(unittest.TestCase):
    def test_round_trips_with_control_plane_format(self):
        headers, body = signed_delivery(resume_event())
        self.assertTrue(verify_signature(SECRET, headers["Webhook-Signature"],
                                         headers["Webhook-Id"], headers["Webhook-Timestamp"], body))

    def test_rejects_wrong_secret(self):
        headers, body = signed_delivery(resume_event(), secret="attacker-controlled-secret!!")
        self.assertFalse(verify_signature(SECRET, headers["Webhook-Signature"],
                                          headers["Webhook-Id"], headers["Webhook-Timestamp"], body))

    def test_rejects_stale_timestamp(self):
        stale = str(int(time.time()) - 3600)
        headers, body = signed_delivery(resume_event(), timestamp=stale)
        self.assertFalse(verify_signature(SECRET, headers["Webhook-Signature"],
                                          headers["Webhook-Id"], headers["Webhook-Timestamp"], body))

    def test_rejects_tampered_body(self):
        headers, body = signed_delivery(resume_event())
        tampered = body.replace(b"run_1", b"run_2")
        self.assertFalse(verify_signature(SECRET, headers["Webhook-Signature"],
                                          headers["Webhook-Id"], headers["Webhook-Timestamp"], tampered))


class TestResumeReceiver(unittest.TestCase):
    def test_resumes_and_acknowledges(self):
        calls = []
        receiver = ResumeReceiver(SECRET, resume=lambda data: calls.append(data) or {"steps": 8})
        status, response = receiver.handle(*signed_delivery(resume_event()))
        self.assertEqual(status, 200)
        self.assertEqual(response, {"ok": True, "resumed": True, "runId": "run_1",
                                    "checkpointId": "cp_4", "generation": 2,
                                    "steps": 8})
        self.assertEqual(calls[0]["connectionId"], "conn_1")

    def test_completed_action_resumes_and_acknowledges(self):
        calls = []
        receiver = ResumeReceiver(SECRET, resume=lambda data: calls.append(data))
        status, response = receiver.handle(*signed_delivery(action_event()))
        self.assertEqual(status, 200)
        self.assertEqual(response, {"ok": True, "resumed": True, "runId": "run_1",
                                    "checkpointId": "cp_4", "generation": 2})
        self.assertEqual(calls[0]["response"]["billing_contact_email"],
                         "billing@example.com")

    def test_unsigned_delivery_is_rejected_before_parsing(self):
        receiver = ResumeReceiver(SECRET, resume=lambda data: self.fail("must not resume"))
        status, response = receiver.handle({"Webhook-Id": "job_1", "Webhook-Timestamp":
                                            str(int(time.time())), "Webhook-Signature": "v1,deadbeef"},
                                           b'{"type":"recovery.resume_requested"}')
        self.assertEqual(status, 401)
        self.assertFalse(response["ok"])

    def test_replayed_webhook_id_resumes_once(self):
        calls = []
        receiver = ResumeReceiver(SECRET, resume=lambda data: calls.append(data))
        first = receiver.handle(*signed_delivery(resume_event()))
        second = receiver.handle(*signed_delivery(resume_event()))
        self.assertEqual(first, second)
        self.assertEqual(len(calls), 1)

    def test_receipt_survives_receiver_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt_db = os.path.join(directory, "resume-receipts.db")
            calls = []
            first = ResumeReceiver(SECRET, resume=lambda data: calls.append(data),
                                   dedupe_path=receipt_db)
            expected = first.handle(*signed_delivery(resume_event("job_restart")))
            first.close()

            second = ResumeReceiver(
                SECRET,
                resume=lambda data: self.fail("durably acknowledged event must not resume again"),
                dedupe_path=receipt_db,
            )
            replay = second.handle(*signed_delivery(resume_event("job_restart")))
            second.close()
            self.assertEqual(replay, expected)
            self.assertEqual(len(calls), 1)

    def test_simultaneous_redelivery_resumes_once(self):
        calls = []
        entered = threading.Event()

        def resume(data):
            calls.append(data)
            entered.set()
            time.sleep(0.03)

        receiver = ResumeReceiver(SECRET, resume=resume)
        delivery = signed_delivery(resume_event("job_concurrent"))
        results = []
        threads = [threading.Thread(target=lambda: results.append(receiver.handle(*delivery))) for _ in range(2)]
        for thread in threads:
            thread.start()
        self.assertTrue(entered.wait(1))
        for thread in threads:
            thread.join()
        self.assertEqual(len(calls), 1)
        self.assertEqual(results[0], results[1])

    def test_failed_resume_returns_500_and_retry_succeeds(self):
        attempts = []

        def flaky(data):
            attempts.append(data)
            if len(attempts) == 1:
                raise RuntimeError("checkpoint store briefly unavailable")

        receiver = ResumeReceiver(SECRET, resume=flaky)
        status, response = receiver.handle(*signed_delivery(resume_event()))
        self.assertEqual(status, 500)
        self.assertFalse(response["ok"])
        status, response = receiver.handle(*signed_delivery(resume_event()))
        self.assertEqual(status, 200)
        self.assertTrue(response["resumed"])
        self.assertEqual(len(attempts), 2)

    def test_test_event_acks_without_resuming(self):
        receiver = ResumeReceiver(SECRET, resume=lambda data: self.fail("must not resume"))
        event = {"id": "evt_t1", "type": "recovery.resume_test",
                 "createdAt": "2026-07-05T00:00:00Z", "data": {"workspaceId": "ws_1"}}
        status, response = receiver.handle(*signed_delivery(event))
        self.assertEqual(status, 200)
        self.assertEqual(response, {"ok": True, "test": True})


if __name__ == "__main__":
    unittest.main()
