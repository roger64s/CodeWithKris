/**
 * Privacy-Preserving Cryptographic Audit Engine
 * 
 * Uses the standard Web Crypto API (SubtleCrypto SHA-256) to generate zero-knowledge-ready
 * cryptographic commitment hashes of sensitive contributor PII and contribution details.
 * 
 * Raw personal data is stored strictly in Supabase (secured with Row Level Security),
 * while only the anonymous cryptographic proof and points total are emitted for L2 testnet recording.
 */

export type Hex = `0x${string}`;

export interface SensitiveContributorData {
  contributorId: string;
  fullName: string;
  email: string;
  speechCondition?: string;
  role: string;
  rawContributionDetails: Record<string, unknown>;
  walletAddress: string;
  periodId: number;
  totalPointsOrOVU: number;
}

export interface AnonymousAuditPayload {
  anonymizedContributorCommitment: Hex; // Hash of contributorId + secret salt
  dataIntegrityProofHash: Hex;          // SHA-256 hash of canonicalized sensitive contribution payload
  publicPointsTotal: number;           // Publicly auditable points / OVUs
  publicPointsWei: string;             // 18-decimal base units representation
  periodId: number;                    // Epoch / period identifier
  timestamp: number;                   // UNIX epoch timestamp
  l2Network: string;                   // Target L2 rollup (e.g. Base Sepolia)
}

/**
 * Computes a SHA-256 hex string using the browser/Node.js standard Web Crypto API (SubtleCrypto)
 */
export async function sha256Hex(data: string): Promise<Hex> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // Web Crypto API subtle digest
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexString = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  
  return `0x${hexString}` as Hex;
}

/**
 * Generates a random cryptographic salt for contributor commitment
 */
export function generateSalt(length = 32): string {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Canonicalizes a data object to ensure consistent hash derivation regardless of key order
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalizeJson).join(",")}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson((obj as Record<string, unknown>)[key])}`);
  return `{${pairs.join(",")}}`;
}

/**
 * Prepares an anonymous, publicly verifiable on-chain audit payload.
 *
 * 1. Creates an anonymized contributor commitment using (contributorId + salt).
 * 2. Creates a cryptographic data integrity proof hash of the full sensitive payload.
 * 3. Formats points for L2 testnet submission without exposing raw PII.
 */
export async function prepareAnonymousAuditPayload(
  data: SensitiveContributorData,
  secretSalt?: string
): Promise<{
  anonymousPayload: AnonymousAuditPayload;
  salt: string;
}> {
  const salt = secretSalt || generateSalt();

  // 1. Anonymized contributor commitment
  const anonymizedContributorCommitment = await sha256Hex(
    `contributor:${data.contributorId}:${salt}`
  );

  // 2. Canonical cryptographic proof hash of the complete sensitive data
  const canonicalData = canonicalizeJson({
    id: data.contributorId,
    name: data.fullName,
    email: data.email,
    speechCondition: data.speechCondition || "none",
    role: data.role,
    details: data.rawContributionDetails,
    wallet: data.walletAddress,
    points: data.totalPointsOrOVU,
    period: data.periodId,
    salt,
  });

  const dataIntegrityProofHash = await sha256Hex(canonicalData);

  // 3. 18-decimal fixed-point string representation for EVM L2 contracts
  const intPart = Math.floor(data.totalPointsOrOVU);
  const decPart = Math.round((data.totalPointsOrOVU - intPart) * 10000);
  const publicPointsWei = (
    BigInt(intPart) * 10n ** 18n +
    BigInt(decPart) * 10n ** 14n
  ).toString();

  const anonymousPayload: AnonymousAuditPayload = {
    anonymizedContributorCommitment,
    dataIntegrityProofHash,
    publicPointsTotal: data.totalPointsOrOVU,
    publicPointsWei,
    periodId: data.periodId,
    timestamp: Math.floor(Date.now() / 1000),
    l2Network: "Base Sepolia (ChainID: 84532)",
  };

  return {
    anonymousPayload,
    salt,
  };
}

/**
 * Verifies that a given set of private records matches an on-chain proof hash
 */
export async function verifyAuditProof(
  data: SensitiveContributorData,
  salt: string,
  expectedProofHash: Hex
): Promise<boolean> {
  const canonicalData = canonicalizeJson({
    id: data.contributorId,
    name: data.fullName,
    email: data.email,
    speechCondition: data.speechCondition || "none",
    role: data.role,
    details: data.rawContributionDetails,
    wallet: data.walletAddress,
    points: data.totalPointsOrOVU,
    period: data.periodId,
    salt,
  });

  const computedHash = await sha256Hex(canonicalData);
  return computedHash.toLowerCase() === expectedProofHash.toLowerCase();
}
