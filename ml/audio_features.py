from __future__ import annotations

import io

import av
import librosa
import numpy as np
from av.audio.resampler import AudioResampler

SAMPLE_RATE = 16_000
MFCC_COUNT = 13
DEFAULT_FEATURE_CONFIG = {
    "sampleRate": SAMPLE_RATE,
    "mfccCount": MFCC_COUNT,
    "nFft": 400,
    "hopLength": 160,
    "nMels": 32,
    "includeDelta": True,
    "includeDeltaDelta": True,
}


def decode_audio(audio_bytes: bytes, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Decode supported audio containers to normalized 16 kHz mono samples."""
    chunks: list[np.ndarray] = []
    with av.open(io.BytesIO(audio_bytes)) as container:
        if not container.streams.audio:
            raise ValueError("The file does not contain an audio stream.")
        stream = container.streams.audio[0]
        resampler = AudioResampler(format="fltp", layout="mono", rate=sample_rate)
        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                chunks.append(resampled.to_ndarray().reshape(-1).astype(np.float32))
    if not chunks:
        raise ValueError("The audio stream is empty.")
    return np.clip(np.concatenate(chunks), -1.0, 1.0)


def extract_mfcc(audio_bytes: bytes, feature_config: dict[str, object] | None = None) -> np.ndarray:
    """Return fixed-length MFCC, delta, and delta-delta summary features."""
    config = {**DEFAULT_FEATURE_CONFIG, **(feature_config or {})}
    sample_rate = int(config["sampleRate"])
    samples = decode_audio(audio_bytes, sample_rate)
    mfcc = librosa.feature.mfcc(
        y=samples,
        sr=sample_rate,
        n_mfcc=int(config["mfccCount"]),
        n_fft=int(config["nFft"]),
        hop_length=int(config["hopLength"]),
        n_mels=int(config["nMels"]),
    )
    matrices = [mfcc]
    if bool(config["includeDelta"]):
        matrices.append(librosa.feature.delta(mfcc))
    if bool(config["includeDeltaDelta"]):
        matrices.append(librosa.feature.delta(mfcc, order=2))
    combined = np.vstack(matrices)
    features = np.concatenate((combined.mean(axis=1), combined.std(axis=1)))
    if not np.isfinite(features).all():
        raise ValueError("Feature extraction produced invalid values.")
    return features.astype(np.float32)
