create extension if not exists pgcrypto;

create table if not exists public.visit_documents (
  room_id text primary key,
  key_hash text not null,
  document jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.visit_documents enable row level security;

revoke all on public.visit_documents from anon;
revoke all on public.visit_documents from authenticated;

create or replace function public.visit_key_hash(room_key text)
returns text
language sql
immutable
strict
as $$
  select encode(extensions.digest(convert_to(room_key, 'UTF8'), 'sha256'::text), 'hex')
$$;

create or replace function public.visit_get(
  p_room_id text,
  p_room_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found_document public.visit_documents;
begin
  select *
  into found_document
  from public.visit_documents
  where room_id = p_room_id
    and key_hash = public.visit_key_hash(p_room_key);

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'document', found_document.document,
    'updated_at', found_document.updated_at
  );
end;
$$;

create or replace function public.visit_upsert(
  p_room_id text,
  p_room_key text,
  p_document jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_hash text;
  saved_document public.visit_documents;
begin
  select key_hash
  into existing_hash
  from public.visit_documents
  where room_id = p_room_id;

  if existing_hash is not null and existing_hash <> public.visit_key_hash(p_room_key) then
    raise exception 'Invalid room key';
  end if;

  insert into public.visit_documents (room_id, key_hash, document, updated_at)
  values (p_room_id, public.visit_key_hash(p_room_key), p_document, now())
  on conflict (room_id)
  do update set
    document = excluded.document,
    updated_at = now()
  returning *
  into saved_document;

  return jsonb_build_object(
    'document', saved_document.document,
    'updated_at', saved_document.updated_at
  );
end;
$$;

grant execute on function public.visit_get(text, text) to anon;
grant execute on function public.visit_upsert(text, text, jsonb) to anon;
