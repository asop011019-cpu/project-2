# AUTH-001 계정·세션·동의 계약 (설계안, 미구현·미시험)

- 브랜치 `design/auth-001-account-contract` (기준 `design/anl-001-garment-analysis-contract` fea119b ⊃ 43e13a7). 최근 통합 `integration/cur-004-final12-test` 301b4e3.
- 읽은 코드: `backend/src/modules/onboarding/{routes,service,repository}.ts`(익명 세션 쿠키), `backend/src/modules/garment/routes.ts`, `backend/src/db/migrations.ts`.
- 상태: **문서만. 코드·DB 마이그레이션·Lovable·배포·유료 서비스 없음. 아래 검증 시나리오는 실행하지 않음.**

## 1. 사용자 결정 (2026-10-26, 총괄 AUTH-001로 확정)
- 로그인: 이메일(아이디)+비밀번호와 카카오 둘 다 지원, **첫 구현은 카카오**.
- 시작부터 가입/로그인 필수(익명 체험 안 함). 동의는 가입 화면에서 필수/선택 개별로 받음. AI 분석 선택 동의를 거부해도 수동 입력으로 서비스 이용 가능.
- 로그아웃 전까지 재방문·브라우저 재시작에도 로그인 유지(단, 무기한 보장은 하지 않음 — 3장).
- 하의 사진은 탈퇴 전에도 개별 삭제 가능. 개인정보는 탈퇴 시까지 보관 후 삭제.

## 2. 데이터 (추가 마이그레이션, 기존 행 보존)
- `users(id, status: active|deleting, created_at, deleted_at)` — 이메일·닉네임은 필수 아님.
- `user_identities(id, user_id, provider: kakao|email, provider_subject, created_at, UNIQUE(provider, provider_subject))`. 카카오는 회원번호, 이메일 방식은 정규화한 이메일 + `password_hash`(원문 저장 금지) + `email_verified_at`. **이메일이 같아도 다른 로그인 수단을 자동 병합하지 않음**(병합은 로그인 상태에서 명시적 연결 기능으로만, 후속).
- `auth_sessions(id, user_id, token_hash(SHA-256), created_at, last_used_at, idle_expires_at, absolute_expires_at, authenticated_at, revoked_at, revoke_reason)`. 토큰 원문은 쿠키에만.
- `consent_documents(key, version, required, title, body_sha256, effective_at)`, `user_consents(user_id, key, version, granted, decided_at)` — 문서 버전이 바뀌면 필수 항목은 재동의 필요.
- `onboarding_sessions.user_id`(UNIQUE, NULL 허용) 추가: 계정당 취향 진행 1개. 하의(`garments`)는 지금처럼 onboarding_session에 매달려 결과적으로 계정 소유. 기존 익명 행은 그대로 두고 **계정에 자동 귀속하지 않음**(4장).

## 3. 로그인 유지(세션·쿠키)
- 쿠키: 운영 `__Host-auth`(Secure, Path=/, Domain 없음), 개발 `auth_dev`. `HttpOnly`, **`SameSite=Lax`**. 이유: 카카오에서 돌아오는 첫 이동에는 Strict 쿠키가 실리지 않음. CSRF는 기존대로 변경 요청의 `X-Onboarding-Request: 1` + Origin 검사로 막음.
- 기간(제안): 미사용 30일이면 만료(사용 시 연장, 하루 1회까지 갱신하며 토큰 교체), 마지막 로그인 후 최대 90일이면 재로그인. 무기한 유지 없음.
- 폐기: 로그아웃 = 현재 세션 폐기 + 쿠키 삭제. "모든 기기 로그아웃" = 계정의 전체 세션 폐기. 탈퇴·비밀번호 변경·침해 의심 = 전체 폐기. 폐기된 토큰은 다시 보내도 401.
- 재인증 예외: 탈퇴와 (후속) 비밀번호 변경·로그인 수단 연결은 최근 10분 안의 로그인(`authenticated_at`)이 필요, 아니면 401 `REAUTH_REQUIRED` → 카카오 재로그인(`prompt=login`).

## 4. 익명 데이터 정책
- 출시 전이라 실제 익명 사용자는 없음. 기존 익명 세션(개발·시험 DB)은 그대로 두고 계정에 붙이지 않으며 만료로 정리. 가입 후 화면은 새 취향 진행으로 시작.
- 나중에 필요하면 "이 기기의 진행 가져오기"를 로그인 상태 + 유효한 익명 쿠키 + 사용자 확인 버튼이 모두 있을 때만 허용(후속, 이번 계약 아님).

