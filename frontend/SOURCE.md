# 프론트 소스 출처

- 원본: Lovable 프로젝트 `2e53d734-faa7-4653-9223-694a742cc564`
- 기준 커밋: `9edc536` (COND-001 코디 조건 화면 `/conditions`·의류 화면 진입 버튼, 6570b9b 이후 10개 파일 반영. 앞서 로컬에만 있던 재확인 저장 수정(`confirmPending`)·테스트 시간 제한도 이 커밋에 들어가 로컬 형태를 Lovable 원본과 맞춤 → 이 작업으로 Lovable 크레딧 전량 소진. **이후 프론트는 Claude Code가 로컬에서 직접 수정**(사용자 확정 2026-10-28, Lovable 동기화 없음). 9edc536 이후 로컬 변경: 조건 화면 문구 중복 제거·조건 안내, `auth-routing.ts` returnTo 중첩 수정; 그 전 `6570b9b` GAR-002-R1 접힌 요약 행 + 시트; 그 전 `d0d0d58` GAR-002 기준 옷 4종·옷 정보 확인; 그 전 `21acf7e` AUTH-005-UI 탈퇴 확인 체크·한국 시간 마감 표시·복구 만료 안내, e1c9a74 이후 6개 파일 반영; 그 전 `e1c9a74` AUTH-004-R2 탈퇴 30일 안내·계정 복구 화면, 0fcb4ce 이후 바뀐 파일만 반영; 그 전 `0fcb4ce740d34700f9e7347344e79bda06a8b110` AUTH-003 로그인·가입 동의·계정 화면, ad1b75af 인트로 수정 포함, d5703cd9→0fcb4ce diff 적용 + styles.css는 Lovable 전체본; 그 전 9c2ac58a CUR-004-R1 모바일 사진 칸 CSS 1줄; 그 전 d5703cd9 ONB-004-R1, 총괄 제공 diff로 반영; 그 전 e4809c4 ONB-003-R2, 3ba3a3d ONB-003-R1, 29921715 이후 바뀐 파일을 같은 방법으로 반영, `vite.config.ts`는 로컬 프록시 버전 유지)
- 가져온 날짜: 2026-10-26, Claude Code (INT-001-A)
- 방법: Lovable MCP `get_diff`(빈 트리 `4b825dc…` → `29921715`)로 전체 파일 111개를 받아 복원. 텍스트가 아닌 2개(`public/favicon.svg`, `public/apple-touch-icon.png`)와 내용이 비어 온 1개(`.lovable/plan/…md`)는 `read_file` 또는 미리보기 주소에서 같은 커밋 기준으로 따로 받음. Lovable 파일 목록(111개)과 개수 일치, `src/lib/swipe.ts`로 내용 일치 확인.
- 이미지: `src/assets/*.asset.json`은 Lovable 자산 저장소 주소를 가리킴(이미지 파일 자체는 저장소에 없음). 원본은 `C:\Users\yuzuh\code\design-references\intro-images`.
- 자동 동기화 없음. Lovable에서 바뀐 내용은 같은 방법으로 다시 가져와야 함.
- 로컬 실행·검사 방법과 결과는 `docs/INT-001-B.md` 참조(npm 설치, bun.lock과 버전 차이 가능).
- 로컬 개발용 사진: `public/__l5e/assets-v1/…`에 인트로 사진 2장(자산 경로와 동일 위치).
