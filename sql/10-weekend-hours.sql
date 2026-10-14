-- ============================================================
--  PATCH: Saturdays and Sundays may have their own hours
--
--  The October 2026 poster gives weekdays one set of departure
--  windows and Saturday and Sunday a narrower one ("limited bus
--  operating on these days"). Until now the settings held one set
--  for every day, so a Saturday page said "departing" at 3:30 when
--  the first weekend bus leaves at 4:00.
--
--  hours may now carry an optional "weekend" object of the same
--  shape as the weekday pair:
--
--    "hours": { "north": [...], "south": [...],
--               "weekend": { "north": [...], "south": [...] } }
--
--  Absent means the weekday windows apply every day, which is every
--  settings object stored before this, so nothing has to migrate
--  and a tracker page that predates this ignores the key. Present,
--  it is held to exactly the rules of the weekday pair: both
--  directions, 1 to 6 windows each, HH:MM, start before end, an
--  optional interval of 1 to 720 minutes as a third field.
--
--  Apply after 09-window-headway.sql. Safe to re-run.
-- ============================================================

create or replace function public._check_settings(s jsonb)
returns void language plpgsql immutable
as $$
declare d text; w jsonb; t text; i int; n int; k int; hs jsonb; lbl text;
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
  if (s->'hours') ? 'weekend' and jsonb_typeof(s->'hours'->'weekend') <> 'object' then
    raise exception 'hours.weekend must be an object';
  end if;
  -- k = 1 is the weekday pair, k = 2 the weekend one when present
  for k in 1..2 loop
    if k = 1 then hs := s->'hours'; else hs := s->'hours'->'weekend'; end if;
    if hs is null then continue; end if;
    foreach d in array array['north','south'] loop
      lbl := case when k = 1 then 'hours.' else 'hours.weekend.' end || d;
      -- "is null" first: jsonb_typeof of a missing key is NULL, which no
      -- comparison turns into true, and the loop below would then crash on
      -- a null bound instead of naming the missing direction.
      if hs->d is null or jsonb_typeof(hs->d) <> 'array' then raise exception '% must be a list of windows', lbl; end if;
      n := jsonb_array_length(hs->d);
      if n < 1 or n > 6 then raise exception '%: 1 to 6 windows', lbl; end if;
      for i in 0 .. n-1 loop
        w := hs->d->i;
        if jsonb_typeof(w) <> 'array' or jsonb_array_length(w) not in (2, 3) then
          raise exception '% window % must be [start,end] or [start,end,minutes]', lbl, i+1;
        end if;
        foreach t in array array[w->>0, w->>1] loop
          if t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
            raise exception '% window %: times must be HH:MM (24h)', lbl, i+1;
          end if;
        end loop;
        if (w->>0) >= (w->>1) then
          raise exception '% window %: start must be before end', lbl, i+1;
        end if;
        if jsonb_array_length(w) = 3 then
          if jsonb_typeof(w->2) <> 'number' then
            raise exception '% window %: the interval must be a number of minutes', lbl, i+1;
          end if;
          if (w->>2)::numeric not between 1 and 720 then
            raise exception '% window %: interval out of range', lbl, i+1;
          end if;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;
