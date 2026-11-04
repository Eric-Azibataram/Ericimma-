-- Run this ONCE in Supabase: open your project > SQL Editor > New query > paste this > Run.
-- It creates the table where your site saves its bookings, lessons, orders and settings.
create table if not exists public.site_data (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Lock the table: no public access at all. Only your website server (using the secret key) can read or write it.
alter table public.site_data enable row level security;
