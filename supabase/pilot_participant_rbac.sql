-- Apply after rbac_access_control.sql.
alter table public.rbac_permissions drop constraint if exists rbac_permissions_resource_key_check;
alter table public.rbac_permissions add constraint rbac_permissions_resource_key_check check (resource_key in (
  'templates', 'record', 'practice', 'progress', 'dictionary', 'action-trial',
  'learning', 'peer-review', 'gtm-pilot', 'participant-evidence', 'requirements', 'sprints', 'quality',
  'baselines', 'support', 'financials', 'admin', 'profile'
));

insert into public.rbac_permissions (role_id, resource_key, can_view, can_access)
select role.id, 'participant-evidence', true, true
from public.rbac_roles role
where role.slug in ('student', 'instructor', 'administrator', 'security-admin')
on conflict (role_id, resource_key) do update set can_view = excluded.can_view, can_access = excluded.can_access;