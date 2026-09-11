import { useEffect, useState, type FormEvent } from "react";
import { ClipboardCheck, Plus, ShieldCheck } from "lucide-react";
import { supabase } from "../supabase";

type Script = { id: string; pathway: string; title: string; prompt: string; expected_outcome: string };
type Review = { clarity_score: number; adaptability_score: number; engagement_score: number; task_outcome: string; evidence_notes: string };
type Attempt = { id: string; response_text: string; adaptation_context: string; status: string; created_at: string; participant_scripts: { title: string; pathway: string }; participant_metric_reviews: Review[] };

type Props = { isReviewer: boolean; onBack: () => void };

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

export function ParticipantEvidenceWorkspace({ isReviewer, onBack }: Props) {
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

  const load = async () => {
    try {
      const [loadedScripts, loadedAttempts] = await Promise.all([request<Script[]>("/scripts"), request<Attempt[]>("/attempts")]);
      setScripts(loadedScripts); setAttempts(loadedAttempts); setNotice("Participant evidence is private until a reviewer records a rubric assessment.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Participant evidence could not be loaded."); }
  };
  useEffect(() => { void load(); }, []);

  const createScript = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const script = await request<Script>("/scripts", { method: "POST", body: JSON.stringify({ pathway, title, prompt }) });
      setScripts((current) => [script, ...current]); setTitle(""); setPrompt(""); setNotice("Practice script saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Script could not be saved."); }
  };

  const submitAttempt = async (event: FormEvent) => {
    event.preventDefault();
    if (!scripts[0]) return setNotice("Create or select a script before submitting evidence.");
    try {
      const attempt = await request<Attempt>("/attempts", { method: "POST", body: JSON.stringify({ scriptId: scripts[0].id, responseText, adaptationContext }) });
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

  return <section className="page-content" style={{ maxWidth: 1100, margin: "0 auto" }}>
    <button className="back-button" onClick={onBack}>Back to dashboard</button>
    <header className="page-intro"><span className="section-kicker">Pilot evidence</span><h1>Participant scripts and outcomes</h1><p>Record practical communication attempts, then preserve human-reviewed clarity, adaptability, engagement, and OVU evidence.</p></header>
    <div className="access-notice" role="status">{notice}</div>
    <div className="workspace-grid">
      <form className="dashboard-panel" onSubmit={createScript}><h2><Plus size={18} /> Create script</h2><label>Pathway<select value={pathway} onChange={(event) => setPathway(event.target.value)}>{["Lead Generation", "Appointment Fixing", "Follow-Up Management", "Customer Service"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label>Prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} required /></label><button className="primary-button"><Plus size={16} />Save script</button></form>
      <form className="dashboard-panel" onSubmit={submitAttempt}><h2><ClipboardCheck size={18} /> Submit attempt</h2><p className="muted-copy">{scripts[0]?.title || "Create a script first"}</p><label>Response<textarea value={responseText} onChange={(event) => setResponseText(event.target.value)} required /></label><label>Adaptation context<textarea value={adaptationContext} onChange={(event) => setAdaptationContext(event.target.value)} placeholder="Optional: language, AAC, pacing, or access support used" /></label><button className="primary-button" disabled={!scripts.length}>Submit for review</button></form>
    </div>
    <section className="dashboard-panel"><h2><ShieldCheck size={18} /> Evidence history</h2>{attempts.length === 0 ? <p className="muted-copy">No participant attempts have been submitted yet.</p> : attempts.map((attempt) => <article className="session-row" key={attempt.id}><div><strong>{attempt.participant_scripts?.title || "Participant attempt"}</strong><small>{attempt.participant_scripts?.pathway} · {new Date(attempt.created_at).toLocaleString()} · {attempt.status}</small><p>{attempt.response_text}</p>{attempt.participant_metric_reviews?.map((item, index) => <small key={index}>Clarity {item.clarity_score}/5 · Adaptability {item.adaptability_score}/5 · Engagement {item.engagement_score}/5 · {item.task_outcome}</small>)}</div>{isReviewer && !attempt.participant_metric_reviews?.length && <button className="secondary-button" onClick={() => setReviewAttemptId(attempt.id)}>Review</button>}</article>)}</section>
    {reviewAttemptId && <form className="dashboard-panel" onSubmit={submitReview}><h2>Human review rubric</h2><div className="review-fields">{(["clarity", "adaptability", "engagement"] as const).map((key) => <label key={key}>{key}<input type="number" min="1" max="5" value={review[key]} onChange={(event) => setReview((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div><label>Outcome<select value={review.outcome} onChange={(event) => setReview((current) => ({ ...current, outcome: event.target.value }))}><option value="incomplete">Incomplete</option><option value="progressing">Progressing</option><option value="complete">Complete</option></select></label><label>Evidence notes<textarea value={review.notes} onChange={(event) => setReview((current) => ({ ...current, notes: event.target.value }))} required /></label><button className="primary-button">Save review</button></form>}
  </section>;
}