## 5. API (`/api/auth/*`, 쿠키 세션. 변경 요청은 `X-Onboarding-Request: 1`·Origin 검사)
| 메서드·경로 | 결과 |
|---|---|
| GET `/api/auth/kakao/start?returnTo=/경로` | 302 카카오 인가 화면. `state` 32바이트 난수를 해시로 저장하고 원문은 10분짜리 `auth_oauth` 쿠키(HttpOnly, Lax)에. `returnTo`는 같은 사이트 상대 경로만(아니면 `/`) |
| GET `/api/auth/kakao/callback?code&state` | state 일치·1회 사용 확인 → 서버에서 code 교환·회원번호 조회. 기존 계정: 세션 발급 후 302 `returnTo`. 신규: 10분짜리 가입 대기(`pending_signup`) 생성 후 302 `/signup`. 실패: 302 `/login?error=<코드>` |
| GET `/api/auth/signup/pending` | 200 `{provider, consents:[{key,version,required,title}]}` / 410 `SIGNUP_EXPIRED` |
| POST `/api/auth/signup` `{consents:[{key,version,granted}]}` | 201 `{user}` + 인증 쿠키. 필수 미동의 400 `CONSENT_REQUIRED`, 이미 가입된 수단 409 `IDENTITY_ALREADY_LINKED`, 만료 410 |
| GET `/api/auth/me` | 200 `{user:{id, providers:["kakao"], consents:{<key>:{version,granted}}}, session:{idleExpiresAt, absoluteExpiresAt}}` / 401 `AUTH_REQUIRED` |
| PUT `/api/auth/consents` `{key,version,granted}` | 선택 항목만 변경(예: AI 분석 철회). 필수 철회는 400 → 탈퇴로 안내 |
| POST `/api/auth/logout` | 204, 현재 세션 폐기·쿠키 삭제(이미 무효여도 204) |
| POST `/api/auth/logout-all` | 204, 전체 세션 폐기 |
| DELETE `/api/auth/account` | 204. 최근 인증 필요(아니면 401 `REAUTH_REQUIRED`). 세션 전부 폐기 → 취향·하의 행과 **사진 파일 삭제** → 동의·로그인 수단·계정 삭제 → 카카오 연결 끊기 요청. 파일 삭제 실패는 500으로 행 보존(기존 garment 원칙), `status=deleting`으로 재시도 |
| DELETE `/api/onboarding/session/garment` (기존) | 개별 하의(사진+정보) 삭제. 소유자는 로그인 계정의 취향 진행 |
- 가입 전 차단: `/api/onboarding/*`(카탈로그 공개 조회 제외)와 garment 경로는 인증 세션이 없으면 401 `AUTH_REQUIRED`. 기존 익명 `POST /api/onboarding/session`은 로그인 계정의 진행을 만들거나 돌려주는 것으로 바뀜(익명 생성 중단). 공개 화면: 인트로·로그인·가입 동의·개인정보 방침·약관·404.
- 오류 형식은 기존 `{error:{code,message},requestId}` 그대로. 추가 코드: `AUTH_REQUIRED`(401), `REAUTH_REQUIRED`(401), `OAUTH_STATE_INVALID`·`OAUTH_DENIED`(콜백 리다이렉트용), `OAUTH_PROVIDER_ERROR`(502), `CONSENT_REQUIRED`(400), `IDENTITY_ALREADY_LINKED`(409), `SIGNUP_EXPIRED`(410), `RATE_LIMITED`(429).
- 다른 계정 데이터: 모든 조회·삭제는 `세션 → user → 그 사용자의 onboarding_session`으로만 찾음. URL·본문의 ID로 소유자를 정하지 않음(기존 원칙).

## 6. 이메일+비밀번호 (후속 구현 계약)
- 비밀번호는 솔트 포함 느린 해시만 저장(Node 내장 `scrypt` 또는 승인 시 argon2id), 원문·복호화 가능 형태 금지. 최소 길이 10자, 흔한 비밀번호 차단 목록.
- 이메일 인증·재설정: 32바이트 1회용 토큰을 해시로 저장, 인증 24시간·재설정 30분 만료. 재설정 성공 시 전체 세션 폐기. 메일 발송 서비스 필요(유료 여부 결정).
- 로그인 시도 제한(계정·IP별), 오류 문구는 "이메일 또는 비밀번호가 올바르지 않아요"로 통일.

