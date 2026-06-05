create or replace function public.visit_key_hash(room_key text)
returns text
language sql
immutable
strict
as $$
  select encode(digest(convert_to(room_key, 'UTF8'), 'sha256'), 'hex')
$$;
