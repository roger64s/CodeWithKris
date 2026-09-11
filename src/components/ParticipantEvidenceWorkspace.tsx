import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ClipboardCheck, Plus, ShieldCheck } from "lucide-react";
import { supabase } from "../supabase";
import { APPOINTMENT_FIXING_BASELINES, APPOINTMENT_FIXING_CATALOG, APPOINTMENT_FIXING_STATES, type AppointmentCatalogEntry, type AppointmentSubTask } from "../lib/appointmentFixingCatalog";

type Script = { id: string; pathway: string; title: string; prompt: string; expected_outcome: string };
type Review = { clarity_score: number; adaptability_score: number; engagement_score: number; task_outcome: string; evidence_notes: string };
type Attempt = { id: string; response_text: string; adaptation_context: string; language: string; sub_task: string; expected_result: string; voice_quality: string; sender_lag_baseline_ms: number | null; status: string; created_at: string; participant_scripts: { title: string; pathway: string }; participant_metric_reviews: Review[] };

type Props = { isReviewer: boolean; onBack: () => void; preview?: boolean };
type Onboarding = { has_completed_onboarding: boolean; onboarding_skill_level?: string; onboarding_comprehension?: string; onboarding_clarity?: string; onboarding_pain_points?: string[]; onboarding_notes?: string };
const painPointOptions = ["Repeating myself", "Constant lip-reading", "Communication fatigue", "Finding the right words", "Keeping up in groups", "Being understood on the phone"];

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Sign in before using participant evidence.");
  const response = await fetch(`/api/v1/pilot-evidence${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Participant evidence request failed.");
  return payload as T;
}

export function ParticipantEvidenceWorkspace({ isReviewer, onBack, preview = false }: Props) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [pathway, setPathway] = useState("Appointment Fixing");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [responseText, setResponseText] = useState("");
  const [adaptationContext, setAdaptationContext] = useState("");
  const [reviewAttemptId, setReviewAttemptId] = useState<string | null>(null);
  const [review, setReview] = useState({ clarity: 3, adaptability: 3, engagement: 3, outcome: "progressing", notes: "" });
  const [notice, setNotice] = useState("Loading participant evidence...");
  const [onboarding, setOnboarding] = useState<Onboarding | null>(preview ? { has_completed_onboarding: false } : null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [survey, setSurvey] = useState({ skillLevel: "", comprehension: "", clarity: "", painPoints: [] as string[], notes: "" });
  const [language, setLanguage] = useState("English");
  const [subTask, setSubTask] = useState<AppointmentSubTask>("Greeting");
  const activeCatalogScript: AppointmentCatalogEntry = APPOINTMENT_FIXING_CATALOG.find((item: AppointmentCatalogEntry) => item.language === language && item.subTask === subTask) || APPOINTMENT_FIXING_CATALOG[0];

  const load = async () => {
    if (preview) return;
    try {
      const savedOnboarding = await request<Onboarding>("/onboarding");
      setOnboarding(savedOnboarding);
      if (!savedOnboarding.has_completed_onboarding) { setNotice("Take your time. This short check-in helps us shape a comfortable first practice."); return; }
      const [loadedScripts, loadedAttempts] = await Promise.all([request<Script[]>("/scripts"), request<Attempt[]>("/attempts")]);
      setScripts(loadedScripts); setAttempts(loadedAttempts); setNotice("Participant evidence is private until a reviewer records a rubric assessment.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Participant evidence could not be loaded."); }
  };
  useEffect(() => { void load(); }, [preview]);

  const createScript = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const script = await request<Script>("/scripts", { method: "POST", body: JSON.stringify({ pathway, title, prompt }) });
      setScripts((current) => [script, ...current]); setTitle(""); setPrompt(""); setNotice("Practice script saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Script could not be saved."); }
  };

  const submitAttempt = async (event: FormEvent) => {
    event.preventDefault();
    let script = scripts.find((item) => item.title === `${activeCatalogScript.language} ${activeCatalogScript.subTask}`);
    if (!script && preview) {
      script = { id: `preview-${activeCatalogScript.sequence}`, pathway: "Appointment Fixing", title: `${activeCatalogScript.language} ${activeCatalogScript.subTask}`, prompt: activeCatalogScript.expectedResult, expected_outcome: activeCatalogScript.receiver };
    }
    if (!script && !preview) {
      try {
        script = await request<Script>("/scripts", { method: "POST", body: JSON.stringify({ pathway: "Appointment Fixing", title: `${activeCatalogScript.language} ${activeCatalogScript.subTask}`, prompt: activeCatalogScript.expectedResult, expectedOutcome: activeCatalogScript.receiver }) });
        setScripts((current) => [script as Script, ...current]);
      } catch (error) { return setNotice(error instanceof Error ? error.message : "The appointment script could not be prepared."); }
    }
    if (!script) return setNotice("Select an appointment state before submitting evidence.");
    try {
      const metrics = language === "Tamil" ? APPOINTMENT_FIXING_BASELINES.Sri : APPOINTMENT_FIXING_BASELINES.Josy;
      const attemptPayload = { scriptId: script.id, responseText, adaptationContext, language, subTask, expectedResult: activeCatalogScript.expectedResult, voiceQuality: activeCatalogScript.voiceQuality, senderAccuracyBaseline: metrics.senderAccuracy, senderLagBaselineMs: metrics.senderLagMs, receiverAccuracyBaseline: metrics.receiverAccuracy, receiverLagBaselineMs: metrics.receiverLagMs };
      if (preview) {
        const attempt: Attempt = { id: crypto.randomUUID(), response_text: responseText, adaptation_context: adaptationContext, language, sub_task: subTask, expected_result: activeCatalogScript.expectedResult, voice_quality: activeCatalogScript.voiceQuality, sender_lag_baseline_ms: metrics.senderLagMs, status: "submitted", created_at: new Date().toISOString(), participant_scripts: { title: script.title, pathway: script.pathway }, participant_metric_reviews: [] };
        setAttempts((current) => [attempt, ...current]); setResponseText(""); setAdaptationContext(""); setNotice(`Saved ${language} ${subTask} preview attempt. Baseline sender lag: ${metrics.senderLagMs} ms.`); return;
      }
      const attempt = await request<Attempt>("/attempts", { method: "POST", body: JSON.stringify(attemptPayload) });
      setAttempts((current) => [attempt, ...current]); setResponseText(""); setAdaptationContext(""); setNotice("Attempt submitted for human review.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Attempt could not be submitted."); }
  };

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!reviewAttemptId) return;
    try {
      await request(`/attempts/${reviewAttemptId}/reviews`, { method: "POST", body: JSON.stringify(review) });
      setReviewAttemptId(null); setReview({ clarity: 3, adaptability: 3, engagement: 3, outcome: "progressing", notes: "" }); await load(); setNotice("Human rubric evidence saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Review could not be saved."); }
  };

  const submitOnboarding = async (event: FormEvent) => {
    event.preventDefault();
    if (preview) {
      setScripts([{ id: "preview-script", pathway: "Appointment Fixing", title: "English AskAvailability", prompt: APPOINTMENT_FIXING_CATALOG[1].expectedResult, expected_outcome: APPOINTMENT_FIXING_CATALOG[1].receiver }]);
      setOnboarding({ has_completed_onboarding: true, ...survey });
      setNotice("Preview ready. Your first appointment-fixing script is below.");
      return;
    }
    try {
      const saved = await request<Onboarding>("/onboarding", { method: "POST", body: JSON.stringify(survey) });
      setOnboarding({ ...onboarding, ...saved, has_completed_onboarding: true });
      setNotice("Thank you. Your private check-in is saved, and your first practice is ready.");
      const [loadedScripts, loadedAttempts] = await Promise.all([request<Script[]>("/scripts"), request<Attempt[]>("/attempts")]);
      setScripts(loadedScripts); setAttempts(loadedAttempts);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Your check-in could not be saved."); }
  };

  if (!onboarding) return <section className="page-content" style={{ maxWidth: 760, margin: "0 auto" }}><div className="dashboard-panel" role="status">{notice}</div></section>;
  if (!onboarding.has_completed_onboarding) return <OnboardingWizard step={onboardingStep} setStep={setOnboardingStep} survey={survey} setSurvey={setSurvey} onSubmit={submitOnboarding} onBack={onBack} notice={notice} />;

  return <section className="page-content" style={{ maxWidth: 1100, margin: "0 auto" }}>
    <button className="back-button" onClick={onBack}>Back to dashboard</button>
    <header className="page-intro"><span className="section-kicker">Pilot evidence</span><h1>Participant scripts and outcomes</h1><p>Record practical communication attempts, then preserve human-reviewed clarity, adaptability, engagement, and OVU evidence.</p></header>
    <div className="access-notice" role="status">{notice}</div>
    <div className="workspace-grid">
      <form className="dashboard-panel" onSubmit={createScript}><h2><Plus size={18} /> Create script</h2><label>Pathway<select value={pathway} onChange={(event) => setPathway(event.target.value)}>{["Lead Generation", "Appointment Fixing", "Follow-Up Management", "Customer Service"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label>Prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} required /></label><button className="primary-button"><Plus size={16} />Save script</button></form>
      <form className="dashboard-panel" onSubmit={submitAttempt}><h2><ClipboardCheck size={18} /> Submit attempt</h2><div className="script-switchers"><label>Language<select value={language} onChange={(event) => setLanguage(event.target.value)}>{["English", "Cantonese", "Tamil"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Sub-task<select value={subTask} onChange={(event) => setSubTask(event.target.value as AppointmentSubTask)}>{APPOINTMENT_FIXING_STATES.map((item: AppointmentSubTask, index: number) => <option key={item} value={item}>{index + 1}. {item}</option>)}</select></label></div><div className="catalog-prompt"><strong>{activeCatalogScript.language} · {activeCatalogScript.subTask}</strong><p>{activeCatalogScript.expectedResult}</p><small>Receiver block: {activeCatalogScript.responseBlock} · Voice quality: {activeCatalogScript.voiceQuality}</small></div><label>Response<textarea value={responseText} onChange={(event) => setResponseText(event.target.value)} placeholder="Type or describe the participant response" required /></label><label>Adaptation context<textarea value={adaptationContext} onChange={(event) => setAdaptationContext(event.target.value)} placeholder="Optional: language, AAC, pacing, or access support used" /></label><button className="primary-button">Submit for review</button></form>
    </div>
    <section className="dashboard-panel"><h2><ShieldCheck size={18} /> Evidence history</h2>{attempts.length === 0 ? <p className="muted-copy">No participant attempts have been submitted yet.</p> : attempts.map((attempt) => <article className="session-row" key={attempt.id}><div><strong>{attempt.participant_scripts?.title || "Participant attempt"}</strong><small>{attempt.language} · {attempt.sub_task} · {attempt.voice_quality} · {new Date(attempt.created_at).toLocaleString()} · {attempt.status}</small><p>{attempt.response_text}</p>{attempt.sender_lag_baseline_ms !== null && <small>Baseline sender lag: {attempt.sender_lag_baseline_ms} ms</small>}{attempt.participant_metric_reviews?.map((item, index) => <small key={index}>Clarity {item.clarity_score}/5 · Adaptability {item.adaptability_score}/5 · Engagement {item.engagement_score}/5 · {item.task_outcome}</small>)}</div>{isReviewer && !attempt.participant_metric_reviews?.length && <button className="secondary-button" onClick={() => setReviewAttemptId(attempt.id)}>Review</button>}</article>)}</section>
    {reviewAttemptId && <form className="dashboard-panel" onSubmit={submitReview}><h2>Human review rubric</h2><div className="review-fields">{(["clarity", "adaptability", "engagement"] as const).map((key) => <label key={key}>{key}<input type="number" min="1" max="5" value={review[key]} onChange={(event) => setReview((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div><label>Outcome<select value={review.outcome} onChange={(event) => setReview((current) => ({ ...current, outcome: event.target.value }))}><option value="incomplete">Incomplete</option><option value="progressing">Progressing</option><option value="complete">Complete</option></select></label><label>Evidence notes<textarea value={review.notes} onChange={(event) => setReview((current) => ({ ...current, notes: event.target.value }))} required /></label><button className="primary-button">Save review</button></form>}
  </section>;
}

function OnboardingWizard({ step, setStep, survey, setSurvey, onSubmit, onBack, notice }: { step: number; setStep: (step: number) => void; survey: { skillLevel: string; comprehension: string; clarity: string; painPoints: string[]; notes: string }; setSurvey: (survey: { skillLevel: string; comprehension: string; clarity: string; painPoints: string[]; notes: string }) => void; onSubmit: (event: FormEvent) => void; onBack: () => void; notice: string }) {
  const update = (key: keyof typeof survey, value: string | string[]) => setSurvey({ ...survey, [key]: value });
  const levelOptions = [{ value: "new", label: "New to this" }, { value: "building", label: "Building confidence" }, { value: "comfortable", label: "Usually comfortable" }, { value: "prefer-not-to-say", label: "Prefer not to say" }];
  return <section className="page-content" style={{ maxWidth: 760, margin: "0 auto" }}>
    <button className="back-button" onClick={onBack}>Back to dashboard</button>
    <div className="dashboard-panel onboarding-wizard" aria-labelledby="pilot-onboarding-title">
      <div className="section-kicker">Your first practice</div>
      <div className="wizard-progress" aria-label={`Onboarding step ${step + 1} of 3`}><span style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>
      {step === 0 && <div><h1 id="pilot-onboarding-title">Welcome to a supportive practice space</h1><p className="onboarding-lead">CodeWithKris is here to help you build confidence and explore everyday social communication at your own pace.</p><p>You are not being compared with anyone else. There are no pass or fail results here. Your answers stay private and help us offer a more comfortable first script.</p><button className="primary-button" onClick={() => setStep(1)}>Continue <ArrowRight size={16} /></button></div>}
      {step === 1 && <div><h1 id="pilot-onboarding-title">A quick private check-in</h1><p className="onboarding-lead">Choose what feels closest today. You can change your answers later, and every question is optional.</p><Question label="How do you feel about everyday communication right now?" value={survey.skillLevel} options={levelOptions} onChange={(value) => update("skillLevel", value)} /><Question label="How easy is it to understand what others are saying?" value={survey.comprehension} options={levelOptions} onChange={(value) => update("comprehension", value)} /><Question label="How clear do you usually feel when expressing yourself?" value={survey.clarity} options={levelOptions} onChange={(value) => update("clarity", value)} /><div className="wizard-actions"><button className="secondary-button" onClick={() => setStep(0)}>Back</button><button className="primary-button" onClick={() => setStep(2)}>Next <ArrowRight size={16} /></button></div></div>}
      {step === 2 && <form onSubmit={onSubmit}><h1 id="pilot-onboarding-title">What can make communication harder?</h1><p className="onboarding-lead">Select anything that feels familiar. This is for support planning, not judgment.</p><fieldset><legend>Optional pain points</legend>{painPointOptions.map((point) => <label className="checkbox-row" key={point}><input type="checkbox" checked={survey.painPoints.includes(point)} onChange={(event) => update("painPoints", event.target.checked ? [...survey.painPoints, point] : survey.painPoints.filter((item) => item !== point))} />{point}</label>)}</fieldset><label>Anything else you would like us to know?<textarea value={survey.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Optional" /></label><div className="wizard-actions"><button type="button" className="secondary-button" onClick={() => setStep(1)}>Back</button><button className="primary-button">Start practice <ArrowRight size={16} /></button></div></form>}
      <div className="access-notice" role="status">{notice}</div>
    </div>
  </section>;
}

function Question({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <fieldset><legend>{label}</legend><div className="wizard-options">{options.map((option) => <label className="wizard-option" key={option.value}><input type="radio" name={label} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />{option.label}</label>)}</div></fieldset>;
}
