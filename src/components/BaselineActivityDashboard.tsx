import { useEffect, useRef, useState, type FormEvent } from "react";
import { Activity, ArrowRight, BarChart3, Boxes, CheckCircle2, Code2, Columns3, FileClock, GitCompareArrows, History, Plus, RefreshCw, RotateCcw, Timer, Users, X } from "lucide-react";
import { supabase } from "../supabase";
import "./BaselineActivityDashboard.css";

type Workspace = { id: string; name: string };
type Release = { id: string; name: string; release_number: number; status: string };
type User = { user_id: string; display_name: string; access_role: string };
type Baseline = { id: string; workspace_id: string; release_id: string; version: number; name: string; milestone_label: string; entity_counts: Record<string, number>; created_by: string; created_at: string };
type Difference = { category: string; item_key: string; change_type: "added" | "changed" | "removed"; item_title: string; field_changes: Record<string, { before: unknown; after: unknown }>; before_value: Record<string, unknown> | null; after_value: Record<string, unknown> | null };
type ActivityEvent = { id: number; workspace_id: string; actor_user_id: string | null; event_type: string; entity_type: string; entity_id: string; title: string; effort_hours: number; loc_added: number; loc_removed: number; rework_count: number; quality_score: number | null; metadata: Record<string, unknown>; occurred_at: string };
type ActivitySummary = { actor_user_id: string | null; event_count: number; effort_hours: number; loc_added: number; loc_removed: number; rework_count: number; quality_event_count: number; average_quality: number | null };
type View = "baselines" | "compare" | "activity";

const previewWorkspace: Workspace = { id: "preview-workspace", name: "Accessible Learning Platform" };
const previewReleases: Release[] = [{ id: "release-1", name: "Release 1", release_number: 1, status: "active" }, { id: "release-2", name: "Release 2", release_number: 2, status: "planned" }];
const previewUsers: User[] = [{ user_id: "owner", display_name: "Roger S.", access_role: "owner" }, { user_id: "developer", display_name: "Maya Chen", access_role: "editor" }, { user_id: "tester", display_name: "Alex Morgan", access_role: "editor" }];
const now = Date.now();
const previewBaselines: Baseline[] = [
  { id: "base-2", workspace_id: previewWorkspace.id, release_id: "release-1", version: 2, name: "Release candidate", milestone_label: "RC approval", entity_counts: { folders: 12, requirements: 18, tasks: 14, test_cases: 9, test_steps: 31, issues: 2 }, created_by: "owner", created_at: new Date(now - 3_600_000).toISOString() },
  { id: "base-1", workspace_id: previewWorkspace.id, release_id: "release-1", version: 1, name: "Feature complete", milestone_label: "Scope freeze", entity_counts: { folders: 12, requirements: 16, tasks: 12, test_cases: 7, test_steps: 24, issues: 1 }, created_by: "owner", created_at: new Date(now - 86_400_000).toISOString() },
];
const previewDifferences: Difference[] = [
  { category: "requirements", item_key: "story-4", change_type: "added", item_title: "Review evidence from failed test", field_changes: { title: { before: null, after: "Review evidence from failed test" }, status: { before: null, after: "approved" } }, before_value: null, after_value: {} },
  { category: "tasks", item_key: "task-2", change_type: "changed", item_title: "Map task allocation to members", field_changes: { workflow_status: { before: "in_progress", after: "done" }, approved_at: { before: null, after: "2026-09-02T08:30:00Z" } }, before_value: {}, after_value: {} },
  { category: "test_steps", item_key: "step-7", change_type: "changed", item_title: "Submit the task for review", field_changes: { expected_result: { before: "Reviewer sees task", after: "Assigned reviewer can approve once" }, notes: { before: "", after: "Verify audit event" } }, before_value: {}, after_value: {} },
  { category: "issues", item_key: "issue-1", change_type: "removed", item_title: "Duplicate approval event", field_changes: { status: { before: "open", after: null } }, before_value: {}, after_value: null },
];
const previewEvents: ActivityEvent[] = [
  { id: 6, workspace_id: previewWorkspace.id, actor_user_id: "developer", event_type: "contribution_recorded", entity_type: "contribution", entity_id: "c-1", title: "Baseline snapshot implementation", effort_hours: 6.5, loc_added: 428, loc_removed: 77, rework_count: 1, quality_score: 91, metadata: {}, occurred_at: new Date(now - 900_000).toISOString() },
  { id: 5, workspace_id: previewWorkspace.id, actor_user_id: "tester", event_type: "test_executed", entity_type: "test_run_step", entity_id: "step-8", title: "Validate failure evidence workflow", effort_hours: 2, loc_added: 0, loc_removed: 0, rework_count: 0, quality_score: 100, metadata: { outcome: "passed" }, occurred_at: new Date(now - 2_700_000).toISOString() },
  { id: 4, workspace_id: previewWorkspace.id, actor_user_id: "owner", event_type: "baseline_created", entity_type: "release_baseline", entity_id: "base-2", title: "Release candidate", effort_hours: 0, loc_added: 0, loc_removed: 0, rework_count: 0, quality_score: null, metadata: { version: 2 }, occurred_at: new Date(now - 3_600_000).toISOString() },
  { id: 3, workspace_id: previewWorkspace.id, actor_user_id: "developer", event_type: "reopened", entity_type: "sprint_task", entity_id: "task-2", title: "Map task allocation to members", effort_hours: 1.5, loc_added: 38, loc_removed: 21, rework_count: 1, quality_score: 84, metadata: {}, occurred_at: new Date(now - 7_200_000).toISOString() },
  { id: 2, workspace_id: previewWorkspace.id, actor_user_id: "tester", event_type: "issue_created", entity_type: "quality_issue", entity_id: "issue-2", title: "Thermal variant blocks completion", effort_hours: 1, loc_added: 0, loc_removed: 0, rework_count: 1, quality_score: 72, metadata: {}, occurred_at: new Date(now - 10_800_000).toISOString() },
];
const isPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "baselines";

