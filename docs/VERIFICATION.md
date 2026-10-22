# 구현·검증 보고 (2026-10-23)

## 구현 범위와 변경 파일

화면을 만들지 않고 `backend/`에 온보딩 API만 신규 구현했습니다. 최초 확인 시 원격 `project-2`에는 브랜치·커밋·파일이 없었으며 로컬 미반영 변경도 없었습니다. 기존 `project` 저장소는 수정하지 않았습니다. 작업은 `feature/onboarding-backend`에서 시작했습니다.

- 모델·규칙: `src/modules/onboarding/types.ts`, `domain.ts`, `validation.ts`.
- 서비스·저장: `service.ts`, `ports.ts`, `repository.ts`, `src/db/connection.ts`, `migrations.ts`.
- API·인증·오류: `routes.ts`, `src/app.ts`, `config.ts`, `server.ts`.
- 초기 데이터·운영자 등록: `data/catalog.ts`, `catalog-management.ts`, `src/scripts/*`.
- 실행·의존성: `backend/package.json`, 잠금파일, TypeScript 설정, `.env.example`.
- 검증: `backend/test/*`. 문서: `docs/API.md`, `DATA.md`, `CONTENT.md`, `GEMINI_HANDOFF.md`, `GEMINI_PROMPT.md`.

위 src 경로는 backend/ 기준입니다. 분석·추천·상품·구매 링크·옷장은 구현하지 않았고 기존 앱도 복구하지 않았습니다.

## 실행과 데이터

Node 24 LTS에서 backend/로 이동한 뒤 npm ci → npm run db:migrate → npm run db:seed → npm run dev 순서입니다. 서버 시작 시에도 비파괴 마이그레이션·seed가 실행됩니다. 프로덕션 빌드는 npm run build, 실행은 npm start입니다. 실제 API를 UI로 사용할 때는 별도 프런트엔드와 같은 출처의 /api 및 /media 프록시가 필요합니다.

SQLite 파일 경로를 유지하면 재시작 후에도 상태가 복원됩니다. 일회성 디스크나 영구 볼륨 없는 호스팅의 저장 지속성, 복수 서버의 동시 운영은 보장하지 않습니다.

## 확인 결과

`npm run check`의 포맷 검사·타입 검사·프로덕션 TypeScript 빌드와 통합 테스트 **26개가 통과**했습니다.

| 시나리오 | 검증 |
| --- | --- |
| 범주별 정확한 12개 스타일·상위 장르·초기 상태 | 실제 SQLite seed 조회, 이미지 0장과 초안·공개 빈 상태 확인 |
| 세 이미지 형식과 4–6장 조건 | 격리된 PNG 파일/메타데이터 fixture, 게시·권한·장수 필터 확인 |
| 미응답/건너뛰기/싫어함·복수 좋아요 | 실제 HTTP 핸들러 응답·DB 저장·요약 확인 |
| 중복 요청·하트 해제 | 반복/동시 요청의 결과·수정 시각·DB 행 수 확인 |
| 응답과 위치의 원자성 | 잘못된 다음 ID 거절, DB 오류 trigger 주입 후 전체 롤백·500 확인 |
| 범주 전환·이전 위치 수정·완료 후 수정 | 범주별 기록 복원, 혼입 422, 완료 해제·시각 규칙 확인 |
| 선호 없음 완료·완료 반복 | skipped/disliked만으로 완료, 완료 시각 유지 확인 |
| 익명 세션 권한 | 타인 공개 ID·잘못된 쿠키·쿠키 없는 요청 차단, 토큰 해시 저장 확인 |
| 쿠키·변경 출처 | Secure/HttpOnly/SameSite/host-only 속성, 출처·전용 헤더 검사 |
| 초기화·삭제 | 토큰 교체, 이전 토큰 거절, DB 연쇄 삭제, 타인 세션 보존 |
| 빈 콘텐츠·게시 중단·순서 변경·신규 게시 | 빈 목록 완료 차단, 철회 수 재계산, 고정 목록과 명시적 refresh 확인 |
| 로컬 파일·등록 오류 | 경로 이동·심볼릭 링크·없는 파일·중복 원본·중복 해시·잘못된 범주·크기 거절 |
| 재시작 후 복원 | SQLite 연결 닫기/재열기와 **별도 서버 프로세스 종료/재실행 후 실제 HTTP 요청** 모두 확인 |
| 운영자 CLI | 실제 migrate/seed/export/import 실행·반복 적용·export 덮어쓰기 거절 확인 |

테스트는 임시 폴더의 SQLite와 생성한 PNG 패턴 파일을 사용하며 실제 자산 폴더나 앱 DB에 fixture를 심지 않습니다. 테스트는 실제 패션 이미지의 의미·품질·사용권을 검증한 것이 아닙니다.

## 미완료와 외부 의존 사항

- 실제 이미지 0장입니다. 전체 24개 스타일을 게시하려면 최소 96개의 서로 다른 실제 의복 조합 이미지와 권한·출처·메타데이터가 필요합니다. 초기 API 빈 상태가 정상입니다.
- Gemini UI는 아직 없습니다. 화면·프록시·API 클라이언트·로딩/오류/복원·하트/확대·결과/완료 연결을 이어서 구현해야 합니다.
- Windows PC, AI Studio UI 미리보기, 실제 HTTPS 배포, 영구 볼륨 호스팅은 직접 실행 검증하지 않았습니다. 생산용 데이터 백업·만료 행 정기 정리는 운영 연결 작업입니다.
- 외부 HTTPS 이미지의 실존·내용·권한과 정확한 형식 분류는 운영자 검수가 필요합니다. 이번에는 원격 수집이나 이미지 생성·분석 API를 구현하지 않았습니다.
