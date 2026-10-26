# ONB-004-INT 스타일 카드 직접 탐색 통합·실API 검증

- 브랜치: `integration/onb-004-int` (기준 `integration/onb-003-like-flow` a7ecb810437874692026c9fbfd433a36e2691628)
- 프론트: Lovable `3ba3a3de4194914a87f6cb29303a87c3001662bb` → `d5703cd9ddaff911f9ec53acfd111888fb5023a2`
  - 1번째 커밋: 미커밋이던 ONB-003-R2(Lovable `e4809c4`, 대표 사진 전신) 반영분을 그대로 보존 커밋.
  - 2번째 커밋: 총괄 제공 `ONB-004-lovable-diff.json`(3ba3a3d→d5703cd9, 7파일)을 a7ecb81의 파일에 적용.
- 범위: 프론트 통합과 실서버 검증만. API·DB·백엔드·vite 프록시 변경 없음. Lovable 호출 없음.

## 1. diff 적용과 완전성
- JSON 7파일 37 hunk 모두 원본 줄과 일치 확인 후 적용(불일치 0). Lovable diff는 공백 변화를 무시하므로(들여쓰기만 바뀐 줄이 context로 옴) 공백 제외 비교로 적용하고, 코드 3파일은 저장소 Prettier로 정리.
- e4809c4(R2) 내용은 d5703cd9에 포함됨: 적용 결과에 `style-card-frame`·contain 유지 확인.
- `frontend/.lovable/plan.md`(운영 기록)는 R2 커밋 내용과 동일해 변경 없음. `frontend/AGENTS.md`는 ONB-004 규칙 1줄만 바뀜(OPS-005와 충돌 없음).

## 2. 검사 (로컬 npm 설치본, Windows, Node 24.22.1)
| 명령 | 결과 |
|---|---|
| `npx vitest run` | 8파일 106/106 통과 |
| `npx tsc --noEmit` | 통과 |
| `npx eslint .` | 오류 0, 경고 6(기존 shadcn ui 파일의 react-refresh 경고) |

## 3. 실서버 검증 (2026-10-26)
- 서비스: `http://localhost:8080` = vite dev, 소스 `C:\Users\yuzuh\code\project-2\frontend`(서빙 소스맵 경로로 확인, ONB-004·R2 코드 포함). `/api`는 `127.0.0.1:3001` Node 백엔드(격리 DB `backend/data/int-001-b`). 두 프로세스는 이미 실행 중이었고 재시작하지 않음.
- 브라우저: Claude 데스크톱 내장 브라우저(데스크톱 폭), 실제 마우스 클릭. 페이지의 `/api` 호출을 fetch 래핑으로 기록.

| 항목 | 결과 |
|---|---|
| 아메리칸 장르의 아메카지 → 워크웨어 → 밀리터리 캐주얼 클릭(사진 미준비) | 누를 때마다 읽기 전용 상세 제목이 그 스타일로 바뀌고 해당 카드만 `aria-current`+"보는 중". `/api` 요청 0건(position·response·preference 없음) |
| 준비된 스타일 비즈니스 캐주얼 클릭 | `PUT /session/position {"styleId":"men_business_casual"}` 200 → 카드 제목·선택 표시 전환 |
| 빠른 연속 선택 클래식→모던 포멀→클래식(40ms 간격) | position PUT 3건 순차 200, 서버 `currentStyleId`=men_classic, 화면 카드·선택 표시도 클래식. 직전에 저장한 사진 선호 1건과 응답 3건 그대로 |
| 새로고침 후 복원 | 클래식 테일러드 카드·선택 표시로 복원 |
| 건너뛰기 버튼 | 없음(응답 버튼은 "별로"만). 사진 하트·확대 5개씩, 뒤로 가기 유지 |
| 잘못된 쿠키로 position PUT(프록시 경유 curl) | 401 SESSION_REQUIRED, 실제 세션의 위치·선호·응답 변화 없음 |

- 사진 선호 저장은 비즈니스 캐주얼 대표 사진 더블클릭으로 만든 것(이때 그 스타일 응답도 liked로 저장됨, ONB-003-R1 동작).

## 4. 미확인
- 화면에서의 401 처리(큐 중단·자동 재생성 없음)는 실행 중인 백엔드를 바꿔야 해서 브라우저로는 재현하지 않음. Lovable 테스트와 위 curl 401로 갈음.
- 실제 휴대폰 터치, 키보드만으로 선택, reduced-motion 실기기는 실행하지 않음.
