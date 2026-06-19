alter table coupon_settings
  add column if not exists auto_live_scores boolean default false;

alter table coupon_settings
  add column if not exists last_live_sync_at timestamptz;

notify pgrst, 'reload schema';
