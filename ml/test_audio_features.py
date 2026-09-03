import io
import unittest
import wave

import numpy as np

from audio_features import extract_mfcc


class AudioFeatureTests(unittest.TestCase):
    @staticmethod
    def sample_audio() -> bytes:
        sample_rate = 16_000
        seconds = np.arange(sample_rate, dtype=np.float32) / sample_rate
        samples = (0.25 * np.sin(2 * np.pi * 440 * seconds) * 32767).astype(np.int16)
        output = io.BytesIO()
        with wave.open(output, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(samples.tobytes())
        return output.getvalue()

    def test_extracts_fixed_finite_feature_vector(self) -> None:
        features = extract_mfcc(self.sample_audio())
        self.assertEqual(features.shape, (78,))
        self.assertTrue(np.isfinite(features).all())

    def test_uses_configured_mfcc_and_delta_dimensions(self) -> None:
        features = extract_mfcc(self.sample_audio(), {
            "mfccCount": 8,
            "includeDelta": True,
            "includeDeltaDelta": False,
        })
        self.assertEqual(features.shape, (32,))


if __name__ == "__main__":
    unittest.main()
