import { useEffect, useRef, useState, type FormEvent } from "react";
import "./App.css";
import { supabase } from "./supabase";
import {
  type UserRole,
  BASE_USER_ROLES,
  ADMIN_ROLE_OPTION,
  USER_ROLES,
  ADMIN_EMAIL,
  getRoleGreeting,
} from "./components/UserRegistration";
import { FinancialDashboard } from "./components/FinancialDashboard";
import { OnboardingDiagnostic } from "./components/OnboardingDiagnostic";
import { CooperativeReadinessDashboard } from "./components/CooperativeReadinessDashboard";
import { PeerReviewQueue } from "./components/PeerReviewQueue";
import { GtmPilotProject } from "./components/GtmPilotProject";
import { type StakeholderCategory } from "./lib/ovuMatrix";

type Screen =
  | "register"
  | "signin"
  | "templates"
  | "record"
  | "practice"
  | "progress"
  | "dictionary"
  | "admin"
  | "financials"
  | "diagnostic"
  | "peer-review"
  | "gtm-pilot"
  | "volunteer";
type Template = { icon: string; title: string; detail: string; color: string; phase: 1 | 2 | 3 };
type PracticeSession = {
  id: string;
  template: string;
  phrase: string;
  accuracy: number;
  createdAt: string;
  transcript: string;
};
type Recording = {
  id: string;
  template: string;
  duration: number;
  createdAt: string;
  size: number;
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void)
    | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const templates: Template[] = [
  {
    icon: "01",
    title: "Phone conversations",
    detail: "Appointments, introductions, and professional calls",
    color: "coral",
    phase: 1,
  },
  {
    icon: "02",
    title: "Shopping & ordering",
    detail: "Build confidence asking for what you need",
    color: "mint",
    phase: 1,
  },
  {
    icon: "03",
    title: "Professional meetings",
    detail: "Clear workplace communication and presentations",
    color: "gold",
    phase: 1,
  },
  {
    icon: "04",
    title: "Social interactions",
    detail: "Casual conversations and everyday connection",
    color: "lilac",
    phase: 1,
  },
  {
    icon: "05",
    title: "Client briefs & requirements",
    detail: "Clarify scope, priorities, and acceptance criteria",
    color: "mint",
    phase: 2,
  },
  {
    icon: "06",
    title: "Project status updates",
    detail: "Explain progress, blockers, and next steps clearly",
    color: "gold",
    phase: 2,
  },
  {
    icon: "07",
    title: "QA handoffs",
    detail: "Report checks, findings, and fixes to a delivery team",
    color: "coral",
    phase: 2,
  },
  {
    icon: "08",
    title: "Coding & pair programming",
    detail: "Follow accessible steps, test a change, and explain the result",
    color: "lilac",
    phase: 3,
  },
];
const phases = [
  { number: 1, title: "Basic Communication", detail: "Build vocabulary and confidence for everyday conversations.", color: "mint" },
  { number: 2, title: "Go-To-Market Skills", detail: "Practice client briefs, status updates, and QA handoffs.", color: "gold" },
  { number: 3, title: "Learn Coding & Pair Programming", detail: "Use accessible task steps to make, test, and explain software changes.", color: "lilac" },
] as const;
const defaultWords = ["appointment", "conversation", "confidence"];
const phraseFor = (template: Template) =>
  template.title === "Phone conversations"
    ? "Good morning, I am calling to confirm my appointment."
    : `I feel confident practicing ${template.title.toLowerCase()}.`;
const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const { data } = await supabase?.auth.getSession() || { data: { session: null } };
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Authentication required.");
  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) throw new Error(await response.text());
  return response.status === 204 ? (undefined as T) : response.json();
};

function similarity(expected: string, actual: string) {
  const left = expected
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const right = actual
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!actual.trim()) return 0;
  const matches = right.filter((word) => left.includes(word)).length;
  return Math.min(
    100,
    Math.round((matches / Math.max(left.length, right.length)) * 100),
  );
}

