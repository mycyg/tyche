"""Portable manifest/gate tests. Does not import CUDA/TTS or generate audio."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("voice_cuda", Path(__file__).with_name("render-voice-cuda.py"))
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)


class VoiceContracts(unittest.TestCase):
    def setUp(self):
        self.row = {"id": "v-valid-cue", "text": "我这边也管不过来了。", "speaker": "hero"}

    def test_copy_gate_requires_exact_revised_text(self):
        cue = json.dumps([self.row], ensure_ascii=False).encode("utf-8")
        review = {"status": "ready-for-voice", "cuesSha256": hashlib.sha256(cue).hexdigest()}
        voice.validate_copy_review(review, cue)
        for stale in (cue + b"\n", b"[]"):
            with self.assertRaises(ValueError):
                voice.validate_copy_review(review, stale)
        for missing in (None, {}, {**review, "status": "in-progress"}):
            with self.assertRaises(ValueError):
                voice.validate_copy_review(missing, cue)

    def test_actor_ids_and_fields_are_validated(self):
        voice.validate_rows([self.row])
        for fields in ({"id": "../outside"}, {"id": "C:\\x"}, {"text": " "}, {"speaker": "unknown"}, {"voice": None}, {"instruction": 1}):
            with self.assertRaises(ValueError):
                voice.validate_rows([{**self.row, **fields}])
        with self.assertRaises(ValueError):
            voice.validate_rows([self.row, self.row])

    def test_resume_checks_text_profile_voice_direction_revision_and_file(self):
        with tempfile.TemporaryDirectory(prefix="tyche-voice-test-") as directory:
            root = Path(directory)
            target = root / (self.row["id"] + ".mp3")
            target.write_bytes(b"test fixture, not generated audio")
            record = {"file": target.name, "speaker": "hero", "textSha256": voice.sha_text(self.row["text"]),
                      "profileSha256": voice.profile_hash(voice.row_profile(self.row, "revision-a")), "sha256": voice.sha_file(target)}
            self.assertTrue(voice.reusable(self.row, record, root, "revision-a"))
            for fields in ({"text": "改过的台词。"}, {"speaker": "nurse"}, {"instruction": "语气更急。"}, {"voice": "serena"}):
                self.assertFalse(voice.reusable({**self.row, **fields}, record, root, "revision-a"))
            self.assertFalse(voice.reusable(self.row, record, root, "revision-b"))
            self.assertFalse(voice.reusable(self.row, record, root, "revision-a", batch_size=1))
            self.assertFalse(voice.reusable(self.row, record, root, "revision-a", max_new_tokens=1000))
            target.write_bytes(b"replaced file")
            self.assertFalse(voice.reusable(self.row, record, root, "revision-a"))

    def test_transferred_checkpoint_is_complete_and_unchanged(self):
        with tempfile.TemporaryDirectory(prefix="tyche-model-test-") as directory:
            root = Path(directory)
            files = {}
            for name in ("config.json", "model.safetensors", "speech_tokenizer/model.safetensors"):
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b"checkpoint fixture")
                files[name] = {"bytes": target.stat().st_size, "sha256": voice.sha_file(target)}
            manifest = {"model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "revision": "0c0e3051f131929182e2c023b9537f8b1c68adfe", "files": files}
            (root / "tyche-model-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            self.assertEqual(voice.verify_model(root), manifest)
            (root / "model.safetensors").write_bytes(b"damaged transfer")
            with self.assertRaises(ValueError):
                voice.verify_model(root)


if __name__ == "__main__":
    unittest.main()
