/* ===========================================================================
   /api/push-send — 새 메시지가 생기면 DB 트리거(notify_push)가 여기를 부릅니다.

   보내는 기준 (조용함이 기본, 시끄러움은 예외)
   - 다이렉트 메시지: 상대에게
   - @이름 멘션: 지목된 사람에게
   - @채널: 그 채널 사람 모두에게
   - 긴급 메시지: 그 채널 사람 모두에게
   그 외 일반 채널 메시지는 푸시하지 않습니다.
   =========================================================================== */

import webpush from 'web-push';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  PUSH_SECRET,
  PUBLIC_URL,
} = process.env;

const admin = { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
const get = async (path) => (await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: admin })).json();
const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json(503, { error: 'VAPID 키가 설정되지 않았습니다.' });
  if (!PUSH_SECRET || req.headers.get('x-push-secret') !== PUSH_SECRET) return json(401, { error: 'unauthorized' });

  webpush.setVapidDetails(VAPID_SUBJECT || `mailto:admin@example.com`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  try {
    const { message_id } = await req.json();
    const [m] = await get(`messages?id=eq.${message_id}&select=*`);
    if (!m) return json(200, { skipped: 'no message' });

    /* 1. 받을 사람 추리기 */
    let audience = [];
    let title, channelName = '';

    if (m.dm_id) {
      const [dm] = await get(`dms?id=eq.${m.dm_id}&select=members`);
      audience = (dm?.members || []).filter((u) => u !== m.user_id);
    } else {
      const [ch] = await get(`channels?id=eq.${m.channel_id}&select=id,name,kind,team_id`);
      if (!ch) return json(200, { skipped: 'no channel' });
      channelName = ch.name;

      const members = ch.kind === 'standard'
        ? (await get(`team_members?team_id=eq.${ch.team_id}&select=user_id`)).map((r) => r.user_id)
        : (await get(`channel_members?channel_id=eq.${ch.id}&select=user_id`)).map((r) => r.user_id);

      if (m.mention_all || m.importance === 'urgent') audience = members;
      else audience = (m.mentions || []).filter((u) => members.includes(u));
      audience = audience.filter((u) => u !== m.user_id);
    }
    if (!audience.length) return json(200, { skipped: 'no audience' });

    /* 2. 보낸 사람 이름 */
    const [sender] = await get(`profiles?id=eq.${m.user_id}&select=full_name`);
    title = m.dm_id
      ? sender?.full_name || '새 메시지'
      : `${sender?.full_name || '알 수 없음'} · #${channelName}`;
    if (m.importance === 'urgent') title = '🚨 긴급 · ' + title;

    /* 3. 활성 계정만 */
    const active = await get(`profiles?id=in.(${audience.join(',')})&status=eq.active&select=id`);
    const ids = active.map((p) => p.id);
    if (!ids.length) return json(200, { skipped: 'no active users' });

    /* 4. 구독 가져오기 */
    const subs = await get(`push_subscriptions?user_id=in.(${ids.join(',')})&select=*`);
    if (!subs.length) return json(200, { skipped: 'no subscriptions' });

    const payload = JSON.stringify({
      title,
      body: (m.body || '').slice(0, 140),
      tag: m.channel_id || m.dm_id,
      url: `${PUBLIC_URL}/?go=${m.channel_id || m.dm_id}${m.parent_id ? `&thread=${m.parent_id}` : ''}`,
      urgent: m.importance === 'urgent',
    });

    /* 5. 발송. 죽은 구독(404/410)은 지웁니다. */
    const dead = [];
    const results = await Promise.allSettled(subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { urgency: m.importance === 'urgent' ? 'high' : 'normal', TTL: 60 * 60 * 24 }
      ).catch((err) => {
        if ([404, 410].includes(err.statusCode)) dead.push(s.id);
        throw err;
      })
    ));

    if (dead.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${dead.join(',')})`, { method: 'DELETE', headers: admin });
    }

    return json(200, {
      sent: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
      cleaned: dead.length,
    });
  } catch (err) {
    return json(500, { error: err.message });
  }
};

export const config = { path: '/api/push-send' };
