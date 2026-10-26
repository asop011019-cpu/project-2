# AUTH-004 회원 탈퇴 백엔드

- 브랜치 `feature/auth-002-kakao`(AUTH-002 위에 이어서). 설계: `docs/AUTH-001.md` 9-1장. 사용자 지시("남은 일 진행")로 착수, 화면은 AUTH-003.
- 계약: `DELETE /api/auth/account` (본문 `{}`, `X-Onboarding-Request: 1`). 최근 로그인(기본 10분, `reauthWindowSeconds`)이 아니면 401 `REAUTH_REQUIRED` → `GET /api/auth/kakao/start?reauth=1&returnTo=…`(카카오에 `prompt=login`, 비밀번호 재입력)로 다시 로그인 후 재시도. 성공 204 + 로그인 쿠키 삭제.

## 삭제 순서 (재시도 가능)
1. 한 트랜잭션: 계정 `status=deleting`(새 로그인은 `/login?error=ACCOUNT_UNAVAILABLE`), 계정의 로그인 세션 전부 폐기, 삭제 작업 행(`account_deletions`: 카카오 회원번호·단계·시도 횟수·마지막 오류) 기록. 마이그레이션 v5.
2. 하의 사진 파일과 취향·하의 행 삭제(기존 onboarding 삭제 경로 재사용, 이미 없는 파일은 삭제된 것으로 봄 — 탈퇴 경로에서만). 실패하면 작업 행에 오류만 남기고 계정은 잠긴 채 유지.
3. 계정 행 삭제(로그인 수단·세션·동의·동의 이력은 함께 삭제).
4. 카카오 연결 끊기(`POST kapi.kakao.com/v1/user/unlink`, Admin 키 필요). 성공(또는 이미 끊김 -101)하면 작업 행에서 회원번호를 지우고 `done`.
- 남은 작업은 서버 시작 시와 새 탈퇴 요청 때 자동 재개(로그인 불필요). 같은 카카오로 다시 오면 3단계 이후엔 신규 가입.
- Admin 키(`KAKAO_ADMIN_KEY`)가 없으면 2·3단계(개인 데이터 삭제)는 끝나고, 4단계만 `KAKAO_UNLINK_NOT_CONFIGURED`로 대기하며 회원번호만 남김. 키를 넣고 서버를 재시작하면 마무리됨.

## 검증 (2026-10-26)
| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 통과 |
| `npm test` | 50개 중 49 통과, 1 실패 = 기존 Windows symlink EPERM |
| 신규 `test/account-deletion.integration.test.ts`(가짜 카카오, 테스트 전용) | ① 최근 로그인 아님 401 `REAUTH_REQUIRED`·재인증 URL `prompt=login` → 재로그인 후 204, 옛 쿠키 401, 해당 계정의 users·identities·auth_sessions·consents·consent_events·onboarding 0행, 사진 파일 삭제, 다른 계정 사진 유지, 작업 `done`·회원번호 삭제, 같은 카카오는 신규 가입으로 ② 사진 삭제 실패(파일 자리를 폴더로 바꿈) → 204 후 작업 `pending`·계정 잠김·세션 폐기·재로그인 `ACCOUNT_UNAVAILABLE` → 디스크 복구 후 **서버 재시작으로 재개**해 `done` ③ Admin 키 없음 → 데이터는 삭제·`data_deleted`·회원번호만 보관 → 연결 끊기 장애 → 정상화 후 `done` |
| 변이 확인 | 재인증 시간 검사를 무력화하면 ①이 실패로 검출 |
- 기존 하의 API의 "파일 삭제 실패 시 500·행 보존" 규칙은 그대로(이미 없는 파일 허용은 탈퇴 경로에서만).

## 미실행·설정 필요
- 실제 카카오 연결 끊기 미검증: 카카오 콘솔의 **Admin 키**를 `backend/.env`의 `KAKAO_ADMIN_KEY=`에 사용자가 직접 입력해야 함(채팅 전달 금지). 없으면 위 ③처럼 대기.
- 탈퇴 화면·확인 문구·재인증 안내는 AUTH-003(Lovable)에서.
