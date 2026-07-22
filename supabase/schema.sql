-- Quick & Fresh — Supabase schema
-- Τρέξε αυτό ΠΡΩΤΑ στο Supabase SQL editor (Project → SQL Editor → New query).
-- Μετά τρέξε το seed_data.sql για να γεμίσεις τα 122 προϊόντα + 54 επαφές.

-- Κάθε προϊόν/επαφή αποθηκεύεται σαν ένα JSONB blob στη στήλη "data",
-- ίδια δομή με το db.json που ήδη χρησιμοποιεί η εφαρμογή — έτσι δεν χρειάζεται
-- να ξαναγραφτεί η λογική του frontend, μόνο το api.js.

create table if not exists products (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists contacts (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security
alter table products enable row level security;
alter table contacts enable row level security;

-- Η εφαρμογή δεν έχει δικό της σύστημα login (όπως και η προηγούμενη έκδοση
-- με Express), οπότε επιτρέπουμε πλήρη πρόσβαση μέσω του anon key.
-- ΣΗΜΕΙΩΣΗ ΑΣΦΑΛΕΙΑΣ: το anon key είναι ενσωματωμένο στο frontend bundle,
-- άρα οποιοσδήποτε ξέρει το URL της εφαρμογής μπορεί να διαβάσει/γράψει δεδομένα.
-- Αν αργότερα θες login (π.χ. μόνο η ομάδα σου να επεξεργάζεται), μπορούμε να
-- προσθέσουμε Supabase Auth και να περιορίσουμε αυτά τα policies σε
-- "authenticated" χρήστες αντί για "anon".

create policy "products_select" on products for select using (true);
create policy "products_insert" on products for insert with check (true);
create policy "products_update" on products for update using (true);
create policy "products_delete" on products for delete using (true);

create policy "contacts_select" on contacts for select using (true);
create policy "contacts_insert" on contacts for insert with check (true);
create policy "contacts_update" on contacts for update using (true);
create policy "contacts_delete" on contacts for delete using (true);

-- Storage bucket για τις εικόνες προϊόντων (images365 / imagesPromo)
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

create policy "images_public_read" on storage.objects for select
  using (bucket_id = 'images');
create policy "images_public_upload" on storage.objects for insert
  with check (bucket_id = 'images');
create policy "images_public_update" on storage.objects for update
  using (bucket_id = 'images');
create policy "images_public_delete" on storage.objects for delete
  using (bucket_id = 'images');
