-- delete_my_account(): only the caller, only once their files are gone.
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.test');
insert into public.designs (id, user_id, title, document, client_updated_at)
values
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'A',
   '{"schemaVersion":1}', now()),
  (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', 'B',
   '{"schemaVersion":1}', now());
insert into storage.objects (bucket_id, name) values
  ('design-assets', 'aaaaaaaa-0000-0000-0000-000000000001/a.png'),
  ('design-assets', 'bbbbbbbb-0000-0000-0000-000000000002/b.png');

set role anon;
do $$ begin
  perform public.delete_my_account();
  raise exception 'FAIL: anon could delete an account';
exception when insufficient_privilege then
  raise notice 'PASS: anon cannot call delete_my_account';
end $$;
reset role;

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
do $$ begin
  perform public.delete_my_account();
  raise exception 'FAIL: deleted an account that still has files';
exception when sqlstate 'P0001' then
  raise notice 'PASS: refuses while the user still has files';
end $$;

-- RLS: A's delete of B's file is silently filtered; A's own goes.
delete from storage.objects;
reset role;
select pg_temp.assert(
  (select count(*) from storage.objects) = 1
    and exists (select 1 from storage.objects where name like 'bbbbbbbb%'),
  'users can delete only their own files'
);

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.delete_my_account();
reset role;
select pg_temp.assert(
  not exists (select 1 from auth.users where email = 'a@example.test')
    and not exists (
      select 1 from public.designs
      where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    ),
  'deletes the caller and cascades to their designs'
);
select pg_temp.assert(
  exists (select 1 from auth.users where email = 'b@example.test')
    and (select count(*) from public.designs) = 1,
  'leaves other users untouched'
);

select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
do $$ begin
  perform public.delete_my_account();
  raise exception 'FAIL: call without a session succeeded';
exception when insufficient_privilege then
  raise notice 'PASS: requires a session';
end $$;
reset role;
