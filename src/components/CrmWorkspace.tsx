import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface CompanyRecord {
  id: string;
  co_name: string;
  co_url: string | null;
  co_type: "InternalProspect" | "Client" | "ClientLead" | null;
  co_lead_status: "active client" | "target prospect" | "partner" | null;
  co_industry: string | null;
  gtm_target_id: string | null;
}

interface ContactRecord {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  company_id: string | null;
  job_title: string | null;
  stage: "Subscriber" | "Lead" | "MQL" | "SQL" | "Opportunity" | "Customer" | "Evangelist" | "Other" | null;
  lead_status: "New" | "Open" | "In Progress" | "Open Deal" | "Unqualified" | null;
  gtm_target_id: string | null;
}

interface TargetRecord {
  id: string;
  target_code: string;
  company_name: string;
  contact_title: string;
}

interface CrmWorkspaceProps {
  view: "companies" | "contacts";
  isAuthenticated: boolean;
}

export const CrmWorkspace: React.FC<CrmWorkspaceProps> = ({ view, isAuthenticated }) => {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [targets, setTargets] = useState<TargetRecord[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [companyType, setCompanyType] = useState<NonNullable<CompanyRecord["co_type"]>>("InternalProspect");
  const [companyLeadStatus, setCompanyLeadStatus] = useState<NonNullable<CompanyRecord["co_lead_status"]>>("target prospect");
  const [industry, setIndustry] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companyTargetId, setCompanyTargetId] = useState("");
  const [contactTargetId, setContactTargetId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [contactStage, setContactStage] = useState<NonNullable<ContactRecord["stage"]>>("Lead");
  const [contactLeadStatus, setContactLeadStatus] = useState<NonNullable<ContactRecord["lead_status"]>>("New");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!supabase || !isAuthenticated) return;
    Promise.all([
      supabase.from("companies").select("id, co_name, co_url, co_type, co_lead_status, co_industry, gtm_target_id").order("co_name"),
      supabase.from("contacts").select("id, first_name, last_name, email, company_id, job_title, stage, lead_status, gtm_target_id").order("last_name"),
      supabase.from("gtm_anonymized_targets").select("id, target_code, company_name, contact_title").order("created_at"),
    ]).then(([companyResult, contactResult, targetResult]) => {
      if (!companyResult.error) setCompanies((companyResult.data || []) as CompanyRecord[]);
      if (!contactResult.error) setContacts((contactResult.data || []) as ContactRecord[]);
      if (!targetResult.error) setTargets((targetResult.data || []) as TargetRecord[]);
      if (companyResult.error || contactResult.error || targetResult.error) {
        setStatus("CRM target links are not available yet. Apply supabase/crm_schema.sql, then supabase/gtm_pilot_workflow.sql.");
      }
    });
  }, [isAuthenticated]);

  const getAuthenticatedUserId = async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user?.id || null;
  };

  const addCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !companyName.trim()) return;
    const ownerId = await getAuthenticatedUserId();
    if (!ownerId) {
      setStatus("Sign in again before creating a company.");
      return;
    }
    const { data, error } = await supabase.from("companies").insert({
      co_name: companyName.trim(),
      co_url: companyUrl.trim() || null,
      co_type: companyType,
      co_owner_id: ownerId,
      co_lead_status: companyLeadStatus,
      co_industry: industry.trim() || null,
      gtm_target_id: companyTargetId || null,
    }).select("id, co_name, co_url, co_type, co_lead_status, co_industry, gtm_target_id").single();
    if (error) {
      setStatus(`Company was not saved: ${error.message}`);
      return;
    }
    setCompanies((current) => [...current, data as CompanyRecord].sort((left, right) => left.co_name.localeCompare(right.co_name)));
    setCompanyName(""); setCompanyUrl(""); setIndustry(""); setCompanyTargetId("");
    setStatus("Company saved.");
  };

  const addContact = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !firstName.trim() || !lastName.trim()) return;
    const ownerId = await getAuthenticatedUserId();
    if (!ownerId) {
      setStatus("Sign in again before creating a contact.");
      return;
    }
    const { data, error } = await supabase.from("contacts").insert({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim() || null,
      company_id: companyId || null,
      contact_owner_id: ownerId,
      job_title: jobTitle.trim() || null,
      stage: contactStage,
      lead_status: contactLeadStatus,
      gtm_target_id: contactTargetId || null,
    }).select("id, first_name, last_name, email, company_id, job_title, stage, lead_status, gtm_target_id").single();
    if (error) {
      setStatus(`Contact was not saved: ${error.message}`);
      return;
    }
    setContacts((current) => [...current, data as ContactRecord]);
    setFirstName(""); setLastName(""); setEmail(""); setCompanyId(""); setContactTargetId(""); setJobTitle("");
    setStatus("Contact saved.");
  };

  if (!isAuthenticated) return <div className="empty-state">Sign in to manage cooperative CRM records.</div>;

  const targetLabel = (targetId: string | null) => {
    const target = targets.find((item) => item.id === targetId);
    return target ? `${target.target_code}: ${target.company_name} / ${target.contact_title}` : "Unlinked";
  };

  if (view === "companies") {
    return <div className="financial-content">
      <div className="admin-section contribution-ledger">
        <div className="section-row"><h3>Company register</h3><span>{companies.length} accessible companies</span></div>
        <div className="table-scroll"><table className="coop-table"><thead><tr><th>Company</th><th>GTM target</th><th>Type</th><th>Status</th><th>Industry</th></tr></thead><tbody>
          {companies.length ? companies.map((company) => <tr key={company.id}><td><strong>{company.co_name}</strong><small>{company.co_url || "No website recorded"}</small></td><td>{targetLabel(company.gtm_target_id)}</td><td>{company.co_type || "Not classified"}</td><td>{company.co_lead_status || "Not set"}</td><td>{company.co_industry || "Not set"}</td></tr>) : <tr><td colSpan={5}>No accessible company records yet.</td></tr>}
        </tbody></table></div>
      </div>
      <form className="admin-section contribution-form entry-panel" onSubmit={addCompany}>
        <div className="section-row"><div><span className="section-kicker">Company</span><h3>Add company</h3></div><span>Access follows CRM ownership and team-pod rules</span></div>
        <label>Company name<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required /></label>
        <label>Website<input type="url" value={companyUrl} onChange={(event) => setCompanyUrl(event.target.value)} placeholder="https://" /></label>
        <label>GTM target<select value={companyTargetId} onChange={(event) => setCompanyTargetId(event.target.value)}><option value="">Unlinked</option>{targets.map((target) => <option key={target.id} value={target.id}>{targetLabel(target.id)}</option>)}</select></label>
        <label>Company type<select value={companyType} onChange={(event) => setCompanyType(event.target.value as NonNullable<CompanyRecord["co_type"]>)}><option>InternalProspect</option><option>Client</option><option>ClientLead</option></select></label>
        <label>Lead status<select value={companyLeadStatus} onChange={(event) => setCompanyLeadStatus(event.target.value as NonNullable<CompanyRecord["co_lead_status"]>)}><option>active client</option><option>target prospect</option><option>partner</option></select></label>
        <label className="contribution-description">Industry<input value={industry} onChange={(event) => setIndustry(event.target.value)} /></label>
        <button className="primary-button" type="submit">Save company <span>+</span></button>
      </form>
      {status && <p className="ledger-note">{status}</p>}
    </div>;
  }

  return <div className="financial-content">
    <div className="admin-section contribution-ledger">
      <div className="section-row"><h3>Contact register</h3><span>{contacts.length} accessible contacts</span></div>
      <div className="table-scroll"><table className="coop-table"><thead><tr><th>Contact</th><th>Company</th><th>GTM target</th><th>Job title</th><th>Stage</th><th>Lead status</th></tr></thead><tbody>
        {contacts.length ? contacts.map((contact) => <tr key={contact.id}><td><strong>{contact.first_name} {contact.last_name}</strong><small>{contact.email || "No email recorded"}</small></td><td>{companies.find((company) => company.id === contact.company_id)?.co_name || "Unassigned"}</td><td>{targetLabel(contact.gtm_target_id)}</td><td>{contact.job_title || "Not set"}</td><td>{contact.stage || "Not set"}</td><td>{contact.lead_status || "Not set"}</td></tr>) : <tr><td colSpan={6}>No accessible contact records yet.</td></tr>}
      </tbody></table></div>
    </div>
    <form className="admin-section contribution-form entry-panel" onSubmit={addContact}>
      <div className="section-row"><div><span className="section-kicker">Contact</span><h3>Add contact</h3></div><span>Contact details remain owner and team-pod restricted</span></div>
      <label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label>
      <label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} required /></label>
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Company<select value={companyId} onChange={(event) => { const nextCompanyId = event.target.value; setCompanyId(nextCompanyId); setContactTargetId(companies.find((company) => company.id === nextCompanyId)?.gtm_target_id || ""); }}><option value="">Unassigned</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.co_name}</option>)}</select></label>
      <label>GTM target<select value={contactTargetId} onChange={(event) => setContactTargetId(event.target.value)}><option value="">Unlinked</option>{targets.map((target) => <option key={target.id} value={target.id}>{targetLabel(target.id)}</option>)}</select></label>
      <label>Job title<input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></label>
      <label>Stage<select value={contactStage} onChange={(event) => setContactStage(event.target.value as NonNullable<ContactRecord["stage"]>)}><option>Subscriber</option><option>Lead</option><option>MQL</option><option>SQL</option><option>Opportunity</option><option>Customer</option><option>Evangelist</option><option>Other</option></select></label>
      <label>Lead status<select value={contactLeadStatus} onChange={(event) => setContactLeadStatus(event.target.value as NonNullable<ContactRecord["lead_status"]>)}><option>New</option><option>Open</option><option>In Progress</option><option>Open Deal</option><option>Unqualified</option></select></label>
      <button className="primary-button" type="submit">Save contact <span>+</span></button>
    </form>
    {status && <p className="ledger-note">{status}</p>}
  </div>;
};