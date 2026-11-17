-- Share links: owner-only management, exact-token public reads, no
-- enumeration, and account deletion covering share images.
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.test');
insert into public.designs (id, user_id, title, document, client_updated_at)
values
  ('dddddddd-0000-0000-0000-00000000000a',
   'aaaaaaaa-0000-0000-0000-000000000001', 'A poster',
   '{"schemaVersion":1}', now()),
  ('dddddddd-0000-0000-0000-00000000000b',
   'bbbbbbbb-0000-0000-0000-000000000002', 'B poster',
   '{"schemaVersion":1}', now());

-- A shares their design; a forged owner is replaced with the caller.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.design_shares (id, design_id, user_id, title, width, height)
values ('5aaaaaaa-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-00000000000a',
        'bbbbbbbb-0000-0000-0000-000000000002', 'A poster', 1080, 1350);
do $$ begin
  insert into public.design_shares (design_id, title, width, height)
  values ('dddddddd-0000-0000-0000-00000000000b', 'stolen', 1080, 1350);
  raise exception 'FAIL: shared another user''s design';
exception when insufficient_privilege then
  raise notice 'PASS: cannot share another user''s design';
end $$;
insert into storage.objects (bucket_id, name)
values ('design-shares', '5aaaaaaa-0000-0000-0000-000000000001.png');
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('design-shares', 'not-my-share.png');
  raise exception 'FAIL: wrote an image for a share I don''t own';
exception when insufficient_privilege then
  raise notice 'PASS: share images can only be written for own shares';
end $$;
reset role;
select pg_temp.assert(
  (select user_id from public.design_shares)
    = 'aaaaaaaa-0000-0000-0000-000000000001',
  'share owner is always the caller'
);

-- Public: exact token works, nothing else does.
set role anon;
select pg_temp.assert(
  (select title from public.get_shared_design(
    '5aaaaaaa-0000-0000-0000-000000000001')) = 'A poster',
  'anyone with the link can read the share'
);
select pg_temp.assert(
  not exists (select 1 from public.get_shared_design(gen_random_uuid())),
  'an unknown token returns nothing'
);
do $$ begin
  perform count(*) from public.design_shares;
  raise exception 'FAIL: anon can list shares';
exception when insufficient_privilege then
  raise notice 'PASS: anon cannot list shares';
end $$;
reset role;

-- Another user can't see, edit or delete A's share.
select pg_temp.login('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.assert(
  (select count(*) from public.design_shares) = 0
    and (select count(*) from storage.objects
         where bucket_id = 'design-shares') = 0,
  'other users cannot see a share or list its image'
);
update public.design_shares set title = 'defaced';
delete from public.design_shares;
delete from storage.objects;
reset role;
select pg_temp.assert(
  (select title from public.design_shares) = 'A poster'
    and (select count(*) from storage.objects) = 1,
  'other users cannot change or delete a share or its image'
);

-- The token and target can't be changed by the owner either.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
update public.design_shares
set id = gen_random_uuid(),
    design_id = 'dddddddd-0000-0000-0000-00000000000b',
    title = 'A poster v2';
reset role;
select pg_temp.assert(
  (select id::text || design_id::text || title from public.design_shares)
    = '5aaaaaaa-0000-0000-0000-000000000001'
      || 'dddddddd-0000-0000-0000-00000000000a' || 'A poster v2',
  'owners can update the snapshot but not the token or target'
);

-- Tombstoning the design kills the link at once.
update public.designs set deleted_at = now(), version = 2
where id = 'dddddddd-0000-0000-0000-00000000000a';
reset role;
set role anon;
select pg_temp.assert(
  not exists (select 1 from public.get_shared_design(
    '5aaaaaaa-0000-0000-0000-000000000001')),
  'links to deleted designs stop working'
);
reset role;

-- Account deletion waits for share images, then removes the share.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
do $$ begin
  perform public.delete_my_account();
  raise exception 'FAIL: deleted account with a share image left';
exception when sqlstate 'P0001' then
  raise notice 'PASS: account deletion waits for share images';
end $$;
delete from storage.objects
where name = '5aaaaaaa-0000-0000-0000-000000000001.png';
select public.delete_my_account();
reset role;
select pg_temp.assert(
  not exists (select 1 from public.design_shares),
  'deleting the account removes its share links'
);
