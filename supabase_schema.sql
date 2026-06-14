create extension if not exists pgcrypto;

create table if not exists coupon_weeks (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'DMI Coupon',
  subtitle text default '',
  is_current boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists coupon_settings (
  id uuid primary key default gen_random_uuid(),
  week_id uuid references coupon_weeks(id) on delete cascade,
  currency text default 'GBP',
  entry_fee numeric default 10,
  rules text default '1 point for correct result. 3 points for correct score. Highest points wins.',
  entries_released boolean default false,
  whatsapp_qr_url text default '',
  payment_qr_url text default ''
);

create table if not exists fixtures (
  id uuid primary key default gen_random_uuid(),
  week_id uuid references coupon_weeks(id) on delete cascade,
  sort_order int default 0,
  home_team text not null,
  away_team text not null,
  kickoff text default '',
  api_fixture_id text,
  ht_home_score int,
  ht_away_score int,
  home_score int,
  away_score int,
  status text default 'NS'
);

alter table fixtures add column if not exists api_fixture_id text;
alter table fixtures add column if not exists ht_home_score int;
alter table fixtures add column if not exists ht_away_score int;

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  week_id uuid references coupon_weeks(id) on delete cascade,
  name text not null,
  department text default '',
  predictions jsonb not null default '{}',
  paid boolean default false,
  payment_method text default '',
  created_at timestamptz default now()
);

insert into coupon_weeks(title, subtitle, is_current)
select 'DMI Coupon – Next Coupon', 'Weekend trial', true
where not exists (select 1 from coupon_weeks where is_current = true);

insert into coupon_settings(week_id)
select id from coupon_weeks where is_current = true
and not exists (select 1 from coupon_settings where week_id = coupon_weeks.id);
