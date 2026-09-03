# Appointment Fixing Data Curation Framework

## 1. Preserve the implemented task and model contract

The dataset has exactly four ground-truth classes: `Greeting`, `AskAvailability`, `CheckSchedule`, and `ConfirmAppointment`. Audio is decoded to 16 kHz mono, then represented by MFCC, delta, and delta-delta summary features. The baseline classifier remains a two-hidden-layer MLP with `(128, 64)` units and multiclass probabilities.

The reviewed workflow table is encoded in `ml/appointment_workflow.json` and is authoritative for sequence, Expected Results, response blocks, Receiver dialogue, and next-state links:

| Sequence | Caller state | Response block | Next state |
| --- | --- | --- | --- |
| 1 | `Greeting` | `GreetingResponse` | `AskAvailability` |
| 2 | `AskAvailability` | `AskAvailabilityResponse` | `CheckSchedule` |
| 3 | `CheckSchedule` | `CheckScheduleResponse` | `ConfirmAppointment` |
| 4 | `ConfirmAppointment` | `ConfirmAppointmentResponse` | Complete |

Only the caller's Expected Result is classifier ground truth. Receiver dialogue provides conversation context and expected turn-taking evidence; it must not be copied into the caller transcript or used as a fifth class.

Do not use model probability as a clinical score, employability grade, or automatic assignment decision. The model identifies the intended scheduling subtask only.

## 2. Recruit and collect inclusively

1. Obtain explicit recording-level consent for `model_training`; private practice remains excluded by default.
2. Assign a pseudonymous `speaker_id`. Keep names, diagnoses, contact details, and consent documents outside the training manifest.
3. Collect all four subtasks from each participating speaker where practical. Never require a participant to imitate standardized speech.
4. Offer each prompt visually and audibly, allow extra time, repetition, AAC support, and equivalent learner-authored wording.
5. Sample across languages/locales, devices, microphones, quiet and noisy environments, connection quality, variable pace, pauses, repetitions, and assistive communication.
6. Use `ml/appointment_prompts.json` to rotate scheduling, time-zone, channel, confirmation, and rescheduling scenarios.

Initial pipeline eligibility requires at least five consented speakers per class. A production benchmark should use substantially more representative speakers and publish subgroup counts.

## 3. Build ground truth with two reviewers

1. Two trained reviewers independently select one canonical class per recording.
2. Normalize labels through `ml.curation.normalize_label`; spacing, hyphens, and capitalization cannot create new classes.
3. Preserve a normalized transcript using NFKC Unicode, collapsed whitespace, initial capitalization, straight quotation marks, and terminal punctuation. Do not alter the spoken meaning. Verify reviewed Expected Results and Receiver dialogue using case- and punctuation-insensitive ordered tokens.
4. If reviewers disagree, a third expert adjudicates and records `adjudication_status=resolved` before inclusion.
5. Require nominal Krippendorff's alpha of at least `0.80` across the review batch. Investigate confusing prompts and reviewer guidance before relabeling.

## 4. Grade audio characteristics, not people

Reviewers use two independent 1–5 scales:

| Score | Audio quality | Speech clarity for this recording |
| --- | --- | --- |
| 1 | Audio cannot be inspected reliably | Intended words cannot be reviewed |
| 2 | Severe corruption or masking | Frequent uncertainty remains |
| 3 | Usable with careful review | Main intent is reviewable |
| 4 | Minor artifacts | Clear for the scheduling subtask |
| 5 | Clean capture | Fully clear for this task |

Low clarity must not be equated with low capability. Retain difficult but reviewable samples so the model learns real-world variation.

## 5. Audit VAD and clipping bias

1. Never delete or permanently trim source audio during curation.
2. Mark VAD and clipping outcomes as `retained`, `manual_review`, or `excluded`; clipping also permits `none`.
3. Route long pauses, low amplitude, repetitions, AAC output, and non-standard timing to manual review instead of automatic exclusion.
4. Generate `curation_report.json` and compare retention by locale, device, environment, noise level, and speech-variation tag.
5. Investigate any subgroup with at least five records whose retention rate differs by more than 0.20. Adjust thresholds or restore valid samples before training.

## 6. Validate the manifest

```powershell
.venv\Scripts\python -m ml.curation path\to\private-manifest.csv --report path\to\curation_report.json
```

The validator blocks missing metadata, duplicate IDs, invalid labels, unresolved reviewer disagreement, scores outside 1–5, training inclusion without consent, automatically excluded samples that lack manual review, workflow order mismatches, and caller transcripts contaminated with Receiver dialogue.

## 7. Train without speaker leakage

```powershell
.venv\Scripts\python -m ml.train path\to\private-manifest.csv
```

Training uses five-fold `StratifiedGroupKFold`; one speaker-disjoint fold is the 20% test set and the remaining folds form the 80% training set. No `speaker_id` may appear in both partitions. Save the model version, split seed, class order, feature configuration, confusion matrix, and curation report with the artifact.

## 8. Evaluate and release

Report held-out accuracy plus weighted and per-class precision, recall, F1, and support. Report exact response-block accuracy, valid adjacent transition-pair accuracy, and complete-conversation accuracy separately. A complete conversation is correct only when all four caller states are present in order and predicted correctly. Also review the confusion matrix, class counts, speaker counts, and subgroup slices. The training artifact reports p50/p95 classifier latency; separately benchmark full audio decoding, MFCC extraction, and MLP inference on target hardware. Report diarization latency and observed turn count separately.

Release only when consent provenance is auditable, alpha is at least 0.80, no unresolved retention-bias flag remains, all four classes occur in the held-out set, and a human reviewer approves the model card. Never substitute proposed figures such as 92% accuracy or 35 ms latency for measured results.

## 9. Monitor after deployment

Track abstentions, corrections, class confusion, latency, device/browser failures, and retention by approved aggregate groups. Provide consent withdrawal and recording deletion. Retrain only from a newly versioned, revalidated manifest, and compare every candidate against the current model using the same protected test policy.