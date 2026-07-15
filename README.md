# TeamHub — 사내 메신저 프로토타입

Microsoft Teams의 핵심 기능을 사내용으로 다시 만든 웹앱입니다. 빌드 도구 없이 정적 파일로만 동작하므로 GitHub에 올리고 Netlify에 연결하면 바로 배포됩니다. 계정과 데이터는 Supabase가 맡습니다. PWA라서 휴대폰에서 "홈 화면에 추가"하면 앱처럼 씁니다.

## 담은 기능

| 영역 | 구현 |
|---|---|
| 채팅 | 1:1·그룹, 이모지, 반응, `**굵게**` `*기울임*` `~~취소선~~` `` `코드` `` 서식 |
| 중요도 | **중요**·**긴급** 태그 (긴급은 시각적 반복 알림 표시) |
| 검색 | 메시지·파일·사람 통합 검색 |
| 팀/채널 | 팀 생성, 표준·**비공개**·**공유(외부 협력사)** 채널 |
| 멘션 | `@이름` 자동완성, `@채널` 전체 알림 |
| 파일 | 채널별 보관함, 저장할 때마다 **버전 이력 자동 기록** |
| **문서 공동 편집** | **Word·Excel·PowerPoint를 브라우저에서 여러 명이 동시에 편집** (ONLYOFFICE Docs CE) |
| 앱 통합 | 작업 보드(Planner 유사), 설문·투표(Forms 유사) |
| 관리자 모드 | 가입 승인, 권한 변경, 계정 중지, 팀·채널 관리, 전사 공지, 통계 |
| 사용성 | ⌘K 명령 팔레트, 안읽음 배지, 입력 중 표시, 접속 상태, 다크 모드, 임시 저장(초안) |

관리자와 사용자는 **같은 앱 안에서 권한(`role`)으로 갈립니다.** 관리자는 왼쪽 레일에 "관리자" 메뉴가 추가로 보이고, 서버 쪽에서도 RLS 정책이 한 번 더 막습니다.

## 0. 사용성 설계 메모

- **화면을 통째로 다시 그리지 않습니다.** 사이드바·스트림·레일을 각각 칠하므로 입력 중인 글, 스크롤 위치, 포커스가 유지됩니다.
- **⌘K 명령 팔레트** — 채널·구성원·명령을 두 번의 키 입력으로 엽니다. `?`를 누르면 단축키 목록이 뜹니다.
- **메시지는 먼저 뜨고 나중에 확인됩니다.** 보내면 즉시 흐릿하게 표시되고, 서버 응답이 오면 확정됩니다. 실패하면 "다시 시도" 버튼이 붙은 알림이 뜹니다.
- **안읽음** — 사이드바 배지, 스트림의 "여기까지 읽었습니다" 구분선, @멘션·긴급은 빨간 배지로 구분합니다. 읽은 위치는 `reads` 테이블에 남습니다.
- **입력 중 표시·접속 상태**는 Supabase Realtime의 broadcast/presence를 씁니다. DB에 쓰지 않아 부담이 없습니다.
- **다크 모드**는 시스템 설정을 따르고 `⌘⇧L`로 뒤집습니다.
- 색은 신호(중요·긴급·재실)에만 씁니다. 나머지는 잉크와 종이색으로 두어, 하루 종일 봐도 피로하지 않게 했습니다.
- 모션은 120~220ms 사이로 짧게, `prefers-reduced-motion`을 켠 사람에게는 전부 끕니다.

## 1. Supabase 준비

