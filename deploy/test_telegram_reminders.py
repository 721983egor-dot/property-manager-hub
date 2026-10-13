"""Delivery-worker tests without any Telegram calls or production data."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("poller", Path(__file__).with_name("telegram-poller.py"))
poller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(poller)

class StopWorker(Exception):
    pass

class ReminderWorkerTests(unittest.TestCase):
    def run_worker(self, send_fails=False):
        calls = []
        item = {"id": "test", "token": "lease", "chatId": 123, "text": "Reminder", "keyboard": []}
        def http(url, payload=None, **kwargs):
            calls.append((url, payload, kwargs))
            if payload.get("action") == "claim": return {"deliveries": [item]}
            if url.endswith("sendMessage"):
                if send_fails: raise TimeoutError()
                return {"ok": True}
            return {"ok": True}
        with patch.object(poller, "http_json", side_effect=http), patch.object(poller.time, "sleep", side_effect=StopWorker):
            with self.assertRaises(StopWorker): poller.reminder_worker("test-secret")
        return calls

    def test_send_then_ack_with_lease_and_no_network_retries(self):
        calls = self.run_worker()
        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[0][2]["headers"]["X-Telegram-Bot-Api-Secret-Token"], "test-secret")
        self.assertEqual(calls[1][2]["retries"], 1)
        self.assertEqual(calls[2][1], {"action": "ack", "id": "test", "token": "lease", "success": True})

    def test_failed_send_ack_schedules_retry(self):
        self.assertFalse(self.run_worker(True)[2][1]["success"])

if __name__ == "__main__": unittest.main()
