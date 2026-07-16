/* ==========================================================================
   UI 헬퍼 — 문자열 템플릿 렌더링, 메시지 서식, 토스트, 모달
   ========================================================================== */

const UI = (() => {
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* 메시지 서식: **굵게** *기울임* ~~취소선~~ `코드` @멘션 링크 */
  function format(body, meName) {
    let t = esc(body);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');
    t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    t = t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/@([가-힣A-Za-z0-9_.]+)/g, (m, name) => {
      const mine = meName && (name === meName || name === '채널' || name === '전체');
      return `<span class="mention${mine ? ' me' : ''}">@${name}</span>`;
    });
    return t;
  }

  const timeOf = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  function dayOf(iso) {
    const d = new Date(iso), t = new Date();
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, t)) return '오늘';
    const y = new Date(t.getTime() - 86400000);
    if (same(d, y)) return '어제';
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  }
  const size = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
  const initials = (n = '?') => /[가-힣]/.test(n) ? n.slice(-2) : n.slice(0, 2).toUpperCase();

  const avatar = (p, cls = '') => `
    <div class="avatar ${cls}" style="background:${p.color || '#8A94A3'}">${esc(initials(p.full_name))}
      ${p.presence ? `<i class="presence-dot ${p.presence}"></i>` : ''}
    </div>`;

  const icons = {
    chat: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z"/></svg>',
    teams: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.2"/><path d="M3 19a6 6 0 0 1 12 0M15 19h6a4 4 0 0 0-4-4"/></svg>',
    files: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></svg>',
    tasks: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    admin: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
  };

  function toast(msg) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    wrap.appendChild(t); setTimeout(() => t.remove(), 2600);
  }

  /* 모달: fields 배열로 간단한 폼을 만들고 값을 Promise로 반환 */
  function modal({ title, fields = [], submit = '저장', html = null }) {
    return new Promise((resolve) => {
      const opener = document.activeElement;
      const back = document.createElement('div');
      back.className = 'modal-back';
      back.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-head"><h3>${esc(title)}</h3><button class="btn-quiet" data-x>✕</button></div>
          <div class="modal-body">
            ${html || fields.map((f) => `
              <label class="field">
                <span>${esc(f.label)}</span>
                ${f.type === 'select'
                  ? `<select name="${f.name}">${f.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`
                  : f.type === 'textarea'
                  ? `<textarea name="${f.name}" rows="3" placeholder="${esc(f.placeholder || '')}"></textarea>`
                  : `<input name="${f.name}" type="${f.type || 'text'}" placeholder="${esc(f.placeholder || '')}" value="${esc(f.value || '')}" />`}
              </label>`).join('')}
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" data-x>취소</button>
            <button class="btn" data-ok>${esc(submit)}</button>
          </div>
        </div>`;
      const close = (v) => {
        back.remove();
        document.removeEventListener('keydown', onKey);
        opener?.focus?.();
        resolve(v);
      };
      const ok = () => {
        const out = {};
        back.querySelectorAll('[name]').forEach((i) => (out[i.name] = i.value.trim()));
        const miss = fields.find((f) => f.required && !out[f.name]);
        if (miss) {
          toast(`${miss.label}을(를) 채워주세요.`);
          back.querySelector(`[name="${miss.name}"]`)?.focus();
          return;
        }
        close(out);
      };
      back.addEventListener('click', (e) => {
        if (e.target === back || e.target.closest('[data-x]')) return close(null);
        if (e.target.closest('[data-ok]')) ok();
      });

      /* 포커스가 모달 밖으로 새지 않게 잡아 둡니다. */
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); return close(null); }
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !e.isComposing) { e.preventDefault(); return ok(); }
        if (e.key !== 'Tab') return;
        const f = [...back.querySelectorAll('button, input, select, textarea, [href]')].filter((el) => !el.disabled);
        if (!f.length) return;
        const [first, last] = [f[0], f[f.length - 1]];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      (back.querySelector('input, textarea, select') || back.querySelector('[data-ok]'))?.focus();
    });
  }

  async function confirmDialog(text) {
    const r = await modal({ title: '확인', html: `<p style="margin:0">${esc(text)}</p>`, submit: '진행' });
    return r !== null;
  }

  return { esc, format, timeOf, dayOf, size, initials, avatar, icons, toast, modal, confirmDialog };
})();
