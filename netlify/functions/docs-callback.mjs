/* ===========================================================================
   /api/docs-callback — 문서 서버가 편집 결과를 저장하라고 호출하는 지점입니다.
   반드시 {"error":0} 을 돌려줘야 문서 서버가 저장 성공으로 처리합니다.

   status 코드
   1 편집 중 · 2 저장 준비됨 · 3 저장 실패 · 4 변경 없이 닫힘 · 6 강제 저장 · 7 강제 저장 실패
   =========================================================================== */

import crypto from 'node:crypto';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ONLYOFFICE_JWT_SECRET,
} = process.env;

const ok = () => new Response(JSON.stringify({ error: 0 }), { headers: { 'content-type': 'application/json' } });
const fail = (msg) => new Response(JSON.stringify({ error: 1, message: msg }), { headers: { 'content-type': 'application/json' } });

/** HS256 서명 검증 후 payload 반환 */
function verifyJwt(token, secret) {
  const [h, p, s] = String(token).split('.');
  if (!h || !p || !s) throw new Error('토큰 형식이 올바르지 않습니다.');
  const expect = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  const a = Buffer.from(s), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('토큰 서명이 맞지 않습니다.');
  return JSON.parse(Buffer.from(p, 'base64url').toString());
}

const admin = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
};

export default async (req) => {
  try {
    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId');
    const body = await req.json();

    // 1. 문서 서버가 보낸 요청이 맞는지 확인
    if (ONLYOFFICE_JWT_SECRET) {
      const raw = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || body.token;
      if (!raw) return fail('토큰이 없습니다.');
      verifyJwt(raw, ONLYOFFICE_JWT_SECRET);
    }

    // 2. 저장할 상태가 아니면 그대로 성공 처리
    if (![2, 6].includes(body.status)) return ok();
    if (!fileId || !body.url) return fail('저장할 파일 정보가 없습니다.');

    // 3. 현재 파일 정보
    const [file] = await (await fetch(
      `${SUPABASE_URL}/rest/v1/files?id=eq.${fileId}&select=id,name,channel_id,version`,
      { headers: admin }
    )).json();
    if (!file) return fail('파일을 찾을 수 없습니다.');

    // 4. 문서 서버에서 편집 결과 내려받기
    const docRes = await fetch(body.url);
    if (!docRes.ok) return fail('편집 결과를 내려받지 못했습니다.');
    const bytes = Buffer.from(await docRes.arrayBuffer());

    // 저장 경로에는 원본 파일명을 쓰지 않습니다. 한글·공백·괄호 등은
    // Supabase Storage의 key 규칙에서 막혀 "Invalid key" 에러가 납니다.
    const version = file.version + 1;
    const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'bin';
    const path = `${file.channel_id}/${file.id}/v${version}.${ext}`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/files/${path}`, {
      method: 'POST',
      headers: { ...admin, 'content-type': 'application/octet-stream', 'x-upsert': 'true' },
      body: bytes,
    });
    if (!up.ok) return fail('저장소에 올리지 못했습니다: ' + (await up.text()));

    // 6. 편집자 기록 (여러 명이면 마지막 사람)
    const editor = (body.users && body.users[body.users.length - 1]) || null;

    await fetch(`${SUPABASE_URL}/rest/v1/files?id=eq.${fileId}`, {
      method: 'PATCH',
      headers: { ...admin, 'content-type': 'application/json' },
      body: JSON.stringify({ path, version, size: bytes.length, updated_at: new Date().toISOString(), updated_by: editor }),
    });

    await fetch(`${SUPABASE_URL}/rest/v1/file_versions`, {
      method: 'POST',
      headers: { ...admin, 'content-type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, version, path, size: bytes.length, user_id: editor }),
    });

    return ok();
  } catch (err) {
    return fail(err.message);
  }
};

export const config = { path: '/api/docs-callback' };
