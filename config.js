/* ==========================================================================
   설정 — Supabase 프로젝트 값을 여기에 넣으세요.
   Settings → API 에서 Project URL과 anon public key를 복사합니다.
   anon key는 공개돼도 안전한 키입니다. 실제 보호는 RLS 정책이 담당합니다.
   두 값이 비어 있으면 앱은 자동으로 "데모 모드"(브라우저 메모리)로 동작합니다.
   ========================================================================== */

window.TEAMHUB_CONFIG = {
  SUPABASE_URL: "https://nqxhwxutdfltvuefszdi.supabase.co",       // 예: "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xeGh3eHV0ZGZsdHZ1ZWZzemRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNDM5MDEsImV4cCI6MjA5OTcxOTkwMX0.bacCxxumMqQ8zM9IOkH0Ik-tAn2cHPYDZNA4HpMX97U",  // 예: "eyJhbGciOi..."

  // 웹 푸시 공개키(VAPID). `npm run vapid`로 만든 publicKey를 넣습니다.
  // 공개키라 노출돼도 안전합니다. privateKey는 Netlify 환경변수에만 둡니다.
  VAPID_PUBLIC_KEY: "",

  // 이 도메인 이메일만 가입 허용 (안내용).
  // 실제 차단은 schema.sql의 app_config.allowed_domains가 서버에서 합니다.
  ALLOWED_EMAIL_DOMAINS: [],

  // 가입 후 관리자 승인이 필요한지
  REQUIRE_ADMIN_APPROVAL: true,

  // 첫 가입자를 자동으로 관리자로 지정 (schema.sql 트리거와 동작 일치)
  FIRST_USER_IS_ADMIN: true,

  ORG_NAME: "TeamHub",
};
