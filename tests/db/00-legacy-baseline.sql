-- Reconstruction of the CURRENT production schema, from the pasted
-- pg_get_functiondef dump. The migration is tested against this.
-- Table shapes are inferred from how the functions use them.

create table public.routes (
  key text primary key
);

create table public.bus_positions (
  route_key  text not null references public.routes(key),
  session_id text not null,
  lat        double precision,
  lng        double precision,
  speed      double precision,
  direction  text,
  bus_label  text,
  updated_at timestamptz not null default now(),
  unique (route_key, session_id)
);

create table public.sightings (
  route_key  text not null references public.routes(key),
  body       text not null,
  created_at timestamptz not null default now()
);

alter table public.routes enable row level security;
alter table public.bus_positions enable row level security;
alter table public.sightings enable row level security;

-- ---- functions exactly as dumped (whitespace normalised) ----

CREATE OR REPLACE FUNCTION public.route_exists(p_key text)
 RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.routes where key = p_key);
$function$;

CREATE OR REPLACE FUNCTION public.get_sightings(p_key text)
 RETURNS TABLE(body text, created_at timestamptz)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select s.body, s.created_at from public.sightings s
  where s.route_key = p_key order by s.created_at desc limit 6;
$function$;

CREATE OR REPLACE FUNCTION public.add_sighting(p_key text, p_body text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.routes where key = p_key) then
    raise exception 'invalid key';
  end if;
  if p_body is null or char_length(p_body) < 1 or char_length(p_body) > 140 then
    raise exception 'invalid sighting text';
  end if;
  insert into public.sightings (route_key, body) values (p_key, p_body);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_positions(p_key text)
 RETURNS TABLE(session_id text, lat double precision, lng double precision,
               speed double precision, direction text, bus_label text, updated_at timestamptz)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  delete from public.bus_positions b
  where b.route_key = p_key and b.updated_at < now() - interval '15 minutes';
  return query
  select b.session_id, b.lat, b.lng, b.speed, b.direction, b.bus_label, b.updated_at
  from public.bus_positions b where b.route_key = p_key order by b.updated_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_bus_position(p_key text, p_session text,
  p_lat double precision, p_lng double precision, p_speed double precision,
  p_direction text, p_label text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  last_ts timestamptz;
begin
  if not exists (select 1 from public.routes where key = p_key) then
    raise exception 'invalid key';
  end if;
  if p_session is null or p_session !~ '^[A-Za-z0-9\-]{8,64}$' then
    raise exception 'invalid session';
  end if;
  if p_direction not in ('north','south') then
    raise exception 'invalid direction';
  end if;
  if p_label is not null and char_length(p_label) > 12 then
    raise exception 'label too long';
  end if;
  if p_lat < 13.90 or p_lat > 14.75 or p_lng < 120.70 or p_lng > 121.15 then
    raise exception 'position off route';
  end if;
  if p_speed is null then p_speed := 0; end if;
  if p_speed < 0 or p_speed > 60 then
    raise exception 'implausible speed';
  end if;
  select updated_at into last_ts from public.bus_positions
  where route_key = p_key and session_id = p_session;
  if last_ts is not null and now() - last_ts < interval '2 seconds' then
    raise exception 'rate limited';
  end if;
  if last_ts is null and
     (select count(*) from public.bus_positions where route_key = p_key) >= 25 then
    raise exception 'too many active sessions';
  end if;
  insert into public.bus_positions
    (route_key, session_id, lat, lng, speed, direction, bus_label, updated_at)
  values (p_key, p_session, p_lat, p_lng, p_speed, p_direction, nullif(trim(p_label), ''), now())
  on conflict (route_key, session_id) do update
    set lat = excluded.lat, lng = excluded.lng, speed = excluded.speed,
        direction = excluded.direction, bus_label = excluded.bus_label, updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.clear_bus_position(p_key text, p_session text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  delete from public.bus_positions where route_key = p_key and session_id = p_session;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_positions(p_key text, p_stale_min integer DEFAULT 10)
 RETURNS TABLE(session_id text, lat double precision, lng double precision,
               speed double precision, direction text, bus_label text, updated_at timestamptz)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  delete from public.bus_positions b
  where b.route_key = p_key
    and b.updated_at < now() - make_interval(mins => greatest(p_stale_min, 1));
  return query
  select b.session_id, b.lat, b.lng, b.speed, b.direction, b.bus_label, b.updated_at
  from public.bus_positions b where b.route_key = p_key order by b.updated_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_sightings(p_key text, p_max_age_min integer DEFAULT 120)
 RETURNS TABLE(body text, created_at timestamptz)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  delete from public.sightings s
  where s.route_key = p_key
    and s.created_at < now() - make_interval(mins => greatest(p_max_age_min, 1) * 3);
  return query
  select s.body, s.created_at from public.sightings s
  where s.route_key = p_key
    and s.created_at >= now() - make_interval(mins => greatest(p_max_age_min, 1))
  order by s.created_at desc limit 6;
end;
$function$;

-- test seed: one route with an active key, live sharers, sightings
insert into public.routes (key) values ('OLD-SHARE-KEY-123');
insert into public.bus_positions (route_key, session_id, lat, lng, speed, direction, bus_label)
values ('OLD-SHARE-KEY-123', 'session-aaaa-1111', 14.51, 120.99, 10, 'south', '98018'),
       ('OLD-SHARE-KEY-123', 'session-bbbb-2222', 14.17, 120.92, 12, 'north', null);
insert into public.sightings (route_key, body) values
  ('OLD-SHARE-KEY-123', 'Northbound just passed Amadeo 6:42am'),
  ('OLD-SHARE-KEY-123', 'BUY CHEAP WATCHES www.spam.example');
