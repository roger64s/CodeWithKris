import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
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
import { ActionTrialOnboarding } from "./components/ActionTrialOnboarding";
import { CooperativeReadinessDashboard } from "./components/CooperativeReadinessDashboard";
import { PeerReviewQueue } from "./components/PeerReviewQueue";
import { GtmPilotProject } from "./components/GtmPilotProject";
import { FirstLoginProfile } from "./components/FirstLoginProfile";
import { type StakeholderCategory } from "./lib/ovuMatrix";

const RequirementsWorkspace = lazy(() => import("./components/RequirementsWorkspace").then((module) => ({ default: module.RequirementsWorkspace })));
const SprintTaskBoard = lazy(() => import("./components/SprintTaskBoard").then((module) => ({ default: module.SprintTaskBoard })));
const QualityWorkspace = lazy(() => import("./components/QualityWorkspace").then((module) => ({ default: module.QualityWorkspace })));
const BaselineActivityDashboard = lazy(() => import("./components/BaselineActivityDashboard").then((module) => ({ default: module.BaselineActivityDashboard })));

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
  | "action-trial"
  | "peer-review"
  | "gtm-pilot"
  | "requirements"
  | "sprints"
  | "quality"
  | "baselines"
  | "profile-onboarding"
  | "profile"
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
  taskId: string | null;
  taskConfigVersion: string | null;
  duration: number;
  createdAt: string;
  size: number;
  sourceType: "recorded" | "uploaded";
  originalFilename: string | null;
  referencePhrase: string;
  expectedSubtask: string | null;
  modelTrainingConsent: boolean;
  transcript: string;
  transcriptionStatus: "completed" | "unavailable" | "failed";
  transcriptionModelReference: string | null;
  transcriptMatch: number | null;
  analysisStatus: "completed" | "unavailable" | "failed";
  predictedSubtask: string | null;
  predictionConfidence: number | null;
  inferenceLatencyMs: number | null;
  inferenceModelVersion: string | null;
  workflowVersion: string | null;
  predictedResponseBlock: string | null;
  workflowStateMatch: boolean | null;
  diarization: { speakerCount: number; latencyMs: number; modelReference: string } | null;
};
type ModelMetrics = {
  modelVersion: string;
  taskId: string;
  taskName: string;
  trainingSamples: number;
  testSamples: number;
  accuracy: number;
  precisionWeighted: number;
  recallWeighted: number;
  f1Weighted: number;
  classifierLatencyMs: { p50: number; p95: number };
  workflowEvaluation: {
    workflowVersion: string;
    responseBlockAccuracy: number;
    transitionPairAccuracy: number | null;
    completeConversationAccuracy: number;
    evaluatedConversations: number;
    evaluatedTransitions: number;
  };
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
    title: "Active listening & de-escalation",
    detail: "Understand needs, acknowledge concerns, and reduce friction respectfully",
    color: "coral",
    phase: 1,
  },
  {
    icon: "02",
    title: "Professional text & email",
    detail: "Write clear, concise, and appropriately structured workplace messages",
    color: "mint",
    phase: 1,
  },
  {
    icon: "03",
    title: "Voice clarity",
    detail: "Practice synchronous calls and asynchronous voice updates at your own pace",
    color: "gold",
    phase: 1,
  },
  {
    icon: "04",
    title: "Lead Generation",
    detail: "Prospecting scripts, data hygiene, qualifying criteria, and outreach",
    color: "mint",
    phase: 2,
  },
  {
    icon: "05",
    title: "Appointment Fixing",
    detail: "Calendar management, scheduling friction, and confirmations",
    color: "gold",
    phase: 2,
  },
  {
    icon: "06",
    title: "Follow-Up Management",
    detail: "Post-check-ins, lead nurturing, and feedback collection",
    color: "coral",
    phase: 2,
  },
  {
    icon: "07",
    title: "Customer Service",
    detail: "Empathy-first troubleshooting, ticket management, and clear messaging",
    color: "lilac",
    phase: 2,
  },
  {
    icon: "08",
    title: "AI-assisted response drafting",
    detail: "Draft and revise clear responses while retaining human judgment",
    color: "mint",
    phase: 3,
  },
  {
    icon: "09",
    title: "Text task automation",
    detail: "Use AI assistance for repeatable text workflows with human checks",
    color: "gold",
    phase: 3,
  },
  {
    icon: "10",
    title: "CRM entry organization",
    detail: "Structure contact, activity, follow-up, and outcome records consistently",
    color: "coral",
    phase: 3,
  },
  {
    icon: "11",
    title: "Technical & operational execution",
    detail: "Use accessible steps and tools to complete, verify, and explain work",
    color: "lilac",
    phase: 3,
  },
];

