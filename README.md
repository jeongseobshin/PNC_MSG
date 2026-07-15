# TeamHub — 사내 메신저

Microsoft Teams의 핵심을 사내용으로 다시 만든 웹앱입니다. 프론트는 빌드 도구 없는 정적 파일이라 GitHub에 올려 Netlify에 연결하면 배포됩니다. 계정·데이터는 Supabase, 문서 편집은 ONLYOFFICE Docs, 알림은 웹 푸시가 맡습니다. PWA라서 휴대폰에서 홈 화면에 추가하면 앱처럼 씁니다.

## 기능

| 영역 | 구현 |
|---|---|
| 채팅 | 1:1·그룹, 이모지, 반응, `**굵게**` `*기울임*` `~~취소선~~` `` `코드` `` 서식, 수정·삭제 |
| **스레드** | 메시지마다 답글 스레드. "채널에도 보내기" 선택 가능. 답글 수는 DB 트리거가 관리 |
| **읽음 표시** | 내 마지막 메시지에 `읽음 3/5`. 눌러서 누가 읽었는지 확인. 실시간 갱신 |
| **푸시 알림** | 앱을 닫아도 옴. DM·@멘션·@채널·긴급만. 일반 대화는 조용함 |
| 중요도 | 중요·긴급 태그. 긴급 알림은 직접 닫을 때까지 남습니다 |
| 검색 | 메시지·파일·사람 통합 검색 |
| 팀/채널 | 표준 · 비공개 · 공유(외부 협력사) 채널 |
| 문서 | Word·Excel·PowerPoint 브라우저 동시 편집, 저장할 때마다 버전 이력 |
| 앱 통합 | 작업 보드(Planner 유사), 설문·투표(Forms 유사) |
| 관리자 | 가입 승인, 권한 변경, 계정 중지, 팀·채널 관리, 전사 공지, 통계 |
| 사용성 | ⌘K 명령 팔레트, 안읽음 배지, 입력 중 표시, 접속 상태, 다크 모드, 초안 자동 보관 |

관리자와 사용자는 같은 앱 안에서 권한(`role`)으로 갈립니다. 화면에서 감추는 데 그치지 않고 **RLS 정책이 서버에서 한 번 더 막습니다.**

---

# 배포 체크리스트

순서대로 하시면 됩니다. ①②는 필수, ③④는 각각 문서 편집과 푸시를 쓸 때만 필요합니다.

## ① Supabase (필수)

