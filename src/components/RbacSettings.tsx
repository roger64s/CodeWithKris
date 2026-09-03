import { startTransition, useEffect, useState } from "react";
import { ShieldCheck, UserCog } from "lucide-react";
import { supabase } from "../supabase";
import { RBAC_RESOURCES, defaultPolicy, mergePolicy, type RbacPolicy, type RbacResourceKey } from "../lib/rbac";

type RoleRecord = { id: string; slug: string; display_name: string; description: string; built_in: boolean };
type UserRecord = { user_id: string; email: string; display_name: string; role_id: string | null };

const PREVIEW_ROLES: RoleRecord[] = [
  { id: "student", slug: "student", display_name: "Student", description: "Learning and personal progress", built_in: true },
  { id: "instructor", slug: "instructor", display_name: "Instructor", description: "Learning support and delivery oversight", built_in: true },
  { id: "security-admin", slug: "security-admin", display_name: "Security Admin", description: "Security and access administration", built_in: true },
  { id: "administrator", slug: "administrator", display_name: "Administrator", description: "Full platform administration", built_in: true },
];

export function RbacSettings({ onPoliciesChanged }: { onPoliciesChanged: () => void }) {
  const isPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");
  const [roles, setRoles] = useState<RoleRecord[]>(isPreview ? PREVIEW_ROLES : []);
  const [selectedRoleId, setSelectedRoleId] = useState(isPreview ? "student" : "");
  const [policy, setPolicy] = useState<RbacPolicy>(() => defaultPolicy("student"));
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [status, setStatus] = useState("");

  const selectedRole = roles.find((role) => role.id === selectedRoleId);

  useEffect(() => {
    if (isPreview || !supabase) return;
    void Promise.all([
      supabase.from("rbac_roles").select("id, slug, display_name, description, built_in").order("display_name"),
      supabase.rpc("list_rbac_users"),
    ]).then(([roleResult, userResult]) => {
      if (roleResult.error) return setStatus("Apply the RBAC Supabase migration to configure access.");
      const loadedRoles = (roleResult.data || []) as RoleRecord[];
      setRoles(loadedRoles);
      setSelectedRoleId((current) => current || loadedRoles[0]?.id || "");
      if (!userResult.error) setUsers((userResult.data || []) as UserRecord[]);
    });
  }, [isPreview]);

  useEffect(() => {
    if (!selectedRole) return;
    if (isPreview || !supabase) {
      startTransition(() => setPolicy(defaultPolicy(selectedRole.slug)));
      return;
    }
    void supabase.from("rbac_permissions").select("resource_key, can_view, can_access").eq("role_id", selectedRole.id)
      .then(({ data }) => setPolicy(mergePolicy(data || [])));
  }, [isPreview, selectedRole, selectedRoleId]);

  const updatePermission = (resource: RbacResourceKey, field: "canView" | "canAccess", checked: boolean) => {
    setPolicy((current) => ({
      ...current,
      [resource]: {
        ...current[resource],
        [field]: checked,
        ...(field === "canView" && !checked ? { canAccess: false } : {}),
        ...(field === "canAccess" && checked ? { canView: true } : {}),
      },
    }));
  };

  const savePolicy = async () => {
    if (!selectedRole) return;
    if (isPreview || !supabase) return setStatus("Preview permissions updated for this session.");
    const rows = RBAC_RESOURCES.map(({ key }) => ({
      role_id: selectedRole.id,
      resource_key: key,
      can_view: policy[key].canView,
      can_access: policy[key].canAccess,
    }));
    const { error } = await supabase.from("rbac_permissions").upsert(rows, { onConflict: "role_id,resource_key" });
    setStatus(error ? error.message : "Permissions saved.");
    if (!error) onPoliciesChanged();
  };

  const createRole = async () => {
    const displayName = newRoleName.trim();
    if (!displayName) return;
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return setStatus("Enter a role name using letters or numbers.");
    if (isPreview || !supabase) {
      const role = { id: slug, slug, display_name: displayName, description: newRoleDescription.trim(), built_in: false };
      setRoles((current) => [...current, role]);
      setSelectedRoleId(role.id);
    } else {
      const { data, error } = await supabase.from("rbac_roles").insert({ slug, display_name: displayName, description: newRoleDescription.trim() }).select().single();
      if (error) return setStatus(error.message);
      setRoles((current) => [...current, data as RoleRecord]);
      setSelectedRoleId(data.id);
    }
    setNewRoleName("");
    setNewRoleDescription("");
    setStatus("Role created.");
  };

  const assignRole = async (userId: string, roleId: string) => {
    if (isPreview || !supabase) {
      setUsers((current) => current.map((user) => user.user_id === userId ? { ...user, role_id: roleId } : user));
      return;
    }
    const { error } = await supabase.rpc("assign_rbac_role", { target_user_id: userId, target_role_id: roleId });
    setStatus(error ? error.message : "User role updated.");
    if (!error) setUsers((current) => current.map((user) => user.user_id === userId ? { ...user, role_id: roleId } : user));
  };

  return <section className="rbac-settings" aria-labelledby="rbac-title">
    <div className="rbac-heading">
      <ShieldCheck aria-hidden="true" />
      <div><h2 id="rbac-title">Role-based access</h2><p>Control which navigation items and modules each role can see and open.</p></div>
    </div>
    <div className="rbac-layout">
      <aside className="rbac-roles" aria-label="Roles">
        {roles.map((item) => <button key={item.id} className={item.id === selectedRoleId ? "active" : ""} onClick={() => setSelectedRoleId(item.id)}><strong>{item.display_name}</strong><span>{item.description || "Custom role"}</span></button>)}
        <div className="rbac-create">
          <label>Role name<input value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} placeholder="e.g. Course reviewer" /></label>
          <label>Description<input value={newRoleDescription} onChange={(event) => setNewRoleDescription(event.target.value)} /></label>
          <button onClick={createRole}>Add role</button>
        </div>
      </aside>
      <div className="rbac-permissions">
        <div className="rbac-table-heading"><div><strong>{selectedRole?.display_name || "Select a role"}</strong><span>Visibility and access are enforced separately.</span></div><span>Visible</span><span>Access</span></div>
        {RBAC_RESOURCES.map((resource) => <div className="rbac-permission-row" key={resource.key}>
          <div><strong>{resource.label}</strong><span>{resource.category}</span></div>
          <input type="checkbox" aria-label={`Show ${resource.label}`} checked={policy[resource.key].canView} onChange={(event) => updatePermission(resource.key, "canView", event.target.checked)} />
          <input type="checkbox" aria-label={`Allow ${resource.label}`} checked={policy[resource.key].canAccess} onChange={(event) => updatePermission(resource.key, "canAccess", event.target.checked)} />
        </div>)}
        <button className="primary-button rbac-save" onClick={savePolicy}>Save permissions</button>
      </div>
    </div>
    {users.length > 0 && <div className="rbac-users"><div className="rbac-heading"><UserCog aria-hidden="true" /><div><h2>User assignments</h2><p>Assign one configured access role to each account.</p></div></div>{users.map((user) => <label key={user.user_id}><span><strong>{user.display_name || user.email}</strong><small>{user.email}</small></span><select value={user.role_id || ""} onChange={(event) => assignRole(user.user_id, event.target.value)}><option value="" disabled>Select role</option>{roles.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>)}</div>}
    {status && <p className="rbac-status" role="status">{status}</p>}
  </section>;
}