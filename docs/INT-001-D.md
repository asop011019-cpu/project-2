# INT-001-D 하의 사진 교체·삭제·실패 시 보존 실연동 검증

- 브랜치: `integration/int-001-d-garment-replace` (기준 `integration/int-001-c-garment` b7cfb6dde24cb6913edc9eda60160374e85cc9af = 지시 기준 6e0ea27 + `.serena` 설정 커밋 1개)
- 범위: 기존 garment `GET/PUT/DELETE`, `GET …/image` 계약(`docs/GARMENT_API.md`) 그대로. 코드·API·DB 변경 없음(이 문서만 추가). 기존 8080/3001 서버와 `int-001-b` 데이터는 건드리지 않음.

## 1. 실행
- INT-001-C와 같은 격리 환경을 그대로 사용(`docs/INT-001-C.md` 1장). DB `backend/data/int-001-c/onboarding.sqlite`, 사진 `backend/data/int-001-c/garments/`.
  - 백엔드: `backend`에서 `node --env-file=data/int-001-c/.env src/server.ts` (127.0.0.1:3021)
  - 프론트: `frontend`에서 `$env:BACKEND_URL = 'http://127.0.0.1:3021'; npm.cmd run dev -- --host 127.0.0.1 --port 8091 --strictPort`
  - 주소: `http://127.0.0.1:8091/garment`
- 시험 이미지(전부 "테스트 하의 · 실제 사진 아님" 표기 또는 무의미 바이트, 실제 상품 사진 없음)
  - A: INT-001-C에서 저장한 600×900 PNG
  - B: 브라우저 canvas 900×1200 PNG(하늘색, "TEST B")
  - 실패용(브라우저): 14바이트 GIF, 10 MiB+512바이트 PNG 머리 파일, 서명·IHDR만 정상인 손상 PNG
  - 실패용(서버 직접, `backend/data/int-001-c/int-001-d-files/`): `valid-D.png` 640×960, `tiny.gif`, `big.png`(10,486,272바이트), `fake.heic`(ftypheic), `corrupt.png`, `over40mp.jpg`(8000×5100 = 40.8MP)
- 버전: Node 24.22.1, Vite 8.1.5, Windows 10. 브라우저: Claude 데스크톱 내장 브라우저(페이지의 `/api` 호출 기록). 파일 선택 창 대신 `input[type=file]`에 DataTransfer로 파일을 넣음. 버튼·입력은 실제 클릭·타이핑.

## 2. 결과 (2026-10-26)
| 항목 | 결과 |
|---|---|
| A 저장 상태에서 B 선택 후 미리보기의 "삭제"(교체 취소) | 요청 0건, 저장된 A(600×900)와 정보로 복귀 |
| B 선택 + 제품명 수정 후 "저장하기" | `PUT …/garment` 200, `?v=`가 새 updatedAt으로 바뀌고 화면 900×1200. 디스크의 A 파일은 지워지고 새 B 파일 1개, DB 행 900×1200·새 제품명 |
| 새로고침 / 새 탭 재방문 | 둘 다 B 900×1200과 수정 정보 |
| 캐시 | 이미지 응답 `Cache-Control: no-store`, `image/png`. 예전 A의 `?v=` 주소로 요청해도 B(900×1200)가 옴(이전 사진이 보이지 않음) |
| 브라우저에서 GIF로 교체 | "JPEG, PNG, WebP 사진만 올릴 수 있어요." 요청 0건, B·정보 유지 |
| 브라우저에서 10MB 초과로 교체 | "10MB 이하 사진만 올릴 수 있어요." 요청 0건, B·정보 유지 |
| 브라우저에서 손상 PNG로 교체 | "사진을 열 수 없어요. 다른 사진을 골라 주세요." 요청 0건, B·정보 유지 |
| 서버 직접(curl, 별도 세션에 valid-D 저장 후 정보도 바꿔 PUT) | GIF 415 UNSUPPORTED_IMAGE_FORMAT, 10MiB 초과 413 PAYLOAD_TOO_LARGE, 가짜 HEIC 415, 손상 PNG 400 INVALID_IMAGE, 40MP 초과 413 IMAGE_PIXEL_LIMIT. 매번 기존 행(종류·브랜드·640×960)과 사진 그대로, 남는 파일 없음 |
| 삭제 확인창 "취소" | 요청 0건, B·정보 유지 |
| 삭제 확인창 "삭제" | `DELETE …/garment` 204 → GET `{"garment":null}`, 이전 이미지 주소 404, 화면은 빈 상태. 다른 탭 새로고침도 빈 상태(종류·입력 비어 있음). DB 행 0, 사진 폴더 비어 있음 |
| 서버 직접 삭제(curl 세션) | 204 → null, image 404, 다시 DELETE도 204. 검사용 curl 세션은 삭제로 정리 |

- curl 시험에서 제품명 한글이 Windows curl 인자 인코딩 때문에 깨져 저장됨(시험 도구 문제, 앱 결함 아님). 보존 여부 비교에는 영향 없음.

## 3. 검사
- 코드 변경이 없어 테스트·타입·lint는 다시 돌리지 않음(ONB-004-INT 근거 재사용).

## 4. 미확인·참고
- 형식·용량·손상 파일은 화면 단계 검사(`src/lib/image-check.ts`)에서 먼저 막혀, 화면을 거친 서버 거부(4xx) 표시는 재현되지 않음. 서버 거부 시 보존은 curl로 확인.
- 실제 휴대폰 사진 선택·촬영 버튼, 업로드 중 네트워크 끊김, 서버 500(디스크 오류) 복구는 실행하지 않음.
- 서버 3021·8091은 켜 둠. 종료는 각 터미널에서 Ctrl-C, 정리는 `backend/data/int-001-c/` 삭제.
