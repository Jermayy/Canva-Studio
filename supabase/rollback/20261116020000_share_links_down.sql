-- Reverts 20261116020000_share_links.sql.
-- DESTRUCTIVE: every share link stops working. Designs are untouched.
-- Empty the design-shares bucket (Storage API or dashboard) first, because
-- storage.objects rows can't be deleted with SQL.

-- Restore the previous delete_my_account() (user folders only).
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
    select 1 from storage.objects
    where (storage.foldername(name))[1] = caller::text
  ) then
    raise exception 'delete your files before deleting the account'
      using errcode = 'P0001', hint = 'storage_not_empty';
  end if;
  delete from auth.users where id = caller;
end;
$$;

drop policy if exists design_shares_objects_delete_own on storage.objects;
drop policy if exists design_shares_objects_update_own on storage.objects;
drop policy if exists design_shares_objects_insert_own on storage.objects;
drop policy if exists design_shares_objects_select_own on storage.objects;
delete from storage.buckets where id = 'design-shares';

drop function if exists public.get_shared_design(uuid);
drop table if exists public.design_shares;
drop function if exists public.design_shares_before_write();