const formatValue = (value: unknown) => value == null ? "-" : typeof value === "object" ? JSON.stringify(value) : String(value);
const eventLabel = (value: string) => value.replaceAll("_", " ");
const summarizeEvents = (items: ActivityEvent[]): ActivitySummary[] => [...new Set(items.map((item) => item.actor_user_id))].map((actorUserId) => {
  const owned = items.filter((item) => item.actor_user_id === actorUserId); const scored = owned.filter((item) => item.quality_score != null);
  return { actor_user_id: actorUserId, event_count: owned.length, effort_hours: owned.reduce((sum, item) => sum + Number(item.effort_hours), 0), loc_added: owned.reduce((sum, item) => sum + item.loc_added, 0), loc_removed: owned.reduce((sum, item) => sum + item.loc_removed, 0), rework_count: owned.reduce((sum, item) => sum + item.rework_count, 0), quality_event_count: scored.length, average_quality: scored.length ? scored.reduce((sum, item) => sum + Number(item.quality_score), 0) / scored.length : null };
});
const addEventToSummaries = (summaries: ActivitySummary[], event: ActivityEvent): ActivitySummary[] => {
  const existing = summaries.find((item) => item.actor_user_id === event.actor_user_id);
  if (!existing) return [...summaries, summarizeEvents([event])[0]];
  const qualityEventCount = existing.quality_event_count + (event.quality_score == null ? 0 : 1);
  return summaries.map((item) => item !== existing ? item : { ...item, event_count: item.event_count + 1, effort_hours: item.effort_hours + Number(event.effort_hours), loc_added: item.loc_added + event.loc_added, loc_removed: item.loc_removed + event.loc_removed, rework_count: item.rework_count + event.rework_count, quality_event_count: qualityEventCount, average_quality: event.quality_score == null ? item.average_quality : ((item.average_quality || 0) * item.quality_event_count + Number(event.quality_score)) / qualityEventCount });
};

