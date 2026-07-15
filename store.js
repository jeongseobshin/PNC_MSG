/* ==========================================================================
   Store — 데이터 계층
   Supabase 키가 있으면 실제 DB, 없으면 데모 모드(메모리)로 같은 API를 제공합니다.
   화면(app.js)은 어느 쪽인지 신경 쓰지 않습니다.
   ========================================================================== */

const Store = (() => {
  const cfg = window.TEAMHUB_CONFIG;
  const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  let sb = null;
  if (useSupabase) sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const uid = () => Math.random().toString(36).slice(2, 10);
  const now = () => new Date().toISOString();
  const ago = (m) => new Date(Date.now() - m * 60000).toISOString();

  /* ---------------- 데모 데이터 ---------------- */
  const demo = {
    profiles: [
      { id: 'u1', full_name: '김도현', email: 'dohyun@company.co.kr', dept: '프로덕트', title: '팀장', role: 'admin', status: 'active', presence: 'online', color: '#2B4C7E' },
      { id: 'u2', full_name: '이서연', email: 'seoyeon@company.co.kr', dept: '디자인', title: '시니어 디자이너', role: 'member', status: 'active', presence: 'online', color: '#B54708' },
      { id: 'u3', full_name: '박준호', email: 'junho@company.co.kr', dept: '개발', title: '백엔드 리드', role: 'member', status: 'active', presence: 'away', color: '#12805C' },
      { id: 'u4', full_name: '최민지', email: 'minji@company.co.kr', dept: '영업', title: '매니저', role: 'member', status: 'pending', presence: 'offline', color: '#6941C6' },
      { id: 'u5', full_name: '정우성', email: 'woosung@partner.com', dept: '외부 협력사', title: '컨설턴트', role: 'guest', status: 'active', presence: 'offline', color: '#0B7285' },
    ],
    teams: [
      { id: 't1', name: '프로덕트 본부', key: 'PRD', color: '#2B4C7E', description: '제품 기획·개발 전반' },
      { id: 't2', name: '2026 리뉴얼 TF', key: 'TF', color: '#B54708', description: '홈페이지 리뉴얼 태스크포스' },
    ],
    channels: [
      { id: 'c1', team_id: 't1', name: '일반', kind: 'standard', topic: '본부 공지와 잡담' },
      { id: 'c2', team_id: 't1', name: '릴리스', kind: 'standard', topic: '배포 일정 및 이슈 공유' },
      { id: 'c3', team_id: 't1', name: '인사-비공개', kind: 'private', topic: '팀장 전용' },
      { id: 'c4', team_id: 't2', name: '기획', kind: 'standard', topic: 'IA·와이어프레임' },
      { id: 'c5', team_id: 't2', name: '협력사-공유', kind: 'shared', topic: '외부 협력사와 공유되는 채널' },
    ],
    team_members: [
      { team_id: 't1', user_id: 'u1' }, { team_id: 't1', user_id: 'u2' }, { team_id: 't1', user_id: 'u3' },
      { team_id: 't2', user_id: 'u1' }, { team_id: 't2', user_id: 'u2' }, { team_id: 't2', user_id: 'u5' },
    ],
    channel_members: [
      { channel_id: 'c3', user_id: 'u1' },
      { channel_id: 'c5', user_id: 'u1' }, { channel_id: 'c5', user_id: 'u2' }, { channel_id: 'c5', user_id: 'u5' },
    ],
    messages: [
      { id: 'm1', channel_id: 'c1', user_id: 'u1', body: '이번 주 정기 회의는 목요일 오후 3시로 옮깁니다. 회의실은 3층 노드입니다.', importance: 'important', created_at: ago(600), reactions: { '👍': ['u2', 'u3'] } },
      { id: 'm2', channel_id: 'c1', user_id: 'u2', body: '확인했습니다. 디자인 시안은 그때 같이 보여드릴게요.', importance: 'normal', created_at: ago(596), reactions: {} },
      { id: 'm3', channel_id: 'c1', user_id: 'u3', body: '@김도현 API 명세서 초안 올려뒀습니다. 리뷰 부탁드려요.', importance: 'normal', created_at: ago(120), reactions: {}, file: { name: 'API_명세서_v3.docx', size: 284000 } },
      { id: 'm4', channel_id: 'c2', user_id: 'u3', body: '결제 서버 응답 지연 발생 중입니다. 원인 파악되면 바로 공유하겠습니다.', importance: 'urgent', created_at: ago(35), reactions: { '👀': ['u1'] } },
      { id: 'm5', channel_id: 'c2', user_id: 'u1', body: '고객 공지 문구는 제가 준비하겠습니다.', importance: 'normal', created_at: ago(30), reactions: {} },
      { id: 'm6', channel_id: 'c4', user_id: 'u2', body: '메인 페이지 와이어프레임 3안 공유드립니다. 투표로 정하죠.', importance: 'normal', created_at: ago(240), reactions: {}, poll: { question: '메인 히어로 방향', options: ['A. 카피 중심', 'B. 제품 스크린샷', 'C. 고객 사례'], votes: { 'A. 카피 중심': ['u1'], 'B. 제품 스크린샷': ['u2', 'u5'], 'C. 고객 사례': [] } } },
      { id: 'm7', channel_id: 'c5', user_id: 'u5', body: '경쟁사 벤치마킹 자료 전달드립니다. 확인 부탁드립니다.', importance: 'normal', created_at: ago(180), reactions: {}, file: { name: '벤치마킹_리포트.pdf', size: 1840000 } },
    ],
    dms: [
      { id: 'd1', members: ['u1', 'u2'] },
      { id: 'd2', members: ['u1', 'u3'] },
    ],
    dm_messages: [
      { id: 'dm1', dm_id: 'd1', user_id: 'u2', body: '시안 링크 보내드렸어요!', importance: 'normal', created_at: ago(90), reactions: {} },
      { id: 'dm2', dm_id: 'd2', user_id: 'u3', body: '오후에 잠깐 통화 가능하실까요?', importance: 'normal', created_at: ago(20), reactions: {} },
    ],
    files: [
      { id: 'f1', channel_id: 'c1', name: 'API_명세서_v3.docx', size: 284000, user_id: 'u3', created_at: ago(120), version: 3 },
      { id: 'f2', channel_id: 'c1', name: '2026_로드맵.pptx', size: 4200000, user_id: 'u1', created_at: ago(2880), version: 1 },
      { id: 'f3', channel_id: 'c2', name: '배포_체크리스트.xlsx', size: 62000, user_id: 'u3', created_at: ago(400), version: 7 },
      { id: 'f4', channel_id: 'c5', name: '벤치마킹_리포트.pdf', size: 1840000, user_id: 'u5', created_at: ago(180), version: 1 },
    ],
    tasks: [
      { id: 'k1', channel_id: 'c1', title: 'API 명세서 리뷰', assignee: 'u1', due: '2026-07-17', state: 'doing' },
      { id: 'k2', channel_id: 'c1', title: '3분기 로드맵 확정', assignee: 'u1', due: '2026-07-24', state: 'todo' },
      { id: 'k3', channel_id: 'c1', title: '온보딩 문서 정리', assignee: 'u2', due: '2026-07-10', state: 'done' },
      { id: 'k4', channel_id: 'c4', title: '와이어프레임 3안 정리', assignee: 'u2', due: '2026-07-18', state: 'doing' },
    ],
    announcements: [
      { id: 'a1', title: '전사 보안 교육 이수 안내', body: '7월 31일까지 필수 이수 부탁드립니다.', created_at: ago(1440) },
    ],
    reads: {},
  };

  let session = { user: null }; // 데모용
  const listeners = [];
  const emit = () => listeners.forEach((fn) => fn());

  /* ---------------- 공용 헬퍼 ---------------- */
  const palette = ['#2B4C7E', '#B54708', '#12805C', '#6941C6', '#0B7285', '#C11574'];
  const colorFor = (s) => palette[[...(s || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];

  /* ---------------- API ---------------- */
  const api = {
    mode: useSupabase ? 'supabase' : 'demo',
    sb,
    me: null,
    cache: { profiles: [], teams: [], channels: [], team_members: [], channel_members: [], dms: [] },

    onChange(fn) { listeners.push(fn); },

    /* ---- 인증 ---- */
    async signUp({ email, password, full_name, dept, title }) {
      const domains = cfg.ALLOWED_EMAIL_DOMAINS;
      if (domains.length && !domains.some((d) => email.toLowerCase().endsWith('@' + d))) {
        throw new Error(`${domains.join(', ')} 도메인 이메일로만 가입할 수 있습니다.`);
      }
      if (!useSupabase) {
        if (demo.profiles.some((p) => p.email === email)) throw new Error('이미 가입된 이메일입니다.');
        const p = {
          id: uid(), full_name, email, dept: dept || '', title: title || '', role: 'member',
          status: cfg.REQUIRE_ADMIN_APPROVAL ? 'pending' : 'active', presence: 'online', color: colorFor(email),
        };
        demo.profiles.push(p);
        return { needsApproval: p.status === 'pending', needsEmailConfirm: false };
      }
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { full_name, dept, title } },
      });
      if (error) throw error;
      return { needsApproval: cfg.REQUIRE_ADMIN_APPROVAL, needsEmailConfirm: !data.session };
    },

    async signIn({ email, password }) {
      if (!useSupabase) {
        const p = demo.profiles.find((x) => x.email === email);
        if (!p) throw new Error('등록되지 않은 이메일입니다.');
        if (p.status === 'pending') throw new Error('관리자 승인 대기 중입니다.');
        if (p.status === 'suspended') throw new Error('사용이 중지된 계정입니다. 관리자에게 문의하세요.');
        session.user = p; api.me = p; p.presence = 'online';
        return p;
      }
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 맞지 않습니다.' : error.message);
      return api.loadMe();
    },

    async signOut() {
      if (!useSupabase) { if (api.me) api.me.presence = 'offline'; session.user = null; api.me = null; return; }
      await sb.auth.signOut(); api.me = null;
    },

    async loadMe() {
      if (!useSupabase) return api.me;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { api.me = null; return null; }
      const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
      if (error) throw error;
      if (data.status === 'pending') { await sb.auth.signOut(); throw new Error('관리자 승인 대기 중입니다.'); }
      if (data.status === 'suspended') { await sb.auth.signOut(); throw new Error('사용이 중지된 계정입니다.'); }
      api.me = { ...data, color: data.color || colorFor(data.email) };
      return api.me;
    },

    /* ---- 초기 로드 ---- */
    async loadWorkspace() {
      if (!useSupabase) {
        api.cache = {
          profiles: demo.profiles, teams: demo.teams, channels: demo.channels,
          team_members: demo.team_members, channel_members: demo.channel_members, dms: demo.dms,
        };
        return api.cache;
      }
      const [p, t, c, tm, cm, d] = await Promise.all([
        sb.from('profiles').select('*'),
        sb.from('teams').select('*'),
        sb.from('channels').select('*'),
        sb.from('team_members').select('*'),
        sb.from('channel_members').select('*'),
        sb.from('dms').select('*'),
      ]);
      api.cache = {
        profiles: (p.data || []).map((x) => ({ ...x, color: x.color || colorFor(x.email) })),
        teams: t.data || [], channels: c.data || [],
        team_members: tm.data || [], channel_members: cm.data || [], dms: d.data || [],
      };
      return api.cache;
    },

    profile(id) { return api.cache.profiles.find((p) => p.id === id) || { full_name: '알 수 없음', color: '#8A94A3' }; },

    /* 내가 볼 수 있는 채널: 표준=팀원 전체, 비공개/공유=채널 멤버만 */
    visibleChannels(teamId) {
      const meId = api.me?.id;
      return api.cache.channels.filter((c) => {
        if (c.team_id !== teamId) return false;
        if (c.kind === 'standard') return true;
        return api.cache.channel_members.some((m) => m.channel_id === c.id && m.user_id === meId) || api.me?.role === 'admin';
      });
    },
    myTeams() {
      const meId = api.me?.id;
      if (api.me?.role === 'admin') return api.cache.teams;
      const ids = api.cache.team_members.filter((m) => m.user_id === meId).map((m) => m.team_id);
      return api.cache.teams.filter((t) => ids.includes(t.id));
    },
    myDms() {
      const meId = api.me?.id;
      return api.cache.dms.filter((d) => (d.members || []).includes(meId));
    },

    /* ---- 메시지 ---- */
    async messages(target) {
      if (!useSupabase) {
        const rows = target.kind === 'dm'
          ? demo.dm_messages.filter((m) => m.dm_id === target.id)
          : demo.messages.filter((m) => m.channel_id === target.id);
        return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
      }
      const q = sb.from('messages').select('*').order('created_at');
      const { data, error } = target.kind === 'dm' ? await q.eq('dm_id', target.id) : await q.eq('channel_id', target.id);
      if (error) throw error;
      return (data || []).map((m) => ({ ...m, reactions: m.reactions || {} }));
    },

    async send(target, { body, importance = 'normal', file = null, poll = null }) {
      const row = {
        id: uid(), user_id: api.me.id, body, importance, created_at: now(), reactions: {},
        ...(file ? { file } : {}), ...(poll ? { poll } : {}),
        ...(target.kind === 'dm' ? { dm_id: target.id } : { channel_id: target.id }),
      };
      if (!useSupabase) {
        (target.kind === 'dm' ? demo.dm_messages : demo.messages).push(row);
        emit(); return row;
      }
      const { id, ...ins } = row;
      const { data, error } = await sb.from('messages').insert(ins).select().single();
      if (error) throw error;
      return data;
    },

    async react(msg, emoji) {
      const meId = api.me.id;
      const r = { ...(msg.reactions || {}) };
      const arr = r[emoji] || [];
      r[emoji] = arr.includes(meId) ? arr.filter((x) => x !== meId) : [...arr, meId];
      if (!r[emoji].length) delete r[emoji];
      msg.reactions = r;
      if (!useSupabase) { emit(); return; }
      await sb.from('messages').update({ reactions: r }).eq('id', msg.id);
    },

    async vote(msg, option) {
      const meId = api.me.id;
      const poll = JSON.parse(JSON.stringify(msg.poll));
      Object.keys(poll.votes).forEach((k) => { poll.votes[k] = poll.votes[k].filter((x) => x !== meId); });
      poll.votes[option].push(meId);
      msg.poll = poll;
      if (!useSupabase) { emit(); return; }
      await sb.from('messages').update({ poll }).eq('id', msg.id);
    },

    async deleteMessage(msg) {
      if (!useSupabase) {
        [demo.messages, demo.dm_messages].forEach((arr) => {
          const i = arr.findIndex((m) => m.id === msg.id);
          if (i > -1) arr.splice(i, 1);
        });
        emit(); return;
      }
      await sb.from('messages').delete().eq('id', msg.id);
    },

    /* ---- 실시간 ---- */
    subscribe(target, onInsert) {
      if (!useSupabase) {
        listeners.push(onInsert);
        return { unsubscribe() { const i = listeners.indexOf(onInsert); if (i > -1) listeners.splice(i, 1); } };
      }
      const key = target.kind === 'dm' ? `dm_id=eq.${target.id}` : `channel_id=eq.${target.id}`;
      const ch = sb.channel('rt-' + target.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: key }, onInsert)
        .subscribe();
      return { unsubscribe: () => sb.removeChannel(ch) };
    },

    /* ---- 파일 ---- */
    async files(channelId) {
      if (!useSupabase) return demo.files.filter((f) => f.channel_id === channelId).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const { data } = await sb.from('files').select('*').eq('channel_id', channelId).order('created_at', { ascending: false });
      return data || [];
    },

    /* 같은 이름이면 새 행이 아니라 버전을 올립니다. 이전 파일은 이력으로 남습니다. */
    async upload(channelId, file) {
      if (!useSupabase) {
        const prev = demo.files.find((f) => f.channel_id === channelId && f.name === file.name);
        if (prev) { prev.version += 1; prev.created_at = now(); prev.user_id = api.me.id; return prev; }
        const row = { id: uid(), channel_id: channelId, name: file.name, size: file.size, user_id: api.me.id, created_at: now(), version: 1 };
        demo.files.push(row); return row;
      }

      let { data: row } = await sb.from('files').select('*').eq('channel_id', channelId).eq('name', file.name).maybeSingle();
      if (!row) {
        const { data, error } = await sb.from('files')
          .insert({ channel_id: channelId, name: file.name, size: file.size, version: 0, user_id: api.me.id })
          .select().single();
        if (error) throw error;
        row = data;
      }
      const version = row.version + 1;
      const path = `${channelId}/${row.id}/v${version}_${file.name}`;
      const { error: upErr } = await sb.storage.from('files').upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: updated, error: e2 } = await sb.from('files')
        .update({ path, version, size: file.size, updated_at: now(), updated_by: api.me.id })
        .eq('id', row.id).select().single();
      if (e2) throw e2;
      await sb.from('file_versions').insert({ file_id: row.id, version, path, size: file.size, user_id: api.me.id });
      return updated;
    },

    async fileVersions(fileId) {
      if (!useSupabase) {
        const f = demo.files.find((x) => x.id === fileId);
        return Array.from({ length: f.version }, (_, i) => ({
          version: f.version - i, size: f.size, user_id: f.user_id, created_at: f.created_at,
        }));
      }
      const { data } = await sb.from('file_versions').select('*').eq('file_id', fileId).order('version', { ascending: false });
      return data || [];
    },

    async versionUrl(v) {
      if (!useSupabase || !v.path) return null;
      const { data } = await sb.storage.from('files').createSignedUrl(v.path, 3600);
      return data?.signedUrl || null;
    },

    async fileUrl(f) {
      if (!useSupabase || !f.path) return null;
      const { data } = await sb.storage.from('files').createSignedUrl(f.path, 3600);
      return data?.signedUrl || null;
    },

    /* ---- 작업(Planner) ---- */
    async tasks(channelId) {
      if (!useSupabase) return demo.tasks.filter((t) => t.channel_id === channelId);
      const { data } = await sb.from('tasks').select('*').eq('channel_id', channelId).order('created_at');
      return data || [];
    },
    async addTask(t) {
      if (!useSupabase) { const row = { id: uid(), ...t }; demo.tasks.push(row); return row; }
      const { data, error } = await sb.from('tasks').insert(t).select().single();
      if (error) throw error; return data;
    },
    async moveTask(task, state) {
      task.state = state;
      if (!useSupabase) return;
      await sb.from('tasks').update({ state }).eq('id', task.id);
    },

    /* ---- 검색 ---- */
    async search(q) {
      const needle = q.trim().toLowerCase();
      if (!needle) return { messages: [], files: [], people: [] };
      if (!useSupabase) {
        const msgs = [...demo.messages, ...demo.dm_messages].filter((m) => m.body.toLowerCase().includes(needle)).slice(0, 20);
        return {
          messages: msgs,
          files: demo.files.filter((f) => f.name.toLowerCase().includes(needle)),
          people: demo.profiles.filter((p) => (p.full_name + p.email + p.dept).toLowerCase().includes(needle)),
        };
      }
      const [m, f] = await Promise.all([
        sb.from('messages').select('*').ilike('body', `%${q}%`).limit(20),
        sb.from('files').select('*').ilike('name', `%${q}%`).limit(20),
      ]);
      return {
        messages: m.data || [], files: f.data || [],
        people: api.cache.profiles.filter((p) => (p.full_name + p.email + (p.dept || '')).toLowerCase().includes(needle)),
      };
    },

    /* ---- 관리자 ---- */
    admin: {
      async setRole(userId, role) {
        if (!useSupabase) { api.profile(userId).role = role; return; }
        await sb.from('profiles').update({ role }).eq('id', userId);
        api.profile(userId).role = role;
      },
      async setStatus(userId, status) {
        if (!useSupabase) { api.profile(userId).status = status; return; }
        await sb.from('profiles').update({ status }).eq('id', userId);
        api.profile(userId).status = status;
      },
      async createTeam({ name, key, description }) {
        const row = { name, key: key.toUpperCase(), description, color: colorFor(name) };
        if (!useSupabase) {
          const t = { id: uid(), ...row }; demo.teams.push(t);
          demo.team_members.push({ team_id: t.id, user_id: api.me.id });
          demo.channels.push({ id: uid(), team_id: t.id, name: '일반', kind: 'standard', topic: '' });
          return t;
        }
        const { data, error } = await sb.from('teams').insert(row).select().single();
        if (error) throw error;
        await sb.from('team_members').insert({ team_id: data.id, user_id: api.me.id, role: 'owner' });
        await sb.from('channels').insert({ team_id: data.id, name: '일반', kind: 'standard' });
        await api.loadWorkspace();
        return data;
      },
      async createChannel({ team_id, name, kind, topic }) {
        if (!useSupabase) {
          const c = { id: uid(), team_id, name, kind, topic }; demo.channels.push(c);
          if (kind !== 'standard') demo.channel_members.push({ channel_id: c.id, user_id: api.me.id });
          return c;
        }
        const { data, error } = await sb.from('channels').insert({ team_id, name, kind, topic }).select().single();
        if (error) throw error;
        if (kind !== 'standard') await sb.from('channel_members').insert({ channel_id: data.id, user_id: api.me.id });
        await api.loadWorkspace();
        return data;
      },
      async addTeamMember(team_id, user_id) {
        if (!useSupabase) {
          if (!demo.team_members.some((m) => m.team_id === team_id && m.user_id === user_id)) demo.team_members.push({ team_id, user_id });
          return;
        }
        await sb.from('team_members').insert({ team_id, user_id });
        await api.loadWorkspace();
      },
      async announce({ title, body }) {
        if (!useSupabase) { demo.announcements.unshift({ id: uid(), title, body, created_at: now() }); return; }
        const { error } = await sb.from('announcements').insert({ title, body, author_id: api.me.id });
        if (error) throw error;
      },
      async announcements() {
        if (!useSupabase) return demo.announcements;
        const { data } = await sb.from('announcements').select('*').order('created_at', { ascending: false });
        return data || [];
      },
      async stats() {
        if (!useSupabase) {
          return {
            users: demo.profiles.length,
            active: demo.profiles.filter((p) => p.status === 'active').length,
            pending: demo.profiles.filter((p) => p.status === 'pending').length,
            teams: demo.teams.length, channels: demo.channels.length,
            messages: demo.messages.length + demo.dm_messages.length,
            files: demo.files.length,
            urgent: demo.messages.filter((m) => m.importance === 'urgent').length,
          };
        }
        const c = async (t) => (await sb.from(t).select('*', { count: 'exact', head: true })).count || 0;
        return {
          users: api.cache.profiles.length,
          active: api.cache.profiles.filter((p) => p.status === 'active').length,
          pending: api.cache.profiles.filter((p) => p.status === 'pending').length,
          teams: api.cache.teams.length, channels: api.cache.channels.length,
          messages: await c('messages'), files: await c('files'),
          urgent: (await sb.from('messages').select('*', { count: 'exact', head: true }).eq('importance', 'urgent')).count || 0,
        };
      },
    },

    /* ---- 읽음 상태 ---- */
    reads: {},   // { [targetId]: ISO 시각 }

    async loadReads() {
      if (!useSupabase) { api.reads = demo.reads; return api.reads; }
      const { data } = await sb.from('reads').select('*').eq('user_id', api.me.id);
      api.reads = Object.fromEntries((data || []).map((r) => [r.target_id, r.read_at]));
      return api.reads;
    },

    async markRead(targetId) {
      const at = now();
      api.reads[targetId] = at;
      if (!useSupabase) { demo.reads[targetId] = at; return; }
      await sb.from('reads').upsert({ user_id: api.me.id, target_id: targetId, read_at: at },
        { onConflict: 'user_id,target_id' });
    },

    /* 사이드바 배지용. 최근 활동만 한 번에 가져와 클라이언트에서 셉니다. */
    async recentActivity() {
      if (!useSupabase) {
        return [...demo.messages, ...demo.dm_messages]
          .map((m) => ({ target: m.channel_id || m.dm_id, created_at: m.created_at, user_id: m.user_id, body: m.body, importance: m.importance }));
      }
      const { data } = await sb.from('messages')
        .select('channel_id,dm_id,created_at,user_id,body,importance')
        .order('created_at', { ascending: false }).limit(400);
      return (data || []).map((m) => ({ target: m.channel_id || m.dm_id, ...m }));
    },

    /** 대상별 { count, mention } 집계 */
    async unreadMap() {
      const acts = await api.recentActivity();
      const out = {};
      const myName = api.me.full_name;
      for (const a of acts) {
        if (a.user_id === api.me.id) continue;
        const since = api.reads[a.target];
        if (since && a.created_at <= since) continue;
        const o = out[a.target] || (out[a.target] = { count: 0, mention: false });
        o.count++;
        if (a.body?.includes('@' + myName) || a.body?.includes('@채널') || a.importance === 'urgent') o.mention = true;
      }
      return out;
    },

    /* ---- 접속 상태 ---- */
    async joinPresence(onSync) {
      if (!useSupabase) { onSync(new Set(demo.profiles.filter((p) => p.presence === 'online').map((p) => p.id))); return; }
      const ch = sb.channel('presence:workspace', { config: { presence: { key: api.me.id } } });
      ch.on('presence', { event: 'sync' }, () => {
        onSync(new Set(Object.keys(ch.presenceState())));
      }).subscribe(async (st) => {
        if (st === 'SUBSCRIBED') await ch.track({ at: now() });
      });
      return ch;
    },

    /* ---- 입력 중 ---- */
    typingChannel(targetId, onTyping) {
      if (!useSupabase) return { send() {}, unsubscribe() {} };
      const ch = sb.channel(`typing:${targetId}`);
      ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.user_id !== api.me.id) onTyping(payload);
      }).subscribe();
      return {
        send: () => ch.send({ type: 'broadcast', event: 'typing', payload: { user_id: api.me.id, name: api.me.full_name, at: Date.now() } }),
        unsubscribe: () => sb.removeChannel(ch),
      };
    },

    /* ---- 메시지 수정 ---- */
    async editMessage(msg, body) {
      msg.body = body; msg.edited_at = now();
      if (!useSupabase) { emit(); return; }
      await sb.from('messages').update({ body, edited_at: msg.edited_at }).eq('id', msg.id);
    },

    // 데모 로그인용 계정 목록
    demoAccounts: demo.profiles.filter((p) => p.status === 'active'),
  };

  return api;
})();
