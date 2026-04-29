alter table public.collaborator_profiles
add column if not exists position text not null default '';
