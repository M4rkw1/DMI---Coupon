create extension if not exists pgcrypto;

create table if not exists coupon_weeks (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'DMI Coupon',
  subtitle text default '',
  is_current boolean not null default false,
  is_published boolean not null default true,
  calendar_year int,
  calendar_week int,
  special_name text default '',
  created_at timestamptz default now()
);

alter table coupon_weeks add column if not exists is_published boolean not null default true;
alter table coupon_weeks add column if not exists calendar_year int;
alter table coupon_weeks add column if not exists calendar_week int;
alter table coupon_weeks add column if not exists special_name text default '';

create index if not exists coupon_weeks_calendar_idx
  on coupon_weeks(calendar_year, calendar_week);

create table if not exists coupon_settings (
  id uuid primary key default gen_random_uuid(),
  week_id uuid references coupon_weeks(id) on delete cascade,
  currency text default 'GBP',
  entry_fee numeric default 10,
  rules text default 'Entry Fee: £10 / €10 / $10 / N$200 per sheet.

1. Payment is preferred via Bank Transfer or Revolut.
2. Submit your predicted scores. One point is awarded for a correct result, and three points are awarded for a correct score.
3. In the event of a tie, the prize pool will be divided equally among the winners.
4. Abandoned or postponed matches will be voided and will not count toward your final score.
5. For cup matches, the score at the end of normal time (90 minutes plus stoppage time) will be used. Extra time will not be considered.
6. The winner takes all. The entire prize pool consists of the total entry fees collected.
7. If you are submitting an “Old School” entry, please hand in your completed sheet and entry fee to the Tech Office before the stated deadline. Alternatively, you can submit a photo of your sheet via email or WhatsApp.',
  entries_released boolean default false,
  auto_live_scores boolean default false,
  last_live_sync_at timestamptz,
  timezone_label text default 'UK time only',
  timezone_offset_minutes int default 0,
  whatsapp_qr_url text default '',
  payment_qr_url text default ''
);

alter table coupon_settings add column if not exists timezone_label text default 'UK time only';
alter table coupon_settings add column if not exists timezone_offset_minutes int default 0;
alter table coupon_settings add column if not exists auto_live_scores boolean default false;
alter table coupon_settings add column if not exists last_live_sync_at timestamptz;

create table if not exists fixtures (
  id uuid primary key default gen_random_uuid(),
  week_id uuid references coupon_weeks(id) on delete cascade,
  sort_order int default 0,
  home_team text not null,
  away_team text not null,
  home_badge text,
  away_badge text,
  kickoff text default '',
  api_fixture_id text,
  ht_home_score int,
  ht_away_score int,
  home_score int,
  away_score int,
  status text default 'NS'
);

alter table fixtures add column if not exists api_fixture_id text;
alter table fixtures add column if not exists home_badge text;
alter table fixtures add column if not exists away_badge text;
alter table fixtures add column if not exists ht_home_score int;
alter table fixtures add column if not exists ht_away_score int;

create table if not exists team_badges (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  team_name text not null,
  badge_url text not null,
  source text default '',
  competition text default '',
  country text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table team_badges add column if not exists normalized_name text;
alter table team_badges add column if not exists team_name text;
alter table team_badges add column if not exists badge_url text;
alter table team_badges add column if not exists source text default '';
alter table team_badges add column if not exists competition text default '';
alter table team_badges add column if not exists country text default '';
alter table team_badges add column if not exists updated_at timestamptz default now();

create unique index if not exists team_badges_normalized_name_idx
  on team_badges(normalized_name);

create table if not exists country_badges (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  country_name text not null,
  badge_url text not null,
  source text default '',
  competition text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table country_badges add column if not exists normalized_name text;
alter table country_badges add column if not exists country_name text;
alter table country_badges add column if not exists badge_url text;
alter table country_badges add column if not exists source text default '';
alter table country_badges add column if not exists competition text default '';
alter table country_badges add column if not exists updated_at timestamptz default now();

create unique index if not exists country_badges_normalized_name_idx
  on country_badges(normalized_name);

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

create table if not exists coupon_archives (
  id uuid primary key default gen_random_uuid(),
  week_id uuid,
  week_title text default '',
  week_subtitle text default '',
  saved_as_historic boolean default false,
  winner_name text default '',
  winner_department text default '',
  winner_points int default 0,
  leaderboard jsonb not null default '[]',
  snapshot jsonb not null default '{}',
  created_at timestamptz default now()
);

insert into coupon_weeks(title, subtitle, is_current)
select 'DMI Coupon – Next Coupon', 'Weekend trial', true
where not exists (select 1 from coupon_weeks where is_current = true);

insert into coupon_settings(week_id)
select id from coupon_weeks where is_current = true
and not exists (select 1 from coupon_settings where week_id = coupon_weeks.id);
