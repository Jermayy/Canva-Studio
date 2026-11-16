-- Row-level security and server-owned columns on public.designs, plus the
-- private design-assets bucket. These policies are the whole API's
-- authorisation (ADR 0002), so each rule has a test.
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.test');
insert into public.designs (id, user_id, title, document, client_updated_at)
values ('dddddddd-0000-0000-0000-00000000000b',
        'bbbbbbbb-0000-0000-0000-000000000002', 'B secret',
        '{"schemaVersion":1}', now());
insert into storage.objects (bucket_id, name) values
  ('design-assets', 'bbbbbbbb-0000-0000-0000-000000000002/b.png');

set role anon;
do $$ begin
  perform count(*) from public.designs;
  raise exception 'FAIL: anon can read designs';
exception when insufficient_privilege then
  raise notice 'PASS: anon has no access to designs';
end $$;
reset role;

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.assert(
  (select count(*) from public.designs) = 0,
  'a user cannot see another user''s designs'
);

update public.designs set title = 'hijacked'
where id = 'dddddddd-0000-0000-0000-00000000000b';
select pg_temp.assert(
  (select count(*) from storage.objects) = 0,
  'a user cannot see another user''s files'
);

-- Forged ownership is overwritten by the trigger with the caller's id.
insert into public.designs (id, user_id, title, document, client_updated_at)
values ('dddddddd-0000-0000-0000-00000000000a',
        'bbbbbbbb-0000-0000-0000-000000000002', 'A design',
        '{"schemaVersion":1}', now());
reset role;
select pg_temp.assert(
  (select title from public.designs
   where id = 'dddddddd-0000-0000-0000-00000000000b') = 'B secret',
  'a user cannot update another user''s design'
);
select pg_temp.assert(
  (select user_id from public.designs
   where id = 'dddddddd-0000-0000-0000-00000000000a')
    = 'aaaaaaaa-0000-0000-0000-000000000001',
  'inserts are always owned by the caller'
);

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
do $$ begin
  update public.designs set version = 5
  where id = 'dddddddd-0000-0000-0000-00000000000a';
  raise exception 'FAIL: version skipped ahead';
exception when sqlstate '40001' then
  raise notice 'PASS: version must increase by exactly 1';
end $$;
update public.designs set version = 2, title = 'A v2'
where id = 'dddddddd-0000-0000-0000-00000000000a';
do $$ begin
  delete from public.designs;
  raise exception 'FAIL: hard delete allowed';
exception when insufficient_privilege then
  raise notice 'PASS: clients cannot hard-delete (tombstones only)';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values
    ('design-assets', 'bbbbbbbb-0000-0000-0000-000000000002/planted.png');
  raise exception 'FAIL: wrote into another user''s folder';
exception when insufficient_privilege then
  raise notice 'PASS: cannot upload into another user''s folder';
end $$;
reset role;
select pg_temp.assert(
  (select version from public.designs
   where id = 'dddddddd-0000-0000-0000-00000000000a') = 2,
  'an in-order version bump is accepted'
);
