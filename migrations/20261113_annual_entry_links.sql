-- Private account links survive coupon archiving/deletion. Never expose them in snapshots.
create table if not exists public.player_entry_links (
  entry_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists player_entry_links_user_idx on public.player_entry_links(user_id);
alter table public.player_entry_links enable row level security;
revoke all on public.player_entry_links from public, anon, authenticated;
grant select, insert on public.player_entry_links to service_role;

-- The entry and its private account link are committed together or neither is saved.
create or replace function public.submit_player_entry(
  p_user_id uuid, p_week_id uuid, p_predictions jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare saved_profile public.player_profiles%rowtype; saved_entry public.entries%rowtype;
begin
  select * into strict saved_profile from public.player_profiles where user_id=p_user_id;
  insert into public.entries(week_id,name,department,predictions,paid,payment_method)
    values(p_week_id,saved_profile.name,saved_profile.department,p_predictions,false,'')
    returning * into saved_entry;
  insert into public.player_entry_links(entry_id,user_id) values(saved_entry.id,p_user_id);
  return to_jsonb(saved_entry);
end;
$$;
revoke all on function public.submit_player_entry(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.submit_player_entry(uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
