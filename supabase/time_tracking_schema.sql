-- Employee Hub time-tracking foundation for Supabase.
-- This creates storage and access controls only; it does not connect to TDO12
-- or generate time records from activity. TDO integration must run server-side.

create table if not exists public.practices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  time_zone text not null default 'America/Los_Angeles',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.practice_memberships (
  practice_id uuid not null references public.practices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'employee')),
  created_at timestamptz not null default now(),
  primary key (practice_id, user_id)
);

create table if not exists public.practice_locations (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (practice_id, id),
  unique (practice_id, name)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  location_id uuid,
  auth_user_id uuid references auth.users(id) on delete set null,
  tdo_account_id text,
  tdo_user_id text,
  first_name text not null,
  last_name text not null,
  job_title text not null,
  employment_type text not null check (employment_type in ('FT', 'PT')),
  email text,
  status text not null default 'active'
    check (status in ('active', 'on_probation', 'inactive')),
  hired_on date,
  terminated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (practice_id, location_id)
    references public.practice_locations(practice_id, id),
  unique (practice_id, id),
  unique (practice_id, auth_user_id),
  unique (practice_id, tdo_account_id, tdo_user_id)
);

create table if not exists public.time_tracking_preferences (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  inactivity_prompt_minutes integer not null default 15
    check (inactivity_prompt_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Store only the minimum activity metadata needed for draft calculations.
-- Do not store raw TDO payloads, credentials, or unrelated audit events here.
create table if not exists public.tdo_activity_events (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  employee_id uuid not null,
  provider_event_id text,
  event_type text not null check (event_type in ('sign_in', 'sign_out', 'activity')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  foreign key (practice_id, employee_id)
    references public.employees(practice_id, id) on delete cascade,
  unique (practice_id, employee_id, provider_event_id)
);

create index if not exists tdo_activity_events_employee_time_idx
  on public.tdo_activity_events (practice_id, employee_id, occurred_at desc);

create table if not exists public.time_tracking_days (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  employee_id uuid not null,
  work_date date not null,
  time_zone text not null,
  previous_day_last_activity_at timestamptz,
  first_sign_in_at timestamptz,
  last_activity_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'employee_review', 'manager_review', 'approved', 'disputed')),
  employee_reviewed_by uuid references auth.users(id) on delete set null,
  employee_reviewed_at timestamptz,
  manager_reviewed_by uuid references auth.users(id) on delete set null,
  manager_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (practice_id, employee_id)
    references public.employees(practice_id, id) on delete cascade,
  unique (employee_id, work_date),
  unique (practice_id, id)
);

create table if not exists public.time_tracking_gaps (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  time_tracking_day_id uuid not null,
  gap_started_at timestamptz not null,
  gap_ended_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  response text not null default 'pending'
    check (response in ('pending', 'break_confirmed', 'no_break', 'needs_correction')),
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (practice_id, time_tracking_day_id)
    references public.time_tracking_days(practice_id, id) on delete cascade,
  unique (practice_id, time_tracking_day_id, id),
  check (gap_ended_at > gap_started_at)
);

create table if not exists public.time_tracking_segments (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  time_tracking_day_id uuid not null,
  segment_type text not null check (segment_type in ('work', 'break')),
  started_at timestamptz not null,
  ended_at timestamptz,
  source text not null
    check (source in ('activity_estimate', 'employee_confirmed', 'manual')),
  confirmed_gap_id uuid,
  created_at timestamptz not null default now(),
  foreign key (practice_id, time_tracking_day_id)
    references public.time_tracking_days(practice_id, id) on delete cascade,
  foreign key (practice_id, time_tracking_day_id, confirmed_gap_id)
    references public.time_tracking_gaps(practice_id, time_tracking_day_id, id),
  check (ended_at is null or ended_at > started_at),
  check (
    (segment_type = 'break' and confirmed_gap_id is not null and ended_at is not null)
    or (segment_type = 'work' and confirmed_gap_id is null)
  )
);

create or replace function public.require_confirmed_break_gap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  selected_gap public.time_tracking_gaps%rowtype;
begin
  if new.segment_type = 'break' then
    select *
    into selected_gap
    from public.time_tracking_gaps
    where id = new.confirmed_gap_id
      and practice_id = new.practice_id
      and time_tracking_day_id = new.time_tracking_day_id;

    if not found or selected_gap.response <> 'break_confirmed' then
      raise exception 'A break segment requires a confirmed activity gap';
    end if;

    if new.started_at < selected_gap.gap_started_at
      or new.ended_at > selected_gap.gap_ended_at then
      raise exception 'A break segment must fall within its confirmed activity gap';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.require_confirmed_break_gap() from public;

drop trigger if exists time_tracking_segments_require_confirmed_gap on public.time_tracking_segments;
create trigger time_tracking_segments_require_confirmed_gap
  before insert or update on public.time_tracking_segments
  for each row execute function public.require_confirmed_break_gap();

create table if not exists public.time_tracking_audit_events (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  time_tracking_day_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (practice_id, time_tracking_day_id)
    references public.time_tracking_days(practice_id, id) on delete cascade
);

create index if not exists time_tracking_days_employee_date_idx
  on public.time_tracking_days (practice_id, employee_id, work_date desc);

create index if not exists time_tracking_gaps_day_idx
  on public.time_tracking_gaps (practice_id, time_tracking_day_id);

create index if not exists time_tracking_segments_day_idx
  on public.time_tracking_segments (practice_id, time_tracking_day_id, started_at);

create index if not exists time_tracking_audit_events_day_idx
  on public.time_tracking_audit_events (practice_id, time_tracking_day_id, created_at desc);

create or replace function public.prevent_unconfirming_used_break()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.response = 'break_confirmed'
    and new.response <> 'break_confirmed'
    and exists (
      select 1
      from public.time_tracking_segments segment
      where segment.confirmed_gap_id = old.id
        and segment.segment_type = 'break'
    ) then
    raise exception 'Remove or revise linked break segments before changing the gap confirmation';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_unconfirming_used_break() from public;

drop trigger if exists time_tracking_gaps_prevent_unconfirming_used_break on public.time_tracking_gaps;
create trigger time_tracking_gaps_prevent_unconfirming_used_break
  before update on public.time_tracking_gaps
  for each row execute function public.prevent_unconfirming_used_break();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

drop trigger if exists practices_set_updated_at on public.practices;
create trigger practices_set_updated_at
  before update on public.practices
  for each row execute function public.set_updated_at();

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

drop trigger if exists time_tracking_days_set_updated_at on public.time_tracking_days;
create trigger time_tracking_days_set_updated_at
  before update on public.time_tracking_days
  for each row execute function public.set_updated_at();

drop trigger if exists time_tracking_preferences_set_updated_at on public.time_tracking_preferences;
create trigger time_tracking_preferences_set_updated_at
  before update on public.time_tracking_preferences
  for each row execute function public.set_updated_at();

create or replace function public.has_practice_role(
  target_practice_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.practice_memberships membership
    where membership.practice_id = target_practice_id
      and membership.user_id = auth.uid()
      and membership.role = any (allowed_roles)
  );
$$;

create or replace function public.is_linked_practice_employee(
  target_practice_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees employee
    where employee.practice_id = target_practice_id
      and employee.id = target_employee_id
      and employee.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.has_practice_role(uuid, text[]) from public;
revoke all on function public.is_linked_practice_employee(uuid, uuid) from public;
grant execute on function public.has_practice_role(uuid, text[]) to authenticated;
grant execute on function public.is_linked_practice_employee(uuid, uuid) to authenticated;

alter table public.practices enable row level security;
alter table public.practice_memberships enable row level security;
alter table public.practice_locations enable row level security;
alter table public.employees enable row level security;
alter table public.time_tracking_preferences enable row level security;
alter table public.tdo_activity_events enable row level security;
alter table public.time_tracking_days enable row level security;
alter table public.time_tracking_gaps enable row level security;
alter table public.time_tracking_segments enable row level security;
alter table public.time_tracking_audit_events enable row level security;

drop policy if exists "Members can read their practice" on public.practices;
create policy "Members can read their practice"
  on public.practices for select to authenticated
  using (public.has_practice_role(id, array['owner', 'manager', 'employee']));

drop policy if exists "Owners and managers can update their practice" on public.practices;
create policy "Owners and managers can update their practice"
  on public.practices for update to authenticated
  using (public.has_practice_role(id, array['owner', 'manager']))
  with check (public.has_practice_role(id, array['owner', 'manager']));

drop policy if exists "Members can read practice memberships" on public.practice_memberships;
create policy "Members can read practice memberships"
  on public.practice_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_practice_role(practice_id, array['owner', 'manager'])
  );

drop policy if exists "Members can read practice locations" on public.practice_locations;
create policy "Members can read practice locations"
  on public.practice_locations for select to authenticated
  using (public.has_practice_role(practice_id, array['owner', 'manager', 'employee']));

drop policy if exists "Owners and managers can manage practice locations" on public.practice_locations;
create policy "Owners and managers can manage practice locations"
  on public.practice_locations for all to authenticated
  using (public.has_practice_role(practice_id, array['owner', 'manager']))
  with check (public.has_practice_role(practice_id, array['owner', 'manager']));

drop policy if exists "Managers and linked employees can read employee profiles" on public.employees;
create policy "Managers and linked employees can read employee profiles"
  on public.employees for select to authenticated
  using (
    public.has_practice_role(practice_id, array['owner', 'manager'])
    or auth_user_id = auth.uid()
  );

drop policy if exists "Owners and managers can manage employee profiles" on public.employees;
create policy "Owners and managers can manage employee profiles"
  on public.employees for all to authenticated
  using (public.has_practice_role(practice_id, array['owner', 'manager']))
  with check (public.has_practice_role(practice_id, array['owner', 'manager']));

drop policy if exists "Managers can read time tracking preferences" on public.time_tracking_preferences;
create policy "Managers can read time tracking preferences"
  on public.time_tracking_preferences for select to authenticated
  using (public.has_practice_role(practice_id, array['owner', 'manager']));

drop policy if exists "Managers can manage time tracking preferences" on public.time_tracking_preferences;
create policy "Managers can manage time tracking preferences"
  on public.time_tracking_preferences for all to authenticated
  using (public.has_practice_role(practice_id, array['owner', 'manager']))
  with check (public.has_practice_role(practice_id, array['owner', 'manager']));

drop policy if exists "Managers can read TDO activity metadata" on public.tdo_activity_events;
create policy "Managers can read TDO activity metadata"
  on public.tdo_activity_events for select to authenticated
  using (public.has_practice_role(practice_id, array['owner', 'manager']));

drop policy if exists "Managers and linked employees can read draft days" on public.time_tracking_days;
create policy "Managers and linked employees can read draft days"
  on public.time_tracking_days for select to authenticated
  using (
    public.has_practice_role(practice_id, array['owner', 'manager'])
    or public.is_linked_practice_employee(practice_id, employee_id)
  );

drop policy if exists "Managers and linked employees can read activity gaps" on public.time_tracking_gaps;
create policy "Managers and linked employees can read activity gaps"
  on public.time_tracking_gaps for select to authenticated
  using (
    public.has_practice_role(practice_id, array['owner', 'manager'])
    or exists (
      select 1
      from public.time_tracking_days tracking_day
      where tracking_day.id = time_tracking_day_id
        and tracking_day.practice_id = time_tracking_gaps.practice_id
        and public.is_linked_practice_employee(
          tracking_day.practice_id,
          tracking_day.employee_id
        )
    )
  );

drop policy if exists "Managers and linked employees can read time segments" on public.time_tracking_segments;
create policy "Managers and linked employees can read time segments"
  on public.time_tracking_segments for select to authenticated
  using (
    public.has_practice_role(practice_id, array['owner', 'manager'])
    or exists (
      select 1
      from public.time_tracking_days tracking_day
      where tracking_day.id = time_tracking_day_id
        and tracking_day.practice_id = time_tracking_segments.practice_id
        and public.is_linked_practice_employee(
          tracking_day.practice_id,
          tracking_day.employee_id
        )
    )
  );

drop policy if exists "Managers can read time tracking audit events" on public.time_tracking_audit_events;
create policy "Managers can read time tracking audit events"
  on public.time_tracking_audit_events for select to authenticated
  using (public.has_practice_role(practice_id, array['owner', 'manager']));

-- No client write policies are granted for TDO event ingestion, time drafts,
-- gap responses, segments, or audit events. Use trusted server-side code with
-- the Supabase service role, or narrowly scoped RPCs after implementing and
-- reviewing the TDO12 integration. Never expose the service-role key in a browser.
--
-- To associate an employee with a Supabase login, set employees.auth_user_id.
-- To associate them with TDO, populate tdo_account_id and tdo_user_id only
-- after confirming the official identifiers exposed by the authorized TDO API.
-- The 15-minute threshold is a prompt threshold, not an automatic break deduction.
-- Populate time_tracking_segments with a break only after a break is confirmed.
