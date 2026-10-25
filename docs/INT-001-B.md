# INT-001-B 로컬 같은 출처 연결과 실제 세션 복원

- 브랜치: `integration/int-001-b-local-session` (기준 `integration/int-001-a-prep` 0a7a9a67fefc509c605c32664bfa8ae77e72ab23)
- 프론트 소스: Lovable `29921715b1fdc9bbc1c1d1bd4ed0d916fec0ab07` (`frontend/SOURCE.md`)
- 범위: 개발 서버 `/api`·`/media` 프록시와 로컬 실행 방법. API·DB 계약, UI, 쿠키·출처 검사는 바꾸지 않음. v4 마이그레이션·탐색 API 병합 없음.
- 공개 Lovable 미리보기는 이 연결과 무관함(로컬 브라우저 주소에서만 확인).

## 1. 변경

- `frontend/vite.config.ts`: `vite dev`에서만 `/api`, `/media`를 `BACKEND_URL`(기본 `http://127.0.0.1:3001`)로 전달. `changeOrigin: false`로 Host 외 헤더(Cookie, Origin, Sec-Fetch-Site, X-Onboarding-Request)와 응답(Set-Cookie, 상태, 본문)을 그대로 통과. 배포 빌드에는 영향 없음.

## 2. 로컬 실행

필요: Node 24.19 이상(확인: 24.22.1). 전역 도구 추가 설치 없음.

1. 의존성
   - 백엔드: `npm --prefix backend ci` (저장소 `package-lock.json` 기준)
   - 프론트: `npm --prefix frontend install --no-package-lock`
     - 프론트 잠금 파일은 `bun.lock`인데 이 PC에 bun이 없어 npm으로 `package.json` 범위 기준 설치함. 따라서 실제 설치 버전이 Lovable(bun.lock)과 다를 수 있음. npm 잠금 파일은 만들지 않았고 커밋하지 않음.
2. 백엔드 설정: `backend/.env` (gitignore 대상, 커밋 안 함)
   ```
   HOST=127.0.0.1
   PORT=3001
   PUBLIC_ORIGIN=http://localhost:8080
   DATABASE_PATH=./data/int-001-b/onboarding.sqlite
   GARMENT_ROOT=./data/int-001-b/garments
   ```
   - `PUBLIC_ORIGIN`은 브라우저 주소와 정확히 같아야 함. `127.0.0.1:8080`으로 열면 출처 불일치 403.
   - 개발 모드(HTTP)라 쿠키 이름은 `onboarding_dev`, `HttpOnly; SameSite=Strict; Path=/`, Secure 없음(기존 설정 그대로).
3. 실행 (터미널 2개)
   - `npm --prefix backend run dev` → `http://127.0.0.1:3001` (loopback만)
   - `npm --prefix frontend run dev -- --host localhost --port 8080 --strictPort` → `http://localhost:8080`
   - Windows PowerShell에서 실행 정책 때문에 `npm`이 막히면 `npm.cmd`로 실행(시스템 설정 변경 불필요).
4. 확인 주소: `http://localhost:8080`
5. 정리: 두 터미널에서 Ctrl-C. 테스트 데이터만 지우려면 `backend/data/int-001-b/` 폴더(이번 검증용으로 새로 만든 것)만 삭제. 다른 `backend/data` 내용은 건드리지 않음.

## 3. 실제 검증 (실제 Node 서버 + 격리 SQLite, 2026-10-26)

브라우저: Claude 데스크톱 앱 내장 브라우저에서 `http://localhost:8080`. 세션 비교에는 공개 세션 ID의 SHA-256 앞 4바이트만 사용, 쿠키·ID 원문은 기록하지 않음.

