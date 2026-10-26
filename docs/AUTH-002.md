# AUTH-002 카카오 로그인 백엔드 최소 구현

- 브랜치 `feature/auth-002-kakao` (기준 `integration/cur-004-final12-test` 301b4e3 + `design/auth-001-account-contract` 5154cc5 병합). 작업은 별도 worktree `C:\Users\yuzuh\code\project-2-auth002`에서 진행 — 기존 체크아웃·실행 중인 8080/3001·3031/8093 서버와 DB는 건드리지 않음.
- 계약: `docs/AUTH-001.md` 5장 + 9-1장(보완). 범위 밖: 이메일+비밀번호, 탈퇴(AUTH-004, 시나리오 8), 프론트·Lovable·배포·유료 서비스, 로그인 시도 제한.

## 1. 변경
- `backend/src/db/migrations.ts` v4: `users`, `user_identities`(provider+subject 유일), `auth_sessions`(토큰 해시·직전 토큰 해시·유예·미사용/절대 만료·폐기), `oauth_states`, `pending_signups`, `consent_documents`, `user_consents`, `consent_events`, `onboarding_sessions.user_id`(NULL 허용, 계정당 1개 UNIQUE). 기존 행 변경 없음. `migrate(db, target)`는 테스트용 목표 버전 인자 추가.
- `backend/src/modules/auth/`: `service.ts`(가입·로그인·세션·동의), `routes.ts`(경로·쿠키·인증 가드), `kakao.ts`(실제 카카오 클라이언트: 인가 URL, 토큰 교환, 회원번호만 조회), `consent-documents.ts`(개발용 초안 동의문 v1, 운영자·AI 공급자 빈칸).
- `backend/src/config.ts`: `auth` 설정(개발용 임시 기본값 30/90일·하루 갱신·60초 유예, `KAKAO_REST_API_KEY`/`KAKAO_CLIENT_SECRET`/`KAKAO_REDIRECT_URI`).
- 온보딩·하의: 익명 온보딩 쿠키 제거. 모든 `/session*`·garment 경로는 로그인 가드 → 계정의 취향 진행(`onboarding_sessions.user_id`)으로만 소유자 결정. 공개 `/catalog`, `/styles/:id`는 그대로.
- 문서: `docs/API.md`·`docs/GARMENT_API.md` 인증 안내, `docs/AUTH-001.md` 9-1장(보완·AUTH-004 삭제 순서 설계), 이 문서.

## 2. API 영향 (프론트 AUTH-003 대상)
| 경로 | 동작 |
|---|---|
| GET `/api/auth/kakao/start?returnTo=` | 302 카카오. 키 미설정 시 503 `AUTH_PROVIDER_NOT_CONFIGURED` |
| GET `/api/auth/kakao/callback` | 302 → 신규 `/signup`, 기존 `returnTo`, 실패 `/login?error=OAUTH_STATE_INVALID\|OAUTH_DENIED\|OAUTH_PROVIDER_ERROR\|ACCOUNT_UNAVAILABLE\|LOGIN_FAILED` |
| GET `/api/auth/consent-documents` · `/:key/:version` | 동의문 본문 포함 |
| GET `/api/auth/signup/pending` · POST `/api/auth/signup` | 201 `{user:{id}, returnTo}` + 로그인 쿠키. 400 `CONSENT_REQUIRED`, 409 `CONSENT_VERSION_MISMATCH`/`IDENTITY_ALREADY_LINKED`, 410 `SIGNUP_EXPIRED` |
| GET `/api/auth/me` · PUT `/api/auth/consents` | 계정·동의·`consentUpdates`·세션 만료 |
| POST `/api/auth/logout` · `/logout-all` | 204, 토큰 폐기 |
| 기존 `/api/onboarding/session*`, garment | 로그인 없으면 401 `AUTH_REQUIRED`, 재동의 필요 시 403 `CONSENT_UPDATE_REQUIRED`. `POST /session`은 계정 진행 생성(201)/반환(200), 쿠키 발급 안 함. `reset`·`DELETE`는 로그인 유지 |
- 쿠키: `auth_dev`·`auth-oauth_dev`·`auth-signup_dev`(운영 `__Host-` 접두사), HttpOnly·SameSite=Lax·Path=/. 변경 요청은 기존대로 `X-Onboarding-Request: 1`+Origin 검사.
- 현재 Lovable 프론트는 로그인 화면이 없어 이 백엔드와 붙이면 첫 화면부터 401 → AUTH-003 전까지 기존 8080 개발 서버를 이 브랜치로 바꾸지 말 것.

