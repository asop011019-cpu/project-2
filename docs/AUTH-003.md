# AUTH-003 로그인·가입 동의·계정 화면 통합과 실제 카카오 확인

- 브랜치 `feature/auth-002-kakao`(AUTH-002·AUTH-004 위). 사용자 지시("남은 일 진행"), OPS-007에 따라 Claude Code가 Lovable에 직접 1회 요청.
- Lovable 요청 `umsg_01m5w40hfqe1c9dtchsk3zgkm1`(기준 9c2ac58a) → 최종 `0fcb4ce740d34700f9e7347344e79bda06a8b110`, **8.1 크레딧**(사용자 확인 잔액 34 → 약 25.9). Lovable 보고: vitest 117/117, lint 오류 0(경고 6), 타입 통과, 실제 백엔드·카카오 미검증.

## 1. 통합
- `get_diff` d5703cd9→0fcb4ce(25파일)를 이 저장소의 d5703cd9 반영 커밋(e626706) 기준으로 적용, 모든 hunk 일치. 그동안 빠져 있던 ad1b75af(인트로 AI 글귀 제거)도 함께 들어옴. `styles.css`만 이전 로컬 Prettier 줄바꿈 차이로 hunk가 안 맞아 Lovable 전체본(빈 트리 기준 diff에서 추출)으로 교체.
- 검증: Lovable 0fcb4ce 전체 소스와 이 브랜치 `frontend/src` 103개 파일이 Prettier 정리 후 **모두 동일**. `vite.config.ts`는 로컬 프록시 버전 유지. 출처 `frontend/SOURCE.md` 갱신.
- 추가 화면: `/login`, `/signup`, `/consent-update`, `/account`(+ `auth-api.ts`, `auth-routing.ts`, 401 `AUTH_REQUIRED`→로그인·403 `CONSENT_UPDATE_REQUIRED`→재동의 이동, 탐색·하의 화면의 "내 계정" 버튼, 인증 이동 중 입력 보존).

## 2. 검사 (worktree `frontend/`, 로컬 npm 설치본)
| 명령 | 결과 |
|---|---|
| `npx vitest run` | 10파일 117/117 통과 |
| `npx tsc --noEmit` | 통과 |
| `npx eslint .` | 줄바꿈만 다른 worktree(CRLF 체크아웃)라 `prettier/prettier` 8576건이 전부 CRLF → `--rule 'prettier/prettier: [error, {endOfLine: auto}]'`로 오류 0, 경고 6(기존) |
| 백엔드 `npm test` | 50개 중 49 통과(기존 Windows symlink EPERM 1) |

## 3. 실제 카카오·브라우저 확인 (2026-10-26, 사용자 카카오 계정, 내장 브라우저)
- 구성: worktree 프론트 `localhost:8095`(vite, `/api`→`localhost:3095`) + worktree 백엔드 `localhost:3095`(격리 DB `backend/data/kakao-live`, v4→v5 이전 시 계정 1개 보존).
| 흐름 | 결과 |
|---|---|
| 비로그인 인트로 "내 취향 찾기" | `/login?returnTo=/?explore=1`, 노란 카카오 버튼 |
| 카카오(기존 회원) | 가입 없이 `/?explore=1` 범주 화면 |
| `/account` | 로그인 수단 카카오, 필수 2개 "동의함", AI 선택 스위치, 로그아웃·모든 기기·탈퇴 |
| AI 동의 스위치 켜기/끄기 | 서버 반영(true→false) |
| 탈퇴 확인 → 탈퇴하기 | 확인 대화상자(계정·취향 기록·하의 사진·정보 삭제, 되돌릴 수 없음) → `/`, "회원 탈퇴가 완료됐어요", `/me` 401. DB: users·identities·sessions·consents·events·계정 취향 0, 삭제 작업 `data_deleted`(Admin 키 없어 카카오 연결 끊기 대기) |
| 같은 카카오 재진입(신규) | `/signup`: 필수/선택 표시·본문 펼치기(서버 본문 그대로)·필수 전 가입 버튼 비활성 → "필수 항목 모두 동의"로 필수 2개만 체크 → 가입 → `/?explore=1`, AI false |
| 로그아웃 | `/login?returnTo=/`, `/me` 401 |
| 비로그인 `/garment` | `/login?returnTo=/garment` |
- 발견·수정: 동의 문서 제목에 이미 "(필수)/(선택)"이 있어 화면에 "(필수) (필수)" 중복 → 백엔드 문서 제목에서 표시 제거(화면이 `required`로 표시). 같은 버전의 제목만 갱신하도록 `syncConsentDocuments` 보완(본문 해시 불변 검사는 유지).
- 참고(미수정): Lovable 타입에서 동의 `version`을 string으로 선언(백엔드는 number). 값을 그대로 돌려보내 동작 문제 없음 — 다음 Lovable 일괄 요청 때 정정 권장.

## 4. 미확인
- 재인증 흐름(로그인 10분 경과 후 탈퇴 → 카카오 비밀번호 재입력 → 확인 대화상자 재표시)은 실제 시간 경과가 필요해 브라우저로는 미실행(백엔드 테스트·Lovable 테스트로 갈음). 재동의 화면(필수 문서 새 버전)도 실제 문서 버전이 없어 미실행.
- 실제 카카오 연결 끊기: Admin 키 미입력. 휴대폰 실기기 미실행.
