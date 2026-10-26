# 프론트 소스 출처

- 원본: Lovable 프로젝트 `2e53d734-faa7-4653-9223-694a742cc564`
- 기준 커밋: `d5703cd9ddaff911f9ec53acfd111888fb5023a2` (ONB-004-R1, 총괄 제공 diff로 반영; 그 전 e4809c4 ONB-003-R2, 3ba3a3d ONB-003-R1, 29921715 이후 바뀐 파일을 같은 방법으로 반영, `vite.config.ts`는 로컬 프록시 버전 유지)
- 가져온 날짜: 2026-10-26, Claude Code (INT-001-A)
- 방법: Lovable MCP `get_diff`(빈 트리 `4b825dc…` → `29921715`)로 전체 파일 111개를 받아 복원. 텍스트가 아닌 2개(`public/favicon.svg`, `public/apple-touch-icon.png`)와 내용이 비어 온 1개(`.lovable/plan/…md`)는 `read_file` 또는 미리보기 주소에서 같은 커밋 기준으로 따로 받음. Lovable 파일 목록(111개)과 개수 일치, `src/lib/swipe.ts`로 내용 일치 확인.
- 이미지: `src/assets/*.asset.json`은 Lovable 자산 저장소 주소를 가리킴(이미지 파일 자체는 저장소에 없음). 원본은 `C:\Users\yuzuh\code\design-references\intro-images`.
- 자동 동기화 없음. Lovable에서 바뀐 내용은 같은 방법으로 다시 가져와야 함.
- 로컬 실행·검사 방법과 결과는 `docs/INT-001-B.md` 참조(npm 설치, bun.lock과 버전 차이 가능).
- 로컬 개발용 사진: `public/__l5e/assets-v1/…`에 인트로 사진 2장(자산 경로와 동일 위치).
