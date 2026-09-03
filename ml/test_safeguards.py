import io
import os
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException, UploadFile

from ml.service import artifact_path, infer
from ml.train import load_dataset


class TrainingSafeguardTests(unittest.TestCase):
    def test_refuses_unconsented_manifest_before_reading_audio(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory) / "manifest.csv"
            manifest.write_text(
                "recording_id,task_id,path,label,speaker_id,consent,consent_scope,include_in_training,review_status,reviewer_1_label,reviewer_2_label,adjudication_status,normalized_transcript,language,locale,device_type,environment,noise_level,audio_quality_score,speech_clarity_score,speech_variation_tags,vad_outcome,clipping_outcome,conversation_id,turn_index,speaker_role,expected_result,response_block,receiver_dialogue,reference_alignment_status\n"
                "rec-001,appointment-fixing,missing.wav,Greeting,speaker-001,no,private_practice,yes,accepted,Greeting,Greeting,not_needed,How are you David,en,en-IN,mobile,home,quiet,4,3,extended_pauses,retained,none,conversation-001,1,caller,How are you David,GreetingResponse,I am fine Josy. How are you,reviewed\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "requires affirmative model_training consent"):
                load_dataset(manifest)


class InferenceSafeguardTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_missing_internal_key(self) -> None:
        os.environ["ML_SERVICE_API_KEY"] = "expected-key"
        audio = UploadFile(filename="sample.wav", file=io.BytesIO(b"audio"))
        with self.assertRaises(HTTPException) as context:
            await infer(audio, task_id="appointment-fixing", x_api_key="")
        self.assertEqual(context.exception.status_code, 401)

    async def test_reports_unavailable_when_model_is_absent(self) -> None:
        os.environ["ML_SERVICE_API_KEY"] = "expected-key"
        audio = UploadFile(filename="sample.wav", file=io.BytesIO(b"audio"))
        with self.assertRaises(HTTPException) as context:
            await infer(audio, task_id="appointment-fixing", x_api_key="expected-key")
        self.assertEqual(context.exception.status_code, 503)

    def test_rejects_unsafe_task_artifact_path(self) -> None:
        with self.assertRaisesRegex(ValueError, "kebab-case"):
            artifact_path("../private", "model.joblib")


if __name__ == "__main__":
    unittest.main()