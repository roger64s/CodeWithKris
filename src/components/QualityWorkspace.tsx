import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Bug, Check, ChevronRight, CircleSlash2, ClipboardCheck, FilePlus2, FlaskConical, MonitorCog, Paperclip, Play, Plus, Search, ShieldAlert, X } from "lucide-react";
import { supabase } from "../supabase";
import "./QualityWorkspace.css";

type Workspace = { id: string; name: string };
type Requirement = { id: string; title: string; item_type: "feature" | "user_story" };
type DirectoryUser = { user_id: string; display_name: string; access_role: string };
type TestCase = { id: string; workspace_id: string; source_requirement_id: string; title: string; preconditions: string; status: "draft" | "ready" | "retired"; created_at: string };
type TestStep = { id: string; test_case_id: string; step_number: number; action: string; expected_result: string; notes: string };
type TestRun = { id: string; workspace_id: string; test_case_id: string; name: string; variants: Record<string, string>; status: RunStatus; assigned_to: string | null; created_at: string };
type RunStatus = "not_started" | "in_progress" | "passed" | "failed" | "blocked";
type RunStep = { id: string; run_id: string; step_number: number; action: string; expected_result: string; notes: string; outcome: "not_run" | "passed" | "failed" | "blocked"; actual_result: string; problem_statement: string; attachment_paths: string[] };
type QualityIssue = { id: string; requirement_issue_id: string; run_id: string; run_step_id: string; severity: "low" | "medium" | "high" | "critical"; status: "open" | "triaged" | "in_progress" | "resolved" | "closed"; problem_statement: string; attachment_paths: string[]; created_at: string };
type DraftStep = { action: string; expected_result: string; notes: string };
type View = "library" | "runs" | "issues";

const previewWorkspace = { id: "preview-workspace", name: "Accessible Learning Platform" };
const previewRequirements: Requirement[] = [
  { id: "feature-qa", title: "Accessible sprint delivery", item_type: "feature" },
  { id: "story-qa", title: "Complete tasks with keyboard controls", item_type: "user_story" },
];
const previewCases: TestCase[] = [{ id: "case-1", workspace_id: previewWorkspace.id, source_requirement_id: "story-qa", title: "Keyboard task workflow", preconditions: "User is assigned to Sprint 1", status: "ready", created_at: new Date().toISOString() }];
const previewSteps: TestStep[] = [
  { id: "step-1", test_case_id: "case-1", step_number: 1, action: "Focus the task move control", expected_result: "The control receives a visible focus indicator", notes: "Use keyboard only" },
  { id: "step-2", test_case_id: "case-1", step_number: 2, action: "Move the task to In Progress", expected_result: "The task enters In Progress once", notes: "Confirm audit event" },
  { id: "step-3", test_case_id: "case-1", step_number: 3, action: "Submit the task for review", expected_result: "The assigned reviewer can approve it", notes: "Assignee and reviewer differ" },
];
const previewRuns: TestRun[] = [{ id: "run-1", workspace_id: previewWorkspace.id, test_case_id: "case-1", name: "Windows thermal baseline", variants: { OS: "Windows 11", "Heat range": "35-45 C", Salinity: "N/A" }, status: "in_progress", assigned_to: "tester", created_at: new Date().toISOString() }];
const previewRunSteps: RunStep[] = previewSteps.map((step, index) => ({ id: `run-step-${index + 1}`, run_id: "run-1", step_number: step.step_number, action: step.action, expected_result: step.expected_result, notes: step.notes, outcome: index === 0 ? "passed" : "not_run", actual_result: index === 0 ? "Focus ring visible" : "", problem_statement: "", attachment_paths: [] }));
const previewUsers: DirectoryUser[] = [{ user_id: "owner", display_name: "Roger S.", access_role: "owner" }, { user_id: "tester", display_name: "Maya Chen", access_role: "editor" }];
const isPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "quality";
const blankStep = (): DraftStep => ({ action: "", expected_result: "", notes: "" });

