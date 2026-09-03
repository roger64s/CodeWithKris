import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AlertTriangle, Bold, Braces, CheckCircle2, ChevronDown, ChevronRight, CircleDot, FileCheck2, GitBranch, Heading2, Highlighter, Italic, Link2, List, ListOrdered, Plus, RefreshCw, Save, Trash2, UnderlineIcon, Users } from "lucide-react";
import { supabase } from "../supabase";
import "./RequirementsWorkspace.css";
import { ProjectOperations } from "./ProjectOperations";

type ItemType = "product_requirement" | "feature" | "user_story" | "task" | "technical_specification" | "test_case" | "issue";
type ItemStatus = "draft" | "review" | "approved" | "implemented" | "verified" | "blocked";
type TraceType = "derives" | "satisfies" | "implements" | "verifies" | "blocks" | "relates";
type ClientCompany = { id: string; co_name: string };
type Workspace = { id: string; client_company_id: string | null; name: string; description: string; owner_user_id: string };
type RequirementItem = { id: string; workspace_id: string; parent_id: string | null; item_type: ItemType; title: string; content: JSONContent; status: ItemStatus; sort_order: number; version: number; updated_at: string };
type TraceLink = { id: string; source_item_id: string; target_item_id: string; link_type: TraceType; rationale: string };
type ImpactItem = RequirementItem & { depth: number; direction: "origin" | "forward" | "backward"; via_link_type: TraceType | null };
type PresenceUser = { userId: string; name: string; editingItemId: string | null };
type View = "editor" | "traceability" | "operations";

