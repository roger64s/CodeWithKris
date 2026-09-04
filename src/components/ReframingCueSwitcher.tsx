import { useEffect, useState } from "react";
import { ArrowRight, Check, Eye, Lightbulb, RefreshCw, Sparkles, Volume2, X } from "lucide-react";
import { supabase } from "../supabase";
import "./ReframingCueSwitcher.css";

type ReframingTrack = "universal_foundation" | "commercial_task_tracks" | "applied_ai_workflow";
type CueProgress = { practice_count: number; success_count: number; mastered: boolean };
type ReframingCue = {
  id: string;
  track: ReframingTrack;
  language_key: string;
  cue_key: string;
  anti_pattern: string;
  reframe: string;
  new_syntax: string;
  visual_cue: string;
  translation_patterns: Record<string, string>;
  xp_reward: number;
  progress: CueProgress | null;
};
type ReframingResult = { successful: boolean; xp_awarded: number; mastered: boolean };

const TRACKS: Array<{ key: ReframingTrack; label: string; detail: string }> = [
  { key: "universal_foundation", label: "Foundation", detail: "Clearer thinking patterns" },
  { key: "commercial_task_tracks", label: "Commercial", detail: "Readable client workflows" },
  { key: "applied_ai_workflow", label: "Applied AI", detail: "Visible safety boundaries" },
];
const LANGUAGE_LABELS: Record<string, string> = { python: "Python", javascript: "JavaScript", sql: "SQL" };

async function reframingApi<T>(track: ReframingTrack, path = "", options: RequestInit = {}): Promise<T> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/v1/learning/reframing/${track}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Reframing practice is unavailable.");
  return payload;
}

export function ReframingCueSwitcher({ onXpAwarded }: { onXpAwarded: () => void }) {
  const [track, setTrack] = useState<ReframingTrack>("universal_foundation");
  const [language, setLanguage] = useState("");
  const [cues, setCues] = useState<ReframingCue[]>([]);
  const [cueIndex, setCueIndex] = useState(0);
  const [showNewSound, setShowNewSound] = useState(false);
  const [result, setResult] = useState<ReframingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadCues = async (selectedTrack: ReframingTrack, selectedLanguage = language) => {
    setBusy(true);
    try {
      const suffix = selectedLanguage ? `?language=${encodeURIComponent(selectedLanguage)}` : "";
      const loaded = await reframingApi<ReframingCue[]>(selectedTrack, suffix);
      setCues(loaded);
      setTrack(selectedTrack);
      setCueIndex(0);
      setResult(null);
      setShowNewSound(false);
      setError("");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Cue cards could not be loaded."); }
    finally { setBusy(false); }
  };

  useEffect(() => { void loadCues("universal_foundation"); }, []);

  const languages = [...new Set(cues.map((cue) => cue.language_key))];
  const current = cues[cueIndex % Math.max(cues.length, 1)];
  const masteredCount = cues.filter((cue) => cue.progress?.mastered).length;

  const submitAttempt = async (selectedNewSyntax: boolean) => {
    if (!current) return;
    setBusy(true);
    try {
      const attempt = await reframingApi<ReframingResult>(track, "/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: current.language_key, cueId: current.id, selectedNewSyntax, attemptKey: crypto.randomUUID() }),
      });
      setResult(attempt);
      if (attempt.xp_awarded > 0) onXpAwarded();
    } catch (attemptError) { setError(attemptError instanceof Error ? attemptError.message : "The cue response could not be saved."); }
    finally { setBusy(false); }
  };

  const nextCue = () => {
    setCueIndex((index) => (index + 1) % cues.length);
    setShowNewSound(false);
    setResult(null);
  };

  return <section className="reframing-module" aria-labelledby="reframing-title">
    <header className="reframing-heading"><div><span><Sparkles size={15} /> Pattern reframing</span><h2 id="reframing-title">Find the new sound</h2><p>Notice the old pattern, name a clearer alternative, and practise the switch.</p></div><div className="reframing-mastery"><strong>{masteredCount}/{cues.length}</strong><small>cues mastered</small></div></header>
    <div className="reframing-controls">
      <div className="reframing-track-tabs">{TRACKS.map((item) => <button type="button" className={track === item.key ? "active" : ""} disabled={busy} onClick={() => void loadCues(item.key, language)} key={item.key}><strong>{item.label}</strong><small>{item.detail}</small></button>)}</div>
      {languages.length > 0 && <label>Language<select value={language} disabled={busy} onChange={(event) => { setLanguage(event.target.value); void loadCues(track, event.target.value); }}>{languages.map((key) => <option value={key} key={key}>{LANGUAGE_LABELS[key] || key}</option>)}</select></label>}
    </div>
    {error && <div className="reframing-error" role="alert">{error}<button type="button" onClick={() => void loadCues(track, language)}><RefreshCw size={15} /></button></div>}
    {current && <div className="reframing-card">
      <div className="reframing-card-top"><span>{LANGUAGE_LABELS[current.language_key] || current.language_key}</span><span>{current.xp_reward} XP · Cue {cueIndex + 1} of {cues.length}</span></div>
      <div className="reframing-columns">
        <article className="old-pattern"><div><X size={18} /><span>Old pattern</span></div><p>{current.anti_pattern}</p><small>Pause and notice what makes this pattern hard to follow.</small></article>
        <ArrowRight className="reframing-arrow" size={25} />
        <article className="new-pattern"><div><Lightbulb size={18} /><span>New sound</span></div><p>{current.reframe}</p><strong>{current.visual_cue}</strong></article>
      </div>
      <button type="button" className="syntax-reveal" onClick={() => setShowNewSound((visible) => !visible)}><Eye size={17} /> {showNewSound ? "Hide alternative syntax" : "Reveal alternative syntax"}</button>
      {showNewSound && <div className="new-syntax-panel"><div><code>{current.new_syntax}</code><button type="button" aria-label="Read syntax cue aloud" title="Read syntax cue aloud" onClick={() => { if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(current.visual_cue)); }}><Volume2 size={17} /></button></div><div className="reframing-translations">{Object.entries(current.translation_patterns).map(([key, value]) => <span key={key}><small>{key}</small>{value}</span>)}</div></div>}
      {!result ? <div className="reframing-actions"><button type="button" disabled={!showNewSound || busy} onClick={() => void submitAttempt(true)}><Check size={17} /> I can use the new pattern</button><button type="button" disabled={busy} onClick={() => void submitAttempt(false)}><X size={17} /> I need another cue</button></div> : <div className={`reframing-result ${result.successful ? "success" : "retry"}`}><span>{result.successful ? <Check size={20} /> : <RefreshCw size={20} />}</span><div><strong>{result.successful ? `New pattern recognised · +${result.xp_awarded} XP` : "That is useful information, not failure."}</strong><small>{result.mastered ? "Cue mastered. The alternative is becoming familiar." : result.successful ? "Try it again later to build automaticity." : "Reveal the new sound, then try the cue again."}</small></div><button type="button" onClick={nextCue}>Next cue</button></div>}
    </div>}
  </section>;
}