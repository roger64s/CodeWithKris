import { useEffect, useState } from "react";
import { ArrowRight, Bot, Check, CircleDollarSign, ClipboardCheck, Plus, RefreshCw, Save, Scale, ShieldCheck, Sparkles, Target, Users } from "lucide-react";
import { supabase } from "../supabase";
import { DepartmentResponsibilityMap } from "./DepartmentResponsibilityMap";

type Stage = "discovery" | "scope_and_funding" | "assessment_and_matching" | "delivery" | "quality_and_acceptance" | "billing_and_distribution" | "improvement" | "closed";
type Plan = { workspace_id: string; stage: Stage; scope_summary: string; marketing_brief: string; currency: string; budget_amount: number; prefunded_amount: number; contributor_reserve_percent: number; overhead_percent: number; department_percent: number; planned_start: string | null; planned_end: string | null; approved_by: string | null; approved_at: string | null };
type Milestone = { id: string; workspace_id: string; title: string; acceptance_criteria: string; due_date: string | null; budget_amount: number; funded_amount: number; status: string; sort_order: number };
type Assessment = { id: string; decision: string; reviewed_at: string | null };
type Review = { id: string; outcome: string; review_type: string; rework_hours: number; quality_score: number | null };
type Impact = { pwd_participants: number; women_carer_participants: number; student_participants: number; mentor_hours: number; paid_contributor_hours: number; accepted_outputs: number };
type PdcaCycle = { id: string; title: string; status: string; due_date: string | null };
type EquityContribution = { contributor_id: string; logged_hours: number | null; weighted_units: number | null; status: string };

const stages: { key: Stage; label: string }[] = [
  { key: "discovery", label: "Market" }, { key: "scope_and_funding", label: "Scope & fund" },
  { key: "assessment_and_matching", label: "Assess & match" }, { key: "delivery", label: "Deliver" },
  { key: "quality_and_acceptance", label: "Quality" }, { key: "billing_and_distribution", label: "Distribute" },
  { key: "improvement", label: "Improve" }, { key: "closed", label: "Closed" },
];

const previewPlan: Plan = { workspace_id: "preview-workspace", stage: "delivery", scope_summary: "Deliver an accessible learning platform through mentored cooperative sprints.", marketing_brief: "Reach inclusive employers and community partners with evidence-backed outcomes.", currency: "HKD", budget_amount: 120000, prefunded_amount: 72000, contributor_reserve_percent: 60, department_percent: 20, overhead_percent: 20, planned_start: "2026-09-01", planned_end: "2026-11-30", approved_by: "preview-user", approved_at: new Date().toISOString() };
const previewMilestones: Milestone[] = [
  { id: "ops-ms-1", workspace_id: "preview-workspace", title: "Accessible prototype", acceptance_criteria: "Keyboard and screen-reader journeys pass quality review.", due_date: "2026-09-30", budget_amount: 40000, funded_amount: 40000, status: "accepted", sort_order: 0 },
  { id: "ops-ms-2", workspace_id: "preview-workspace", title: "Mentored pilot", acceptance_criteria: "Client accepts tested pilot outputs and impact evidence.", due_date: "2026-10-31", budget_amount: 50000, funded_amount: 32000, status: "in_delivery", sort_order: 1 },
];
const previewAssessments: Assessment[] = [{ id: "a1", decision: "matched", reviewed_at: new Date().toISOString() }, { id: "a2", decision: "shortlisted", reviewed_at: new Date().toISOString() }, { id: "a3", decision: "pending", reviewed_at: null }];
const previewReviews: Review[] = [{ id: "r1", outcome: "approved", review_type: "quality_gate", rework_hours: 2, quality_score: 92 }, { id: "r2", outcome: "rework_required", review_type: "mentor", rework_hours: 4, quality_score: 78 }];
const previewImpact: Impact = { pwd_participants: 2, women_carer_participants: 3, student_participants: 4, mentor_hours: 28, paid_contributor_hours: 146, accepted_outputs: 7 };
const previewCycles: PdcaCycle[] = [{ id: "p1", title: "Reduce review turnaround", status: "check", due_date: "2026-10-10" }];

