import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  ClipboardList,
  Coins,
  Globe2,
  Languages,
  LockKeyhole,
  MessageSquareCheck,
  Plus,
  ShieldCheck,
  Target,
  UsersRound,
} from "lucide-react";
import { supabase } from "../supabase";
import {
  DEFAULT_DEPARTMENT_SPLITS,
  STANDARD_MILESTONES,
  type GtmMessage,
  type GtmOutreachEvent,
  type GtmProject,
  type GtmTarget,
  type GtmTask,
  type MessageStatus,
  type OutreachChannel,
  type ParticipantGroup,
  type TaskStatus,
} from "../lib/gtmPilot";
import { type UserRole } from "./UserRegistration";

type View = "brief" | "tasks" | "targets" | "outreach" | "compensation";
type GtmPilotProjectProps = { userName: string; userEmail: string; userRole: UserRole; onBack: () => void };
type MilestoneConfig = { key: string; label: string; minimumHkd: number; maximumHkd: number };
type DepartmentSplit = { department: string; percentage: number };

const participantGroups: ParticipantGroup[] = ["PwD", "Student", "Woman", "Caregiver", "Mentor", "Open community"];
const taskStatuses: TaskStatus[] = ["backlog", "assigned", "in_progress", "awaiting_review"];
const channels: OutreachChannel[] = ["local_language", "email", "call", "video_call"];

