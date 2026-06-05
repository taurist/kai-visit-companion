create or replace function public.visit_key_hash(room_key text)
returns text
language sql
immutable
strict
as $$
  select encode(extensions.digest(convert_to(room_key, 'UTF8'), 'sha256'::text), 'hex')
$$;
