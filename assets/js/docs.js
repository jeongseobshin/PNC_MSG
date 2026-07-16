/* ==========================================================================
   Docs — ONLYOFFICE 에디터 열기
   문서 서버 스크립트를 불러와 전체화면 오버레이 안에 에디터를 띄웁니다.
   설정과 서명은 서버(/api/docs-token)가 만들고, 여기서는 표시만 합니다.
   ========================================================================== */

const Docs = (() => {
  let apiLoaded = null;

  function loadApi(server) {
    if (apiLoaded) return apiLoaded;
    apiLoaded = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${server.replace(/\/$/, '')}/web-apps/apps/api/documents/api.js`;
      s.onload = resolve;
      s.onerror = () => reject(new Error('문서 서버에 연결하지 못했습니다.'));
      document.head.appendChild(s);
    });
    return apiLoaded;
  }

  /** 파일 하나를 편집 창으로 엽니다. onClosed는 닫힐 때 호출됩니다. */
  async function open(file, onClosed) {
    if (Store.mode === 'demo') {
      UI.toast('데모 모드에서는 문서 편집기를 열 수 없습니다. Supabase와 문서 서버 연결이 필요합니다.');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'doc-overlay';
    overlay.innerHTML = `
      <div class="doc-bar">
        <span class="doc-title">${UI.esc(file.name)}</span>
        <span class="doc-state" id="docState">여는 중…</span>
        <button class="btn btn-sm btn-ghost" data-close>닫기</button>
      </div>
      <div class="doc-frame"><div id="docHost"></div></div>`;
    document.body.appendChild(overlay);

    const state = overlay.querySelector('#docState');
    const close = () => { overlay.remove(); onClosed?.(); };
    overlay.querySelector('[data-close]').onclick = close;

    try {
      const { data: { session } } = await Store.sb.auth.getSession();
      const res = await fetch('/api/docs-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileId: file.id, accessToken: session.access_token }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || '설정을 받지 못했습니다.');

      await loadApi(out.documentServer);
      state.textContent = out.readOnly ? '읽기 전용' : '동시 편집 가능 · 자동 저장';

      new DocsAPI.DocEditor('docHost', {
        ...out.config,
        width: '100%',
        height: '100%',
        events: {
          onDocumentStateChange: (e) => { state.textContent = e.data ? '저장 중…' : '모든 변경 사항 저장됨'; },
          onRequestClose: close,
          onError: (e) => { state.textContent = '오류: ' + (e?.data?.errorDescription || '알 수 없음'); },
        },
      });
    } catch (err) {
      overlay.querySelector('.doc-frame').innerHTML =
        `<div class="empty"><b>문서를 열지 못했습니다</b><span>${UI.esc(err.message)}</span></div>`;
      state.textContent = '';
    }
  }

  /** 빈 Word/Excel/PowerPoint 문서를 만들어 채널에 올립니다. */
  async function create(channelId, kind, name) {
    const ext = { word: 'docx', cell: 'xlsx', slide: 'pptx' }[kind];
    const blank = await (await fetch(`assets/templates/blank.${ext}`)).blob();
    const fileName = name.endsWith('.' + ext) ? name : `${name}.${ext}`;
    const f = new File([blank], fileName, { type: blank.type });
    return Store.upload(channelId, f);
  }

  return { open, create };
})();