## 3. 실행 명령과 결과 (2026-10-26, Windows, Node 24.22.1, worktree `backend/`)
| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 통과 |
| `npx prettier --check src/modules/auth/*.ts test/auth.integration.test.ts` (변경 파일은 `--write`) | 통과 |
| `npm test` (빌드 후 `node --test`) | 47개 중 46 통과, 1 실패 = 기존 "escaping symlinks"(Windows 심볼릭 링크 권한 EPERM, 이번 변경과 무관) |
| 변이 확인(코드를 일부러 망가뜨려 테스트가 잡는지) | 브라우저 바인딩 제거·유예 제거·로그아웃 무효화 각각 실패로 검출. 절대 만료 검사 제거는 미사용 만료가 절대 만료로 상한이 걸려 동작 동일(등가 변이) |
| `node data/auth002-check/check.ts int-001-b int-001-c cur-004` (기존 시험 DB의 `VACUUM INTO` 복사본에 v4 적용) | 3개 모두 v3→v4, 8개 테이블 행 수 동일, 기존 세션 행 동일, 계정 귀속 0, 외래키 오류 0. 원본 DB 미접촉 |
| 실제 서버 프로세스(`node src/server.ts`, 포트 3041, 별도 DB, 카카오 키 없음) | start 503 `AUTH_PROVIDER_NOT_CONFIGURED`, 로그인 없는 `/session`·garment 401 `AUTH_REQUIRED`, `/me` 401, 헤더 없는 logout 403, 동의문 3개(필수2·선택1) 본문 포함 200, 공개 catalog 200 |

- 새 테스트 `backend/test/auth.integration.test.ts`(12개, **가짜 카카오 = 테스트 전용**, `buildApp`의 `oauthProvider` 주입으로만 가능하고 환경변수 등 런타임 전환 수단 없음): 신규 가입·기존 로그인·returnTo 유지 / state 다른 브라우저·재사용·위조·만료·거부·공급자 장애(무효 state면 공급자 호출 0) / returnTo 외부·`//`·`\\`·스킴·`/api/` 거부 / 필수 누락·구버전·미지 항목·헤더 없음·만료·같은 카카오 이중 가입 / 필수 새 버전 시 403 → 재동의 후 해제, 필수 철회 거부, 선택 동의 토글 기록 / 서버 재시작 후 로그인 유지, 미사용·절대 만료 / 동시 요청 3개 모두 200·교체 1회·유예 후 옛 토큰 401 / 로그아웃 토큰 재사용 401·전체 로그아웃 / A·B 사진 상호 접근 불가·개별 삭제 시 본인 파일만 삭제 / 익명 진행 보존·자동 귀속 없음 / 키 미설정 503 / 실제 카카오 클라이언트(가짜 fetch로 요청 형식·회원번호만 사용·실패 502).
- 기존 테스트 갱신: 익명 쿠키 전제 부분을 로그인 기준으로 변경(보안·하의·재시작·분류 업그레이드). 분류 업그레이드 테스트는 옛 익명 행이 v4 후에도 그대로이고 `user_id` NULL인지 확인.

## 4. 미실행·설정 필요
- **실제 카카오 로그인은 검증하지 않음**(키 없음). 필요: 카카오 개발자 앱 등록, REST API 키(·선택 Client Secret), Redirect URI `http://localhost:8080/api/auth/kakao/callback`(개발) 등록, 동의항목은 회원번호만. 서버 환경변수 `KAKAO_REST_API_KEY`(필수), `KAKAO_CLIENT_SECRET`(사용 시), `KAKAO_REDIRECT_URI`(기본 `PUBLIC_ORIGIN`+`/api/auth/kakao/callback`). Git·로그에 넣지 않음.
- 실제 브라우저 확인 안 함: 로그인·가입 화면이 없음(AUTH-003). 동의문은 개발용 초안·법률 검토 전·운영자/AI 공급자 빈칸 → AI 분석 실전송 0(분석 기능 자체 없음).
- 미구현: 탈퇴(AUTH-004, 9-1장 순서), 이메일+비밀번호(AUTH-005), 로그인 시도 제한(429), 만료 행 정리 작업(만료된 state·가입 대기는 새 시작 때 지움), 익명 진행 가져오기.