export function QualityWorkspace() {
  const [view, setView] = useState<View>("library");
  const [workspaces, setWorkspaces] = useState<Workspace[]>(isPreview ? [previewWorkspace] : []);
  const [workspaceId, setWorkspaceId] = useState(isPreview ? previewWorkspace.id : "");
  const [requirements, setRequirements] = useState<Requirement[]>(isPreview ? previewRequirements : []);
  const [cases, setCases] = useState<TestCase[]>(isPreview ? previewCases : []);
  const [steps, setSteps] = useState<TestStep[]>(isPreview ? previewSteps : []);
  const [runs, setRuns] = useState<TestRun[]>(isPreview ? previewRuns : []);
  const [runSteps, setRunSteps] = useState<RunStep[]>(isPreview ? previewRunSteps : []);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>(isPreview ? previewUsers : []);
  const [selectedCaseId, setSelectedCaseId] = useState(isPreview ? "case-1" : "");
  const [selectedRunId, setSelectedRunId] = useState(isPreview ? "run-1" : "");
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [showRunForm, setShowRunForm] = useState(false);
  const [failureStep, setFailureStep] = useState<RunStep | null>(null);
  const [draftSteps, setDraftSteps] = useState<DraftStep[]>([blankStep()]);
  const [problemStatement, setProblemStatement] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [actualResults, setActualResults] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState(isPreview ? "Quality preview" : "Loading quality workspace...");

  async function loadWorkspace(id: string) {
    if (!supabase || !id || isPreview) return;
    const [requirementsResult, casesResult, runsResult, issuesResult, directoryResult] = await Promise.all([
      supabase.from("requirement_items").select("id,title,item_type").eq("workspace_id", id).in("item_type", ["feature", "user_story"]).order("created_at"),
      supabase.from("quality_test_cases").select("*").eq("workspace_id", id).order("created_at", { ascending: false }),
      supabase.from("quality_test_runs").select("*").eq("workspace_id", id).order("created_at", { ascending: false }),
      supabase.from("quality_issues").select("*").eq("workspace_id", id).order("created_at", { ascending: false }),
      supabase.rpc("requirement_workspace_user_directory", { workspace_id_input: id }),
    ]);
    const error = requirementsResult.error || casesResult.error || runsResult.error || issuesResult.error;
    if (error) return setNotice("Apply the Phase 4 Supabase migration to enable quality management.");
    const loadedCases = (casesResult.data || []) as TestCase[];
    const loadedRuns = (runsResult.data || []) as TestRun[];
    setRequirements((requirementsResult.data || []) as Requirement[]); setCases(loadedCases); setRuns(loadedRuns);
    setIssues((issuesResult.data || []) as QualityIssue[]); setUsers((directoryResult.data || []) as DirectoryUser[]);
    setSelectedCaseId((current) => current || loadedCases[0]?.id || ""); setSelectedRunId((current) => current || loadedRuns[0]?.id || "");
    const [stepsResult, runStepsResult] = await Promise.all([
      loadedCases.length ? supabase.from("quality_test_steps").select("*").in("test_case_id", loadedCases.map((item) => item.id)).order("step_number") : Promise.resolve({ data: [], error: null }),
      loadedRuns.length ? supabase.from("quality_test_run_steps").select("*").in("run_id", loadedRuns.map((item) => item.id)).order("step_number") : Promise.resolve({ data: [], error: null }),
    ]);
    setSteps((stepsResult.data || []) as TestStep[]); setRunSteps((runStepsResult.data || []) as RunStep[]); setNotice("Quality workspace synchronized");
  }

  useEffect(() => {
    if (isPreview || !supabase) return;
    void supabase.from("requirement_workspaces").select("id,name").order("updated_at", { ascending: false }).then(({ data }) => {
      const loaded = (data || []) as Workspace[]; const initialWorkspaceId = loaded[0]?.id || "";
      setWorkspaces(loaded); setWorkspaceId(initialWorkspaceId); void loadWorkspace(initialWorkspaceId);
    });
  }, []);

  async function createCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const sourceRequirementId = String(values.get("sourceRequirementId") || ""); const title = String(values.get("title") || "").trim();
    if (!title || !sourceRequirementId || draftSteps.some((step) => !step.action.trim() || !step.expected_result.trim())) return setNotice("Complete every action and expected result.");
    if (isPreview || !supabase) {
      const testCase: TestCase = { id: crypto.randomUUID(), workspace_id: workspaceId, source_requirement_id: sourceRequirementId, title, preconditions: String(values.get("preconditions") || ""), status: "draft", created_at: new Date().toISOString() };
      const createdSteps = draftSteps.map((step, index) => ({ ...step, id: crypto.randomUUID(), test_case_id: testCase.id, step_number: index + 1 }));
      setCases((current) => [testCase, ...current]); setSteps((current) => [...current, ...createdSteps]); setSelectedCaseId(testCase.id);
    } else {
      const { data, error } = await supabase.rpc("generate_quality_test_case", { workspace_id_input: workspaceId, source_requirement_id_input: sourceRequirementId, title_input: title, preconditions_input: String(values.get("preconditions") || ""), steps_input: draftSteps });
      if (error) return setNotice(error.message); setCases((current) => [data as TestCase, ...current]); await loadWorkspace(workspaceId);
    }
    setDraftSteps([blankStep()]); setShowCaseForm(false); setNotice("Test case generated from requirement.");
  }

  async function createRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); const testCaseId = String(values.get("testCaseId") || selectedCaseId);
    const variants = Object.fromEntries([["OS", values.get("os")], ["Heat range", values.get("heat")], ["Salinity", values.get("salinity")]].filter(([, value]) => String(value || "").trim()).map(([key, value]) => [key, String(value)]));
    if (isPreview || !supabase) {
      const run: TestRun = { id: crypto.randomUUID(), workspace_id: workspaceId, test_case_id: testCaseId, name: String(values.get("name")), variants, status: "not_started", assigned_to: String(values.get("assignedTo") || "") || null, created_at: new Date().toISOString() };
      const snapshots = steps.filter((step) => step.test_case_id === testCaseId).map((step) => ({ ...step, id: crypto.randomUUID(), run_id: run.id, outcome: "not_run" as const, actual_result: "", problem_statement: "", attachment_paths: [] }));
      setRuns((current) => [run, ...current]); setRunSteps((current) => [...current, ...snapshots]); setSelectedRunId(run.id);
    } else {
      const { data, error } = await supabase.rpc("generate_quality_test_run", { test_case_id_input: testCaseId, name_input: String(values.get("name")), variants_input: variants, sprint_id_input: null, task_id_input: null, assigned_to_input: values.get("assignedTo") || null });
      if (error) return setNotice(error.message); setSelectedRunId((data as TestRun).id); await loadWorkspace(workspaceId);
    }
    setShowRunForm(false); setView("runs"); setNotice("Variant test run generated.");
  }

  async function executeStep(step: RunStep, outcome: "passed" | "blocked", actualResult = actualResults[step.id] || "") {
    if (isPreview || !supabase) { applyPreviewResult(step, outcome, actualResult); return; }
    const { error } = await supabase.rpc("execute_quality_test_step", { run_step_id_input: step.id, outcome_input: outcome, actual_result_input: actualResult, problem_statement_input: "", attachment_paths_input: [] });
    if (error) return setNotice(error.message); await loadWorkspace(workspaceId);
  }

  function applyPreviewResult(step: RunStep, outcome: RunStep["outcome"], actualResult: string, problem = "", attachments: string[] = []) {
    const updated = { ...step, outcome, actual_result: actualResult, problem_statement: problem, attachment_paths: attachments };
    setRunSteps((current) => current.map((item) => item.id === step.id ? updated : item));
    if (outcome === "failed") setIssues((current) => [{ id: crypto.randomUUID(), requirement_issue_id: crypto.randomUUID(), run_id: step.run_id, run_step_id: step.id, severity: "high", status: "open", problem_statement: problem, attachment_paths: attachments, created_at: new Date().toISOString() }, ...current]);
    const siblings = runSteps.filter((item) => item.run_id === step.run_id).map((item) => item.id === step.id ? updated : item);
    const status: RunStatus = siblings.some((item) => item.outcome === "failed") ? "failed" : siblings.some((item) => item.outcome === "blocked") ? "blocked" : siblings.every((item) => item.outcome === "passed") ? "passed" : "in_progress";
    setRuns((current) => current.map((run) => run.id === step.run_id ? { ...run, status } : run));
  }

  async function submitFailure(event: FormEvent) {
    event.preventDefault(); if (!failureStep || !evidenceFile || !problemStatement.trim()) return;
    let attachmentPath = `${workspaceId}/${failureStep.run_id}/${failureStep.id}/${evidenceFile.name}`;
    if (!isPreview && supabase) {
      attachmentPath = `${workspaceId}/${failureStep.run_id}/${failureStep.id}/${crypto.randomUUID()}-${evidenceFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const upload = await supabase.storage.from("quality-evidence").upload(attachmentPath, evidenceFile); if (upload.error) return setNotice(upload.error.message);
      const { error } = await supabase.rpc("execute_quality_test_step", { run_step_id_input: failureStep.id, outcome_input: "failed", actual_result_input: actualResults[failureStep.id] || "", problem_statement_input: problemStatement.trim(), attachment_paths_input: [attachmentPath] });
      if (error) return setNotice(error.message); await loadWorkspace(workspaceId);
    } else applyPreviewResult(failureStep, "failed", actualResults[failureStep.id] || "", problemStatement.trim(), [attachmentPath]);
    setFailureStep(null); setProblemStatement(""); setEvidenceFile(null); setView("issues"); setNotice("Failure recorded and linked defect generated.");
  }

  async function updateIssue(issue: QualityIssue, changes: Partial<Pick<QualityIssue, "status" | "severity">>) {
    if (!isPreview && supabase) { const { error } = await supabase.from("quality_issues").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", issue.id); if (error) return setNotice(error.message); }
    setIssues((current) => current.map((item) => item.id === issue.id ? { ...item, ...changes } : item));
  }

  async function openEvidence(path: string) {
    if (isPreview || !supabase) return setNotice(`Evidence: ${path.split("/").at(-1)}`);
    const { data, error } = await supabase.storage.from("quality-evidence").createSignedUrl(path, 60);
    if (error) return setNotice(error.message);
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const selectedCase = cases.find((item) => item.id === selectedCaseId);
  const selectedRun = runs.find((item) => item.id === selectedRunId);
  const filteredCases = cases.filter((item) => item.title.toLowerCase().includes(search.toLowerCase()));
  const filteredRuns = runs.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));

  return <section className="quality-module">
    <header className="quality-header"><div><span>Verification & control</span><h1>Testing & Issues</h1></div><div className="quality-actions"><button title="Generate test case" onClick={() => setShowCaseForm(true)}><FilePlus2 size={16} /> Test case</button><button className="quality-primary" title="Generate test run" onClick={() => setShowRunForm(true)} disabled={!cases.length}><Play size={16} /> Test run</button></div></header>
    <div className="quality-toolbar"><select aria-label="Workspace" value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); void loadWorkspace(event.target.value); }}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><label><Search size={15} /><input aria-label="Search quality records" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tests and runs" /></label><span>{notice}</span></div>
    <nav className="quality-tabs" aria-label="Quality views">{([{ id: "library", label: "Test Library", icon: FlaskConical, count: cases.length }, { id: "runs", label: "Test Runs", icon: ClipboardCheck, count: runs.length }, { id: "issues", label: "Issues", icon: Bug, count: issues.filter((issue) => !["resolved", "closed"].includes(issue.status)).length }] as const).map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><item.icon size={16} />{item.label}<b>{item.count}</b></button>)}</nav>

    {view === "library" && <div className="quality-split"><aside className="quality-list"><div className="quality-list-heading"><strong>Requirement-derived cases</strong><span>{filteredCases.length}</span></div>{filteredCases.map((testCase) => <button key={testCase.id} className={selectedCaseId === testCase.id ? "selected" : ""} onClick={() => setSelectedCaseId(testCase.id)}><span className={`quality-state ${testCase.status}`} /><div><strong>{testCase.title}</strong><small>{requirements.find((item) => item.id === testCase.source_requirement_id)?.title || "Linked requirement"}</small></div><ChevronRight size={15} /></button>)}</aside><main className="quality-detail">{selectedCase ? <><div className="detail-heading"><div><span>{requirements.find((item) => item.id === selectedCase.source_requirement_id)?.item_type.replace("_", " ")}</span><h2>{selectedCase.title}</h2><p>{selectedCase.preconditions || "No preconditions recorded."}</p></div><button className="quality-primary" onClick={() => setShowRunForm(true)}><Play size={15} /> Run</button></div><div className="step-grid header"><span>#</span><span>Action</span><span>Expected result</span><span>Inline notes</span></div>{steps.filter((step) => step.test_case_id === selectedCase.id).map((step) => <div className="step-grid" key={step.id}><b>{step.step_number}</b><span>{step.action}</span><span>{step.expected_result}</span><em>{step.notes || "-"}</em></div>)}</> : <EmptyState icon={FlaskConical} title="Generate a test case" text="Start from a feature or user story and define observable steps." />}</main></div>}

    {view === "runs" && <div className="quality-split"><aside className="quality-list"><div className="quality-list-heading"><strong>Execution queue</strong><span>{filteredRuns.length}</span></div>{filteredRuns.map((run) => <button key={run.id} className={selectedRunId === run.id ? "selected" : ""} onClick={() => setSelectedRunId(run.id)}><span className={`run-status ${run.status}`} /><div><strong>{run.name}</strong><small>{Object.values(run.variants).join(" / ") || "Default configuration"}</small></div><ChevronRight size={15} /></button>)}</aside><main className="quality-detail run-detail">{selectedRun ? <><div className="detail-heading"><div><span>{selectedRun.status.replace("_", " ")}</span><h2>{selectedRun.name}</h2><div className="variant-strip">{Object.entries(selectedRun.variants).map(([key, value]) => <span key={key}><b>{key}</b>{value}</span>)}</div></div></div><div className="run-step-grid header"><span>#</span><span>Test step / expected</span><span>Actual result</span><span>Outcome</span></div>{runSteps.filter((step) => step.run_id === selectedRun.id).map((step) => <div className="run-step-grid" key={step.id}><b>{step.step_number}</b><div><strong>{step.action}</strong><small>{step.expected_result}</small>{step.notes && <em>{step.notes}</em>}</div><textarea aria-label={`Actual result for step ${step.step_number}`} value={actualResults[step.id] ?? step.actual_result} onChange={(event) => setActualResults((current) => ({ ...current, [step.id]: event.target.value }))} placeholder="Observed result" rows={2} /><div className="outcome-actions"><button className={step.outcome === "passed" ? "selected pass" : "pass"} title="Pass step" onClick={() => void executeStep(step, "passed")}><Check size={16} /></button><button className={step.outcome === "failed" ? "selected fail" : "fail"} title="Fail step" onClick={() => setFailureStep(step)}><X size={16} /></button><button className={step.outcome === "blocked" ? "selected blocked" : "blocked"} title="Block step" onClick={() => void executeStep(step, "blocked")}><CircleSlash2 size={16} /></button></div></div>)}</> : <EmptyState icon={MonitorCog} title="Generate a test run" text="Choose a test case and capture environment variants." />}</main></div>}

    {view === "issues" && <main className="issue-workspace"><div className="issue-heading"><div><span>Auto-generated defects</span><h2>Issue tracker</h2></div><b>{issues.length} linked issues</b></div>{issues.length ? <div className="issue-table"><div className="issue-row header"><span>Issue</span><span>Evidence</span><span>Severity</span><span>Status</span></div>{issues.map((issue) => <div className="issue-row" key={issue.id}><div><strong><ShieldAlert size={15} />{issue.problem_statement}</strong><small>Failed run step · {new Date(issue.created_at).toLocaleDateString()}</small></div><button className="issue-evidence" onClick={() => void openEvidence(issue.attachment_paths[0])}><Paperclip size={14} />Open evidence ({issue.attachment_paths.length})</button><select aria-label="Issue severity" value={issue.severity} onChange={(event) => void updateIssue(issue, { severity: event.target.value as QualityIssue["severity"] })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select><select aria-label="Issue status" value={issue.status} onChange={(event) => void updateIssue(issue, { status: event.target.value as QualityIssue["status"] })}><option>open</option><option>triaged</option><option>in_progress</option><option>resolved</option><option>closed</option></select></div>)}</div> : <EmptyState icon={Bug} title="No issues recorded" text="Failed steps create linked defects here automatically." />}</main>}

    {showCaseForm && <div className="quality-modal-backdrop"><form className="quality-modal case-form" onSubmit={(event) => void createCase(event)}><header><div><span>Requirement trace</span><h2>Generate test case</h2></div><button type="button" title="Close" onClick={() => setShowCaseForm(false)}><X size={18} /></button></header><label>Feature or user story<select name="sourceRequirementId" required>{requirements.map((item) => <option key={item.id} value={item.id}>{item.item_type === "feature" ? "Feature" : "Story"} · {item.title}</option>)}</select></label><label>Test case title<input name="title" required autoFocus /></label><label>Preconditions<textarea name="preconditions" rows={2} /></label><div className="draft-steps"><div className="draft-step header"><span>#</span><span>Action</span><span>Expected result</span><span>Inline notes</span><span /></div>{draftSteps.map((step, index) => <div className="draft-step" key={index}><b>{index + 1}</b><textarea required value={step.action} onChange={(event) => setDraftSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, action: event.target.value } : item))} /><textarea required value={step.expected_result} onChange={(event) => setDraftSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, expected_result: event.target.value } : item))} /><textarea value={step.notes} onChange={(event) => setDraftSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item))} /><button type="button" title="Remove step" disabled={draftSteps.length === 1} onClick={() => setDraftSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button></div>)}</div><button className="add-step" type="button" onClick={() => setDraftSteps((current) => [...current, blankStep()])}><Plus size={15} /> Add step</button><footer><button type="button" onClick={() => setShowCaseForm(false)}>Cancel</button><button className="quality-primary" type="submit"><FilePlus2 size={15} /> Generate case</button></footer></form></div>}

    {showRunForm && <div className="quality-modal-backdrop"><form className="quality-modal" onSubmit={(event) => void createRun(event)}><header><div><span>Execution configuration</span><h2>Generate test run</h2></div><button type="button" title="Close" onClick={() => setShowRunForm(false)}><X size={18} /></button></header><label>Test case<select name="testCaseId" defaultValue={selectedCaseId} required>{cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Run name<input name="name" required defaultValue={`${selectedCase?.title || "Validation"} run`} /></label><div className="variant-form"><label>Operating system<input name="os" placeholder="Windows 11" /></label><label>Hardware heat range<input name="heat" placeholder="35-45 C" /></label><label>Salinity<input name="salinity" placeholder="0.5 ppt" /></label></div><label>Assigned tester<select name="assignedTo"><option value="">Any workspace member</option>{users.map((user) => <option key={user.user_id} value={user.user_id}>{user.display_name}</option>)}</select></label><footer><button type="button" onClick={() => setShowRunForm(false)}>Cancel</button><button className="quality-primary" type="submit"><Play size={15} /> Generate run</button></footer></form></div>}

    {failureStep && <div className="quality-modal-backdrop"><form className="quality-modal failure-form" onSubmit={(event) => void submitFailure(event)}><header><div><span>Required failure evidence</span><h2>Fail step {failureStep.step_number}</h2></div><button type="button" title="Close" onClick={() => setFailureStep(null)}><X size={18} /></button></header><div className="failure-warning"><AlertTriangle size={18} /><span>A linked issue will be generated when this failure is recorded.</span></div><label>Problem statement<textarea required rows={4} value={problemStatement} onChange={(event) => setProblemStatement(event.target.value)} placeholder="Describe what happened, where it occurred, and its impact." /></label><label className="evidence-upload"><Paperclip size={17} /><span>{evidenceFile?.name || "Attach screenshot, log, or recording"}</span><input type="file" required onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)} /></label><footer><button type="button" onClick={() => setFailureStep(null)}>Cancel</button><button className="failure-submit" type="submit" disabled={!problemStatement.trim() || !evidenceFile}><Bug size={15} /> Fail & create issue</button></footer></form></div>}
  </section>;
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof FlaskConical; title: string; text: string }) {
  return <div className="quality-empty"><Icon size={28} /><strong>{title}</strong><span>{text}</span></div>;
}