export function BaselineActivityDashboard() {
  const [view, setView] = useState<View>("baselines");
  const [workspaces, setWorkspaces] = useState<Workspace[]>(isPreview ? [previewWorkspace] : []);
  const [workspaceId, setWorkspaceId] = useState(isPreview ? previewWorkspace.id : "");
  const [releases, setReleases] = useState<Release[]>(isPreview ? previewReleases : []);
  const [users, setUsers] = useState<User[]>(isPreview ? previewUsers : []);
  const [baselines, setBaselines] = useState<Baseline[]>(isPreview ? previewBaselines : []);
  const [differences, setDifferences] = useState<Difference[]>(isPreview ? previewDifferences : []);
  const [events, setEvents] = useState<ActivityEvent[]>(isPreview ? previewEvents : []);
  const [summaries, setSummaries] = useState<ActivitySummary[]>(isPreview ? summarizeEvents(previewEvents) : []);
  const [leftBaselineId, setLeftBaselineId] = useState(isPreview ? "base-1" : "");
  const [rightBaselineId, setRightBaselineId] = useState(isPreview ? "base-2" : "");
  const [selectedDifference, setSelectedDifference] = useState<Difference | null>(isPreview ? previewDifferences[0] : null);
  const [showBaselineForm, setShowBaselineForm] = useState(false);
  const [showContributionForm, setShowContributionForm] = useState(false);
  const [notice, setNotice] = useState(isPreview ? "Lifecycle preview" : "Loading lifecycle state...");
  const loadSequence = useRef(0);
  const activeWorkspaceId = useRef(workspaceId);

  async function loadWorkspace(id: string) {
    if (!supabase || !id || isPreview) return;
    const requestId = ++loadSequence.current;
    const [releaseResult, baselineResult, activityResult, directoryResult, summaryResult] = await Promise.all([
      supabase.from("planning_releases").select("id,name,release_number,status").eq("workspace_id", id).order("release_number"),
      supabase.from("release_baselines").select("id,workspace_id,release_id,version,name,milestone_label,entity_counts,created_by,created_at").eq("workspace_id", id).order("created_at", { ascending: false }),
      supabase.from("workspace_activity_events").select("*").eq("workspace_id", id).order("occurred_at", { ascending: false }).limit(200),
      supabase.rpc("requirement_workspace_user_directory", { workspace_id_input: id }),
      supabase.rpc("workspace_activity_summary", { workspace_id_input: id }),
    ]);
    if (requestId !== loadSequence.current) return;
    const error = releaseResult.error || baselineResult.error || activityResult.error || directoryResult.error || summaryResult.error;
    if (error) return setNotice("Apply the Phase 5 Supabase migration to enable baselines and activity.");
    const loadedBaselines = (baselineResult.data || []) as Baseline[];
    setReleases((releaseResult.data || []) as Release[]); setBaselines(loadedBaselines); setEvents((activityResult.data || []) as ActivityEvent[]); setUsers((directoryResult.data || []) as User[]);
    setSummaries(((summaryResult.data || []) as ActivitySummary[]).map((item) => ({ ...item, event_count: Number(item.event_count), effort_hours: Number(item.effort_hours), loc_added: Number(item.loc_added), loc_removed: Number(item.loc_removed), rework_count: Number(item.rework_count), quality_event_count: Number(item.quality_event_count), average_quality: item.average_quality == null ? null : Number(item.average_quality) })));
    if (loadedBaselines.length >= 2) { setRightBaselineId(loadedBaselines[0].id); setLeftBaselineId(loadedBaselines[1].id); }
    setNotice("Lifecycle activity synchronized");
  }

  useEffect(() => {
    if (isPreview || !supabase) return;
    void supabase.from("requirement_workspaces").select("id,name").order("updated_at", { ascending: false }).then(({ data }) => {
      const loaded = (data || []) as Workspace[]; const initialId = loaded[0]?.id || ""; activeWorkspaceId.current = initialId; setWorkspaces(loaded); setWorkspaceId(initialId); void loadWorkspace(initialId);
    });
  }, []);

  useEffect(() => {
    if (isPreview || !supabase || !workspaceId) return;
    const client = supabase;
    const channel = client.channel(`workspace-activity:${workspaceId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "workspace_activity_events", filter: `workspace_id=eq.${workspaceId}` }, (payload) => {
      const changed = payload.new as ActivityEvent;
      if (changed.workspace_id !== activeWorkspaceId.current) return;
      setEvents((current) => [changed, ...current.filter((item) => item.id !== changed.id)].slice(0, 200));
      setSummaries((current) => addEventToSummaries(current, changed));
    }).on("postgres_changes", { event: "INSERT", schema: "public", table: "release_baselines", filter: `workspace_id=eq.${workspaceId}` }, (payload) => {
      const changed = payload.new as Baseline;
      if (changed.workspace_id !== activeWorkspaceId.current) return;
      setBaselines((current) => [changed, ...current.filter((item) => item.id !== changed.id)]);
    }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [workspaceId]);

  async function createBaseline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); const releaseId = String(values.get("releaseId") || "");
    if (isPreview || !supabase) {
      const version = Math.max(0, ...baselines.filter((item) => item.release_id === releaseId).map((item) => item.version)) + 1;
      const baseline: Baseline = { id: crypto.randomUUID(), workspace_id: workspaceId, release_id: releaseId, version, name: String(values.get("name")), milestone_label: String(values.get("milestone")), entity_counts: { folders: 12, requirements: 18, tasks: 14, test_cases: 9, test_steps: 31, issues: 2 }, created_by: "owner", created_at: new Date().toISOString() };
      const created: ActivityEvent = { id: Date.now(), workspace_id: workspaceId, actor_user_id: "owner", event_type: "baseline_created", entity_type: "release_baseline", entity_id: baseline.id, title: baseline.name, effort_hours: 0, loc_added: 0, loc_removed: 0, rework_count: 0, quality_score: null, metadata: { version }, occurred_at: baseline.created_at };
      setBaselines((current) => [baseline, ...current]); setEvents((current) => [created, ...current]); setSummaries((current) => addEventToSummaries(current, created));
    } else {
      const { error } = await supabase.rpc("create_release_baseline", { workspace_id_input: workspaceId, release_id_input: releaseId, name_input: String(values.get("name")), milestone_label_input: String(values.get("milestone")) });
      if (error) return setNotice(error.message); await loadWorkspace(workspaceId);
    }
    setShowBaselineForm(false); setNotice("Immutable release baseline created.");
  }

  async function compareBaselines() {
    if (!leftBaselineId || !rightBaselineId || leftBaselineId === rightBaselineId) return setNotice("Choose two different baselines.");
    if (isPreview || !supabase) { setDifferences(previewDifferences); setSelectedDifference(previewDifferences[0]); setView("compare"); return; }
    const { data, error } = await supabase.rpc("compare_release_baselines", { left_baseline_id_input: leftBaselineId, right_baseline_id_input: rightBaselineId });
    if (error) return setNotice(error.message); const rows = (data || []) as Difference[]; setDifferences(rows); setSelectedDifference(rows[0] || null); setView("compare"); setNotice(`${rows.length} lifecycle differences found.`);
  }

  async function recordContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const entry: Omit<ActivityEvent, "id" | "occurred_at"> = { workspace_id: workspaceId, actor_user_id: isPreview ? "developer" : null, event_type: "contribution_recorded", entity_type: "contribution", entity_id: crypto.randomUUID(), title: String(values.get("title")), effort_hours: Number(values.get("hours") || 0), loc_added: Number(values.get("locAdded") || 0), loc_removed: Number(values.get("locRemoved") || 0), rework_count: Number(values.get("rework") || 0), quality_score: values.get("quality") ? Number(values.get("quality")) : null, metadata: {} };
    if (isPreview || !supabase) { const created = { ...entry, id: Date.now(), occurred_at: new Date().toISOString() }; setEvents((current) => [created, ...current]); setSummaries((current) => addEventToSummaries(current, created)); }
    else { const { error } = await supabase.rpc("record_workspace_contribution", { workspace_id_input: workspaceId, title_input: entry.title, effort_hours_input: entry.effort_hours, loc_added_input: entry.loc_added, loc_removed_input: entry.loc_removed, rework_count_input: entry.rework_count, quality_score_input: entry.quality_score }); if (error) return setNotice(error.message); }
    setShowContributionForm(false); setNotice("Contribution metrics recorded.");
  }

  const contributorRows = users.map((user) => {
    const summary = summaries.find((item) => item.actor_user_id === user.user_id);
    return { ...user, events: summary?.event_count || 0, hours: summary?.effort_hours || 0, loc: (summary?.loc_added || 0) + (summary?.loc_removed || 0), rework: summary?.rework_count || 0, quality: summary?.average_quality == null ? null : Math.round(summary.average_quality) };
  }).sort((left, right) => right.hours - left.hours || right.loc - left.loc);
  const totalHours = summaries.reduce((sum, item) => sum + item.effort_hours, 0);
  const totalLocAdded = summaries.reduce((sum, item) => sum + item.loc_added, 0); const totalLocRemoved = summaries.reduce((sum, item) => sum + item.loc_removed, 0); const totalLoc = totalLocAdded + totalLocRemoved;
  const totalRework = summaries.reduce((sum, item) => sum + item.rework_count, 0);
  const totalEvents = summaries.reduce((sum, item) => sum + item.event_count, 0);
  const qualityEventCount = summaries.reduce((sum, item) => sum + item.quality_event_count, 0);
  const averageQuality = qualityEventCount ? Math.round(summaries.reduce((sum, item) => sum + (item.average_quality || 0) * item.quality_event_count, 0) / qualityEventCount) : null;
  const maxHours = Math.max(1, ...contributorRows.map((item) => item.hours));

  return <section className="lifecycle-module">
    <header className="lifecycle-header"><div><span>Governance & contribution</span><h1>Baselines & Activity</h1></div><div><button title="Record contribution" onClick={() => setShowContributionForm(true)}><Plus size={16} /> Contribution</button><button className="lifecycle-primary" title="Create release baseline" onClick={() => setShowBaselineForm(true)}><FileClock size={16} /> Baseline</button></div></header>
    <div className="lifecycle-toolbar"><select aria-label="Workspace" value={workspaceId} onChange={(event) => { loadSequence.current += 1; activeWorkspaceId.current = event.target.value; setWorkspaceId(event.target.value); setReleases([]); setBaselines([]); setEvents([]); setSummaries([]); setUsers([]); void loadWorkspace(event.target.value); }}><option value="" disabled>Select workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><span>{notice}</span><button title="Refresh workspace state" onClick={() => void loadWorkspace(workspaceId)}><RefreshCw size={15} /></button></div>
    <nav className="lifecycle-tabs" aria-label="Lifecycle dashboard views"><button className={view === "baselines" ? "active" : ""} onClick={() => setView("baselines")}><Boxes size={16} />Release Baselines<b>{baselines.length}</b></button><button className={view === "compare" ? "active" : ""} onClick={() => setView("compare")}><GitCompareArrows size={16} />Differences<b>{differences.length}</b></button><button className={view === "activity" ? "active" : ""} onClick={() => setView("activity")}><Activity size={16} />Activity Dashboard<b>{totalEvents}</b></button></nav>

    {view === "baselines" && <main className="baseline-view"><section className="baseline-summary"><div><History size={20} /><span>Latest frozen state</span><strong>{baselines[0] ? `v${baselines[0].version} · ${baselines[0].name}` : "No baseline"}</strong></div><div className="compare-control"><label>From<select value={leftBaselineId} onChange={(event) => setLeftBaselineId(event.target.value)}><option value="">Choose baseline</option>{baselines.map((item) => <option key={item.id} value={item.id}>v{item.version} · {item.name}</option>)}</select></label><ArrowRight size={17} /><label>To<select value={rightBaselineId} onChange={(event) => setRightBaselineId(event.target.value)}><option value="">Choose baseline</option>{baselines.map((item) => <option key={item.id} value={item.id}>v{item.version} · {item.name}</option>)}</select></label><button className="lifecycle-primary" onClick={() => void compareBaselines()}><Columns3 size={15} /> Compare</button></div></section><div className="baseline-list-heading"><span>Version</span><span>Milestone</span><span>Frozen state</span><span>Created</span></div>{baselines.map((baseline) => <article className="baseline-row" key={baseline.id}><div className="baseline-version"><b>v{baseline.version}</b><span>{releases.find((release) => release.id === baseline.release_id)?.name || "Release"}</span></div><div><strong>{baseline.name}</strong><small>{baseline.milestone_label || "Release milestone"}</small></div><div className="count-strip">{Object.entries(baseline.entity_counts).slice(0, 6).map(([key, value]) => <span key={key}><b>{value}</b>{key.replace("_", " ")}</span>)}</div><time>{new Date(baseline.created_at).toLocaleString()}</time></article>)}</main>}

    {view === "compare" && <main className="diff-view"><aside><div className="diff-summary"><strong>{differences.length} changes</strong><span><i className="added" />{differences.filter((item) => item.change_type === "added").length} added</span><span><i className="changed" />{differences.filter((item) => item.change_type === "changed").length} changed</span><span><i className="removed" />{differences.filter((item) => item.change_type === "removed").length} removed</span></div>{differences.map((difference) => <button key={`${difference.category}:${difference.item_key}`} className={selectedDifference === difference ? "selected" : ""} onClick={() => setSelectedDifference(difference)}><i className={difference.change_type} /><div><strong>{difference.item_title}</strong><small>{difference.category.replace("_", " ")} · {difference.change_type}</small></div><ArrowRight size={14} /></button>)}</aside><section className="diff-detail">{selectedDifference ? <><header><div><span>{selectedDifference.category.replace("_", " ")}</span><h2>{selectedDifference.item_title}</h2></div><b className={selectedDifference.change_type}>{selectedDifference.change_type}</b></header><div className="field-diff header"><span>Field / step telemetry</span><span>Before</span><span>After</span></div>{Object.entries(selectedDifference.field_changes).map(([field, values]) => <div className="field-diff" key={field}><strong>{field.replaceAll("_", " ")}</strong><code>{formatValue(values.before)}</code><code>{formatValue(values.after)}</code></div>)}</> : <div className="lifecycle-empty"><GitCompareArrows size={30} /><strong>No differences selected</strong><span>Create or choose two baselines to compare.</span></div>}</section></main>}

    {view === "activity" && <main className="activity-view"><section className="metric-grid"><Metric icon={Timer} label="Effort hours" value={totalHours.toFixed(1)} detail="Verified entries" /><Metric icon={Code2} label="Lines changed" value={totalLoc.toLocaleString()} detail={`${totalLocAdded} added · ${totalLocRemoved} removed`} /><Metric icon={RotateCcw} label="Rework" value={String(totalRework)} detail="Reopens and defects" /><Metric icon={CheckCircle2} label="Code quality" value={averageQuality == null ? "-" : `${averageQuality}%`} detail={`${qualityEventCount} scored events`} /></section><div className="activity-columns"><section className="contributor-panel"><header><div><Users size={17} /><strong>Contributor analytics</strong></div><span>{contributorRows.length} workspace members</span></header>{contributorRows.map((row) => <div className="contributor-row" key={row.user_id}><span className="contributor-avatar">{row.display_name.slice(0, 2).toUpperCase()}</span><div className="contributor-name"><strong>{row.display_name}</strong><small>{row.access_role} · {row.events} activities</small></div><div className="hours-bar"><span style={{ width: `${Math.max(3, row.hours / maxHours * 100)}%` }} /><b>{row.hours.toFixed(1)}h</b></div><span>{row.loc} LOC</span><span>{row.rework} rework</span><b>{row.quality == null ? "-" : `${row.quality}%`}</b></div>)}</section><section className="feed-panel"><header><div><BarChart3 size={17} /><strong>Live activity</strong></div><span>Realtime</span></header><div className="activity-feed">{events.map((event) => <article key={event.id}><i className={event.event_type} /><div><strong>{event.title}</strong><span>{users.find((user) => user.user_id === event.actor_user_id)?.display_name || "System"} · {eventLabel(event.event_type)}</span><small>{[event.effort_hours ? `${event.effort_hours}h` : "", event.loc_added + event.loc_removed ? `${event.loc_added + event.loc_removed} LOC` : "", event.rework_count ? `${event.rework_count} rework` : "", event.quality_score != null ? `${event.quality_score}% quality` : ""].filter(Boolean).join(" · ") || eventLabel(event.entity_type)}</small></div><time>{new Date(event.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></article>)}</div></section></div></main>}

    {showBaselineForm && <div className="lifecycle-modal-backdrop"><form className="lifecycle-modal" onSubmit={(event) => void createBaseline(event)}><header><div><span>Immutable milestone state</span><h2>Create release baseline</h2></div><button type="button" title="Close" onClick={() => setShowBaselineForm(false)}><X size={18} /></button></header><label>Release<select name="releaseId" required>{releases.map((release) => <option key={release.id} value={release.id}>{release.name} · {release.status}</option>)}</select></label><label>Baseline name<input name="name" required placeholder="Release candidate" /></label><label>Milestone label<input name="milestone" placeholder="Scope freeze, QA sign-off, launch" /></label><div className="freeze-notice"><FileClock size={18} /><span>This permanently freezes and duplicates the current folder, document, sprint, task, test, and issue structures.</span></div><footer><button type="button" onClick={() => setShowBaselineForm(false)}>Cancel</button><button className="lifecycle-primary" type="submit"><FileClock size={15} /> Freeze state</button></footer></form></div>}

    {showContributionForm && <div className="lifecycle-modal-backdrop"><form className="lifecycle-modal" onSubmit={(event) => void recordContribution(event)}><header><div><span>Measured contribution</span><h2>Record activity metrics</h2></div><button type="button" title="Close" onClick={() => setShowContributionForm(false)}><X size={18} /></button></header><label>Contribution title<input name="title" required placeholder="Implemented baseline comparison" /></label><div className="metric-form"><label>Effort hours<input name="hours" type="number" min="0" step="0.25" defaultValue="0" /></label><label>LOC added<input name="locAdded" type="number" min="0" step="1" defaultValue="0" /></label><label>LOC removed<input name="locRemoved" type="number" min="0" step="1" defaultValue="0" /></label><label>Rework count<input name="rework" type="number" min="0" step="1" defaultValue="0" /></label><label>Quality score<input name="quality" type="number" min="0" max="100" step="1" placeholder="Optional" /></label></div><footer><button type="button" onClick={() => setShowContributionForm(false)}>Cancel</button><button className="lifecycle-primary" type="submit"><Activity size={15} /> Record metrics</button></footer></form></div>}
  </section>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Timer; label: string; value: string; detail: string }) {
  return <article className="metric-card"><Icon size={19} /><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}
