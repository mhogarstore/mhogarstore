-- mhogarstore · esquema de la base de datos (Supabase / PostgreSQL)
-- Se ejecuta una sola vez en Supabase: SQL Editor → pegar este archivo → Run.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type item_status as enum ('borrador', 'disponible', 'reservado', 'vendido');
create type item_condition as enum ('nuevo', 'muy', 'bueno');
create type order_status as enum ('pendiente', 'pagado', 'cancelado', 'entregado');
create type delivery_method as enum ('recogida', 'envio');

-- ---------------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------------
create table categories (
  id          text primary key,              -- 'muebles', 'iluminacion'…
  name        text not null,
  is_bulky    boolean not null default false, -- pide confirmar medidas antes de comprar
  position    int not null default 0
);

insert into categories (id, name, is_bulky, position) values
  ('muebles',     'Muebles',     true,  1),
  ('iluminacion', 'Iluminación', false, 2),
  ('decoracion',  'Decoración',  false, 3),
  ('menaje',      'Menaje',      false, 4),
  ('textil',      'Textil',      false, 5);

-- ---------------------------------------------------------------------------
-- Piezas (cada pieza es única: no hay stock, solo estado)
-- ---------------------------------------------------------------------------
create sequence item_ref_seq start 1;

create table items (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique default lpad(nextval('item_ref_seq')::text, 4, '0'),
  title           text not null,
  category_id     text not null references categories(id),
  price_cents     int  not null check (price_cents > 0),
  was_price_cents int  check (was_price_cents is null or was_price_cents > price_cents),
  condition       item_condition not null default 'muy',
  dimensions      text,                      -- 'an 180 × fo 45 × al 78 cm'
  material        text,
  era             text,                      -- 'Años 60'
  description     text,
  status          item_status not null default 'borrador',
  reserved_until  timestamptz,               -- reserva temporal mientras se paga
  sold_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index items_status_idx on items (status, created_at desc);

create table item_photos (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  path        text not null,                 -- ruta dentro del bucket 'fotos'
  alt         text,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index item_photos_item_idx on item_photos (item_id, position);

-- updated_at automático
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger items_touch before update on items for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
create table orders (
  id                 uuid primary key default gen_random_uuid(),
  number             bigint generated always as identity (start with 1001) unique,
  status             order_status not null default 'pendiente',
  delivery           delivery_method not null default 'recogida',
  subtotal_cents     int not null,
  shipping_cents     int not null default 0,
  total_cents        int not null,
  customer_name      text,
  customer_email     text,
  customer_phone     text,
  shipping_address   jsonb,
  stripe_session_id  text unique,
  stripe_payment_id  text,
  notes              text,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz
);

create table order_items (
  order_id     uuid not null references orders(id) on delete cascade,
  item_id      uuid not null references items(id),
  title        text not null,                -- copia por si luego se edita la pieza
  price_cents  int not null,
  primary key (order_id, item_id)
);

-- ---------------------------------------------------------------------------
-- Correos: boletín y "avísame si entra algo parecido"
-- ---------------------------------------------------------------------------
create table subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  kind        text not null default 'boletin' check (kind in ('boletin', 'aviso')),
  item_id     uuid references items(id) on delete set null,  -- para avisos
  created_at  timestamptz not null default now()
);
create unique index subscribers_boletin_uniq on subscribers (lower(email)) where kind = 'boletin';

-- ---------------------------------------------------------------------------
-- Quién administra la tienda (correos con acceso al panel)
-- ---------------------------------------------------------------------------
create table admins (
  email text primary key
);
-- Sustituir por el correo de la clienta antes de ejecutar, o añadirlo después:
-- insert into admins (email) values ('correo-de-la-clienta@ejemplo.com');

create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- ---------------------------------------------------------------------------
-- Vista pública del catálogo
-- Una reserva caducada se muestra como disponible.
-- ---------------------------------------------------------------------------
create view catalog with (security_invoker = false) as
select
  i.id, i.ref, i.title, i.category_id, i.price_cents, i.was_price_cents, i.condition,
  i.dimensions, i.material, i.era, i.description, i.created_at, i.sold_at,
  case
    when i.status = 'reservado' and i.reserved_until < now() then 'disponible'
    else i.status::text
  end as status,
  coalesce(
    (select json_agg(json_build_object('path', p.path, 'alt', p.alt) order by p.position)
       from item_photos p where p.item_id = i.id),
    '[]'::json
  ) as photos
from items i
where i.status <> 'borrador'
  and (i.status <> 'vendido' or i.sold_at > now() - interval '60 days');  -- las vendidas se ven 60 días

-- ---------------------------------------------------------------------------
-- Reservar piezas de forma atómica al empezar el pago.
-- Devuelve las piezas reservadas; si falta alguna, no reserva ninguna.
-- Solo la llama el servidor (clave service_role).
-- ---------------------------------------------------------------------------
create function reserve_items(item_ids uuid[], minutes int default 35)
returns setof items language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform 1 from items where id = any(item_ids) for update;

  select count(*) into n from items
   where id = any(item_ids)
     and (status = 'disponible' or (status = 'reservado' and reserved_until < now()));

  if n <> coalesce(array_length(item_ids, 1), 0) then
    return;  -- alguna pieza ya no está disponible
  end if;

  return query
    update items
       set status = 'reservado', reserved_until = now() + make_interval(mins => minutes)
     where id = any(item_ids)
    returning *;
end $$;

create function release_items(item_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update items set status = 'disponible', reserved_until = null
   where id = any(item_ids) and status = 'reservado';
$$;

create function mark_items_sold(item_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update items set status = 'vendido', reserved_until = null, sold_at = now()
   where id = any(item_ids);
$$;

revoke execute on function reserve_items(uuid[], int) from public, anon, authenticated;
revoke execute on function release_items(uuid[]) from public, anon, authenticated;
revoke execute on function mark_items_sold(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seguridad (Row Level Security)
-- Público: leer catálogo y categorías, apuntarse a avisos.
-- Administradora: todo.
-- ---------------------------------------------------------------------------
alter table categories  enable row level security;
alter table items       enable row level security;
alter table item_photos enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;
alter table subscribers enable row level security;
alter table admins      enable row level security;

create policy "categorias visibles"   on categories  for select using (true);
create policy "admin categorias"      on categories  for all using (is_admin()) with check (is_admin());
create policy "admin piezas"          on items       for all using (is_admin()) with check (is_admin());
create policy "admin fotos"           on item_photos for all using (is_admin()) with check (is_admin());
create policy "admin pedidos"         on orders      for all using (is_admin()) with check (is_admin());
create policy "admin lineas"          on order_items for all using (is_admin()) with check (is_admin());
create policy "apuntarse"             on subscribers for insert with check (true);
create policy "admin correos"         on subscribers for select using (is_admin());
create policy "admin ve admins"       on admins      for select using (is_admin());

grant select on catalog to anon, authenticated;
-- Supabase ya concede estos permisos por defecto; se dejan explícitos. RLS decide qué filas.
grant select on categories to anon, authenticated;
grant insert on subscribers to anon, authenticated;
grant select, insert, update, delete on categories, items, item_photos, orders, order_items, subscribers to authenticated;
grant select on admins to authenticated;

-- ---------------------------------------------------------------------------
-- Fotos: bucket público 'fotos'. Lectura pública, subida solo administradora.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
on conflict (id) do nothing;

create policy "fotos subir"  on storage.objects for insert with check (bucket_id = 'fotos' and is_admin());
create policy "fotos editar" on storage.objects for update using (bucket_id = 'fotos' and is_admin());
create policy "fotos borrar" on storage.objects for delete using (bucket_id = 'fotos' and is_admin());