function App() {
  const [screen, setScreen] = useState<Screen>("signin");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [authMode, setAuthMode] = useState<"register" | "signin">("signin");
  const [verificationSent, setVerificationSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [hasFinancialAccess, setHasFinancialAccess] = useState(false);
  const [stakeholderCategory, setStakeholderCategory] = useState<StakeholderCategory | null>(null);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);
  const [selectedPhase, setSelectedPhase] = useState<1 | 2 | 3 | null>(null);
  const [words, setWords] = useState<string[]>(defaultWords);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [peerReviewContributions, setPeerReviewContributions] = useState(0);
  const [codeQualityScore, setCodeQualityScore] = useState<number | null>(null);
  const [diagnosticCompleted, setDiagnosticCompleted] = useState(false);
  const [currentTime] = useState(() => Date.now());
  const [newWord, setNewWord] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveText, setLiveText] = useState(
    "Your words will appear here as you speak.",
  );
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "saved" | "error">("idle");
  const [isListening, setIsListening] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const uploadInput = useRef<HTMLInputElement | null>(null);

  const isEligibleForAdmin = email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
    const eligible = newEmail.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (userRole === "CodeWithKris Administrator" && !eligible) {
      setUserRole(null);
    }
  };

  const loadStakeholderAssignment = async (
    userId: string,
    appMetadataCategory?: StakeholderCategory,
  ) => {
    if (!supabase) return;
    const { data } = await supabase
      .from("user_stakeholder_assignments")
      .select("stakeholder_category")
      .eq("user_id", userId)
      .maybeSingle();
    setStakeholderCategory(
      (data?.stakeholder_category as StakeholderCategory | undefined) ||
        appMetadataCategory ||
        null,
    );
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const preview = new URLSearchParams(window.location.search).get("preview");
    if (preview === "financials") {
      setEmail(ADMIN_EMAIL);
      setFullName("Roger S.");
      setHasFinancialAccess(true);
      setStakeholderCategory("Founders & Core Operating Team");
      setUserRole("CodeWithKris Administrator");
      setRole("admin");
      setScreen("financials");
    } else if (preview === "diagnostic") {
      setFullName("Developer");
      setUserRole("Student");
      setScreen("diagnostic");
    } else if (preview === "dashboard") {
      setFullName("Developer");
      setUserRole("Student");
      setSelectedPhase(null);
      setScreen("templates");
    } else if (preview === "peer-review") {
      setFullName("Developer");
      setUserRole("Student");
      setScreen("peer-review");
    } else if (preview === "gtm-pilot") {
      setEmail("client@example.com");
      setFullName("Pilot Client");
      setUserRole("Client");
      setScreen("gtm-pilot");
    }
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(
      () => setRecordingSeconds((seconds) => seconds + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [isRecording]);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthenticatedUserId(data.session.user.id);
        const meta = data.session.user?.user_metadata;
        const appMeta = data.session.user?.app_metadata;
        if (meta?.role) setUserRole(meta.role as UserRole);
        if (meta?.full_name) setFullName(meta.full_name);
        setHasFinancialAccess(Boolean(appMeta?.financial_access || appMeta?.role === "CodeWithKris Administrator"));
        void loadStakeholderAssignment(
          data.session.user.id,
          appMeta?.stakeholder_category as StakeholderCategory | undefined,
        );
        setScreen("templates");
      }
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setAuthenticatedUserId(session.user.id);
        const meta = session.user?.user_metadata;
        const appMeta = session.user?.app_metadata;
        if (meta?.role) setUserRole(meta.role as UserRole);
        if (meta?.full_name) setFullName(meta.full_name);
        setHasFinancialAccess(Boolean(appMeta?.financial_access || appMeta?.role === "CodeWithKris Administrator"));
        void loadStakeholderAssignment(
          session.user.id,
          appMeta?.stakeholder_category as StakeholderCategory | undefined,
        );
        setScreen((current) =>
          current === "signin" || current === "register" ? "templates" : current,
        );
      } else if (event === "SIGNED_OUT") {
        setAuthenticatedUserId(null);
        setHasFinancialAccess(false);
        setStakeholderCategory(null);
        setScreen((current) => current === "volunteer" ? current : "signin");
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!authenticatedUserId) return;
    Promise.all([
      api<{ word: string }[]>("/api/dictionary"),
      api<PracticeSession[]>("/api/sessions"),
      api<Recording[]>("/api/recordings"),
    ])
      .then(([dictionary, savedSessions, savedRecordings]) => {
        setWords(
          dictionary.length
            ? dictionary.map((item) => item.word)
            : defaultWords,
        );
        setSessions(savedSessions);
        setRecordings(savedRecordings);
      })
      .catch(() =>
        setLiveText(
          "The database is not connected yet. Start the API with npm run dev:api.",
        ),
      );
  }, [authenticatedUserId]);
  useEffect(() => {
    if (!supabase || !authenticatedUserId) return;
    Promise.all([
      supabase.from("peer_review_submissions").select("id", { count: "exact", head: true }).eq("submitter_id", authenticatedUserId),
      supabase.from("peer_review_feedback").select("quality_score,peer_review_submissions!inner(submitter_id)").eq("peer_review_submissions.submitter_id", authenticatedUserId).not("quality_score", "is", null),
    ]).then(([submissionResult, scoreResult]) => {
      setPeerReviewContributions(submissionResult.count || 0);
      const scores = (scoreResult.data || []).map((item) => Number(item.quality_score)).filter(Number.isFinite);
      setCodeQualityScore(scores.length ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : null);
    });
  }, [authenticatedUserId]);

  const navigate = (next: Screen) => setScreen(next);
  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    if (!supabase) {
      setAuthError("Authentication is not configured. Add the Supabase public URL and anon key.");
      return;
    }
    setIsAuthenticating(true);
    try {
      if (authMode === "register") {
        if (!userRole) {
          setAuthError("Please select a category above first.");
          setIsAuthenticating(false);
          return;
        }
        const finalRole: UserRole =
          userRole === "CodeWithKris Administrator" && !isEligibleForAdmin
            ? "Student"
            : userRole;
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              role: finalRole,
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          setSelectedPhase(null);
          navigate("templates");
        } else {
          setVerificationSent(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setSelectedPhase(null);
        navigate("templates");
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed. Try again.");
    } finally {
      setIsAuthenticating(false);
    }
  };
  const signOut = async () => {
    await supabase?.auth.signOut({ scope: "local" });
    setSelectedPhase(null);
    setRole("user");
    setAuthMode("signin");
    setPassword("");
    setAuthError("");
    navigate("signin");
  };
  const addWord = async () => {
    const word = newWord.trim().toLowerCase();
    if (!word || words.includes(word)) return;
    try {
      await api("/api/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      });
      setWords((current) => [...current, word]);
      setNewWord("");
    } catch {
      setLiveText("That word could not be saved. Is the database API running?");
    }
  };
  const removeWord = async (word: string) => {
    const dictionary =
      await api<{ id: number; word: string }[]>("/api/dictionary");
    const item = dictionary.find((entry) => entry.word === word);
    if (item) await api(`/api/dictionary/${item.id}`, { method: "DELETE" });
    setWords((current) => current.filter((entry) => entry !== word));
  };
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setIsRecording(true);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunks.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const form = new FormData();
        form.append("audio", blob, "practice.webm");
        form.append("template", selectedTemplate.title);
        form.append("duration", String(recordingSeconds));
        try {
          const saved = await api<Recording>("/api/recordings", {
            method: "POST",
            body: form,
          });
          setRecordings((current) => [saved, ...current]);
        } catch {
          setLiveText(
            "The recording was captured but could not be saved. Is the database API running?",
          );
        }
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch {
      setLiveText(
        "Microphone access was not available. Check browser permissions and try again.",
      );
    }
  };
  const stopRecording = () => {
    mediaRecorder.current?.stop();
    mediaRecorder.current?.stream.getTracks().forEach((track) => track.stop());
    mediaRecorder.current = null;
    setIsRecording(false);
  };
  const uploadAudio = async (file?: File) => {
    if (!file) return;
    setUploadStatus("uploading");
    const form = new FormData();
    form.append("audio", file, file.name);
    form.append("template", selectedTemplate.title);
    form.append("duration", "0");
    try {
      const saved = await api<Recording>("/api/recordings", {
        method: "POST",
        body: form,
      });
      setRecordings((current) => [saved, ...current]);
      setUploadStatus("saved");
    } catch {
      setUploadStatus("error");
    }
  };
  const toggleListening = () => {
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const API =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!API) {
      setLiveText(
        "Speech-to-text is not available in this browser. Type your spoken words below to calculate a match.",
      );
      return;
    }
    if (isListening) {
      recognition.current?.stop();
      setIsListening(false);
      return;
    }
    const next = new API();
    next.continuous = true;
    next.interimResults = true;
    next.onresult = (event) =>
      setLiveText(
        Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(""),
      );
    next.onend = () => setIsListening(false);
    next.start();
    recognition.current = next;
    setIsListening(true);
  };
  const finishPractice = async () => {
    const phrase = phraseFor(selectedTemplate);
    const accuracy = similarity(phrase, liveText);
    try {
      const saved = await api<PracticeSession>("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: selectedTemplate.title,
          phrase,
          accuracy,
          transcript: liveText,
        }),
      });
      setSessions((current) => [saved, ...current]);
      setIsListening(false);
      recognition.current?.stop();
      navigate("progress");
    } catch {
      setLiveText(
        "This practice could not be saved. Is the database API running?",
      );
    }
  };
  const formatTime = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const average = sessions.length
    ? Math.round(
        sessions.reduce((total, item) => total + item.accuracy, 0) /
          sessions.length,
      )
    : 0;
  const weekSessions = sessions.filter(
    (item) => currentTime - new Date(item.createdAt).getTime() < 604800000,
  );
  const templateCounts = templates.map((template) => ({
    ...template,
    count: sessions.filter((session) => session.template === template.title)
      .length,
  }));
  const phaseTemplates = templates.filter(
    (template) => template.phase === selectedPhase,
  );
  const completedTemplateTitles = new Set(sessions.map((session) => session.template));
  const completedMissionsByPhase = phases.map((phase) =>
    templates.filter(
      (template) => template.phase === phase.number && completedTemplateTitles.has(template.title),
    ).length,
  );
  const totalMissionsByPhase = phases.map(
    (phase) => templates.filter((template) => template.phase === phase.number).length,
  );
  const switchRole = () => {
    const nextRole = role === "user" ? "admin" : "user";
    setRole(nextRole);
    navigate(nextRole === "admin" ? "admin" : "templates");
  };

  const authScreen = (
    <main className="auth-layout">
      <section className="welcome-panel">
        <span className="eyebrow">Breaking barriers - Learn to communicate without limits.</span>
        <img
          className="brand-logo"
          src="/CodewithKris_logo.png"
          alt="Kris the Jumbo logo"
        />
        <h1>Speak freely. Connect effortlessly</h1>
        <p>
          Small, supportive practice sessions for more confident conversations.
        </p>
        <div className="signal-line" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="card-heading">
          {authMode === "register" ? (
            <h2 id="auth-title" style={{ fontSize: "1.7rem", margin: "0 0 10px 0" }}>Create account</h2>
          ) : (
            <>
              <span className="section-kicker">Existing user login</span>
              <h2 id="auth-title">
                {verificationSent ? "Check your email" : "Welcome back"}
              </h2>
              <p>
                {verificationSent
                  ? "We sent a verification link to your email. Verify it before signing in."
                  : "Sign in to continue your voice training journey."}
              </p>
            </>
          )}
        </div>
        {verificationSent ? (
          <>
            <div className="verification-note">
              <strong>Email verification required</strong>
              <span>
                Your account will be ready after you click the link in your
                email.
              </span>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setVerificationSent(false);
                setAuthMode("signin");
              }}
            >
              Return to sign in <span>→</span>
            </button>
          </>
        ) : (
          <form onSubmit={authenticate}>
            {authMode === "register" && (
              userRole === null ? (
                <div className="role-selector-section">
                  <span className="role-selector-label">1. Choose your category</span>
                  <div className="role-chip-grid" role="radiogroup" aria-label="Select your role">
                    {BASE_USER_ROLES.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        role="radio"
                        aria-checked={false}
                        className="role-chip-btn"
                        onClick={() => {
                          setUserRole(r.value);
                          setAuthError("");
                        }}
                        title={r.description}
                      >
                        <span className="role-chip-icon">{r.icon}</span>
                        <span className="role-chip-title">{r.label}</span>
                      </button>
                    ))}
                    {isEligibleForAdmin && (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={false}
                        className="role-chip-btn role-chip-admin"
                        onClick={() => {
                          setUserRole(ADMIN_ROLE_OPTION.value);
                          setAuthError("");
                        }}
                        title={ADMIN_ROLE_OPTION.description}
                      >
                        <span className="role-chip-icon">{ADMIN_ROLE_OPTION.icon}</span>
                        <span className="role-chip-title">{ADMIN_ROLE_OPTION.label}</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="role-selected-banner">
                  <div className="role-selected-info">
                    <span className="role-selected-icon">
                      {USER_ROLES.find((r) => r.value === userRole)?.icon || "👤"}
                    </span>
                    <div>
                      <span className="role-selected-tag">Category</span>
                      <strong className="role-selected-name">
                        {USER_ROLES.find((r) => r.value === userRole)?.label || userRole}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="role-change-btn"
                    onClick={() => {
                      setUserRole(null);
                      setAuthError("");
                    }}
                    title="Change category"
                  >
                    Change ↻
                  </button>
                </div>
              )
            )}
            {/* Show inputs and submit button only when in signin mode OR when a role has been selected in register mode */}
            {(authMode === "signin" || userRole !== null) && (
              <>
                {authMode === "register" && (
                  <label>
                    Full name
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Enter your full name"
                      autoComplete="name"
                      required
                    />
                  </label>
                )}
                <label>
                  Email address
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => handleEmailChange(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Choose a secure password"
                    autoComplete={authMode === "register" ? "new-password" : "current-password"}
                    minLength={6}
                    required
                  />
                </label>
                {authMode === "register" && userRole === "Persons with Disabilities" && (
                  <label>
                    Speech condition <span className="optional">optional</span>
                    <select defaultValue="">
                      <option value="" disabled>
                        Select a condition
                      </option>
                      <option>Stuttering</option>
                      <option>Apraxia</option>
                      <option>Dysarthria</option>
                      <option>Prefer not to say</option>
                    </select>
                  </label>
                )}
                {authError && <p className="auth-error" role="alert">{authError}</p>}
                <button
                  className={`primary-button ${authMode === "signin" ? "compact-signin" : ""}`}
                  type="submit"
                  disabled={isAuthenticating}
                >
                  {isAuthenticating
                    ? "Please wait"
                    : authMode === "register"
                      ? `Create ${userRole} account`
                      : "Sign in"}{" "}
                  <span>→</span>
                </button>
              </>
            )}
            {authMode === "signin" && (
              <button className="text-button" type="button">Forgot password?</button>
            )}
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setAuthError("");
                setUserRole(null);
                setAuthMode(authMode === "register" ? "signin" : "register");
              }}
            >
              {authMode === "register"
                ? "Back to existing user login"
                : "New user? Create an account"}
            </button>
          </form>
        )}
        <button className="public-link" onClick={() => navigate("volunteer")}>
          Read the public Volunteer Agreement
        </button>
      </section>
    </main>
  );

  const volunteerScreen = (
    <main className="public-document">
      <header className="document-header">
        <button className="brand-button" onClick={() => navigate("signin")}>
          <img
            className="small-logo"
            src="/CodewithKris_logo.png"
            alt="CodeWithKris"
          />
          <span>CodeWithKris</span>
        </button>
        <button className="back-button" onClick={() => navigate("signin")}>
          ← Back to sign in
        </button>
      </header>
      <article className="document-card">
        <span className="section-kicker">Public document</span>
        <h1>Volunteer Agreement</h1>
        <p className="document-lead">
          Thank you for supporting CodeWithKris and the people who use it to
          build confidence in everyday communication.
        </p>
        <div className="document-columns">
          <div>
            <h2>Our shared purpose</h2>
            <p>
              Volunteers help us improve accessible practice materials, test clear
              communication journeys, and make every person feel heard.
            </p>
            <h2>What volunteers agree to</h2>
            <ul>
              <li>Treat every participant with dignity, patience, and respect.</li>
              <li>Keep personal information, recordings, and conversations private.</li>
              <li>Give honest, constructive feedback about accessibility and ease of use.</li>
              <li>Use CodeWithKris only for supportive, non-clinical practice.</li>
            </ul>
          </div>
          <div>
            <h2>Privacy and boundaries</h2>
            <p>
              Voice recordings and practice data belong to the participant. Do not
              copy, download, share, or discuss them outside the approved
              CodeWithKris process.
            </p>
            <h2>Agreement</h2>
            <p>
              By joining as a volunteer, you confirm that you understand these
              expectations and will contact the CodeWithKris team if you have a
              concern.
            </p>
            <button className="primary-button" onClick={() => navigate("signin")}>
              Return to CodeWithKris <span>→</span>
            </button>
          </div>
        </div>
      </article>
    </main>
  );

  const appScreen = (
    <main className={`app-shell ${screen}-shell`}>
      <header className="app-header">
        <button className="brand-button" onClick={() => navigate("templates")}>
          <img
            className="small-logo"
            src="/CodewithKris_logo.png"
            alt="CodeWithKris"
          />
          <span>CodeWithKris</span>
        </button>
        <div className="header-actions">
          <span className="streak">
            <span aria-hidden="true">✦</span>{" "}
            {sessions.length
              ? `${weekSessions.length} this week`
              : "Start practicing"}
          </span>
          <button className="signout-button" onClick={signOut}>Sign out</button>
          <button className="avatar" aria-label="Open profile">
            KR
          </button>
        </div>
      </header>
      <div className={`content-wrap ${screen}-wrap`}>
        {screen === "templates" && (
          <section className="workspace-layout">
            <aside className="phase-sidebar" aria-label="Learning phases">
              <span className="section-kicker">Your pathway</span>
              <h2>Three phases</h2>
              <nav>
                <button
                  className={`phase-nav-item ${selectedPhase === null ? "active" : ""}`}
                  onClick={() => setSelectedPhase(null)}
                  aria-current={selectedPhase === null ? "page" : undefined}
                >
                  <span className="phase-nav-number dashboard-icon">⌂</span>
                  <span>
                    <strong>Dashboard</strong>
                    <small>Your progress and learning pathway</small>
                  </span>
                </button>
                {phases.map((phase) => (
                  <button
                    className={`phase-nav-item ${selectedPhase === phase.number ? "active" : ""}`}
                    key={phase.number}
                    onClick={() => setSelectedPhase(phase.number)}
                    aria-current={selectedPhase === phase.number ? "step" : undefined}
                  >
                    <span className={`phase-nav-number ${phase.color}`}>{phase.number}</span>
                    <span>
                      <strong>{phase.title}</strong>
                      <small>{phase.detail}</small>
                    </span>
                  </button>
                ))}
              </nav>
            </aside>
            <div className="page-content phase-content">
              {selectedPhase === null ? (
                <section className="dashboard-panel">
                  <CooperativeReadinessDashboard
                    headline={getRoleGreeting(userRole || "Student", fullName).headline}
                    message={getRoleGreeting(userRole || "Student", fullName).message}
                    phases={phases}
                    completedMissions={completedMissionsByPhase}
                    totalMissions={totalMissionsByPhase}
                    peerReviewContributions={peerReviewContributions}
                    codeQualityScore={codeQualityScore}
                    diagnosticCompleted={diagnosticCompleted}
                    onSelectPhase={setSelectedPhase}
                    onStartDiagnostic={() => navigate("diagnostic")}
                    onOpenPeerReviews={() => navigate("peer-review")}
                  />
                </section>
              ) : (
                <>
                  <div className="page-intro">
                    <span className="section-kicker">Communication to work readiness</span>
                    <h1>{phases[selectedPhase - 1].title}</h1>
                    <p>{phases[selectedPhase - 1].detail} Choose a mission below to continue at your own pace.</p>
                  </div>
                  <div className="template-grid">
                    {phaseTemplates.map((template) => (
                      <button
                        key={template.title}
                        className={`template-item ${selectedTemplate.title === template.title ? "selected" : ""}`}
                        onClick={() => {
                          setSelectedTemplate(template);
                          navigate("record");
                        }}
                      >
                        <span className={`template-icon ${template.color}`}>
                          {template.icon}
                        </span>
                        <span>
                          <strong>{template.title}</strong>
                          <small>{template.detail}</small>
                        </span>
                        <span className="item-arrow">↗</span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="outline-wide"
                    onClick={() => navigate("dictionary")}
                  >
                    My word dictionary <span>{words.length} words&nbsp; ＋</span>
                  </button>
                </>
              )}
            </div>
          </section>
        )}
        {screen === "dictionary" && (
          <section className="page-content">
            <button
              className="back-button"
              onClick={() => navigate("templates")}
            >
              ← Practice templates
            </button>
            <div className="page-intro">
              <span className="section-kicker">Personal vocabulary</span>
              <h1>Words that matter to you.</h1>
              <p>Add words you want to hear and practice more often.</p>
            </div>
            <div className="add-word">
              <input
                value={newWord}
                onChange={(event) => setNewWord(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addWord();
                }}
                placeholder="Add a word or phrase"
                aria-label="New word or phrase"
              />
              <button className="primary-button" onClick={addWord}>
                Add word <span>＋</span>
              </button>
            </div>
            <div className="word-list">
              {words.map((word) => (
                <div className="word-chip" key={word}>
                  <span>{word}</span>
                  <button
                    onClick={() => removeWord(word)}
                    aria-label={`Remove ${word}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="saved-count">
              {recordings.length} saved recording
              {recordings.length === 1 ? "" : "s"} in this browser
            </div>
          </section>
        )}
        {screen === "record" && (
          <section className="page-content practice-page">
            <button
              className="back-button"
              onClick={() => navigate("templates")}
            >
              ← All templates
            </button>
            <div className="page-intro">
              <span className="section-kicker">Voice warm-up</span>
              <h1>Let&apos;s hear your voice.</h1>
              <p>
                Record a sample. It is saved privately in this browser for your
                review.
              </p>
            </div>
            <div className="record-stage">
              <span className="stage-label">Selected template</span>
              <strong>{selectedTemplate.title}</strong>
              <p>“{phraseFor(selectedTemplate)}”</p>
              <button
                className={`record-button ${isRecording ? "recording" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
                aria-label={isRecording ? "Stop recording" : "Start recording"}
              >
                <span>{isRecording ? "■" : "●"}</span>
              </button>
              <span className="record-hint">
                {isRecording
                  ? `Recording ${formatTime(recordingSeconds)}`
                  : "Tap to start recording"}
              </span>
            </div>
            <button
              className="upload-row"
              type="button"
              onClick={() => uploadInput.current?.click()}
              disabled={uploadStatus === "uploading"}
            >
              <input
                ref={uploadInput}
                type="file"
                accept="audio/*,.ogg,.webm,.m4a,.wav,.mp3"
                hidden
                onChange={(event) => {
                  void uploadAudio(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <span className="upload-icon">↑</span>
              <span>
                <strong>
                  {uploadStatus === "uploading"
                    ? "Saving audio sample..."
                    : uploadStatus === "saved"
                      ? "Audio sample saved"
                      : uploadStatus === "error"
                        ? "Audio upload failed"
                        : "Upload an audio sample"}
                </strong>
                <small>
                  {uploadStatus === "error"
                    ? "Choose another file or check the database connection"
                    : "Choose an audio file to save to secure storage"}
                </small>
              </span>
              <span>＋</span>
            </button>
            <button
              className="primary-button"
              onClick={() => navigate("practice")}
            >
              Continue to practice <span>→</span>
            </button>
          </section>
        )}
        {screen === "practice" && (
          <section className="page-content practice-page">
            <button
              className="back-button"
              onClick={() => navigate("templates")}
            >
              ← Practice templates
            </button>
            <div className="page-intro">
              <span className="section-kicker">Live practice</span>
              <h1>Take your time.</h1>
              <p>Speak the phrase, then compare what CodeWithKris heard.</p>
            </div>
            <div className="phrase-card">
              <span>Practice phrase</span>
              <strong>{phraseFor(selectedTemplate)}</strong>
            </div>
            <button
              className={`listen-button ${isListening ? "active" : ""}`}
              onClick={toggleListening}
            >
              <span aria-hidden="true">{isListening ? "■" : "●"}</span>
              {isListening ? "Listening now" : "Tap to speak"}
            </button>
            <div className="live-card">
              <div className="live-card-heading">
                <span>Your speech</span>
                <span className="live-dot">
                  {isListening ? "LIVE" : "READY"}
                </span>
              </div>
              <p>{liveText}</p>
            </div>
            <div className="accuracy">
              <div>
                <span>Live match</span>
                <strong>
                  {liveText.startsWith("Your words")
                    ? "—"
                    : `${similarity(phraseFor(selectedTemplate), liveText)}%`}
                </strong>
              </div>
              <div className="progress-track">
                <span
                  style={{
                    width: `${similarity(phraseFor(selectedTemplate), liveText)}%`,
                  }}
                />
              </div>
            </div>
            <button className="primary-button" onClick={finishPractice}>
              Save practice <span>→</span>
            </button>
          </section>
        )}
        {screen === "progress" && (
          <section className="page-content">
            <div className="page-intro progress-intro">
              <span className="section-kicker">Your progress</span>
              <h1>
                {sessions.length
                  ? "You&apos;re building momentum."
                  : "Your first session starts here."}
              </h1>
              <p>
                {sessions.length
                  ? "These numbers come from your saved practice sessions."
                  : "Complete a practice session to start seeing your real progress."}
              </p>
              <button
                className="primary-button compact-button"
                onClick={() => navigate("templates")}
              >
                Practice again <span>→</span>
              </button>
            </div>
            <div className="stats-grid">
              <div>
                <strong>{sessions.length}</strong>
                <span>Total practices</span>
              </div>
              <div>
                <strong>{sessions.length ? `${average}%` : "—"}</strong>
                <span>Average accuracy</span>
              </div>
              <div>
                <strong>{recordings.length}</strong>
                <span>Saved recordings</span>
              </div>
              <div>
                <strong>{weekSessions.length}</strong>
                <span>This week</span>
              </div>
            </div>
            <div className="sessions">
              <div className="section-row">
                <h2>Recent sessions</h2>
                <span>{sessions.length} saved</span>
              </div>
              {sessions.length === 0 ? (
                <div className="empty-state">
                  Your completed practices will appear here.
                </div>
              ) : (
                sessions.slice(0, 3).map((session) => (
                  <div className="session-row" key={session.id}>
                    <div>
                      <small>
                        {new Date(session.createdAt).toLocaleString()}
                      </small>
                      <strong>{session.template}</strong>
                    </div>
                    <span
                      className={`score ${session.accuracy >= 80 ? "good" : "steady"}`}
                    >
                      {session.accuracy}%
                    </span>
                    <div className="mini-track">
                      <span style={{ width: `${session.accuracy}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
        {screen === "admin" && (
          <section className="page-content admin-page">
            <div className="page-intro">
              <span className="section-kicker">Admin demo view</span>
              <h1>Workspace overview.</h1>
              <p>
                Aggregate activity from the connected Supabase workspace.
                Personal transcripts and audio stay protected from this summary.
              </p>
            </div>
            <div className="stats-grid">
              <div>
                <strong>{sessions.length}</strong>
                <span>Practice sessions</span>
              </div>
              <div>
                <strong>{sessions.length ? `${average}%` : "—"}</strong>
                <span>Workspace average</span>
              </div>
              <div>
                <strong>{recordings.length}</strong>
                <span>Voice recordings</span>
              </div>
              <div>
                <strong>{words.length}</strong>
                <span>Dictionary words</span>
              </div>
            </div>
            <div className="admin-section template-admin-section">
              <div className="section-row">
                <h2>Practice templates</h2>
                <span>Sessions by template</span>
              </div>
              {templateCounts.map((template) => (
                <div className="template-stat" key={template.title}>
                  <div>
                    <strong>{template.title}</strong>
                    <small>
                      {template.count} session{template.count === 1 ? "" : "s"}
                    </small>
                  </div>
                  <div className="mini-track">
                    <span
                      style={{
                        width: `${sessions.length ? (template.count / sessions.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="admin-section activity-admin-section">
              <div className="section-row">
                <h2>Recent activity</h2>
                <span>{sessions.length} total</span>
              </div>
              {sessions.length === 0 ? (
                <div className="empty-state">
                  No user practice activity has been recorded yet. Complete a
                  user practice session to populate this demo.
                </div>
              ) : (
                sessions.slice(0, 4).map((session) => (
                  <div className="admin-activity" key={session.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>{session.template}</strong>
                      <small>
                        {new Date(session.createdAt).toLocaleString()} ·{" "}
                        {session.accuracy}% match
                      </small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
        {screen === "financials" && (
          <section className="page-content" style={{ maxWidth: 1000, margin: "0 auto" }}>
            <FinancialDashboard
              currentUserRole={userRole || "Student"}
              userEmail={email}
              userName={fullName}
              hasFinancialAccess={hasFinancialAccess}
              stakeholderCategory={stakeholderCategory}
            />
          </section>
        )}
        {screen === "diagnostic" && (
          <OnboardingDiagnostic onBack={() => navigate("templates")} onComplete={() => setDiagnosticCompleted(true)} />
        )}
        {screen === "peer-review" && (
          <PeerReviewQueue
            userName={fullName}
            userEmail={email}
            userRole={userRole || "Student"}
            onBack={() => navigate("templates")}
          />
        )}
        {screen === "gtm-pilot" && (
          <GtmPilotProject
            userName={fullName}
            userEmail={email}
            userRole={userRole || "Student"}
            onBack={() => navigate("templates")}
          />
        )}
      </div>
      <nav className="bottom-nav" aria-label="Main navigation">
        {((hasFinancialAccess ||
          email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase())
          ? [
              ["templates", "Practice", "▦"],
              ["progress", "User view", "◎"],
              ["admin", "Admin", "▤"],
              ["gtm-pilot", "GTM Pilot", "◇"],
              ["financials", "Coop Equity", "⚖️"],
            ]
          : [
              ["templates", "Templates", "▦"],
              ["record", "Record", "●"],
              ["practice", "Practice", "◌"],
              ["progress", "Progress", "▥"],
              ["gtm-pilot", "GTM Pilot", "◇"],
            ]
        ).map(([value, label, icon]) => (
          <button
            className={screen === value ? "active" : ""}
            key={value}
            onClick={() => navigate(value as Screen)}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
        <button className="role-switch" onClick={switchRole}>
          <span aria-hidden="true">⇄</span>
          {role === "admin" ? "User demo" : "Admin demo"}
        </button>
      </nav>
    </main>
  );
  return (
    <>
      {screen === "register" || screen === "signin"
        ? authScreen
        : screen === "volunteer"
          ? volunteerScreen
          : appScreen}
    </>
  );
}

export default App;
