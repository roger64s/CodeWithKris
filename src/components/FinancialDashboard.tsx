import React, { useState } from "react";
import {
  calculateSweatEquity,
  INITIAL_FINANCIAL_METRICS,
  ROLE_WEIGHTS,
  type FinancialMetric,
  type SweatEquityPayload,
} from "../lib/sweatEquity";
import { type UserRole, BASE_USER_ROLES, ADMIN_ROLE_OPTION } from "./UserRegistration";

interface FinancialDashboardProps {
  currentUserRole: UserRole;
  userEmail: string;
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({
  currentUserRole,
  userEmail,
}) => {
  const [metrics] = useState<FinancialMetric[]>(INITIAL_FINANCIAL_METRICS);
  const [contributorRole, setContributorRole] = useState<UserRole>(currentUserRole || "Student");
  const [loggedHours, setLoggedHours] = useState<number>(10);
  const [walletAddress, setWalletAddress] = useState<string>("0x71C...4B89");
  const [activeTab, setActiveTab] = useState<"metrics" | "calculator" | "l2">("metrics");
  const [equityResult, setEquityResult] = useState<SweatEquityPayload | null>(() =>
    calculateSweatEquity({
      contributorAddress: "0x71C...4B89",
      role: currentUserRole || "Student",
      loggedHours: 10,
      periodId: 202603,
    })
  );
  const [isSubmittingOnChain, setIsSubmittingOnChain] = useState(false);
  const [submittedTxHash, setSubmittedTxHash] = useState<string | null>(null);

  const isAuthorized =
    currentUserRole === "CodeWithKris Administrator" ||
    currentUserRole === "Investor" ||
    userEmail.trim().toLowerCase() === "roger.s@gradagig.com";

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = calculateSweatEquity({
        contributorAddress: walletAddress.trim() || "0x0000...0000",
        role: contributorRole,
        loggedHours: Number(loggedHours) || 0,
        periodId: 202603,
      });
      setEquityResult(result);
      setSubmittedTxHash(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Calculation failed");
    }
  };

  const handleMockL2Submit = async () => {
    if (!equityResult) return;
    setIsSubmittingOnChain(true);
    // Simulate L2 Testnet (Base Sepolia) block inclusion
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const mockHash = `0x${Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("")}`;
    setSubmittedTxHash(mockHash);
    setIsSubmittingOnChain(false);
  };

  if (!isAuthorized) {
    return (
      <section className="admin-section" style={{ textAlign: "center", padding: "40px 20px" }}>
        <span style={{ fontSize: "2.5rem" }}>🔒</span>
        <h2 style={{ marginTop: 12, color: "#991b1b" }}>Access Restricted</h2>
        <p style={{ maxWidth: 460, margin: "10px auto", color: "var(--muted)" }}>
          The Cooperative Financials & AMUL Sweat-Equity Ledger is restricted exclusively to the
          Grad-a-Gig Management Team and Authorized Investors.
        </p>
      </section>
    );
  }

