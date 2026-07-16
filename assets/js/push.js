/* ==========================================================================
   Push — 웹 푸시 구독 관리
   iOS는 홈 화면에 추가한 뒤에만 푸시가 옵니다(16.4+). 안드로이드·데스크톱은 바로 됩니다.
   ========================================================================== */

const Push = (() => {
  const cfg = window.TEAMHUB_CONFIG;

  const supported = () =>
    'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';

  /** iOS는 설치(홈 화면 추가) 전에는 푸시를 막습니다. */
  const iosNeedsInstall = () => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    return ios && !installed;
  };

  const b64ToU8 = (s) => {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  };

  async function state() {
    if (!supported()) return 'unsupported';
    if (iosNeedsInstall()) return 'ios-install';
    if (!cfg.VAPID_PUBLIC_KEY) return 'unconfigured';
    if (Notification.permission === 'denied') return 'denied';
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  }

  /** 구독하고 서버에 저장합니다. 사용자가 직접 누른 순간에만 호출하세요. */
  async function enable() {
    if (!supported()) throw new Error('이 브라우저는 푸시 알림을 지원하지 않습니다.');
    if (iosNeedsInstall()) throw new Error('iPhone은 공유 → 홈 화면에 추가한 뒤에 알림을 켤 수 있습니다.');
    if (!cfg.VAPID_PUBLIC_KEY) throw new Error('푸시 키가 설정되지 않았습니다. 관리자에게 문의하세요.');

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('알림 권한이 거부됐습니다. 브라우저 설정에서 허용해 주세요.');

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToU8(cfg.VAPID_PUBLIC_KEY),
    });
    await Store.savePushSubscription(sub.toJSON());
    return true;
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await Store.deletePushSubscription(sub.endpoint);
    await sub.unsubscribe();
  }

  /** 로그인 직후: 이미 허용한 사람은 구독을 조용히 되살립니다. */
  async function resume() {
    try {
      if ((await state()) !== 'off') return;
      if (Notification.permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToU8(cfg.VAPID_PUBLIC_KEY),
      });
      await Store.savePushSubscription(sub.toJSON());
    } catch { /* 조용히 넘어갑니다 */ }
  }

  return { supported, state, enable, disable, resume, iosNeedsInstall };
})();
