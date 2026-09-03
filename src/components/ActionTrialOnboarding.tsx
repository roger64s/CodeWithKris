import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, Check, Headphones, Megaphone, MessageSquareMore, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { supabase } from "../supabase";

type Track = "Lead Generation" | "Appointment Fixing" | "Follow-Up Management" | "Customer Service";
type Trial = { prompt: string; starter: string; observe: string[] };
type ActionTrialOnboardingProps = { userId: string | null; onBack: () => void; onComplete: () => void };

const tracks: Array<{ track: Track; detail: string; icon: typeof Megaphone }> = [
  { track: "Lead Generation", detail: "Prospecting, qualification, data hygiene, and outreach", icon: Megaphone },
  { track: "Appointment Fixing", detail: "Calendar coordination, scheduling friction, and confirmations", icon: CalendarClock },
  { track: "Follow-Up Management", detail: "Lead nurturing, post-check-ins, and feedback collection", icon: RefreshCw },
  { track: "Customer Service", detail: "Empathy-first troubleshooting, tickets, and clear messaging", icon: Headphones },
];

const trials: Record<Track, Trial> = {
  "Lead Generation": { prompt: "A local services campaign needs ten suitable prospects, but the contact list is incomplete. Describe the first small action you would take.", starter: "Consider qualifying criteria, trustworthy sources, data hygiene, and a respectful outreach opening.", observe: ["How you define a useful prospect", "How you check and organize contact data", "How you prepare respectful outreach"] },
  "Appointment Fixing": { prompt: "A qualified prospect is interested, but two attempts to schedule a call have failed. Describe the next message and calendar action you would take.", starter: "Consider time-zone clarity, limited choices, accessibility, and confirmation details.", observe: ["How you reduce scheduling friction", "How clearly you offer options", "How you confirm the agreed next step"] },
  "Follow-Up Management": { prompt: "A prospect attended a product conversation but has not replied to the promised next steps. Describe the follow-up you would send.", starter: "Consider context, timing, a useful reminder, and one clear action.", observe: ["How you preserve relationship context", "How you make the follow-up useful", "How you record and plan the next touchpoint"] },
  "Customer Service": { prompt: "A customer reports a duplicate charge and is frustrated after waiting for a reply. Describe your first response and operational step.", starter: "Consider acknowledgement, de-escalation, verification, ownership, and a clear update time.", observe: ["How you acknowledge the customer", "How you investigate without overpromising", "How you document and communicate progress"] },
};

