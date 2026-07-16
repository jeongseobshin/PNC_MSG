/* ==========================================================================
   GDocs — 구글 문서로 실시간 공동편집 (ONLYOFFICE 없이, 완전 무료)
   ---------------------------------------------------------------------------
   Docs.create/Docs.open과 같은 모양의 함수를 제공해서 docs.js가 그대로
   라우팅만 하면 되게 만들었습니다. 실제로 하는 일:

   1) create()  — Drive API로 빈 구글 문서/스프레드시트/프레젠테이션을 만들고
                  (진짜 구글 네이티브 파일이라 자체 실시간 동시편집을 지원합니다)
                  현재 채널 멤버 중 구글 계정을 연동한 사람에게 편집 권한을 나눠주고,
                  files 테이블에 한 행 남깁니다(provider='google').
   2) open()    — 새 탭에서 구글 편집 화면을 엽니다. 커서·댓글·기록까지 전부
                  구글 쪽 UI 그대로입니다. TeamHub는 "링크만" 쥐고 있습니다.
   3) resync()  — 나중에 채널에 합류한 사람, 또는 뒤늦게 구글 계정을 연동한
                  사람에게 권한을 다시 나눠줍니다. 이미 접근 권한이 있는
                  사람만 이 버튼을 눌러 효과가 있습니다(구글 정책상 당연합니다).

   한계(정직하게):
   - 새로 채널에 들어온 사람은 자동으로 권한이 생기지 않습니다. 파일을 이미
     열 수 있는 사람이 "권한 다시 나누기"를 눌러줘야 합니다.
   - 회사가 Google Workspace가 아니라 각자 개인 Gmail을 쓰면, 사람 수만큼
     이메일 공유가 필요합니다(도메인 단위 공유를 못 씀).
   - 문서가 구글 서버에 있으므로 사내 문서를 구글에 두는 것에 대한 내부 방침을
     먼저 확인하세요.
   ========================================================================== */

