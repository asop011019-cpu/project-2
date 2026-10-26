# INT-001-C 하의 사진 등록·정보 저장·복원 실연동 검증

- 브랜치: `integration/int-001-c-garment` (기준 `integration/onb-004-int` 02b50087d2a2144ac71dea3c59ead935077d0699)
- 범위: 기존 `GET/PUT/DELETE /api/onboarding/session/garment`, `GET …/garment/image` 계약(`docs/GARMENT_API.md`) 그대로. 코드·API·DB 계약 변경 없음(이 문서만 추가). 프론트는 ONB-004-INT 통합본(Lovable d5703cd9) 그대로.
- 기존 8080/3001 서버, `backend/data/int-001-b` DB·사진·세션은 건드리지 않음.

## 1. 격리 환경 (전부 gitignore 대상 `backend/data/int-001-c/`)
- `backend/data/int-001-c/.env`
  ```
  HOST=127.0.0.1
  PORT=3021
  PUBLIC_ORIGIN=http://127.0.0.1:8091
  DATABASE_PATH=./data/int-001-c/onboarding.sqlite
  GARMENT_ROOT=./data/int-001-c/garments
  ASSET_ROOT=./data/int-001-c/assets
  ```
- `alt.env`: 같은 내용에 `DATABASE_PATH=./data/int-001-c/alt.sqlite`, `GARMENT_ROOT=./data/int-001-c/garments-alt` (401 재현용 빈 DB).
- 실행(PowerShell):
  - 백엔드: `backend`에서 `node --env-file=data/int-001-c/.env src/server.ts`
  - 프론트: `frontend`에서 `$env:BACKEND_URL = 'http://127.0.0.1:3021'; npm.cmd run dev -- --host 127.0.0.1 --port 8091 --strictPort`
  - 주소 `http://127.0.0.1:8091/garment`. `localhost`가 아니라 `127.0.0.1`을 쓰는 이유: 쿠키는 포트를 구분하지 않아 `localhost:8091`에서는 8080용 세션 쿠키가 섞임(실제로 처음에 그렇게 401이 났고, 기존 세션 보호를 위해 "새로 시작"은 누르지 않음).
- 종료: 각 터미널에서 Ctrl-C. 정리: `backend/data/int-001-c/` 폴더 삭제.
- 버전: Node 24.22.1, Vite 8.1.5, backend 0.1.0, Windows 10.

## 2. 시험 데이터
- 사진: 브라우저 canvas로 만든 600×900 PNG(24,577바이트) `int-001-c-test-pants.png`, "TEST"와 "테스트 하의 · 실제 사진 아님" 글자가 들어간 자리 표시 이미지. 실제 상품 사진 아님. 파일 선택 창 대신 `input[type=file]`에 DataTransfer로 넣고 change 이벤트를 보냄(그 뒤 업로드·저장은 앱 코드 그대로).
- 정보: 바지, 브랜드 "테스트브랜드", 제품명 "INT-001-C 시험용 와이드 슬랙스", 링크 `https://example.com/int-001-c-test`(종류 버튼과 입력은 실제 클릭·타이핑).
- 저장 결과: `backend/data/int-001-c/garments/e314a63c-5744-4b4d-9fb4-99b25ba56936.png`(서버가 다시 인코딩한 PNG, 20,572바이트), garments 행 1개(600×900).

## 3. 검증 (2026-10-26, Claude 데스크톱 내장 브라우저, 페이지의 `/api` 호출 기록)
| 항목 | 결과 |
|---|---|
| 첫 방문 | 세션 생성, 저장 버튼만 비활성(사진·종류 없음) |
| 사진 1장 + 정보 저장 | `PUT /api/onboarding/session/garment` 200, 미리보기가 서버 이미지 `…/garment/image?v=<updatedAt>`로 바뀜. DB 행·사진 파일 1개씩 |
| 새로고침 | 바지 선택, 브랜드·제품명·링크, 사진 600×900 그대로 |
| 새 탭 재방문 + 백엔드 재시작 | 재시작 직후 같은 사진·정보 복원(백엔드가 꺼진 순간 연 탭은 "서버에 연결할 수 없어…" 안내와 다시 시도 버튼, 가짜 성공 없음) |
| 쿠키 없음 / 위조 쿠키 | GET garment·image, PUT, DELETE 모두 401 |
| 다른 유효 세션 | GET garment `{"garment":null}`, image 404(남의 사진 접근 불가). 전용 헤더 없는 PUT 403 |
| 저장 중 세션 무효(백엔드를 빈 `alt.sqlite`로 교체 후 제품명을 고친 상태로 저장) | PUT 401 한 번뿐, "세션이 만료됐거나 복원하지 못했어요. 입력한 내용은 그대로 남아 있습니다" + 새로 시작 버튼. 수정한 제품명·브랜드·링크·바지 선택 유지. 세션 자동 삭제·재생성 요청 없음(alt DB 세션 0개), 원래 DB 행도 그대로 |
| 마무리 | 백엔드를 원래 `.env`로 다시 실행해 둠. 검증용으로 curl이 만든 다른 세션은 DELETE로 정리 |

## 4. 검사
- 코드 변경이 없어 프론트·백엔드 테스트, 타입 검사, lint는 다시 돌리지 않음(같은 코드로 ONB-004-INT에서 프론트 106/106·tsc·eslint 오류 0 확인).

## 5. 미확인
- 실제 휴대폰 사진 선택(카메라·갤러리), HEIC·10MB 초과 같은 거부 경로의 화면 표시, 사진만 교체·삭제 버튼 흐름은 이번 완료 기준 밖이라 실행하지 않음.
- 처음부터 세션이 무효인 상태에서는 입력칸이 잠겨 입력할 수 없음(설계상 동작으로 보이며 결함으로 보고하지 않음).
