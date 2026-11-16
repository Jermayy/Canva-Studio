-- Self-service account deletion (README: Data and privacy).
--
-- Flow (src/modules/account/deleteAccount.ts):
--   1. The client deletes the user's files through the Storage API
--      (storage objects can't be deleted with SQL on Supabase).
--   2. The client calls delete_my_account(), which refuses while any of
--      the user's files remain, then deletes the auth user. Designs (and
--      anything else keyed to auth.users) go with it via on delete cascade.
--
-- Backward compatible: adds a policy and a function only.
-- Rollback: supabase/rollback/20261116010000_account_deletion_down.sql

-- Users may delete objects in their own folder of the assets bucket.
create policy design_assets_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'design-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create function public.delete_my_account()
returns void
language plpgsql
-- Runs as the owner so it can delete from auth.users; it only ever
-- touches the caller's own row (auth.uid()).
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Every bucket stores user files under "<user id>/...". Refusing here
  -- guarantees no orphaned personal files outlive the account.
  if exists (
    select 1
    from storage.objects
    where (storage.foldername(name))[1] = caller::text
  ) then
    raise exception 'delete your files before deleting the account'
      using errcode = 'P0001', hint = 'storage_not_empty';
  end if;

  delete from auth.users where id = caller;
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the calling user and (by cascade) their data. Requires their storage files to be deleted first.';

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
