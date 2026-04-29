create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  role text not null check (role in ('admin','operaciones','almacen_cedis','almacen_acuna','almacen_nld')),
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  sku text not null,
  description text not null,
  quantity integer not null default 0,
  min_stock integer not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text unique not null,
  full_name text not null,
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  pending_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  employee_id uuid references public.employees(id),
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.dispatches (
  id uuid primary key default gen_random_uuid(),
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  employee_id uuid references public.employees(id),
  proof_url text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.recoveries (
  id uuid primary key default gen_random_uuid(),
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  employee_id uuid references public.employees(id),
  reason text not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.changes (
  id uuid primary key default gen_random_uuid(),
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  employee_id uuid references public.employees(id),
  reason text not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  order_number text not null,
  requested_by text not null,
  status text not null check (status in ('draft','approved','sent')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.cyclic_inventories (
  id uuid primary key default gen_random_uuid(),
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  item_id uuid references public.inventory_items(id),
  system_qty integer not null,
  counted_qty integer not null,
  status text not null check (status in ('pending','reconciled')),
  counted_at timestamptz not null default now()
);

create table if not exists public.pending_tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id),
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  title text not null,
  status text not null check (status in ('open','completed')) default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text not null,
  action text not null,
  actor_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.inventory_items enable row level security;
alter table public.employees enable row level security;
alter table public.entries enable row level security;
alter table public.dispatches enable row level security;
alter table public.recoveries enable row level security;
alter table public.changes enable row level security;
alter table public.orders enable row level security;
alter table public.cyclic_inventories enable row level security;
alter table public.pending_tasks enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_role()
returns text language sql stable as $$
  select coalesce((auth.jwt() ->> 'role'), 'operaciones');
$$;

create or replace function public.current_site()
returns text language sql stable as $$
  select coalesce((auth.jwt() ->> 'site_code'), 'CEDIS');
$$;

create policy "users read own site"
  on public.users for select
  using (public.current_role() = 'admin' or site_code = public.current_site());

create policy "inventory by site"
  on public.inventory_items for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

create policy "employees by site"
  on public.employees for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

create policy "entries by site"
  on public.entries for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

create policy "dispatches by site"
  on public.dispatches for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

create policy "recoveries by site"
  on public.recoveries for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

create policy "changes by site"
  on public.changes for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

create policy "orders by role"
  on public.orders for all
  using (public.current_role() in ('admin','operaciones'))
  with check (public.current_role() in ('admin','operaciones'));

create policy "cyclic by site"
  on public.cyclic_inventories for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

create policy "pending by site"
  on public.pending_tasks for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

create policy "audit admin only"
  on public.audit_logs for select
  using (public.current_role() = 'admin');
