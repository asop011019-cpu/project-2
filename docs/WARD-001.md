# WARD-001 / M2.5 → M3.2·M3.3 → M4.2 내 옷장과 0원 예산

- 목적: 정상 저장된 의류 사진을 로그인 계정의 **내 옷장**에 누적하고, 추가 구매 예산 0원을 "옷장의 본인 의류만 쓰는 모드"로 정의한다. AI 분석·추천 엔진·상품 검색은 없다.
- 기준: `preview/cond-mot@622a93a` (COND-001 9bfdbe3 + MOT-001 + ONB-3D-001 d108a82 통합본). 작업 브랜치 `feature/ward-001-owned-garments`.
- 순서: A(옷장 저장·이관·기준 선택·개별 삭제) 검증 후 B(0원 조건·알림·진행 제어).

## 결정

| # | 항목 | 적용 | 근거 |
| --- | --- | --- | --- |
| 1 | 옷장 소유자 | 계정(`users.id`). 취향 진행(`onboarding_sessions`)이 아님 | 진행 초기화로 옷장이 통째로 지워지면 안 됨 |
| 2 | 기준 의류 | 진행 1개당 옷장 항목 1개를 **참조**(`reference_garments`) | 기존 "현재 기준 의류 한 벌" API를 그대로 유지 |
| 3 | 항목 ID | 서버 UUID. 새 등록은 클라이언트가 만든 UUID(`itemId`)로 요청할 수 있음 | 같은 저장 재시도는 같은 항목을 갱신(중복 방지), 다른 옷은 새 ID |
| 4 | 사진 | 항목마다 자기 파일 1개(`filename UNIQUE`). 같은 사진이라도 공유·병합하지 않음 | 개별 삭제가 다른 항목 사진을 손상시키지 않음 |
| 5 | 속성 | 항목별 확정 속성(`wardrobe_item_attributes`). 기존 규칙 그대로(사진·종류가 바뀌면 다시 확인) | 사진 교체·속성 변경이 해당 항목에만 연결 |
| 6 | 0원 | 정상 값. 미입력 `null`·상한 없음 `"any"`·0을 구별. 최소 1만 원 제한 제거(1원 이상도 그대로 허용) | 사용자 승인 |
| 7 | 0원 진행 조건 | 옷장이 비면 막음. 상의 1벌 + 하의(바지·치마) 1벌이 없으면 부족으로 막음 | 보유 의류만으로 한 벌을 완성하는 최소 조건. 추천 엔진이 생기면 같은 함수로 재검증 |
| 8 | 추천 후보 | 0원이면 계정이 소유한 옷장 항목만 허용. 0원짜리 판매 상품·삭제된 항목·남의 항목은 보유 의류로 인정하지 않음 | 클라이언트 플래그를 믿지 않고 서버가 소유권으로 제한 |
| 9 | 가격 합산 | 기준·보유 의류는 합계에서 제외 | 기존 쇼케이스 규칙과 같음 |

## 저장 (스키마 v10, 추가 + 이관)

```sql
wardrobe_items(id PK, user_id → users ON DELETE CASCADE, garment_type, brand, product_name,
               purchase_url, filename UNIQUE, width, height, created_at, updated_at)
wardrobe_item_attributes(item_id PK → wardrobe_items ON DELETE CASCADE, garment_type,
               vocabulary_version, values_json, raw_text, confirmed_image, updated_at)
reference_garments(session_id PK → onboarding_sessions ON DELETE CASCADE,
               item_id → wardrobe_items ON DELETE CASCADE)
```

- 이관: 계정에 붙은 진행의 `garments` 행 → 같은 `id`·파일명으로 `wardrobe_items`, `garment_attributes` → `wardrobe_item_attributes`, 그 진행의 기준 의류로 `reference_garments`. 이관한 행만 `garments`에서 지운다. 파일은 옮기거나 복사하지 않는다(같은 파일명을 그대로 참조).
- 계정 없는 예전 익명 진행(AUTH-002 이전)의 `garments` 행은 계정으로 옮길 수 없어 그대로 둔다. 화면·API에서 이미 쓰이지 않고, 진행 삭제 때 기존 코드가 파일과 함께 지운다.
- 이관은 한 트랜잭션. 실패하면 v9 그대로 남는다.

## 수명·삭제

| 동작 | 옷장 항목·사진 | 기준 의류 참조 |
| --- | --- | --- |
| 옷장 항목 개별 삭제 | 그 항목 행·속성·사진 파일만 삭제 | 그 항목을 가리키던 참조도 삭제(기준 없음) |
| 기준 의류 삭제(`DELETE …/garment`) | 현재 기준 항목을 옷장에서 삭제(기존 "등록한 옷 삭제"와 같은 결과) | 삭제 |
| 진행 초기화·진행 삭제 | **유지** | 진행과 함께 삭제. 새 진행에서 옷장 옷을 다시 기준으로 고름 |
| 탈퇴 신청(30일 유예) | 유지 | 유지 |
| 유예 중 재로그인 복구 | 그대로 복원 | 그대로 복원 |
| 유예 종료 후 삭제 실행 | 사진 파일 먼저(이미 없으면 통과) → 행 삭제 | 삭제 |