export function GtmPilotProject({ userName, userEmail, userRole, onBack }: GtmPilotProjectProps) {
  const [view, setView] = useState<View>("brief");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [trustedAdmin, setTrustedAdmin] = useState(false);
  const [project, setProject] = useState<GtmProject | null>(null);
  const [tasks, setTasks] = useState<GtmTask[]>([]);
  const [targets, setTargets] = useState<GtmTarget[]>([]);
  const [messages, setMessages] = useState<GtmMessage[]>([]);
  const [events, setEvents] = useState<GtmOutreachEvent[]>([]);
  const [notice, setNotice] = useState(() => supabase ? "Loading your pilot workspace..." : "Local preview mode: governance actions are not published.");
  const [projectName, setProjectName] = useState("");
  const [objective, setObjective] = useState("");
  const [market, setMarket] = useState("");
  const [projectLanguages, setProjectLanguages] = useState("English, Cantonese");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState("target_research");
  const [participantGroup, setParticipantGroup] = useState<ParticipantGroup>("Open community");
  const [assigneeName, setAssigneeName] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [targetTitle, setTargetTitle] = useState("");
  const [targetSegment, setTargetSegment] = useState("");
  const [messageName, setMessageName] = useState("");
  const [messageLocale, setMessageLocale] = useState("en-HK");
  const [messageContent, setMessageContent] = useState("");
  const [outreachTarget, setOutreachTarget] = useState("");
  const [outreachChannel, setOutreachChannel] = useState<OutreachChannel>("local_language");
  const [outreachOutcome, setOutreachOutcome] = useState("");
  const [successFee, setSuccessFee] = useState(8);
  const [milestones, setMilestones] = useState<MilestoneConfig[]>(() => STANDARD_MILESTONES.map((item) => ({ ...item })));
  const [splits, setSplits] = useState<DepartmentSplit[]>(() => DEFAULT_DEPARTMENT_SPLITS.map((item) => ({ ...item })));

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    client.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      setCurrentUserId(user?.id || null);
      setTrustedAdmin(user?.email?.toLocaleLowerCase() === "roger.s@gradagig.com" || Boolean(user?.app_metadata?.financial_access) || user?.app_metadata?.role === "CodeWithKris Administrator");
      const { data: projects, error } = await client.from("gtm_projects").select("*").order("created_at", { ascending: false }).limit(1);
      if (error || !projects?.length) {
        setNotice(error ? "Apply the GTM Supabase schema to publish this workspace." : "Create the first client pilot brief.");
        return;
      }
      const loadedProject = projects[0] as GtmProject;
      setProject(loadedProject);
      const [taskResult, targetResult, messageResult, eventResult] = await Promise.all([
        client.from("gtm_tasks").select("*").eq("project_id", loadedProject.id).order("created_at"),
        client.from("gtm_anonymized_targets").select("*").eq("project_id", loadedProject.id).order("created_at"),
        client.from("gtm_messages").select("*").eq("project_id", loadedProject.id).order("created_at"),
        client.from("gtm_outreach_events").select("*").eq("project_id", loadedProject.id).order("occurred_at", { ascending: false }),
      ]);
      if (taskResult.data) setTasks(taskResult.data as GtmTask[]);
      if (targetResult.data) setTargets(targetResult.data as GtmTarget[]);
      if (messageResult.data) setMessages(messageResult.data as GtmMessage[]);
      if (eventResult.data) setEvents(eventResult.data as GtmOutreachEvent[]);
      setNotice("Pilot workspace synchronized with the cooperative ledger.");
    });
  }, []);

  const previewClient = import.meta.env.DEV && userRole === "Client";
  const ownsProject = Boolean(project && currentUserId && project.client_user_id === currentUserId);
  const canManageClientReview = trustedAdmin || ownsProject || previewClient;
  const canSeePricing = trustedAdmin || ownsProject || previewClient;
  const approvedMessages = messages.filter((message) => message.status === "approved");
  const splitTotal = splits.reduce((total, split) => total + split.percentage, 0);

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: GtmProject = {
      id: crypto.randomUUID(), client_user_id: currentUserId, client_name: userName || "Pilot Client",
      name: projectName.trim(), objective: objective.trim(), target_market: market.trim(),
      languages: projectLanguages.split(",").map((item) => item.trim()).filter(Boolean), status: "draft",
    };
    if (supabase && currentUserId) {
      const { error } = await supabase.from("gtm_projects").insert(next);
      if (error) return setNotice(`Pilot was not created: ${error.message}`);
    }
    setProject(next); setProjectName(""); setObjective(""); setMarket("");
    setNotice(supabase && currentUserId ? "Pilot brief created for client review." : "Draft pilot created in local preview mode.");
  };

  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!project) return;
    const normalizedAssignee = assigneeName.trim().toLocaleLowerCase();
    const isSelfAssigned = Boolean(currentUserId && normalizedAssignee && [userName, userEmail].some((value) => value.trim().toLocaleLowerCase() === normalizedAssignee));
    const task: GtmTask = { id: crypto.randomUUID(), project_id: project.id, task_type: taskType.trim(), title: taskTitle.trim(), description: "", participant_group: participantGroup, assignee_user_id: isSelfAssigned ? currentUserId : null, assignee_name: assigneeName.trim() || null, status: assigneeName.trim() ? "assigned" : "backlog", task_data: {}, ovu_status: "not_started", ovu_value: null };
    if (supabase) { const { error } = await supabase.from("gtm_tasks").insert(task); if (error) return setNotice(`Task was not shared: ${error.message}`); }
    setTasks((current) => [...current, task]); setTaskTitle(""); setAssigneeName(""); setNotice("Task added to the open-ended cooperative board.");
  };

  const updateTask = async (task: GtmTask, status: TaskStatus) => {
    if (status === "verified") return setNotice("Verified OVU is recorded through administrator verification.");
    const ovu_status = status === "awaiting_review" ? "pending_verification" : task.ovu_status;
    if (supabase) { const { error } = await supabase.from("gtm_tasks").update({ status, ovu_status }).eq("id", task.id); if (error) return setNotice(`Task was not updated: ${error.message}`); }
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status, ovu_status } : item));
  };

  const addTarget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!project) return;
    const target: GtmTarget = { id: crypto.randomUUID(), project_id: project.id, target_code: `TARGET-${String(targets.length + 1).padStart(3, "0")}`, company_name: targetCompany.trim(), contact_title: targetTitle.trim(), segment: targetSegment.trim(), market: project.target_market, status: "client_review", priority: null };
    if (supabase) { const { error } = await supabase.from("gtm_targets").insert(target); if (error) return setNotice(`Target was not shared: ${error.message}`); }
    setTargets((current) => [...current, target]); setTargetCompany(""); setTargetTitle(""); setTargetSegment("");
  };

  const prioritizeTarget = async (target: GtmTarget) => {
    if (!canManageClientReview) return;
    const priority = target.priority ? null : targets.filter((item) => item.priority).length + 1;
    const status = priority ? "prioritized" : "client_review";
    if (supabase) { const { error } = await supabase.from("gtm_targets").update({ priority, status }).eq("id", target.id); if (error) return setNotice(`Priority was not saved: ${error.message}`); }
    setTargets((current) => current.map((item) => item.id === target.id ? { ...item, priority, status } : item));
  };

  const addMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!project) return;
    const message: GtmMessage = { id: crypto.randomUUID(), project_id: project.id, name: messageName.trim(), locale: messageLocale.trim(), channel: outreachChannel, content: messageContent.trim(), status: "client_review" };
    if (supabase) { const { error } = await supabase.from("gtm_messages").insert(message); if (error) return setNotice(`Template was not shared: ${error.message}`); }
    setMessages((current) => [...current, message]); setMessageName(""); setMessageContent("");
  };

  const approveMessage = async (message: GtmMessage, status: MessageStatus) => {
    if (!canManageClientReview) return;
    if (supabase) { const { error } = await supabase.from("gtm_messages").update({ status }).eq("id", message.id); if (error) return setNotice(`Approval was not saved: ${error.message}`); }
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, status } : item));
  };

  const logOutreach = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!project) return;
    const approvedMessage = approvedMessages.find((message) => message.channel === outreachChannel);
    if (!approvedMessage) return setNotice(`Approve a ${outreachChannel.replaceAll("_", " ")} template before logging this outreach.`);
    const item: GtmOutreachEvent = { id: crypto.randomUUID(), project_id: project.id, target_code: outreachTarget, locale: approvedMessage.locale, channel: outreachChannel, outcome: outreachOutcome.trim(), occurred_at: new Date().toISOString(), appointment_at: outreachChannel === "video_call" ? new Date().toISOString() : null };
    if (supabase) { const { error } = await supabase.from("gtm_outreach_events").insert({ ...item, message_id: approvedMessage.id }); if (error) return setNotice(`Outreach was not logged: ${error.message}`); }
    setEvents((current) => [item, ...current]); setOutreachOutcome("");
  };

  const saveCompensation = async () => {
    if (!project || !canSeePricing || splitTotal !== 100) return;
    if (supabase) {
      const { error } = await supabase.rpc("configure_gtm_compensation", { project_id_input: project.id, success_fee_percent_input: successFee, milestones_input: milestones, splits_input: splits });
      if (error) return setNotice(`Compensation was not saved: ${error.message}`);
    }
    setNotice("Case-specific compensation terms validated. Department splits total 100%.");
  };

  const tabs: Array<{ id: View; label: string; icon: typeof Target; restricted?: boolean }> = [
    { id: "brief", label: "Pilot brief", icon: BriefcaseBusiness }, { id: "tasks", label: "Task board", icon: ClipboardList },
    { id: "targets", label: "Targets", icon: Target }, { id: "outreach", label: "Outreach", icon: Languages },
    { id: "compensation", label: "Compensation", icon: Coins, restricted: true },
  ];

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-28 sm:px-7" aria-labelledby="gtm-pilot-title">
      <button className="mb-4 inline-flex items-center gap-2 border-0 bg-transparent text-sm font-bold text-violet-700" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" />Back to dashboard</button>
      <header className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div><span className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Cooperative delivery workflow</span><h1 id="gtm-pilot-title" className="mt-1 text-3xl font-bold text-slate-950">Go-To-Market Pilot Project</h1><div className="mt-1 text-sm text-slate-600">Configurable research, outreach, approvals, compensation, and shared OVU evidence.</div></div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800"><ShieldCheck size={14} aria-hidden="true" />Role-protected workspace</span>
      </header>
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 pb-2" aria-label="Pilot workflow">
        {tabs.filter((tab) => !tab.restricted || canSeePricing).map(({ id, label, icon: Icon }) => <button key={id} className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-bold ${view === id ? "bg-slate-950 text-white" : "bg-white text-slate-600"}`} onClick={() => setView(id)}><Icon size={15} aria-hidden="true" />{label}</button>)}
      </nav>
      <div className="mb-4 rounded-md border-l-4 border-emerald-600 bg-emerald-50 px-4 py-2 text-xs text-emerald-900" role="status">{notice}</div>

      {view === "brief" && (!project ? <ProjectForm values={{ projectName, objective, market, projectLanguages }} setters={{ setProjectName, setObjective, setMarket, setProjectLanguages }} onSubmit={createProject} /> : <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]"><article className="rounded-lg border border-slate-200 bg-white p-5"><span className="text-xs font-bold uppercase tracking-[.12em] text-emerald-700">{project.status}</span><h2 className="mt-2 text-2xl font-bold text-slate-950">{project.name}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{project.objective}</p><dl className="mt-5 grid gap-3 sm:grid-cols-2"><Info label="Target market" value={project.target_market} /><Info label="Languages" value={project.languages.join(", ")} /><Info label="Client" value={project.client_name} /><Info label="Workflow" value="Research → approval → outreach → meeting" /></dl></article><aside className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white"><UsersRound className="text-emerald-400" aria-hidden="true" /><h2 className="mt-4 text-lg font-bold text-white">Designed for diverse teams</h2><p className="mt-2 text-sm leading-6 text-slate-300">Tasks can be shaped around access needs, local knowledge, flexible schedules, and participant strengths.</p><button className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-400" onClick={() => setView("tasks")}>Open task board <ChevronRight size={16} /></button></aside></div>)}

      {view === "tasks" && <div className="grid min-w-0 gap-4 lg:grid-cols-[.68fr_1.32fr]"><form className="h-fit rounded-lg border border-slate-200 bg-white p-4" onSubmit={addTask}><h2 className="text-lg font-bold text-slate-950">Create any task type</h2><Field label="Task title" value={taskTitle} setValue={setTaskTitle} placeholder="Example: Validate logistics segment" /><Field label="Task type key" value={taskType} setValue={setTaskType} placeholder="Future-safe identifier" /><label className="mt-3 block text-xs font-bold text-slate-700">Participant group<select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 font-normal" value={participantGroup} onChange={(event) => setParticipantGroup(event.target.value as ParticipantGroup)}>{participantGroups.map((group) => <option key={group}>{group}</option>)}</select></label><Field label="Assignee" value={assigneeName} setValue={setAssigneeName} placeholder="Optional member name" /><button className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 text-sm font-bold text-white" disabled={!project}><Plus size={16} />Add task</button></form><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{tasks.length ? tasks.map((task) => <article key={task.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4"><div className="flex justify-between gap-2"><span className="text-[10px] font-bold uppercase text-emerald-700">{task.task_type.replaceAll("_", " ")}</span><span className="text-[10px] font-bold uppercase text-slate-500">{task.status.replaceAll("_", " ")}</span></div><h3 className="mt-2 text-sm font-bold text-slate-950">{task.title}</h3><span className="mt-2 block text-xs text-slate-500">{task.participant_group} · {task.assignee_name || "Unassigned"}</span><label className="mt-3 block text-[10px] font-bold uppercase text-slate-500">Workflow state<select className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-xs font-normal text-slate-700" value={task.status} onChange={(event) => void updateTask(task, event.target.value as TaskStatus)}>{taskStatuses.map((status) => <option key={status}>{status.replaceAll("_", " ")}</option>)}</select></label><span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${task.ovu_status === "recorded" ? "bg-emerald-100 text-emerald-800" : task.ovu_status === "pending_verification" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>OVU: {task.ovu_status.replaceAll("_", " ")}{task.ovu_value !== null ? ` · ${task.ovu_value}` : ""}</span></article>) : <Empty title="No tasks yet" text="Create research, outreach, accessibility, QA, or future task types." />}</div></div>}

      {view === "targets" && <div className="grid min-w-0 gap-4 lg:grid-cols-[.65fr_1.35fr]"><form className="h-fit rounded-lg border border-slate-200 bg-white p-4" onSubmit={addTarget}><h2 className="text-lg font-bold text-slate-950">Add anonymized target</h2><p className="mt-1 text-xs leading-5 text-slate-500">Only company and role-level context enters this client view. Personal contact data remains in a separate protected table.</p><Field label="Company name" value={targetCompany} setValue={setTargetCompany} placeholder="Organization" /><Field label="Contact title" value={targetTitle} setValue={setTargetTitle} placeholder="Example: Head of Partnerships" /><Field label="Segment" value={targetSegment} setValue={setTargetSegment} placeholder="Example: Logistics" /><button className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 text-sm font-bold text-white" disabled={!project}><Plus size={16} />Add target</button></form><div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="grid grid-cols-[1fr_1fr_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase text-slate-500"><span>Company / role</span><span>Segment / market</span><span>Client priority</span></div>{targets.length ? targets.map((target) => <div key={target.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm"><div className="min-w-0"><strong className="block truncate text-slate-950">{target.company_name}</strong><span className="text-xs text-slate-500">{target.contact_title}</span></div><div><span className="block text-xs text-slate-700">{target.segment}</span><span className="text-[11px] text-slate-500">{target.market}</span></div><button className={`rounded-md px-3 py-2 text-xs font-bold ${target.priority ? "bg-emerald-700 text-white" : "border border-slate-300 text-slate-600"}`} onClick={() => void prioritizeTarget(target)} disabled={!canManageClientReview}>{target.priority ? `Priority ${target.priority}` : "Prioritize"}</button></div>) : <Empty title="No targets submitted" text="Research results will appear without personal contact details." />}</div></div>}

      {view === "outreach" && <div className="grid min-w-0 gap-4 lg:grid-cols-2"><section className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-950">Message approval</h2><MessageSquareCheck className="text-emerald-700" /></div><form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={addMessage}><Field label="Template name" value={messageName} setValue={setMessageName} placeholder="Local introduction" /><Field label="Locale" value={messageLocale} setValue={setMessageLocale} placeholder="en-HK" /><label className="text-xs font-bold text-slate-700 sm:col-span-2">Template<textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-300 p-3 font-normal" value={messageContent} onChange={(event) => setMessageContent(event.target.value)} required /></label><button className="rounded-md bg-slate-950 px-4 py-2 text-xs font-bold text-white sm:col-span-2" disabled={!project}>Send for client review</button></form><div className="mt-4 space-y-2">{messages.map((message) => <article className="rounded-md border border-slate-200 p-3" key={message.id}><div className="flex items-start justify-between gap-2"><div><strong className="text-sm text-slate-900">{message.name}</strong><span className="ml-2 text-xs text-slate-500">{message.locale} · {message.channel.replaceAll("_", " ")}</span></div><span className="text-[10px] font-bold uppercase text-slate-500">{message.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-xs leading-5 text-slate-600">{message.content}</p>{canManageClientReview && message.status === "client_review" && <button className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white" onClick={() => void approveMessage(message, "approved")}><Check size={13} />Approve template</button>}</article>)}</div></section><section className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-950">Conversion tracker</h2><Globe2 className="text-emerald-700" /></div><form className="mt-3 space-y-3" onSubmit={logOutreach}><label className="block text-xs font-bold text-slate-700">Prioritized target<select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 font-normal" value={outreachTarget} onChange={(event) => setOutreachTarget(event.target.value)} required><option value="">Select target</option>{targets.filter((target) => target.priority).map((target) => <option key={target.id} value={target.target_code}>{target.company_name} · {target.contact_title}</option>)}</select></label><label className="block text-xs font-bold text-slate-700">Channel<select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 font-normal" value={outreachChannel} onChange={(event) => setOutreachChannel(event.target.value as OutreachChannel)}>{channels.map((channel) => <option key={channel}>{channel.replaceAll("_", " ")}</option>)}</select></label><Field label="Outcome / appointment note" value={outreachOutcome} setValue={setOutreachOutcome} placeholder="Response, follow-up, or video-call time" /><button className="w-full rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40" disabled={!approvedMessages.length}>Log approved outreach</button>{!approvedMessages.length && <span className="block text-xs text-amber-700">Client approval of a message template is required before outreach can be logged.</span>}</form><div className="mt-4 space-y-2">{events.map((event) => <div className="flex items-center justify-between rounded-md bg-slate-50 p-3 text-xs" key={event.id}><span><strong className="text-slate-800">{event.target_code}</strong> · {event.locale}</span><span className="text-slate-500">{event.channel.replaceAll("_", " ")} · {event.outcome}</span></div>)}</div></section></div>}

      {view === "compensation" && (canSeePricing ? <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_1fr]"><section className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><Coins className="text-emerald-700" /><div><h2 className="text-lg font-bold text-slate-950">Dual-layer compensation</h2><p className="text-xs text-slate-500">Standard ranges are editable for each client pilot.</p></div></div><div className="mt-4 space-y-3">{milestones.map((milestone, index) => <div className="grid grid-cols-[1fr_90px_90px] items-end gap-2" key={milestone.key}><span className="text-xs font-bold text-slate-700">{milestone.label}</span><Money label="Minimum" value={milestone.minimumHkd} setValue={(value) => setMilestones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, minimumHkd: value } : item))} /><Money label="Maximum" value={milestone.maximumHkd} setValue={(value) => setMilestones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, maximumHkd: value } : item))} /></div>)}</div><label className="mt-4 block text-xs font-bold text-slate-700">Revenue success fee<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" type="number" min="8" max="10" step="0.25" value={successFee} onChange={(event) => setSuccessFee(Number(event.target.value))} /></label><span className="mt-2 block text-[11px] text-slate-500">Verified effort milestones are paid separately from the {successFee}% revenue-based success fee.</span></section><section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="text-lg font-bold text-slate-950">Internal success-fee split</h2><p className="mt-1 text-xs text-slate-500">Predefined cost-control percentages remain customizable case by case.</p><div className="mt-3 space-y-2">{splits.map((split, index) => <label className="grid grid-cols-[1fr_90px] items-center gap-3 text-xs font-bold text-slate-700" key={split.department}>{split.department}<input className="h-9 rounded-md border border-slate-300 px-2 text-right" type="number" min="0" max="100" value={split.percentage} onChange={(event) => setSplits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, percentage: Number(event.target.value) } : item))} /></label>)}</div><div className={`mt-3 rounded-md px-3 py-2 text-xs font-bold ${splitTotal === 100 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>Department total: {splitTotal}%</div><button className="mt-3 w-full rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40" onClick={() => void saveCompensation()} disabled={splitTotal !== 100}>Save case-specific terms</button><div className="mt-3 flex gap-2 rounded-md bg-slate-100 p-3 text-xs leading-5 text-slate-600"><LockKeyhole className="shrink-0" size={16} />Visible only to the owning client and authorized administrators.</div></section></div> : <Empty title="Compensation is restricted" text="Only the owning client and authorized administrators can view milestone pricing and success-fee terms." />)}
    </section>
  );
}

