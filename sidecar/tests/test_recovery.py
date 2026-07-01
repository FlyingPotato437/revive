"""End-to-end recovery test — real HTTP against the mock IdP.

Asserts the engine parks on a dead refresh token and resumes the SAME run to
completion after re-consent; and that a no-sidecar baseline is abandoned.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from revive import (CheckpointStore, Engine, Provider, Step, Token, AuthError,
                    TokenError, StaleCredentialGeneration,
                    WrongRecoveryIdentity)
from revive.engine import Parked, Completed
from examples.mock_idp import IdP, make_server
from examples.nightly_briefing import build_steps, reconsent, SCOPES, FAILURE_STEP

PORT = 8760
BASE = f"http://127.0.0.1:{PORT}"


class TestRecovery(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.idp = IdP()
        cls.httpd = make_server(cls.idp, port=PORT)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def test_parks_then_resumes_to_completion(self):
        import examples.nightly_briefing as nb
        nb.BASE = BASE  # point the resource/reconsent helpers at this server
        store = CheckpointStore(":memory:")
        provider = Provider("microsoft", f"{BASE}/oauth2/token", scopes=tuple(SCOPES))
        engine = Engine(provider, store, base_url=BASE)

        dead_rt = self.idp.issue_refresh(SCOPES, dead=True)
        token = Token(self.idp.mint_access(FAILURE_STEP), dead_rt)
        steps = build_steps()

        parked = engine.run("t_run", steps, token, SCOPES)
        self.assertIsInstance(parked, Parked)
        self.assertEqual(parked.checkpoint.step_index, FAILURE_STEP)
        self.assertEqual(parked.rendezvous.kind.value, "auth")
        # progress preserved at the checkpoint
        self.assertEqual(len(parked.checkpoint.cursor["done"]), FAILURE_STEP)

        new_rt = reconsent(dead_rt)
        done = engine.resume("t_run", steps, reply={"refresh_token": new_rt})
        self.assertIsInstance(done, Completed)
        self.assertEqual(done.steps_done, 8)
        self.assertEqual(done.splices, 1)

    def test_baseline_is_abandoned(self):
        provider = Provider("microsoft", f"{BASE}/oauth2/token", scopes=tuple(SCOPES))
        dead_rt = self.idp.issue_refresh(SCOPES, dead=True)
        token = Token(self.idp.mint_access(FAILURE_STEP), dead_rt)
        # baseline: refresh fails on a dead token, no recovery path
        with self.assertRaises(TokenError):
            provider.refresh(dead_rt)

    def test_resume_survives_engine_restart_and_is_one_time(self):
        import examples.nightly_briefing as nb
        nb.BASE = BASE
        store = CheckpointStore(":memory:")
        provider = Provider("microsoft", f"{BASE}/oauth2/token", scopes=tuple(SCOPES))
        dead_rt = self.idp.issue_refresh(SCOPES, dead=True)
        token = Token(self.idp.mint_access(FAILURE_STEP), dead_rt)
        steps = build_steps()

        first_worker = Engine(provider, store, base_url=BASE)
        parked = first_worker.run("restart_run", steps, token, SCOPES)
        self.assertIsInstance(parked, Parked)
        self.assertGreaterEqual(len(parked.rendezvous.id), 40)

        # New Engine instance has no in-memory routing state. The rendezvous and
        # checkpoint are recovered entirely from SQLite.
        second_worker = Engine(provider, store, base_url=BASE)
        new_rt = reconsent(dead_rt)
        done = second_worker.resume(
            "restart_run", steps, reply={"refresh_token": new_rt}
        )
        self.assertIsInstance(done, Completed)

        with self.assertRaises(ValueError):
            second_worker.resume(
                "restart_run", steps, reply={"refresh_token": new_rt}
            )

    def test_wrong_account_reauthorization_is_rejected_before_consumption(self):
        import examples.nightly_briefing as nb
        nb.BASE = BASE
        store = CheckpointStore(":memory:")
        provider = Provider("microsoft", f"{BASE}/oauth2/token", scopes=tuple(SCOPES))
        engine = Engine(provider, store, base_url=BASE)
        dead_rt = self.idp.issue_refresh(SCOPES, dead=True)
        token = Token(
            self.idp.mint_access(FAILURE_STEP), dead_rt,
            subject="alice@company.com", tenant="company-tenant",
            lease_id="lease_identity", generation=1,
        )
        steps = build_steps()
        self.assertIsInstance(engine.run("identity_run", steps, token, SCOPES), Parked)
        new_rt = reconsent(dead_rt)

        with self.assertRaises(WrongRecoveryIdentity):
            engine.resume("identity_run", steps, reply={
                "refresh_token": new_rt,
                "provider_subject": "bob@company.com",
                "provider_tenant": "company-tenant",
            })

        done = engine.resume("identity_run", steps, reply={
            "refresh_token": new_rt,
            "provider_subject": "alice@company.com",
            "provider_tenant": "company-tenant",
        })
        self.assertIsInstance(done, Completed)
        self.assertEqual(done.state["_lease_generation"], 2)

    def test_old_worker_is_fenced_after_lease_rotation(self):
        import examples.nightly_briefing as nb
        nb.BASE = BASE
        store = CheckpointStore(":memory:")
        provider = Provider("microsoft", f"{BASE}/oauth2/token", scopes=tuple(SCOPES))
        engine = Engine(provider, store, base_url=BASE)
        dead_rt = self.idp.issue_refresh(SCOPES, dead=True)
        old_token = Token(
            self.idp.mint_access(FAILURE_STEP), dead_rt,
            subject="alice@company.com", tenant="company-tenant",
            lease_id="lease_fence", generation=1,
        )
        steps = build_steps()
        self.assertIsInstance(engine.run("fenced_run", steps, old_token, SCOPES), Parked)
        new_rt = reconsent(dead_rt)
        done = engine.resume("fenced_run", steps, reply={
            "refresh_token": new_rt,
            "provider_subject": "alice@company.com",
            "provider_tenant": "company-tenant",
        })
        self.assertIsInstance(done, Completed)

        with self.assertRaises(StaleCredentialGeneration):
            engine.run("stale_worker", [], old_token, SCOPES)


if __name__ == "__main__":
    unittest.main()
