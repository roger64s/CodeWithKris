import { useEffect, useState, type FormEvent } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Archive, CalendarDays, Check, ChevronDown, ChevronRight, CircleDot, ClipboardCheck, Folder, FolderOpen, Globe2, GripVertical, LockKeyhole, Plus, Rocket, Search, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { supabase } from "../supabase";
import "./SprintTaskBoard.css";

type WorkflowStatus = "not_started" | "in_progress" | "ready_for_review" | "done";
type Priority = "low" | "medium" | "high" | "critical";
type Workspace = { id: string; name: string };
type PlanningFolder = { id: string; workspace_id: string; parent_id: string | null; folder_type: string; name: string; visibility: "public" | "private"; sort_order: number };
type Release = { id: string; workspace_id: string; folder_id: string; release_number: number; name: string; status: string };
type Sprint = { id: string; workspace_id: string; folder_id: string; release_id: string | null; sprint_number: number; name: string; goal: string; status: string };
type RequirementOption = { id: string; title: string; item_type: string };
type DirectoryUser = { user_id: string; display_name: string; platform_category: string | null; access_role: "owner" | "editor" | "viewer" };
type BoardTask = {
  id: string; workspace_id: string; folder_id: string; sprint_id: string | null; release_id: string | null; requirement_item_id: string | null;
  title: string; description: string; workflow_status: WorkflowStatus; priority: Priority; assignee_user_id: string | null; reviewer_user_id: string | null;
  approved_by_user_id: string | null; reviewed_at: string | null; approved_at: string | null; sort_order: number; updated_at: string;
};

const columns: { id: WorkflowStatus; label: string; detail: string }[] = [
  { id: "not_started", label: "Not Started", detail: "Prioritized and ready" },
  { id: "in_progress", label: "In Progress", detail: "Actively being delivered" },
  { id: "ready_for_review", label: "Ready for Review", detail: "Awaiting validation" },
  { id: "done", label: "Done", detail: "Reviewed and approved" },
];
const previewWorkspace: Workspace = { id: "preview-workspace", name: "Accessible Learning Platform" };
const previewFolders: PlanningFolder[] = [
  { id: "product", workspace_id: previewWorkspace.id, parent_id: null, folder_type: "product", name: "Product", visibility: "public", sort_order: 10 },
  { id: "backlog", workspace_id: previewWorkspace.id, parent_id: null, folder_type: "backlog", name: "Backlog", visibility: "private", sort_order: 20 },
  { id: "tests", workspace_id: previewWorkspace.id, parent_id: null, folder_type: "test_library", name: "Test Library", visibility: "private", sort_order: 30 },
  { id: "releases", workspace_id: previewWorkspace.id, parent_id: null, folder_type: "releases", name: "Releases", visibility: "public", sort_order: 40 },
  ...[1, 2, 3, 4].map((number) => ({ id: `release-folder-${number}`, workspace_id: previewWorkspace.id, parent_id: "releases", folder_type: "release", name: `Release ${number}`, visibility: "public" as const, sort_order: number * 10 })),
  { id: "sprints", workspace_id: previewWorkspace.id, parent_id: null, folder_type: "sprints", name: "Sprints", visibility: "private", sort_order: 50 },
  ...[1, 2, 3].map((number) => ({ id: `sprint-folder-${number}`, workspace_id: previewWorkspace.id, parent_id: "sprints", folder_type: "sprint", name: `Sprint ${number}`, visibility: "private" as const, sort_order: number * 10 })),
];
const previewReleases: Release[] = [1, 2, 3, 4].map((number) => ({ id: `release-${number}`, workspace_id: previewWorkspace.id, folder_id: `release-folder-${number}`, release_number: number, name: `Release ${number}`, status: number === 1 ? "active" : "planned" }));
const previewSprints: Sprint[] = [1, 2, 3].map((number) => ({ id: `sprint-${number}`, workspace_id: previewWorkspace.id, folder_id: `sprint-folder-${number}`, release_id: `release-${Math.min(number, 4)}`, sprint_number: number, name: `Sprint ${number}`, goal: number === 1 ? "Ship collaborative planning foundations" : "", status: number === 1 ? "active" : "planned" }));
const previewUsers: DirectoryUser[] = [
  { user_id: "owner", display_name: "Roger S.", platform_category: "CodeWithKris Administrator", access_role: "owner" },
  { user_id: "developer", display_name: "Maya Chen", platform_category: "Student", access_role: "editor" },
  { user_id: "reviewer", display_name: "Alex Morgan", platform_category: "Individual", access_role: "editor" },
];
const previewRequirements: RequirementOption[] = [{ id: "story-1", title: "Navigate requirements by hierarchy", item_type: "user_story" }, { id: "test-1", title: "Tree preserves parent-child order", item_type: "test_case" }];
const previewTasks: BoardTask[] = [
  { id: "task-1", workspace_id: previewWorkspace.id, folder_id: "backlog", sprint_id: "sprint-1", release_id: "release-1", requirement_item_id: "story-1", title: "Add sprint folder navigation", description: "Expose planning folders with visibility indicators.", workflow_status: "not_started", priority: "high", assignee_user_id: "developer", reviewer_user_id: "reviewer", approved_by_user_id: null, reviewed_at: null, approved_at: null, sort_order: 0, updated_at: new Date().toISOString() },
  { id: "task-2", workspace_id: previewWorkspace.id, folder_id: "backlog", sprint_id: "sprint-1", release_id: "release-1", requirement_item_id: "story-1", title: "Map task allocation to members", description: "Use the secured workspace directory for assignment.", workflow_status: "in_progress", priority: "critical", assignee_user_id: "developer", reviewer_user_id: "reviewer", approved_by_user_id: null, reviewed_at: null, approved_at: null, sort_order: 0, updated_at: new Date().toISOString() },
  { id: "task-3", workspace_id: previewWorkspace.id, folder_id: "tests", sprint_id: "sprint-1", release_id: "release-1", requirement_item_id: "test-1", title: "Verify keyboard task movement", description: "Confirm accessible drag controls and status actions.", workflow_status: "ready_for_review", priority: "medium", assignee_user_id: "developer", reviewer_user_id: "owner", approved_by_user_id: null, reviewed_at: new Date().toISOString(), approved_at: null, sort_order: 0, updated_at: new Date().toISOString() },
  { id: "task-4", workspace_id: previewWorkspace.id, folder_id: "product", sprint_id: "sprint-1", release_id: "release-1", requirement_item_id: null, title: "Approve board workflow policy", description: "Review and approve controlled task transitions.", workflow_status: "done", priority: "low", assignee_user_id: "developer", reviewer_user_id: "owner", approved_by_user_id: "owner", reviewed_at: new Date().toISOString(), approved_at: new Date().toISOString(), sort_order: 0, updated_at: new Date().toISOString() },
];
const isPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "sprints";