1. [supabase.com](https://supabase.com)에서 프로젝트 생성. **리전은 서울(ap-northeast-2)**을 고르세요.
2. **SQL Editor** → `supabase/schema.sql` 전체를 붙여넣고 Run. 테이블·RLS·트리거·스토리지가 한 번에 만들어집니다. 여러 번 실행해도 안전합니다(`if not exists` / `drop policy if exists`).
3. 사내 도메인만 가입시키려면 SQL Editor에서:
   ```sql
   insert into app_config (key, value) values ('allowed_domains', 'company.co.kr')
   on conflict (key) do update set value = excluded.value;
   ```
   **이게 진짜 차단입니다.** `config.js`의 `ALLOWED_EMAIL_DOMAINS`는 안내문일 뿐 우회할 수 있습니다.
4. **Authentication → Providers → Email** 활성화. 사내용이면 "Confirm email"을 켜세요.
5. **Authentication → URL Configuration** → Site URL에 Netlify 주소 입력.
6. **Settings → API**에서 `Project URL`과 `anon public` 키를 `assets/js/config.js`에 입력.

```js
window.TEAMHUB_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  VAPID_PUBLIC_KEY: "BN...",              // ④에서 생성
  REQUIRE_ADMIN_APPROVAL: true,
  ORG_NAME: "우리회사",
};
```

`anon` 키는 공개돼도 되는 키입니다. 실제 보호는 RLS가 합니다. **`service_role` 키는 절대 `config.js`에 넣지 마세요.** Netlify 환경변수에만 둡니다.

**첫 가입자가 자동으로 관리자**가 됩니다. 본인 계정을 먼저 만드세요. 이후 가입자는 `pending`이라 관리자가 승인해야 로그인됩니다.

## ② GitHub → Netlify (필수)

```bash
git init && git add . && git commit -m "TeamHub"
git remote add origin https://github.com/<계정>/<저장소>.git
git push -u origin main
```

Netlify → Add new site → Import an existing project → 저장소 선택 → **Build command 비움**, Publish directory `.`. `netlify.toml`에 다 들어 있습니다. 함수는 `package.json`의 `web-push`만 설치하면 되고 Netlify가 알아서 합니다.

## ③ 문서 서버 (Word·Excel 편집을 쓸 때)

Microsoft 365 라이선스 대신 **ONLYOFFICE Docs Community Edition**(AGPLv3)을 씁니다. 9.4부터 커뮤니티 에디션의 동시 접속 20개 제한이 없어져 사내 규모에서 그대로 쓸 수 있습니다. Netlify는 정적 호스팅이라 문서 서버는 **별도 VM**이 필요합니다(4GB 이상 권장).

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env   # 값을 잘 보관하세요
docker compose up -d
```

앞단에 HTTPS를 **반드시** 붙이세요. HTTP면 브라우저가 혼합 콘텐츠로 차단합니다.

```
docs.company.co.kr {
    reverse_proxy localhost:8080
}
```

동작 흐름:
```
브라우저 ──① 편집 요청──▶ /api/docs-token
                            └─ 사용자 본인 토큰으로 조회 → RLS가 권한 판단 → 서명 URL → JWT 서명
        ──② 설정 전달──▶ ONLYOFFICE 문서 서버 ──③ 편집──▶
                            └──④ 저장 콜백──▶ /api/docs-callback → 새 버전으로 저장
```

## ④ 푸시 알림

```bash
npx web-push generate-vapid-keys
```

- `publicKey` → `config.js`의 `VAPID_PUBLIC_KEY` **와** Netlify 환경변수 `VAPID_PUBLIC_KEY`
- `privateKey` → Netlify 환경변수 `VAPID_PRIVATE_KEY` (**서버 전용**)

그리고 DB가 푸시 함수를 부를 수 있게 SQL Editor에서:

```sql
insert into app_config (key, value) values
  ('push_url', 'https://<사이트>.netlify.app/api/push-send'),
  ('push_secret', '<PUSH_SECRET과 같은 값>')
on conflict (key) do update set value = excluded.value;
```

동작 흐름:
```
메시지 INSERT → DB 트리거(notify_push) → pg_net으로 /api/push-send 호출
                                          └─ 대상 선별(DM·멘션·긴급) → web-push 발송 → 죽은 구독 정리
```

트리거는 **알림 대상이 있는 메시지만** 함수를 부릅니다. 일반 채널 대화는 DB 안에서 걸러져 함수 호출조차 없습니다.

## ⑤ Netlify 환경변수

Site settings → Environment variables. `.env.example` 참고.

| 변수 | 용도 |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | 프론트와 같은 값 |
| `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용.** 서명 URL 발급·문서 저장·푸시 대상 조회 |
| `ONLYOFFICE_URL`, `ONLYOFFICE_JWT_SECRET` | 문서 서버 주소와 `JWT_SECRET`(동일해야 함) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | 푸시 키 (`mailto:` 형식) |
| `PUSH_SECRET` | `app_config.push_secret`과 같은 값 |
| `PUBLIC_URL` | 이 앱의 공개 주소 (저장 콜백·알림 링크가 돌아옵니다) |

## ⑥ 배포 후 확인

- [ ] 첫 계정으로 로그인 → 왼쪽 레일에 **관리자** 메뉴가 보이는가
- [ ] 두 번째 계정 가입 → **승인 대기**로 막히는가 → 관리자 화면에서 승인 → 로그인되는가
- [ ] 허용하지 않은 도메인 이메일로 가입 → **거부되는가** (③번 설정 시)
- [ ] 브라우저 두 개로 같은 채널 → 메시지가 **실시간**으로 뜨는가, **읽음 표시**가 켜지는가
- [ ] Word 문서 생성 → 두 브라우저에서 동시 편집 → 커서 두 개 → 저장 후 **v2**로 오르는가
- [ ] 프로필 → 알림 설정 → 켜기 → 앱을 닫고 다른 계정으로 **@멘션** → 푸시가 오는가
- [ ] 휴대폰에서 홈 화면에 추가 → 앱처럼 열리는가

---

# 운영 메모

## 알림 정책

조용한 것이 기본입니다. 푸시는 **DM · @내 이름 · @채널 · 긴급**만 갑니다. 일반 채널 대화는 앱 안 배지로만 알립니다. 긴급 메시지는 `requireInteraction`으로 직접 닫을 때까지 남고 진동 패턴이 다릅니다.

**iOS는 홈 화면에 추가한 뒤에만 푸시가 옵니다**(16.4+). 사파리 탭 상태로는 안 옵니다. 앱이 이 상태를 감지해 "공유 → 홈 화면에 추가" 안내를 띄웁니다.

## 읽음 표시

`reads` 테이블에 대화별 마지막 읽은 시각을 남기고, 그 시각이 메시지 시각보다 뒤면 읽은 것으로 셉니다. 메시지 하나하나에 행을 만들지 않아 가볍습니다. 대신 "정확히 그 메시지를 봤는지"가 아니라 "그 시점까지 읽었는지"를 재는 방식입니다. 일반적인 메신저와 같은 방식입니다.

## 성능

- 대화는 **최근 50개만** 불러오고 위로 올리면 더 가져옵니다. 채널이 커져도 첫 화면이 느려지지 않습니다.
- 사이드바 안읽음 배지는 최근 400건을 한 번 훑어 셉니다. 채널이 수백 개로 늘면 이 부분을 서버 집계(RPC)로 옮기세요.
- 입력 중·접속 상태는 Realtime broadcast/presence라 DB에 쓰지 않습니다.

## 백업

Supabase 유료 플랜의 자동 백업을 켜세요. 무료 플랜은 백업이 없습니다. 문서 서버 VM의 `./ds/data`도 함께 받아두면 좋습니다.

## 라이선스

ONLYOFFICE Docs는 AGPLv3입니다. 9.4에서 저작자 표시·수정 버전 표기 규정이 명확해졌고 상표는 별도 트레이드마크 정책이 다룹니다. **공식 이미지를 고치지 않고 API로만 붙이는** 지금 구조가 부담이 가장 적습니다. 서버 코드를 고쳐 배포하면 그 수정본을 공개할 의무가 생깁니다. 저는 변호사가 아니니 사내 배포 형태는 법무 검토를 받으시길 권합니다.

## 아직 없는 것 (솔직히)

실제로 쓰기 전에 알고 계셔야 합니다.

- **종단간 암호화 없음.** 전송 구간은 TLS, 저장은 Supabase의 디스크 암호화까지입니다. DB 관리자는 메시지를 볼 수 있습니다.
- **감사 로그 없음.** 누가 언제 무엇을 지웠는지 추적되지 않습니다. 규제 대상 업종이면 `messages` 삭제를 소프트 삭제로 바꾸고 감사 테이블을 붙이세요.
- **문서 서버가 단일 장애점.** VM 한 대가 죽으면 문서 편집만 멈춥니다(채팅은 무관). 이중화하려면 로드밸런서와 공유 캐시가 필요합니다.
- **메시지 보존 정책 없음.** 무한히 쌓입니다. 보존 기간이 필요하면 `pg_cron`으로 주기 삭제를 거세요.
- **화상 회의 없음.** 필요하면 Jitsi 임베드가 가장 빠릅니다.
- **자동 테스트 없음.** ⑥번 체크리스트를 배포 때마다 손으로 확인하셔야 합니다.
- **데모 모드가 남아 있습니다.** `config.js`에 키를 넣으면 자동으로 꺼지지만, 배포 전에 키가 채워졌는지 꼭 확인하세요.

---

# 파일 구조

```
index.html               앱 셸
assets/css/style.css     전체 스타일 (라이트/다크)
assets/js/config.js      ← Supabase URL·anon 키·VAPID 공개키
assets/js/store.js       데이터 계층 (Supabase / 데모 모드 자동 전환)
assets/js/ui.js          렌더 헬퍼, 메시지 서식, 모달, 토스트
assets/js/docs.js        ONLYOFFICE 에디터
assets/js/push.js        웹 푸시 구독
assets/js/app.js         화면 (로그인·채팅·스레드·파일·작업·검색·관리자·팔레트)
assets/templates/        빈 docx / xlsx / pptx
netlify/functions/
  docs-token.mjs         권한 확인 → 서명 URL → JWT 서명
  docs-callback.mjs      편집 결과를 새 버전으로 저장
  push-send.mjs          DB 트리거가 부르는 푸시 발송
supabase/schema.sql      테이블 · RLS · 트리거 · 스토리지 (단일 소스)
docker-compose.yml       ONLYOFFICE Docs CE
netlify.toml             배포 · API 라우팅 · 보안 헤더
manifest.json, sw.js     PWA · 푸시 수신
```

## 키보드

`⌘K` 이동 · `↵` 전송 · `⇧↵` 줄바꿈 · `↑` 마지막 메시지 수정 · `⌘B`/`⌘I` 서식 · `⌘⇧L` 밝기 · `?` 도움말
