alter table public.collaborator_profiles
add column if not exists last_renewal_date date;
