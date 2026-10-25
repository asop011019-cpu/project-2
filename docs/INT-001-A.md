# INT-001-A 통합 준비 결과

- 브랜치: `integration/int-001-a-prep` (기준 `feature/gar-001-base-garment` e9692a199b6bc662b808950d84bc20249822e122)
- 프론트: `frontend/` = Lovable `29921715b1fdc9bbc1c1d1bd4ed0d916fec0ab07` 전체 소스 (출처: `frontend/SOURCE.md`)
- 범위: 소스 확보와 정적 대조만. API·DB 동작은 바꾸지 않았고, 설치·빌드·테스트·실행 연동은 하지 않음.

## 1. 계약 대응표 (정적 대조)

전송 규칙: 프론트는 같은 출처 상대 경로 `/api/...`, `credentials: "include"`, 변경 요청(POST/PUT/DELETE)에만 `X-Onboarding-Request: 1`. 백엔드 `app.ts` onRequest 훅은 GET/HEAD/OPTIONS 외 요청에 이 헤더를 요구하고, `Origin`이 있으면 `PUBLIC_ORIGIN`과 같아야 하며 `Sec-Fetch-Site: cross-site`를 거절. → 일치.

| 기능 | 프론트 호출 (파일) | 백엔드 경로 (GAR-001) | 결과 |
|---|---|---|---|
| 익명 세션 생성/복원 | POST `/api/onboarding/session` `{}` (session-api `createSession`, garment `ensureSession`) | POST `${prefix}/session` (201 신규/200 기존, 잘못된 쿠키 401) | 일치 |
| 세션 조회 | GET `/api/onboarding/session` | GET `${prefix}/session` | 일치 |
| 세션 초기화 | DELETE `/api/onboarding/session` 후 POST (사용자 확인 후에만) | DELETE `${prefix}/session` (204, 쿠키 제거). POST `/session/reset`도 있으나 프론트 미사용 | 일치 |
| 추천 범주 | PUT `/session/category` `{categoryId}` | PUT `${prefix}/session/category` | 일치 |
| 분류·스타일 목록 | GET `/catalog?categoryId=`, GET `/styles/:styleId` | 같은 경로 | 일치 |
| 스타일 응답 | PUT `/session/styles/:id/response` `{response, nextStyleId?}` | 같은 경로 | 일치 |
| 사진 선호(하트) | PUT `/session/styles/:id/images/:imageId/preference` `{selected}` | 같은 경로 | 일치 |
| 탐색 위치 | PUT `/session/position` `{styleId}` | 같은 경로 | 일치 |
| 취향 확인/완료 | GET `/session/summary`, POST `/session/complete` `{}` | 같은 경로 | 일치 |
| 하의 조회 | GET `/api/onboarding/session/garment` → `{garment\|null}` | 같은 경로, 세션 필수(없으면 401) | 일치 (프론트가 먼저 POST session 호출) |
| 하의 저장/교체 | PUT 같은 경로, multipart `metadata`(JSON) + 선택 `image` | `metadata`/`image` 필드명 동일, 사진은 PNG로 정규화 | 일치 |
| 하의 삭제 | DELETE 같은 경로 | 같은 경로 (204) | 일치 |
| 하의 사진 | `imageUrl?v=updatedAt` | GET `/api/onboarding/session/garment/image` (`v` 쿼리 허용, image/png) | 일치 |
| 스타일 이미지 | API의 `originalUrl`/`thumbnailUrl` (`/media/...`) | GET `/media/*` (게시 조건 충족분만) | 일치, 단 프록시 필요 |

쿠키: 백엔드가 httpOnly, `SameSite=Strict`, `path=/`, 30일, HTTPS면 Secure로 설정. 프론트는 쿠키를 읽지 않음 → 브라우저가 같은 출처로 볼 때만 동작.

## 2. 차단 문제

1. **같은 출처 연결이 없음 (핵심).** 프론트는 Lovable의 Cloudflare Worker(TanStack Start, nitro)에서 돌고, 백엔드는 Node(Fastify + SQLite + sharp + 로컬 파일)라 Worker 안에서 실행할 수 없음. 지금 미리보기에서 `/api`는 백엔드로 가지 않아 "서버 연결 실패" 미리보기 상태가 정상 동작임.
2. **백엔드를 띄울 곳이 정해지지 않음.** 공개 HTTPS 주소의 Node 호스트(또는 로컬 개발용 터널)가 있어야 프록시를 붙일 수 있음.
3. **v3 마이그레이션 충돌** (아래 3장). 현재 프론트는 photo-exploration API를 쓰지 않으므로 GAR-001만으로 연결하는 데는 막히지 않음.

## 3. DB v3 충돌과 제안

- GAR-001 `migrations.ts`: 3번째 항목 = `garments` 테이블.
- `feature/onboarding-backend`: 3번째 항목 = `photo_explorations`, `session_genres` (CREATE TABLE IF NOT EXISTS).
- 두 브랜치 모두 `PRAGMA user_version = 3`이 되므로, 한쪽으로 만든 DB를 다른 쪽 코드가 열면 상대 테이블이 생기지 않음. 병합 시 같은 줄에서 충돌.
- 제안(데이터 삭제·새 DB 없이):
  1. 3번은 GAR-001의 `garments` 그대로 둔다.
  2. 4번을 새로 추가해 `photo_explorations`, `session_genres`, `garments`를 모두 `CREATE TABLE IF NOT EXISTS`로 만든다. 어느 쪽 계보의 v3 DB든 4번에서 빠진 테이블만 채워지고 기존 행은 그대로.
  3. onboarding-backend의 탐색 API는 이 4번이 들어간 뒤에 별도 작업으로 병합한다(게시 기준 4장/1장 결정과 함께).
- 이번에는 코드에 반영하지 않음(API/DB 변경 금지 범위).

## 4. 최소 통합안과 다음 구현 단위

다음 단위 하나: **실제 익명 세션 생성·복원을 같은 출처로 연결.**
1. 백엔드를 HTTPS Node 호스트에 실행(`PUBLIC_ORIGIN` = 프론트 공개 주소, `NODE_ENV=production`).
2. 프론트 `src/routes/api/$.ts`, `src/routes/media/$.ts` 서버 라우트에서 `BACKEND_URL`(서버 전용 환경변수)로 그대로 전달하는 프록시를 둔다: 메서드·본문(multipart 포함)·`Cookie`·`X-Onboarding-Request`·`Origin`·`Sec-Fetch-Site`를 그대로 넘기고, 응답의 `Set-Cookie`·상태·본문을 그대로 돌려준다. 백엔드 계약 변경 없음.
3. 검증 순서: POST/GET session(쿠키 생성·재방문 복원, 잘못된 쿠키 401 시 자동 초기화 없음) → 범주·응답·위치·완료 → 하의 GET/PUT/DELETE·사진.
4. 로컬 개발은 백엔드 `npm run dev`(3001) + 프론트 개발 서버 프록시로 같은 순서를 먼저 확인.

## 5. 검증 구분

- 정적 검토: 위 대응표, 쿠키·헤더·출처 규칙, 마이그레이션 구조를 실제 소스로 대조함.
- 실행 검증: 하지 않음(이번 범위 밖). 프론트 테스트 76/76은 Lovable의 기존 결과이며 이 브랜치에서 다시 실행하지 않음.
