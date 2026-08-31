import { type UserRole } from "../components/UserRegistration";

export interface ContributionInput {
  contributorAddress: string;
  role: UserRole;
  loggedHours: number;
  periodId: number;
}

export interface SweatEquityPayload {
  contributor: string;
  role: UserRole;
  loggedHours: number;
  multiplier: number;
  effectiveEquityUnits: string; // 18 decimal precision string
  periodId: number;
  calculatedAt: number;
  txHash?: string;
}

// Cooperative weight matrix (AMUL-inspired)
export const ROLE_WEIGHTS: Record<UserRole, number> = {
  Mentor: 1.5,
  "Persons with Disabilities": 1.2,
  Student: 1.2,
  "Woman/Carer": 1.2,
  Individual: 1.0,
  Corporate: 1.0,
  Client: 1.0,
  Investor: 1.0,
  NGO: 1.0,
  Government: 1.0,
  "CodeWithKris Administrator": 1.5,
};

/**
 * Calculates sweat-equity units based on cooperative role weights
 */
export function calculateSweatEquity(input: ContributionInput): SweatEquityPayload {
  if (input.loggedHours < 0) {
    throw new Error("Logged hours cannot be negative");
  }

  const multiplier = ROLE_WEIGHTS[input.role] ?? 1.0;
  const rawUnits = input.loggedHours * multiplier;
  
  // Format as base-18 fixed point number (EVM compatible units)
  const integerPart = Math.floor(rawUnits);
  const decimalPart = Math.round((rawUnits - integerPart) * 10000);
  const effectiveEquityUnits = (
    BigInt(integerPart) * 10n ** 18n +
    BigInt(decimalPart) * 10n ** 14n
  ).toString();

  return {
    contributor: input.contributorAddress,
    role: input.role,
    loggedHours: input.loggedHours,
    multiplier,
    effectiveEquityUnits,
    periodId: input.periodId,
    calculatedAt: Math.floor(Date.now() / 1000),
  };
}

export type ContributionStatus = "unvalued" | "valued" | "verified";
export type EffortCategory =
  | "Product Design"
  | "Development"
  | "Testing / QA"
  | "Marketing"
  | "Web Design"
  | "Brand Design"
  | "Audio / Voice"
  | "Research"
  | "Administration"
  | "Other";

export const EFFORT_CATEGORIES: EffortCategory[] = [
  "Product Design", "Development", "Testing / QA", "Marketing", "Web Design",
  "Brand Design", "Audio / Voice", "Research", "Administration", "Other",
];

export type DepartmentCategory =
  | "Management"
  | "Delivery"
  | "Finance & Admin"
  | "Sales & Marketing"
  | "Customer Service"
  | "Profit";

export const DEPARTMENT_ALLOCATIONS: Record<DepartmentCategory, number> = {
  Management: 10,
  Delivery: 30,
  "Finance & Admin": 20,
  "Sales & Marketing": 20,
  "Customer Service": 10,
  Profit: 10,
};

export interface ContributionRecord {
  id: string;
  contributorName: string;
  contributorEmail?: string;
  role: UserRole;
  clientCode: string;
  projectCode: string;
  departmentCategory: DepartmentCategory;
  effortCategory: EffortCategory;
  contributionType: string;
  description: string;
  loggedHours: number | null;
  weightedUnits: number | null;
  status: ContributionStatus;
  contributedAt: string;
  l2TxHash?: string;
}

export type InvestmentCategory = "Tax & Accounting" | "Software & AI" | "Hosting & Infrastructure" | "Legal" | "Marketing" | "Equipment" | "Other";

export const INVESTMENT_CATEGORIES: InvestmentCategory[] = [
  "Tax & Accounting", "Software & AI", "Hosting & Infrastructure", "Legal", "Marketing", "Equipment", "Other",
];

export interface FinancialInvestmentRecord {
  id: string;
  investorName: string;
  investorEmail?: string;
  investorRole: UserRole;
  clientCode: string;
  projectCode: string;
  departmentCategory: DepartmentCategory;
  category: InvestmentCategory;
  supplier: string;
  description: string;
  amount: number;
  currency: string;
  incurredAt: string;
  receiptReference?: string;
  status: "documented" | "verified";
}

// Known contributions are deliberately unvalued until management approves hours/OVUs.
export const KNOWN_CONTRIBUTIONS: ContributionRecord[] = [
  {
    id: "founder-platform-build",
    contributorName: "Roger S.",
    contributorEmail: "roger.s@gradagig.com",
    role: "CodeWithKris Administrator",
    clientCode: "INTERNAL",
    projectCode: "CWK-FOUNDATION",
    departmentCategory: "Delivery",
    effortCategory: "Development",
    contributionType: "Founding and platform development",
    description: "Founder contribution covering product direction, application development, and cooperative model design.",
    loggedHours: null,
    weightedUnits: null,
    status: "unvalued",
    contributedAt: "2026-08-30T00:00:00Z",
  },
  {
    id: "abhinaya-brand-logo",
    contributorName: "Abhinaya",
    role: "Individual",
    clientCode: "INTERNAL",
    projectCode: "CWK-BRAND",
    departmentCategory: "Sales & Marketing",
    effortCategory: "Brand Design",
    contributionType: "Brand design",
    description: "Designed the CodeWithKris logo as Brand Manager.",
    loggedHours: null,
    weightedUnits: null,
    status: "unvalued",
    contributedAt: "2026-08-30T00:00:00Z",
  },
  {
    id: "josy-audio-recordings",
    contributorName: "Josy Chow",
    role: "Persons with Disabilities",
    clientCode: "INTERNAL",
    projectCode: "CWK-VOICE",
    departmentCategory: "Delivery",
    effortCategory: "Audio / Voice",
    contributionType: "Audio contribution",
    description: "Shared audio recordings and lived-experience input as PwD Ambassador.",
    loggedHours: null,
    weightedUnits: null,
    status: "unvalued",
    contributedAt: "2026-08-30T00:00:00Z",
  },
];

// This is a documented minimum only; detailed receipts can be entered individually.
export const KNOWN_INVESTMENTS: FinancialInvestmentRecord[] = [
  {
    id: "roger-operating-costs-minimum",
    investorName: "Roger S.",
    investorEmail: "roger.s@gradagig.com",
    investorRole: "CodeWithKris Administrator",
    clientCode: "INTERNAL",
    projectCode: "CWK-FOUNDATION",
    departmentCategory: "Finance & Admin",
    category: "Other",
    supplier: "Multiple suppliers",
    description: "Documented minimum spent on tax, accounting, GitHub Copilot, and related CodeWithKris operating costs. Itemized receipt allocation is pending.",
    amount: 2500,
    currency: "USD",
    incurredAt: "2026-08-30T00:00:00Z",
    status: "documented",
  },
];
