export const RBAC_RESOURCES = [
  { key: "templates", label: "Learning dashboard", category: "Dashboard" },
  { key: "record", label: "Audio recording", category: "Learning modules" },
  { key: "practice", label: "Voice practice", category: "Learning modules" },
  { key: "progress", label: "Progress evidence", category: "Learning modules" },
  { key: "dictionary", label: "Word dictionary", category: "Learning modules" },
  { key: "action-trial", label: "Commercial task trial", category: "Learning modules" },
  { key: "learning", label: "Learning milestones", category: "Learning modules" },
  { key: "peer-review", label: "Peer review queue", category: "Operations" },
  { key: "gtm-pilot", label: "GTM Pilot", category: "Operations" },
  { key: "requirements", label: "Requirements", category: "Operations" },
  { key: "sprints", label: "Sprint board", category: "Operations" },
  { key: "quality", label: "Testing and issues", category: "Operations" },
  { key: "baselines", label: "Activity and baselines", category: "Operations" },
  { key: "support", label: "Support tickets", category: "Operations" },
  { key: "financials", label: "Coop Equity", category: "Restricted" },
  { key: "admin", label: "Administration", category: "Restricted" },
  { key: "profile", label: "User profile", category: "Account" },
] as const;

export type RbacResourceKey = (typeof RBAC_RESOURCES)[number]["key"];
export type RbacPermission = { canView: boolean; canAccess: boolean };
export type RbacPolicy = Record<RbacResourceKey, RbacPermission>;

const LEARNER_RESOURCES = new Set<RbacResourceKey>([
  "templates", "record", "practice", "progress", "dictionary", "action-trial",
  "learning", "peer-review", "support", "profile",
]);
const INSTRUCTOR_RESOURCES = new Set<RbacResourceKey>([
  ...LEARNER_RESOURCES, "gtm-pilot", "requirements", "sprints", "quality",
  "baselines",
]);

export function defaultPolicy(roleSlug: string): RbacPolicy {
  const administrator = roleSlug === "administrator" || roleSlug === "security-admin";
  const instructor = roleSlug === "instructor";
  const supportAgent = roleSlug === "support-agent";
  return Object.fromEntries(RBAC_RESOURCES.map(({ key }) => {
    const allowed = administrator
      || (instructor && INSTRUCTOR_RESOURCES.has(key))
      || (supportAgent && (key === "support" || key === "profile"))
      || (roleSlug === "student" && LEARNER_RESOURCES.has(key))
      || key === "profile";
    return [key, { canView: allowed, canAccess: allowed }];
  })) as RbacPolicy;
}

export function roleSlugFromCategory(category: string | null): string {
  if (category === "CodeWithKris Administrator") return "administrator";
  return "student";
}

export function mergePolicy(rows: Array<{ resource_key: string; can_view: boolean; can_access: boolean }>): RbacPolicy {
  const policy = Object.fromEntries(RBAC_RESOURCES.map(({ key }) => [key, { canView: false, canAccess: false }])) as RbacPolicy;
  rows.forEach((row) => {
    if (row.resource_key in policy) {
      policy[row.resource_key as RbacResourceKey] = {
        canView: row.can_view,
        canAccess: row.can_access,
      };
    }
  });
  return policy;
}

export function isRbacResource(value: string): value is RbacResourceKey {
  return RBAC_RESOURCES.some((resource) => resource.key === value);
}