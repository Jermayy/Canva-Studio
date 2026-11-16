-- Reverts 20261116010000_account_deletion.sql. Safe: removes the ability
-- to self-delete; no data is touched.
revoke execute on function public.delete_my_account() from authenticated;
drop function if exists public.delete_my_account();
drop policy if exists design_assets_delete_own on storage.objects;
