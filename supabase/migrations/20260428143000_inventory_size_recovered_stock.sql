alter table public.inventory_items
  add column if not exists size text,
  add column if not exists recovered_stock integer not null default 0;
