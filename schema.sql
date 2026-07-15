-- ===========================================================================
-- TeamHub — Supabase 스키마
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run
-- ===========================================================================

-- ---------- 1. 테이블 ----------

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  full_name text not null,
  dept text,
  title text,
  color text,
  role text not null default 'member' check (role in ('admin','member','guest')),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  presence text default 'offline',
  created_at timestamptz default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key text,
  description text,
  color text,
  created_at timestamptz default now()
);

create table if not exists team_members (
  team_id uuid references teams on delete cascade,
  user_id uuid references profiles on delete cascade,
  role text default 'member',
  primary key (team_id, user_id)
);

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams on delete cascade,
  name text not null,
  topic text,
  kind text not null default 'standard' check (kind in ('standard','private','shared')),
  created_at timestamptz default now()
);

create table if not exists channel_members (
  channel_id uuid references channels on delete cascade,
  user_id uuid references profiles on delete cascade,
  primary key (channel_id, user_id)
);

create table if not exists dms (
  id uuid primary key default gen_random_uuid(),
  members uuid[] not null,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels on delete cascade,
  dm_id uuid references dms on delete cascade,
  user_id uuid references profiles on delete cascade not null,
  body text not null,
  importance text default 'normal' check (importance in ('normal','important','urgent')),
  reactions jsonb default '{}'::jsonb,
  file jsonb,
  poll jsonb,
  edited_at timestamptz,
  created_at timestamptz default now(),
  check (channel_id is not null or dm_id is not null)
);
create index if not exists messages_channel_idx on messages (channel_id, created_at);
create index if not exists messages_dm_idx on messages (dm_id, created_at);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels on delete cascade not null,
  name text not null,
  path text,
  size bigint,
  version int default 1,
  user_id uuid references profiles on delete set null,
  updated_by uuid references profiles on delete set null,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (channel_id, name)          -- 같은 채널에 같은 이름은 하나. 재업로드는 버전이 오릅니다.
);

-- 저장할 때마다 한 줄씩 쌓이는 버전 이력
create table if not exists file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid references files on delete cascade not null,
  version int not null,
  path text not null,
  size bigint,
  user_id uuid references profiles on delete set null,
  created_at timestamptz default now(),
  unique (file_id, version)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels on delete cascade not null,
  title text not null,
  assignee uuid references profiles on delete set null,
  due date,
  state text default 'todo' check (state in ('todo','doing','done')),
  created_at timestamptz default now()
);

create table if not exists reads (
  user_id uuid references profiles on delete cascade,
  target_id uuid not null,          -- channel_id 또는 dm_id
  read_at timestamptz default now(),
  primary key (user_id, target_id)
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  author_id uuid references profiles on delete set null,
  created_at timestamptz default now()
);

