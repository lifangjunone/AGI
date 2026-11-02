import os
import io
import json
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest import mock

os.environ.setdefault("SECOND_ME_DB", tempfile.mktemp(suffix=".db"))
os.environ.setdefault("SECOND_ME_MAAS_TTS_KEY", "test-key")

import server
import storage


class SpeechPlanTest(unittest.TestCase):
    def test_split_uses_sentence_boundaries_and_limits_long_segments(self):
        text = "第一句话很短。第二句话也很短！" + ("很长，" * 100)
        segments = server.split_speech_text(text, max_chars=40)
        self.assertEqual(segments[0], "第一句话很短。")
        self.assertEqual(segments[1], "第二句话也很短！")
        self.assertTrue(all(0 < len(item) <= 40 for item in segments))

    def test_plan_only_allows_its_own_segments(self):
        plan = server.create_speech_plan("你好。今天一起完成什么？")
        self.assertEqual(server.speech_segment(plan["planId"], 0), ("你好。", "voice-1"))
        self.assertEqual(server.speech_segment(plan["planId"], 1), ("今天一起完成什么？", "voice-1"))
        with self.assertRaisesRegex(ValueError, "speech_segment_not_found"):
            server.speech_segment(plan["planId"], 2)
        with self.assertRaisesRegex(ValueError, "speech_plan_expired"):
            server.speech_segment("not-a-plan", 0)

    def test_plan_preserves_supported_voice_and_rejects_unknown_voice(self):
        selected = server.create_speech_plan("你好。", "voice-4")
        fallback = server.create_speech_plan("你好。", "not-a-voice")
        self.assertEqual(selected["voice"], "voice-4")
        self.assertEqual(server.speech_segment(selected["planId"], 0)[1], "voice-4")
        self.assertEqual(fallback["voice"], "voice-1")

    def test_preview_uses_fixed_copy_and_caches_each_voice(self):
        server.speech_preview_cache.clear()
        generated = (b"RIFF-test-wave", "audio/wav")
        with mock.patch.object(server, "synthesize_speech", return_value=generated) as synthesize:
            self.assertEqual(server.preview_speech("voice-0"), generated)
            self.assertEqual(server.preview_speech("voice-0"), generated)
            synthesize.assert_called_once_with(server.TTS_PREVIEW_TEXT, "voice-0")

    def test_workspace_round_trip(self):
        owner = "user:test-workspace-user"
        payload = {"avatars": [{"id": "mira", "voice": "voice-4"}], "settings": {"locale": "zh-CN"}}
        updated_at = server.store.save_workspace(owner, server.validate_workspace(payload))
        saved = server.store.workspace(owner)
        self.assertEqual(saved["payload"], payload)
        self.assertEqual(saved["updatedAt"], updated_at)

    def test_workspace_version_compare_and_swap(self):
        owner = "guest:version-test"
        first = server.store.save_workspace(owner, {"value": "first"}, "new")
        second = server.store.save_workspace(owner, {"value": "second"}, first)
        self.assertNotEqual(first, second)
        with self.assertRaisesRegex(ValueError, "workspace_version_conflict"):
            server.store.save_workspace(owner, {"value": "stale"}, first)
        self.assertEqual(server.store.workspace(owner)["payload"], {"value": "second"})
        with self.assertRaisesRegex(ValueError, "workspace_version_conflict"):
            server.store.save_workspace(owner, {"value": "stale"}, "new")

    def test_workspace_rejects_unbounded_collections(self):
        with self.assertRaisesRegex(ValueError, "invalid_workspace"):
            server.validate_workspace({"avatars": [{}] * 21})
        with self.assertRaisesRegex(ValueError, "invalid_workspace"):
            server.validate_workspace({"contentDrafts": [{}] * 101})

    def test_workspace_simultaneous_saves_have_one_winner(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "workspace.db")
            stores = [storage.Store(path), storage.Store(path)]
            owner = "guest:concurrent-test"
            version = stores[0].save_workspace(owner, {"value": "initial"}, "new")
            ready = threading.Barrier(2)

            def save(index):
                ready.wait(timeout=5)
                try:
                    return ("saved", stores[index].save_workspace(
                        owner, {"value": index}, version), index)
                except ValueError as error:
                    return ("conflict", str(error), index)

            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(save, range(2)))
            winners = [result for result in results if result[0] == "saved"]
            losers = [result for result in results if result[0] == "conflict"]
            self.assertEqual(len(winners), 1)
            self.assertEqual(len(losers), 1)
            self.assertEqual(losers[0][1], "workspace_version_conflict")
            saved = stores[0].workspace(owner)
            self.assertEqual(saved["payload"], {"value": winners[0][2]})
            self.assertEqual(saved["updatedAt"], winners[0][1])
            next_version = stores[1].save_workspace(owner, {"value": "next"}, winners[0][1])
            self.assertNotEqual(next_version, winners[0][1])

    def test_workspace_versions_advance_with_frozen_or_backward_clock(self):
        with tempfile.TemporaryDirectory() as directory:
            store = storage.Store(os.path.join(directory, "workspace.db"))
            owner = "guest:clock-test"
            instant = datetime(2026, 10, 30, tzinfo=timezone.utc)
            with mock.patch.object(storage, "utc_now", return_value=instant):
                first = store.save_workspace(owner, {"value": "first"}, "new")
                second = store.save_workspace(owner, {"value": "second"}, first)
            self.assertNotEqual(first, second)
            with mock.patch.object(storage, "utc_now", return_value=instant - timedelta(days=1)):
                third = store.save_workspace(owner, {"value": "third"}, second)
                with self.assertRaisesRegex(ValueError, "workspace_version_conflict"):
                    store.save_workspace(owner, {"value": "stale"}, first)
            self.assertGreater(datetime.fromisoformat(third), datetime.fromisoformat(second))
            self.assertEqual(store.workspace(owner)["payload"], {"value": "third"})

    def test_workspace_preserves_content_drafts(self):
        payload = {"contentDrafts": [{"id": "draft-one", "topic": "创业", "text": "编辑后的初稿"}]}
        server.store.save_workspace("guest:content-test", server.validate_workspace(payload))
        self.assertEqual(server.store.workspace("guest:content-test")["payload"], payload)

    def test_strict_identity_does_not_fall_back_on_auth_failure(self):
        request = mock.Mock(headers={"cookie": "lym_sso_session=example-session"})
        with mock.patch.object(server.urllib.request, "urlopen", side_effect=TimeoutError):
            with self.assertRaisesRegex(RuntimeError, "identity_unavailable"):
                server.current_user(request, strict=True)

    def test_confirmed_logged_out_identity_and_user_ownership(self):
        request = mock.Mock(headers={"cookie": "lym_sso_session=example-session"})
        with mock.patch.object(server.urllib.request, "urlopen",
                               return_value=io.BytesIO(json.dumps({"authenticated": False}).encode())):
            self.assertIsNone(server.current_user(request, strict=True))
        for identity in ("account-a", "account-b"):
            response = {"authenticated": True, "user": {"id": identity}}
            with mock.patch.object(server.urllib.request, "urlopen",
                                   return_value=io.BytesIO(json.dumps(response).encode())):
                user = server.current_user(request, strict=True)
                owner = server.workspace_owner({"user": user})
                server.store.save_workspace(owner, {"avatars": [{"name": identity}]})
        self.assertEqual(server.store.workspace("user:account-a")["payload"]["avatars"][0]["name"], "account-a")
        self.assertEqual(server.store.workspace("user:account-b")["payload"]["avatars"][0]["name"], "account-b")

    def test_malformed_auth_response_is_not_a_guest(self):
        request = mock.Mock(headers={"cookie": "lym_sso_session=example-session"})
        with mock.patch.object(server.urllib.request, "urlopen", return_value=io.BytesIO(b"{}")):
            with self.assertRaisesRegex(RuntimeError, "identity_unavailable"):
                server.current_user(request, strict=True)

    def test_workspace_save_rejects_changed_account(self):
        handler = mock.Mock(path="/api/workspace", headers={"x-workspace-scope": "user:old"})
        with mock.patch.object(server, "access_state", return_value={"user": {"id": "new"}}), \
             mock.patch.object(server, "read_json", return_value={"avatars": []}), \
             mock.patch.object(server.store, "save_workspace") as write:
            server.Handler.do_POST(handler)
        handler.send_json.assert_called_once_with(409, {"error": "workspace_identity_changed"})
        write.assert_not_called()

    def test_workspace_save_auth_outage_never_writes_guest(self):
        handler = mock.Mock(path="/api/workspace")
        with mock.patch.object(server, "access_state", side_effect=RuntimeError("identity_unavailable")), \
             mock.patch.object(server.store, "save_workspace") as write:
            server.Handler.do_POST(handler)
        self.assertEqual(handler.send_json.call_args.args[0], 503)
        write.assert_not_called()


if __name__ == "__main__":
    unittest.main()
