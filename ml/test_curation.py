import unittest

from ml.curation import comparison_key, krippendorff_alpha_nominal, normalize_label, normalize_transcript
from ml.workflow import evaluate_turn_taking, prediction_context


class CurationTests(unittest.TestCase):
    def test_normalizes_label_capitalization_and_spacing(self) -> None:
        self.assertEqual(normalize_label("ask availability"), "AskAvailability")
        self.assertEqual(normalize_label("CHECK-SCHEDULE"), "CheckSchedule")

    def test_normalizes_transcript_punctuation_and_whitespace(self) -> None:
        self.assertEqual(normalize_transcript("  hello   there  "), "Hello there.")

    def test_ground_truth_comparison_ignores_case_and_punctuation(self) -> None:
        self.assertEqual(comparison_key("How are you David"), comparison_key("How are you, DAVID?"))

    def test_krippendorff_alpha_is_one_for_complete_agreement(self) -> None:
        ratings = [["Greeting", "Greeting"], ["CheckSchedule", "CheckSchedule"]]
        self.assertEqual(krippendorff_alpha_nominal(ratings), 1.0)

    def test_krippendorff_alpha_drops_for_disagreement(self) -> None:
        ratings = [["Greeting", "CheckSchedule"], ["CheckSchedule", "Greeting"]]
        self.assertLess(krippendorff_alpha_nominal(ratings), 0.8)

    def test_maps_prediction_to_exact_response_block(self) -> None:
        context = prediction_context("AskAvailability", "AskAvailability")
        self.assertEqual(context["sequence"], 2)
        self.assertEqual(context["responseBlock"], "AskAvailabilityResponse")
        self.assertEqual(context["nextState"], "CheckSchedule")
        self.assertTrue(context["matchesExpectedState"])

    def test_evaluates_diarized_turn_changes(self) -> None:
        segments = [
            {"speaker": "SPEAKER_00"},
            {"speaker": "SPEAKER_00"},
            {"speaker": "SPEAKER_01"},
            {"speaker": "SPEAKER_00"},
        ]
        result = evaluate_turn_taking(segments, expected_speaker_count=2)
        self.assertTrue(result["matchesExpectedSpeakerCount"])
        self.assertEqual(result["turnCount"], 3)
        self.assertEqual(result["speakerChanges"], 2)


if __name__ == "__main__":
    unittest.main()