export function ProjectOperations({ workspaceId, canEdit, preview, onOpenCoopEquity }: { workspaceId: string; canEdit: boolean; preview: boolean; onOpenCoopEquity: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(preview ? previewPlan : null);
  const [milestones, setMilestones] = useState<Milestone[]>(preview ? previewMilestones : []);
  const [assessments, setAssessments] = useState<Assessment[]>(preview ? previewAssessments : []);
  const [reviews, setReviews] = useState<Review[]>(preview ? previewReviews : []);
  const [impact, setImpact] = useState<Impact | null>(preview ? previewImpact : null);
  const [cycles, setCycles] = useState<PdcaCycle[]>(preview ? previewCycles : []);
  const [equityContributions, setEquityContributions] = useState<EquityContribution[]>(preview ? [
    { contributor_id: "preview-contributor-1", logged_hours: 84, weighted_units: 100.8, status: "verified" },
    { contributor_id: "preview-contributor-2", logged_hours: 62, weighted_units: 93, status: "valued" },
  ] : []);
  const [newMilestone, setNewMilestone] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (preview || !supabase) return;
    const client = supabase;
    const load = async () => {
      const [planResult, milestoneResult, assessmentResult, reviewResult, impactResult, cycleResult, equityResult] = await Promise.all([
        client.from("project_operating_plans").select("*").eq("workspace_id", workspaceId).maybeSingle(),
        client.from("project_operating_milestones").select("*").eq("workspace_id", workspaceId).order("sort_order"),
        client.from("project_candidate_assessments").select("id,decision,reviewed_at").eq("workspace_id", workspaceId),
        client.from("project_delivery_reviews").select("id,outcome,review_type,rework_hours,quality_score").eq("workspace_id", workspaceId),
        client.from("project_impact_measures").select("pwd_participants,women_carer_participants,student_participants,mentor_hours,paid_contributor_hours,accepted_outputs").eq("workspace_id", workspaceId).order("measured_on", { ascending: false }).limit(1).maybeSingle(),
        client.from("project_pdca_cycles").select("id,title,status,due_date").eq("workspace_id", workspaceId).neq("status", "closed").order("created_at", { ascending: false }),
        client.from("contribution_records").select("contributor_id,logged_hours,weighted_units,status").eq("workspace_id", workspaceId),
      ]);
      if (planResult.error) return setNotice("Apply project_operations.sql to enable operations governance.");
      setPlan(planResult.data as Plan | null); setMilestones((milestoneResult.data || []) as Milestone[]);
      setAssessments((assessmentResult.data || []) as Assessment[]); setReviews((reviewResult.data || []) as Review[]);
      setImpact(impactResult.data as Impact | null); setCycles((cycleResult.data || []) as PdcaCycle[]); setNotice("");
      setEquityContributions((equityResult.data || []) as EquityContribution[]);
    };
    void load();
  }, [preview, workspaceId]);

  async function savePlan() {
    if (!plan || !canEdit) return;
    if (preview || !supabase) return setNotice("Preview changes saved locally.");
    const { error } = await supabase.from("project_operating_plans").upsert({ ...plan, workspace_id: workspaceId, updated_at: new Date().toISOString() });
    setNotice(error?.message || "Operating plan saved.");
  }

  async function approvePlan() {
    if (!plan || !canEdit) return;
    const approvedAt = new Date().toISOString();
    if (preview || !supabase) { setPlan({ ...plan, approved_by: "preview-user", approved_at: approvedAt }); return setNotice("Scope and funding approved in preview."); }
    const { data: userResult } = await supabase.auth.getUser();
    if (!userResult.user) return setNotice("Sign in before approving the operating plan.");
    const approvedPlan = { ...plan, approved_by: userResult.user.id, approved_at: approvedAt, updated_at: approvedAt };
    const { error } = await supabase.from("project_operating_plans").upsert(approvedPlan);
    if (!error) setPlan(approvedPlan);
    setNotice(error?.message || "Scope and funding approved.");
  }

  async function createPlan() {
    const draft: Plan = { ...previewPlan, workspace_id: workspaceId, stage: "discovery", scope_summary: "", marketing_brief: "", budget_amount: 0, prefunded_amount: 0, approved_by: null, approved_at: null };
    setPlan(draft);
    if (!preview && supabase) { const { error } = await supabase.from("project_operating_plans").insert(draft); setNotice(error?.message || "Operating plan created."); }
  }

  async function addMilestone() {
    if (!newMilestone.trim() || !canEdit) return;
    const draft = { workspace_id: workspaceId, title: newMilestone.trim(), acceptance_criteria: "", budget_amount: 0, funded_amount: 0, status: "planned", sort_order: milestones.length };
    if (preview || !supabase) setMilestones((current) => [...current, { ...draft, id: crypto.randomUUID(), due_date: null }]);
    else { const { data, error } = await supabase.from("project_operating_milestones").insert(draft).select("*").single(); if (error) return setNotice(error.message); setMilestones((current) => [...current, data as Milestone]); }
    setNewMilestone("");
  }

  const stageIndex = plan ? stages.findIndex((stage) => stage.key === plan.stage) : 0;
  const fundedPercent = plan?.budget_amount ? Math.round(plan.prefunded_amount / plan.budget_amount * 100) : 0;
  const qualityScores = reviews.flatMap((review) => review.quality_score === null ? [] : [review.quality_score]);
  const averageQuality = qualityScores.length ? Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length) : 0;
  const approvedEquity = equityContributions.filter((item) => item.status === "valued" || item.status === "verified");
  const equityHours = approvedEquity.reduce((sum, item) => sum + Number(item.logged_hours || 0), 0);
  const equityUnits = approvedEquity.reduce((sum, item) => sum + Number(item.weighted_units || 0), 0);

  if (!plan) return <div className="operations-empty"><Target size={32} /><h2>Set up project operations</h2><p>Connect scope, funding, inclusive matching, delivery quality, distribution, and improvement to this Client Project.</p><button onClick={() => void createPlan()} disabled={!canEdit}><Plus size={16} /> Create operating plan</button><small>{notice}</small></div>;

  return <div className="operations-view">
    <section className="operations-stage" aria-label="Project operating stage">{stages.map((stage, index) => <div key={stage.key} className={index < stageIndex ? "complete" : index === stageIndex ? "current" : ""}><span>{index < stageIndex ? <Check size={13} /> : index + 1}</span><small>{stage.label}</small>{index < stages.length - 1 && <ArrowRight size={12} />}</div>)}</section>
    <div className="operations-grid">
      <section className="operations-panel operations-plan"><header><div><span>Commercial foundation</span><h2>Scope, funding & timeline</h2></div><div className="operations-header-actions">{!plan.approved_at && <button title="Approve scope and funding" onClick={() => void approvePlan()} disabled={!canEdit || !plan.scope_summary.trim() || plan.prefunded_amount <= 0}><ShieldCheck size={16} /></button>}<button title="Save operating plan" onClick={() => void savePlan()} disabled={!canEdit}><Save size={16} /></button></div></header><textarea value={plan.scope_summary} readOnly={!canEdit} placeholder="Approved project scope and outcomes" onChange={(event) => setPlan({ ...plan, scope_summary: event.target.value, approved_by: null, approved_at: null })} /><div className="operations-fields"><label>Stage<select value={plan.stage} disabled={!canEdit} onChange={(event) => setPlan({ ...plan, stage: event.target.value as Stage })}>{stages.filter((_, index) => index === stageIndex || index === stageIndex + 1).map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></label><label>Budget<input type="number" min="0" value={plan.budget_amount} readOnly={!canEdit} onChange={(event) => setPlan({ ...plan, budget_amount: Number(event.target.value), approved_by: null, approved_at: null })} /></label><label>Prefunded<input type="number" min="0" max={plan.budget_amount} value={plan.prefunded_amount} readOnly={!canEdit} onChange={(event) => setPlan({ ...plan, prefunded_amount: Number(event.target.value), approved_by: null, approved_at: null })} /></label></div><div className="funding-meter"><span style={{ width: `${Math.min(fundedPercent, 100)}%` }} /><strong>{fundedPercent}% funded</strong></div><div className="allocation-strip"><span>Contributors <strong>{plan.contributor_reserve_percent}% protected</strong></span><span>Departments <strong>{plan.department_percent}%</strong></span><span>Overhead <strong>{plan.overhead_percent}%</strong></span></div></section>
      <DepartmentResponsibilityMap key={workspaceId} workspaceId={workspaceId} canEdit={canEdit} preview={preview} />
      <section className="operations-panel"><header><div><span>Work breakdown</span><h2>Funded milestones</h2></div><CircleDollarSign size={18} /></header><div className="milestone-list">{milestones.map((milestone) => <article key={milestone.id}><span className={`ops-status ${milestone.status}`}>{milestone.status.replaceAll("_", " ")}</span><strong>{milestone.title}</strong><small>{milestone.acceptance_criteria || "Acceptance criteria pending"}</small><div><span>{plan.currency} {milestone.funded_amount.toLocaleString()} funded</span><span>{milestone.due_date || "No due date"}</span></div></article>)}{!milestones.length && <p>No milestones yet.</p>}</div><div className="operations-add"><input value={newMilestone} onChange={(event) => setNewMilestone(event.target.value)} placeholder="New milestone" /><button title="Add milestone" onClick={() => void addMilestone()} disabled={!canEdit || !newMilestone.trim()}><Plus size={16} /></button></div></section>
      <section className="operations-panel"><header><div><span>Inclusive talent</span><h2>Human-reviewed matching</h2></div><Users size={18} /></header><div className="operations-metrics"><div><strong>{assessments.length}</strong><span>assessed</span></div><div><strong>{assessments.filter((item) => item.decision === "matched").length}</strong><span>matched</span></div><div><strong>{assessments.filter((item) => item.reviewed_at).length}</strong><span>human reviewed</span></div></div><div className="ai-governance"><Bot size={17} /><span>AI recommends skills fit and support needs. A person approves every assignment.</span></div></section>
      <section className="operations-panel"><header><div><span>Delivery control</span><h2>Quality & rework</h2></div><ClipboardCheck size={18} /></header><div className="operations-metrics"><div><strong>{averageQuality || "-"}</strong><span>quality score</span></div><div><strong>{reviews.filter((review) => review.outcome === "approved").length}</strong><span>gates passed</span></div><div><strong>{reviews.reduce((sum, review) => sum + Number(review.rework_hours), 0)}</strong><span>rework hours</span></div></div><p className="operations-note"><ShieldCheck size={15} /> Task review and client milestone acceptance remain separate gates.</p></section>
      <section className="operations-panel"><header><div><span>Social value</span><h2>Participation & outcomes</h2></div><Sparkles size={18} /></header><div className="impact-grid"><div><strong>{(impact?.pwd_participants || 0) + (impact?.women_carer_participants || 0) + (impact?.student_participants || 0)}</strong><span>inclusive participants</span></div><div><strong>{impact?.mentor_hours || 0}</strong><span>mentor hours</span></div><div><strong>{impact?.paid_contributor_hours || 0}</strong><span>paid hours</span></div><div><strong>{impact?.accepted_outputs || 0}</strong><span>accepted outputs</span></div></div></section>
      <section className="operations-panel"><header><div><span>Continuous improvement</span><h2>PDCA actions</h2></div><RefreshCw size={18} /></header><div className="pdca-list">{cycles.map((cycle) => <article key={cycle.id}><span>{cycle.status}</span><strong>{cycle.title}</strong><small>{cycle.due_date ? `Due ${cycle.due_date}` : "No due date"}</small></article>)}{!cycles.length && <p>No active improvement cycle.</p>}</div><small className="operations-notice">{notice}</small></section>
      <section className="operations-panel operations-equity"><header><div><span>Cooperative ownership</span><h2>Coop Equity</h2></div><Scale size={18} /></header><div className="operations-metrics"><div><strong>{new Set(approvedEquity.map((item) => item.contributor_id)).size}</strong><span>contributors</span></div><div><strong>{equityHours}</strong><span>approved hours</span></div><div><strong>{equityUnits}</strong><span>weighted units</span></div></div><div className="equity-actions"><p>Approved project effort flows into the cooperative contribution ledger and lifecycle activity.</p><button onClick={onOpenCoopEquity}><Scale size={15} /> Open Coop Equity</button></div></section>
    </div>
  </div>;
}