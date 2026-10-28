-- =====================================================================
-- Kloset marketplace: Supabase database setup
--
-- Run this whole file in Supabase:
--   Dashboard -> SQL Editor -> New query -> paste everything -> Run
-- It is safe to run again later (for example after an update).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Profiles: one row per signed-up user
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  email text,
  phone text not null default '' check (char_length(phone) <= 20),
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for anyone who signed up before this script was run
insert into public.profiles (id, full_name, email)
select id, left(coalesce(raw_user_meta_data ->> 'full_name', ''), 80), email from auth.users
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;


-- ---------------------------------------------------------------------
-- Brands: each user can run one brand; admins approve it before it goes live
-- ---------------------------------------------------------------------
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  slug text not null unique,
  description text not null default '' check (char_length(description) <= 600),
  city text not null default '' check (char_length(city) <= 60),
  state text not null default '' check (char_length(state) <= 40),
  whatsapp text not null check (whatsapp ~ '^[0-9]{10,15}$'),
  instagram text not null default '' check (instagram ~ '^[A-Za-z0-9._]{0,30}$'),
  logo_url text check (logo_url is null or logo_url like 'https://%'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  review_note text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create or replace function public.owns_brand(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.brands where id = target and owner_id = auth.uid());
$$;

create or replace function public.brand_is_live(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.brands where id = target and status = 'approved');
$$;

-- Gives new brands a unique web address (slug) and sends an edited,
-- previously rejected brand back to the review queue.
create or replace function public.brands_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  if tg_op = 'INSERT' then
    base := trim(both '-' from regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g'));
    if base = '' then base := 'brand'; end if;
    candidate := base;
    while exists (select 1 from public.brands where slug = candidate) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    new.slug := candidate;
  elsif old.status = 'rejected' and not public.is_admin() then
    new.status := 'pending';
    new.review_note := null;
  end if;
  return new;
end $$;

drop trigger if exists brands_before_write on public.brands;
create trigger brands_before_write
  before insert or update on public.brands
  for each row execute function public.brands_before_write();

create or replace function public.set_brand_status(target uuid, new_status text, note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only Kloset admins can review brands';
  end if;
  if new_status not in ('pending', 'approved', 'rejected', 'suspended') then
    raise exception 'Unknown brand status: %', new_status;
  end if;
  update public.brands
     set status = new_status,
         review_note = left(note, 500),
         approved_at = case when new_status = 'approved' then coalesce(approved_at, now()) else approved_at end
   where id = target;
end $$;


-- ---------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  price integer not null check (price between 100 and 50000000),
  category text not null check (category in ('Clothing', 'Shoes', 'Accessories')),
  subcategory text check (subcategory is null or subcategory in ('Native wear', 'Streetwear', 'Corporate wear', 'Casual wear', 'Occasion wear')),
  description text not null default '' check (char_length(description) <= 1500),
  sizes text[] not null default '{}' check (cardinality(sizes) <= 15),
  images text[] not null check (cardinality(images) between 1 and 4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_brand_id_idx on public.products (brand_id);
create index if not exists products_created_at_idx on public.products (created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------
-- Orders: a checkout creates one order per brand in the bag.
-- No payment is taken on the site; the brand contacts the buyer.
-- ---------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1001;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint not null unique default nextval('public.order_number_seq'),
  buyer_id uuid references public.profiles (id) on delete set null,
  brand_id uuid not null references public.brands (id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  total integer not null default 0,
  buyer_name text not null,
  buyer_phone text not null,
  buyer_email text,
  address text not null,
  city text not null,
  state text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_buyer_id_idx on public.orders (buyer_id);
create index if not exists orders_brand_id_idx on public.orders (brand_id);

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  image text,
  size text,
  unit_price integer not null,
  qty integer not null check (qty between 1 and 20)
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- Checkout. Prices always come from the database, never from the browser.
create or replace function public.place_order(items jsonb, contact jsonb)
returns table (order_id uuid, order_number bigint, brand_id uuid, brand_name text, brand_whatsapp text, total integer)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  b record;
  new_id uuid;
  new_number bigint;
  order_total integer;
begin
  if uid is null then
    raise exception 'Please sign in to place an order';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Your bag is empty';
  end if;
  if jsonb_array_length(items) > 50 then
    raise exception 'Too many items in one order';
  end if;
  if jsonb_typeof(contact) is distinct from 'object'
     or coalesce(trim(contact ->> 'name'), '') = ''
     or coalesce(trim(contact ->> 'phone'), '') = ''
     or coalesce(trim(contact ->> 'address'), '') = ''
     or coalesce(trim(contact ->> 'city'), '') = ''
     or coalesce(trim(contact ->> 'state'), '') = '' then
    raise exception 'Please fill in your name, phone number and delivery address';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(items) i
      left join public.products p on p.id = (i ->> 'product_id')::uuid
      left join public.brands br on br.id = p.brand_id
     where p.id is null
        or not p.is_active
        or br.status is distinct from 'approved'
        or coalesce((i ->> 'qty')::int, 0) not between 1 and 20
  ) then
    raise exception 'Some items in your bag are no longer available. Please refresh and try again.';
  end if;

  for b in
    select distinct br.id, br.name, br.whatsapp
      from jsonb_array_elements(items) i
      join public.products p on p.id = (i ->> 'product_id')::uuid
      join public.brands br on br.id = p.brand_id
  loop
    insert into public.orders (buyer_id, brand_id, buyer_name, buyer_phone, buyer_email, address, city, state, note)
    values (
      uid, b.id,
      left(trim(contact ->> 'name'), 80),
      left(trim(contact ->> 'phone'), 20),
      (select email from public.profiles where id = uid),
      left(trim(contact ->> 'address'), 300),
      left(trim(contact ->> 'city'), 60),
      left(trim(contact ->> 'state'), 40),
      left(coalesce(trim(contact ->> 'note'), ''), 500)
    )
    returning orders.id, orders.order_number into new_id, new_number;

    insert into public.order_items (order_id, product_id, product_name, image, size, unit_price, qty)
    select new_id, p.id, p.name, p.images[1], left(nullif(trim(i ->> 'size'), ''), 20), p.price, (i ->> 'qty')::int
      from jsonb_array_elements(items) i
      join public.products p on p.id = (i ->> 'product_id')::uuid
     where p.brand_id = b.id;

    select coalesce(sum(oi.unit_price * oi.qty), 0) into order_total
      from public.order_items oi where oi.order_id = new_id;
    update public.orders o set total = order_total where o.id = new_id;

    order_id := new_id;
    order_number := new_number;
    brand_id := b.id;
    brand_name := b.name;
    brand_whatsapp := b.whatsapp;
    total := order_total;
    return next;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- Who may read and change what (row level security)
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Only allow changes to specific columns. Status, roles, slugs and order
-- totals can only be changed by the functions above.
revoke all on public.profiles, public.brands, public.products, public.orders, public.order_items from anon, authenticated;
grant select on public.brands, public.products to anon, authenticated;
grant select on public.profiles, public.orders, public.order_items to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant insert (owner_id, name, description, city, state, whatsapp, instagram, logo_url) on public.brands to authenticated;
grant update (name, description, city, state, whatsapp, instagram, logo_url) on public.brands to authenticated;
grant insert (brand_id, name, price, category, subcategory, description, sizes, images, is_active) on public.products to authenticated;
grant update (name, price, category, subcategory, description, sizes, images, is_active) on public.products to authenticated;
grant delete on public.products to authenticated;
grant update (status) on public.orders to authenticated;

revoke execute on function public.place_order(jsonb, jsonb) from public, anon;
grant execute on function public.place_order(jsonb, jsonb) to authenticated;
revoke execute on function public.set_brand_status(uuid, text, text) from public, anon;
grant execute on function public.set_brand_status(uuid, text, text) to authenticated;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "Live brands are public" on public.brands;
create policy "Live brands are public" on public.brands
  for select using (status = 'approved' or owner_id = (select auth.uid()) or public.is_admin());
drop policy if exists "Users apply with their own brand" on public.brands;
create policy "Users apply with their own brand" on public.brands
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "Owners edit their brand" on public.brands;
create policy "Owners edit their brand" on public.brands
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "Listed products of live brands are public" on public.products;
create policy "Listed products of live brands are public" on public.products
  for select using ((is_active and public.brand_is_live(brand_id)) or public.owns_brand(brand_id) or public.is_admin());
drop policy if exists "Brand owners add products" on public.products;
create policy "Brand owners add products" on public.products
  for insert to authenticated with check (public.owns_brand(brand_id));
drop policy if exists "Brand owners edit products" on public.products;
create policy "Brand owners edit products" on public.products
  for update to authenticated using (public.owns_brand(brand_id)) with check (public.owns_brand(brand_id));
drop policy if exists "Brand owners delete products" on public.products;
create policy "Brand owners delete products" on public.products
  for delete to authenticated using (public.owns_brand(brand_id));

drop policy if exists "Buyers and brands see their orders" on public.orders;
create policy "Buyers and brands see their orders" on public.orders
  for select to authenticated using (buyer_id = (select auth.uid()) or public.owns_brand(brand_id) or public.is_admin());
drop policy if exists "Brands update order status" on public.orders;
create policy "Brands update order status" on public.orders
  for update to authenticated using (public.owns_brand(brand_id)) with check (public.owns_brand(brand_id));

drop policy if exists "Order items follow their order" on public.order_items;
create policy "Order items follow their order" on public.order_items
  for select to authenticated using (exists (select 1 from public.orders o where o.id = order_items.order_id));


-- ---------------------------------------------------------------------
-- Image storage: public product photos, each user uploads into their own folder
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "VOGUEHUB read own images" on storage.objects;
create policy "VOGUEHUB read own images" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "VOGUEHUB upload own images" on storage.objects;
create policy "VOGUEHUB upload own images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "VOGUEHUB delete own images" on storage.objects;
create policy "VOGUEHUB delete own images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- ---------------------------------------------------------------------
-- Make yourself the admin (do this once, after signing up on the site).
-- Replace the email, remove the two leading dashes, and run just that line:
--
-- update public.profiles set role = 'admin' where email = 'you@example.com';
-- ---------------------------------------------------------------------
