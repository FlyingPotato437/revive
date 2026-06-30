"""Classifier corpus tests — the part of Revive that compounds, so it's tested."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from revive import classify, Verdict


class TestClassifier(unittest.TestCase):
    def test_entra_dead_inactivity(self):
        r = classify({"provider": "microsoft", "error": "invalid_grant",
                      "error_codes": [700082],
                      "error_description": "AADSTS700082: expired due to inactivity"})
        self.assertEqual(r.verdict, Verdict.DEAD)
        self.assertEqual(r.code, "AADSTS700082")
        self.assertTrue(r.needs_human)

    def test_entra_dead_from_description_only(self):
        r = classify({"provider": "microsoft", "error": "invalid_grant",
                      "error_description": "AADSTS50173: credential changed"})
        self.assertEqual(r.verdict, Verdict.DEAD)
        self.assertEqual(r.code, "AADSTS50173")

    def test_access_token_expired_is_refreshable(self):
        r = classify({"provider": "microsoft", "status": 401,
                      "graph_error": {"code": "InvalidAuthenticationToken",
                                      "message": "expired"}})
        self.assertEqual(r.verdict, Verdict.REFRESHABLE)
        self.assertFalse(r.needs_human)

    def test_google_revoked_is_dead(self):
        r = classify({"provider": "google", "error": "invalid_grant",
                      "error_description": "Token has been expired or revoked."})
        self.assertEqual(r.verdict, Verdict.DEAD)

    def test_throttle_is_transient(self):
        r = classify({"provider": "microsoft", "status": 429})
        self.assertEqual(r.verdict, Verdict.TRANSIENT)
        self.assertFalse(r.needs_human)

    def test_unknown_fails_safe_to_human(self):
        r = classify({"provider": "microsoft", "error": "weird_new_error"})
        self.assertIn(r.verdict, (Verdict.UNKNOWN, Verdict.DEAD))
        self.assertTrue(r.needs_human)

    def test_invalid_grant_no_subcode_fails_safe(self):
        r = classify({"provider": "microsoft", "error": "invalid_grant"})
        self.assertEqual(r.verdict, Verdict.DEAD)
        self.assertTrue(r.needs_human)

    def test_conditional_access_signin_frequency_requires_reauth(self):
        r = classify({"provider": "microsoft", "error": "invalid_grant",
                      "error_codes": [70043]})
        self.assertEqual(r.verdict, Verdict.DEAD)
        self.assertTrue(r.needs_human)


if __name__ == "__main__":
    unittest.main()
