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

export interface FinancialMetric {
  id: string;
  period_label: string;
  total_equity_distributed: number;
  treasury_balance_usd: number;
  cooperative_dividends_pool: number;
  contributors_count: number;
  l2_block_number: number;
  created_at: string;
}

export const INITIAL_FINANCIAL_METRICS: FinancialMetric[] = [
  {
    id: "coop-2026-q3",
    period_label: "Q3 2026 Cooperative Pool",
    total_equity_distributed: 42500,
    treasury_balance_usd: 185000,
    cooperative_dividends_pool: 37000,
    contributors_count: 64,
    l2_block_number: 14892011,
    created_at: "2026-08-30T00:00:00Z",
  },
  {
    id: "coop-2026-q2",
    period_label: "Q2 2026 Cooperative Pool",
    total_equity_distributed: 31200,
    treasury_balance_usd: 142000,
    cooperative_dividends_pool: 28400,
    contributors_count: 48,
    l2_block_number: 14120894,
    created_at: "2026-06-30T00:00:00Z",
  },
];
