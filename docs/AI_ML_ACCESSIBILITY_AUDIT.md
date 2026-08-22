# CodeWithKris AI/ML Accessibility Audit

## Audit scope

This audit covers the current React/Vite client, Express API, Supabase schema, voice recording flow, personalized dictionary, practice scoring, communication channels, and Go-To-Market Gigs learning path.

## Current state and highest-priority gap

The current production demo is a responsive web application, but it does not yet execute an MFCC -> MLP -> Softmax speech model.

- Audio is captured with `MediaRecorder` and normally uploaded as WebM. The server preserves OGG only when the browser sends OGG.
- Live transcription uses browser `SpeechRecognition` or `webkitSpeechRecognition`.
- The current accuracy score is token overlap in `src/App.tsx`, not model confidence or word error rate.
- Supabase stores dictionary words, recordings, and practice sessions. Recordings are private through the server-side service role key.
- The app has user practice and demo Admin views, but no user authentication boundary yet. Do not expose aggregate or personal data as a real multi-user feature until Supabase Auth and row-level security are enabled.

This distinction should be kept visible in product and technical documentation. It prevents a browser transcript score from being presented as a clinically or operationally validated speech-recognition result.

## Inspiration from Google Project Euphonia

Project Euphonia demonstrates the value of personalized recognition for people with non-standard speech. Its public work emphasizes open research, curated speech datasets, research partnerships, and improvements that can flow into accessibility applications such as Project Relate.

CodeWithKris should learn from that direction without becoming a smaller copy of it. Its distinct business purpose is an accessible work-readiness and communication layer:

| Project Euphonia inspiration | CodeWithKris business distinction |
| --- | --- |
| Personalized recognition for non-standard speech | Personalized recognition plus workplace communication practice |
| Research datasets and open-source tooling | Consent-based learner data, private workspaces, and employer-safe artifacts |
| Communication assistance | Communication assistance tied to briefs, client updates, QA, and delivery |
| Research and app initiatives | Structured learning path from practice to supervised micro-gigs |
| Recognition quality as a central outcome | Recognition quality plus task completion, clarity, reliability, and paid-work readiness |

The positioning should be: **CodeWithKris helps people communicate, practice real work situations, and build evidence for inclusive paid work.** It should not claim to replace speech therapy, diagnose a condition, or match Google's research scale.

### Business-use product boundary

The business version should provide three linked but separate surfaces:

1. **Learner workspace:** private dictionary, practice, corrections, channel rehearsal, and personal progress.
2. **Work simulation:** realistic briefs, clarification prompts, status updates, review cycles, and accessible submission templates.
3. **Employer/cooperative view:** aggregate program outcomes and approved work artifacts only; never expose raw recordings, private transcripts, or disability details without explicit consent.

This is the key difference from a general communication aid: CodeWithKris measures whether a user can complete an agreed communication or delivery task safely and confidently, not only whether an utterance was transcribed.

## 1. Model accuracy and latency

### Recommended production architecture

Use a two-stage inference path:

1. A low-latency on-device or edge model provides partial hypotheses while the user is speaking.
2. A server-side model performs a final pass on the completed utterance and stores an auditable result.

For a custom MFCC/MLP baseline:

- Resample audio to 16 kHz mono PCM before feature extraction.
- Use 25 ms frames with a 10 ms hop, 26-40 mel filters, and normalized MFCC features.
- Add delta and delta-delta features if the baseline needs more temporal information.
- Prefer a small temporal model or CTC model over a plain frame-wise MLP once the baseline is measured.
- Quantize an edge model to int8 and use ONNX Runtime Web or WebAssembly for predictable latency.
- Keep a rolling 1-2 second audio window for partial decoding and debounce UI updates to about 100-150 ms.
- Return `text`, `confidence`, `latencyMs`, `modelVersion`, and `isFinal` from inference. Never use confidence as a clinical correctness claim.

### Backend inference contract

```ts
export type InferenceResult = {
  text: string;
  confidence: number;
  latencyMs: number;
  modelVersion: string;
  isFinal: boolean;
};

app.post('/api/inference', upload.single('audio'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Audio file is required.' });

  const startedAt = performance.now();
  const result = await speechModel.transcribe(await decodeToPcm16k(request.file.buffer));
  response.json({
    ...result,
    latencyMs: Math.round(performance.now() - startedAt),
    modelVersion: process.env.SPEECH_MODEL_VERSION || 'baseline-1',
    isFinal: true,
  } satisfies InferenceResult);
});
```

The model adapter should be isolated behind `speechModel`. This permits a Python service, ONNX Runtime, or a managed speech provider to be evaluated without changing the React practice flow.

### Personalization-aware decoding

Use the personal dictionary as a bias list, not as a replacement for recognition. Normalize entries, store aliases and pronunciation hints, and apply them only when the acoustic confidence is close. Always offer a correction action so a user can teach the system without silently changing meaning.

