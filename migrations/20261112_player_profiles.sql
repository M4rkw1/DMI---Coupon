begin;
create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  department text not null default '' check (length(department) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.player_profiles enable row level security;
-- Access goes through verified server routes. Players cannot update via REST.
revoke all on public.player_profiles from anon, authenticated;
grant all on public.player_profiles to service_role;
notify pgrst, 'reload schema';
commit;
