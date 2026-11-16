-- Canvas Studio: per-user designs with row-level security, realtime and
-- private image storage. See docs/adr/0003-local-first-sync.md.
--
-- Rollback: supabase/rollback/20261110000000_create_designs_down.sql

-- ---------------------------------------------------------------------------
-- Designs
-- ---------------------------------------------------------------------------
create table public.designs (
  id uuid primary key,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null
    check (char_length(title) between 1 and 120),
  -- Validated again by the client (zod) on read; this guards size and shape.
  document jsonb not null
    check (jsonb_typeof(document) = 'object'
           and pg_column_size(document) <= 5000000),
  version integer not null default 1 check (version >= 1),
  -- When the edit happened on the device that made it.
  client_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Server time of the last write; drives the clients' pull cursor.
  updated_at timestamptz not null default now(),
  -- Tombstone: deletions sync to other devices before rows are purged.
  deleted_at timestamptz
);

comment on table public.designs is
  'One row per design. Clients soft-delete via deleted_at so other devices learn about deletions.';

-- Keyset pagination for sync: (updated_at, id) scoped to the user.
create index designs_user_sync_idx
  on public.designs (user_id, updated_at, id);

-- Server-owned columns: clients cannot forge timestamps, ownership or skip
-- versions, whatever they send.
create function public.designs_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
    new.version := 1;
    new.created_at := now();
  else
    if new.version <> old.version + 1 then
      raise exception 'version must increase by exactly 1 (expected %, got %)',
        old.version + 1, new.version
        using errcode = '40001';
    end if;
    new.id := old.id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  -- clock_timestamp() (not now()) tracks commit order more closely; the
  -- client also rewinds its cursor by a few seconds to cover the gap.
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger designs_before_write
  before insert or update on public.designs
  for each row execute function public.designs_before_write();

-- ---------------------------------------------------------------------------
-- Row-level security: every user sees and writes only their own rows.
-- ---------------------------------------------------------------------------
alter table public.designs enable row level security;

revoke all on public.designs from anon;
grant select, insert, update on public.designs to authenticated;

create policy designs_select_own on public.designs
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy designs_insert_own on public.designs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy designs_update_own on public.designs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy on purpose: clients tombstone instead (see deleted_at).

-- Live updates to other open devices (RLS applies to realtime too).
alter publication supabase_realtime add table public.designs;

-- ---------------------------------------------------------------------------
-- Image storage: private bucket, one folder per user, immutable objects
-- named by SHA-256 of their content.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-assets',
  'design-assets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy design_assets_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'design-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy design_assets_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'design-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
