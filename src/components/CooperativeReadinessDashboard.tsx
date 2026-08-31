import {
  ArrowRight,
  Check,
  CircleDot,
  ClipboardCheck,
  CodeXml,
  MessageSquareMore,
  Radio,
  Sparkles,
  Users,
} from "lucide-react";
import { ClientProjectImpactWidget } from "./ClientProjectImpactWidget";

type PathwayPhase = {
  number: 1 | 2 | 3;
  title: string;
  detail: string;
};

type CooperativeReadinessDashboardProps = {
  headline: string;
  message: string;
  phases: readonly PathwayPhase[];
  completedMissions: readonly number[];
  totalMissions: readonly number[];
  peerReviewContributions: number;
  codeQualityScore: number | null;
  diagnosticCompleted: boolean;
  onSelectPhase: (phase: 1 | 2 | 3) => void;
  onStartDiagnostic: () => void;
  onOpenPeerReviews: () => void;
};

const phaseIcons = [MessageSquareMore, Users, CodeXml];

export function CooperativeReadinessDashboard({
  headline,
  message,
  phases,
  completedMissions,
  totalMissions,
  peerReviewContributions,
  codeQualityScore,
  diagnosticCompleted,
  onSelectPhase,
  onStartDiagnostic,
  onOpenPeerReviews,
}: CooperativeReadinessDashboardProps) {
  const totalComplete = completedMissions.reduce((sum, count) => sum + count, 0);
  const totalRequired = totalMissions.reduce((sum, count) => sum + count, 0);
  const isSprintEligible = diagnosticCompleted && totalComplete === totalRequired && peerReviewContributions > 0 && codeQualityScore !== null;
  const currentPhaseIndex = completedMissions.findIndex((count, index) => count < totalMissions[index]);
  const activePhaseIndex = currentPhaseIndex === -1 ? 2 : currentPhaseIndex;

  return (
    <section className="cooperative-dashboard space-y-2" aria-labelledby="dashboard-title">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <span className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            <Sparkles size={15} aria-hidden="true" /> Cooperative readiness
          </span>
          <h1 id="dashboard-title" className="text-3xl font-bold leading-tight text-slate-950">{headline}</h1>
          <div className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{message}</div>
        </div>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-800" onClick={onStartDiagnostic}>
          Skill diagnostic <ArrowRight size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="Readiness metrics">
        <Metric icon={ClipboardCheck} label="Peer reviews" value={String(peerReviewContributions)} detail="Open community queue" onClick={onOpenPeerReviews} />
        <Metric icon={CodeXml} label="Code quality" value={codeQualityScore === null ? "Not scored" : `${codeQualityScore}%`} detail="From reviewed coding work" />
        <Metric icon={Radio} label="Live client sprints" value={isSprintEligible ? "Eligible" : "Building readiness"} detail={isSprintEligible ? "Ready for team matching" : "Complete diagnostic, missions, and reviewed work"} accent={isSprintEligible} />
      </div>

      <section aria-labelledby="readiness-path-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Three-phase pathway</span>
            <h2 id="readiness-path-title" className="mt-1 text-xl font-bold text-slate-950">Cooperative Readiness tracker</h2>
          </div>
          <span className="text-sm font-bold text-emerald-700">{totalComplete} / {totalRequired} missions</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {phases.map((phase, index) => {
            const Icon = phaseIcons[index];
            const isComplete = completedMissions[index] === totalMissions[index];
            const isActive = index === activePhaseIndex;
            return (
              <button
                key={phase.number}
                className={`relative min-h-40 rounded-lg border-2 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                  isComplete ? "border-emerald-600 bg-emerald-50" : isActive ? "border-amber-500 bg-amber-50" : "border-slate-200 bg-white"
                }`}
                onClick={() => onSelectPhase(phase.number)}
                aria-label={`Open Phase ${phase.number}: ${phase.title}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-lg ${isComplete ? "bg-emerald-700 text-white" : isActive ? "bg-amber-500 text-slate-950" : "bg-slate-100 text-slate-500"}`}>
                    {isComplete ? <Check size={20} aria-hidden="true" /> : <Icon size={20} aria-hidden="true" />}
                  </span>
                  <span className="text-xs font-bold text-slate-500">PHASE {phase.number}</span>
                </div>
                <strong className="mt-3 block text-base leading-5 text-slate-950">{phase.title}</strong>
                <span className="mt-1 block text-xs leading-4 text-slate-500">{phase.detail}</span>
                <span className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                  <CircleDot size={14} className={isComplete ? "text-emerald-700" : isActive ? "text-amber-600" : "text-slate-400"} aria-hidden="true" />
                  {completedMissions[index]} of {totalMissions[index]} missions
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <ClientProjectImpactWidget />
    </section>
  );
}

function Metric({ icon: Icon, label, value, detail, accent = false, onClick }: { icon: typeof ClipboardCheck; label: string; value: string; detail: string; accent?: boolean; onClick?: () => void }) {
  const content = <><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500"><Icon size={16} className={accent ? "text-emerald-700" : "text-slate-500"} aria-hidden="true" />{label}</div><strong className={`mt-2 block text-lg ${accent ? "text-emerald-700" : "text-slate-950"}`}>{value}</strong><span className="mt-1 block text-xs text-slate-500">{detail}</span></>;
  return onClick ? <button className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-600 hover:shadow-sm" onClick={onClick}>{content}</button> : (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      {content}
    </div>
  );
}
