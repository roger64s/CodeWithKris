import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Database,
  RotateCcw,
  ServerCog,
  Sparkles,
  Trophy,
} from "lucide-react";

type Track = "Frontend" | "Backend" | "DevOps";
type Answer = { label: string; detail: string; score: number };
type Question = { prompt: string; options: Answer[] };
type DiagnosticResult = {
  track: Track;
  score: number;
  proficiency: "Foundation" | "Builder" | "Sprint-ready";
  recommendedModules: string[];
  sprintEligibility: "Locked";
  unlockRequirement: string;
};

type OnboardingDiagnosticProps = {
  onBack: () => void;
  onComplete: () => void;
};

const trackOptions: Array<{ track: Track; detail: string; icon: typeof Code2 }> = [
  { track: "Frontend", detail: "Interfaces, accessibility, and browser experiences", icon: Code2 },
  { track: "Backend", detail: "APIs, data, security, and application logic", icon: Database },
  { track: "DevOps", detail: "Delivery pipelines, cloud systems, and reliability", icon: ServerCog },
];

const questions: Record<Track, Question[]> = {
  Frontend: [
    { prompt: "How confidently can you build a responsive interface from a design?", options: confidenceOptions("I need guided starter code", "I can build familiar layouts", "I can deliver polished, accessible UI") },
    { prompt: "How do you approach state and user interactions?", options: confidenceOptions("I am learning component state", "I can manage forms and shared state", "I design resilient interaction flows") },
    { prompt: "What is your testing experience?", options: confidenceOptions("I have not tested UI yet", "I write focused component tests", "I cover unit, integration, and browser flows") },
    { prompt: "How do you make interfaces accessible?", options: confidenceOptions("I am learning semantic HTML", "I test keyboard and screen-reader flows", "I lead accessibility reviews and remediation") },
    { prompt: "How comfortable are you shipping frontend work with a team?", options: confidenceOptions("I need a supported first task", "I can use branches and review feedback", "I can scope, review, and deliver independently") },
  ],
  Backend: [
    { prompt: "How confidently can you design and build an API?", options: confidenceOptions("I need a guided endpoint", "I can build CRUD APIs", "I design secure, versioned services") },
    { prompt: "How comfortable are you with data modelling?", options: confidenceOptions("I am learning queries and schemas", "I can model relational data", "I optimize models, migrations, and transactions") },
    { prompt: "What is your backend testing experience?", options: confidenceOptions("I have not tested APIs yet", "I write unit and integration tests", "I validate contracts, load, and failure modes") },
    { prompt: "How do you operate backend services?", options: confidenceOptions("I am learning logs and deployment", "I can diagnose common production failures", "I design observable and recoverable services") },
    { prompt: "How do you handle application security?", options: confidenceOptions("I need guidance on security basics", "I use auth, validation, and permissions", "I threat-model and harden production systems") },
  ],
  DevOps: [
    { prompt: "How confidently can you automate a deployment?", options: confidenceOptions("I deploy with step-by-step help", "I can build a CI/CD pipeline", "I design progressive delivery systems") },
    { prompt: "How comfortable are you with cloud infrastructure?", options: confidenceOptions("I am learning core services", "I can provision common workloads", "I design secure, resilient platforms") },
    { prompt: "What is your observability experience?", options: confidenceOptions("I am new to logs and metrics", "I can create alerts and dashboards", "I design SLOs and incident response") },
    { prompt: "How do you secure delivery infrastructure?", options: confidenceOptions("I am learning secrets and access controls", "I apply least privilege and scan pipelines", "I threat-model supply chains and cloud boundaries") },
    { prompt: "How do you manage infrastructure changes?", options: confidenceOptions("I make changes with guidance", "I use reviewed infrastructure as code", "I manage tested, auditable platform changes") },
  ],
};

