import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import {
  EFFORT_CATEGORIES,
  INVESTMENT_CATEGORIES,
  KNOWN_CONTRIBUTIONS,
  KNOWN_INVESTMENTS,
  ROLE_WEIGHTS,
  type ContributionRecord,
  DEPARTMENT_ALLOCATIONS,
  type DepartmentCategory,
  type EffortCategory,
  type FinancialInvestmentRecord,
  type InvestmentCategory,
} from "../lib/sweatEquity";
import {
  calculateFinalOVU,
  OVU_TIERS,
  STAKEHOLDER_ALLOCATIONS,
  type FinalOVUPayload,
  type OVUTier,
  type StakeholderCategory,
} from "../lib/ovuMatrix";
import { CrmWorkspace } from "./CrmWorkspace";
import { type UserRole } from "./UserRegistration";

interface FinancialDashboardProps {
  currentUserRole: UserRole;
  userEmail: string;
  userName: string;
  hasFinancialAccess: boolean;
  stakeholderCategory: StakeholderCategory | null;
}

interface ContributionRow {
  id: string;
  contributor_name: string;
  contributor_email: string | null;
  role: UserRole;
  client_code: string;
  project_code: string;
  department_category: DepartmentCategory;
  effort_category: EffortCategory;
  contribution_type: string;
  description: string;
  logged_hours: number | null;
  weighted_units: number | null;
  status: ContributionRecord["status"];
  contributed_at: string;
  l2_tx_hash: string | null;
}

interface InvestmentRow {
  id: string;
  investor_name: string;
  investor_email: string | null;
  investor_role: UserRole;
  client_code: string;
  project_code: string;
  department_category: DepartmentCategory;
  category: InvestmentCategory;
  supplier: string;
  description: string;
  amount: number;
  currency: string;
  incurred_at: string;
  receipt_reference: string | null;
  status: FinancialInvestmentRecord["status"];
}

const fromDatabase = (row: ContributionRow): ContributionRecord => ({
  id: row.id,
  contributorName: row.contributor_name,
  contributorEmail: row.contributor_email || undefined,
  role: row.role,
  clientCode: row.client_code,
  projectCode: row.project_code,
  departmentCategory: row.department_category,
  effortCategory: row.effort_category,
  contributionType: row.contribution_type,
  description: row.description,
  loggedHours: row.logged_hours,
  weightedUnits: row.weighted_units,
  status: row.status,
  contributedAt: row.contributed_at,
  l2TxHash: row.l2_tx_hash || undefined,
});