## 7. 동의 (가입 화면, 필수/선택 개별 체크)
| key | 구분 | 내용 | 비고 |
|---|---|---|---|
| `terms` | 필수 | 서비스 이용약관 | 문안 미작성 |
| `privacy_required` | 필수 | 계정 식별(카카오 회원번호), 취향 응답, 하의 사진·정보 수집·이용, 탈퇴 시까지 보관 | 운영자·책임자·연락처 빈칸 |
| `ai_analysis` | 선택 | 하의 사진을 AI 분석 공급자 **[미정]**에 보내 속성 추정. 국외 이전 시 국가·업체 **[미정]** | 미확정 상태에서는 실제 전송 금지. 거부 시 분석 경로 403 `CONSENT_REQUIRED`, 수동 입력은 그대로 |
| `marketing` | 선택(보류) | 마케팅 수신 | 필요해질 때만 추가 |
- 만 14세 미만 가입 제한 문구(또는 법정대리인 동의) 결정 필요. 법률 검토 필요.

## 8. 필요한 설정·사용자 입력
- 설정(서버 환경변수, Git 금지): `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`(= `PUBLIC_ORIGIN` + `/api/auth/kakao/callback`), 세션 기간 값.
- 사용자 입력: 카카오 개발자 앱 등록(무료, 동의항목은 회원번호만·닉네임 선택·이메일 불필요), 개발용 리다이렉트 주소 등록, 운영 도메인, 운영 주체 이름·개인정보 책임자·연락처, 약관·방침 문안 법률 검토, 14세 미만 정책, 이메일 방식 착수 시 메일 발송 서비스.

## 9. 검증 시나리오 (구현 시 실행, 지금은 미실행)
1. 로그인 없이 `/api/onboarding/*`·garment 호출 → 401 `AUTH_REQUIRED`, 화면은 로그인으로 이동. 공개 화면은 열림.
2. 카카오 신규: start → (가짜 카카오 서버) callback → `/signup` → 필수 미체크 400 → 체크 후 201, 계정·로그인 수단·동의 버전 기록.
3. state 위조·재사용·10분 초과 → 실패 리다이렉트, 계정 생성 0.
4. 브라우저 재시작(쿠키 유지) → `/me` 200. 미사용 30일·최대 90일 경과(시계 조작) → 401.
5. 로그아웃 → 같은 토큰 재전송 401(재사용 차단). logout-all → 다른 기기 토큰도 401.
6. 계정 A의 쿠키로 계정 B의 사진·정보 접근 불가(경로상 ID 없음, B 데이터 0건 노출).
7. 하의 개별 삭제 → 사진 파일·행 삭제, 계정·취향은 유지.
8. 탈퇴: 최근 인증 없으면 401 `REAUTH_REQUIRED` → 재로그인 후 204, 계정·세션·동의·취향·하의 행과 사진 파일 0, 같은 카카오로 다시 오면 신규 가입 흐름.
9. AI 선택 동의 거부 → 분석 경로 403, 사진·정보 수동 저장은 정상. `ai_analysis` 공급자 미정 상태에서는 외부 전송 0.
10. 같은 이메일의 이메일 계정과 카카오 계정이 자동으로 합쳐지지 않음.
11. 기존 익명 세션 쿠키만 있는 브라우저 → 401, 기존 익명 데이터는 어떤 계정에도 붙지 않음.

## 10. AUTH Work List (총괄 Work List 반영용)
- [x] AUTH-001 계약 설계(이 문서) — 미구현·미시험.
- [ ] AUTH-002 백엔드 카카오 최소 구현: 마이그레이션(users·identities·auth_sessions·consent·onboarding_sessions.user_id), start/callback(가짜 카카오 서버로 테스트), signup·me·logout·logout-all, 기존 onboarding/garment 경로 인증 필수화, 시나리오 1~8·10·11 자동 테스트. 선행: 카카오 개발자 앱 키(사용자).
- [ ] AUTH-003 프론트(Lovable): 로그인·가입 동의·로그아웃·탈퇴 화면, 401 시 로그인 이동. 선행: AUTH-002 계약 고정.
- [ ] AUTH-004 탈퇴·삭제 완성: 재인증, 파일 삭제 재시도, 카카오 연결 끊기, 시나리오 8.
- [ ] AUTH-005 이메일+비밀번호(6장): 해시·인증·재설정·시도 제한. 선행: 메일 발송 서비스 결정.
- [ ] 결정 대기: 약관·방침 문안과 법률 검토, 운영자 정보, 14세 미만 정책, 운영 도메인, AI 공급자(동의 빈칸).
