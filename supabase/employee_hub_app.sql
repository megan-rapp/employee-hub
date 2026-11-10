-- Employee Hub application data migration.
-- Run after time_tracking_schema.sql in the Supabase SQL Editor.

alter table public.employees
  add column if not exists phone text not null default '',
  add column if not exists address text not null default '',
  add column if not exists probation_end date,
  add column if not exists next_review date,
  add column if not exists last_raise date,
  add column if not exists benefits text[] not null default '{}',
  add column if not exists notes jsonb not null default '[]'::jsonb,
  add column if not exists photo_data_url text,
  add constraint employees_notes_is_array
    check (jsonb_typeof(notes) = 'array'),
  add constraint employees_photo_size_limit
    check (photo_data_url is null or length(photo_data_url) <= 2800000);

create table if not exists public.practice_app_settings (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  notification_email text not null default '',
  logo_data_url text not null default '',
  benefits text[] not null default array['401(k)', 'Health insurance', 'Aflac'],
  background_search_provider text not null default 'none'
    check (background_search_provider in ('none', 'checkr', 'goodhire', 'local-court')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(logo_data_url) <= 1400000)
);

alter table public.practice_app_settings enable row level security;

drop policy if exists "Members can read app settings" on public.practice_app_settings;
create policy "Members can read app settings"
  on public.practice_app_settings for select to authenticated
  using (public.has_practice_role(practice_id, array['owner', 'manager', 'employee']));

drop policy if exists "Owners and managers can create app settings" on public.practice_app_settings;
create policy "Owners and managers can create app settings"
  on public.practice_app_settings for insert to authenticated
  with check (public.has_practice_role(practice_id, array['owner', 'manager']));

drop policy if exists "Owners and managers can update app settings" on public.practice_app_settings;
create policy "Owners and managers can update app settings"
  on public.practice_app_settings for update to authenticated
  using (public.has_practice_role(practice_id, array['owner', 'manager']))
  with check (public.has_practice_role(practice_id, array['owner', 'manager']));

drop trigger if exists practice_app_settings_set_updated_at on public.practice_app_settings;
create trigger practice_app_settings_set_updated_at
  before update on public.practice_app_settings
  for each row execute function public.set_updated_at();

-- Add an owner membership only after creating the account in Supabase Auth.
-- Use the account UUID from Authentication > Users, and a new practice UUID:
--
-- insert into public.practices (id, name, time_zone)
-- values ('<practice-uuid>', 'Your Practice', 'America/Los_Angeles');
--
-- insert into public.practice_memberships (practice_id, user_id, role)
-- values ('<practice-uuid>', '<auth-user-uuid>', 'owner');
--
-- insert into public.practice_locations (practice_id, name)
-- values ('<practice-uuid>', 'Main office');