const investmentFromDatabase = (row: InvestmentRow): FinancialInvestmentRecord => ({
  id: row.id,
  investorName: row.investor_name,
  investorEmail: row.investor_email || undefined,
  investorRole: row.investor_role,
  clientCode: row.client_code,
  projectCode: row.project_code,
  departmentCategory: row.department_category,
  category: row.category,
  supplier: row.supplier,
  description: row.description,
  amount: Number(row.amount),
  currency: row.currency,
  incurredAt: row.incurred_at,
  receiptReference: row.receipt_reference || undefined,
  status: row.status,
});

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ currentUserRole, userEmail, userName, hasFinancialAccess, stakeholderCategory }) => {
  const normalizedEmail = userEmail.trim().toLowerCase();
  const authenticatedName = userName?.trim() || userEmail.split("@")[0] || "Authenticated user";
  const isAuthorized = hasFinancialAccess || normalizedEmail === "roger.s@gradagig.com";
  const canSubmit = Boolean(normalizedEmail);
  const [contributions, setContributions] = useState<ContributionRecord[]>(isAuthorized ? KNOWN_CONTRIBUTIONS : []);
  const [investments, setInvestments] = useState<FinancialInvestmentRecord[]>(isAuthorized ? KNOWN_INVESTMENTS : []);
  const [clientCode, setClientCode] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [departmentCategory, setDepartmentCategory] = useState<DepartmentCategory>("Delivery");
  const [effortCategory, setEffortCategory] = useState<EffortCategory>("Development");
  const [contributionType, setContributionType] = useState("");
  const [description, setDescription] = useState("");
  const [loggedHours, setLoggedHours] = useState("");
  const [investmentCategory, setInvestmentCategory] = useState<InvestmentCategory>("Software & AI");
  const [supplier, setSupplier] = useState("");
  const [investmentAmount, setInvestmentAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [receiptReference, setReceiptReference] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [taskId, setTaskId] = useState("");
  const [ovuTier, setOvuTier] = useState<OVUTier>("Tier 1");
  const [customBaseOVU, setCustomBaseOVU] = useState(OVU_TIERS["Tier 1"].defaultOVU);
  const [reusabilityBonus, setReusabilityBonus] = useState(false);
  const [speedBonus, setSpeedBonus] = useState(false);
  const [qualityPenalty, setQualityPenalty] = useState(false);
  const [activeTab, setActiveTab] = useState<"companies" | "contacts" | "ledger" | "effort" | "investment" | "calculator" | "l2">("ledger");
  const [ovuResult, setOvuResult] = useState<FinalOVUPayload | null>(null);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    if (!supabase || !canSubmit) return;
    Promise.all([
      supabase.from("contribution_records").select("*").order("contributed_at", { ascending: false }),
      supabase.from("financial_investments").select("*").order("incurred_at", { ascending: false }),
    ]).then(([contributionResult, investmentResult]) => {
      if (!contributionResult.error && contributionResult.data?.length) {
        setContributions((contributionResult.data as ContributionRow[]).map(fromDatabase));
      }
      if (!investmentResult.error && investmentResult.data?.length) {
        setInvestments((investmentResult.data as InvestmentRow[]).map(investmentFromDatabase));
      }
      if (!contributionResult.error && !investmentResult.error) {
        setSaveStatus("Connected to the secured Supabase contribution ledger.");
      } else {
        setSaveStatus("Showing documented baseline records. Apply the Supabase schema to enable live tracking.");
      }
    });
  }, [canSubmit]);

  const totalHours = contributions.reduce((total, item) => total + (item.loggedHours || 0), 0);
  const totalUnits = contributions.reduce((total, item) => total + (item.weightedUnits || 0), 0);
  const totalInvestedUsd = investments.filter((item) => item.currency === "USD").reduce((total, item) => total + item.amount, 0);
  const valuedCount = contributions.filter((item) => item.status !== "unvalued").length;

  const handleCalculate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!stakeholderCategory || !taskId.trim()) return;
    setOvuResult(calculateFinalOVU({
      contributorAddress: (walletAddress.trim() || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      taskId: taskId.trim(),
      stakeholderCategory,
      tier: ovuTier,
      customBaseOVU,
      modifiers: {
        hasReusabilityBonus: reusabilityBonus,
        isAheadOfSchedule: speedBonus,
        hasQualityPenalty: qualityPenalty,
      },
      periodId: 202603,
    }));
  };

  const handleAddContribution = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !contributionType.trim() || !clientCode.trim() || !projectCode.trim()) return;

    const hours = isAuthorized && loggedHours ? Number(loggedHours) : null;
    const weightedUnits = hours === null ? null : Number((hours * ROLE_WEIGHTS[currentUserRole]).toFixed(2));
    const record: ContributionRecord = {
      id: crypto.randomUUID(), contributorName: authenticatedName, contributorEmail: normalizedEmail,
      role: currentUserRole, clientCode: clientCode.trim(), projectCode: projectCode.trim(), departmentCategory,
      effortCategory, contributionType: contributionType.trim(), description: description.trim(), loggedHours: hours,
      weightedUnits, status: isAuthorized && hours !== null ? "valued" : "unvalued", contributedAt: new Date().toISOString(),
    };

    if (supabase) {
      const { error } = await supabase.from("contribution_records").insert({
        id: record.id, contribution_key: record.id, contributor_name: record.contributorName,
        contributor_email: record.contributorEmail, role: record.role, client_code: record.clientCode,
        project_code: record.projectCode, department_category: record.departmentCategory,
        effort_category: record.effortCategory, contribution_type: record.contributionType, description: record.description,
        logged_hours: record.loggedHours, weighted_units: record.weightedUnits,
        status: record.status, contributed_at: record.contributedAt,
      });
      setSaveStatus(error ? `Saved locally only: ${error.message}` : "Contribution saved to the secured Supabase ledger.");
    } else {
      setSaveStatus("Saved locally for preview. Supabase is not configured.");
    }

    setContributions((current) => [record, ...current]);
    setClientCode(""); setProjectCode(""); setContributionType(""); setDescription(""); setLoggedHours("");
    setActiveTab("ledger");
  };

  const handleAddInvestment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !supplier.trim() || !investmentAmount || !clientCode.trim() || !projectCode.trim()) return;
    const record: FinancialInvestmentRecord = {
      id: crypto.randomUUID(), investorName: authenticatedName, investorEmail: normalizedEmail,
      investorRole: currentUserRole, clientCode: clientCode.trim(), projectCode: projectCode.trim(), departmentCategory,
      category: investmentCategory,
      supplier: supplier.trim(), description: description.trim(), amount: Number(investmentAmount),
      currency, incurredAt: new Date().toISOString(), receiptReference: receiptReference.trim() || undefined,
      status: "documented",
    };
    if (supabase) {
      const { error } = await supabase.from("financial_investments").insert({
        id: record.id, investment_key: record.id, investor_name: record.investorName,
        investor_email: record.investorEmail, investor_role: record.investorRole,
        client_code: record.clientCode, project_code: record.projectCode,
        department_category: record.departmentCategory,
        category: record.category, supplier: record.supplier, description: record.description,
        amount: record.amount, currency: record.currency, incurred_at: record.incurredAt,
        receipt_reference: record.receiptReference, status: record.status,
      });
      setSaveStatus(error ? `Saved locally only: ${error.message}` : "Investment saved to the secured Supabase ledger.");
    } else {
      setSaveStatus("Saved locally for preview. Supabase is not configured.");
    }
    setInvestments((current) => [record, ...current]);
    setClientCode(""); setProjectCode(""); setSupplier(""); setDescription(""); setInvestmentAmount(""); setReceiptReference("");
    setActiveTab("ledger");
  };

  return (
    <section className="financial-portal">
      <div className="financial-header">
        <div><span className="section-kicker">Contribution ledger</span><h2>CodeWithKris cooperative contributions</h2><p>Only recorded contributions are shown. Unvalued work remains pending until management approves hours or OVUs.</p>{stakeholderCategory ? <span className="stakeholder-assignment">{stakeholderCategory} · {STAKEHOLDER_ALLOCATIONS[stakeholderCategory]}% cap-table pool</span> : <span className="stakeholder-assignment pending">Stakeholder category assignment pending</span>}</div>
        <div className="financial-tabs">
          <button className={`tab-btn ${activeTab === "companies" ? "active" : ""}`} onClick={() => setActiveTab("companies")}>Company</button>
          <button className={`tab-btn ${activeTab === "contacts" ? "active" : ""}`} onClick={() => setActiveTab("contacts")}>Contact</button>
          <button className={`tab-btn ${activeTab === "ledger" ? "active" : ""}`} onClick={() => setActiveTab("ledger")}>Contribution</button>
          <button className={`tab-btn ${activeTab === "effort" ? "active" : ""}`} onClick={() => { setDepartmentCategory("Delivery"); setActiveTab("effort"); }}>Add effort</button>
          <button className={`tab-btn ${activeTab === "investment" ? "active" : ""}`} onClick={() => { setDepartmentCategory("Finance & Admin"); setActiveTab("investment"); }}>Add expense</button>
          {isAuthorized && <button className={`tab-btn ${activeTab === "calculator" ? "active" : ""}`} onClick={() => setActiveTab("calculator")}>Calculator</button>}
          {isAuthorized && <button className={`tab-btn ${activeTab === "l2" ? "active" : ""}`} onClick={() => setActiveTab("l2")}>L2 audit</button>}
        </div>
      </div>

      {activeTab === "companies" && <CrmWorkspace view="companies" isAuthenticated={canSubmit} />}
      {activeTab === "contacts" && <CrmWorkspace view="contacts" isAuthenticated={canSubmit} />}

      {activeTab === "ledger" && <div className="financial-content">
        <div className="ledger-summary">
          <div><span>Known contributors</span><strong>{new Set(contributions.map((item) => item.contributorName)).size}</strong></div>
          <div><span>Recorded contributions</span><strong>{contributions.length}</strong></div>
          <div><span>Approved hours</span><strong>{totalHours || "Not valued"}</strong></div>
          <div><span>Weighted units</span><strong>{totalUnits || "Not minted"}</strong></div>
          <div><span>Documented investment</span><strong>${totalInvestedUsd.toLocaleString()}+ USD</strong></div>
        </div>
        <div className="admin-section contribution-ledger">
          <div className="section-row"><h3>Contribution register</h3><span>{valuedCount} valued · {contributions.length - valuedCount} awaiting valuation</span></div>
          <div className="table-scroll"><table className="coop-table"><thead><tr><th>Contributor</th><th>Work reference</th><th>Department</th><th>Effort</th><th>Hours</th><th>Units</th><th>Status</th></tr></thead><tbody>
            {contributions.map((item) => <tr key={item.id}><td><strong>{item.contributorName}</strong><small>{item.role}</small></td><td><strong>{item.clientCode}</strong><small>{item.projectCode}</small></td><td>{item.departmentCategory}<small>{DEPARTMENT_ALLOCATIONS[item.departmentCategory]}% guide</small></td><td><strong>{item.effortCategory}</strong><small>{item.contributionType}: {item.description}</small></td><td>{item.loggedHours ?? "Pending"}</td><td>{item.weightedUnits ?? "Pending"}</td><td><span className={`contribution-status ${item.status}`}>{item.status}</span></td></tr>)}
          </tbody></table></div>
        </div>
        <div className="admin-section contribution-ledger investment-ledger">
          <div className="section-row"><h3>Financial investment register</h3><span>Receipt-level itemization can be added using Add expense</span></div>
          <div className="table-scroll"><table className="coop-table"><thead><tr><th>Investor</th><th>Work reference</th><th>Department</th><th>Expense</th><th>Amount</th><th>Evidence</th><th>Status</th></tr></thead><tbody>
            {investments.map((item) => <tr key={item.id}><td><strong>{item.investorName}</strong><small>{item.investorRole}</small></td><td><strong>{item.clientCode}</strong><small>{item.projectCode}</small></td><td>{item.departmentCategory}<small>{DEPARTMENT_ALLOCATIONS[item.departmentCategory]}% guide</small></td><td><strong>{item.category}: {item.supplier}</strong><small>{item.description}</small></td><td><strong>{item.currency} {item.amount.toLocaleString()}</strong></td><td>{item.receiptReference || "Itemization pending"}</td><td><span className={`contribution-status ${item.status === "verified" ? "verified" : "valued"}`}>{item.status}</span></td></tr>)}
          </tbody></table></div>
        </div>
        {saveStatus && <p className="ledger-note">{saveStatus}</p>}
      </div>}

      {activeTab === "effort" && canSubmit && <form className="admin-section contribution-form entry-panel" onSubmit={handleAddContribution}>
        <div className="section-row"><div><span className="section-kicker">Time contribution</span><h3>Record effort hours</h3></div><span>Leave hours blank until evidence is reviewed</span></div>
        <div className="authenticated-identity"><span>Logged-in contributor</span><strong>{authenticatedName}</strong><small>{normalizedEmail} · {currentUserRole}</small></div>
        <label>Client Code<input value={clientCode} onChange={(event) => setClientCode(event.target.value)} placeholder="Free text, e.g. INTERNAL" required /></label>
        <label>Project Code<input value={projectCode} onChange={(event) => setProjectCode(event.target.value)} placeholder="Free text, e.g. CWK-APP" required /></label>
        <label>Department Category<select value={departmentCategory} onChange={(event) => setDepartmentCategory(event.target.value as DepartmentCategory)}>{Object.entries(DEPARTMENT_ALLOCATIONS).map(([category, allocation]) => <option key={category} value={category}>{category} · ~{allocation}%</option>)}</select></label>
        <label>Effort category<select value={effortCategory} onChange={(event) => setEffortCategory(event.target.value as EffortCategory)}>{EFFORT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
        {isAuthorized && <label>Approved hours<input type="number" min="0" step="0.25" value={loggedHours} onChange={(event) => setLoggedHours(event.target.value)} placeholder="Pending" /></label>}
        <label className="contribution-description">Activity / deliverable<input value={contributionType} onChange={(event) => setContributionType(event.target.value)} placeholder="Example: Registration UX redesign" required /></label>
        <label className="contribution-description">Evidence or notes<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="PR, document, recording, or approval reference" /></label>
        <button className="primary-button" type="submit">Save effort record <span>+</span></button>
      </form>}

      {activeTab === "investment" && canSubmit && <form className="admin-section contribution-form entry-panel investment-form" onSubmit={handleAddInvestment}>
        <div className="section-row"><div><span className="section-kicker">Cash contribution</span><h3>Record financial investment</h3></div><span>Enter each receipt separately for auditability</span></div>
        <div className="authenticated-identity"><span>Logged-in investor</span><strong>{authenticatedName}</strong><small>{normalizedEmail} · {currentUserRole}</small></div>
        <label>Client Code<input value={clientCode} onChange={(event) => setClientCode(event.target.value)} placeholder="Free text, e.g. INTERNAL" required /></label>
        <label>Project Code<input value={projectCode} onChange={(event) => setProjectCode(event.target.value)} placeholder="Free text, e.g. CWK-APP" required /></label>
        <label>Department Category<select value={departmentCategory} onChange={(event) => setDepartmentCategory(event.target.value as DepartmentCategory)}>{Object.entries(DEPARTMENT_ALLOCATIONS).map(([category, allocation]) => <option key={category} value={category}>{category} · ~{allocation}%</option>)}</select></label>
        <label>Expense category<select value={investmentCategory} onChange={(event) => setInvestmentCategory(event.target.value as InvestmentCategory)}>{INVESTMENT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label>Supplier / item<input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Example: GitHub Copilot" required /></label>
        <label>Amount<div className="money-input"><select value={currency} onChange={(event) => setCurrency(event.target.value)}><option>USD</option><option>AUD</option><option>INR</option><option>SGD</option></select><input type="number" min="0.01" step="0.01" value={investmentAmount} onChange={(event) => setInvestmentAmount(event.target.value)} required /></div></label>
        <label className="contribution-description">Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What the expense supported" /></label>
        <label className="contribution-description">Receipt / invoice reference<input value={receiptReference} onChange={(event) => setReceiptReference(event.target.value)} placeholder="Invoice number or private storage reference" /></label>
        <button className="primary-button" type="submit">Save expense record <span>+</span></button>
      </form>}

      {activeTab === "calculator" && isAuthorized && <div className="calculator-layout">
        <form onSubmit={handleCalculate} className="calculator-card"><h3>Calculate final OVU</h3>
          <div className="calculator-assignment"><span>Assigned stakeholder category</span><strong>{stakeholderCategory || "Not assigned"}</strong>{stakeholderCategory && <small>{STAKEHOLDER_ALLOCATIONS[stakeholderCategory]}% proposed cap-table pool</small>}</div>
          <label>Task ID<input value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="Example: CWK-APP-001" required /></label>
          <label>OVU base tier<select value={ovuTier} onChange={(event) => { const tier = event.target.value as OVUTier; setOvuTier(tier); setCustomBaseOVU(OVU_TIERS[tier].defaultOVU); }}>{Object.values(OVU_TIERS).map((tier) => <option key={tier.tier} value={tier.tier}>{tier.description}</option>)}</select></label>
          <label>Base OVU<input type="number" min={OVU_TIERS[ovuTier].minOVU} max={ovuTier === "Tier 5" ? undefined : OVU_TIERS[ovuTier].maxOVU} step="0.25" value={customBaseOVU} onChange={(event) => setCustomBaseOVU(Number(event.target.value))} required /></label>
          <fieldset className="modifier-options"><legend>Dynamic modifiers</legend><label><input type="checkbox" checked={reusabilityBonus} onChange={(event) => setReusabilityBonus(event.target.checked)} /> Reusability +25%</label><label><input type="checkbox" checked={speedBonus} onChange={(event) => setSpeedBonus(event.target.checked)} /> Speed +15%</label><label><input type="checkbox" checked={qualityPenalty} onChange={(event) => setQualityPenalty(event.target.checked)} /> Quality penalty -30%</label></fieldset>
          <label>L2 address (optional)<input value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} placeholder="0x..." /></label>
          <button type="submit" className="primary-button" disabled={!stakeholderCategory}>Calculate OVU <span>→</span></button>
        </form>
        <div className="calculation-result-card"><h3>OVU valuation</h3>{ovuResult ? <div className="result-payload"><div className="payload-row"><span>Stakeholder pool</span><strong>{ovuResult.stakeholderCategory}</strong></div><div className="payload-row"><span>Base OVU</span><strong>{ovuResult.baseOVU}</strong></div><div className="payload-row"><span>Net multiplier</span><strong>{ovuResult.modifiers.netMultiplier}x</strong></div><div className="payload-row"><span>Final OVU</span><strong>{ovuResult.finalOVU}</strong></div><p className="ledger-note">The pool percentage classifies cap-table ownership; it does not multiply OVU points. A calculation is not an approved or on-chain transaction.</p></div> : <p>{stakeholderCategory ? "Enter a task and tier to calculate OVU." : "Management must assign a stakeholder category before OVU calculation."}</p>}</div>
      </div>}

      {activeTab === "l2" && isAuthorized && <div className="admin-section l2-empty-state"><h3>No L2 transactions recorded</h3><p>Transaction hashes will appear only after a real contract, paymaster, and Base Sepolia submission service are configured.</p></div>}
    </section>
  );
};