export function ActionTrialOnboarding({ userId, onBack, onComplete }: ActionTrialOnboardingProps) {
  const [step, setStep] = useState(0);
  const [track, setTrack] = useState<Track | null>(null);
  const [goal, setGoal] = useState("");
  const [availability, setAvailability] = useState("");
  const [passions, setPassions] = useState("");
  const [firstApproach, setFirstApproach] = useState("");
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("");
  const [assistantModelReference, setAssistantModelReference] = useState<string | null>(null);
  const [askingAssistant, setAskingAssistant] = useState(false);
  const [iteration, setIteration] = useState("");
  const [supportPreference, setSupportPreference] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setStep(0); setTrack(null); setGoal(""); setAvailability(""); setPassions(""); setFirstApproach(""); setAssistantQuestion(""); setAssistantResponse(""); setAssistantModelReference(null); setIteration(""); setSupportPreference(""); setNotice(""); };
  const currentTrial = track ? trials[track] : null;

  async function askAssistant() {
    if (!supabase || !track || !currentTrial || !firstApproach.trim() || !assistantQuestion.trim()) return;
    setAskingAssistant(true); setNotice("");
    const { data } = await supabase.auth.getSession();
    try {
      const response = await fetch("/api/action-trial-guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` },
        body: JSON.stringify({ pathway: track, scenario: currentTrial.prompt, firstApproach, learnerQuestion: assistantQuestion }),
      });
      const payload = await response.json();
      if (!response.ok) { setNotice(payload.error || "The coaching assistant could not respond."); return; }
      setAssistantResponse(payload.guidance); setAssistantModelReference(payload.modelReference || null);
    } catch {
      setNotice("The coaching assistant is temporarily unavailable. You may continue with your own reflection.");
    } finally {
      setAskingAssistant(false);
    }
  }

  async function completeTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!track || !goal.trim() || !availability.trim() || !firstApproach.trim() || !assistantQuestion.trim() || !iteration.trim()) return;
    setSaving(true); setNotice("");
    if (supabase && userId) {
      const { error } = await supabase.from("learner_action_trials").upsert({
        user_id: userId, pathway: track, goal: goal.trim(), availability: availability.trim(),
        passion_areas: passions.split(",").map((item) => item.trim()).filter(Boolean), scenario_key: track.toLowerCase(),
        first_approach: firstApproach.trim(), assistant_question: assistantQuestion.trim(),
        assistant_response: assistantResponse.trim(), assistant_model_reference: assistantModelReference,
        iteration_reflection: iteration.trim(), support_preference: supportPreference.trim(),
        status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (error) { setSaving(false); setNotice(`Trial evidence was not saved: ${error.message}`); return; }
    }
    setSaving(false); setStep(3); onComplete();
  }

  return <section className="mx-auto w-full max-w-6xl px-4 pb-28 pt-2 sm:px-7" aria-labelledby="action-trial-title">
    <button className="mb-5 inline-flex items-center gap-2 border-0 bg-transparent text-sm font-bold text-violet-700" onClick={step === 0 ? onBack : () => setStep((current) => Math.max(0, current - 1))}><ArrowLeft size={17} />{step === 0 ? "Back to dashboard" : "Previous step"}</button>
    <header className="mb-6 border-b border-slate-200 pb-5"><span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700"><Sparkles size={15} />Practical commercial task trial</span><h1 id="action-trial-title" className="mt-2 text-3xl font-bold text-slate-950">Show how you listen, act, and improve.</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Your work is not ranked. Your goals and a small real-world commercial task help a learning pod offer useful work and support.</p></header>

    {step === 0 && <form className="mx-auto grid max-w-3xl gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); setStep(1); }}><div className="sm:col-span-2"><span className="text-xs font-bold uppercase text-emerald-700">Conversational onboarding</span><h2 className="mt-1 text-xl font-bold">Shape the opportunity around you</h2><p className="mt-2 text-sm text-slate-500">Share only what helps the learning pod adapt work and support to you.</p></div><Field label="What do you want to learn or contribute?" value={goal} setValue={setGoal} /><Field label="What availability works for you?" value={availability} setValue={setAvailability} placeholder="Example: two evenings each week" /><Field label="Passion areas" value={passions} setValue={setPassions} placeholder="Community, education, local business..." /><Field label="How do you prefer to receive support?" value={supportPreference} setValue={setSupportPreference} required={false} /><button className="min-h-11 rounded-md bg-emerald-700 font-bold text-white sm:col-span-2">Choose a commercial task track</button></form>}

    {step === 1 && <div className="mx-auto max-w-3xl"><span className="text-xs font-bold uppercase text-emerald-700">Flexible specialization</span><h2 className="mb-4 mt-1 text-xl font-bold">Choose a commercial task track</h2><div className="grid gap-3 sm:grid-cols-2">{tracks.map(({ track: option, detail, icon: Icon }) => <button key={option} className="grid min-h-24 grid-cols-[44px_1fr_24px] items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-emerald-600" onClick={() => { setTrack(option); setStep(2); }}><span className="grid h-11 w-11 place-items-center rounded-md bg-emerald-50 text-emerald-700"><Icon size={21} /></span><span><strong className="block">{option}</strong><small className="text-slate-500">{detail}</small></span><ArrowRight size={18} /></button>)}</div></div>}

    {step === 2 && currentTrial && <form className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-[1.2fr_.8fr]" onSubmit={completeTrial}><div className="rounded-lg border border-slate-200 bg-white p-5"><span className="text-xs font-bold uppercase text-emerald-700">Low-stakes scenario · {track}</span><h2 className="mt-2 text-xl font-bold leading-7">{currentTrial.prompt}</h2><p className="mt-2 text-sm text-slate-500">{currentTrial.starter}</p><TextArea label="Your first approach" value={firstApproach} setValue={setFirstApproach} /><TextArea label="What would you ask the platform assistant?" value={assistantQuestion} setValue={setAssistantQuestion} placeholder="Ask for context, an example, a check, or feedback." /><button className="mt-2 min-h-10 rounded-md border border-emerald-700 px-4 text-sm font-bold text-emerald-800" type="button" disabled={!supabase || askingAssistant || !firstApproach.trim() || !assistantQuestion.trim()} onClick={() => void askAssistant()}>{askingAssistant ? "Asking assistant..." : "Ask for coaching guidance"}</button>{assistantResponse && <div className="mt-3 rounded-md border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm leading-6 text-slate-700"><strong className="block text-emerald-800">Assistant guidance</strong>{assistantResponse}</div>}<TextArea label="After reflection, what would you keep or change?" value={iteration} setValue={setIteration} /></div><aside className="rounded-lg bg-slate-950 p-5 text-white"><MessageSquareMore className="text-emerald-400" /><h2 className="mt-4 text-lg font-bold">Evidence, not a grade</h2><ul className="mt-4 space-y-3 p-0">{currentTrial.observe.map((item) => <li className="flex gap-2 text-sm text-slate-300" key={item}><Check className="shrink-0 text-emerald-400" size={16} />{item}</li>)}</ul><p className="mt-5 text-xs leading-5 text-slate-400">Your response becomes a starting artifact for mentor conversation. It does not produce a score or automatic hiring decision.</p><button className="mt-5 min-h-11 w-full rounded-md bg-emerald-600 font-bold text-white" disabled={saving}>{saving ? "Saving evidence..." : "Complete trial"}</button></aside>{notice && <p className="text-sm font-bold text-red-700 lg:col-span-2">{notice}</p>}</form>}

    {step === 3 && <div className="mx-auto max-w-3xl rounded-lg border border-emerald-300 bg-emerald-50 p-6"><Check className="text-emerald-700" size={28} /><h2 className="mt-3 text-2xl font-bold">Your starting artifact is ready</h2><p className="mt-2 text-sm leading-6 text-slate-600">A learning pod can now build on your goals, practical approach, questions, and iteration. Progress grows through mentorship, tool use, collaboration, and completed work.</p><button className="mt-5 inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-white px-4 py-2 text-sm font-bold text-emerald-800" onClick={reset}><RotateCcw size={16} />Try another commercial track</button></div>}
  </section>;
}

function Field({ label, value, setValue, placeholder, required = true }: { label: string; value: string; setValue: (value: string) => void; placeholder?: string; required?: boolean }) { return <label className="text-sm font-bold text-slate-800">{label}<input className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 font-normal" value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} required={required} /></label>; }
function TextArea({ label, value, setValue, placeholder }: { label: string; value: string; setValue: (value: string) => void; placeholder?: string }) { return <label className="mt-4 block text-sm font-bold text-slate-800">{label}<textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-300 p-3 font-normal" value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} required /></label>; }