-- ---------- 2. 가입 시 프로필 자동 생성 ----------
-- 첫 사용자는 관리자 + 즉시 활성, 이후 사용자는 승인 대기 상태로 생성됩니다.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_first boolean;
begin
  select count(*) = 0 into is_first from profiles;
  insert into profiles (id, email, full_name, dept, title, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'dept',
    new.raw_user_meta_data->>'title',
    case when is_first then 'admin' else 'member' end,
    case when is_first then 'active' else 'pending' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();

-- ---------- 3. 헬퍼 함수 (RLS 재귀 방지용 security definer) ----------

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create or replace function is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function in_team(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid());
$$;

create or replace function can_see_channel(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channels ch
    where ch.id = c and (
      (ch.kind = 'standard' and exists (select 1 from team_members tm where tm.team_id = ch.team_id and tm.user_id = auth.uid()))
      or exists (select 1 from channel_members cm where cm.channel_id = c and cm.user_id = auth.uid())
    )
  );
$$;

create or replace function in_dm(d uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from dms where id = d and auth.uid() = any(members));
$$;

-- ---------- 4. RLS ----------

alter table profiles enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table dms enable row level security;
alter table messages enable row level security;
alter table files enable row level security;
alter table file_versions enable row level security;
alter table tasks enable row level security;
alter table reads enable row level security;
alter table announcements enable row level security;

-- profiles: 로그인한 사람은 구성원 명단을 볼 수 있음. 수정은 본인 또는 관리자.
drop policy if exists p_sel on profiles;
create policy p_sel on profiles for select using (auth.uid() is not null);
drop policy if exists p_upd_self on profiles;
create policy p_upd_self on profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
drop policy if exists p_upd_admin on profiles;
create policy p_upd_admin on profiles for update using (is_admin());
drop policy if exists p_del_admin on profiles;
create policy p_del_admin on profiles for delete using (is_admin());

-- teams / channels: 활성 사용자는 조회, 변경은 관리자
drop policy if exists t_sel on teams;
create policy t_sel on teams for select using (is_active());
drop policy if exists t_all on teams;
create policy t_all on teams for all using (is_admin()) with check (is_admin());

drop policy if exists tm_sel on team_members;
create policy tm_sel on team_members for select using (is_active());
drop policy if exists tm_all on team_members;
create policy tm_all on team_members for all using (is_admin()) with check (is_admin());

drop policy if exists c_sel on channels;
create policy c_sel on channels for select using (is_active());
drop policy if exists c_all on channels;
create policy c_all on channels for all using (is_admin()) with check (is_admin());

drop policy if exists cm_sel on channel_members;
create policy cm_sel on channel_members for select using (is_active());
drop policy if exists cm_all on channel_members;
create policy cm_all on channel_members for all using (is_admin()) with check (is_admin());

-- dms: 참여자만
drop policy if exists d_sel on dms;
create policy d_sel on dms for select using (auth.uid() = any(members));
drop policy if exists d_ins on dms;
create policy d_ins on dms for insert with check (auth.uid() = any(members));

-- messages: 볼 수 있는 채널 또는 내 DM만. 작성은 본인 명의로만. 삭제는 작성자/관리자.
drop policy if exists m_sel on messages;
create policy m_sel on messages for select using (
  (channel_id is not null and can_see_channel(channel_id)) or (dm_id is not null and in_dm(dm_id))
);
drop policy if exists m_ins on messages;
create policy m_ins on messages for insert with check (
  user_id = auth.uid() and is_active() and
  ((channel_id is not null and can_see_channel(channel_id)) or (dm_id is not null and in_dm(dm_id)))
);
drop policy if exists m_upd on messages;
create policy m_upd on messages for update using (
  (channel_id is not null and can_see_channel(channel_id)) or (dm_id is not null and in_dm(dm_id))
); -- 반응·투표 갱신 허용
drop policy if exists m_del on messages;
create policy m_del on messages for delete using (user_id = auth.uid() or is_admin());

-- files / tasks: 채널 접근 권한을 따름
drop policy if exists f_sel on files;
create policy f_sel on files for select using (can_see_channel(channel_id));
drop policy if exists f_ins on files;
create policy f_ins on files for insert with check (can_see_channel(channel_id) and user_id = auth.uid());
drop policy if exists f_upd on files;
create policy f_upd on files for update using (can_see_channel(channel_id));
drop policy if exists f_del on files;
create policy f_del on files for delete using (user_id = auth.uid() or is_admin());

drop policy if exists fv_sel on file_versions;
create policy fv_sel on file_versions for select using (
  exists (select 1 from files f where f.id = file_id and can_see_channel(f.channel_id))
);
drop policy if exists fv_ins on file_versions;
create policy fv_ins on file_versions for insert with check (
  exists (select 1 from files f where f.id = file_id and can_see_channel(f.channel_id))
);

drop policy if exists k_sel on tasks;
create policy k_sel on tasks for select using (can_see_channel(channel_id));
drop policy if exists k_ins on tasks;
create policy k_ins on tasks for insert with check (can_see_channel(channel_id));
drop policy if exists k_upd on tasks;
create policy k_upd on tasks for update using (can_see_channel(channel_id));
drop policy if exists k_del on tasks;
create policy k_del on tasks for delete using (can_see_channel(channel_id));

-- reads: 본인 것만
drop policy if exists r_all on reads;
create policy r_all on reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- announcements: 모두 읽기, 관리자만 작성
drop policy if exists a_sel on announcements;
create policy a_sel on announcements for select using (is_active());
drop policy if exists a_all on announcements;
create policy a_all on announcements for all using (is_admin()) with check (is_admin());

-- ---------- 5. 실시간 ----------
alter publication supabase_realtime add table messages;

-- ---------- 6. 파일 저장소 ----------
insert into storage.buckets (id, name, public) values ('files','files', false)
on conflict (id) do nothing;

drop policy if exists s_sel on storage.objects;
create policy s_sel on storage.objects for select using (bucket_id = 'files' and is_active());
drop policy if exists s_ins on storage.objects;
create policy s_ins on storage.objects for insert with check (bucket_id = 'files' and is_active());
drop policy if exists s_del on storage.objects;
create policy s_del on storage.objects for delete using (bucket_id = 'files' and is_admin());
