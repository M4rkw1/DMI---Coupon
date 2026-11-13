begin;
-- Nullable for profiles created before this update. New profiles require a phone
-- through the API; only admins may correct an existing profile.
alter table public.player_profiles
  add column if not exists phone text
  check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
notify pgrst, 'reload schema';
commit;
