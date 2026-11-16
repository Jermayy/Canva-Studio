-- Reverses 20261110000000_create_designs.sql.
-- DESTRUCTIVE: drops every user's cloud designs and uploaded images.
-- Local copies on each device are unaffected. Take a backup first.

drop policy if exists design_assets_insert_own on storage.objects;
drop policy if exists design_assets_select_own on storage.objects;
-- Empty the bucket in the dashboard (or via the Storage API) before this,
-- because storage.objects rows cannot be deleted with SQL.
delete from storage.buckets where id = 'design-assets';

alter publication supabase_realtime drop table public.designs;
drop table if exists public.designs;
drop function if exists public.designs_before_write();
