-- ============================================================
--  PATCH: rotating to the key you already have is not a rotation
--
--  admin_rotate_share_key checked that the new key was not in use
--  by ANOTHER route, but never that it differed from this route's
--  own current key. Rotating to the same value set prev_key to
--  that value too, so the key the admin believed they had just
--  retired went on starting new sessions for the next 4 hours,
--  through the grace path.
--
--  Nobody would do this deliberately. It happens by pasting the
--  current key back in, which is exactly what someone does when
--  they are unsure whether the last rotation went through.
--
--  Safe to run more than once.
-- ============================================================

begin;

create or replace function public.admin_rotate_share_key(p_slug text, p_admin text, p_new_key text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare r public.routes;
begin
  r := public._require_admin(p_slug, p_admin);
  if p_new_key is null or p_new_key !~ '^[A-Za-z0-9_\-]{8,64}$' then
    raise exception 'share key must be 8 to 64 letters, digits, - or _';
  end if;
  if p_new_key = r.key then
    raise exception 'that is already the current share key';
  end if;
  if exists (select 1 from public.routes where key = p_new_key and slug <> p_slug) then
    raise exception 'key already in use';
  end if;
  update public.routes
     set prev_key = r.key,
         prev_key_expires = now() + interval '4 hours',
         key = p_new_key
   where slug = p_slug;
end;
$$;

commit;
