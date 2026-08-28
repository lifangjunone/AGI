import io
import unittest
from dataclasses import dataclass

import numpy as np
import soundfile as sf

from speech.service import (
    TtsConfig,
    TtsRequest,
    decode_audio,
    deep_merge,
    read_config,
    synthesize_wav,
)


class ConfigTests(unittest.TestCase):
    def test_deep_merge_preserves_unmodified_defaults(self):
        merged = deep_merge(
            {"service": {"port": 8790, "host": "127.0.0.1"}, "version": 1},
            {"service": {"port": 9000}},
        )
        self.assertEqual(
            merged,
            {
                "service": {"port": 9000, "host": "127.0.0.1"},
                "version": 1,
            },
        )

    def test_committed_defaults_are_immediately_valid(self):
        config = read_config()
        self.assertEqual(config.service.baseUrl, "http://127.0.0.1:8790")
        self.assertEqual(
            config.asr.modelId, "mlx-community/Qwen3-ASR-1.7B-8bit"
        )
        self.assertEqual(config.tts.americanVoice, "Aiden")
        self.assertEqual(config.tts.britishVoice, "Ryan")


class AudioTests(unittest.TestCase):
    def test_decode_audio_resamples_wav_to_16khz_mono(self):
        source = io.BytesIO()
        samples = np.sin(np.linspace(0, 20, 48_000, dtype=np.float32))
        sf.write(source, samples, 48_000, format="WAV")

        decoded = decode_audio(source.getvalue())

        self.assertEqual(decoded.dtype, np.float32)
        self.assertGreater(len(decoded), 15_000)
        self.assertLess(len(decoded), 17_000)

    def test_synthesize_wav_joins_generated_chunks(self):
        @dataclass
        class Result:
            audio: np.ndarray
            sample_rate: int = 24_000

        class FakeModel:
            def generate(self, **_kwargs):
                yield Result(np.zeros(2_400, dtype=np.float32))
                yield Result(np.zeros(2_400, dtype=np.float32))

        config = TtsConfig(
            modelId="test",
            modelPath=".models/test",
            americanVoice="Aiden",
            britishVoice="Ryan",
        )
        audio = synthesize_wav(
            FakeModel(),
            TtsRequest(text="Hello", accent="american"),
            config,
        )
        metadata = sf.info(io.BytesIO(audio))

        self.assertEqual(metadata.samplerate, 24_000)
        self.assertEqual(metadata.channels, 1)
        self.assertGreater(metadata.frames, 4_800)


if __name__ == "__main__":
    unittest.main()