const typeLabels: Record<ItemType, string> = {
  product_requirement: "Product Requirement", feature: "Feature", user_story: "User Story", task: "Task",
  technical_specification: "Technical Specification", test_case: "Test Case", issue: "Issue",
};
const typeIcons: Record<ItemType, typeof CircleDot> = {
  product_requirement: CircleDot, feature: GitBranch, user_story: Users, task: CheckCircle2,
  technical_specification: Braces, test_case: FileCheck2, issue: AlertTriangle,
};
const childTypes: Record<ItemType, ItemType[]> = {
  product_requirement: ["feature"], feature: ["user_story", "issue"],
  user_story: ["task", "technical_specification", "test_case", "issue"], task: ["test_case", "issue"],
  technical_specification: ["test_case", "issue"], test_case: ["issue"], issue: [],
};
const automaticLink: Record<ItemType, TraceType> = { product_requirement: "relates", feature: "derives", user_story: "satisfies", task: "implements", technical_specification: "implements", test_case: "verifies", issue: "blocks" };
const emptyDocument: JSONContent = { type: "doc", content: [] };
const sampleClient: ClientCompany = { id: "preview-client", co_name: "Inclusive Learning Co." };
const sampleWorkspace: Workspace = { id: "preview-workspace", client_company_id: sampleClient.id, name: "Accessible Learning Platform", description: "Phase 2 delivery requirements", owner_user_id: "preview-user" };
const sampleItems: RequirementItem[] = [
  { id: "req-1", workspace_id: sampleWorkspace.id, parent_id: null, item_type: "product_requirement", title: "Accessible requirements collaboration", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Teams must be able to define, review, and trace delivery requirements together." }] }] }, status: "approved", sort_order: 0, version: 3, updated_at: new Date().toISOString() },
  { id: "feature-1", workspace_id: sampleWorkspace.id, parent_id: "req-1", item_type: "feature", title: "Hierarchical requirements workspace", content: { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Table of Contents" }] }, { type: "paragraph", content: [{ type: "text", text: "Users can navigate from product requirements to implementation details without losing context." }] }] }, status: "review", sort_order: 0, version: 5, updated_at: new Date().toISOString() },
  { id: "story-1", workspace_id: sampleWorkspace.id, parent_id: "feature-1", item_type: "user_story", title: "Navigate requirements by hierarchy", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "As a project manager, I want a persistent tree so I can understand scope at a glance." }] }] }, status: "implemented", sort_order: 0, version: 2, updated_at: new Date().toISOString() },
  { id: "test-1", workspace_id: sampleWorkspace.id, parent_id: "story-1", item_type: "test_case", title: "Tree preserves parent-child order", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Verify that children appear beneath the correct parent and retain their configured order." }] }] }, status: "verified", sort_order: 0, version: 1, updated_at: new Date().toISOString() },
  { id: "issue-1", workspace_id: sampleWorkspace.id, parent_id: "test-1", item_type: "issue", title: "Mobile tree needs compact mode", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The hierarchy must remain usable below 760px." }] }] }, status: "blocked", sort_order: 0, version: 1, updated_at: new Date().toISOString() },
];
const sampleLinks: TraceLink[] = [
  { id: "link-1", source_item_id: "req-1", target_item_id: "feature-1", link_type: "derives", rationale: "Feature delivers the product requirement" },
  { id: "link-2", source_item_id: "feature-1", target_item_id: "story-1", link_type: "satisfies", rationale: "Story defines the user outcome" },
  { id: "link-3", source_item_id: "story-1", target_item_id: "test-1", link_type: "verifies", rationale: "Test proves the story" },
  { id: "link-4", source_item_id: "issue-1", target_item_id: "story-1", link_type: "blocks", rationale: "Responsive behavior is unresolved" },
];
const isPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "requirements";

export function RequirementsWorkspace({ onOpenCoopEquity = () => undefined }: { onOpenCoopEquity?: () => void }) {
  const [clients, setClients] = useState<ClientCompany[]>(isPreview ? [sampleClient] : []);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(isPreview ? [sampleWorkspace] : []);
  const [workspace, setWorkspace] = useState<Workspace | null>(isPreview ? sampleWorkspace : null);
  const [items, setItems] = useState<RequirementItem[]>(isPreview ? sampleItems : []);
  const [links, setLinks] = useState<TraceLink[]>(isPreview ? sampleLinks : []);
  const [selectedId, setSelectedId] = useState<string | null>(isPreview ? "feature-1" : null);
  const [expanded, setExpanded] = useState<Set<string>>(() => isPreview ? new Set(["req-1", "feature-1", "story-1", "test-1"]) : new Set());
  const [view, setView] = useState<View>("editor");
  const [accessRole, setAccessRole] = useState<"owner" | "editor" | "viewer">(isPreview ? "owner" : "viewer");
  const [presence, setPresence] = useState<PresenceUser[]>(isPreview ? [{ userId: "preview-user", name: "You", editingItemId: "feature-1" }, { userId: "reviewer", name: "Maya Chen", editingItemId: "story-1" }] : []);
  const [notice, setNotice] = useState(isPreview ? "Preview workspace" : supabase ? "Loading requirements..." : "Connect Supabase to open Requirements Management.");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "conflict">("saved");
  const [newClientId, setNewClientId] = useState(isPreview ? sampleClient.id : "");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newItemType, setNewItemType] = useState<ItemType>("product_requirement");
  const [targetId, setTargetId] = useState("");
  const [traceType, setTraceType] = useState<TraceType>("relates");
  const [impact, setImpact] = useState<ImpactItem[]>([]);
  const [impactDirection, setImpactDirection] = useState<"both" | "forward" | "backward">("both");
  const selectedRef = useRef<RequirementItem | null>(null);
  const saveTimer = useRef<number | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const presenceProfileRef = useRef<Omit<PresenceUser, "editingItemId"> | null>(null);
  const workspaceId = workspace?.id;
  const selected = items.find((item) => item.id === selectedId) || null;
  const canEdit = accessRole === "owner" || accessRole === "editor" || isPreview;

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true } }), Highlight, Placeholder.configure({ placeholder: "Describe the requirement, acceptance criteria, constraints, and decisions..." })],
    content: emptyDocument,
    onUpdate: ({ editor: currentEditor }) => {
      if (!canEdit || !selectedRef.current) return;
      setSaveState("saving");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveContent(currentEditor.getJSON()), 700);
    },
  });

  useEffect(() => { editor?.setEditable(canEdit); }, [canEdit, editor]);
  useEffect(() => {
    selectedRef.current = selected;
    if (editor && selected && !editor.isFocused) editor.commands.setContent(selected.content || emptyDocument, { emitUpdate: false });
  }, [editor, selected]);

  useEffect(() => {
    if (!presenceChannelRef.current || !presenceProfileRef.current) return;
    void presenceChannelRef.current.track({ ...presenceProfileRef.current, editingItemId: selectedId });
  }, [selectedId]);

  useEffect(() => {
    if (isPreview || !supabase) return;
    const client = supabase;
    const load = async () => {
      const [workspaceResult, clientResult] = await Promise.all([
        client.from("requirement_workspaces").select("id, client_company_id, name, description, owner_user_id").order("updated_at", { ascending: false }),
        client.from("companies").select("id,co_name").eq("co_type", "Client").order("co_name"),
      ]);
      if (workspaceResult.error || clientResult.error) { setNotice("Apply the CRM and requirements migrations to enable Client projects."); return; }
      const loaded = (workspaceResult.data || []) as Workspace[];
      setClients((clientResult.data || []) as ClientCompany[]);
      setWorkspaces(loaded); if (loaded[0]) setWorkspace(loaded[0]); else setNotice("Create a workspace to begin defining requirements.");
    };
    void load();
  }, []);

  useEffect(() => {
    if (!workspaceId || isPreview || !supabase) return;
    const client = supabase;
    const load = async () => {
      setNotice("Synchronizing requirements...");
      const { data: auth } = await client.auth.getUser();
      const [itemResult, linkResult, memberResult] = await Promise.all([
        client.from("requirement_items").select("*").eq("workspace_id", workspaceId).order("sort_order").order("created_at"),
        client.from("requirement_trace_links").select("*").eq("workspace_id", workspaceId).order("created_at"),
        client.from("requirement_workspace_members").select("access_role").eq("workspace_id", workspaceId).eq("user_id", auth.user?.id || "").maybeSingle(),
      ]);
      if (itemResult.error || linkResult.error) { setNotice(itemResult.error?.message || linkResult.error?.message || "Unable to load workspace."); return; }
      const loadedItems = (itemResult.data || []) as RequirementItem[];
      setItems(loadedItems); setLinks((linkResult.data || []) as TraceLink[]);
      setAccessRole((memberResult.data?.access_role as typeof accessRole) || "viewer");
      setSelectedId((current) => loadedItems.some((item) => item.id === current) ? current : loadedItems[0]?.id || null);
      setExpanded(new Set(loadedItems.filter((item) => !item.parent_id).map((item) => item.id)));
      setNotice(`${loadedItems.length} items synchronized`);
    };
    void load();
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || isPreview || !supabase) return;
    const client = supabase;
    const channel = client.channel(`requirements:${workspaceId}`, { config: { presence: { key: crypto.randomUUID() } } });
    presenceChannelRef.current = channel;
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "requirement_items", filter: `workspace_id=eq.${workspaceId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          setItems((current) => current.filter((item) => item.id !== (payload.old as { id: string }).id));
          return;
        }
        const changed = payload.new as RequirementItem;
        setItems((current) => [...current.filter((item) => item.id !== changed.id), changed]);
        if (changed.id === selectedRef.current?.id && !editor?.isFocused) editor?.commands.setContent(changed.content, { emitUpdate: false });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "requirement_trace_links", filter: `workspace_id=eq.${workspaceId}` }, async () => {
        const { data } = await client.from("requirement_trace_links").select("*").eq("workspace_id", workspaceId).order("created_at");
        if (data) setLinks(data as TraceLink[]);
      })
      .on("presence", { event: "sync" }, () => setPresence(Object.values(channel.presenceState()).flat().map((entry) => entry as unknown as PresenceUser)))
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        const { data } = await client.auth.getUser();
        presenceProfileRef.current = { userId: data.user?.id || "", name: data.user?.user_metadata?.full_name || data.user?.email || "Collaborator" };
        await channel.track({ ...presenceProfileRef.current, editingItemId: selectedRef.current?.id || null });
      });
    return () => { presenceChannelRef.current = null; presenceProfileRef.current = null; void channel.untrack(); void client.removeChannel(channel); };
  }, [workspaceId, editor]);

  async function saveContent(content: JSONContent) {
    const current = selectedRef.current;
    if (!current) return;
    if (isPreview || !supabase) {
      setItems((all) => all.map((item) => item.id === current.id ? { ...item, content, version: item.version + 1, updated_at: new Date().toISOString() } : item));
      setSaveState("saved"); return;
    }
    const { data, error } = await supabase.from("requirement_items").update({ content }).eq("id", current.id).eq("version", current.version).select("*").maybeSingle();
    if (error || !data) { setSaveState("conflict"); setNotice("A collaborator saved a newer version. Refresh this item before continuing."); return; }
    setItems((all) => all.map((item) => item.id === current.id ? data as RequirementItem : item)); setSaveState("saved");
  }

  async function createWorkspace() {
    const name = newWorkspaceName.trim(); if (!name || !newClientId || !supabase) return;
    const { data, error } = await supabase.from("requirement_workspaces").insert({ name, client_company_id: newClientId }).select("id, client_company_id, name, description, owner_user_id").single();
    if (error) return setNotice(error.message);
    const created = data as Workspace; setWorkspaces((current) => [created, ...current]); setWorkspace(created); setNewWorkspaceName(""); setNewClientId("");
  }

  async function createItem(parent: RequirementItem | null, itemType: ItemType) {
    if (!workspace || !canEdit) return;
    const draft = { workspace_id: workspace.id, parent_id: parent?.id || null, item_type: itemType, title: `New ${typeLabels[itemType]}`, sort_order: items.filter((item) => item.parent_id === parent?.id).length };
    if (isPreview || !supabase) {
      const created = { ...draft, id: crypto.randomUUID(), content: emptyDocument, status: "draft" as const, version: 1, updated_at: new Date().toISOString() };
      setItems((current) => [...current, created]);
      if (parent) { setLinks((current) => [...current, { id: crypto.randomUUID(), source_item_id: parent.id, target_item_id: created.id, link_type: automaticLink[itemType], rationale: "Created from hierarchy" }]); setExpanded((current) => new Set(current).add(parent.id)); }
      setSelectedId(created.id); setView("editor"); return;
    }
    const { data, error } = await supabase.from("requirement_items").insert(draft).select("*").single();
    if (error) return setNotice(error.message);
    const created = data as RequirementItem;
    if (parent) setExpanded((current) => new Set(current).add(parent.id));
    setItems((current) => [...current, created]); setSelectedId(created.id); setView("editor");
  }

  async function updateItem(changes: Partial<Pick<RequirementItem, "title" | "status">>) {
    if (!selected || !canEdit) return;
    if (isPreview || !supabase) { setItems((all) => all.map((item) => item.id === selected.id ? { ...item, ...changes, version: item.version + 1 } : item)); return; }
    const { data, error } = await supabase.from("requirement_items").update(changes).eq("id", selected.id).eq("version", selected.version).select("*").maybeSingle();
    if (error || !data) return setSaveState("conflict");
    setItems((all) => all.map((item) => item.id === selected.id ? data as RequirementItem : item));
  }

  async function deleteSelected() {
    if (!selected || !canEdit || !window.confirm(`Delete “${selected.title}” and its children?`)) return;
    if (!isPreview && supabase) { const { error } = await supabase.from("requirement_items").delete().eq("id", selected.id); if (error) return setNotice(error.message); }
    const descendants = new Set<string>([selected.id]); let changed = true;
    while (changed) { changed = false; items.forEach((item) => { if (item.parent_id && descendants.has(item.parent_id) && !descendants.has(item.id)) { descendants.add(item.id); changed = true; } }); }
    setItems((all) => all.filter((item) => !descendants.has(item.id))); setLinks((all) => all.filter((link) => !descendants.has(link.source_item_id) && !descendants.has(link.target_item_id)));
    setSelectedId(items.find((item) => !descendants.has(item.id))?.id || null);
  }

  async function addTraceLink() {
    if (!workspace || !selected || !targetId || targetId === selected.id || !canEdit) return;
    const draft = { workspace_id: workspace.id, source_item_id: selected.id, target_item_id: targetId, link_type: traceType, rationale: "Added from traceability matrix" };
    if (isPreview || !supabase) setLinks((current) => [...current, { ...draft, id: crypto.randomUUID() }]);
    else { const { data, error } = await supabase.from("requirement_trace_links").insert(draft).select("*").single(); if (error) return setNotice(error.message); setLinks((current) => [...current, data as TraceLink]); }
    setTargetId("");
  }

  async function analyzeImpact() {
    if (!selected) return;
    if (isPreview || !supabase) {
      const adjacent = links.filter((link) => link.source_item_id === selected.id || link.target_item_id === selected.id).map((link) => {
        const direction = link.source_item_id === selected.id ? "forward" : "backward";
        const id = direction === "forward" ? link.target_item_id : link.source_item_id;
        return { ...items.find((item) => item.id === id)!, depth: 1, direction, via_link_type: link.link_type } as ImpactItem;
      }).filter((item) => impactDirection === "both" || item.direction === impactDirection);
      setImpact([{ ...selected, depth: 0, direction: "origin", via_link_type: null }, ...adjacent]); return;
    }
    const { data, error } = await supabase.rpc("requirement_impact_analysis", { item_id_input: selected.id, direction_input: impactDirection });
    if (error) return setNotice(error.message); setImpact((data || []) as ImpactItem[]);
  }

  function renderTree(parentId: string | null, depth = 0): React.ReactNode {
    return items.filter((item) => item.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order).map((item) => {
      const children = items.some((candidate) => candidate.parent_id === item.id); const open = expanded.has(item.id); const Icon = typeIcons[item.item_type];
      return <div key={item.id}><div className={`req-tree-row ${selectedId === item.id ? "selected" : ""}`} style={{ "--tree-depth": depth } as React.CSSProperties}>
        <button className="req-tree-toggle" aria-label={open ? "Collapse" : "Expand"} disabled={!children} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>{children ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span />}</button>
        <button className="req-tree-item" onClick={() => { setSelectedId(item.id); setImpact([]); }}><Icon size={15} /><span><strong>{item.title}</strong><small>{typeLabels[item.item_type]}</small></span></button>
      </div>{children && open ? renderTree(item.id, depth + 1) : null}</div>;
    });
  }

  const traceForSelected = selected ? links.filter((link) => link.source_item_id === selected.id || link.target_item_id === selected.id) : [];
  const selectedChildTypes = selected ? childTypes[selected.item_type] : [];
  const effectiveNewItemType = selectedChildTypes.includes(newItemType) ? newItemType : selectedChildTypes[0];

  return <section className="requirements-module">
    <header className="requirements-header"><div><span className="requirements-kicker">Delivery governance</span><h1>Requirements Management</h1></div><div className="requirements-presence" aria-label={`${presence.length} collaborators online`}><div className="presence-avatars">{presence.slice(0, 4).map((person) => <span key={person.userId} title={`${person.name}${person.editingItemId ? " · editing" : ""}`}>{person.name.slice(0, 2).toUpperCase()}</span>)}</div><span>{presence.length || 1} online</span></div></header>
    <div className="requirements-toolbar-row">
      <select aria-label="Requirements project" value={workspace?.id || ""} onChange={(event) => setWorkspace(workspaces.find((item) => item.id === event.target.value) || null)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name} · {clients.find((client) => client.id === item.client_company_id)?.co_name || "Client link pending"}</option>)}{!workspaces.length && <option value="">No project</option>}</select>
      <div className="workspace-create"><select aria-label="New project client" value={newClientId} onChange={(event) => setNewClientId(event.target.value)}><option value="">Select Client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.co_name}</option>)}</select><input value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} placeholder="New project name" /><button title="Create project" onClick={() => void createWorkspace()} disabled={!newClientId || !newWorkspaceName.trim() || !supabase}><Plus size={17} /></button></div><span className="requirements-notice">{notice}</span>
    </div>
    <div className="requirements-body">
      <aside className="requirements-tree-pane"><div className="pane-heading"><div><span>Table of Contents</span><small>{items.length} items</small></div><button title="Add product requirement" onClick={() => void createItem(null, "product_requirement")} disabled={!workspace || !canEdit}><Plus size={17} /></button></div><div className="requirements-tree">{items.length ? renderTree(null) : <p className="requirements-empty">Start with a product requirement.</p>}</div></aside>
      <main className="requirements-main-pane">
        <div className="requirements-tabs" role="tablist"><button className={view === "editor" ? "active" : ""} onClick={() => setView("editor")}>Editor</button><button className={view === "traceability" ? "active" : ""} onClick={() => setView("traceability")}>Traceability <span>{links.length}</span></button><button className={view === "operations" ? "active" : ""} onClick={() => setView("operations")}>Operations</button></div>
        {view === "operations" && workspace ? <ProjectOperations workspaceId={workspace.id} canEdit={canEdit} preview={isPreview} onOpenCoopEquity={onOpenCoopEquity} /> : !selected ? <div className="requirements-blank"><GitBranch size={30} /><h2>Select a requirement</h2><p>Choose an item from the Table of Contents or create a product requirement.</p></div> : view === "editor" ? <>
          <div className="requirement-meta"><span className={`requirement-type type-${selected.item_type}`}>{typeLabels[selected.item_type]}</span><input className="requirement-title" value={selected.title} readOnly={!canEdit} onChange={(event) => setItems((all) => all.map((item) => item.id === selected.id ? { ...item, title: event.target.value } : item))} onBlur={(event) => void updateItem({ title: event.target.value.trim() || selected.title })} /><select value={selected.status} disabled={!canEdit} onChange={(event) => void updateItem({ status: event.target.value as ItemStatus })}>{(["draft", "review", "approved", "implemented", "verified", "blocked"] as ItemStatus[]).map((status) => <option key={status}>{status}</option>)}</select></div>
          <div className="editor-toolbar" aria-label="Text formatting"><button title="Bold" className={editor?.isActive("bold") ? "active" : ""} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16} /></button><button title="Italic" className={editor?.isActive("italic") ? "active" : ""} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16} /></button><button title="Underline" className={editor?.isActive("underline") ? "active" : ""} onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16} /></button><button title="Highlight" className={editor?.isActive("highlight") ? "active" : ""} onClick={() => editor?.chain().focus().toggleHighlight().run()}><Highlighter size={16} /></button><span /><button title="Heading" className={editor?.isActive("heading", { level: 2 }) ? "active" : ""} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={17} /></button><button title="Bullet list" className={editor?.isActive("bulletList") ? "active" : ""} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={17} /></button><button title="Numbered list" className={editor?.isActive("orderedList") ? "active" : ""} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={17} /></button><button title="Add link" className={editor?.isActive("link") ? "active" : ""} onClick={() => { const url = window.prompt("Link URL", editor?.getAttributes("link").href || "https://"); if (url === null) return; if (!url) editor?.chain().focus().unsetLink().run(); else editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run(); }}><Link2 size={16} /></button></div>
          <EditorContent editor={editor} className="requirement-editor" />
          <footer className="editor-footer"><span className={`save-indicator ${saveState}`}><Save size={14} />{saveState === "saving" ? "Saving..." : saveState === "conflict" ? "Newer version available" : `Saved · v${selected.version}`}</span><div className="editor-actions">{selectedChildTypes.length > 0 && <><select value={effectiveNewItemType} onChange={(event) => setNewItemType(event.target.value as ItemType)}>{selectedChildTypes.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select><button onClick={() => void createItem(selected, effectiveNewItemType)}><Plus size={15} /> Add child</button></>}<button className="danger" title="Delete item" onClick={() => void deleteSelected()} disabled={!canEdit}><Trash2 size={15} /></button></div></footer>
        </> : <div className="traceability-view">
          <section className="trace-summary"><div><span>Selected item</span><strong>{selected.title}</strong></div><div><span>Direct links</span><strong>{traceForSelected.length}</strong></div><div><span>Coverage</span><strong>{traceForSelected.some((link) => link.link_type === "verifies") ? "Verified" : "Review"}</strong></div></section>
          <section className="trace-controls"><select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Link to item...</option>{items.filter((item) => item.id !== selected.id).map((item) => <option key={item.id} value={item.id}>{typeLabels[item.item_type]} · {item.title}</option>)}</select><select value={traceType} onChange={(event) => setTraceType(event.target.value as TraceType)}>{(["derives", "satisfies", "implements", "verifies", "blocks", "relates"] as TraceType[]).map((type) => <option key={type}>{type}</option>)}</select><button onClick={() => void addTraceLink()} disabled={!targetId || !canEdit}><Link2 size={15} /> Link</button></section>
          <div className="trace-table-wrap"><table className="trace-table"><thead><tr><th>Source</th><th>Relationship</th><th>Target</th><th>State</th></tr></thead><tbody>{links.map((link) => { const source = items.find((item) => item.id === link.source_item_id); const target = items.find((item) => item.id === link.target_item_id); return <tr key={link.id} className={link.source_item_id === selected.id || link.target_item_id === selected.id ? "highlighted" : ""}><td><small>{source ? typeLabels[source.item_type] : "Item"}</small>{source?.title || "Deleted item"}</td><td><span className={`trace-pill ${link.link_type}`}>{link.link_type}</span></td><td><small>{target ? typeLabels[target.item_type] : "Item"}</small>{target?.title || "Deleted item"}</td><td>{target?.status || "unknown"}</td></tr>; })}</tbody></table></div>
          <section className="impact-panel"><div className="impact-heading"><div><span>Impact analysis</span><small>Recursive dependency scan</small></div><div><select value={impactDirection} onChange={(event) => setImpactDirection(event.target.value as typeof impactDirection)}><option value="both">Forward & backward</option><option value="forward">Forward only</option><option value="backward">Backward only</option></select><button onClick={() => void analyzeImpact()}><RefreshCw size={15} /> Analyze</button></div></div>{impact.length ? <div className="impact-list">{impact.sort((a, b) => a.depth - b.depth).map((item) => <button key={`${item.id}-${item.direction}`} onClick={() => setSelectedId(item.id)}><span className={`impact-direction ${item.direction}`}>{item.direction}</span><strong>{item.title}</strong><small>{item.depth ? `${item.via_link_type} · ${item.depth} hop${item.depth === 1 ? "" : "s"}` : "Analysis origin"}</small></button>)}</div> : <p className="requirements-empty">Run analysis to reveal upstream and downstream effects.</p>}</section>
        </div>}
      </main>
    </div>
  </section>;
}