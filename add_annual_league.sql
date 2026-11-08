-- Run once in the Supabase SQL Editor. No public access to league storage.
create table if not exists public.annual_league_seasons (
 year integer primary key check (year = 2027),
 revision integer not null default 0,
 data jsonb not null default '{"released":false,"members":[],"weeks":{},"audit":[]}'::jsonb
);
alter table public.annual_league_seasons enable row level security;
revoke all on public.annual_league_seasons from anon, authenticated;
grant select, insert, update on public.annual_league_seasons to service_role;
insert into public.annual_league_seasons(year) values(2027) on conflict do nothing;
notify pgrst, 'reload schema';
