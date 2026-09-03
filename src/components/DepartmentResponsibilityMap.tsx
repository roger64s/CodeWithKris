import { useEffect, useState } from "react";
import { Building2, Save } from "lucide-react";
import { supabase } from "../supabase";
import { DEPARTMENT_ALLOCATIONS, type DepartmentCategory } from "../lib/sweatEquity";

type ResponsibilitySide = "local_partner" | "foreign_client" | "shared";
type DepartmentResponsibility = {
  workspace_id: string;
  department_category: DepartmentCategory;
  allocation_percent: number;
  responsibility_side: ResponsibilitySide;
  local_partner_tasks: string[];
  foreign_client_tasks: string[];
};

const sideLabels: Record<ResponsibilitySide, string> = {
  local_partner: "Local partner",
  foreign_client: "Foreign client",
  shared: "Shared",
};

const defaultScopes: Record<DepartmentCategory, Omit<DepartmentResponsibility, "workspace_id" | "department_category" | "allocation_percent">> = {
  Management: { responsibility_side: "foreign_client", local_partner_tasks: ["Coordinate local stakeholders"], foreign_client_tasks: ["Contract execution", "Commercial governance"] },
  Delivery: { responsibility_side: "foreign_client", local_partner_tasks: ["Coordinate local delivery"], foreign_client_tasks: ["Core demo environment", "Technical escalation"] },
  "Finance & Admin": { responsibility_side: "foreign_client", local_partner_tasks: ["Submit local expense evidence"], foreign_client_tasks: ["Final pricing", "Invoicing and contract administration"] },
  "Sales & Marketing": { responsibility_side: "local_partner", local_partner_tasks: ["Discovery", "Lead generation", "Local-language outreach"], foreign_client_tasks: ["Approve positioning", "Review qualified opportunities"] },
  "Customer Service": { responsibility_side: "local_partner", local_partner_tasks: ["Tier-1 support", "Issue triage"], foreign_client_tasks: ["Product resolution", "Technical escalation support"] },
  Profit: { responsibility_side: "shared", local_partner_tasks: ["Partner revenue reconciliation"], foreign_client_tasks: ["Client acceptance", "Revenue authorization"] },
};

const createDefaults = (workspaceId: string): DepartmentResponsibility[] =>
  (Object.entries(DEPARTMENT_ALLOCATIONS) as [DepartmentCategory, number][]).map(([department, allocation]) => ({
    workspace_id: workspaceId,
    department_category: department,
    allocation_percent: allocation,
    ...defaultScopes[department],
  }));

export function DepartmentResponsibilityMap({ workspaceId, canEdit, preview }: { workspaceId: string; canEdit: boolean; preview: boolean }) {
  const [mappings, setMappings] = useState<DepartmentResponsibility[]>(() => createDefaults(workspaceId));
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (preview || !supabase) return;
    supabase.from("project_department_responsibilities").select("*").eq("workspace_id", workspaceId).order("allocation_percent", { ascending: false }).then(({ data, error }) => {
      if (data?.length) setMappings(data as DepartmentResponsibility[]);
      if (error) setNotice("Apply hybrid_partner_workflow.sql to enable department responsibility mapping.");
    });
  }, [preview, workspaceId]);

  async function saveMappings() {
    if (!canEdit) return;
    if (preview || !supabase) return setNotice("Department responsibilities saved in preview.");
    const payload = mappings.map((mapping) => ({
      departmentCategory: mapping.department_category,
      allocationPercent: mapping.allocation_percent,
      responsibilitySide: mapping.responsibility_side,
    }));
    const { data, error } = await supabase.rpc("save_project_department_map", { workspace_id_input: workspaceId, mappings_input: payload });
    if (error) return setNotice(error.message);
    if (data) setMappings(data as DepartmentResponsibility[]);
    setNotice("Department responsibility map saved.");
  }

  return <section className="operations-panel department-map">
    <header><div><span>Hybrid operating model</span><h2>Department responsibilities</h2></div><button title="Save department responsibilities" onClick={() => void saveMappings()} disabled={!canEdit}><Save size={16} /></button></header>
    <p className="department-map-intro"><Building2 size={15} /> Existing department allocations now route work to the responsible business party.</p>
    <div className="department-map-list">{mappings.map((mapping) => <article key={mapping.department_category}>
      <div className="department-map-heading"><div><strong>{mapping.department_category}</strong><span>{mapping.allocation_percent}% allocation</span></div><select aria-label={`${mapping.department_category} primary responsibility`} value={mapping.responsibility_side} disabled={!canEdit} onChange={(event) => setMappings((current) => current.map((item) => item.department_category === mapping.department_category ? { ...item, responsibility_side: event.target.value as ResponsibilitySide } : item))}>{Object.entries(sideLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      <div className="department-scope"><div><span>Local partner</span><p>{mapping.local_partner_tasks.join(" · ")}</p></div><div><span>Foreign client</span><p>{mapping.foreign_client_tasks.join(" · ")}</p></div></div>
    </article>)}</div>
    {notice && <small className="operations-notice">{notice}</small>}
  </section>;
}