1. [supabase.com](https://supabase.com)에서 프로젝트를 만듭니다.
2. **SQL Editor** → `supabase/schema.sql` 전체를 붙여넣고 실행합니다. 테이블·RLS 정책·스토리지 버킷·가입 트리거가 한 번에 만들어집니다.
3. **Authentication → Providers → Email**을 켭니다. 사내용이면 "Confirm email"을 켜두는 쪽을 권합니다.
4. **Authentication → URL Configuration**의 Site URL에 Netlify 주소를 넣습니다.
5. **Settings → API**에서 `Project URL`과 `anon public` 키를 복사해 `assets/js/config.js`에 채웁니다.

```js
window.TEAMHUB_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  ALLOWED_EMAIL_DOMAINS: ["company.co.kr"],  // 사내 도메인만 가입 허용
  REQUIRE_ADMIN_APPROVAL: true,
  ORG_NAME: "우리회사",
};
```

`anon` 키는 공개돼도 되는 키입니다. 실제 보호는 RLS가 합니다. `service_role` 키는 절대 이 파일에 넣지 마세요.

**첫 가입자가 자동으로 관리자**가 됩니다(트리거). 본인 계정을 먼저 만드세요. 이후 가입자는 `pending` 상태로 들어오고, 관리자 모드에서 승인해야 로그인됩니다.

## 2. GitHub → Netlify 배포

```bash
git init
git add .
git commit -m "TeamHub 프로토타입"
git remote add origin https://github.com/<계정>/<저장소>.git
git push -u origin main
```

Netlify → **Add new site → Import an existing project** → 저장소 선택 →
Build command는 **비워 두고**, Publish directory는 `.` 로 둡니다. `netlify.toml`에 이미 들어 있으니 그대로 Deploy를 누르면 됩니다.

## 3. 데모 모드

`config.js`가 비어 있으면 Supabase 없이 **데모 모드**로 뜹니다. 문서 편집기는 실제 문서 서버가 필요해 데모 모드에서는 열리지 않습니다. 샘플 팀·채널·대화가 들어 있고 로그인 화면에서 계정 이름을 누르면 바로 채워집니다(비밀번호는 아무거나). 김도현 계정이 관리자입니다. 데모 모드 변경 사항은 새로고침하면 사라집니다.

## 4. 앱으로 쓰기

- **모바일 웹**: 브라우저 공유 → 홈 화면에 추가 → 전체화면 앱으로 실행됩니다.
- **네이티브 스토어 배포가 필요하면**: 이 폴더를 그대로 Capacitor로 감싸면 됩니다.
  ```bash
  npm i -D @capacitor/cli && npx cap init TeamHub kr.co.company.teamhub --web-dir=.
  npx cap add ios && npx cap add android && npx cap sync
  ```
- 푸시 알림은 프로토타입 범위 밖입니다. 붙이려면 Supabase Edge Function + FCM/APNs 조합을 씁니다.

## 5. 문서 공동 편집 (Word·Excel·PowerPoint)

Microsoft 365 라이선스 대신 **ONLYOFFICE Docs Community Edition**(AGPLv3)을 씁니다. 9.4부터 커뮤니티 에디션의 동시 접속 20개 제한이 없어져 사내 규모에서 그대로 쓸 수 있습니다. Netlify는 정적 호스팅이라 문서 서버는 별도 호스트가 필요합니다.

```
브라우저 ──① 편집 요청──▶ Netlify Function(/api/docs-token)
   │                         └─ Supabase RLS로 권한 확인 → 서명 URL 발급 → 설정에 JWT 서명
   └──② 설정 전달──▶ ONLYOFFICE 문서 서버 ──③ 파일 내려받아 편집──▶ Supabase Storage
                              └──④ 저장 콜백──▶ /api/docs-callback → 새 버전으로 저장
```

### 5-1. 문서 서버 띄우기

VM(예: Hetzner CPX21, 4GB 이상 권장) 하나를 준비하고:

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env   # 이 값을 잘 보관하세요
docker compose up -d
```

`docker-compose.yml`이 8080 포트로 띄웁니다. 앞단에 Caddy 같은 리버스 프록시로 **HTTPS를 반드시 붙이세요.** HTTP면 브라우저가 혼합 콘텐츠로 차단합니다.

```
docs.company.co.kr {
    reverse_proxy localhost:8080
}
```

### 5-2. Netlify 환경변수

Site settings → Environment variables에 `.env.example`의 값을 넣습니다.

| 변수 | 설명 |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | 프론트와 같은 값 |
| `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용.** 서명 URL 발급과 저장에만 씁니다 |
| `ONLYOFFICE_URL` | 문서 서버 HTTPS 주소 |
| `ONLYOFFICE_JWT_SECRET` | 문서 서버 `JWT_SECRET`과 **똑같은** 값 |
| `PUBLIC_URL` | 이 앱의 공개 주소 (저장 콜백이 여기로 돌아옵니다) |

문서 서버는 콜백을 위해 `PUBLIC_URL`에, Supabase Storage 서명 URL에 접근할 수 있어야 합니다. 폐쇄망이면 두 곳 모두 방화벽을 열어주세요.

### 5-3. 동작 확인

파일 탭에서 **Word 문서** 버튼 → 이름 입력 → 편집기가 열립니다. 다른 브라우저로 같은 문서를 열면 커서가 두 개 보이고 실시간으로 같이 써집니다. 저장하면 `files.version`이 오르고 `file_versions`에 이력이 한 줄 쌓입니다.

### 5-4. 라이선스 유의

ONLYOFFICE Docs는 AGPLv3입니다. 9.4에서 저작자 표시·수정 버전 표기 규정이 명확해졌고, 상표 사용은 별도 트레이드마크 정책이 다룹니다. **문서 서버를 고치지 않고 공식 이미지를 그대로 쓰고, 이 앱은 API로 붙이기만 하는** 지금 구조가 부담이 가장 적습니다. 서버 코드를 수정해 배포하려면 그 수정본을 공개할 의무가 생깁니다. 저는 변호사가 아니니 사내 배포 형태는 법무 검토를 받아보시길 권합니다.

## 6. 파일 구조

```
index.html            앱 셸
assets/css/style.css  전체 스타일
assets/js/config.js   ← Supabase 키를 넣는 곳
assets/js/store.js    데이터 계층 (Supabase / 데모 모드 자동 전환)
assets/js/ui.js       렌더 헬퍼, 메시지 서식, 모달, 토스트
assets/js/app.js      화면 (로그인 · 채팅 · 파일 · 작업 · 검색 · 관리자 · 명령 팔레트)
assets/js/docs.js     ONLYOFFICE 에디터 열기 · 새 문서 만들기
assets/templates/     빈 docx / xlsx / pptx 원본
netlify/functions/    docs-token(권한 확인·JWT 서명), docs-callback(저장)
supabase/schema.sql   테이블 + RLS + 트리거 + 스토리지
docker-compose.yml    ONLYOFFICE Docs CE 문서 서버
.env.example          환경변수 목록
netlify.toml          배포 설정 · API 라우팅 · 보안 헤더
manifest.json, sw.js  PWA
```

## 프로토타입에서 뺀 것

화상 회의, 푸시 알림, 읽음 표시, 스레드 답글이 다음 단계 후보입니다.