function TaskCard({ task, users, requirement, onSelect }: { task: BoardTask; users: DirectoryUser[]; requirement?: RequirementOption; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const assignee = users.find((user) => user.user_id === task.assignee_user_id);
  return <article ref={setNodeRef} className={`board-task priority-${task.priority} ${isDragging ? "dragging" : ""}`} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined} onClick={onSelect}>
    <div className="task-card-top"><span className="task-priority">{task.priority}</span><button className="task-drag-handle" aria-label={`Move ${task.title}`} {...listeners} {...attributes} onClick={(event) => event.stopPropagation()}><GripVertical size={16} /></button></div>
    <h3>{task.title}</h3>{requirement && <span className="task-requirement"><CircleDot size={11} />{requirement.title}</span>}
    <div className="task-card-footer"><span className="assignee-avatar" title={assignee?.display_name || "Unassigned"}>{assignee ? assignee.display_name.slice(0, 2).toUpperCase() : "--"}</span><span>{assignee?.display_name || "Unassigned"}</span>{task.approved_at && <ShieldCheck size={15} aria-label="Approved" />}</div>
  </article>;
}

function BoardColumn({ column, tasks, users, requirements, onSelect }: { column: typeof columns[number]; tasks: BoardTask[]; users: DirectoryUser[]; requirements: RequirementOption[]; onSelect: (task: BoardTask) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return <section ref={setNodeRef} className={`board-column ${isOver ? "over" : ""}`}><header><div><span className={`column-dot ${column.id}`} /><strong>{column.label}</strong><small>{column.detail}</small></div><b>{tasks.length}</b></header><div className="board-column-content">{tasks.map((task) => <TaskCard key={task.id} task={task} users={users} requirement={requirements.find((item) => item.id === task.requirement_item_id)} onSelect={() => onSelect(task)} />)}{!tasks.length && <div className="column-empty">Drop a task here</div>}</div></section>;
}

export function SprintTaskBoard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(isPreview ? [previewWorkspace] : []);
  const [workspaceId, setWorkspaceId] = useState(isPreview ? previewWorkspace.id : "");
  const [folders, setFolders] = useState<PlanningFolder[]>(isPreview ? previewFolders : []);
  const [releases, setReleases] = useState<Release[]>(isPreview ? previewReleases : []);
  const [sprints, setSprints] = useState<Sprint[]>(isPreview ? previewSprints : []);
  const [tasks, setTasks] = useState<BoardTask[]>(isPreview ? previewTasks : []);
  const [users, setUsers] = useState<DirectoryUser[]>(isPreview ? previewUsers : []);
  const [requirements, setRequirements] = useState<RequirementOption[]>(isPreview ? previewRequirements : []);
  const [accessRole, setAccessRole] = useState<"owner" | "editor" | "viewer">(isPreview ? "owner" : "viewer");
  const [currentUserId, setCurrentUserId] = useState(isPreview ? "owner" : "");
  const [selectedSprintId, setSelectedSprintId] = useState(isPreview ? "sprint-1" : "all");
  const [selectedReleaseId, setSelectedReleaseId] = useState("all");
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(["releases", "sprints"]));
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState(isPreview ? "Preview board" : "Loading sprint board...");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("viewer");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const canManage = accessRole === "owner" || accessRole === "editor" || isPreview;

  useEffect(() => {
    if (isPreview || !supabase) return;
    const client = supabase;
    void (async () => {
      const [{ data: workspaceData, error }, { data: auth }] = await Promise.all([client.from("requirement_workspaces").select("id, name").order("updated_at", { ascending: false }), client.auth.getUser()]);
      if (error) return setNotice("Apply the Phase 2 and Phase 3 Supabase migrations to enable sprint planning.");
      const loaded = (workspaceData || []) as Workspace[]; setWorkspaces(loaded); setWorkspaceId(loaded[0]?.id || ""); setCurrentUserId(auth.user?.id || "");
    })();
  }, []);

  useEffect(() => {
    if (!workspaceId || isPreview || !supabase) return;
    const client = supabase;
    const load = async () => {
      const { data: auth } = await client.auth.getUser();
      const [folderResult, releaseResult, sprintResult, taskResult, requirementResult, directoryResult, memberResult] = await Promise.all([
        client.from("planning_folders").select("*").eq("workspace_id", workspaceId).order("sort_order"), client.from("planning_releases").select("*").eq("workspace_id", workspaceId).order("release_number"),
        client.from("planning_sprints").select("*").eq("workspace_id", workspaceId).order("sprint_number"), client.from("sprint_tasks").select("*").eq("workspace_id", workspaceId).order("sort_order").order("created_at"),
        client.from("requirement_items").select("id, title, item_type").eq("workspace_id", workspaceId).in("item_type", ["user_story", "task", "technical_specification", "test_case", "issue"]),
        client.rpc("requirement_workspace_user_directory", { workspace_id_input: workspaceId }), client.from("requirement_workspace_members").select("access_role").eq("workspace_id", workspaceId).eq("user_id", auth.user?.id || "").maybeSingle(),
      ]);
      const error = folderResult.error || taskResult.error || directoryResult.error;
      if (error) return setNotice(error.message);
      setFolders((folderResult.data || []) as PlanningFolder[]); setReleases((releaseResult.data || []) as Release[]); setSprints((sprintResult.data || []) as Sprint[]); setTasks((taskResult.data || []) as BoardTask[]);
      setRequirements((requirementResult.data || []) as RequirementOption[]); setUsers((directoryResult.data || []) as DirectoryUser[]); setAccessRole((memberResult.data?.access_role as typeof accessRole) || "viewer"); setNotice("Board synchronized");
      setSelectedSprintId((current) => current === "all" && sprintResult.data?.[0]?.id ? sprintResult.data[0].id : current);
    };
    void load();
    const channel = client.channel(`sprint-board:${workspaceId}`).on("postgres_changes", { event: "*", schema: "public", table: "sprint_tasks", filter: `workspace_id=eq.${workspaceId}` }, (payload) => {
      if (payload.eventType === "DELETE") setTasks((current) => current.filter((task) => task.id !== (payload.old as { id: string }).id));
      else { const changed = payload.new as BoardTask; setTasks((current) => [...current.filter((task) => task.id !== changed.id), changed]); setSelectedTask((current) => current?.id === changed.id ? changed : current); }
    }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [workspaceId]);

  const filteredTasks = tasks.filter((task) => (selectedSprintId === "all" || task.sprint_id === selectedSprintId) && (selectedReleaseId === "all" || task.release_id === selectedReleaseId) && (selectedFolderId === "all" || task.folder_id === selectedFolderId) && task.title.toLowerCase().includes(search.toLowerCase()));

  async function transitionTask(task: BoardTask, status: WorkflowStatus) {
    if (task.workflow_status === status) return;
    if (isPreview || !supabase) { const updated = { ...task, workflow_status: status, reviewed_at: status === "ready_for_review" ? new Date().toISOString() : task.reviewed_at, approved_at: status === "done" ? new Date().toISOString() : null, approved_by_user_id: status === "done" ? currentUserId : null }; setTasks((current) => current.map((item) => item.id === task.id ? updated : item)); setSelectedTask((current) => current?.id === task.id ? updated : current); return; }
    const { data, error } = await supabase.rpc("transition_sprint_task", { task_id_input: task.id, status_input: status, notes_input: "Moved on Kanban board" });
    if (error) return setNotice(error.message); const updated = data as BoardTask; setTasks((current) => current.map((item) => item.id === task.id ? updated : item)); setSelectedTask((current) => current?.id === task.id ? updated : current);
  }

  function handleDragEnd(event: DragEndEvent) { const task = tasks.find((item) => item.id === event.active.id); const status = event.over?.id as WorkflowStatus | undefined; if (task && columns.some((column) => column.id === status)) void transitionTask(task, status!); }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!workspaceId) return;
    const values = new FormData(event.currentTarget); const backlog = folders.find((folder) => folder.folder_type === "backlog"); if (!backlog) return setNotice("Backlog folder is required.");
    const draft = { workspace_id: workspaceId, folder_id: String(values.get("folderId") || backlog.id), sprint_id: values.get("sprintId") || null, release_id: values.get("releaseId") || null, requirement_item_id: values.get("requirementId") || null, title: String(values.get("title") || "").trim(), description: String(values.get("description") || "").trim(), priority: values.get("priority"), assignee_user_id: values.get("assigneeId") || null, reviewer_user_id: values.get("reviewerId") || null };
    if (!draft.title) return;
    if (isPreview || !supabase) { setTasks((current) => [...current, { ...draft, id: crypto.randomUUID(), workflow_status: "not_started", approved_by_user_id: null, reviewed_at: null, approved_at: null, sort_order: 0, updated_at: new Date().toISOString() } as BoardTask]); setShowCreate(false); return; }
    const { data, error } = await supabase.from("sprint_tasks").insert(draft).select("*").single(); if (error) return setNotice(error.message); setTasks((current) => [...current, data as BoardTask]); setShowCreate(false);
  }

  async function updateAllocation(task: BoardTask, changes: Partial<Pick<BoardTask, "assignee_user_id" | "reviewer_user_id" | "priority" | "sprint_id" | "release_id">>) {
    if (!canManage) return; if (isPreview || !supabase) { const updated = { ...task, ...changes }; setTasks((current) => current.map((item) => item.id === task.id ? updated : item)); setSelectedTask(updated); return; }
    const { data, error } = await supabase.from("sprint_tasks").update({ ...changes, updated_by: currentUserId, updated_at: new Date().toISOString() }).eq("id", task.id).select("*").single(); if (error) return setNotice(error.message); const updated = data as BoardTask; setTasks((current) => current.map((item) => item.id === task.id ? updated : item)); setSelectedTask(updated);
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault(); if (!workspaceId || !inviteEmail.trim() || !supabase) return;
    const { error } = await supabase.rpc("add_requirement_workspace_member_by_email", { workspace_id_input: workspaceId, email_input: inviteEmail.trim(), access_role_input: inviteRole }); if (error) return setNotice(error.message);
    const { data } = await supabase.rpc("requirement_workspace_user_directory", { workspace_id_input: workspaceId }); if (data) setUsers(data as DirectoryUser[]); setInviteEmail(""); setNotice("Registered user added to the workspace.");
  }

  async function toggleFolderVisibility(folder: PlanningFolder) {
    if (!canManage) return; const visibility = folder.visibility === "public" ? "private" : "public";
    if (!isPreview && supabase) { const { error } = await supabase.from("planning_folders").update({ visibility }).eq("id", folder.id); if (error) return setNotice(error.message); }
    setFolders((current) => current.map((item) => item.id === folder.id ? { ...item, visibility } : item));
  }

  function renderFolders(parentId: string | null, depth = 0): React.ReactNode {
    return folders.filter((folder) => folder.parent_id === parentId).map((folder) => { const children = folders.some((item) => item.parent_id === folder.id); const open = expandedFolders.has(folder.id); const selected = selectedFolderId === folder.id; return <div key={folder.id}><div className={`planning-folder-row ${selected ? "selected" : ""}`} style={{ "--folder-depth": depth } as React.CSSProperties}><button className="folder-expand" disabled={!children} onClick={() => setExpandedFolders((current) => { const next = new Set(current); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next; })}>{children ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}</button><button className="folder-name" onClick={() => setSelectedFolderId(selected ? "all" : folder.id)}>{open ? <FolderOpen size={15} /> : <Folder size={15} />}<span>{folder.name}</span></button><button className="folder-visibility" title={`${folder.visibility} folder`} onClick={() => void toggleFolderVisibility(folder)} disabled={!canManage}>{folder.visibility === "public" ? <Globe2 size={13} /> : <LockKeyhole size={13} />}</button></div>{children && open ? renderFolders(folder.id, depth + 1) : null}</div>; });
  }

  const selectedSprint = sprints.find((sprint) => sprint.id === selectedSprintId);
  return <section className="sprint-board-module">
    <header className="sprint-board-header"><div><span className="board-kicker">Planning & delivery</span><h1>Sprints & Task Board</h1></div><div className="board-header-actions"><button aria-label="Workspace team" title="Workspace team" onClick={() => setShowTeam(true)}><Users size={16} /><i>Team</i><span>{users.length}</span></button><button className="board-primary" onClick={() => setShowCreate(true)} disabled={!canManage}><Plus size={16} /> New task</button></div></header>
    <div className="board-control-bar"><select aria-label="Workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><select aria-label="Release" value={selectedReleaseId} onChange={(event) => setSelectedReleaseId(event.target.value)}><option value="all">All releases</option>{releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}</select><select aria-label="Sprint" value={selectedSprintId} onChange={(event) => setSelectedSprintId(event.target.value)}><option value="all">All sprints</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select><label className="board-search"><Search size={15} /><input aria-label="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" /></label><span className="board-notice">{notice}</span></div>
    <div className="sprint-board-body"><aside className="planning-sidebar"><div className="planning-sidebar-title"><span>Planning folders</span><small>Public & private structure</small></div><button className={`all-work-button ${selectedFolderId === "all" ? "selected" : ""}`} onClick={() => setSelectedFolderId("all")}><Archive size={15} /> All work</button><nav>{renderFolders(null)}</nav><div className="sprint-goal"><Rocket size={16} /><div><small>{selectedSprint?.name || "Portfolio"}</small><strong>{selectedSprint?.goal || "Plan, allocate, review, and approve delivery work."}</strong></div></div></aside>
      <main className="kanban-area"><div className="kanban-summary"><div><CalendarDays size={15} /><span>{selectedSprint?.name || "All sprints"}</span></div><div><b>{filteredTasks.length}</b> tasks</div><div><b>{filteredTasks.filter((task) => task.workflow_status === "done").length}</b> approved</div></div><DndContext sensors={sensors} onDragEnd={handleDragEnd}><div className="kanban-grid">{columns.map((column) => <BoardColumn key={column.id} column={column} tasks={filteredTasks.filter((task) => task.workflow_status === column.id)} users={users} requirements={requirements} onSelect={setSelectedTask} />)}</div></DndContext></main></div>

    {showCreate && <div className="board-modal-backdrop" role="presentation"><form className="board-modal" onSubmit={(event) => void createTask(event)}><header><div><span>Backlog item</span><h2>Create task</h2></div><button type="button" title="Close" onClick={() => setShowCreate(false)}><X size={18} /></button></header><label>Title<input name="title" required autoFocus /></label><label>Description<textarea name="description" rows={3} /></label><div className="board-form-grid"><label>Folder<select name="folderId" defaultValue={folders.find((folder) => folder.folder_type === "backlog")?.id}>{folders.filter((folder) => !["releases", "sprints"].includes(folder.folder_type)).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><label>Priority<select name="priority" defaultValue="medium"><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label><label>Sprint<select name="sprintId" defaultValue={selectedSprintId === "all" ? "" : selectedSprintId}><option value="">Backlog only</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select></label><label>Release<select name="releaseId" defaultValue={selectedReleaseId === "all" ? "" : selectedReleaseId}><option value="">No release</option>{releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}</select></label><label>Assignee<select name="assigneeId"><option value="">Unassigned</option>{users.map((user) => <option key={user.user_id} value={user.user_id}>{user.display_name}</option>)}</select></label><label>Reviewer<select name="reviewerId"><option value="">Unassigned</option>{users.filter((user) => user.access_role !== "viewer").map((user) => <option key={user.user_id} value={user.user_id}>{user.display_name}</option>)}</select></label></div><label>Linked requirement<select name="requirementId"><option value="">No requirement link</option>{requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><footer><button type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="board-primary" type="submit"><Plus size={15} /> Create task</button></footer></form></div>}

    {selectedTask && <div className="board-modal-backdrop" role="presentation"><section className="board-modal task-detail"><header><div><span>{selectedTask.priority} priority</span><h2>{selectedTask.title}</h2></div><button title="Close" onClick={() => setSelectedTask(null)}><X size={18} /></button></header><p>{selectedTask.description || "No task description."}</p>{selectedTask.requirement_item_id && <div className="detail-requirement"><CircleDot size={14} /><span>Linked requirement</span><strong>{requirements.find((item) => item.id === selectedTask.requirement_item_id)?.title}</strong></div>}<div className="board-form-grid"><label>Assignee<select value={selectedTask.assignee_user_id || ""} disabled={!canManage} onChange={(event) => void updateAllocation(selectedTask, { assignee_user_id: event.target.value || null })}><option value="">Unassigned</option>{users.map((user) => <option key={user.user_id} value={user.user_id}>{user.display_name}</option>)}</select></label><label>Reviewer<select value={selectedTask.reviewer_user_id || ""} disabled={!canManage} onChange={(event) => void updateAllocation(selectedTask, { reviewer_user_id: event.target.value || null })}><option value="">Unassigned</option>{users.filter((user) => user.access_role !== "viewer").map((user) => <option key={user.user_id} value={user.user_id}>{user.display_name}</option>)}</select></label><label>Sprint<select value={selectedTask.sprint_id || ""} disabled={!canManage} onChange={(event) => void updateAllocation(selectedTask, { sprint_id: event.target.value || null })}><option value="">Backlog</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select></label><label>Release<select value={selectedTask.release_id || ""} disabled={!canManage} onChange={(event) => void updateAllocation(selectedTask, { release_id: event.target.value || null })}><option value="">No release</option>{releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}</select></label></div><div className="workflow-strip">{columns.map((column) => <button key={column.id} className={selectedTask.workflow_status === column.id ? "active" : ""} onClick={() => void transitionTask(selectedTask, column.id)}>{column.id === "done" && <Check size={13} />}{column.label}</button>)}</div><footer><span>{selectedTask.approved_at ? `Approved by ${users.find((user) => user.user_id === selectedTask.approved_by_user_id)?.display_name || "reviewer"}` : selectedTask.reviewed_at ? "Submitted for review" : "Approval pending"}</span>{selectedTask.workflow_status === "ready_for_review" && <button className="board-primary" onClick={() => void transitionTask(selectedTask, "done")}><ClipboardCheck size={15} /> Review & approve</button>}</footer></section></div>}

    {showTeam && <div className="board-modal-backdrop" role="presentation"><section className="board-modal team-modal"><header><div><span>Registered users</span><h2>Workspace team</h2></div><button title="Close" onClick={() => setShowTeam(false)}><X size={18} /></button></header><div className="team-list">{users.map((user) => <div key={user.user_id}><span className="assignee-avatar">{user.display_name.slice(0, 2).toUpperCase()}</span><div><strong>{user.display_name}</strong><small>{user.platform_category || "Registered user"}</small></div><b>{user.access_role}</b></div>)}</div>{accessRole === "owner" && !isPreview && <form className="team-invite" onSubmit={(event) => void inviteMember(event)}><label>Registered user email<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required /></label><label>Workspace access<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as typeof inviteRole)}><option value="viewer">Viewer</option><option value="editor">Editor</option></select></label><button className="board-primary" type="submit"><UserPlus size={15} /> Add user</button></form>}<footer><span>Only registered CodeWithKris accounts can be added.</span></footer></section></div>}
  </section>;
}