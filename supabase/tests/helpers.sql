-- Shared helpers for SQL tests. Loaded after migrations.

-- Act as a signed-in user (role + JWT subject), like PostgREST does.
create function pg_temp.login(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', user_id::text, false);
  set role authenticated;
$$;

create function pg_temp.assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'FAIL: %', message;
  end if;
  raise notice 'PASS: %', message;
end;
$$;
