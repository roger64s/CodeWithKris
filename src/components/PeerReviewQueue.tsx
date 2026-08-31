import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  GitPullRequestArrow,
  MessageSquareText,
  Plus,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { supabase } from "../supabase";
import { type UserRole } from "./UserRegistration";

type ReviewStatus = "open" | "in_review" | "changes_requested" | "validated";
type ReviewDecision = "comment" | "changes_requested" | "validated";
type Submission = {
  id: string;
  submitter_id: string | null;
  submitter_name: string;
  title: string;
  track: string;
  language: string;
  context: string;
  code_snippet: string;
  status: ReviewStatus;
  created_at: string;
};

type PeerReviewQueueProps = {
  userName: string;
  userEmail: string;
  userRole: UserRole;
  onBack: () => void;
};

const statusStyles: Record<ReviewStatus, string> = {
  open: "bg-sky-100 text-sky-800",
  in_review: "bg-amber-100 text-amber-800",
  changes_requested: "bg-rose-100 text-rose-800",
  validated: "bg-emerald-100 text-emerald-800",
};

export function PeerReviewQueue({
  userName,
  userEmail,
  userRole,
  onBack,
}: PeerReviewQueueProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"queue" | "submit">("queue");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isProducerOwner, setIsProducerOwner] = useState(
    userRole === "CodeWithKris Administrator",
  );
  const [title, setTitle] = useState("");
  const [track, setTrack] = useState("Frontend");
  const [language, setLanguage] = useState("TypeScript");
  const [context, setContext] = useState("");
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState("");
  const [qualityScore, setQualityScore] = useState(80);
  const [notice, setNotice] = useState(() =>
    supabase
      ? "Loading the community queue..."
      : "Local preview: submissions stay in this browser session.",
  );

  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("peer_review_submissions")
        .select(
          "id, submitter_id, submitter_name, title, track, language, context, code_snippet, status, created_at",
        )
        .order("created_at", { ascending: false }),
    ]).then(([userResult, queueResult]) => {
      const user = userResult.data.user;
      setCurrentUserId(user?.id || null);
      setIsProducerOwner(
        Boolean(user?.app_metadata?.producer_owner) ||
          userRole === "CodeWithKris Administrator",
      );
      if (!queueResult.error && queueResult.data) {
        setSubmissions(queueResult.data as Submission[]);
        setNotice(
          queueResult.data.length
            ? "Showing the shared review queue."
            : "The queue is ready for its first submission.",
        );
      } else {
        setNotice(
          "Queue storage is not published yet. Apply the Supabase schema to enable shared reviews.",
        );
      }
    });
  }, [userRole]);

  const selected =
    submissions.find((submission) => submission.id === selectedId) ||
    submissions[0] ||
    null;
  const canReviewSelected = Boolean(
    isProducerOwner && selected && selected.submitter_id !== currentUserId,
  );

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submission: Submission = {
      id: crypto.randomUUID(),
      submitter_id: currentUserId,
      submitter_name:
        userName.trim() || userEmail.split("@")[0] || "Community member",
      title: title.trim(),
      track,
      language,
      context: context.trim(),
      code_snippet: code.trim(),
      status: "open",
      created_at: new Date().toISOString(),
    };
    if (supabase && currentUserId) {
      const { error } = await supabase.from("peer_review_submissions").insert({
        ...submission,
        submitter_email: userEmail.trim().toLowerCase(),
      });
      if (error) {
        setNotice(`Submission was not shared: ${error.message}`);
        return;
      }
    }
    setSubmissions((current) => [submission, ...current]);
    setSelectedId(submission.id);
    setTitle("");
    setContext("");
    setCode("");
    setMode("queue");
    setNotice(
      supabase && currentUserId
        ? "Code shared with the cooperative review queue."
        : "Code added to this local preview.",
    );
  };

  const submitFeedback = async (decision: ReviewDecision) => {
    if (!selected || !feedback.trim() || !canReviewSelected) return;
    const nextStatus: ReviewStatus =
      decision === "comment" ? "in_review" : decision;
    if (supabase && currentUserId) {
      const { error } = await supabase.from("peer_review_feedback").insert({
        submission_id: selected.id,
        reviewer_id: currentUserId,
        reviewer_name: userName.trim() || userEmail,
        reviewer_email: userEmail.trim().toLowerCase(),
        decision,
        feedback: feedback.trim(),
        quality_score: qualityScore,
      });
      if (error) {
        setNotice(`Feedback was not shared: ${error.message}`);
        return;
      }
      await supabase
        .from("peer_review_submissions")
        .update({ status: nextStatus })
        .eq("id", selected.id);
    }
    setSubmissions((current) =>
      current.map((item) =>
        item.id === selected.id ? { ...item, status: nextStatus } : item,
      ),
    );
    setFeedback("");
    setNotice("Constructive feedback added to the shared review record.");
  };

  return (
    <section
      className="mx-auto w-full max-w-6xl px-4 pb-28 sm:px-7"
      aria-labelledby="peer-review-title"
    >
      <button
        className="mb-4 inline-flex items-center gap-2 border-0 bg-transparent text-sm font-bold text-violet-700"
        onClick={onBack}
      >
        <ArrowLeft size={17} aria-hidden="true" />
        Back to readiness
      </button>
      <header className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <span className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            <UsersRound size={15} aria-hidden="true" />
            Community governance
          </span>
          <h1
            id="peer-review-title"
            className="text-3xl font-bold text-slate-950"
          >
            Peer-Review Queue
          </h1>
          <div className="mt-2 text-sm leading-6 text-slate-600">
            Trainees share work. Producer-owners validate it through context,
            discussion, and constructive feedback.
          </div>
        </div>
        <div
          className="flex rounded-lg border border-slate-300 bg-white p-1"
          role="tablist"
          aria-label="Queue views"
        >
          <button
            className={`rounded-md px-4 py-2 text-sm font-bold ${mode === "queue" ? "bg-slate-950 text-white" : "text-slate-600"}`}
            onClick={() => setMode("queue")}
            role="tab"
            aria-selected={mode === "queue"}
          >
            Review queue
          </button>
          <button
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold ${mode === "submit" ? "bg-emerald-700 text-white" : "text-slate-600"}`}
            onClick={() => setMode("submit")}
            role="tab"
            aria-selected={mode === "submit"}
          >
            <Plus size={15} aria-hidden="true" />
            Submit code
          </button>
        </div>
      </header>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <GovernancePoint
          icon={ShieldCheck}
          title="Human validation"
          text="No automated instructor score decides readiness."
        />
        <GovernancePoint
          icon={GitPullRequestArrow}
          title="Collective ownership"
          text="Review decisions become part of the shared work record."
        />
        <GovernancePoint
          icon={MessageSquareText}
          title="Feedback loops"
          text="Specific, respectful guidance supports the next revision."
        />
      </div>

      <div
        className="mb-4 rounded-lg border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        role="status"
      >
        {notice}
      </div>

      {mode === "submit" ? (
        <form
          className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2"
          onSubmit={submitCode}
        >
          <label className="text-sm font-bold text-slate-800">
            Review title
            <input
              className="mt-2 block h-11 w-full rounded-md border border-slate-300 px-3 font-normal"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What should peers review?"
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold text-slate-800">
              Pathway
              <select
                className="mt-2 block h-11 w-full rounded-md border border-slate-300 px-3 font-normal"
                value={track}
                onChange={(event) => setTrack(event.target.value)}
              >
                <option>Frontend</option>
                <option>Backend</option>
                <option>DevOps</option>
              </select>
            </label>
            <label className="text-sm font-bold text-slate-800">
              Language
              <select
                className="mt-2 block h-11 w-full rounded-md border border-slate-300 px-3 font-normal"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option>TypeScript</option>
                <option>JavaScript</option>
                <option>Python</option>
                <option>HTML / CSS</option>
                <option>SQL</option>
                <option>Shell</option>
              </select>
            </label>
          </div>
          <label className="text-sm font-bold text-slate-800 md:col-span-2">
            Context for reviewers
            <textarea
              className="mt-2 block min-h-20 w-full resize-y rounded-md border border-slate-300 p-3 font-normal"
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Describe the goal, constraints, and the feedback you need."
              required
            />
          </label>
          <label className="text-sm font-bold text-slate-800 md:col-span-2">
            Code snippet
            <textarea
              className="mt-2 block min-h-56 w-full resize-y rounded-md border border-slate-800 bg-slate-950 p-4 font-mono text-sm leading-6 text-emerald-300"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Paste a focused snippet with no secrets or personal data."
              spellCheck={false}
              required
            />
          </label>
          <div className="flex items-center justify-between gap-4 md:col-span-2">
            <span className="text-xs text-slate-500">
              Submitted work belongs to the cooperative review record.
            </span>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-bold text-white"
              type="submit"
            >
              <Code2 size={17} aria-hidden="true" />
              Share for review
            </button>
          </div>
        </form>
      ) : (
        <div className="review-queue-layout grid min-w-0 gap-4">
          <div
            className="min-w-0 space-y-2"
            aria-label="Code review submissions"
          >
            {submissions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                <Code2 className="mx-auto text-slate-400" aria-hidden="true" />
                <strong className="mt-3 block text-slate-900">
                  No code awaiting review
                </strong>
                <span className="mt-1 block text-sm text-slate-500">
                  Share a focused snippet to begin the community feedback loop.
                </span>
                <button
                  className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
                  onClick={() => setMode("submit")}
                >
                  Submit the first snippet
                </button>
              </div>
            ) : (
              submissions.map((submission) => (
                <button
                  key={submission.id}
                  className={`w-full rounded-lg border p-4 text-left ${selected?.id === submission.id ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white"}`}
                  onClick={() => setSelectedId(submission.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-sm text-slate-950">
                      {submission.title}
                    </strong>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${statusStyles[submission.status]}`}
                    >
                      {submission.status.replace("_", " ")}
                    </span>
                  </div>
                  <span className="mt-2 block text-xs text-slate-500">
                    {submission.track} · {submission.language} ·{" "}
                    {submission.submitter_name}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="min-h-80 min-w-0 rounded-lg border border-slate-200 bg-white p-5">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
                      Shared work record
                    </span>
                    <h2 className="mt-1 text-xl font-bold text-slate-950">
                      {selected.title}
                    </h2>
                    <span className="mt-1 block text-xs text-slate-500">
                      Submitted by {selected.submitter_name} ·{" "}
                      {new Date(selected.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                    {selected.track} / {selected.language}
                  </span>
                </div>
                <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                  {selected.context}
                </div>
                <pre className="mt-3 max-h-72 w-full max-w-full overflow-auto rounded-md bg-slate-950 p-4 text-sm leading-6 text-emerald-300">
                  <code>{selected.code_snippet}</code>
                </pre>
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <label className="text-sm font-bold text-slate-800">
                    Constructive feedback
                    <textarea
                      className="mt-2 block min-h-24 w-full rounded-md border border-slate-300 p-3 font-normal"
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      placeholder={
                        canReviewSelected
                          ? "Name what works, what needs revision, and a practical next step."
                          : "Producer-owner validation is required for this review."
                      }
                      disabled={!canReviewSelected}
                    />
                  </label>
                  <label className="mt-3 block text-sm font-bold text-slate-800">
                    Reviewed code quality: {qualityScore}%
                    <input
                      className="mt-2 block w-full accent-emerald-700"
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={qualityScore}
                      onChange={(event) => setQualityScore(Number(event.target.value))}
                      disabled={!canReviewSelected}
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"
                      onClick={() => void submitFeedback("comment")}
                      disabled={!canReviewSelected || !feedback.trim()}
                    >
                      Add comment
                    </button>
                    <button
                      className="rounded-md border border-amber-500 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-40"
                      onClick={() => void submitFeedback("changes_requested")}
                      disabled={!canReviewSelected || !feedback.trim()}
                    >
                      Request revision
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                      onClick={() => void submitFeedback("validated")}
                      disabled={!canReviewSelected || !feedback.trim()}
                    >
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Validate together
                    </button>
                  </div>
                  {!canReviewSelected && (
                    <span className="mt-2 block text-xs text-slate-500">
                      Validation requires producer-owner capability and cannot
                      be applied to your own submission.
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="grid min-h-72 place-items-center text-center text-sm text-slate-500">
                Select a submission to open its shared review record.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function GovernancePoint({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <Icon size={19} className="text-emerald-700" aria-hidden="true" />
      <strong className="mt-3 block text-sm text-slate-950">{title}</strong>
      <span className="mt-1 block text-xs leading-5 text-slate-500">
        {text}
      </span>
    </div>
  );
}
