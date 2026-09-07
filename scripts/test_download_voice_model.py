"""Offline checks only; no network access or model inference."""
import hashlib
import importlib.util
import io
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("voice_download", Path(__file__).with_name("download-voice-model.py"))
download = importlib.util.module_from_spec(spec)
spec.loader.exec_module(download)


def metadata(data, lfs=True):
    return SimpleNamespace(rfilename="model.safetensors", size=len(data),
                           lfs=SimpleNamespace(sha256=hashlib.sha256(data).hexdigest()) if lfs else None,
                           blob_id=hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest())


class DownloadTests(unittest.TestCase):
    def test_upstream_hash_not_just_a_self_generated_manifest(self):
        with TemporaryDirectory() as directory:
            file = Path(directory) / "file"
            data = b"authentic checkpoint"
            file.write_bytes(data)
            for lfs in [True, False]:
                self.assertEqual(download.checked_file(file, metadata(data, lfs))["sha256"], hashlib.sha256(data).hexdigest())
            file.write_bytes(b"x" * len(data))
            self.assertIsNone(download.checked_file(file, metadata(data)))
            self.assertIsNone(download.checked_file(file, metadata(data, False)))

    def test_remote_names_cannot_escape_the_model_directory(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ["../outside", "/outside", "speech/../../outside", "..\\outside"]:
                with self.assertRaises(ValueError):
                    download.safe_path(root, name)
            self.assertEqual(download.safe_path(root, "speech_tokenizer/config.json"), root / "speech_tokenizer/config.json")

    def test_response_range_must_match_even_when_the_length_matches(self):
        def response(data, content_range):
            stream = io.BytesIO(data)
            stream.status = 206
            stream.headers = {"Content-Range": content_range}
            return stream

        with TemporaryDirectory() as directory:
            target = Path(directory) / "part"
            with patch.object(download, "urlopen", side_effect=lambda *a, **k: response(b"ABCD", "bytes 0-3/8")), patch.object(download.time, "sleep"):
                with self.assertRaises(RuntimeError):
                    download.fetch_range("https://example.invalid", target, 4, 7, 8)
            self.assertFalse(target.exists())
            with patch.object(download, "urlopen", side_effect=lambda *a, **k: response(b"EFGH", "bytes 4-7/8")):
                download.fetch_range("https://example.invalid", target, 4, 7, 8)
            self.assertEqual(target.read_bytes(), b"EFGH")

    def test_a_bad_assembly_never_replaces_an_existing_model(self):
        data = b"valid checkpoint"
        with TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / "model.safetensors"
            destination.write_bytes(b"existing model retained")

            def fetch(url, part, start, end, size):
                part.write_bytes(b"x" * (end - start + 1))

            with patch.object(download, "fetch_range", side_effect=fetch), patch.object(download, "CHUNK_BYTES", 4):
                with self.assertRaises(ValueError):
                    download.download_http(root, metadata(data), download.OFFICIAL, 2)
            self.assertEqual(destination.read_bytes(), b"existing model retained")


if __name__ == "__main__":
    unittest.main()