| 항목 | 방법 | 결과 |
|---|---|---|
| 세션 생성 | 첫 방문 → 프론트가 POST `/api/onboarding/session` | 201, Set-Cookie(HttpOnly, JS에서 쿠키 안 보임) |
| 세션 조회 | GET `/api/onboarding/session` | 200 |
| 실제 저장 | 범주 "남성복" 선택 → PUT `/session/category`, GET `/catalog?categoryId=menswear` | 둘 다 200. 화면은 "콘텐츠 준비 중"(승인 이미지 0장, 정상 빈 상태). "서버 연결 실패" 배너 없음 |
| 새로고침 복원 | 같은 탭 새로고침 | POST session 200(기존), 세션 해시 동일, 범주 menswear 유지 |
| 백엔드 재시작 후 재방문 | 백엔드 종료·재실행 → 새 탭으로 방문 | POST session 200, 해시 동일, 범주 유지 |
| 잘못된 쿠키 | 브라우저 쿠키는 그대로 두고 백엔드만 빈 격리 DB(`alt.sqlite`)로 실행 → 방문 | POST session 401. 이후 DELETE/POST 자동 호출 없음. 범주 화면에 "이전 기록을 불러오지 못했어요" + "새로 시작" 버튼(누르기 전에는 아무것도 삭제 안 함) |
| 잘못된 쿠키(직접) | 프록시 경유 POST/GET에 `onboarding_dev=<무효 값>` | 둘 다 401 SESSION_REQUIRED |
| 헤더 누락 | 프록시 경유 POST, X-Onboarding-Request 없음 | 403 REQUEST_HEADER_REQUIRED |
| 출처 불일치 | Origin `http://evil.example` | 403 ORIGIN_NOT_ALLOWED |
| cross-site | Sec-Fetch-Site: cross-site | 403 ORIGIN_NOT_ALLOWED |
| /media 전달 | GET `/media/none.png` | 404 IMAGE_UNAVAILABLE(백엔드 JSON 응답이 그대로 전달됨) |
| 바인딩 | `netstat` | 백엔드 127.0.0.1:3001만 LISTEN |

검사·빌드 결과는 아래 4장.

## 4. 검사·빌드

실행 환경: Windows 10, Node 24.22.1, git `core.autocrlf=true`.

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` (frontend) | 통과 (처음엔 새 설정의 `process.env.BACKEND_URL` 표기로 TS4111 오류 → `process.env["BACKEND_URL"]`로 수정 후 통과) |
| `npx vitest run` (frontend) | 8 파일, 76/76 통과 (npm 설치본 기준) |
| `npx vite build` (frontend) | 성공 |
| `npm --prefix backend run typecheck` | 통과 |
| `npm --prefix backend test` | 35개 중 34 통과, 1 실패: "local media references reject … escaping symlinks" — Windows에서 관리자 권한/개발자 모드 없이 심볼릭 링크 생성 불가(EPERM). 코드가 아닌 환경 제약 |
| `npm --prefix backend run check` | `format:check`에서 중단: 체크아웃 파일이 CRLF(autocrlf)라 Prettier가 전 파일 경고. 저장소의 LF 원본 문제 아님. 이 때문에 check 안의 typecheck·test는 위처럼 따로 실행 |

프론트 lint와 디자인 관련 UI 검사는 같은 버전에서 Lovable이 이미 실행했으므로 반복하지 않음.

## 5. 남은 점

- 모델 사진: `src/assets/*.asset.json`의 `url`은 Lovable 자산 경로(`/__l5e/assets-v1/...`)라 원래 Lovable 호스팅에서만 열림. 로컬에서도 보이도록 같은 경로에 원본을 넣음 — `frontend/public/__l5e/assets-v1/<asset_id>/intro-menswear.jpg`, `.../intro-womenswear.jpg` (Lovable 자산과 크기 동일한 900×1600 원본, 출처 `design-references/intro-images`). 소스 코드는 바꾸지 않음. 로컬 `http://localhost:8080`에서 인트로와 범주 카드 두 장 모두 표시 확인. 공유용 `intro-share.jpg`는 화면에 쓰이지 않아(SITE_URL 설정 시 og:image) 넣지 않음. 실서비스 호스팅 시 이미지 위치는 다시 정해야 함.
- 취향 응답·하트·위치·완료와 하의 사진 등록/삭제의 브라우저 실연동은 이번 범위 밖(다음 단위).
- 운영 배포용 같은 출처 연결(Worker 서버 라우트 프록시 또는 리버스 프록시)과 백엔드 호스트는 미정.
- v3 마이그레이션 충돌·탐색 API 병합은 보류(INT-001-A 제안 유지).