const GDocs = (() => {
  const MIME = {
    word: 'application/vnd.google-apps.document',
    cell: 'application/vnd.google-apps.spreadsheet',
    slide: 'application/vnd.google-apps.presentation',
  };
  const EXT = { word: 'docx', cell: 'xlsx', slide: 'pptx' };
  const PATH = {
    'application/vnd.google-apps.document': 'document',
    'application/vnd.google-apps.spreadsheet': 'spreadsheets',
    'application/vnd.google-apps.presentation': 'presentation',
  };
  const EXPORT_FMT = {
    'application/vnd.google-apps.document': 'docx',
    'application/vnd.google-apps.spreadsheet': 'xlsx',
    'application/vnd.google-apps.presentation': 'pptx',
  };

  function pathOf(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    return { docx: 'document', xlsx: 'spreadsheets', pptx: 'presentation' }[ext] || 'document';
  }

  function editUrl(file) {
    return `https://docs.google.com/${pathOf(file)}/d/${file.google_file_id}/edit`;
  }

  function exportUrl(file) {
    const fmt = { document: 'docx', spreadsheets: 'xlsx', presentation: 'pptx' }[pathOf(file)];
    return `https://docs.google.com/${pathOf(file)}/d/${file.google_file_id}/export?format=${fmt}`;
  }

  async function drive(method, path, { token, body, query } = {}) {
    const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
    Object.entries(query || {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error?.message || `구글 드라이브 요청 실패 (${res.status})`);
    }
    return res.status === 204 ? null : res.json();
  }

  /** 채널을 볼 수 있는 사람들 중 구글 계정을 연동한 이의 이메일 목록 */
  function channelGoogleEmails(channelId) {
    const ch = Store.cache.channels.find((c) => c.id === channelId);
    const memberIds = ch?.kind === 'standard'
      ? Store.cache.team_members.filter((m) => m.team_id === ch.team_id).map((m) => m.user_id)
      : Store.cache.channel_members.filter((m) => m.channel_id === channelId).map((m) => m.user_id);
    return [...new Set(memberIds)]
      .map((id) => Store.profile(id))
      .filter((p) => p?.google_email && p.google_email !== GAuth.email);
  }

  /** 지금 이 파일에 이미 접근 권한이 있는 사람의 토큰으로, 아직 못 받은 사람에게 권한을 나눠줍니다. */
  async function shareWithChannel(channelId, googleFileId, token) {
    const people = channelGoogleEmails(channelId);
    let shared = 0, failed = 0;
    for (const p of people) {
      try {
        await drive('POST', `files/${googleFileId}/permissions`, {
          token,
          query: { sendNotificationEmail: 'false' },
          body: { role: 'writer', type: 'user', emailAddress: p.google_email },
        });
        shared++;
      } catch { failed++; }
    }
    return { shared, failed, total: people.length };
  }

  /** 빈 구글 문서/스프레드시트/프레젠테이션을 만들어 채널에 등록합니다. */
  async function create(channelId, kind, name) {
    if (!GAuth.enabled()) throw new Error('구글 연동이 설정되어 있지 않습니다(config.js의 GOOGLE_CLIENT_ID).');
    if (!GAuth.email) throw new Error('먼저 프로필에서 구글 계정을 연동해주세요.');

    const token = await GAuth.getToken();
    const mimeType = MIME[kind];
    const ext = EXT[kind];
    const fileName = name.endsWith('.' + ext) ? name : `${name}.${ext}`;

    const created = await drive('POST', 'files', { token, body: { name: fileName, mimeType } });
    await shareWithChannel(channelId, created.id, token);

    const row = {
      channel_id: channelId,
      name: fileName,
      size: 0,
      version: 1,
      user_id: Store.me.id,
      updated_by: Store.me.id,
      provider: 'google',
      google_file_id: created.id,
      google_url: `https://docs.google.com/${PATH[mimeType]}/d/${created.id}/edit`,
    };

    if (Store.mode !== 'supabase') return { id: Math.random().toString(36).slice(2, 10), ...row };
    const { data, error } = await Store.sb.from('files').insert(row).select().single();
    if (error) throw error;
    return data;
  }

  /** PC에서 올린(Storage에 있는) Word/Excel/PPT 파일을 구글 문서로 "가져와" 편집 가능하게 만듭니다.
      원본 내용을 그대로 구글 형식으로 변환한 새 구글 파일을 만들고, files 행을 그 파일을
      가리키도록 갱신합니다(provider: storage → google). 그 다음부터는 새로 만든 문서와
      똑같이 새 탭에서 바로 열립니다. */
  async function importFromStorage(file) {
    if (!GAuth.enabled()) throw new Error('구글 연동이 설정되어 있지 않습니다(config.js의 GOOGLE_CLIENT_ID).');
    if (!GAuth.email) throw new Error('먼저 프로필에서 구글 계정을 연동해주세요.');

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const mimeType = { docx: MIME.word, xlsx: MIME.cell, pptx: MIME.slide }[ext];
    if (!mimeType) throw new Error('Word(.docx)·Excel(.xlsx)·PowerPoint(.pptx) 파일만 구글 문서로 열 수 있습니다.');

    const url = await Store.fileUrl(file);
    if (!url) throw new Error('원본 파일을 불러오지 못했습니다.');
    const blob = await (await fetch(url)).blob();

    const token = await GAuth.getToken();
    const boundary = 'teamhub-' + Math.random().toString(36).slice(2);
    const metaPart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify({ name: file.name, mimeType })}\r\n--${boundary}\r\n` +
      `Content-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`;
    const multipartBody = new Blob([metaPart, blob, `\r\n--${boundary}--`]);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipartBody,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error?.message || '구글 문서로 바꾸지 못했습니다.');
    }
    const created = await res.json();
    await shareWithChannel(file.channel_id, created.id, token);

    const update = {
      provider: 'google',
      google_file_id: created.id,
      google_url: `https://docs.google.com/${PATH[mimeType]}/d/${created.id}/edit`,
      updated_by: Store.me.id,
      updated_at: new Date().toISOString(),
    };
    if (Store.mode !== 'supabase') return { ...file, ...update };
    const { data, error } = await Store.sb.from('files').update(update).eq('id', file.id).select().single();
    if (error) throw error;
    return data;
  }

  /** 새 탭에서 구글 편집 화면을 엽니다. */
  async function open(file, onClosed) {
    if (!GAuth.email) {
      UI.toast('이 문서는 구글 문서입니다. 먼저 프로필에서 구글 계정을 연동해주세요.');
      onClosed?.();
      return;
    }
    window.open(editUrl(file), '_blank', 'noopener');
    onClosed?.();
  }

  /** 새로 합류한 멤버·뒤늦게 연동한 멤버에게 권한을 다시 나눠줍니다. */
  async function resync(file) {
    const token = await GAuth.getToken();
    return shareWithChannel(file.channel_id, file.google_file_id, token);
  }

  /** 구글 드라이브의 실제 파일도 휴지통으로 보냅니다(최선 노력).
      호출한 사람에게 그 파일 편집 권한이 없으면 조용히 실패하고, TeamHub 쪽
      기록(참조)은 store.js의 deleteFile()이 어차피 지웁니다. */
  async function trash(file) {
    try {
      const token = await GAuth.getToken();
      await drive('PATCH', `files/${file.google_file_id}`, { token, body: { trashed: true } });
      return true;
    } catch {
      return false;
    }
  }

  return { create, open, resync, trash, importFromStorage, editUrl, exportUrl, MIME, EXT };
})();