const modules: Record<Track, Record<DiagnosticResult["proficiency"], string[]>> = {
  Frontend: {
    Foundation: ["Accessible HTML & CSS", "React Interaction Basics", "Git Collaboration Lab"],
    Builder: ["Accessible React Patterns", "Frontend Testing Lab", "Client Brief Simulator"],
    "Sprint-ready": ["Production UI Review", "Browser Quality Lab", "Cooperative Delivery Brief"],
  },
  Backend: {
    Foundation: ["API Foundations", "Relational Data Basics", "Git Collaboration Lab"],
    Builder: ["Secure API Patterns", "Backend Testing Lab", "Client Brief Simulator"],
    "Sprint-ready": ["Production API Review", "Reliability Lab", "Cooperative Delivery Brief"],
  },
  DevOps: {
    Foundation: ["CI/CD Foundations", "Cloud Service Basics", "Git Collaboration Lab"],
    Builder: ["Infrastructure as Code", "Observability Lab", "Client Brief Simulator"],
    "Sprint-ready": ["Production Readiness Review", "Incident Response Lab", "Cooperative Delivery Brief"],
  },
};

function confidenceOptions(beginner: string, intermediate: string, advanced: string): Answer[] {
  return [
    { label: "Learning", detail: beginner, score: 1 },
    { label: "Practicing", detail: intermediate, score: 2 },
    { label: "Confident", detail: advanced, score: 3 },
  ];
}

function buildResult(track: Track, answers: number[]): DiagnosticResult {
  const score = Math.round((answers.reduce((total, answer) => total + answer, 0) / 15) * 100);
  const proficiency = score >= 84 ? "Sprint-ready" : score >= 55 ? "Builder" : "Foundation";
  const recommendedModules = modules[track][proficiency];
  return {
    track,
    score,
    proficiency,
    recommendedModules,
    sprintEligibility: "Locked",
    unlockRequirement: `Complete all ${recommendedModules.length} recommended free modules`,
  };
}