```ts
function applyDictionaryBias(
  transcript: string,
  entries: Array<{ phrase: string; aliases: string[] }>,
) {
  return entries.reduce((text, entry) => {
    for (const alias of entry.aliases) {
      text = text.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), entry.phrase);
    }
    return text;
  }, transcript);
}
```

Measure before optimizing. Track p50/p95 end-to-end latency, word error rate by speaker profile, false substitutions for dictionary terms, and recognition failure rate by device/browser.

## 2. Personalized Voice Dictionary

The current add/remove word list is a useful base. Add these capabilities in priority order:

- Phrase entries, aliases, pronunciation notes, category, and preferred output spelling.
- A short record-and-label flow for each entry, with consent and delete controls.
- Practice queue: new, needs review, mastered, and due today.
- Example phrases tied to phone, shopping, meeting, and social templates.
- Search, categories, favorites, import/export, undo delete, and duplicate suggestions.
- Audio playback with a visible duration and recording date.
- Per-entry recognition history: accepted, corrected, skipped, and confidence trend.
- Accessibility: keyboard-first editing, clear focus states, `aria-live` save feedback, large touch targets, and no color-only status.

Recommended schema extension:

```sql
create table if not exists public.dictionary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phrase text not null,
  aliases text[] not null default '{}',
  category text not null default 'general',
  status text not null default 'new'
    check (status in ('new', 'learning', 'mastered')),
  pronunciation_note text,
  created_at timestamptz not null default now(),
  unique (user_id, phrase)
);
```

Before adding `user_id`, enable Supabase Auth and row-level security. The current demo tables are global and must not be treated as production user data stores.

## 3. Integration and communication channels

Do not send speech text directly from the browser to WhatsApp, email, or social platforms. Use an explicit review-and-send workflow:

1. Capture and transcribe.
2. Show the transcript and confidence state.
3. Let the user edit, select a saved phrase, or discard it.
4. Ask for confirmation before sending.
5. Record destination, timestamp, message id, and delivery status without storing unnecessary transcript content.

Use provider adapters behind a single server contract:

```ts
type OutboundMessage = {
  channel: 'email' | 'whatsapp';
  recipient: string;
  text: string;
  consentVersion: string;
};

app.post('/api/messages', requireUser, async (request, response) => {
  const message = validateOutboundMessage(request.body);
  const delivery = await channelProviders[message.channel].send(message);
  await recordDelivery({ ...message, providerMessageId: delivery.id, status: delivery.status });
  response.status(202).json(delivery);
});
```

- Email: use a transactional provider with verified domains and rate limits.
- WhatsApp: use the official WhatsApp Business Cloud API and approved templates for outbound notifications.
- Social media: begin with copy/export and deep links; add publishing APIs only after platform consent, token storage, and audit logging are designed.
- Accessibility: provide copy, download, and retry actions for every send; never make an external integration the only path to communicate.

## 4. Monetization and Go-To-Market Gigs

Turn the learning path into evidence-based work readiness rather than a generic course list:

1. **Communication foundations:** introductions, requests, confirmations, repair phrases, and turn-taking.
2. **Channel practice:** email, chat, phone, video calls, and accessibility tools.
3. **Client workflow:** clarify a brief, confirm requirements, report progress, ask for review, and close a task.
4. **Guided micro-gigs:** data cleanup, QA checklists, content tagging, accessibility review, and structured customer follow-up.
5. **Portfolio and paid handoff:** approved work samples, client rating, revision practice, and transparent payment status.

Each module should include a target behavior, a short accessible lesson, a realistic prompt, a saved artifact, and a rubric. Example rubric dimensions: understood the request, asked a clarifying question, confirmed the next step, delivered the artifact, and handled correction respectfully.

For monetization, prefer a cooperative model with transparent task rates and no pay-to-apply fees. Keep learner progress private, separate coaching feedback from employer ratings, and provide human review for high-impact decisions.

## 5. UI/UX changes for the current demo

- Label the existing score as `Practice match` until a validated model supplies confidence or WER.
- Show `Listening`, `Processing`, `Review`, and `Saved` states rather than a single live button state.
- Add a visible transcript correction action after every practice.
- Show microphone permission, browser support, and database availability as recoverable states with a retry action.
- Add a consent notice before recording and a delete action for each recording.
- Keep the User and Admin demos clearly marked as demos until authentication and tenant isolation are complete.
- Preserve the sign-in-first flow, public Volunteer Agreement, oversized controls, keyboard navigation, and readable mobile layout.

## Suggested delivery order

1. Add Supabase Auth, `user_id` ownership, and row-level security.
2. Add inference result types and an adapter endpoint while retaining browser fallback.
3. Expand dictionary entries and add correction/consent flows.
4. Add channel adapters with confirmation and audit records.
5. Build the Go-To-Market module and rubric-backed portfolio artifacts.
6. Benchmark the model against representative, consented speech samples before describing it as accurate or real-time production speech recognition.
