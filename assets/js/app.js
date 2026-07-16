/* ==========================================================================
   TeamHub 앱
   - 화면 전체를 다시 그리지 않습니다. 바뀐 부분만 칠합니다(입력·스크롤 보존).
   - ⌘K 명령 팔레트로 어디든 두 번의 키 입력으로 이동합니다.
   ========================================================================== */

const App = (() => {
  const root = document.getElementById('app');
  const cfg = window.TEAMHUB_CONFIG;
  const { esc, format, timeOf, dayOf, size, avatar, icons, toast, modal, confirmDialog } = UI;
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
  const extOf = (n) => (n.split('.').pop() || 'file').toLowerCase();
  const OFFICE = new Set(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'csv', 'txt', 'pdf']);

  const S = {
    view: 'chat',
    adminTab: 'users',
    target: null,
    openTeams: {},
    messages: [],
    more: false,
    reads: [],
    thread: null,      // 열려 있는 스레드의 부모 메시지 id
    drafts: {},
    flags: {},
    unread: {},
    online: new Set(),
    typers: new Map(),
    query: '',
    pane: 'sidebar',   // 모바일: sidebar | main | panel
    panel: false,
    atBottom: true,
    lastRead: null,
    sub: null,
    typingCh: null,
    readsCh: null,
  };

  /* ================= 테마 ================= */
  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  function applyTheme(t) {
    const theme = t || store.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#0A0C11' : '#12151C');
    store.set('theme', theme);
    return theme;
  }
  const toggleTheme = () => {
    const t = applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    toast(t === 'dark' ? '어두운 화면으로 바꿨습니다.' : '밝은 화면으로 바꿨습니다.');
  };
  applyTheme();

  /* ================= 로그인 ================= */
  function renderAuth(mode = 'signin', msg = null) {
    S.sub?.unsubscribe(); S.typingCh?.unsubscribe();
    root.className = '';
    root.innerHTML = `
      <div class="auth">
        <div class="auth-brand">
          <div>
            <div class="auth-mark">${esc(cfg.ORG_NAME)} / 사내 메신저</div>
            <h1>흩어진 대화를<br/>한 곳에서 끝냅니다.</h1>
            <p>팀과 채널로 일을 나누고, 문서와 작업을 대화 옆에 두세요.</p>
            <ul class="auth-feat">
              <li><span>01</span>팀 · 채널 · 비공개/공유 채널</li>
              <li><span>02</span>중요 · 긴급 태그와 @멘션 알림</li>
              <li><span>03</span>Word · Excel 브라우저 동시 편집</li>
              <li><span>04</span>작업 보드와 설문 · 투표</li>
            </ul>
          </div>
          <div class="auth-mark">${Store.mode === 'demo' ? '데모 모드 · Supabase 미연결' : 'Supabase 연결됨'}</div>
        </div>
        <div class="auth-panel">
          <div class="auth-card">
            <h2>${mode === 'signin' ? '로그인' : '계정 만들기'}</h2>
            <p class="sub">${mode === 'signin' ? '회사 이메일로 들어오세요.'
              : cfg.REQUIRE_ADMIN_APPROVAL ? '가입 후 관리자 승인이 끝나면 사용할 수 있습니다.' : '바로 사용할 수 있습니다.'}</p>
            ${msg ? `<div class="notice notice-${msg.kind}" role="status">${esc(msg.text)}</div>` : ''}
            <form id="authForm" novalidate>
              ${mode === 'signup' ? `
                <label class="field"><span>이름</span><input name="full_name" required autocomplete="name" /></label>
                <label class="field"><span>부서</span><input name="dept" placeholder="예: 프로덕트" /></label>
                <label class="field"><span>직함</span><input name="title" placeholder="예: 매니저" /></label>` : ''}
              <label class="field"><span>이메일</span><input name="email" type="email" required autocomplete="email" /></label>
              <label class="field"><span>비밀번호</span><input name="password" type="password" required minlength="6"
                autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}" />
                ${mode === 'signup' ? '<span class="field-hint">6자 이상</span>' : ''}</label>
              <button class="btn btn-block" type="submit">${mode === 'signin' ? '로그인' : '가입 신청'}</button>
            </form>
            <div class="auth-switch">
              ${mode === 'signin' ? '계정이 없으신가요? <button data-mode="signup">가입하기</button>'
                                  : '이미 계정이 있으신가요? <button data-mode="signin">로그인</button>'}
            </div>
            ${Store.mode === 'demo' && mode === 'signin' ? `
              <div class="notice notice-info" style="margin-top:20px">
                데모 계정 — 눌러서 채우기 (비밀번호 아무거나)<br/>
                ${Store.demoAccounts.map((a) => `<button class="demo-fill" data-email="${a.email}"
                  style="color:inherit;text-decoration:underline">${esc(a.full_name)}${a.role === 'admin' ? ' (관리자)' : ''}</button>`).join(' · ')}
              </div>` : ''}
          </div>
        </div>
      </div>`;

    root.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => renderAuth(b.dataset.mode));
    root.querySelectorAll('.demo-fill').forEach((b) => b.onclick = () => {
      root.querySelector('[name=email]').value = b.dataset.email;
      root.querySelector('[name=password]').value = 'demo1234';
      root.querySelector('[type=submit]').focus();
    });

    root.querySelector('#authForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('[type=submit]');
      btn.disabled = true; btn.textContent = '잠시만요…';
      const d = Object.fromEntries(new FormData(e.target));
      try {
        if (mode === 'signup') {
          const r = await Store.signUp(d);
          renderAuth('signin', { kind: 'ok', text: r.needsEmailConfirm ? '가입 신청 완료. 메일함에서 인증 링크를 확인하세요.'
            : r.needsApproval ? '가입 신청 완료. 관리자 승인 후 로그인할 수 있습니다.' : '가입 완료. 이제 로그인하세요.' });
        } else { await Store.signIn(d); await boot(); }
      } catch (err) {
        renderAuth(mode, { kind: 'err', text: err.message });
      }
    };
    root.querySelector('input')?.focus();
  }

  /* ================= 셸 (한 번만 만듭니다) ================= */
  const railItems = () => {
    const base = [{ k: 'chat', label: '채팅' }, { k: 'files', label: '파일' }, { k: 'tasks', label: '작업' }, { k: 'search', label: '검색' }];
    if (Store.me.role === 'admin') base.push({ k: 'admin', label: '관리자' });
    return base;
  };

  function mount() {
    root.className = '';
    root.innerHTML = `
      <div class="shell" id="shell">
        <nav class="rail" id="rail" aria-label="주요 메뉴"></nav>
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-head">
            <h2>${esc(cfg.ORG_NAME)}</h2>
            <div style="margin-left:auto;display:flex;gap:2px">
              <button class="btn-quiet" id="themeBtn" title="화면 밝기 전환" aria-label="화면 밝기 전환">◐</button>
              ${Store.me.role === 'admin' ? '<button class="btn-quiet" id="newTeamBtn" title="팀 만들기">＋</button>' : ''}
            </div>
          </div>
          <button class="jump" id="jumpBtn">
            ${icons.search}<span>이동 · 검색</span><kbd>⌘K</kbd>
          </button>
          <div class="sidebar-body" id="sidebarBody"></div>
        </aside>
        <section class="main" id="main"></section>
        <nav class="mobile-tabs" id="mtabs" aria-label="주요 메뉴"></nav>
      </div>`;

    root.querySelector('#themeBtn').onclick = toggleTheme;
    root.querySelector('#newTeamBtn')?.addEventListener('click', newTeam);
    root.querySelector('#jumpBtn').onclick = openPalette;
    paintRail();
    layout();
  }

  function layout() {
    const shell = root.querySelector('#shell');
    shell.classList.toggle('with-panel', S.panel && !isMobile());
    if (isMobile()) {
      root.querySelector('#sidebar').classList.toggle('m-show', S.pane === 'sidebar');
      root.querySelector('#main').classList.toggle('m-show', S.pane === 'main');
      root.querySelector('#panel')?.classList.toggle('m-show', S.pane === 'panel');
    } else {
      root.querySelectorAll('.m-show').forEach((e) => e.classList.remove('m-show'));
    }
  }

  function paintRail() {
    const totalUnread = Object.values(S.unread).reduce((a, u) => a + u.count, 0);
    const html = railItems().map((r) => `
      <button class="rail-item ${S.view === r.k ? 'active' : ''}" data-view="${r.k}"
        aria-current="${S.view === r.k}" title="${r.label}">
        ${icons[r.k] || icons.chat}<span>${r.label}</span>
        ${r.k === 'chat' && totalUnread ? `<i class="rail-badge">${totalUnread > 99 ? '99+' : totalUnread}</i>` : ''}
      </button>`).join('');

    const rail = root.querySelector('#rail');
    rail.innerHTML = html + `<div class="rail-spacer"></div>
      <button class="rail-item" id="meBtn" title="내 프로필">${avatar({ ...Store.me, presence: 'online' })}</button>`;
    root.querySelector('#mtabs').innerHTML = html;

    root.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => go(b.dataset.view));
    rail.querySelector('#meBtn').onclick = showMeMenu;
  }

  function go(view) {
    S.view = view;
    S.pane = view === 'chat' ? (S.target && isMobile() ? 'main' : 'sidebar') : 'main';
    S.panel = false;
    paintRail(); paintMain(); layout();
  }

  /* ================= 사이드바 ================= */
  function paintSidebar() {
    const body = root.querySelector('#sidebarBody');
    if (!body) return;
    const scroll = body.scrollTop;

    const badge = (id) => {
      const u = S.unread[id];
      if (!u || (S.target?.id === id)) return '';
      return `<i class="count ${u.mention ? '' : 'muted'}">${u.count > 99 ? '99+' : u.count}</i>`;
    };

    body.innerHTML = Store.myTeams().map((t) => {
      const open = S.openTeams[t.id] !== false;
      return `
        <div class="team-group">
          <button class="team-head" data-team="${t.id}" aria-expanded="${open}">
            <span class="team-chip" style="background:${t.color}">${esc(t.key || t.name.slice(0, 2))}</span>
            <span class="chan-name">${esc(t.name)}</span>
            <span class="caret ${open ? 'open' : ''}" aria-hidden="true">▶</span>
          </button>
          ${open ? Store.visibleChannels(t.id).map((c) => `
            <button class="chan ${S.target?.id === c.id ? 'active' : ''} ${S.unread[c.id] ? 'unread' : ''}" data-chan="${c.id}">
              <span class="chan-key">#</span>
              <span class="chan-name">${esc(c.name)}</span>
              ${c.kind !== 'standard' ? `<span class="chan-tag ${c.kind}">${c.kind === 'private' ? '비공개' : '공유'}</span>` : ''}
              ${badge(c.id)}
            </button>`).join('') : ''}
          ${open && Store.me.role === 'admin'
            ? `<button class="chan" data-newchan="${t.id}" style="color:var(--text-3)">＋ 채널 추가</button>` : ''}
        </div>`;
    }).join('') + `
      <div class="side-label">다이렉트 메시지 <button data-newdm title="새 대화">＋</button></div>
      ${Store.myDms().map((d) => {
        const o = Store.profile((d.members || []).find((m) => m !== Store.me.id));
        return `<button class="dm-row ${S.target?.id === d.id ? 'active' : ''} ${S.unread[d.id] ? 'unread' : ''}" data-dm="${d.id}">
          ${avatar({ ...o, presence: presenceOf(o.id) })}<span class="chan-name">${esc(o.full_name)}</span>${badge(d.id)}
        </button>`;
      }).join('')}`;

    body.scrollTop = scroll;
    body.querySelectorAll('[data-team]').forEach((b) => b.onclick = () => {
      S.openTeams[b.dataset.team] = S.openTeams[b.dataset.team] === false; paintSidebar();
    });
    body.querySelectorAll('[data-chan]').forEach((b) => b.onclick = () => open({ kind: 'channel', id: b.dataset.chan }));
    body.querySelectorAll('[data-dm]').forEach((b) => b.onclick = () => open({ kind: 'dm', id: b.dataset.dm }));
    body.querySelectorAll('[data-newchan]').forEach((b) => b.onclick = () => newChannel(b.dataset.newchan));
    body.querySelector('[data-newdm]')?.addEventListener('click', newDm);
  }

  const presenceOf = (id) => S.online.has(id) ? 'online' : (Store.profile(id).presence === 'away' ? 'away' : 'offline');

  async function loadMessages() {
    const { rows, more } = await Store.messages(S.target);
    S.messages = rows; S.more = more;
  }

  async function loadOlder() {
    if (!S.messages.length) return;
    const stream = root.querySelector('#stream');
    const keepH = stream.scrollHeight, keepT = stream.scrollTop;
    const { rows, more } = await Store.messages(S.target, { before: S.messages[0].created_at });
    S.messages = [...rows, ...S.messages]; S.more = more;
    paintStream(false);
    // 읽던 위치가 튀지 않게 늘어난 높이만큼 스크롤을 내려 줍니다.
    stream.scrollTop = keepT + (stream.scrollHeight - keepH);
  }

  /* ================= 대화 열기 ================= */
  async function open(target) {
    if (S.target?.id === target.id && S.view === 'chat') { if (isMobile()) { S.pane = 'main'; layout(); } return; }
    S.sub?.unsubscribe(); S.typingCh?.unsubscribe(); S.readsCh?.unsubscribe();
    S.lastRead = Store.reads[target.id] || null;
    S.target = target;
    if (['search', 'admin'].includes(S.view)) S.view = 'chat';
    S.pane = 'main'; S.panel = false; S.thread = null; S.typers.clear();
    S.messages = []; S.reads = [];
    paintRail(); paintSidebar(); paintMain(); layout();

    await loadMessages();
    if (S.target?.id !== target.id) return;
    paintStream(true);
    S.reads = await Store.targetReads(target.id);
    paintStream(false);

    S.sub = Store.subscribe(target, onRemote);
    S.typingCh = Store.typingChannel(target.id, onTyping);
    S.readsCh = Store.subscribeReads(target.id, async () => {
      S.reads = await Store.targetReads(target.id);
      paintStream(false);
    });
    await markRead();
  }

  async function markRead() {
    if (!S.target) return;
    await Store.markRead(S.target.id);
    delete S.unread[S.target.id];
    paintRail(); paintSidebar();
  }

  async function onRemote() {
    const known = new Set(S.messages.map((m) => m.id));
    await loadMessages();
    const fresh = S.messages.filter((m) => !known.has(m.id) && !m.id.startsWith?.('tmp_'));
    paintStream(S.atBottom);
    for (const m of fresh) {
      if (m.user_id === Store.me.id) continue;
      notify(m);
    }
    if (S.thread) renderThread();
    if (S.atBottom && !document.hidden) markRead();
    refreshUnread();
  }

  function onTyping({ user_id, name }) {
    S.typers.set(user_id, { name, at: Date.now() });
    paintTyping();
    setTimeout(() => {
      if (Date.now() - (S.typers.get(user_id)?.at || 0) >= 2800) { S.typers.delete(user_id); paintTyping(); }
    }, 3000);
  }

  /* ================= 알림 ================= */
  function notify(m) {
    const mine = m.body?.includes('@' + Store.me.full_name) || m.body?.includes('@채널');
    if (!mine && m.importance !== 'urgent') return;
    if (!document.hidden) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const p = Store.profile(m.user_id);
    new Notification(`${p.full_name}${m.importance === 'urgent' ? ' · 긴급' : ''}`, {
      body: m.body.slice(0, 120), icon: 'assets/icon-192.png', tag: m.id,
    });
  }
  async function askNotify() {
    const st = await Push.state();
    if (st !== 'off' || store.get('pushAsked') === '1') return;
    setTimeout(() => {
      toastAction('@멘션·긴급·다이렉트 메시지를 알림으로 받을까요?', '켜기', async () => {
        store.set('pushAsked', '1');
        try { await Push.enable(); toast('알림을 켰습니다. 앱을 닫아도 옵니다.'); }
        catch (e) { toast(e.message); }
      });
    }, 5000);
  }

  /** 알림 설정 화면 */
  async function pushSettings() {
    const st = await Push.state();
    const label = {
      on: '켜져 있습니다', off: '꺼져 있습니다', denied: '브라우저에서 차단됨',
      unsupported: '이 브라우저는 지원하지 않습니다',
      'ios-install': 'iPhone은 홈 화면에 추가한 뒤 켤 수 있습니다',
      unconfigured: '관리자가 푸시 키를 설정하지 않았습니다',
    }[st];
    const can = st === 'on' || st === 'off';
    const r = await modal({
      title: '알림 설정',
      submit: st === 'on' ? '끄기' : can ? '켜기' : '닫기',
      html: `
        <p style="margin:0 0 12px">상태: <b>${esc(label)}</b></p>
        <div class="notice notice-info" style="margin:0">
          받는 알림 — 다이렉트 메시지 · @내 이름 · @채널 · 긴급 메시지.<br/>
          일반 채널 대화는 알리지 않습니다.
        </div>
        ${st === 'denied' ? '<p class="field-hint">주소창 왼쪽 자물쇠 → 알림 → 허용으로 바꾼 뒤 새로고침하세요.</p>' : ''}
        ${st === 'ios-install' ? '<p class="field-hint">사파리 공유 버튼 → 홈 화면에 추가 → 그 아이콘으로 열어 주세요.</p>' : ''}`,
    });
    if (r === null || !can) return;
    try {
      if (st === 'on') { await Push.disable(); toast('알림을 껐습니다.'); }
      else { await Push.enable(); toast('알림을 켰습니다.'); }
    } catch (e) { toast(e.message); }
  }
  function toastAction(text, label, fn) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<span>${esc(text)}</span>`;
    const b = document.createElement('button'); b.textContent = label;
    b.onclick = () => { fn(); t.remove(); };
    t.appendChild(b); wrap.appendChild(t);
    setTimeout(() => t.remove(), 9000);
  }

  async function refreshUnread() {
    S.unread = await Store.unreadMap();
    if (S.target) delete S.unread[S.target.id];
    paintRail(); paintSidebar();
  }

  /* ================= 메인 ================= */
  function paintMain() {
    const main = root.querySelector('#main');
    if (S.view === 'admin') return renderAdmin(main);
    if (S.view === 'search') return renderSearch(main);
    // 파일·작업은 채널 전용입니다. 다이렉트 메시지에서는 대화로 되돌립니다.
    if (['files', 'tasks'].includes(S.view) && S.target?.kind !== 'channel') {
      S.view = 'chat';
      if (S.target) toast('파일과 작업은 채널에서만 씁니다.');
    }
    if (!S.target) {
      main.innerHTML = `<div class="empty" style="margin:auto">
        <b>대화를 선택하세요</b><span>왼쪽에서 채널이나 사람을 고르면 여기에 열립니다.</span>
        <button class="btn btn-ghost" onclick="App.palette()">⌘K로 빠르게 찾기</button></div>`;
      return;
    }

    const t = ctx();
    const members = channelMembers(t);
    main.innerHTML = `
      <header class="topbar">
        <button class="m-back" data-back aria-label="목록으로">‹</button>
        <h1>
          ${t.kind === 'channel' ? '<span class="chan-key mono">#</span>' : avatar({ ...t.profile, presence: presenceOf(t.profile.id) })}
          <span class="chan-name">${esc(t.name)}</span>
          ${t.kind === 'channel' && t.channel.kind !== 'standard'
            ? `<span class="chan-tag ${t.channel.kind}">${t.channel.kind === 'private' ? '비공개' : '공유'}</span>` : ''}
        </h1>
        ${t.topic ? `<span class="topic">${esc(t.topic)}</span>` : ''}
        <div class="topbar-actions">
          <div class="facepile">${members.slice(0, 4).map((p) => avatar({ ...p, presence: null })).join('')}
            ${members.length > 4 ? `<div class="avatar" style="background:var(--text-3)">+${members.length - 4}</div>` : ''}</div>
          <button class="tool" data-panel title="정보" aria-label="채널 정보">ⓘ</button>
        </div>
      </header>
      ${t.kind === 'channel' ? `<div class="tabs" role="tablist">
        ${[['chat', '대화'], ['files', '파일'], ['tasks', '작업']].map(([k, l]) =>
          `<button class="tab ${S.view === k ? 'active' : ''}" data-tab="${k}" role="tab" aria-selected="${S.view === k}">${l}</button>`).join('')}
      </div>` : ''}
      <div id="pane" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>`;

    main.querySelector('[data-back]').onclick = () => { S.pane = 'sidebar'; layout(); };
    main.querySelector('[data-panel]').onclick = () => togglePanel();
    main.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { S.view = b.dataset.tab; paintRail(); paintMain(); });

    const pane = main.querySelector('#pane');
    if (S.view === 'files') renderFiles(pane);
    else if (S.view === 'tasks') renderTasks(pane);
    else renderChatShell(pane);
  }

  function ctx() {
    if (S.target.kind === 'dm') {
      const d = Store.cache.dms.find((x) => x.id === S.target.id);
      const o = Store.profile((d.members || []).find((m) => m !== Store.me.id));
      return { kind: 'dm', id: d.id, name: o.full_name, profile: o, topic: `${o.dept || ''} ${o.title || ''}`.trim(), dm: d };
    }
    const c = Store.cache.channels.find((x) => x.id === S.target.id);
    return { kind: 'channel', id: c.id, name: c.name, topic: c.topic, channel: c };
  }

  function channelMembers(t) {
    if (t.kind === 'dm') return [Store.me, t.profile];
    return t.channel.kind === 'standard'
      ? Store.cache.team_members.filter((m) => m.team_id === t.channel.team_id).map((m) => Store.profile(m.user_id))
      : Store.cache.channel_members.filter((m) => m.channel_id === t.id).map((m) => Store.profile(m.user_id));
  }

  function openThread(id) {
    S.thread = id;
    if (!S.panel) togglePanel(true);
    else { S.pane = 'panel'; renderPanel(); layout(); }
  }

  const togglePanel = (open = null) => {
    S.panel = open === null ? !S.panel : open;
    if (!S.panel) S.thread = null;
    const old = root.querySelector('#panel'); old?.remove();
    if (S.panel) {
      const p = document.createElement('aside');
      p.className = 'panel'; p.id = 'panel';
      root.querySelector('#shell').insertBefore(p, root.querySelector('#mtabs'));
      renderPanel();
      S.pane = 'panel';
    } else S.pane = 'main';
    layout();
  };

  /* ================= 대화 화면 ================= */
  function renderChatShell(pane) {
    const t = ctx();
    pane.innerHTML = `
      <div class="stream" id="stream" aria-live="polite"></div>
      <div class="typing" id="typing"></div>
      <div class="composer">
        <div class="composer-box" id="cbox">
          <div class="composer-flags">
            <button class="flag-btn" data-flag="important">중요</button>
            <button class="flag-btn" data-flag="urgent">긴급</button>
            <span class="hint">**굵게** *기울임* \`코드\` @멘션 · ↑ 로 마지막 메시지 수정</span>
          </div>
          <textarea id="input" rows="1" placeholder="${esc(t.name)}에 메시지 보내기"
            aria-label="메시지 입력"></textarea>
          <div class="pop hidden" id="pop"></div>
          <div class="composer-bar">
            <button class="tool" data-fmt="**" title="굵게 (⌘B)"><b>B</b></button>
            <button class="tool" data-fmt="*" title="기울임 (⌘I)"><i>I</i></button>
            <button class="tool" data-fmt="\`" title="코드">&lt;/&gt;</button>
            <button class="tool" id="emojiBtn" title="이모지">🙂</button>
            <button class="tool" id="attachBtn" title="파일 첨부">📎</button>
            ${t.kind === 'channel' ? '<button class="tool" id="pollBtn" title="설문 만들기">📊</button>' : ''}
            <button class="btn btn-sm composer-send" id="sendBtn">보내기</button>
          </div>
        </div>
        <input type="file" id="fileInput" class="hidden" />
      </div>`;

    const stream = pane.querySelector('#stream');
    const input = pane.querySelector('#input');
    const cbox = pane.querySelector('#cbox');
    input.value = S.drafts[t.id] || '';
    if (!isMobile()) input.focus();
    autosize(input);
    paintFlags();

    stream.onscroll = () => {
      const near = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
      if (near !== S.atBottom) { S.atBottom = near; paintJump(); }
      if (near) markRead();
    };

    let typingAt = 0;
    input.oninput = () => {
      S.drafts[t.id] = input.value;
      autosize(input);
      popCheck(input);
      if (Date.now() - typingAt > 2000) { typingAt = Date.now(); S.typingCh?.send(); }
    };
    input.onkeydown = (e) => {
      const pop = pane.querySelector('#pop');
      if (!pop.classList.contains('hidden') && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
        e.preventDefault(); return popNav(e.key, input);
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); return send(); }
      if (e.key === 'ArrowUp' && !input.value) { e.preventDefault(); return editLast(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); wrap(input, '**'); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); wrap(input, '*'); }
    };

    pane.querySelectorAll('[data-flag]').forEach((b) => b.onclick = () => {
      S.flags[t.id] = S.flags[t.id] === b.dataset.flag ? null : b.dataset.flag;
      paintFlags(); input.focus();
    });
    pane.querySelectorAll('[data-fmt]').forEach((b) => b.onclick = () => wrap(input, b.dataset.fmt));
    pane.querySelector('#emojiBtn').onclick = () => emojiPop(input);
    pane.querySelector('#sendBtn').onclick = send;
    pane.querySelector('#pollBtn')?.addEventListener('click', newPoll);
    pane.querySelector('#attachBtn').onclick = () => pane.querySelector('#fileInput').click();
    pane.querySelector('#fileInput').onchange = (e) => { if (e.target.files[0]) attach(e.target.files[0]); };

    // 스트림에 파일을 끌어다 놓기
    stream.addEventListener('dragover', (e) => { e.preventDefault(); stream.style.background = 'var(--brand-soft)'; });
    stream.addEventListener('dragleave', () => { stream.style.background = ''; });
    stream.addEventListener('drop', (e) => {
      e.preventDefault(); stream.style.background = '';
      if (e.dataTransfer.files[0]) attach(e.dataTransfer.files[0]);
    });

    function paintFlags() {
      const f = S.flags[t.id];
      pane.querySelectorAll('[data-flag]').forEach((b) => {
        b.classList.toggle('on-important', f === 'important' && b.dataset.flag === 'important');
        b.classList.toggle('on-urgent', f === 'urgent' && b.dataset.flag === 'urgent');
      });
      cbox.classList.toggle('urgent', f === 'urgent');
      cbox.classList.toggle('important', f === 'important');
    }

    async function send() {
      const body = input.value.trim();
      if (!body) return;
      const flag = S.flags[t.id] || 'normal';
      input.value = ''; S.drafts[t.id] = ''; S.flags[t.id] = null;
      autosize(input); paintFlags();

      // 낙관적 표시 — 서버 응답을 기다리지 않습니다.
      const tmp = { id: 'tmp_' + Date.now(), user_id: Store.me.id, body, importance: flag,
        created_at: new Date().toISOString(), reactions: {}, pending: true };
      S.messages.push(tmp);
      S.atBottom = true; paintStream(true);
      try {
        await Store.send(S.target, { body, importance: flag });
        await loadMessages();
        paintStream(true);
        if (flag === 'urgent') toast('긴급 메시지를 보냈습니다. 읽을 때까지 알림이 반복됩니다.');
      } catch (err) {
        tmp.failed = true; tmp.pending = false; paintStream(false);
        toastAction('보내지 못했습니다: ' + err.message, '다시 시도', () => {
          S.messages = S.messages.filter((m) => m !== tmp); input.value = body; send();
        });
      }
      await markRead();
    }

    async function attach(f) {
      const tmp = { id: 'tmp_' + Date.now(), user_id: Store.me.id, body: `파일을 올리는 중… ${f.name}`,
        importance: 'normal', created_at: new Date().toISOString(), reactions: {}, pending: true };
      S.messages.push(tmp); paintStream(true);
      try {
        if (S.target.kind === 'channel') await Store.upload(S.target.id, f);
        await Store.send(S.target, { body: `파일을 공유했습니다: ${f.name}`, file: { name: f.name, size: f.size } });
        await loadMessages(); paintStream(true);
        toast(`${f.name} 올렸습니다.`);
      } catch (err) {
        S.messages = S.messages.filter((m) => m !== tmp); paintStream(false);
        toast('올리지 못했습니다: ' + err.message);
      }
    }

    async function editLast() {
      const mine = [...S.messages].reverse().find((m) => m.user_id === Store.me.id && !m.pending);
      if (!mine) return;
      const r = await modal({ title: '메시지 수정', submit: '저장',
        fields: [{ name: 'body', label: '내용', type: 'textarea', value: mine.body, required: true }] });
      if (!r) return;
      await Store.editMessage(mine, r.body);
      await loadMessages(); paintStream(false);
    }

    paintStream(true);
  }

  const autosize = (el) => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, window.innerHeight * .4) + 'px'; };

  /* --- 스트림 --- */
  function paintStream(toBottom) {
    const stream = root.querySelector('#stream');
    if (!stream) return;
    const keep = stream.scrollTop;

    if (!S.messages.length) {
      stream.innerHTML = `<div class="empty"><b>첫 메시지를 남겨보세요</b><span>이 대화는 아직 비어 있습니다.</span></div>`;
      return;
    }

    // 내가 보낸 마지막 메시지에만 읽음 표시를 답니다. 전부 달면 지저분해집니다.
    const lastMine = [...S.messages].reverse().find((m) => m.user_id === Store.me.id && !m.pending);

    const meName = Store.me.full_name;
    let lastUser = null, lastDay = null, newShown = false;

    stream.innerHTML = S.messages.map((m) => {
      const p = Store.profile(m.user_id);
      const d = dayOf(m.created_at);
      let pre = '';
      if (d !== lastDay) { pre += `<div class="day-rule"><span>${d}</span></div>`; lastUser = null; lastDay = d; }
      if (!newShown && S.lastRead && m.created_at > S.lastRead && m.user_id !== Store.me.id) {
        pre += `<div class="new-rule">여기까지 읽었습니다</div>`; newShown = true; lastUser = null;
      }
      const compact = lastUser === m.user_id && m.importance === 'normal';
      lastUser = m.importance === 'normal' ? m.user_id : null;

      const mentioned = m.body.includes('@' + meName) || m.body.includes('@채널');
      const cls = ['msg', compact ? 'compact' : '', m.importance !== 'normal' ? `flag-${m.importance}` : '',
        mentioned && m.importance === 'normal' ? 'mentions-me' : '', m.pending ? 'pending' : ''].filter(Boolean).join(' ');

      const reactions = Object.entries(m.reactions || {}).map(([e, u]) =>
        `<button class="reaction ${u.includes(Store.me.id) ? 'mine' : ''}" data-react="${m.id}" data-emoji="${e}"
          aria-label="${e} ${u.length}명">${e} ${u.length}</button>`).join('');

      const fileCard = m.file ? `
        <button class="file-card" data-openfile="${esc(m.file.name)}">
          <span class="file-ico ${extOf(m.file.name)}">${extOf(m.file.name).toUpperCase().slice(0, 4)}</span>
          <span style="text-align:left"><span style="font-weight:600;display:block">${esc(m.file.name)}</span>
            <span class="file-meta">${size(m.file.size)} · 눌러서 열기</span></span>
        </button>` : '';

      const replies = m.reply_count > 0 ? `
        <button class="thread-link" data-thread="${m.id}">
          💬 답글 ${m.reply_count}개<span class="thread-open">스레드 열기</span>
        </button>` : '';
      const receipt = (lastMine && m.id === lastMine.id) ? readReceipt(m) : '';

      return `${pre}
        <div class="${cls}" data-msg="${m.id}">
          ${avatar(p)}
          <div class="msg-body">
            ${m.importance !== 'normal'
              ? `<div class="flag-strip">${m.importance === 'urgent' ? '긴급 · 확인할 때까지 알림 반복' : '중요'}</div>` : ''}
            ${!compact ? `<div class="msg-head"><span class="msg-name">${esc(p.full_name)}</span>
              <span class="msg-time">${timeOf(m.created_at)}</span></div>` : `<span class="msg-time">${timeOf(m.created_at)}</span>`}
            <div class="msg-text">${format(m.body, meName)}${m.edited_at ? '<span class="msg-edited">(수정됨)</span>' : ''}
              ${m.failed ? '<span class="msg-edited" style="color:var(--urgent)">보내지 못함</span>' : ''}</div>
            ${fileCard}${m.poll ? renderPoll(m) : ''}
            ${reactions ? `<div class="reactions">${reactions}</div>` : ''}
            ${replies}${receipt}
          </div>
          ${m.pending ? '' : `<div class="msg-tools">
            ${['👍', '🎉', '👀', '❤️'].map((e) => `<button data-react="${m.id}" data-emoji="${e}" title="${e}">${e}</button>`).join('')}
            <button data-thread="${m.id}" title="스레드로 답글">💬</button>
            ${m.user_id === Store.me.id || Store.me.role === 'admin' ? `<button data-del="${m.id}" title="삭제">🗑</button>` : ''}
          </div>`}
        </div>`;
    }).join('');

    if (S.more) {
      stream.insertAdjacentHTML('afterbegin',
        `<div style="text-align:center;padding:6px"><button class="btn btn-sm btn-ghost" id="olderBtn">이전 메시지 더 보기</button></div>`);
      stream.querySelector('#olderBtn').onclick = (e) => { e.target.textContent = '불러오는 중…'; loadOlder(); };
    }

    stream.scrollTop = toBottom ? stream.scrollHeight : keep;
    S.atBottom = toBottom || S.atBottom;
    paintJump();

    stream.querySelectorAll('[data-react]').forEach((b) => b.onclick = async () => {
      const m = S.messages.find((x) => x.id === b.dataset.react);
      await Store.react(m, b.dataset.emoji); paintStream(false);
    });
    stream.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!(await confirmDialog('이 메시지를 삭제할까요?'))) return;
      await Store.deleteMessage(S.messages.find((x) => x.id === b.dataset.del));
      await loadMessages(); paintStream(false); toast('삭제했습니다.');
    });
    stream.querySelectorAll('[data-vote]').forEach((b) => b.onclick = async () => {
      const m = S.messages.find((x) => x.id === b.dataset.vote);
      await Store.vote(m, b.dataset.opt); paintStream(false);
    });
    stream.querySelectorAll('[data-thread]').forEach((b) => b.onclick = () => openThread(b.dataset.thread));
    stream.querySelectorAll('[data-readers]').forEach((b) => b.onclick = () =>
      showReaders(S.messages.find((x) => x.id === b.dataset.readers)));
    stream.querySelectorAll('[data-openfile]').forEach((b) => b.onclick = async () => {
      if (S.target.kind !== 'channel') return toast('다이렉트 메시지의 파일은 아직 편집기로 열 수 없습니다.');
      const f = (await Store.files(S.target.id)).find((x) => x.name === b.dataset.openfile);
      if (!f) return toast('채널 보관함에서 찾지 못했습니다.');
      Docs.open(f);
    });
  }

  /** 내 메시지 아래에 붙는 읽음 표시 */
  function readReceipt(m) {
    if (m.user_id !== Store.me.id || m.pending) return '';
    const readers = S.reads.filter((r) => r.user_id !== Store.me.id && r.read_at >= m.created_at);
    const others = channelMembers(ctx()).filter((p) => p.id !== Store.me.id).length;
    if (S.target.kind === 'dm') {
      return `<div class="receipt ${readers.length ? 'seen' : ''}">${readers.length ? '읽음' : '전송됨'}</div>`;
    }
    if (!readers.length) return `<div class="receipt">아직 아무도 안 읽음</div>`;
    return `<button class="receipt seen" data-readers="${m.id}">읽음 ${readers.length}/${others}</button>`;
  }

  function showReaders(m) {
    const readers = S.reads.filter((r) => r.user_id !== Store.me.id && r.read_at >= m.created_at);
    const ids = new Set(readers.map((r) => r.user_id));
    const all = channelMembers(ctx()).filter((p) => p.id !== Store.me.id);
    modal({ title: '읽음', submit: '닫기', html: `
      <div class="side-label" style="padding-left:0">읽음 ${ids.size}</div>
      ${all.filter((p) => ids.has(p.id)).map((p) => `<div class="ver-row">${avatar(p)}<span>${esc(p.full_name)}</span>
        <span class="file-meta" style="margin-left:auto">${timeOf(readers.find((r) => r.user_id === p.id).read_at)}</span></div>`).join('') || '<p class="file-meta">없음</p>'}
      <div class="side-label" style="padding-left:0">안 읽음 ${all.length - ids.size}</div>
      ${all.filter((p) => !ids.has(p.id)).map((p) => `<div class="ver-row">${avatar(p)}<span>${esc(p.full_name)}</span></div>`).join('') || '<p class="file-meta">없음</p>'}` });
  }

  function paintJump() {
    root.querySelector('.jump-latest')?.remove();
    if (S.atBottom || S.view !== 'chat') return;
    const b = document.createElement('button');
    b.className = 'jump-latest'; b.textContent = '↓ 최근 메시지로';
    b.onclick = () => { S.atBottom = true; paintStream(true); markRead(); };
    root.querySelector('#main')?.appendChild(b);
  }

  function paintTyping() {
    const el = root.querySelector('#typing');
    if (!el) return;
    const names = [...S.typers.values()].map((t) => t.name);
    el.innerHTML = names.length
      ? `<i></i><i></i><i></i><span>${esc(names.slice(0, 2).join(', '))}${names.length > 2 ? ` 외 ${names.length - 2}명` : ''} 입력 중</span>`
      : '';
  }

  function renderPoll(m) {
    const total = Object.values(m.poll.votes).reduce((a, v) => a + v.length, 0) || 1;
    return `<div class="poll">
      <h5>📊 ${esc(m.poll.question)}</h5>
      ${m.poll.options.map((o) => {
        const v = m.poll.votes[o] || [];
        return `<button class="poll-opt ${v.includes(Store.me.id) ? 'mine' : ''}" data-vote="${m.id}" data-opt="${esc(o)}">
          <div class="poll-fill" style="width:${(v.length / total) * 100}%"></div>
          <span>${esc(o)}</span><span class="poll-count">${v.length}</span></button>`;
      }).join('')}
      <div class="file-meta">${Object.values(m.poll.votes).reduce((a, v) => a + v.length, 0)}표 · 누가 골랐는지 보입니다</div>
    </div>`;
  }

  function wrap(input, mark) {
    const [a, b] = [input.selectionStart, input.selectionEnd];
    const v = input.value;
    input.value = v.slice(0, a) + mark + v.slice(a, b) + mark + v.slice(b);
    S.drafts[S.target.id] = input.value;
    input.focus(); input.setSelectionRange(a + mark.length, b + mark.length);
  }

  /* --- 팝오버: 멘션 / 이모지 --- */
  let popIdx = 0, popList = [], popMode = null;
  function popCheck(input) {
    const pop = root.querySelector('#pop');
    const before = input.value.slice(0, input.selectionStart);
    const m = before.match(/@([가-힣A-Za-z]*)$/);
    if (!m) { pop.classList.add('hidden'); popMode = null; return; }
    popMode = 'mention'; popIdx = 0;
    const q = m[1];
    const people = Store.cache.profiles.filter((p) => p.status === 'active' && p.full_name.includes(q));
    popList = [{ id: '@채널', full_name: '채널', color: 'var(--text-3)', hint: '이 채널 전체에 알림' }, ...people];
    if (!popList.length) { pop.classList.add('hidden'); return; }
    pop.className = 'pop';
    pop.innerHTML = popList.map((p, i) => `
      <button data-mi="${i}" class="${i === 0 ? 'sel' : ''}">
        ${avatar(p)}<span><b>${esc(p.full_name)}</b> <span style="color:var(--text-3)">${esc(p.hint || p.dept || '')}</span></span>
      </button>`).join('');
    pop.querySelectorAll('[data-mi]').forEach((b) => b.onclick = () => popPick(+b.dataset.mi, input));
  }
  function popNav(key, input) {
    const pop = root.querySelector('#pop');
    if (key === 'Escape') return pop.classList.add('hidden');
    if (key === 'ArrowDown') popIdx = (popIdx + 1) % popList.length;
    else if (key === 'ArrowUp') popIdx = (popIdx - 1 + popList.length) % popList.length;
    else return popPick(popIdx, input);
    pop.querySelectorAll('button').forEach((b, i) => b.classList.toggle('sel', i === popIdx));
    pop.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }
  function popPick(i, input) {
    if (popMode !== 'mention') return;
    input.value = input.value.replace(/@([가-힣A-Za-z]*)$/, `@${popList[i].full_name} `);
    S.drafts[S.target.id] = input.value;
    root.querySelector('#pop').classList.add('hidden');
    input.focus();
  }
  function emojiPop(input) {
    const pop = root.querySelector('#pop');
    if (popMode === 'emoji') { pop.classList.add('hidden'); popMode = null; return; }
    popMode = 'emoji';
    const set = ['😀','😂','🙂','😉','😍','🤔','😴','😅','👍','👏','🙏','🔥','✅','❌','🎉','💡','🚀','📌','📊','⏰','☕','🍚','💪','👀','❤️','😭','🤝','📝','🐛','🎯','🥳','🙇'];
    pop.className = 'pop pop-emoji';
    pop.innerHTML = set.map((e) => `<button data-e="${e}">${e}</button>`).join('');
    pop.querySelectorAll('[data-e]').forEach((b) => b.onclick = () => {
      input.value += b.dataset.e; S.drafts[S.target.id] = input.value;
      pop.classList.add('hidden'); popMode = null; input.focus();
    });
  }

  /* ================= 파일 ================= */
  async function renderFiles(pane) {
    pane.innerHTML = `<div class="view"><div class="skel" style="height:20px;width:120px;margin-bottom:16px"></div>
      <div class="skel" style="height:160px"></div></div>`;
    const rows = await Store.files(S.target.id);
    pane.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div><h2>파일</h2><p>Word·Excel·PowerPoint를 브라우저에서 여러 명이 동시에 편집합니다. 저장할 때마다 버전이 쌓입니다.</p></div>
          <div class="new-doc">
            <button class="btn btn-ghost" data-new="word"><span class="file-ico docx">W</span>Word</button>
            <button class="btn btn-ghost" data-new="cell"><span class="file-ico xlsx">X</span>Excel</button>
            <button class="btn btn-ghost" data-new="slide"><span class="file-ico pptx">P</span>PPT</button>
            <button class="btn" data-up>올리기</button>
          </div>
        </div>
        <div class="card" style="padding:0;overflow-x:auto">
          ${rows.length ? `<table>
            <thead><tr><th>이름</th><th>버전</th><th>크기</th><th>마지막 편집</th><th>날짜</th><th></th></tr></thead>
            <tbody>${rows.map((f) => {
              const ext = extOf(f.name);
              return `<tr>
                <td><button style="display:flex;gap:8px;align-items:center;text-align:left" data-open="${f.id}">
                  <span class="file-ico ${ext}">${ext.toUpperCase().slice(0, 4)}</span><b>${esc(f.name)}</b></button></td>
                <td><button class="badge" data-ver="${f.id}" title="버전 이력 보기">v${f.version}</button></td>
                <td class="mono">${size(f.size || 0)}</td>
                <td>${esc(Store.profile(f.updated_by || f.user_id).full_name)}</td>
                <td class="mono" style="color:var(--text-3)">${new Date(f.updated_at || f.created_at).toLocaleDateString('ko-KR')}</td>
                <td style="white-space:nowrap">
                  ${OFFICE.has(ext) ? `<button class="btn btn-sm" data-open="${f.id}">편집</button>` : ''}
                  ${f.provider === 'google' ? `<button class="btn btn-sm btn-ghost" data-resync="${f.id}" title="새로 합류한 사람에게 편집 권한을 다시 나눠줍니다">권한 나누기</button>` : ''}
                  <button class="btn btn-sm btn-ghost" data-dl="${f.id}">내려받기</button></td>
              </tr>`;
            }).join('')}</tbody></table>`
          : `<div class="empty"><b>아직 문서가 없습니다</b>
              <span>Word나 Excel 문서를 새로 만들면 그 즉시 팀원과 같이 편집할 수 있습니다.</span></div>`}
        </div>
        <input type="file" id="fu" class="hidden" />
      </div>`;

    pane.querySelector('[data-up]').onclick = () => pane.querySelector('#fu').click();
    pane.querySelector('#fu').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const r = await Store.upload(S.target.id, f); toast(`${f.name} 올림 (v${r.version})`); renderFiles(pane); }
      catch (err) { toast('올리지 못했습니다: ' + err.message); }
    };
    pane.querySelectorAll('[data-new]').forEach((b) => b.onclick = async () => {
      const kind = b.dataset.new;
      const label = { word: 'Word 문서', cell: 'Excel 통합 문서', slide: 'PowerPoint' }[kind];
      const r = await modal({ title: `${label} 만들기`, submit: '만들고 열기',
        fields: [{ name: 'name', label: '문서 이름', placeholder: '예: 3분기 예산안', required: true }] });
      if (!r) return;
      try {
        const f = await Docs.create(S.target.id, kind, r.name);
        await Store.send(S.target, { body: `${label}를 만들었습니다: ${f.name}`, file: { name: f.name, size: f.size || 0 } });
        renderFiles(pane);
        Docs.open(f, () => renderFiles(pane));
      } catch (err) { toast('만들지 못했습니다: ' + err.message); }
    });
    pane.querySelectorAll('[data-open]').forEach((b) => b.onclick = () =>
      Docs.open(rows.find((x) => x.id === b.dataset.open), () => renderFiles(pane)));
    pane.querySelectorAll('[data-dl]').forEach((b) => b.onclick = async () => {
      const f = rows.find((x) => x.id === b.dataset.dl);
      if (f.provider === 'google') { window.open(GDocs.exportUrl(f), '_blank', 'noopener'); return; }
      const url = await Store.fileUrl(f);
      url ? window.open(url, '_blank') : toast('데모 모드에서는 실제 파일을 내려받을 수 없습니다.');
    });
    pane.querySelectorAll('[data-resync]').forEach((b) => b.onclick = async () => {
      try {
        const f = rows.find((x) => x.id === b.dataset.resync);
        const r = await GDocs.resync(f);
        toast(r.total ? `${r.shared}/${r.total}명에게 권한을 나눠줬습니다.` : '이미 구글 계정을 연동한 채널 멤버가 없습니다.');
      } catch (err) { toast('권한을 나누지 못했습니다: ' + err.message); }
    });
    pane.querySelectorAll('[data-ver]').forEach((b) => b.onclick = async () => {
      const f = rows.find((x) => x.id === b.dataset.ver);
      const vs = await Store.fileVersions(f.id);
      await modal({ title: `${f.name} 버전 이력`, submit: '닫기', html: vs.map((v) => `
        <div class="ver-row"><b class="mono">v${v.version}</b><span>${esc(Store.profile(v.user_id).full_name)}</span>
          <span class="file-meta">${size(v.size || 0)}</span>
          <span class="file-meta" style="margin-left:auto">${new Date(v.created_at).toLocaleString('ko-KR')}</span></div>`).join('')
        || '<p style="margin:0">이력이 없습니다.</p>' });
    });
  }

  /* ================= 작업 ================= */
  async function renderTasks(pane) {
    const rows = await Store.tasks(S.target.id);
    const cols = [['todo', '할 일'], ['doing', '진행 중'], ['done', '완료']];
    const today = new Date().toISOString().slice(0, 10);
    pane.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div><h2>작업</h2><p>카드를 끌어다 옮기거나 화살표로 옮깁니다.</p></div>
          <button class="btn" data-newtask>작업 추가</button>
        </div>
        <div class="board">
          ${cols.map(([k, l]) => `
            <div class="board-col" data-col="${k}">
              <h4>${l} · ${rows.filter((t) => t.state === k).length}</h4>
              ${rows.filter((t) => t.state === k).map((t) => {
                const late = t.state !== 'done' && t.due && t.due < today;
                return `<div class="task ${k === 'done' ? 'done' : ''}" draggable="true" data-task="${t.id}">
                  <div class="task-title">${esc(t.title)}</div>
                  <div class="task-meta">
                    ${avatar(Store.profile(t.assignee))}
                    <span class="mono" style="${late ? 'color:var(--urgent);font-weight:700' : ''}">
                      ${t.due || '기한 없음'}${late ? ' · 지남' : ''}</span>
                    <span style="margin-left:auto;display:flex;gap:2px">
                      ${k !== 'todo' ? `<button class="btn-quiet btn-sm" data-move="${t.id}" data-to="${k === 'done' ? 'doing' : 'todo'}" aria-label="왼쪽으로">←</button>` : ''}
                      ${k !== 'done' ? `<button class="btn-quiet btn-sm" data-move="${t.id}" data-to="${k === 'todo' ? 'doing' : 'done'}" aria-label="오른쪽으로">→</button>` : ''}
                    </span></div></div>`;
              }).join('') || '<div class="file-meta" style="padding:6px">비어 있음</div>'}
            </div>`).join('')}
        </div>
      </div>`;

    pane.querySelector('[data-newtask]').onclick = async () => {
      const members = Store.cache.profiles.filter((p) => p.status === 'active');
      const r = await modal({ title: '작업 추가', submit: '추가', fields: [
        { name: 'title', label: '무엇을 해야 하나요?', required: true },
        { name: 'assignee', label: '담당자', type: 'select', options: members.map((m) => ({ value: m.id, label: m.full_name })) },
        { name: 'due', label: '기한', type: 'date' },
      ] });
      if (!r) return;
      await Store.addTask({ channel_id: S.target.id, title: r.title, assignee: r.assignee, due: r.due || null, state: 'todo' });
      renderTasks(pane); toast('작업을 추가했습니다.');
    };
    pane.querySelectorAll('[data-move]').forEach((b) => b.onclick = async () => {
      await Store.moveTask(rows.find((t) => t.id === b.dataset.move), b.dataset.to); renderTasks(pane);
    });

    let dragId = null;
    pane.querySelectorAll('[data-task]').forEach((el) => {
      el.ondragstart = () => { dragId = el.dataset.task; el.classList.add('dragging'); };
      el.ondragend = () => el.classList.remove('dragging');
    });
    pane.querySelectorAll('[data-col]').forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
      col.ondragleave = () => col.classList.remove('drop');
      col.ondrop = async () => {
        col.classList.remove('drop');
        const t = rows.find((x) => x.id === dragId);
        if (t && t.state !== col.dataset.col) { await Store.moveTask(t, col.dataset.col); renderTasks(pane); }
      };
    });
  }

  /* ================= 검색 ================= */
  async function renderSearch(main) {
    main.innerHTML = `
      <header class="topbar">
        <button class="m-back" data-back aria-label="목록으로">‹</button>
        <h1>검색</h1>
      </header>
      <div class="view">
        <label class="field" style="max-width:420px"><span>무엇을 찾으시나요?</span>
          <input id="sq" value="${esc(S.query)}" placeholder="메시지 · 파일 · 사람" autocomplete="off" /></label>
        <div id="sr"></div>
      </div>`;
    main.querySelector('[data-back]').onclick = () => { S.pane = 'sidebar'; layout(); };
    const q = main.querySelector('#sq');
    q.focus(); q.setSelectionRange(q.value.length, q.value.length);
    let t;
    q.oninput = () => { S.query = q.value; clearTimeout(t); t = setTimeout(run, 220); };
    run();

    async function run() {
      const box = main.querySelector('#sr');
      if (!S.query.trim()) { box.innerHTML = `<div class="empty"><b>검색어를 입력하세요</b><span>대화·파일·구성원을 한 번에 찾습니다.</span></div>`; return; }
      box.innerHTML = `<div class="skel" style="height:60px;margin-bottom:8px"></div><div class="skel" style="height:60px"></div>`;
      const r = await Store.search(S.query);
      const hl = (s) => esc(s).replace(new RegExp(`(${S.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
      box.innerHTML = `
        <p class="file-meta" style="margin:0 0 12px">메시지 ${r.messages.length} · 파일 ${r.files.length} · 사람 ${r.people.length}</p>
        ${!r.messages.length && !r.files.length && !r.people.length
          ? `<div class="empty"><b>결과가 없습니다</b><span>다른 단어로 다시 찾아보세요.</span></div>` : ''}
        ${r.people.length ? `<div class="grid grid-3" style="margin-bottom:20px">${r.people.map((p) => `
          <div class="card" style="display:flex;gap:10px;align-items:center">${avatar({ ...p, presence: presenceOf(p.id) }, 'lg')}
            <div><b>${hl(p.full_name)}</b><div class="file-meta">${esc(p.dept || '')} ${esc(p.title || '')}</div></div></div>`).join('')}</div>` : ''}
        ${r.messages.map((m) => {
          const c = Store.cache.channels.find((x) => x.id === m.channel_id);
          return `<button class="search-hit" data-goto="${m.channel_id || ''}" data-dm="${m.dm_id || ''}">
            <div class="file-meta">${c ? '#' + esc(c.name) : '다이렉트 메시지'} · ${esc(Store.profile(m.user_id).full_name)}
              · ${new Date(m.created_at).toLocaleString('ko-KR')}</div><div>${hl(m.body)}</div></button>`;
        }).join('')}
        ${r.files.map((f) => `<button class="search-hit" data-goto="${f.channel_id}">
          <div style="display:flex;gap:8px;align-items:center">
            <span class="file-ico ${extOf(f.name)}">${extOf(f.name).toUpperCase().slice(0, 4)}</span>
            <span>${hl(f.name)}</span><span class="file-meta" style="margin-left:auto">v${f.version} · ${size(f.size || 0)}</span>
          </div></button>`).join('')}`;
      box.querySelectorAll('[data-goto]').forEach((b) => b.onclick = () => {
        S.view = 'chat';
        if (b.dataset.dm) open({ kind: 'dm', id: b.dataset.dm });
        else if (b.dataset.goto) open({ kind: 'channel', id: b.dataset.goto });
      });
    }
  }

  /* ================= 정보 패널 ================= */
  async function renderPanel() {
    const panel = root.querySelector('#panel');
    if (!panel) return;
    if (S.thread) return renderThread();
    const t = ctx();
    if (t.kind === 'dm') {
      const p = t.profile;
      panel.innerHTML = `
        <div class="panel-head"><h3>프로필</h3><button class="btn-quiet" data-close aria-label="닫기">✕</button></div>
        <div class="panel-body" style="text-align:center">
          ${avatar({ ...p, presence: presenceOf(p.id) }, 'xl')}
          <h3 style="margin:12px 0 2px">${esc(p.full_name)}</h3>
          <div class="file-meta">${esc(p.dept || '')} · ${esc(p.title || '')}</div>
          <div class="file-meta">${esc(p.email)}</div>
          <div style="margin-top:10px"><span class="badge ${presenceOf(p.id) === 'online' ? 'ok' : ''}">
            ${presenceOf(p.id) === 'online' ? '접속 중' : '오프라인'}</span></div>
        </div>`;
    } else {
      const members = channelMembers(t);
      panel.innerHTML = `
        <div class="panel-head"><h3>채널 정보</h3><button class="btn-quiet" data-close aria-label="닫기">✕</button></div>
        <div class="panel-body">
          <b>#${esc(t.name)}</b>
          <p style="color:var(--text-2);margin:4px 0 16px;font-size:var(--t-sm)">${esc(t.topic || '주제가 없습니다.')}</p>
          <div class="side-label" style="padding-left:0">멤버 ${members.length}</div>
          ${members.map((p) => `<div class="dm-row">${avatar({ ...p, presence: presenceOf(p.id) })}
            <div><div>${esc(p.full_name)}</div><div class="file-meta">${esc(p.dept || '')}</div></div></div>`).join('')}
          ${Store.me.role === 'admin' && t.channel.kind !== 'standard'
            ? '<button class="btn btn-sm btn-ghost" style="margin-top:12px" data-addmem>멤버 추가</button>' : ''}
        </div>`;
      panel.querySelector('[data-addmem]')?.addEventListener('click', async () => {
        const inCh = Store.cache.channel_members.filter((m) => m.channel_id === t.id).map((m) => m.user_id);
        const cand = Store.cache.profiles.filter((p) => p.status === 'active' && !inCh.includes(p.id));
        if (!cand.length) return toast('추가할 사람이 없습니다.');
        const r = await modal({ title: '채널 멤버 추가', submit: '추가',
          fields: [{ name: 'user', label: '누구를 추가할까요?', type: 'select', options: cand.map((p) => ({ value: p.id, label: p.full_name })) }] });
        if (!r) return;
        Store.cache.channel_members.push({ channel_id: t.id, user_id: r.user });
        if (Store.mode === 'supabase') await Store.sb.from('channel_members').insert({ channel_id: t.id, user_id: r.user });
        toast('멤버를 추가했습니다.'); renderPanel(); paintMain();
      });
    }
    panel.querySelector('[data-close]').onclick = () => togglePanel(false);
  }

  /* ================= 스레드 ================= */
  async function renderThread() {
    const panel = root.querySelector('#panel');
    if (!panel || !S.thread) return;
    const id = S.thread;
    const parent = S.messages.find((m) => m.id === id) || await Store.message(id);
    if (!parent) { S.thread = null; return renderPanel(); }
    const replies = await Store.thread(id);
    if (S.thread !== id) return;

    const meName = Store.me.full_name;
    const line = (m, root_ = false) => {
      const p = Store.profile(m.user_id);
      return `<div class="msg ${root_ ? 'thread-root' : ''} ${m.pending ? 'pending' : ''}" data-tmsg="${m.id}">
        ${avatar(p)}
        <div class="msg-body">
          <div class="msg-head"><span class="msg-name">${esc(p.full_name)}</span>
            <span class="msg-time">${timeOf(m.created_at)}</span></div>
          <div class="msg-text">${format(m.body, meName)}${m.edited_at ? '<span class="msg-edited">(수정됨)</span>' : ''}</div>
          ${Object.entries(m.reactions || {}).length ? `<div class="reactions">${Object.entries(m.reactions).map(([e, u]) =>
            `<button class="reaction ${u.includes(Store.me.id) ? 'mine' : ''}" data-treact="${m.id}" data-emoji="${e}">${e} ${u.length}</button>`).join('')}</div>` : ''}
        </div></div>`;
    };

    panel.innerHTML = `
      <div class="panel-head">
        <h3>스레드</h3>
        <button class="btn-quiet" data-close aria-label="닫기">✕</button>
      </div>
      <div class="panel-body" id="tbody" style="padding-bottom:4px">
        ${line(parent, true)}
        <div class="thread-count">답글 ${replies.length}개</div>
        ${replies.map((m) => line(m)).join('')}
      </div>
      <div class="composer" style="padding:8px 12px 12px">
        <div class="composer-box">
          <textarea id="tinput" rows="1" placeholder="스레드에 답글 쓰기" aria-label="답글 입력"></textarea>
          <div class="composer-bar">
            <label class="hint" style="display:flex;align-items:center;gap:5px;cursor:pointer">
              <input type="checkbox" id="alsoSend" style="width:auto" /> 채널에도 보내기</label>
            <button class="btn btn-sm composer-send" id="treply">답글</button>
          </div>
        </div>
      </div>`;

    const body = panel.querySelector('#tbody');
    body.scrollTop = body.scrollHeight;
    const input = panel.querySelector('#tinput');
    if (!isMobile()) input.focus();
    input.oninput = () => autosize(input);
    input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); reply(); } };
    panel.querySelector('#treply').onclick = reply;
    panel.querySelector('[data-close]').onclick = () => { S.thread = null; togglePanel(false); };
    panel.querySelectorAll('[data-treact]').forEach((b) => b.onclick = async () => {
      const m = replies.find((x) => x.id === b.dataset.treact) || parent;
      await Store.react(m, b.dataset.emoji); renderThread();
    });

    async function reply() {
      const body_ = input.value.trim(); if (!body_) return;
      const also = panel.querySelector('#alsoSend').checked;
      input.value = ''; autosize(input);
      try {
        await Store.send(S.target, { body: body_, parent_id: id });
        if (also) await Store.send(S.target, { body: body_ });
        await loadMessages(); paintStream(S.atBottom);
        await renderThread();
      } catch (err) { toast('답글을 보내지 못했습니다: ' + err.message); }
    }
  }

  /* ================= 관리자 ================= */
  async function renderAdmin(main) {
    if (Store.me.role !== 'admin') {
      main.innerHTML = `<div class="empty" style="margin:auto"><b>권한이 없습니다</b><span>관리자만 볼 수 있는 화면입니다.</span></div>`;
      return;
    }
    main.innerHTML = `
      <header class="topbar">
        <button class="m-back" data-back aria-label="목록으로">‹</button>
        <h1>관리자 모드</h1>
        <span class="topic">${Store.mode === 'demo' ? '데모 모드 · 변경은 저장되지 않습니다' : 'Supabase 연결됨'}</span>
      </header>
      <div class="tabs" role="tablist">
        ${[['users', '사용자'], ['teams', '팀·채널'], ['announce', '공지']].map(([k, l]) =>
          `<button class="tab ${S.adminTab === k ? 'active' : ''}" data-atab="${k}" role="tab">${l}</button>`).join('')}
      </div>
      <div class="view">
        <div class="grid grid-4" style="margin-bottom:18px" id="stats">
          ${Array(4).fill('<div class="card"><div class="skel" style="height:44px"></div></div>').join('')}
        </div>
        <div id="atab"></div>
      </div>`;
    main.querySelector('[data-back]').onclick = () => { S.pane = 'sidebar'; layout(); };
    main.querySelectorAll('[data-atab]').forEach((b) => b.onclick = () => { S.adminTab = b.dataset.atab; renderAdmin(main); });

    Store.admin.stats().then((st) => {
      const el = main.querySelector('#stats');
      if (el) el.innerHTML = [['사용자', st.users], ['승인 대기', st.pending],
        ['팀 / 채널', `${st.teams} / ${st.channels}`], ['긴급 메시지', st.urgent]]
        .map(([l, v]) => `<div class="card stat"><b>${v}</b><span>${l}</span></div>`).join('');
    });

    const box = main.querySelector('#atab');
    if (S.adminTab === 'users') adminUsers(box, main);
    else if (S.adminTab === 'teams') adminTeams(box, main);
    else adminAnnounce(box);
  }

  function adminUsers(box, main) {
    const L = { active: ['ok', '사용 중'], pending: ['wait', '승인 대기'], suspended: ['off', '중지'] };
    const rows = [...Store.cache.profiles].sort((a, b) =>
      (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0));
    box.innerHTML = `
      <div class="view-head"><div><h2>사용자</h2><p>가입 승인, 권한 변경, 사용 중지를 처리합니다.</p></div></div>
      <div class="card" style="padding:0;overflow-x:auto">
        <table><thead><tr><th>이름</th><th>이메일</th><th>부서</th><th>권한</th><th>상태</th><th>관리</th></tr></thead>
        <tbody>${rows.map((p) => `<tr>
          <td><div style="display:flex;gap:8px;align-items:center">${avatar({ ...p, presence: presenceOf(p.id) })}${esc(p.full_name)}</div></td>
          <td class="mono" style="font-size:var(--t-cap)">${esc(p.email)}</td>
          <td>${esc(p.dept || '-')}</td>
          <td><span class="badge ${p.role === 'admin' ? 'admin' : ''}">${p.role === 'admin' ? '관리자' : p.role === 'guest' ? '게스트' : '구성원'}</span></td>
          <td><span class="badge ${L[p.status][0]}">${L[p.status][1]}</span></td>
          <td style="white-space:nowrap">
            ${p.status === 'pending' ? `<button class="btn btn-sm" data-approve="${p.id}">승인</button>` : ''}
            ${p.status === 'active' && p.id !== Store.me.id ? `<button class="btn btn-sm btn-ghost" data-role="${p.id}">${p.role === 'admin' ? '관리자 해제' : '관리자 지정'}</button>` : ''}
            ${p.status === 'active' && p.id !== Store.me.id ? `<button class="btn btn-sm btn-danger" data-susp="${p.id}">중지</button>` : ''}
            ${p.status === 'suspended' ? `<button class="btn btn-sm btn-ghost" data-approve="${p.id}">복구</button>` : ''}
          </td></tr>`).join('')}</tbody></table>
      </div>`;
    box.querySelectorAll('[data-approve]').forEach((b) => b.onclick = async () => {
      await Store.admin.setStatus(b.dataset.approve, 'active'); toast('사용을 허용했습니다.'); renderAdmin(main);
    });
    box.querySelectorAll('[data-susp]').forEach((b) => b.onclick = async () => {
      if (!(await confirmDialog('이 계정의 사용을 중지할까요? 로그인할 수 없게 됩니다.'))) return;
      await Store.admin.setStatus(b.dataset.susp, 'suspended'); toast('계정을 중지했습니다.'); renderAdmin(main);
    });
    box.querySelectorAll('[data-role]').forEach((b) => b.onclick = async () => {
      const p = Store.profile(b.dataset.role);
      await Store.admin.setRole(p.id, p.role === 'admin' ? 'member' : 'admin');
      toast('권한을 바꿨습니다.'); renderAdmin(main);
    });
  }

  function adminTeams(box, main) {
    box.innerHTML = `
      <div class="view-head">
        <div><h2>팀 · 채널</h2><p>부서나 프로젝트 단위로 작업 공간을 만듭니다.</p></div>
        <button class="btn btn-ghost" data-nt>팀 만들기</button>
      </div>
      <div class="grid grid-2">
        ${Store.cache.teams.map((t) => {
          const chans = Store.cache.channels.filter((c) => c.team_id === t.id);
          const mem = Store.cache.team_members.filter((m) => m.team_id === t.id);
          return `<div class="card">
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
              <span class="team-chip" style="background:${t.color}">${esc(t.key || '')}</span>
              <b>${esc(t.name)}</b><span class="badge" style="margin-left:auto">멤버 ${mem.length}</span></div>
            <div class="file-meta" style="margin-bottom:10px">${esc(t.description || '')}</div>
            ${chans.map((c) => `<div class="chan" style="padding-left:8px">
              <span class="chan-key">#</span><span>${esc(c.name)}</span>
              ${c.kind !== 'standard' ? `<span class="chan-tag ${c.kind}">${c.kind === 'private' ? '비공개' : '공유'}</span>` : ''}
            </div>`).join('')}
            <div style="display:flex;gap:6px;margin-top:10px">
              <button class="btn btn-sm btn-ghost" data-nc="${t.id}">채널 추가</button>
              <button class="btn btn-sm btn-ghost" data-nm="${t.id}">멤버 초대</button></div>
          </div>`;
        }).join('')}
      </div>`;
    box.querySelector('[data-nt]').onclick = newTeam;
    box.querySelectorAll('[data-nc]').forEach((b) => b.onclick = () => newChannel(b.dataset.nc));
    box.querySelectorAll('[data-nm]').forEach((b) => b.onclick = async () => {
      const id = b.dataset.nm;
      const inTeam = Store.cache.team_members.filter((m) => m.team_id === id).map((m) => m.user_id);
      const cand = Store.cache.profiles.filter((p) => p.status === 'active' && !inTeam.includes(p.id));
      if (!cand.length) return toast('초대할 사람이 없습니다.');
      const r = await modal({ title: '팀에 초대', submit: '초대',
        fields: [{ name: 'user', label: '누구를 초대할까요?', type: 'select', options: cand.map((p) => ({ value: p.id, label: `${p.full_name} · ${p.dept || ''}` })) }] });
      if (!r) return;
      await Store.admin.addTeamMember(id, r.user); toast('초대했습니다.'); renderAdmin(main); paintSidebar();
    });
  }

  async function adminAnnounce(box) {
    const list = await Store.admin.announcements();
    box.innerHTML = `
      <div class="view-head"><div><h2>공지</h2><p>모든 구성원에게 보이는 알림입니다.</p></div>
        <button class="btn" data-na>공지 작성</button></div>
      ${list.map((a) => `<div class="card" style="margin-bottom:10px">
        <b>${esc(a.title)}</b><div class="file-meta">${new Date(a.created_at).toLocaleString('ko-KR')}</div>
        <p style="margin:8px 0 0">${esc(a.body)}</p></div>`).join('')
        || '<div class="empty"><b>공지가 없습니다</b><span>전사에 알릴 내용을 작성해 보세요.</span></div>'}`;
    box.querySelector('[data-na]').onclick = async () => {
      const r = await modal({ title: '공지 작성', submit: '올리기',
        fields: [{ name: 'title', label: '제목', required: true }, { name: 'body', label: '내용', type: 'textarea', required: true }] });
      if (!r) return;
      await Store.admin.announce(r); toast('공지를 올렸습니다.'); adminAnnounce(box);
    };
  }

  /* ================= 명령 팔레트 ================= */
  function openPalette() {
    if (document.querySelector('.palette-back')) return;
    const back = document.createElement('div');
    back.className = 'palette-back';
    back.innerHTML = `
      <div class="palette" role="dialog" aria-modal="true" aria-label="빠른 이동">
        <div class="palette-input">${icons.search}
          <input id="pq" placeholder="채널 · 사람 · 명령 찾기" autocomplete="off" aria-label="검색어" /></div>
        <div class="palette-list" id="plist"></div>
        <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 이동</span><span><kbd>↵</kbd> 열기</span>
          <span><kbd>esc</kbd> 닫기</span><span style="margin-left:auto"><kbd>⌘K</kbd> 언제든 열기</span></div>
      </div>`;
    document.body.appendChild(back);
    const input = back.querySelector('#pq');
    const list = back.querySelector('#plist');
    let items = [], idx = 0;

    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    back.onclick = (e) => { if (e.target === back) close(); };

    function build(q) {
      const s = q.trim().toLowerCase();
      const hit = (t) => !s || t.toLowerCase().includes(s);
      const out = [];

      Store.myTeams().forEach((t) => Store.visibleChannels(t.id).forEach((c) => {
        if (hit(c.name) || hit(t.name)) out.push({ g: '채널', icon: '<span class="chan-key mono">#</span>',
          title: c.name, sub: t.name, run: () => { S.view = 'chat'; open({ kind: 'channel', id: c.id }); } });
      }));
      Store.myDms().forEach((d) => {
        const o = Store.profile((d.members || []).find((m) => m !== Store.me.id));
        if (hit(o.full_name)) out.push({ g: '대화', icon: avatar({ ...o, presence: presenceOf(o.id) }),
          title: o.full_name, sub: o.dept || '', run: () => { S.view = 'chat'; open({ kind: 'dm', id: d.id }); } });
      });
      Store.cache.profiles.filter((p) => p.status === 'active' && p.id !== Store.me.id).forEach((p) => {
        if (hit(p.full_name) || hit(p.dept || '')) out.push({ g: '구성원', icon: avatar({ ...p, presence: presenceOf(p.id) }),
          title: p.full_name, sub: `${p.dept || ''} ${p.title || ''}`.trim(), run: () => startDm(p.id) });
      });

      const acts = [
        { t: '어두운 화면 전환', k: '⌘⇧L', run: toggleTheme },
        { t: '전체 검색 열기', k: '', run: () => { S.query = q; go('search'); } },
        { t: '알림 설정', k: '', run: pushSettings },
        { t: '단축키 보기', k: '?', run: showShortcuts },
        ...(Store.me.role === 'admin' ? [{ t: '팀 만들기', k: '', run: newTeam }, { t: '관리자 모드', k: '', run: () => go('admin') }] : []),
      ];
      acts.forEach((a) => { if (hit(a.t)) out.push({ g: '명령', icon: '⌘', title: a.t, sub: '', key: a.k, run: a.run }); });

      return out.slice(0, 30);
    }

    function paint() {
      const q = input.value;
      items = build(q);
      idx = Math.min(idx, Math.max(items.length - 1, 0));
      if (!items.length) { list.innerHTML = `<div class="empty" style="padding:32px"><b>결과가 없습니다</b></div>`; return; }
      const hl = (s) => q.trim() ? esc(s).replace(new RegExp(`(${q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>') : esc(s);
      let g = null;
      list.innerHTML = items.map((it, i) => {
        const head = it.g !== g ? `<div class="palette-group">${it.g}</div>` : ''; g = it.g;
        return `${head}<button class="palette-item ${i === idx ? 'sel' : ''}" data-i="${i}">
          ${it.icon}<span class="p-title">${hl(it.title)}</span>
          ${it.sub ? `<span class="p-sub">${esc(it.sub)}</span>` : ''}
          ${it.key ? `<kbd class="p-key">${it.key}</kbd>` : ''}</button>`;
      }).join('');
      list.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { const r = items[+b.dataset.i].run; close(); r(); });
      list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); return close(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % items.length; paint(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; paint(); }
      if (e.key === 'Enter' && items[idx]) { e.preventDefault(); const r = items[idx].run; close(); r(); }
    }
    input.oninput = () => { idx = 0; paint(); };
    document.addEventListener('keydown', onKey);
    paint(); input.focus();
  }

  function showShortcuts() {
    const rows = [['⌘K', '어디든 빠르게 이동'], ['↵', '메시지 보내기'], ['⇧↵', '줄 바꾸기'],
      ['↑', '마지막 메시지 수정 (입력창이 비었을 때)'], ['⌘B / ⌘I', '굵게 / 기울임'],
      ['⌘⇧L', '밝기 전환'], ['Esc', '창 닫기'], ['?', '이 도움말']];
    modal({ title: '키보드 단축키', submit: '닫기',
      html: rows.map(([k, d]) => `<div class="ver-row"><kbd>${k}</kbd><span>${d}</span></div>`).join('') });
  }

  /* ================= 공용 동작 ================= */
  async function newTeam() {
    const r = await modal({ title: '팀 만들기', submit: '만들기', fields: [
      { name: 'name', label: '팀 이름', placeholder: '예: 마케팅 본부', required: true },
      { name: 'key', label: '약칭 (2~3자)', placeholder: '예: MKT', required: true },
      { name: 'description', label: '무엇을 하는 팀인가요?', type: 'textarea' },
    ] });
    if (!r) return;
    await Store.admin.createTeam(r); toast(`${r.name} 팀을 만들었습니다.`); paintSidebar();
  }

  async function newChannel(teamId) {
    const r = await modal({ title: '채널 추가', submit: '추가', fields: [
      { name: 'name', label: '채널 이름', placeholder: '예: 릴리스', required: true },
      { name: 'topic', label: '주제', placeholder: '이 채널에서 무엇을 다루나요?' },
      { name: 'kind', label: '공개 범위', type: 'select', options: [
        { value: 'standard', label: '표준 — 팀원 모두 참여' },
        { value: 'private', label: '비공개 — 초대한 사람만' },
        { value: 'shared', label: '공유 — 외부 협력사 포함' },
      ] },
    ] });
    if (!r) return;
    const c = await Store.admin.createChannel({ team_id: teamId, ...r });
    toast(`#${r.name} 채널을 만들었습니다.`);
    S.openTeams[teamId] = true; S.view = 'chat';
    open({ kind: 'channel', id: c.id });
  }

  async function startDm(userId) {
    let d = Store.cache.dms.find((x) => (x.members || []).includes(userId) && x.members.includes(Store.me.id));
    if (!d) {
      d = { id: Math.random().toString(36).slice(2, 10), members: [Store.me.id, userId] };
      if (Store.mode === 'supabase') {
        const { data } = await Store.sb.from('dms').insert({ members: [Store.me.id, userId] }).select().single();
        d = data;
      }
      Store.cache.dms.push(d);
    }
    S.view = 'chat'; open({ kind: 'dm', id: d.id });
  }

  async function newDm() {
    const others = Store.cache.profiles.filter((p) => p.id !== Store.me.id && p.status === 'active');
    const r = await modal({ title: '새 대화', submit: '시작',
      fields: [{ name: 'user', label: '누구와 이야기할까요?', type: 'select', options: others.map((p) => ({ value: p.id, label: `${p.full_name} · ${p.dept || ''}` })) }] });
    if (r) startDm(r.user);
  }

  async function newPoll() {
    const r = await modal({ title: '설문 만들기', submit: '올리기', fields: [
      { name: 'question', label: '무엇을 물어볼까요?', required: true },
      { name: 'options', label: '보기 (쉼표로 구분)', placeholder: '예: 월요일, 화요일, 수요일', required: true },
    ] });
    if (!r) return;
    const opts = r.options.split(',').map((s) => s.trim()).filter(Boolean);
    if (opts.length < 2) return toast('보기를 두 개 이상 적어주세요.');
    const votes = {}; opts.forEach((o) => (votes[o] = []));
    await Store.send(S.target, { body: `설문을 올렸습니다: ${r.question}`, poll: { question: r.question, options: opts, votes } });
    await loadMessages(); paintStream(true);
  }

  async function showMeMenu() {
    const p = Store.me;
    const gEnabled = GAuth.enabled();
    const r = await modal({ title: '내 프로필', submit: '로그아웃', html: `
      <div style="text-align:center">
        ${avatar({ ...p, presence: 'online' }, 'xl')}
        <h3 style="margin:12px 0 2px">${esc(p.full_name)}</h3>
        <div class="file-meta">${esc(p.dept || '')} · ${esc(p.title || '')}</div>
        <div class="file-meta">${esc(p.email)}</div>
        <div style="margin-top:12px;display:flex;gap:6px;justify-content:center">
          <span class="badge ${p.role === 'admin' ? 'admin' : ''}">${p.role === 'admin' ? '관리자' : '구성원'}</span>
          <span class="badge ok">접속 중</span></div>
        ${gEnabled ? `
        <div class="card" style="margin-top:16px;padding:10px;text-align:left">
          <b style="font-size:13px">문서 편집용 구글 계정</b>
          <div class="file-meta" style="margin-top:2px">
            ${p.google_email ? `연동됨: ${esc(p.google_email)}` : '아직 연동되지 않았습니다. Word·Excel·PPT를 열려면 연동이 필요합니다.'}</div>
          <div style="margin-top:8px;display:flex;gap:6px">
            <button class="btn btn-sm" onclick="App.gconnect()">${p.google_email ? '다시 연동' : '구글 계정 연동'}</button>
            ${p.google_email ? `<button class="btn btn-sm btn-ghost" onclick="App.gunlink()">연동 해제</button>` : ''}
          </div>
        </div>` : ''}
        <div style="margin-top:16px;display:flex;gap:6px;justify-content:center">
          <button class="btn btn-sm btn-ghost" onclick="App.push()">알림 설정</button>
          <button class="btn btn-sm btn-ghost" onclick="App.theme()">밝기 전환</button>
          <button class="btn btn-sm btn-ghost" onclick="App.shortcuts()">단축키</button></div>
      </div>` });
    if (r !== null) { await Store.signOut(); renderAuth('signin', { kind: 'ok', text: '로그아웃했습니다.' }); }
  }

  async function connectGoogle() {
    try { const email = await GAuth.connect(); toast(`구글 계정을 연동했습니다: ${email}`); }
    catch (err) { toast('연동하지 못했습니다: ' + err.message); }
    finally { showMeMenu(); }
  }

  async function unlinkGoogle() {
    try { await GAuth.unlink(); toast('구글 계정 연동을 해제했습니다.'); }
    catch (err) { toast('해제하지 못했습니다: ' + err.message); }
    finally { showMeMenu(); }
  }

  /* ================= 전역 단축키 ================= */
  document.addEventListener('keydown', (e) => {
    if (!Store.me) return;
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return openPalette(); }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); return toggleTheme(); }
    if (e.key === '?' && !typing) { e.preventDefault(); return showShortcuts(); }
  });
  window.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshUnread(); if (S.atBottom) markRead(); } });

  /* ================= 알림 클릭 → 해당 대화로 ================= */
  function handleDeepLink(params) {
    const th = params.get('thread');
    if (th) setTimeout(() => openThread(th), 300);
    if (params.get('go') || th) history.replaceState({}, '', location.pathname);
  }

  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type !== 'navigate' || !e.data.url) return;
    const params = new URL(e.data.url, location.origin).searchParams;
    const id = params.get('go');
    if (!id) return;
    const t = Store.cache.channels.some((c) => c.id === id) ? { kind: 'channel', id }
      : Store.cache.dms.some((d) => d.id === id) ? { kind: 'dm', id } : null;
    if (t) { S.view = 'chat'; open(t).then(() => handleDeepLink(params)); }
  });

  /* ================= 부팅 ================= */
  async function boot() {
    root.className = 'app-loading';
    root.textContent = '불러오는 중…';
    try {
      const me = await Store.loadMe();
      if (!me) return renderAuth('signin');
      await Store.loadWorkspace();
      await Store.loadReads();

      mount();
      paintSidebar();

      const params = new URL(location.href).searchParams;
      const first = Store.myTeams()[0];
      const chans = first ? Store.visibleChannels(first.id) : [];
      const wanted = params.get('go');
      const target = wanted
        ? (Store.cache.channels.some((c) => c.id === wanted) ? { kind: 'channel', id: wanted }
          : Store.cache.dms.some((d) => d.id === wanted) ? { kind: 'dm', id: wanted } : null)
        : null;
      if (target) await open(target);
      else if (chans[0]) await open({ kind: 'channel', id: chans[0].id });
      else paintMain();

      Store.joinPresence((set) => { S.online = set; paintSidebar(); if (S.panel) renderPanel(); });
      refreshUnread();
      setInterval(refreshUnread, 30000);
      Push.resume();
      askNotify();
      handleDeepLink(new URL(location.href).searchParams);
    } catch (err) {
      renderAuth('signin', { kind: 'err', text: err.message });
    }
  }

  if (Store.mode === 'supabase') {
    Store.sb.auth.onAuthStateChange((e) => { if (e === 'SIGNED_OUT') renderAuth('signin'); });
  }
  boot();

  return {
    boot, palette: openPalette, theme: toggleTheme, shortcuts: showShortcuts, push: pushSettings,
    gconnect: connectGoogle, gunlink: unlinkGoogle,
  };
})();