export function OnboardingDiagnostic({ onBack, onComplete }: OnboardingDiagnosticProps) {
  const [step, setStep] = useState(0);
  const [track, setTrack] = useState<Track | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const result = track && answers.length === 5 ? buildResult(track, answers) : null;
  const progress = result ? 100 : (step / 5) * 100;

  const reset = () => {
    setStep(0);
    setTrack(null);
    setAnswers([]);
  };

  const chooseTrack = (nextTrack: Track) => {
    setTrack(nextTrack);
    setStep(1);
  };

  const chooseAnswer = (score: number) => {
    if (answers.length === 4) onComplete();
    setAnswers((current) => [...current, score]);
    setStep((current) => current + 1);
  };

  const goBack = () => {
    if (step === 0) return onBack();
    if (result) {
      setAnswers((current) => current.slice(0, -1));
      setStep(5);
      return;
    }
    setAnswers((current) => current.slice(0, -1));
    setStep((current) => current - 1);
  };

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-28 pt-2 sm:px-7" aria-labelledby="diagnostic-title">
      <button className="mb-5 inline-flex items-center gap-2 border-0 bg-transparent text-sm font-bold text-violet-700" onClick={goBack}>
        <ArrowLeft size={17} aria-hidden="true" /> {step === 0 ? "Back to dashboard" : "Previous question"}
      </button>

      <div className="mb-7 flex flex-col gap-5 border-b border-slate-200 pb-7 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <span className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            <Sparkles size={15} aria-hidden="true" /> Developer pathway diagnostic
          </span>
          <h1 id="diagnostic-title" className="text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">
            Find your shortest path to a client sprint.
          </h1>
          <div className="mt-3 text-base leading-7 text-slate-600">
            Five focused questions create a practical learning route. Every recommended module is free.
          </div>
        </div>
        <div className="min-w-52" aria-label={`Diagnostic ${Math.round(progress)}% complete`}>
          <div className="mb-2 flex justify-between text-xs font-bold text-slate-500">
            <span>{result ? "Diagnostic complete" : step === 0 ? "Choose pathway" : `Question ${step} of 5`}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-emerald-600 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {!result ? (
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <span className="text-sm font-bold text-emerald-700">{step === 0 ? "Choose a focus" : track}</span>
            <h2 className="mt-2 text-2xl font-bold leading-snug text-slate-950">
              {step === 0 ? "Which pathway do you want to evaluate?" : questions[track!][step - 1].prompt}
            </h2>
          </div>
          <div className="grid gap-3">
            {step === 0
              ? trackOptions.map(({ track: optionTrack, detail, icon: Icon }) => (
                  <button key={optionTrack} className="group grid min-h-24 grid-cols-[48px_1fr_24px] items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md" onClick={() => chooseTrack(optionTrack)}>
                    <span className="grid h-12 w-12 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon size={23} aria-hidden="true" /></span>
                    <span><strong className="block text-base text-slate-950">{optionTrack}</strong><span className="mt-1 block text-sm leading-5 text-slate-500">{detail}</span></span>
                    <ArrowRight className="text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-700" size={20} aria-hidden="true" />
                  </button>
                ))
              : questions[track!][step - 1].options.map((option) => (
                  <button key={option.label} className="group grid min-h-20 grid-cols-[36px_1fr_24px] items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-500 hover:bg-emerald-50/40" onClick={() => chooseAnswer(option.score)}>
                    <span className="grid h-9 w-9 place-items-center rounded-full border border-slate-300 text-sm font-bold text-slate-600 group-hover:border-emerald-600 group-hover:text-emerald-700">{option.score}</span>
                    <span><strong className="block text-base text-slate-950">{option.label}</strong><span className="mt-1 block text-sm leading-5 text-slate-500">{option.detail}</span></span>
                    <ArrowRight className="text-slate-400 group-hover:text-emerald-700" size={19} aria-hidden="true" />
                  </button>
                ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
            <div className="rounded-lg bg-slate-950 p-6 text-white">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-400">Your result</span>
              <div className="mt-4 flex items-end gap-3"><strong className="text-5xl">{result.score}</strong><span className="pb-1 text-slate-400">/ 100</span></div>
              <div className="mt-5 text-xl font-bold">{result.proficiency} {result.track} developer</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">Complete your tailored free modules to unlock cooperative sprint eligibility.</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between gap-3"><strong className="text-slate-950">Diagnostic JSON</strong><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Generated locally</span></div>
              <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-6 text-emerald-300"><code>{JSON.stringify(result, null, 2)}</code></pre>
            </div>
          </div>

          <div>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Your pathway map</span><h2 className="mt-2 text-2xl font-bold text-slate-950">Three phases to cooperative delivery</h2></div><span className="text-sm font-bold text-emerald-700">Free access throughout</span></div>
            <div className="grid gap-3 md:grid-cols-3">
              <PathPhase number="01" title="Diagnostic complete" status="Complete" tone="complete" items={[`${result.track} focus selected`, `${result.proficiency} proficiency identified`]} />
              <PathPhase number="02" title="Complete free modules" status="Next" tone="current" items={result.recommendedModules} />
              <PathPhase number="03" title="Cooperative client sprint" status="Unlocks next" tone="locked" items={["Eligibility review", "Team matching", "Supported project brief"]} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5">
            <div className="flex items-center gap-3 text-sm text-slate-600"><Trophy className="text-amber-600" size={20} aria-hidden="true" /><span>Sprint eligibility unlocks through demonstrated learning completion.</span></div>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:border-emerald-600" onClick={reset}><RotateCcw size={17} aria-hidden="true" /> Retake diagnostic</button>
          </div>
        </div>
      )}
    </section>
  );
}

function PathPhase({ number, title, status, tone, items }: { number: string; title: string; status: string; tone: "complete" | "current" | "locked"; items: string[] }) {
  const styles = tone === "complete" ? "border-emerald-600 bg-emerald-50" : tone === "current" ? "border-amber-500 bg-amber-50" : "border-slate-300 bg-slate-100";
  return (
    <article className={`relative min-h-64 rounded-lg border-2 p-5 ${styles}`}>
      <div className="flex items-start justify-between gap-3"><span className="text-sm font-bold text-slate-500">{number}</span><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm">{status}</span></div>
      <h3 className="mt-7 text-lg font-bold text-slate-950">{title}</h3>
      <ul className="mt-4 space-y-3 p-0">
        {items.map((item) => <li className="flex gap-2 text-sm leading-5 text-slate-600" key={item}><Check className={tone === "locked" ? "mt-0.5 shrink-0 text-slate-400" : "mt-0.5 shrink-0 text-emerald-700"} size={16} aria-hidden="true" /><span>{item}</span></li>)}
      </ul>
    </article>
  );
}