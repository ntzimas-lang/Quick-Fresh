-- Quick & Fresh — Πωλήσεις
-- Τρέξε στο Supabase SQL editor ΜΕΤΑ το product_entries.sql.
-- Δύο πίνακες, ίδιο μοτίβο αποθήκευσης (jsonb blob στήλη "data") με τα υπόλοιπα:
--   sales_daily    -> ημερήσια στοιχεία ανά κατάστημα (από "Daily Sales Summary")
--   sales_products -> στοιχεία ανά προϊόν, ανά "παρτίδα" upload (από "Sales Analysis Report")

create table if not exists sales_daily (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table sales_daily enable row level security;

drop policy if exists "sales_daily_select_auth" on sales_daily;
create policy "sales_daily_select_auth" on sales_daily for select
  using (auth.role() = 'authenticated');

drop policy if exists "sales_daily_insert_auth" on sales_daily;
create policy "sales_daily_insert_auth" on sales_daily for insert
  with check (auth.role() = 'authenticated');

-- Επιτρέπουμε update γιατί το upload ξανακάνει "upsert" πάνω στο ίδιο id
-- (ημερομηνία + κατάστημα) όταν ανεβαίνει ξανά περίοδος που επικαλύπτεται.
drop policy if exists "sales_daily_update_auth" on sales_daily;
create policy "sales_daily_update_auth" on sales_daily for update
  using (auth.role() = 'authenticated');

drop policy if exists "sales_daily_delete_super_user" on sales_daily;
create policy "sales_daily_delete_super_user" on sales_daily for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'super_user'));

drop trigger if exists sales_daily_audit on sales_daily;
create trigger sales_daily_audit
  after insert or update or delete on sales_daily
  for each row execute procedure public.log_change();


create table if not exists sales_products (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table sales_products enable row level security;

drop policy if exists "sales_products_select_auth" on sales_products;
create policy "sales_products_select_auth" on sales_products for select
  using (auth.role() = 'authenticated');

drop policy if exists "sales_products_insert_auth" on sales_products;
create policy "sales_products_insert_auth" on sales_products for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "sales_products_delete_super_user" on sales_products;
create policy "sales_products_delete_super_user" on sales_products for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'super_user'));

drop trigger if exists sales_products_audit on sales_products;
create trigger sales_products_audit
  after insert or delete on sales_products
  for each row execute procedure public.log_change();
