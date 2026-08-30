export type Address = `0x${string}`;

/**
 * Utility to convert numeric string to 18-decimal base units (Wei representation)
 */
export function toWei(value: number | string): string {
  const numStr = typeof value === "number" ? value.toFixed(4) : value;
  const [intPart, decPart = ""] = numStr.split(".");
  const paddedDec = decPart.padEnd(18, "0").slice(0, 18);
  return (BigInt(intPart) * 10n ** 18n + BigInt(paddedDec)).toString();
}

/**
 * Outcome Valuation Unit (OVU) Base Tiers

 * Tier 1: 1 - 3 OVUs (Micro-tasks, brief speech samples)
 * Tier 2: 4 - 8 OVUs (Standard scenario practice, review session)
 * Tier 3: 9 - 15 OVUs (Complex pair programming, module build)
 * Tier 4: 16 - 25 OVUs (Feature architecture, accessibility audit)
 * Tier 5: 26+ OVUs (Major subsystem, core AI integration)
 */
export type OVUTier = "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Tier 5";

export type StakeholderCategory =
  | "Founders & Core Operating Team"
  | "Institutional Seed Investors"
  | "Employee & PwD Talent Pool"
  | "Community & Ecosystem Trust"
  | "Advisors"
  | "Unallocated Reserve / Future Rounds";

export const STAKEHOLDER_ALLOCATIONS: Record<StakeholderCategory, number> = {
  "Founders & Core Operating Team": 40,
  "Institutional Seed Investors": 20,
  "Employee & PwD Talent Pool": 10,
  "Community & Ecosystem Trust": 15,
  Advisors: 2,
  "Unallocated Reserve / Future Rounds": 13,
};

export interface OVUTierConfig {
  tier: OVUTier;
  minOVU: number;
  maxOVU: number;
  defaultOVU: number;
  description: string;
}

export const OVU_TIERS: Record<OVUTier, OVUTierConfig> = {
  "Tier 1": { tier: "Tier 1", minOVU: 1, maxOVU: 3, defaultOVU: 2, description: "Micro-task / Voice Sample (1-3 OVUs)" },
  "Tier 2": { tier: "Tier 2", minOVU: 4, maxOVU: 8, defaultOVU: 6, description: "Standard Module / Mentorship (4-8 OVUs)" },
  "Tier 3": { tier: "Tier 3", minOVU: 9, maxOVU: 15, defaultOVU: 12, description: "Complex Pair Mission / Work Artifact (9-15 OVUs)" },
  "Tier 4": { tier: "Tier 4", minOVU: 16, maxOVU: 25, defaultOVU: 20, description: "Core Feature / Accessibility Audit (16-25 OVUs)" },
  "Tier 5": { tier: "Tier 5", minOVU: 26, maxOVU: 100, defaultOVU: 30, description: "Major Subsystem / GTM Pipeline (26+ OVUs)" },
};

export interface ModifiersInput {
  hasReusabilityBonus?: boolean; // +25%
  isAheadOfSchedule?: boolean;   // +15% (>20% speed bonus)
  hasQualityPenalty?: boolean;   // -30%
}

export interface CalculateOVUInput {
  contributorAddress: Address;
  contributorId?: string;
  taskId: string;
  stakeholderCategory: StakeholderCategory;
  tier: OVUTier;
  customBaseOVU?: number;
  modifiers: ModifiersInput;
  periodId?: number;
}

export interface AppliedModifiers {
  reusabilityBonus: number; // +0.25 or 0
  speedBonus: number;       // +0.15 or 0
  qualityPenalty: number;   // -0.30 or 0
  netMultiplier: number;    // 1 + Bonus - Penalty
}

export interface FinalOVUPayload {
  contributor: Address;
  contributorId?: string;
  taskId: string;
  stakeholderCategory: StakeholderCategory;
  stakeholderPoolSharePercent: number;
  tier: OVUTier;
  baseOVU: number;
  modifiers: AppliedModifiers;
  finalOVU: number;
  finalOVUWei: string; // Formatted 18-decimal precision for Viem EVM L2 contract
  periodId: number;
  timestamp: number; // UNIX epoch timestamp
}

/**
 * Computes contributor's final Outcome Valuation Units (OVU) using:
 * OVU_final = OVU_base * (1 + Bonus - Penalty)
 */
export function calculateFinalOVU(input: CalculateOVUInput): FinalOVUPayload {
  const tierConfig = OVU_TIERS[input.tier];
  if (!tierConfig) {
    throw new Error(`Invalid OVU Tier: ${input.tier}`);
  }

  // Determine base OVU within tier bounds
  let baseOVU = input.customBaseOVU ?? tierConfig.defaultOVU;
  if (baseOVU < tierConfig.minOVU) {
    baseOVU = tierConfig.minOVU;
  } else if (input.tier !== "Tier 5" && baseOVU > tierConfig.maxOVU) {
    baseOVU = tierConfig.maxOVU;
  }

  // Dynamic Modifiers
  const reusabilityBonus = input.modifiers.hasReusabilityBonus ? 0.25 : 0;
  const speedBonus = input.modifiers.isAheadOfSchedule ? 0.15 : 0;
  const qualityPenalty = input.modifiers.hasQualityPenalty ? 0.30 : 0;

  const netMultiplier = Math.max(0, 1 + (reusabilityBonus + speedBonus) - qualityPenalty);
  const finalOVU = Number((baseOVU * netMultiplier).toFixed(4));

  // Convert to 18-decimal Wei string for on-chain L2 testnet recording
  const finalOVUWei = toWei(finalOVU);

  return {
    contributor: input.contributorAddress,
    contributorId: input.contributorId,
    taskId: input.taskId,
    stakeholderCategory: input.stakeholderCategory,
    stakeholderPoolSharePercent: STAKEHOLDER_ALLOCATIONS[input.stakeholderCategory],
    tier: input.tier,
    baseOVU,
    modifiers: {
      reusabilityBonus,
      speedBonus,
      qualityPenalty,
      netMultiplier: Number(netMultiplier.toFixed(4)),
    },
    finalOVU,
    finalOVUWei,
    periodId: input.periodId ?? Math.floor(Date.now() / 1000 / 86400 / 30), // monthly epoch
    timestamp: Math.floor(Date.now() / 1000),
  };
}