const taskIdForTemplate = (template: Template) => template.phase === 2
  ? template.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  : null;
const phases = [
  { number: 1, title: "Universal Foundation", detail: "Build professional vocabulary, confidence, digital etiquette, and work readiness.", color: "mint" },
  { number: 2, title: "Commercial Task Tracks", detail: "Choose practical Lead Generation, Appointment Fixing, Follow-Up, or Customer Service work.", color: "gold" },
  { number: 3, title: "Applied AI & Workflow Execution", detail: "Use technical tools and AI assistance to complete and improve real workflows.", color: "lilac" },
] as const;
const defaultWords = ["listen", "follow-up", "support"];
const missionPhrases: Record<string, string> = {
  "Active listening & de-escalation": "I hear your concern, and I will confirm the next step with you.",
  "Professional text & email": "Thank you for your message. I will send a clear update by tomorrow.",
  "Voice clarity": "Here is a concise update on what is complete, blocked, and needed next.",
  "Lead Generation": "I am reaching out because your team may benefit from a short conversation about this service.",
  "Appointment Fixing": "Would Tuesday at ten or Wednesday at two work better for a brief call?",
  "Follow-Up Management": "I am following up with the promised information and one clear next step.",
  "Customer Service": "I understand the issue, and I will update you after I verify the account details.",
  "AI-assisted response drafting": "I will review the AI draft for accuracy, tone, privacy, and a clear next action.",
  "Text task automation": "I will check every automated message before it is approved or sent.",
  "CRM entry organization": "I recorded the contact, conversation, agreed action, owner, and follow-up date.",
  "Technical & operational execution": "I completed the step, checked the result, and documented what happens next.",
};
const appointmentSubtasks = [
  { key: "Greeting", title: "Greeting", phrase: "How are you, David?", receiver: "I am fine, Josy. How are you?", responseBlock: "GreetingResponse" },
  { key: "AskAvailability", title: "Ask availability", phrase: "I am doing great, David. Are you available next Tuesday at 5 PM California time to meet Roger regarding the Haz360 demo?", receiver: "Sorry, Josy. Tuesday is not good. How about Wednesday at 4 PM?", responseBlock: "AskAvailabilityResponse" },
  { key: "CheckSchedule", title: "Check schedule", phrase: "Sure, David. Let me check Roger's calendar. Please give me a minute.", receiver: "OK, thank you.", responseBlock: "CheckScheduleResponse" },
  { key: "ConfirmAppointment", title: "Confirm appointment", phrase: "Confirmed. I am sending you a meeting invitation. Thank you, David.", receiver: "Thank you, Josy. I received it and will talk to Roger on Wednesday. Bye.", responseBlock: "ConfirmAppointmentResponse" },
] as const;
const phraseFor = (template: Template) => missionPhrases[template.title] || `I am practicing ${template.title.toLowerCase()}.`;
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
  const [signupAt, setSignupAt] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);
  const [appointmentSubtaskIndex, setAppointmentSubtaskIndex] = useState(0);
  const [modelTrainingConsent, setModelTrainingConsent] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<1 | 2 | 3 | null>(null);
  const [words, setWords] = useState<string[]>(defaultWords);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics | null>(null);
  const [peerReviewContributions, setPeerReviewContributions] = useState(0);
  const [formativeEvidenceCount, setFormativeEvidenceCount] = useState(0);
  const [actionTrialCompleted, setActionTrialCompleted] = useState(false);
  const [currentTime] = useState(() => Date.now());
  const [newWord, setNewWord] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [liveText, setLiveText] = useState(
    "Your words will appear here as you speak.",
  );
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "saved" | "error">("idle");
  const [isListening, setIsListening] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordingSecondsRef = useRef(0);
  const audioUrlsRef = useRef<Record<string, string>>({});
  const chunks = useRef<Blob[]>([]);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const activePracticePhrase = selectedTemplate.title === "Appointment Fixing"
    ? appointmentSubtasks[appointmentSubtaskIndex].phrase
    : phraseFor(selectedTemplate);

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
    } else if (preview === "action-trial") {
      setFullName("Developer");
      setUserRole("Student");
      setScreen("action-trial");
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
    } else if (preview === "requirements") {
      setEmail(ADMIN_EMAIL);
      setFullName("Project Manager");
      setHasFinancialAccess(true);
      setStakeholderCategory("Founders & Core Operating Team");
      setUserRole("CodeWithKris Administrator");
      setScreen("requirements");
    } else if (preview === "sprints") {
      setFullName("Project Manager");
      setUserRole("CodeWithKris Administrator");
      setScreen("sprints");
    } else if (preview === "quality") {
      setFullName("QA Lead");
      setUserRole("CodeWithKris Administrator");
      setScreen("quality");
    } else if (preview === "baselines") {
      setFullName("Delivery Lead");
      setUserRole("CodeWithKris Administrator");
      setScreen("baselines");
    } else if (preview === "profile") {
      setAuthenticatedUserId("00000000-0000-0000-0000-000000000000");
      setSignupAt(new Date().toISOString());
      setScreen("profile-onboarding");
    }
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(
      () => setRecordingSeconds((seconds) => {
        recordingSecondsRef.current = seconds + 1;
        return seconds + 1;
      }),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [isRecording]);
  useEffect(() => () => {
    Object.values(audioUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthenticatedUserId(data.session.user.id);
        setSignupAt(data.session.user.created_at);
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
        setSignupAt(session.user.created_at);
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
    if (!supabase || !authenticatedUserId) return;
    supabase.from("user_profiles").select("completed_at, inactive_at").eq("user_id", authenticatedUserId).maybeSingle().then(({ data, error }) => {
      if (error) return;
      if (data?.inactive_at) {
        void signOut();
      } else if (!data?.completed_at) {
        setScreen("profile-onboarding");
      }
    });
  }, [authenticatedUserId]);
  useEffect(() => {
    if (!authenticatedUserId) return;
    Promise.all([
      api<{ word: string }[]>("/api/dictionary"),
      api<PracticeSession[]>("/api/sessions"),
      api<Recording[]>("/api/recordings"),
      api<ModelMetrics>("/api/model-metrics").catch(() => null),
    ])
      .then(([dictionary, savedSessions, savedRecordings, measuredMetrics]) => {
        setWords(
          dictionary.length
            ? dictionary.map((item) => item.word)
            : defaultWords,
        );
        setSessions(savedSessions);
        setRecordings(savedRecordings);
        setModelMetrics(measuredMetrics);
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
      supabase.from("learning_pod_progress_events").select("id", { count: "exact", head: true }).eq("learner_user_id", authenticatedUserId),
      supabase.from("learner_action_trials").select("status").eq("user_id", authenticatedUserId).maybeSingle(),
    ]).then(([submissionResult, progressResult, trialResult]) => {
      setPeerReviewContributions(submissionResult.count || 0);
      setFormativeEvidenceCount(progressResult.count || 0);
      setActionTrialCompleted(trialResult.data?.status === "completed");
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
  async function signOut() {
    await supabase?.auth.signOut({ scope: "local" });
    setSelectedPhase(null);
    setRole("user");
    setAuthMode("signin");
    setPassword("");
    setAuthError("");
    navigate("signin");
  }
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
        const taskId = taskIdForTemplate(selectedTemplate);
        if (taskId) form.append("taskId", taskId);
        form.append("duration", String(recordingSecondsRef.current));
        form.append("sourceType", "recorded");
        form.append("referencePhrase", activePracticePhrase);
        if (selectedTemplate.title === "Appointment Fixing") form.append("expectedSubtask", appointmentSubtasks[appointmentSubtaskIndex].key);
        form.append("modelTrainingConsent", String(modelTrainingConsent));
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
      recordingSecondsRef.current = 0;
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
    const taskId = taskIdForTemplate(selectedTemplate);
    if (taskId) form.append("taskId", taskId);
    form.append("duration", "0");
    form.append("sourceType", "uploaded");
    form.append("referencePhrase", activePracticePhrase);
    if (selectedTemplate.title === "Appointment Fixing") form.append("expectedSubtask", appointmentSubtasks[appointmentSubtaskIndex].key);
    form.append("modelTrainingConsent", String(modelTrainingConsent));
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
  const loadRecordingAudio = async (recordingId: string) => {
    if (audioUrls[recordingId] || loadingAudioId) return;
    setLoadingAudioId(recordingId);
    try {
      const { data } = await supabase?.auth.getSession() || { data: { session: null } };
      if (!data.session?.access_token) throw new Error("Authentication required");
      const response = await fetch(`/api/recordings/${recordingId}/audio`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (!response.ok) throw new Error("Audio unavailable");
      const url = URL.createObjectURL(await response.blob());
      audioUrlsRef.current[recordingId] = url;
      setAudioUrls((current) => ({ ...current, [recordingId]: url }));
    } catch {
      setLiveText("This private recording could not be loaded. Check the API connection and try again.");
    } finally {
      setLoadingAudioId(null);
    }
  };
  const saveRecordingTranscript = async (recordingId: string, transcript: string) => {
    const { data } = await supabase?.auth.getSession() || { data: { session: null } };
    if (!data.session?.access_token) throw new Error("Authentication required");
    const response = await fetch(`/api/recordings/${recordingId}/transcript`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    if (!response.ok) throw new Error("Transcript could not be saved");
    const updated = await response.json() as Recording;
    setRecordings((current) => current.map((item) => item.id === updated.id ? updated : item));
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
    const phrase = activePracticePhrase;
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
          <button className="avatar" aria-label="Open profile" onClick={() => navigate("profile")}>
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
                    formativeEvidenceCount={formativeEvidenceCount}
                    actionTrialCompleted={actionTrialCompleted}
                    onSelectPhase={setSelectedPhase}
                    onStartActionTrial={() => navigate("action-trial")}
                    onOpenPeerReviews={() => navigate("peer-review")}
                  />
                </section>
              ) : (
                <>
                  <div className="page-intro">
                    <span className="section-kicker">Inclusion-first learning pathway</span>
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
                Record or upload a sample. Each attempt is saved privately with
                playback, transcription status, and progress evidence.
              </p>
            </div>
            {selectedTemplate.title === "Appointment Fixing" && <AppointmentTaskSteps selectedIndex={appointmentSubtaskIndex} recordings={recordings} onSelect={setAppointmentSubtaskIndex} />}
            {selectedTemplate.title === "Appointment Fixing" && <label className="model-consent"><input type="checkbox" checked={modelTrainingConsent} onChange={(event) => setModelTrainingConsent(event.target.checked)} /><span><strong>Contribute this sample to model improvement</strong><small>Optional. The recording stays private and excluded from training unless you select this before recording or upload.</small></span></label>}
            <div className="record-stage">
              <span className="stage-label">Selected template</span>
              <strong>{selectedTemplate.title}</strong>
              <p>“{activePracticePhrase}”</p>
              {selectedTemplate.title === "Appointment Fixing" && <small className="receiver-dialogue"><b>{appointmentSubtasks[appointmentSubtaskIndex].responseBlock}</b> · Receiver: “{appointmentSubtasks[appointmentSubtaskIndex].receiver}”</small>}
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
            <RecordingHistory recordings={recordings} audioUrls={audioUrls} loadingAudioId={loadingAudioId} onLoadAudio={loadRecordingAudio} onSaveTranscript={saveRecordingTranscript} compact />
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
            {selectedTemplate.title === "Appointment Fixing" && <AppointmentTaskSteps selectedIndex={appointmentSubtaskIndex} recordings={recordings} onSelect={setAppointmentSubtaskIndex} />}
            <div className="phrase-card">
              <span>Practice phrase</span>
              <strong>{activePracticePhrase}</strong>
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
                    : `${similarity(activePracticePhrase, liveText)}%`}
                </strong>
              </div>
              <div className="progress-track">
                <span
                  style={{
                    width: `${similarity(activePracticePhrase, liveText)}%`,
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
                <span>Average practice match</span>
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
            <ModelEvaluationCard metrics={modelMetrics} />
            <RecordingHistory recordings={recordings} audioUrls={audioUrls} loadingAudioId={loadingAudioId} onLoadAudio={loadRecordingAudio} onSaveTranscript={saveRecordingTranscript} />
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
        {screen === "action-trial" && (
          <ActionTrialOnboarding userId={authenticatedUserId} onBack={() => navigate("templates")} onComplete={() => setActionTrialCompleted(true)} />
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
        {screen === "requirements" && <Suspense fallback={<div className="empty-state">Loading Requirements Management...</div>}><RequirementsWorkspace onOpenCoopEquity={() => navigate("financials")} /></Suspense>}
        {screen === "sprints" && <Suspense fallback={<div className="empty-state">Loading Sprint Board...</div>}><SprintTaskBoard /></Suspense>}
        {screen === "quality" && <Suspense fallback={<div className="empty-state">Loading Testing & Issues...</div>}><QualityWorkspace /></Suspense>}
        {screen === "baselines" && <Suspense fallback={<div className="empty-state">Loading Baselines & Activity...</div>}><BaselineActivityDashboard /></Suspense>}
      </div>
      <nav className="bottom-nav" aria-label="Main navigation">
        {((hasFinancialAccess ||
          email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase())
          ? [
              ["templates", "Practice", "▦"],
              ["progress", "User view", "◎"],
              ["admin", "Admin", "▤"],
              ["gtm-pilot", "GTM Pilot", "◇"],
              ["requirements", "Requirements", "≡"],
              ["sprints", "Sprints", "▥"],
              ["quality", "Testing", "✓"],
              ["baselines", "Activity", "◫"],
              ["financials", "Coop Equity", "⚖️"],
              ["profile", "Profile", "○"],
            ]
          : [
              ["templates", "Templates", "▦"],
              ["record", "Record", "●"],
              ["practice", "Practice", "◌"],
              ["progress", "Progress", "▥"],
              ["gtm-pilot", "GTM Pilot", "◇"],
              ["requirements", "Requirements", "≡"],
              ["sprints", "Sprints", "▥"],
              ["quality", "Testing", "✓"],
              ["baselines", "Activity", "◫"],
              ["financials", "Coop Equity", "⚖️"],
              ["profile", "Profile", "○"],
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
          : (screen === "profile-onboarding" || screen === "profile") && authenticatedUserId
            ? <FirstLoginProfile userId={authenticatedUserId} signupAt={signupAt} editing={screen === "profile"} onComplete={() => navigate("templates")} onInactive={signOut} />
          : appScreen}
    </>
  );
}

function RecordingHistory({ recordings, audioUrls, loadingAudioId, onLoadAudio, onSaveTranscript, compact = false }: { recordings: Recording[]; audioUrls: Record<string, string>; loadingAudioId: string | null; onLoadAudio: (recordingId: string) => Promise<void>; onSaveTranscript: (recordingId: string, transcript: string) => Promise<void>; compact?: boolean }) {
  return <section className={`recording-history ${compact ? "compact" : ""}`} aria-labelledby={compact ? "record-history-title" : "progress-record-history-title"}>
    <div className="section-row">
      <h2 id={compact ? "record-history-title" : "progress-record-history-title"}>Audio & transcript history</h2>
      <span>{recordings.length} saved</span>
    </div>
    {recordings.length === 0 ? <div className="empty-state">Your recorded and uploaded audio will appear here.</div> : recordings.map((recording, index) => {
      const previous = recordings.slice(index + 1).find((item) => item.template === recording.template && item.transcriptMatch !== null);
      const change = recording.transcriptMatch !== null && previous?.transcriptMatch !== null && previous?.transcriptMatch !== undefined
        ? recording.transcriptMatch - previous.transcriptMatch
        : null;
      return <RecordingHistoryItem key={recording.id} recording={recording} audioUrl={audioUrls[recording.id]} isLoadingAudio={loadingAudioId === recording.id} change={change} onLoadAudio={onLoadAudio} onSaveTranscript={onSaveTranscript} />;
    })}
  </section>;
}

function ModelEvaluationCard({ metrics }: { metrics: ModelMetrics | null }) {
  return <section className="model-evaluation" aria-labelledby="model-evaluation-title">
    <div><span className="section-kicker">Held-out evaluation</span><h2 id="model-evaluation-title">Appointment task model</h2></div>
    {metrics ? <>
      <div className="model-metric-grid">
        <div><strong>{Math.round(metrics.accuracy * 100)}%</strong><span>Accuracy</span></div>
        <div><strong>{Math.round(metrics.precisionWeighted * 100)}%</strong><span>Weighted precision</span></div>
        <div><strong>{Math.round(metrics.recallWeighted * 100)}%</strong><span>Weighted recall</span></div>
        <div><strong>{Math.round(metrics.f1Weighted * 100)}%</strong><span>Weighted F1</span></div>
      </div>
      <div className="workflow-metric-row">
        <span><strong>{Math.round(metrics.workflowEvaluation.responseBlockAccuracy * 100)}%</strong> Response blocks</span>
        <span><strong>{metrics.workflowEvaluation.transitionPairAccuracy === null ? "—" : `${Math.round(metrics.workflowEvaluation.transitionPairAccuracy * 100)}%`}</strong> State transitions</span>
        <span><strong>{Math.round(metrics.workflowEvaluation.completeConversationAccuracy * 100)}%</strong> Complete conversations</span>
      </div>
      <small>{metrics.modelVersion} · {metrics.trainingSamples} training / {metrics.testSamples} test samples · measured 80/20 split · classifier latency p50 {metrics.classifierLatencyMs.p50.toFixed(1)} ms / p95 {metrics.classifierLatencyMs.p95.toFixed(1)} ms</small>
    </> : <p>No validated model evaluation is available yet. Metrics appear here only after consented, labeled data is trained and tested.</p>}
  </section>;
}

function AppointmentTaskSteps({ selectedIndex, recordings, onSelect }: { selectedIndex: number; recordings: Recording[]; onSelect: (index: number) => void }) {
  return <section className="appointment-task-steps" aria-labelledby="appointment-task-title">
    <div className="section-row">
      <div><span className="section-kicker">Appointment scheduling</span><h2 id="appointment-task-title">Complete four audio subtasks</h2></div>
      <span>{appointmentSubtasks.filter((step) => recordings.some((recording) => recording.template === "Appointment Fixing" && recording.referencePhrase === step.phrase)).length} / 4 recorded</span>
    </div>
    <div className="appointment-step-list">
      {appointmentSubtasks.map((step, index) => {
        const complete = recordings.some((recording) => recording.template === "Appointment Fixing" && recording.referencePhrase === step.phrase);
        return <button className={selectedIndex === index ? "active" : ""} type="button" key={step.key} onClick={() => onSelect(index)} aria-pressed={selectedIndex === index}>
          <span>{complete ? "✓" : index + 1}</span><strong>{step.title}</strong>
        </button>;
      })}
    </div>
  </section>;
}

function RecordingHistoryItem({ recording, audioUrl, isLoadingAudio, change, onLoadAudio, onSaveTranscript }: { recording: Recording; audioUrl?: string; isLoadingAudio: boolean; change: number | null; onLoadAudio: (recordingId: string) => Promise<void>; onSaveTranscript: (recordingId: string, transcript: string) => Promise<void> }) {
  const [draft, setDraft] = useState(recording.transcript);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const saveTranscript = async () => {
    if (!draft.trim()) return;
    setSaveState("saving");
    try {
      await onSaveTranscript(recording.id, draft.trim());
      setSaveState("idle");
    } catch {
      setSaveState("error");
    }
  };
  return <article className="recording-history-item">
    <div className="recording-history-heading">
      <div><strong>{recording.template}</strong><small>{new Date(recording.createdAt).toLocaleString()} · {recording.sourceType === "uploaded" ? `Uploaded audio${recording.originalFilename ? ` · ${recording.originalFilename}` : ""}` : `Direct recording · ${formatRecordingDuration(recording.duration)}`}</small></div>
      {recording.transcriptMatch !== null && <span className="recording-match">{recording.transcriptMatch}% phrase match</span>}
    </div>
    {audioUrl
      ? <audio controls preload="metadata" src={audioUrl}>Your browser does not support audio playback.</audio>
      : <button className="play-recording-button" type="button" disabled={isLoadingAudio} onClick={() => void onLoadAudio(recording.id)}>{isLoadingAudio ? "Loading audio..." : "▶ Play recording"}</button>}
    <div className="recording-transcript">
      <span>Transcript</span>
      <p>{recording.transcript || transcriptionMessage(recording.transcriptionStatus)}</p>
    </div>
    <details className="transcript-editor">
      <summary>{recording.transcript ? "Correct transcript" : "Add transcript manually"}</summary>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={`Transcript for ${recording.template}`} />
      <button type="button" onClick={() => void saveTranscript()} disabled={!draft.trim() || saveState === "saving"}>{saveState === "saving" ? "Saving..." : "Save transcript"}</button>
      {saveState === "error" && <small role="alert">Transcript could not be saved. Try again.</small>}
    </details>
    <div className="recording-evidence">
      <span>{change === null ? "First transcribed sample for this mission" : change > 0 ? `Improved by ${change} points from the previous sample` : change < 0 ? `${Math.abs(change)} points below the previous sample` : "Same phrase match as the previous sample"}</span>
      <small>Phrase match is transcript evidence only; it does not measure a person&apos;s ability or diagnose speech.</small>
    </div>
    {recording.template === "Appointment Fixing" && <small className="consent-evidence">{recording.modelTrainingConsent ? `Consented model-improvement sample · Expected: ${formatSubtask(recording.expectedSubtask)}` : "Private practice only · Excluded from model training"}</small>}
    {recording.analysisStatus === "completed" && <div className="model-evidence">
      <strong>Model output: {formatSubtask(recording.predictedSubtask)}</strong>
      <span>{recording.predictedResponseBlock} · {recording.workflowStateMatch ? "matches expected state" : "requires state review"}</span>
      <span>{Math.round((recording.predictionConfidence || 0) * 100)}% model probability · {recording.inferenceLatencyMs?.toFixed(1)} ms inference</span>
      <small>{recording.inferenceModelVersion}{recording.diarization ? ` · ${recording.diarization.speakerCount} speaker(s), ${recording.diarization.latencyMs.toFixed(1)} ms diarization` : " · Diarization not configured"}</small>
    </div>}
  </article>;
}

const formatRecordingDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const transcriptionMessage = (status: Recording["transcriptionStatus"]) => status === "unavailable"
  ? "Transcription is not configured. The audio remains available in your private history."
  : "Transcription could not be completed. The audio remains available for playback.";
const formatSubtask = (subtask: Recording["predictedSubtask"]) => appointmentSubtasks.find((item) => item.key === subtask)?.title || "Unknown subtask";

export default App;
