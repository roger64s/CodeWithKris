import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { BarChart3, Inbox, MessageSquare, Paperclip, Plus, Send, TicketCheck, X } from "lucide-react";
import { supabase } from "../supabase";
import "./SupportWorkspace.css";

type RequestType = "bug" | "feature" | "training" | "network" | "other";
type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type View = "submit" | "tickets" | "queue" | "analytics";
type Ticket = {
  id: string;
  requester_email: string;
  requester_display_name: string;
  request_type: RequestType;
  title: string;
  description: JSONContent;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
};
type TicketMessage = { id: string; sender_role: "user" | "support_agent"; body: JSONContent; created_at: string };
type Attachment = { id: string; message_id: string | null; file_name: string; size_bytes: number; url: string | null };
type TicketDetail = { ticket: Ticket; messages: TicketMessage[]; attachments: Attachment[] };
type Capabilities = { role: string; canManage: boolean; canViewAnalytics: boolean };
type Analytics = { totalOpen: number; byCategory: Record<RequestType, number>; averageResponseMinutes: number | null; resolvedLast30Days: number };

const EMPTY_DOCUMENT: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };
const TYPES: Array<{ value: RequestType; label: string }> = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "training", label: "Training" },
  { value: "network", label: "Network" },
  { value: "other", label: "Other" },
];
const STATUSES: Array<{ value: TicketStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

async function supportApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/v1/tickets${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Support request failed.");
  return payload;
}

function RichTextEditor({ editor, label }: { editor: ReturnType<typeof useEditor>; label: string }) {
  if (!editor) return null;
  return <div className="support-editor">
    <div className="support-editor-toolbar" aria-label={`${label} formatting`}>
      <button type="button" className={editor.isActive("bold") ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><strong>B</strong></button>
      <button type="button" className={editor.isActive("italic") ? "active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><em>I</em></button>
      <button type="button" className={editor.isActive("bulletList") ? "active" : ""} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">•</button>
      <button type="button" className={editor.isActive("orderedList") ? "active" : ""} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">1.</button>
    </div>
    <EditorContent editor={editor} aria-label={label} />
  </div>;
}

function RichDocument({ document }: { document: JSONContent }) {
  const renderNode = (node: JSONContent, key: number): ReactNode => {
    if (node.type === "text") {
      let content: ReactNode = node.text || "";
      node.marks?.forEach((mark) => {
        if (mark.type === "bold") content = <strong>{content}</strong>;
        if (mark.type === "italic") content = <em>{content}</em>;
        if (mark.type === "code") content = <code>{content}</code>;
      });
      return <span key={key}>{content}</span>;
    }
    const children = node.content?.map(renderNode);
    if (node.type === "paragraph") return <p key={key}>{children || <br />}</p>;
    if (node.type === "bulletList") return <ul key={key}>{children}</ul>;
    if (node.type === "orderedList") return <ol key={key}>{children}</ol>;
    if (node.type === "listItem") return <li key={key}>{children}</li>;
    if (node.type === "hardBreak") return <br key={key} />;
    return <div key={key}>{children}</div>;
  };
  return <div className="support-rich-document">{document.content?.map(renderNode)}</div>;
}

function AttachmentPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return <div className="support-attachments">
    <button type="button" className="support-upload" onClick={() => inputRef.current?.click()}>
      <Paperclip size={18} />
      <span><strong>Add attachments or screenshots</strong><small>PNG, JPG, WebP, PDF, or text. Up to 5 files, 10 MB each.</small></span>
    </button>
    <input ref={inputRef} hidden type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" onChange={(event) => onChange(Array.from(event.target.files || []).slice(0, 5))} />
    {files.length > 0 && <div className="support-file-list">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}><X size={14} /></button></span>)}</div>}
  </div>;
}