- 파일 삭제와 DB 변경은 같은 트랜잭션 안에서 처리하고, DB가 실패하면 지운 파일을 되살린다. 새 사진 쓰기 후 DB가 실패하면 새 파일을 지운다.

## API (로그인 필요, 남의 항목은 존재 여부도 알리지 않고 404)

기존 경로(호환 유지): `/api/onboarding/session/garment` = 현재 진행의 기준 의류.

| 메서드 | 경로 | 변경 |
| --- | --- | --- |
| GET | `/api/onboarding/session/garment` | 기준 항목. 응답 모양 그대로(`id`는 옷장 항목 ID) |
| GET | `…/garment/image` | 기준 항목 사진 |
| PUT | `…/garment` | metadata에 선택 필드 `itemId`(UUID) 추가. 아래 규칙 |
| PUT | `…/garment/attributes` | 기준 항목의 확정 속성(그대로) |
| DELETE | `…/garment` | 기준 항목을 옷장에서 삭제, 204(없어도 204) |
| PUT | `…/garment/reference` | 새 경로. `{"itemId":"…"}`로 옷장 항목을 기준으로 선택 → `{"garment":…}` |

PUT `…/garment`의 `itemId` 규칙:
- 생략(기존 클라이언트): 기준 항목이 있으면 그 항목 갱신, 없으면 사진이 있어야 새 항목을 만들고 기준으로 지정.
- 내 항목 ID: 그 항목 갱신(사진 교체·정보 수정) 후 기준으로 지정.
- 처음 보는 ID: 사진이 있어야 그 ID로 새 항목을 만들고 기준으로 지정. 같은 ID로 다시 보내면(재시도) 같은 항목을 갱신해 중복이 생기지 않는다.
- 남의 항목 ID: 404 `GARMENT_NOT_FOUND`(존재를 알리지 않음).
- 응답이 200일 때만 옷장 등록 완료. 사진을 고르기만 했거나 실패한 경우는 옷장에 없다.

옷장 경로:

| 메서드 | 경로 | 결과 |
| --- | --- | --- |
| GET | `/api/wardrobe` | `{"items":[항목…],"referenceItemId":"…"\|null}` 최근 등록순 |
| GET | `/api/wardrobe/items/:id/image` | 내 항목 사진 PNG, 아니면 404 `IMAGE_UNAVAILABLE` |
| DELETE | `/api/wardrobe/items/:id` | 204, 내 항목이 아니거나 없으면 404 `GARMENT_NOT_FOUND` |

항목 모양은 기존 garment와 같고 `imageUrl`만 `/api/wardrobe/items/:id/image`.

오류 추가: 404 `GARMENT_NOT_FOUND`(옷장 항목 없음·남의 항목). 기존 400/401/403/413/415는 그대로.

## 0원 예산 (B)

- 조건 API `additionalBudgetKrw`: `null`(미입력) | `"any"`(상한 없음) | 0 | 1~5,000,000 정수. 기존 양수 계약은 그대로이고 범위만 넓어짐.
- 새 경로 `GET /api/onboarding/session/recommendation-check` → `{"budgetMode":"unanswered"|"any"|"owned_only"|"purchase","blockedReason":null|"WARDROBE_EMPTY"|"WARDROBE_INSUFFICIENT","missing":["top"|"bottom"…],"wardrobeCount":n}`. 서버가 저장된 조건과 계정 옷장으로 계산한다. 추천 결과가 아니라 진행 가능 여부다.
- 정책 함수(`backend/src/modules/wardrobe/policy.ts`, Fastify/SQLite 무관): `budgetMode`, `ownedOnlyCheck`, `allowedCandidates`, `purchaseTotalKrw`. 앞으로 추천 경로는 후보를 이 함수로 거른 뒤에만 반환한다.

화면:
- 예산에 "0원" 칩 추가. 직접 입력의 0도 같은 모드.
- 0원을 확정(칩 선택·입력란에서 벗어남·저장 직전 중 처음)할 때만 알림: "추가 구매 없이 내 옷장에 등록한 옷으로만 코디를 제안해요. 필요한 옷이 부족하면 코디를 완성하지 못할 수 있어요." [계속] [금액 변경]. 글자마다·화면을 열 때마다 반복하지 않는다(저장된 0을 불러올 때는 띄우지 않음).
- 0원이 저장된 상태에서 옷장이 비면 "0원 코디를 이용하려면 먼저 내 옷장에 옷을 등록해주세요." + [사진 등록] [금액 변경]. 부족하면 없는 종류를 알리고 같은 버튼.
- 기존 기온 7~17°C·격식 50 기본값과 직접 조절은 그대로. 별도 "기본 설정" 표기 없음.

## 범위 밖

검색·폴더·옷장 일괄 가져오기·AI 분석·추천 생성·상품 검색·Lovable·배포.
