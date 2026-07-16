/* ==========================================================================
   GAuth — 회사 계정(TeamHub) 에 구글 계정을 "연동"하는 모듈
   ---------------------------------------------------------------------------
   ONLYOFFICE 문서 서버(별도 VM, 월 비용)를 쓰지 않고도 실시간 공동편집을 하려고
   구글이 이미 무료로 제공하는 Docs/Sheets/Slides 편집기를 그대로 빌려 씁니다.

   구조가 완전히 서버리스인 이유:
   - Google Identity Services(GIS)의 "토큰 클라이언트"로 브라우저에서 바로
     접근 토큰(access token)만 받습니다. refresh token은 아예 받지도, 어디에도
     저장하지도 않습니다. 세션이 끝나면 다시 로그인 창(또는 조용한 재발급)만
     거치면 됩니다.
   - 문서 저장·실시간 동시편집은 전부 구글 서버가 처리합니다. TeamHub는
     "누구 문서인지, 어느 채널 것인지"만 Supabase에 기록합니다.
   - 따라서 Netlify Functions나 VM이 하나도 더 필요 없습니다.

   scope는 drive.file 하나만 씁니다. 이 scope는 "이 앱이 만들거나 사용자가
   이 앱으로 연 파일"에만 접근할 수 있어, 사용자의 드라이브 전체를 보지 못합니다.
   (구글의 '민감/제한 scope' 심사 대상이 아닙니다.)
   ========================================================================== */

const GAuth = (() => {
  const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ');

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiry = 0;
  let gisLoaded = null;

  function clientId() {
    return window.TEAMHUB_CONFIG?.GOOGLE_CLIENT_ID || '';
  }

  function enabled() {
    return !!clientId();
  }

  function loadGis() {
    if (gisLoaded) return gisLoaded;
    gisLoaded = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = resolve;
      s.onerror = () => reject(new Error('구글 로그인 스크립트를 불러오지 못했습니다. 네트워크를 확인해주세요.'));
      document.head.appendChild(s);
    });
    return gisLoaded;
  }

  function ensureClient() {
    if (tokenClient) return tokenClient;
    if (!enabled()) throw new Error('config.js에 GOOGLE_CLIENT_ID가 설정되지 않았습니다.');
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPES,
      hosted_domain: window.TEAMHUB_CONFIG?.GOOGLE_HOSTED_DOMAIN || undefined,
      callback: () => {}, // requestToken 호출마다 아래에서 덮어씁니다.
    });
    return tokenClient;
  }

  /**
   * 접근 토큰을 반환합니다.
   * interactive=false 이면 팝업 없이 조용한 재발급을 시도하고(이미 동의한 세션이면
   * 성공), 실패하면 예외를 던집니다 — 이 경우 호출부에서 connect()로 안내하세요.
   */
  function getToken({ interactive = false } = {}) {
    if (accessToken && Date.now() < tokenExpiry - 60000) return Promise.resolve(accessToken);
    return loadGis().then(() => new Promise((resolve, reject) => {
      const client = ensureClient();
      client.callback = (resp) => {
        if (resp.error) {
          reject(new Error(resp.error === 'access_denied' ? '구글 인증이 거부되었습니다.' : `구글 인증 오류: ${resp.error}`));
          return;
        }
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
        resolve(accessToken);
      };
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    }));
  }

  async function fetchEmail(token) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('구글 계정 이메일을 확인하지 못했습니다.');
    const j = await res.json();
    return j.email;
  }

  /** 최초 연동: 동의 창을 띄우고, 확인된 이메일을 내 프로필(google_email)에 저장합니다. */
  async function connect() {
    const token = await getToken({ interactive: true });
    const email = await fetchEmail(token);
    if (Store.mode === 'supabase') {
      const { error } = await Store.sb.from('profiles').update({ google_email: email }).eq('id', Store.me.id);
      if (error) throw error;
    }
    Store.me.google_email = email;
    const cached = Store.cache.profiles?.find((p) => p.id === Store.me.id);
    if (cached) cached.google_email = email;
    return email;
  }

  /** 이 브라우저 세션의 접근 토큰만 무효화합니다. 연동 자체(google_email)는 남습니다. */
  function disconnect() {
    if (accessToken && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null;
    tokenExpiry = 0;
  }

  /** 연동을 완전히 해제합니다(google_email 제거 포함). */
  async function unlink() {
    disconnect();
    if (Store.mode === 'supabase') {
      const { error } = await Store.sb.from('profiles').update({ google_email: null }).eq('id', Store.me.id);
      if (error) throw error;
    }
    Store.me.google_email = null;
    const cached = Store.cache.profiles?.find((p) => p.id === Store.me.id);
    if (cached) cached.google_email = null;
  }

  return {
    enabled,
    getToken,
    connect,
    disconnect,
    unlink,
    get email() { return Store.me?.google_email || null; },
  };
})();
