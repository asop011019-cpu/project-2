# 프론트 소스 출처

- 원본: Lovable 프로젝트 `2e53d734-faa7-4653-9223-694a742cc564`
- 기준 커밋: `29921715b1fdc9bbc1c1d1bd4ed0d916fec0ab07` (DES-002-R1, 2026-10-25T17:59Z)
- 가져온 날짜: 2026-10-26, Claude Code (INT-001-A)
- 방법: Lovable MCP `get_diff`(빈 트리 `4b825dc…` → `29921715`)로 전체 파일 111개를 받아 복원. 텍스트가 아닌 2개(`public/favicon.svg`, `public/apple-touch-icon.png`)와 내용이 비어 온 1개(`.lovable/plan/…md`)는 `read_file` 또는 미리보기 주소에서 같은 커밋 기준으로 따로 받음. Lovable 파일 목록(111개)과 개수 일치, `src/lib/swipe.ts`로 내용 일치 확인.
- 이미지: `src/assets/*.asset.json`은 Lovable 자산 저장소 주소를 가리킴(이미지 파일 자체는 저장소에 없음). 원본은 `C:\Users\yuzuh\code\design-references\intro-images`.
- 자동 동기화 없음. Lovable에서 바뀐 내용은 같은 방법으로 다시 가져와야 함.
- 이 폴더에서는 아직 설치·빌드·테스트를 실행하지 않음.
