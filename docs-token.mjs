/* ===========================================================================
   /api/docs-token — 에디터 설정을 만들어 ONLYOFFICE JWT로 서명해 돌려줍니다.
   외부 패키지 없이 node:crypto와 fetch만 씁니다.

   흐름
   1) 브라우저가 자기 Supabase 액세스 토큰과 파일 id를 보냄
   2) 그 토큰으로 Supabase REST를 호출 → RLS가 접근 권한을 대신 판단
   3) 통과하면 스토리지 서명 URL을 만들고 에디터 설정을 JWT로 서명해 반환
   =========================================================================== */

import crypto from 'node:crypto';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY,
  ONLYOFFICE_JWT_SECRET,
  ONLYOFFICE_URL,
  PUBLIC_URL,
} = process.env;

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

export function signJwt(payload, secret) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const TYPES = {
  docx: 'word', doc: 'word', odt: 'word', rtf: 'word', txt: 'word', docxf: 'word',
  xlsx: 'cell', xls: 'cell', ods: 'cell', csv: 'cell',
  pptx: 'slide', ppt: 'slide', odp: 'slide',
  pdf: 'pdf',
};
const EDITABLE = new Set(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'txt', 'csv']);

const json = (code, body) => new Response(JSON.stringify(body), {
  status: code, headers: { 'content-type': 'application/json' },
});

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: '허용되지 않은 요청입니다.' });
  if (!ONLYOFFICE_URL || !ONLYOFFICE_JWT_SECRET) {
    return json(503, { error: '문서 서버가 아직 설정되지 않았습니다. 관리자에게 문의하세요.' });
  }

  try {
    const { fileId, accessToken } = await req.json();
    if (!fileId || !accessToken) return json(400, { error: '요청에 파일 정보가 빠졌습니다.' });

    // 1. 사용자 확인
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}` },
    });
    if (!uRes.ok) return json(401, { error: '로그인이 만료됐습니다. 다시 로그인해 주세요.' });
    const user = await uRes.json();

    // 2. 사용자 토큰으로 조회 → RLS가 채널 접근 권한을 판단
    const fRes = await fetch(
      `${SUPABASE_URL}/rest/v1/files?id=eq.${fileId}&select=id,name,path,version,channel_id`,
      { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}` } }
    );
    const [file] = await fRes.json();
    if (!file) return json(403, { error: '이 문서를 열 권한이 없습니다.' });

    // 3. 프로필(이름, 상태)
    const pRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=full_name,status`, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}` },
    });
    const [profile] = await pRes.json();
    if (!profile || profile.status !== 'active') return json(403, { error: '사용이 중지된 계정입니다.' });

    // 4. 문서 서버가 내려받을 서명 URL (service_role로 발급)
    const sRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/files/${file.path}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    if (!sRes.ok) return json(500, { error: '문서 파일을 찾지 못했습니다.' });
    const { signedURL } = await sRes.json();
    const fileUrl = `${SUPABASE_URL}/storage/v1${signedURL}`;

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const canEdit = EDITABLE.has(ext);

    // 5. 에디터 설정. key는 문서 상태를 가리키는 값이라 저장될 때마다 바뀌어야 합니다.
    const config = {
      document: {
        fileType: ext,
        key: `${file.id}_${file.version}`,
        title: file.name,
        url: fileUrl,
        permissions: { edit: canEdit, download: true, print: true, comment: true, review: true },
      },
      documentType: TYPES[ext] || 'word',
      editorConfig: {
        mode: canEdit ? 'edit' : 'view',
        lang: 'ko-KR',
        callbackUrl: `${PUBLIC_URL}/api/docs-callback?fileId=${file.id}`,
        user: { id: user.id, name: profile.full_name },
        customization: {
          forcesave: true,          // 저장 버튼을 누르면 즉시 저장
          autosave: true,
          compactHeader: false,
          logo: { visible: false },
          goback: false,
        },
      },
    };
    config.token = signJwt(config, ONLYOFFICE_JWT_SECRET);

    return json(200, { config, documentServer: ONLYOFFICE_URL, readOnly: !canEdit });
  } catch (err) {
    return json(500, { error: '에디터를 여는 중 문제가 생겼습니다: ' + err.message });
  }
};

export const config = { path: '/api/docs-token' };
