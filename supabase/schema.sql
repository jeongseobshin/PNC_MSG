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

-- reads: 읽은 위치는 서로 볼 수 있어야 '읽음 표시'가 됩니다. 쓰기는 본인 것만.
drop policy if exists r_all on reads;
drop policy if exists r_sel on reads;
create policy r_sel on reads for select using (is_active());
drop policy if exists r_ins on reads;
create policy r_ins on reads for insert with check (user_id = auth.uid());
drop policy if exists r_upd on reads;
create policy r_upd on reads for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- announcements: 모두 읽기, 관리자만 작성
drop policy if exists a_sel on announcements;
create policy a_sel on announcements for select using (is_active());
drop policy if exists a_all on announcements;
create policy a_all on announcements for all using (is_admin()) with check (is_admin());

-- ---------- 5. 실시간 ----------
-- 이미 추가돼 있으면 오류가 나므로 감싸서 실행합니다.
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table reads;
exception when duplicate_object then null; end $$;

-- ---------- 6. 파일 저장소 ----------
insert into storage.buckets (id, name, public) values ('files','files', false)
on conflict (id) do nothing;

drop policy if exists s_sel on storage.objects;
create policy s_sel on storage.objects for select using (bucket_id = 'files' and is_active());
drop policy if exists s_ins on storage.objects;
create policy s_ins on storage.objects for insert with check (bucket_id = 'files' and is_active());
drop policy if exists s_del on storage.objects;
create policy s_del on storage.objects for delete using (bucket_id = 'files' and is_admin());

-- ===========================================================================
-- 7. 스레드 · 멘션 · 푸시 알림 · 운영 설정
-- ===========================================================================

-- ---------- 7-1. 스레드 답글과 멘션 ----------
alter table messages add column if not exists parent_id uuid references messages on delete cascade;
alter table messages add column if not exists reply_count int not null default 0;
alter table messages add column if not exists mentions uuid[] default '{}';
alter table messages add column if not exists mention_all boolean default false;

create index if not exists messages_parent_idx on messages (parent_id, created_at);
create index if not exists messages_root_idx on messages (channel_id, created_at) where parent_id is null;

-- 답글 수는 손으로 세지 않고 트리거가 관리합니다.
create or replace function bump_reply_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.parent_id is not null then
    update messages set reply_count = reply_count + 1 where id = new.parent_id;
  elsif tg_op = 'DELETE' and old.parent_id is not null then
    update messages set reply_count = greatest(reply_count - 1, 0) where id = old.parent_id;
  end if;
  return null;
end $$;

drop trigger if exists on_reply_ins on messages;
create trigger on_reply_ins after insert on messages for each row execute function bump_reply_count();
drop trigger if exists on_reply_del on messages;
create trigger on_reply_del after delete on messages for each row execute function bump_reply_count();

-- ---------- 7-2. 푸시 구독 ----------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles on delete cascade not null,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz default now(),
  last_ok_at timestamptz default now()
);
create index if not exists push_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
drop policy if exists ps_sel on push_subscriptions;
create policy ps_sel on push_subscriptions for select using (user_id = auth.uid());
drop policy if exists ps_ins on push_subscriptions;
create policy ps_ins on push_subscriptions for insert with check (user_id = auth.uid());
drop policy if exists ps_del on push_subscriptions;
create policy ps_del on push_subscriptions for delete using (user_id = auth.uid());

-- ---------- 7-3. 운영 설정 (푸시 함수 주소·비밀키) ----------
create table if not exists app_config (
  key text primary key,
  value text not null
);
alter table app_config enable row level security;
-- 아무에게도 노출하지 않습니다. security definer 함수만 읽습니다.
drop policy if exists ac_none on app_config;
create policy ac_none on app_config for select using (false);

-- 아래 두 줄의 값을 실제 값으로 바꿔서 실행하세요.
-- insert into app_config (key, value) values
--   ('push_url', 'https://your-site.netlify.app/api/push-send'),
--   ('push_secret', '길고-임의의-문자열')
-- on conflict (key) do update set value = excluded.value;

-- ---------- 7-4. 새 메시지가 생기면 푸시 함수를 깨웁니다 ----------
create extension if not exists pg_net with schema extensions;

create or replace function notify_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  url text; secret text;
begin
  select value into url from app_config where key = 'push_url';
  select value into secret from app_config where key = 'push_secret';
  if url is null or secret is null then return null; end if;

  -- 알림 대상이 아예 없는 메시지는 굳이 부르지 않습니다.
  if new.dm_id is null and not new.mention_all
     and coalesce(array_length(new.mentions, 1), 0) = 0
     and new.importance <> 'urgent' then
    return null;
  end if;

  perform extensions.net.http_post(
    url := url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', secret),
    body := jsonb_build_object('message_id', new.id),
    timeout_milliseconds := 3000
  );
  return null;
end $$;

drop trigger if exists on_message_push on messages;
create trigger on_message_push after insert on messages for each row execute function notify_push();

-- ---------- 7-5. 가입 도메인 제한을 서버에서 강제 ----------
-- 브라우저 쪽 검사는 우회할 수 있습니다. 실제 차단은 여기서 합니다.
-- 제한하려면 아래를 실행하세요 (여러 개면 쉼표로).
-- insert into app_config (key, value) values ('allowed_domains', 'company.co.kr,partner.com')
-- on conflict (key) do update set value = excluded.value;

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
  allowed text;
  ok boolean;
begin
  select value into allowed from app_config where key = 'allowed_domains';
  if allowed is not null and length(trim(allowed)) > 0 then
    select bool_or(new.email like '%@' || trim(d)) into ok
      from unnest(string_to_array(allowed, ',')) as d;
    if not coalesce(ok, false) then
      raise exception '허용되지 않은 이메일 도메인입니다.';
    end if;
  end if;

  select count(*) = 0 into is_first from profiles;
  insert into profiles (id, email, full_name, dept, title, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'dept',
    new.raw_user_meta_data->>'title',
    case when is_first then 'admin' else 'member' end,
    case when is_first then 'active' else 'pending' end
  );
  return new;
end $$;

-- ---------- 7-6. 파일 크기 상한 (50MB) ----------
update storage.buckets set file_size_limit = 52428800 where id = 'files';
