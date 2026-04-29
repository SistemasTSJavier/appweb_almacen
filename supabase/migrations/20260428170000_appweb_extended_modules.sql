create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  requested_by text not null,
  title text not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id),
  sku text not null,
  description text not null,
  quantity integer not null default 1,
  reason text not null default 'Reposicion',
  created_at timestamptz not null default now()
);

create table if not exists public.cyclic_tasks (
  id uuid primary key default gen_random_uuid(),
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  week_key text not null,
  created_by text not null,
  status text not null check (status in ('pending','completed')) default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.cyclic_task_items (
  id uuid primary key default gen_random_uuid(),
  cyclic_task_id uuid not null references public.cyclic_tasks(id) on delete cascade,
  item_id uuid references public.inventory_items(id),
  sku text not null,
  description text not null,
  system_qty integer not null default 0,
  counted_qty integer,
  created_at timestamptz not null default now()
);

create table if not exists public.collaborator_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null unique,
  employee_code text not null,
  full_name text not null,
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  service text not null default '',
  hire_date date not null,
  shirt_size text,
  pants_size text,
  shoe_size text,
  updated_at timestamptz not null default now()
);

create table if not exists public.collaborator_history (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  site_code text not null check (site_code in ('CEDIS','ACUNA','NLD')),
  type text not null check (type in ('salida','cambio')),
  item_label text not null,
  size text,
  quantity integer not null default 1,
  note text,
  created_at timestamptz not null default now()
);

alter table public.dispatches add column if not exists evidence_url text;
alter table public.changes add column if not exists evidence_url text;

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.cyclic_tasks enable row level security;
alter table public.cyclic_task_items enable row level security;
alter table public.collaborator_profiles enable row level security;
alter table public.collaborator_history enable row level security;

create policy "purchase orders by site"
  on public.purchase_orders for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

create policy "purchase order items by role"
  on public.purchase_order_items for all
  using (true)
  with check (true);

create policy "cyclic tasks by site"
  on public.cyclic_tasks for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

create policy "cyclic items by role"
  on public.cyclic_task_items for all
  using (true)
  with check (true);

create policy "collaborator profile by site"
  on public.collaborator_profiles for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

create policy "collaborator history by site"
  on public.collaborator_history for all
  using (public.current_role() = 'admin' or site_code = public.current_site())
  with check (public.current_role() = 'admin' or site_code = public.current_site());

insert into storage.buckets (id, name, public)
values ('app-evidence', 'app-evidence', true)
on conflict (id) do nothing;
