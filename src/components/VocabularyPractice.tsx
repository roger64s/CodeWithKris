import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, Languages, RotateCcw, XCircle, Zap } from "lucide-react";
import { supabase } from "../supabase";
import "./VocabularyPractice.css";

type VocabularyProgress = { practice_count: number; correct_count: number; mastered: boolean };
type VocabularyTerm = {
  id: string;
  language_key: string;
  term: string;
  definition: string;
  code_snippet: string;
  translations: Record<string, string>;
  difficulty: number;
  xp_reward: number;
  progress: VocabularyProgress | null;
};
type AttemptResult = { correct: boolean; xp_awarded: number; mastered: boolean };

async function vocabularyApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/v1/learning/dictionary${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  const responseText = await response.text();
  let payload: T | { error?: string };
  try { payload = JSON.parse(responseText) as T | { error?: string }; }
  catch { throw new Error(`Vocabulary service returned HTTP ${response.status}. ${responseText.slice(0, 160)}`); }
  if (!response.ok) throw new Error((payload as { error?: string }).error || `Vocabulary service returned HTTP ${response.status}.`);
  return payload as T;
}

const languageLabel = (key: string) => ({ python: "Python", javascript: "JavaScript", sql: "SQL" })[key] || key;

function choicesFor(terms: VocabularyTerm[], currentIndex: number) {
  if (!terms.length) return [];
  const current = terms[currentIndex % terms.length];
  const alternatives = terms.filter((term) => term.id !== current.id).slice(0, 3);
  const choices = [...alternatives];
  choices.splice(currentIndex % (choices.length + 1), 0, current);
  return choices;
}

export function VocabularyPractice({ onXpAwarded }: { onXpAwarded: () => void }) {
  const [languages, setLanguages] = useState<string[]>([]);
  const [language, setLanguage] = useState("");
  const [terms, setTerms] = useState<VocabularyTerm[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedTermId, setSelectedTermId] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadTerms = async (selectedLanguage: string) => {
    setBusy(true);
    try {
      setTerms(await vocabularyApi<VocabularyTerm[]>(`/${selectedLanguage}`));
      setLanguage(selectedLanguage);
      setCurrentIndex(0);
      setSelectedTermId("");
      setResult(null);
      setError("");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Vocabulary could not be loaded."); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    void vocabularyApi<string[]>("").then((available) => {
      setLanguages(available);
      if (available[0]) return vocabularyApi<VocabularyTerm[]>(`/${available[0]}`).then((loadedTerms) => {
        setLanguage(available[0]);
        setTerms(loadedTerms);
      });
      return undefined;
    }).catch((loadError) => setError(loadError.message));
  }, []);

  const current = terms[currentIndex % Math.max(terms.length, 1)];
  const choices = choicesFor(terms, currentIndex);
  const masteredCount = terms.filter((term) => term.progress?.mastered).length;

  const submitAttempt = async () => {
    if (!current || !selectedTermId) return;
    setBusy(true);
    try {
      const attempt = await vocabularyApi<AttemptResult>(`/${language}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termId: current.id, selectedTermId, attemptKey: crypto.randomUUID() }),
      });
      setResult(attempt);
      setError("");
      if (attempt.xp_awarded > 0) onXpAwarded();
    } catch (attemptError) { setError(attemptError instanceof Error ? attemptError.message : "Your answer could not be saved."); }
    finally { setBusy(false); }
  };

  const nextTerm = () => {
    const nextIndex = (currentIndex + 1) % terms.length;
    setSelectedTermId("");
    setResult(null);
    void loadTerms(language).then(() => setCurrentIndex(nextIndex));
  };

  return <section className="vocabulary-practice" aria-labelledby="vocabulary-title">
    <header className="vocabulary-heading">
      <div><span><Languages size={15} /> Dynamic vocabulary</span><h2 id="vocabulary-title">Syntax dictionary practice</h2><p>Match a definition to its programming term, then inspect the syntax and translations.</p></div>
      <div className="vocabulary-mastery"><strong>{masteredCount}/{terms.length}</strong><span>mastered</span></div>
    </header>

    <div className="language-switcher" aria-label="Programming language">
      {languages.map((key) => <button type="button" className={language === key ? "active" : ""} disabled={busy} onClick={() => void loadTerms(key)} key={key}>{languageLabel(key)}</button>)}
    </div>
    {error && <div className="vocabulary-error" role="alert">{error}</div>}

    {current && <div className="vocabulary-practice-grid">
      <article className="vocabulary-card">
        <div className="vocabulary-card-meta"><span>{languageLabel(language)}</span><span>Level {current.difficulty} · {current.xp_reward} XP</span></div>
        <small>Which term matches this definition?</small>
        <strong>{current.definition}</strong>
        <div className="vocabulary-choices">{choices.map((choice) => <button type="button" className={selectedTermId === choice.id ? "selected" : ""} disabled={result !== null} onClick={() => setSelectedTermId(choice.id)} key={choice.id}>{choice.term}</button>)}</div>
        {!result ? <button type="button" className="vocabulary-check" disabled={!selectedTermId || busy} onClick={() => void submitAttempt()}>Check answer</button> : <div className={`vocabulary-result ${result.correct ? "correct" : "incorrect"}`}>
          {result.correct ? <CheckCircle2 size={21} /> : <XCircle size={21} />}
          <span><strong>{result.correct ? `Correct · +${result.xp_awarded} XP` : `Not quite · ${current.term}`}</strong><small>{result.mastered ? "Term mastered" : "Review the example, then try another term."}</small></span>
          <button type="button" onClick={nextTerm}>Next <RotateCcw size={15} /></button>
        </div>}
      </article>

      <aside className="syntax-preview">
        <div><BookOpen size={18} /><span><strong>{current.term}</strong><small>Syntax example</small></span></div>
        <pre><code>{current.code_snippet}</code></pre>
        <div className="translation-list">{Object.entries(current.translations).map(([key, value]) => <span key={key}><small>{key.toUpperCase()}</small><strong>{value}</strong></span>)}</div>
      </aside>
    </div>}

    <button type="button" className="dictionary-toggle" onClick={() => setDictionaryOpen((open) => !open)}><BookOpen size={17} /> {dictionaryOpen ? "Close dictionary" : `Browse ${languageLabel(language)} dictionary`} {dictionaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
    {dictionaryOpen && <div className="dictionary-drawer">{terms.map((term) => <article key={term.id}><div><strong>{term.term}</strong>{term.progress?.mastered && <span><Zap size={12} fill="currentColor" /> Mastered</span>}</div><p>{term.definition}</p><code>{term.code_snippet}</code></article>)}</div>}
  </section>;
}