const statusLabel = (status: TicketStatus) => STATUSES.find((item) => item.value === status)?.label || status;
const typeLabel = (type: RequestType) => TYPES.find((item) => item.value === type)?.label || type;
const formatDuration = (minutes: number | null) => minutes === null ? "No replies yet" : minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} hr`;

export function SupportWorkspace() {
  const [view, setView] = useState<View>("submit");
  const [capabilities, setCapabilities] = useState<Capabilities>({ role: "", canManage: false, canViewAnalytics: false });
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [requestType, setRequestType] = useState<RequestType>("bug");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const descriptionEditor = useEditor({ extensions: [StarterKit, Placeholder.configure({ placeholder: "Describe what happened, what you expected, and any steps that may help us reproduce it." })], content: EMPTY_DOCUMENT });
  const replyEditor = useEditor({ extensions: [StarterKit, Placeholder.configure({ placeholder: "Write a reply..." })], content: EMPTY_DOCUMENT });

  const loadTickets = async (manage = capabilities.canManage, filters = { type: typeFilter, status: statusFilter }) => {
    const params = new URLSearchParams();
    if (manage && filters.type) params.set("type", filters.type);
    if (manage && filters.status) params.set("status", filters.status);
    setTickets(await supportApi<Ticket[]>(`/?${params}`));
  };

  const openTicket = async (ticketId: string) => {
    setBusy(true);
    try { setSelected(await supportApi<TicketDetail>(`/${ticketId}`)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to load ticket."); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    supportApi<Capabilities>("/capabilities").then((access) => {
      setCapabilities(access);
      return supportApi<Ticket[]>("/").then(setTickets);
    }).catch((error) => setNotice(error.message));
  }, []);

  const submitTicket = async () => {
    if (!descriptionEditor || descriptionEditor.isEmpty) return setNotice("Add a description before submitting.");
    setBusy(true);
    setNotice("");
    const form = new FormData();
    form.set("requestType", requestType);
    form.set("title", title);
    form.set("description", JSON.stringify(descriptionEditor.getJSON()));
    files.forEach((file) => form.append("attachments", file));
    try {
      const ticket = await supportApi<Ticket>("/", { method: "POST", body: form });
      setTitle(""); setFiles([]); descriptionEditor.commands.setContent(EMPTY_DOCUMENT);
      await loadTickets();
      setNotice(`Ticket ${ticket.id.slice(0, 8).toUpperCase()} submitted.`);
      setView(capabilities.canManage ? "queue" : "tickets");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Ticket submission failed."); }
    finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!selected || !replyEditor || replyEditor.isEmpty) return;
    setBusy(true);
    const form = new FormData();
    form.set("body", JSON.stringify(replyEditor.getJSON()));
    replyFiles.forEach((file) => form.append("attachments", file));
    try {
      await supportApi(`/${selected.ticket.id}/messages`, { method: "POST", body: form });
      replyEditor.commands.setContent(EMPTY_DOCUMENT); setReplyFiles([]);
      await openTicket(selected.ticket.id); await loadTickets();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Reply failed."); }
    finally { setBusy(false); }
  };

  const updateStatus = async (status: TicketStatus) => {
    if (!selected) return;
    setBusy(true);
    try {
      await supportApi(`/${selected.ticket.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      await openTicket(selected.ticket.id); await loadTickets(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Status update failed."); }
    finally { setBusy(false); }
  };

  const maxCategory = analytics ? Math.max(1, ...Object.values(analytics.byCategory)) : 1;
  return <section className="support-workspace">
    <header className="support-heading"><div><span>Help center</span><h1>Issue tracking & support</h1><p>Submit requests, keep the conversation in one place, and follow progress through resolution.</p></div><TicketCheck size={36} /></header>
    <nav className="support-tabs" aria-label="Support views">
      <button className={view === "submit" ? "active" : ""} onClick={() => { setSelected(null); setView("submit"); }}><Plus size={17} /> New request</button>
      <button className={view === "tickets" ? "active" : ""} onClick={() => { setSelected(null); setView("tickets"); void loadTickets(); }}><MessageSquare size={17} /> My tickets</button>
      {capabilities.canManage && <button className={view === "queue" ? "active" : ""} onClick={() => { setSelected(null); setView("queue"); void loadTickets(true); }}><Inbox size={17} /> Agent queue</button>}
      {capabilities.canViewAnalytics && <button className={view === "analytics" ? "active" : ""} onClick={() => { setSelected(null); setView("analytics"); void supportApi<Analytics>("/analytics").then(setAnalytics).catch((error) => setNotice(error.message)); }}><BarChart3 size={17} /> Analytics</button>}
    </nav>
    {notice && <div className="support-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={16} /></button></div>}

    {view === "submit" && <div className="support-form">
      <div className="support-form-title"><h2>Submit a support request</h2><span>Fields marked required</span></div>
      <label>Request type<select value={requestType} onChange={(event) => setRequestType(event.target.value as RequestType)}>{TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Title<input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="Short summary of your request" /></label>
      <label>Description<RichTextEditor editor={descriptionEditor} label="Ticket description" /></label>
      <AttachmentPicker files={files} onChange={setFiles} />
      <button className="support-primary" disabled={busy || title.trim().length < 3} onClick={() => void submitTicket()}><Send size={17} /> {busy ? "Submitting..." : "Submit ticket"}</button>
    </div>}

    {(view === "tickets" || view === "queue") && !selected && <div className="support-list-panel">
      <div className="support-list-heading"><div><h2>{view === "queue" ? "Incoming tickets" : "Your tickets"}</h2><span>{tickets.length} requests</span></div>{view === "queue" && <div className="support-filters"><select aria-label="Filter by type" value={typeFilter} onChange={(event) => { const type = event.target.value; setTypeFilter(type); void loadTickets(true, { type, status: statusFilter }); }}><option value="">All types</option>{TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select aria-label="Filter by status" value={statusFilter} onChange={(event) => { const status = event.target.value; setStatusFilter(status); void loadTickets(true, { type: typeFilter, status }); }}><option value="">All statuses</option>{STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>}</div>
      <div className="support-ticket-list">{tickets.length === 0 ? <div className="support-empty">No tickets match this view.</div> : tickets.map((ticket) => <button key={ticket.id} onClick={() => void openTicket(ticket.id)}><span className={`support-type type-${ticket.request_type}`}>{typeLabel(ticket.request_type)}</span><span className="support-ticket-summary"><strong>{ticket.title}</strong><small>{ticket.requester_display_name || ticket.requester_email || "Requester"} · {new Date(ticket.created_at).toLocaleString()}</small></span><span className={`support-status status-${ticket.status}`}>{statusLabel(ticket.status)}</span></button>)}</div>
    </div>}

    {selected && <div className="support-detail">
      <button className="support-back" onClick={() => setSelected(null)}>← Back to tickets</button>
      <div className="support-detail-header"><div><span className={`support-type type-${selected.ticket.request_type}`}>{typeLabel(selected.ticket.request_type)}</span><h2>{selected.ticket.title}</h2><small>#{selected.ticket.id.slice(0, 8).toUpperCase()} · Opened {new Date(selected.ticket.created_at).toLocaleString()}</small></div>{capabilities.canManage ? <select aria-label="Ticket status" value={selected.ticket.status} disabled={busy} onChange={(event) => void updateStatus(event.target.value as TicketStatus)}>{STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : <span className={`support-status status-${selected.ticket.status}`}>{statusLabel(selected.ticket.status)}</span>}</div>
      <article className="support-message user"><div><strong>User request</strong><time>{new Date(selected.ticket.created_at).toLocaleString()}</time></div><RichDocument document={selected.ticket.description} />{selected.attachments.filter((item) => !item.message_id).map((item) => <a key={item.id} href={item.url || undefined} target="_blank" rel="noreferrer"><Paperclip size={14} /> {item.file_name}</a>)}</article>
      {selected.messages.map((message) => <article className={`support-message ${message.sender_role}`} key={message.id}><div><strong>{message.sender_role === "support_agent" ? "Support Agent" : "User"}</strong><time>{new Date(message.created_at).toLocaleString()}</time></div><RichDocument document={message.body} />{selected.attachments.filter((item) => item.message_id === message.id).map((item) => <a key={item.id} href={item.url || undefined} target="_blank" rel="noreferrer"><Paperclip size={14} /> {item.file_name}</a>)}</article>)}
      <div className="support-reply"><h3>Reply to this ticket</h3><RichTextEditor editor={replyEditor} label="Ticket reply" /><AttachmentPicker files={replyFiles} onChange={setReplyFiles} /><button className="support-primary" disabled={busy || !replyEditor || replyEditor.isEmpty} onClick={() => void sendReply()}><Send size={17} /> Send reply</button></div>
    </div>}

    {view === "analytics" && <div className="support-analytics">
      <div className="support-metrics"><div><span>Open tickets</span><strong>{analytics?.totalOpen ?? "—"}</strong></div><div><span>Average first response</span><strong>{formatDuration(analytics?.averageResponseMinutes ?? null)}</strong></div><div><span>Resolved in 30 days</span><strong>{analytics?.resolvedLast30Days ?? "—"}</strong></div></div>
      <section><div><h2>Requests by category</h2><span>Last 30 days</span></div>{analytics && TYPES.map((item) => <div className="support-bar" key={item.value}><span>{item.label}</span><div><i style={{ width: `${(analytics.byCategory[item.value] / maxCategory) * 100}%` }} /></div><strong>{analytics.byCategory[item.value]}</strong></div>)}</section>
    </div>}
  </section>;
}