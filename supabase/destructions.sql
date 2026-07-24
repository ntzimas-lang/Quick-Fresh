-- Quick & Fresh — Καταστροφές
-- Τρέξε στο Supabase SQL editor ΜΕΤΑ το sales.sql.
-- Καταγράφει κάθε καταστροφή προϊόντος (ποσότητα που πετάχτηκε λόγω λήξης).
-- Ίδιο μοτίβο αποθήκευσης (jsonb blob στήλη "data") με τα υπόλοιπα.

create table if not exists destructions (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table destructions enable row level security;

drop policy if exists "destructions_select_auth" on destructions;
create policy "destructions_select_auth" on destructions for select
  using (auth.role() = 'authenticated');

-- Όλοι οι συνδεδεμένοι χρήστες (Super User, Viewer, Οδηγός) μπορούν να καταγράφουν
-- καταστροφή — ίδια λογική με το product_entries (Καταχώρηση Ληγμένων).
drop policy if exists "destructions_insert_auth" on destructions;
create policy "destructions_insert_auth" on destructions for insert
  with check (auth.role() = 'authenticated');

-- Μόνο ο Super User μπορεί να διαγράψει λανθασμένη καταχώρηση καταστροφής.
drop policy if exists "destructions_delete_super_user" on destructions;
create policy "destructions_delete_super_user" on destructions for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'super_user'));

drop trigger if exists destructions_audit on destructions;
create trigger destructions_audit
  after insert or delete on destructions
  for each row execute procedure public.log_change();
