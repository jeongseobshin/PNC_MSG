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

  // ------------------------------------------------------------------------
  // 구글 문서 연동 — ONLYOFFICE 문서 서버(별도 VM, 월 비용) 없이도
  // Word·Excel·PowerPoint 자리를 구글 Docs·Sheets·Slides로 대신해 실시간
  // 공동편집을 쓸 수 있게 해줍니다. 완전 무료, 서버 추가 불필요.
  // README "③' 구글 문서 연동" 참고.
  // ------------------------------------------------------------------------

  // Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID
  // (유형: 웹 애플리케이션) 에서 발급받은 클라이언트 ID. 승인된 자바스크립트
  // 원본에 이 앱의 배포 주소(예: https://teamhub.netlify.app)를 등록해야 합니다.
  GOOGLE_CLIENT_ID: "915503141866-9pgo7tj1n2nc7c6hmpmqai3tmbdkilvi.apps.googleusercontent.com",

  // 회사가 Google Workspace를 쓴다면 그 도메인(예: "company.co.kr")을 적어주세요.
  // 연동 시 그 도메인 계정으로 로그인하도록 안내만 할 뿐, 실제 접근 차단은
  // 각 구글 문서의 공유 설정이 담당합니다. 비워두면 개인 Gmail도 연동됩니다.
  GOOGLE_HOSTED_DOMAIN: "gmail.com",

  // 'google' → Word/Excel/PPT 버튼이 구글 문서를 만듭니다.
  // 'onlyoffice' → 기존 ONLYOFFICE 문서 서버(VM 필요)를 씁니다.
  // 비워두면(기본값) GOOGLE_CLIENT_ID가 채워져 있을 때 자동으로 'google'을 씁니다.
  DOC_PROVIDER: "",
};
