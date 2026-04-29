-- Fix RLS helpers to read role/site from public.users profile
-- and allow authenticated operations on app-evidence storage bucket.

create or replace function public.current_role()
returns text
language plpgsql
stable
as $$
declare
  role_value text;
begin
  if to_regclass('public.users') is not null then
    execute 'select u.role from public.users u where u.id = auth.uid()'
      into role_value;
  end if;

  return coalesce(role_value, auth.jwt() ->> 'role', 'operaciones');
end;
$$;

create or replace function public.current_site()
returns text
language plpgsql
stable
as $$
declare
  site_value text;
begin
  if to_regclass('public.users') is not null then
    execute 'select u.site_code from public.users u where u.id = auth.uid()'
      into site_value;
  end if;

  return coalesce(site_value, auth.jwt() ->> 'site_code', 'CEDIS');
end;
$$;

-- Storage policies for evidence uploads
drop policy if exists "app evidence read public" on storage.objects;
drop policy if exists "app evidence upload authenticated" on storage.objects;
drop policy if exists "app evidence update authenticated" on storage.objects;
drop policy if exists "app evidence delete authenticated" on storage.objects;

create policy "app evidence read public"
  on storage.objects
  for select
  using (bucket_id = 'app-evidence');

create policy "app evidence upload authenticated"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'app-evidence');

create policy "app evidence update authenticated"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'app-evidence')
  with check (bucket_id = 'app-evidence');

create policy "app evidence delete authenticated"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'app-evidence');