function ProjectForm({ values, setters, onSubmit }: { values: { projectName: string; objective: string; market: string; projectLanguages: string }; setters: { setProjectName: (value: string) => void; setObjective: (value: string) => void; setMarket: (value: string) => void; setProjectLanguages: (value: string) => void }; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="mx-auto grid max-w-3xl gap-3 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-2" onSubmit={onSubmit}><div className="sm:col-span-2"><h2 className="text-xl font-bold text-slate-950">Define a client pilot</h2><p className="mt-1 text-sm text-slate-500">Start with outcomes and markets; tasks and compensation remain configurable afterward.</p></div><Field label="Pilot name" value={values.projectName} setValue={setters.setProjectName} placeholder="Hong Kong market validation" /><Field label="Target market" value={values.market} setValue={setters.setMarket} placeholder="Region and segment" /><Field label="Outreach languages" value={values.projectLanguages} setValue={setters.setProjectLanguages} placeholder="Comma-separated locales" /><label className="text-xs font-bold text-slate-700 sm:col-span-2">Pilot objective<textarea className="mt-1 min-h-28 w-full rounded-md border border-slate-300 p-3 font-normal" value={values.objective} onChange={(event) => setters.setObjective(event.target.value)} required /></label><button className="rounded-md bg-emerald-700 px-5 py-3 text-sm font-bold text-white sm:col-span-2">Create pilot workspace</button></form>;
}

function Field({ label, value, setValue, placeholder }: { label: string; value: string; setValue: (value: string) => void; placeholder: string }) { return <label className="mt-3 block text-xs font-bold text-slate-700">{label}<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 font-normal" value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} required /></label>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-slate-50 p-3"><dt className="text-[10px] font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm font-bold text-slate-800">{value}</dd></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="col-span-full grid min-h-40 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center"><div><strong className="text-slate-900">{title}</strong><span className="mt-1 block text-sm text-slate-500">{text}</span></div></div>; }
function Money({ label, value, setValue }: { label: string; value: number; setValue: (value: number) => void }) { return <label className="text-[10px] font-bold uppercase text-slate-500">{label}<div className="mt-1 flex h-9 items-center rounded-md border border-slate-300 px-2"><span>HK$</span><input className="min-w-0 flex-1 border-0 px-1 text-right text-xs" type="number" min="0" value={value} onChange={(event) => setValue(Number(event.target.value))} /></div></label>; }