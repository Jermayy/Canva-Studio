-- Share links: anyone with the link can view a read-only PNG of a design
-- (ADR 0008).
--
-- - design_shares: one row per shared design; its random UUID id is the
--   link token. Owner-only under RLS; anon has no table access.
-- - get_shared_design(id): the only public read path. Exact id lookup (no
--   listing or enumeration); hides shares of deleted designs.
-- - design-shares bucket: public read by URL for "<share id>.png"; only the
--   share's owner may write it; nobody but the owner can list it.
--
-- Backward compatible (new objects only) apart from replacing
-- delete_my_account() so account deletion also covers share images.
-- Rollback: supabase/rollback/20261116020000_share_links_down.sql

create table public.design_shares (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null unique
    references public.designs (id) on delete cascade,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  -- Snapshot of the design at share time, shown on the public page.
  title text not null check (char_length(title) between 1 and 120),
  width integer not null check (width between 100 and 8000),
  height integer not null check (height between 100 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.design_shares is
  'Public view links. The id is the unguessable link token; see get_shared_design().';

create index design_shares_user_idx on public.design_shares (user_id);

-- Server-owned columns: owner, token and target can't be forged or moved.
create function public.design_shares_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
    new.created_at := now();
  else
    new.id := old.id;
    new.user_id := old.user_id;
    new.design_id := old.design_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger design_shares_before_write
  before insert or update on public.design_shares
  for each row execute function public.design_shares_before_write();

alter table public.design_shares enable row level security;

revoke all on public.design_shares from anon;
grant select, insert, update, delete on public.design_shares to authenticated;

create policy design_shares_select_own on public.design_shares
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Only for a design the caller owns (designs RLS applies in the subquery).
create policy design_shares_insert_own on public.design_shares
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.designs d where d.id = design_id)
  );

create policy design_shares_update_own on public.design_shares
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy design_shares_delete_own on public.design_shares
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- The public read path: one share by its exact token.
create function public.get_shared_design(share_id uuid)
returns table (
  id uuid,
  title text,
  width integer,
  height integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.width, s.height, s.updated_at
  from public.design_shares s
  join public.designs d on d.id = s.design_id
  where s.id = share_id
    and d.deleted_at is null;
$$;

revoke all on function public.get_shared_design(uuid) from public;
grant execute on function public.get_shared_design(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Share images: public bucket, objects named "<share id>.png".
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-shares', 'design-shares', true, 15728640, array['image/png'])
on conflict (id) do nothing;

-- Upsert needs select + insert + update. Select is owner-only, so the
-- bucket can't be listed; public reads go through the object URL.
create policy design_shares_objects_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'design-shares'
    and exists (
      select 1 from public.design_shares s
      where s.user_id = (select auth.uid()) and name = s.id::text || '.png'
    )
  );

create policy design_shares_objects_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'design-shares'
    and exists (
      select 1 from public.design_shares s
      where s.user_id = (select auth.uid()) and name = s.id::text || '.png'
    )
  );

create policy design_shares_objects_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'design-shares'
    and exists (
      select 1 from public.design_shares s
      where s.user_id = (select auth.uid()) and name = s.id::text || '.png'
    )
  );

create policy design_shares_objects_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'design-shares'
    and exists (
      select 1 from public.design_shares s
      where s.user_id = (select auth.uid()) and name = s.id::text || '.png'
    )
  );

-- ---------------------------------------------------------------------------
-- Account deletion must also wait for share images to be deleted, because
-- they aren't under a "<user id>/" folder.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if exists (
    select 1
    from storage.objects o
    where (storage.foldername(o.name))[1] = caller::text
       or (
         o.bucket_id = 'design-shares'
         and exists (
           select 1 from public.design_shares s
           where s.user_id = caller and o.name = s.id::text || '.png'
         )
       )
  ) then
    raise exception 'delete your files before deleting the account'
      using errcode = 'P0001', hint = 'storage_not_empty';
  end if;

  delete from auth.users where id = caller;
end;
$$;
