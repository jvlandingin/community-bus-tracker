-- ============================================================
--  PATCH: a departure window may carry its own interval
--
--  The October 2026 poster gives the pre-dawn trips to Makati a
--  30 minute interval and the afternoon trips back a 40 minute
--  one. Until now the route had one headway_min for every window,
--  so one of those two was always wrong on the page, and the
--  sightings on the strip cleared at the wrong moment too (a
--  sighting is drawn for one interval, which is when the next bus
--  has overtaken it).
--
--  A window is now [start, end] or [start, end, minutes]. The
--  third field is optional and the route's headway_min stays the
--  interval for every window that has none, so every settings
--  object already stored passes unchanged, and a tracker page that
--  predates this reads the first two fields as it always did.
--  Nothing else about the shape changes: the same 1 to 6 windows
--  per direction, HH:MM, start before end, and the third field is
--  held to the same 1 to 720 minutes as headway_min.
--
--  Apply after 08-position-checks.sql. Safe to re-run.
-- ============================================================

create or replace function public._check_settings(s jsonb)
returns void language plpgsql immutable
as $$
declare d text; w jsonb; t text; i int; n int;
begin
  if s is null or jsonb_typeof(s) <> 'object' then raise exception 'settings must be an object'; end if;
  foreach d in array array['headway_min','bus_expiry_min','sighting_expiry_min','max_sessions'] loop
    if jsonb_typeof(s->d) <> 'number' then raise exception '% must be a number', d; end if;
  end loop;
  if (s->>'headway_min')::numeric not between 1 and 720 then raise exception 'headway_min out of range'; end if;
  if (s->>'bus_expiry_min')::numeric not between 1 and 120 then raise exception 'bus_expiry_min out of range'; end if;
  if (s->>'sighting_expiry_min')::numeric not between 5 and 1440 then raise exception 'sighting_expiry_min out of range'; end if;
  if (s->>'max_sessions')::numeric not between 1 and 200 then raise exception 'max_sessions out of range'; end if;
  if jsonb_typeof(s->'hours') <> 'object' then raise exception 'hours must be an object'; end if;
  foreach d in array array['north','south'] loop
    if jsonb_typeof(s->'hours'->d) <> 'array' then raise exception 'hours.% must be a list of windows', d; end if;
    n := jsonb_array_length(s->'hours'->d);
    if n < 1 or n > 6 then raise exception 'hours.%: 1 to 6 windows', d; end if;
    for i in 0 .. n-1 loop
      w := s->'hours'->d->i;
      if jsonb_typeof(w) <> 'array' or jsonb_array_length(w) not in (2, 3) then
        raise exception 'hours.% window % must be [start,end] or [start,end,minutes]', d, i+1;
      end if;
      foreach t in array array[w->>0, w->>1] loop
        if t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
          raise exception 'hours.% window %: times must be HH:MM (24h)', d, i+1;
        end if;
      end loop;
      if (w->>0) >= (w->>1) then
        raise exception 'hours.% window %: start must be before end', d, i+1;
      end if;
      if jsonb_array_length(w) = 3 then
        if jsonb_typeof(w->2) <> 'number' then
          raise exception 'hours.% window %: the interval must be a number of minutes', d, i+1;
        end if;
        if (w->>2)::numeric not between 1 and 720 then
          raise exception 'hours.% window %: interval out of range', d, i+1;
        end if;
      end if;
    end loop;
  end loop;
end;
$$;