  return (
    <section className="financial-portal">
      <div className="financial-header">
        <div>
          <span className="section-kicker">Cooperative Ledger · L2 Zero-Cost Protocol</span>
          <h2>AMUL-Inspired Sweat-Equity & Financials</h2>
          <p>
            Fair, weighted distribution of equity and dividends for speech contributors, mentors, carers,
            and learners.
          </p>
        </div>
        <div className="financial-tabs">
          <button
            className={`tab-btn ${activeTab === "metrics" ? "active" : ""}`}
            onClick={() => setActiveTab("metrics")}
          >
            📊 Financial Pools
          </button>
          <button
            className={`tab-btn ${activeTab === "calculator" ? "active" : ""}`}
            onClick={() => setActiveTab("calculator")}
          >
            ⚖️ Sweat-Equity Engine
          </button>
          <button
            className={`tab-btn ${activeTab === "l2" ? "active" : ""}`}
            onClick={() => setActiveTab("l2")}
          >
            ⛓️ L2 Testnet Explorer
          </button>
        </div>
      </div>

      {activeTab === "metrics" && (
        <div className="financial-content">
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card">
              <span className="stat-label">Total Treasury Balance</span>
              <strong className="stat-val">$185,000 USD</strong>
              <small style={{ color: "var(--mint)" }}>+18.4% vs Q2</small>
            </div>
            <div className="stat-card">
              <span className="stat-label">Cooperative Dividends Pool</span>
              <strong className="stat-val">$37,000 USD</strong>
              <small style={{ color: "var(--purple)" }}>20% net allocated</small>
            </div>
            <div className="stat-card">
              <span className="stat-label">Equity Units Minted</span>
              <strong className="stat-val">73,700 Units</strong>
              <small>Across 112 Contributors</small>
            </div>
            <div className="stat-card">
              <span className="stat-label">Verified L2 Epochs</span>
              <strong className="stat-val">Block #14,892,011</strong>
              <small style={{ color: "#0284c7" }}>Base Sepolia Testnet</small>
            </div>
          </div>

          <div className="admin-section" style={{ padding: 18 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1rem" }}>Quarterly Cooperative Financials</h3>
            <table className="coop-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Equity Distributed</th>
                  <th>Treasury Balance</th>
                  <th>Dividends Pool</th>
                  <th>Active Contributors</th>
                  <th>Audit Status</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.period_label}</strong></td>
                    <td>{row.total_equity_distributed.toLocaleString()} Units</td>
                    <td>${row.treasury_balance_usd.toLocaleString()}</td>
                    <td style={{ color: "var(--purple-dark)", fontWeight: 700 }}>
                      ${row.cooperative_dividends_pool.toLocaleString()}
                    </td>
                    <td>{row.contributors_count} members</td>
                    <td>
                      <span className="badge-verified">Verified on L2</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "calculator" && (
        <div className="financial-content">
          <div className="calculator-layout">
            <form onSubmit={handleCalculate} className="calculator-card">
              <h3 style={{ margin: "0 0 10px 0" }}>Log Contribution & Calculate Sweat-Equity</h3>
              
              <label>
                Contributor Role & Weight
                <select
                  value={contributorRole}
                  onChange={(e) => setContributorRole(e.target.value as UserRole)}
                >
                  {BASE_USER_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.icon} {r.label} — Multiplier: {ROLE_WEIGHTS[r.value]}x
                    </option>
                  ))}
                  <option value={ADMIN_ROLE_OPTION.value}>
                    {ADMIN_ROLE_OPTION.icon} Administrator — Multiplier: {ROLE_WEIGHTS[ADMIN_ROLE_OPTION.value]}x
                  </option>
                </select>
              </label>

              <label style={{ marginTop: 10 }}>
                Logged Hours (Speech practice, mentoring, development)
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={loggedHours}
                  onChange={(e) => setLoggedHours(Number(e.target.value))}
                  required
                />
              </label>

              <label style={{ marginTop: 10 }}>
                Recipient L2 Testnet Address
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="0x..."
                />
              </label>

              <button type="submit" className="primary-button" style={{ marginTop: 14 }}>
                Compute Weighted Equity <span>⚡</span>
              </button>
            </form>

            <div className="calculation-result-card">
              <h3>Equity Calculation Output</h3>
              {equityResult ? (
                <div className="result-payload">
                  <div className="payload-row">
                    <span>Base Hours:</span>
                    <strong>{equityResult.loggedHours} hrs</strong>
                  </div>
                  <div className="payload-row">
                    <span>Role Multiplier:</span>
                    <strong style={{ color: "var(--purple-dark)" }}>{equityResult.multiplier}x</strong>
                  </div>
                  <div className="payload-row">
                    <span>Effective Equity Units:</span>
                    <strong style={{ color: "var(--mint)", fontSize: "1.2rem" }}>
                      {(equityResult.loggedHours * equityResult.multiplier).toFixed(2)} Units
                    </strong>
                  </div>
                  <div className="payload-row">
                    <span>Wei Units (18 Decimals):</span>
                    <code className="payload-code">{equityResult.effectiveEquityUnits}</code>
                  </div>
                  <div className="payload-row">
                    <span>Period:</span>
                    <span>Q3 2026 Epoch (ID: {equityResult.periodId})</span>
                  </div>

                  <button
                    type="button"
                    className="primary-button"
                    style={{ marginTop: 14, background: "var(--mint)" }}
                    onClick={handleMockL2Submit}
                    disabled={isSubmittingOnChain}
                  >
                    {isSubmittingOnChain ? "Submitting to L2..." : "Submit to Base Sepolia L2 ⛓️"}
                  </button>

                  {submittedTxHash && (
                    <div className="tx-success-banner">
                      <strong>✅ Minted On-Chain on L2 Testnet!</strong>
                      <small style={{ wordBreak: "break-all", display: "block", marginTop: 4 }}>
                        Tx Hash: {submittedTxHash}
                      </small>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: "var(--muted)" }}>Enter parameters and click compute.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "l2" && (
        <div className="financial-content admin-section" style={{ padding: 18 }}>
          <h3 style={{ margin: "0 0 8px 0" }}>Zero-Cost L2 Cooperative Blockchain Architecture</h3>
          <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: 16 }}>
            Operating on L2 Testnet rollup architecture ensures instant transaction finality and zero gas fees
            for speech learners and cooperative contributors.
          </p>

          <div className="l2-specs-grid">
            <div className="l2-spec-box">
              <span className="spec-title">L2 Rollup Chain</span>
              <strong className="spec-val">Base Sepolia (ChainID: 84532)</strong>
            </div>
            <div className="l2-spec-box">
              <span className="spec-title">Smart Contract</span>
              <strong className="spec-val">CooperativeSweatEquity.sol (v2.1)</strong>
            </div>
            <div className="l2-spec-box">
              <span className="spec-title">Gas Subsidy</span>
              <strong className="spec-val">100% Zero-Cost (Paymaster Funded)</strong>
            </div>
            <div className="l2-spec-box">
              <span className="spec-title">AMUL Fair-Share Matrix</span>
              <strong className="spec-val">PWD: 1.2x · Mentor: 1.5x · Carer: 1.2x</strong>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
