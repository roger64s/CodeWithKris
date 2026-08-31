import { useEffect, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, Clock3, HandCoins, RefreshCw, UsersRound } from "lucide-react";
import { supabase } from "../supabase";

type ImpactSnapshot = {
  active_client_projects: number;
  revenue_reinvested: number;
  currency: string;
  member_owner_hours: number;
  accepted_outputs: number;
  reporting_period: string;
  published_at: string;
};

const emptySnapshot: ImpactSnapshot = {
  active_client_projects: 0,
  revenue_reinvested: 0,
  currency: "USD",
  member_owner_hours: 0,
  accepted_outputs: 0,
  reporting_period: "Awaiting first published snapshot",
  published_at: "",
};

export function ClientProjectImpactWidget() {
  const [snapshot, setSnapshot] = useState<ImpactSnapshot>(emptySnapshot);
  const [status, setStatus] = useState<"loading" | "live" | "unavailable">(() => supabase ? "loading" : "unavailable");

  useEffect(() => {
    if (!supabase) return;

    supabase
      .from("cooperative_impact_snapshots")
      .select("active_client_projects,revenue_reinvested,currency,member_owner_hours,accepted_outputs,reporting_period,published_at")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setStatus("unavailable");
          return;
        }
        setSnapshot(data as ImpactSnapshot);
        setStatus("live");
      });
  }, []);

  const money = new Intl.NumberFormat("en", {
    style: "currency",
    currency: snapshot.currency,
    maximumFractionDigits: 0,
  }).format(snapshot.revenue_reinvested);
  const lastUpdated = snapshot.published_at
    ? new Date(snapshot.published_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : snapshot.reporting_period;

  return (
    <section className="client-impact-widget grid gap-2 rounded-lg border border-slate-700 bg-slate-950 p-3 text-white sm:grid-cols-2 md:grid-cols-[1.25fr_repeat(4,1fr)]" aria-labelledby="client-impact-title">
      <div className="sm:col-span-2 md:col-span-1">
        <h2 id="client-impact-title" className="text-base font-bold text-white">Client Project Impact</h2>
        <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold ${status === "live" ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-800 text-slate-300"}`}>
          <RefreshCw size={12} className={status === "loading" ? "animate-spin" : ""} aria-hidden="true" />
          {status === "loading" ? "Loading" : status === "live" ? `Live · ${lastUpdated}` : "No snapshot published"}
        </span>
        <span className="mt-2 block text-[11px] leading-4 text-slate-400"><UsersRound size={12} className="mr-1 inline" aria-hidden="true" />Collective success, not course purchases.</span>
      </div>

      <div className="contents" aria-label="Collective cooperative metrics">
        <ImpactMetric icon={BriefcaseBusiness} value={snapshot.active_client_projects.toLocaleString()} label="Active client projects" />
        <ImpactMetric icon={HandCoins} value={money} label="Revenue reinvested" detail="Training and members" />
        <ImpactMetric icon={Clock3} value={snapshot.member_owner_hours.toLocaleString()} label="Member-owner hours" />
        <ImpactMetric icon={CheckCircle2} value={snapshot.accepted_outputs.toLocaleString()} label="Accepted outputs" />
      </div>
    </section>
  );
}

function ImpactMetric({ icon: Icon, value, label, detail }: { icon: typeof Clock3; value: string; label: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-2.5">
      <div className="flex items-center justify-between gap-2"><Icon size={16} className="text-emerald-400" aria-hidden="true" /><span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Collective</span></div>
      <strong className="mt-1.5 block text-lg text-white">{value}</strong>
      <span className="mt-1 block text-xs font-bold text-slate-300">{label}</span>
      {detail && <span className="mt-0.5 block text-[11px] text-slate-500">{detail}</span>}
    </div>
  );
}