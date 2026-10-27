# GAR-001 기준 하의 API

GPT가 제품 방향, Codex가 백엔드·통합, Lovable이 화면을 담당한다. 사진 등록은 분석 완료가 아니다. AI 분석·상품 검색·추천·옷장·결제·UI는 구현하지 않는다.

## 연결과 인증

> **AUTH-002부터**: 하의는 로그인 계정의 취향 진행에 속함. 로그인 없으면 401 `AUTH_REQUIRED`. 진행이 없는 계정은 GET `{"garment":null}`, image 404, DELETE 204이고, 첫 사진 PUT이 진행을 만듦. 아래 "POST /api/onboarding/session으로 익명 세션" 설명은 로그인 세션으로 대체됨.

기존 `POST /api/onboarding/session {}`로 익명 세션을 만들거나 재사용한다. 모든 호출은 `credentials: 'include'`, 변경 요청은 `X-Onboarding-Request: 1`을 사용한다. 프론트의 `/api`를 Node API(기본 포트 3001)로 같은 출처 프록시하고 `PUBLIC_ORIGIN`을 실제 프론트 출처로 설정한다. CORS는 열지 않는다. Lovable 프로젝트에 API가 자동 배포되거나 GitHub와 동기화된 것으로 가정하지 않는다.

401에서는 입력을 보존하고 사용자가 새 시작을 선택하도록 한다. 재시도에서 세션을 자동 삭제하지 않는다. menswear/womenswear 선택이나 온보딩 완료 전에도 등록 가능하다.

## 경로와 모델

기본 경로: `/api/onboarding/session/garment`

| 메서드 | 경로 | 결과 |
|---|---|---|
| GET | 기본 경로 | 200 `{"garment":null}` 또는 아래 모델 |
| PUT | 기본 경로 | multipart metadata 및 선택 image, 200 모델 |
| GET | 기본 경로 + `/image` | 소유 세션의 현재 PNG, 없으면 404 |
| DELETE | 기본 경로 | 사진·행 삭제 후 204, 이미 비어 있어도 204 |

```json
{"garment":{"id":"서버 UUID","garmentType":"pants","brand":null,"productName":null,"purchaseUrl":null,"imageUrl":"/api/onboarding/session/garment/image","width":800,"height":1200,"createdAt":"2026-10-25T00:00:00.000Z","updatedAt":"2026-10-25T00:00:00.000Z"}}
```

모든 metadata 필드를 보낸다. `garmentType`은 pants/skirt이고 나머지는 nullable 문자열이다. 빈 문자열은 trim 후 null, brand 100자·productName 200자·purchaseUrl 2048자 이하다. 링크는 인증정보 없는 http/https만 허용하며 서버는 방문하지 않는다.

```js
const body = new FormData();
body.set('metadata', JSON.stringify({
  garmentType: 'skirt', brand: null, productName: null, purchaseUrl: null,
}));
if (file) body.set('image', file); // 최초 필수, 정보만 수정 시 생략
const response = await fetch('/api/onboarding/session/garment', {
  method: 'PUT', credentials: 'include',
  headers: {'X-Onboarding-Request': '1'}, body,
});
const result = await response.json();
// response.ok일 때만 저장 성공으로 표시한다.
```

브라우저가 boundary를 지정하도록 Content-Type은 직접 넣지 않는다. 이미지 갱신은 `imageUrl + '?v=' + encodeURIComponent(updatedAt)`을 사용할 수 있다. v는 파일 선택·인증에 사용하지 않는다. 모든 응답은 no-store이며 세션 ID는 권한이 아니다.

## 이미지와 오류

실제로 디코딩되는 정지 JPEG/PNG/WebP 1장, 파일 최대 10 MiB, 디코딩 최대 40,000,000픽셀이다. 방향을 보정하고 메타데이터를 제거한 PNG만 저장한다. 원본을 별도 보존하지 않고 색상·실루엣 편집은 하지 않는다. 기존 JSON 16 KiB 제한은 유지한다.

오류: `{"error":{"code":"INVALID_INPUT","message":"요청 내용을 확인해 주세요.","issues":[{"path":"image","message":"입력 내용을 확인해 주세요."}]},"requestId":"req-1"}`. issues는 입력 검증 오류에서 제공하며 최초 image 누락·metadata 파싱 실패는 각각 해당 경로를 제공한다.

| HTTP | code | 의미 |
|---|---|---|
|400|INVALID_INPUT|metadata, 필드, multipart 형식 오류|
|400|INVALID_IMAGE|사진 손상·디코딩 실패|
|400|MULTIPLE_IMAGES|여러 사진 또는 잘못된 파일 필드|
|401|SESSION_REQUIRED|쿠키 없음·무효·만료|
|403|REQUEST_HEADER_REQUIRED / ORIGIN_NOT_ALLOWED|전용 헤더·출처 오류|
|404|IMAGE_UNAVAILABLE|유효 세션에 사진 없음|
|413|PAYLOAD_TOO_LARGE|10 MiB 파일 또는 multipart 제한 초과|
|413|IMAGE_PIXEL_LIMIT|40메가픽셀 초과|
|415|UNSUPPORTED_IMAGE_FORMAT|HEIC 등 미지원·애니메이션|
|415|UNSUPPORTED_MEDIA_TYPE|지원하지 않는 전송 형식|
|500|INTERNAL_ERROR|파일·DB 저장/조회/삭제 실패|

## 데이터와 운영

DB 마이그레이션 v3는 기존 데이터를 유지하며 세션당 한 행인 garments를 추가한다. 비공개 경로는 `GARMENT_ROOT`, 기본은 SQLite 파일 옆 `garments/`이며 공개 `/media`와 분리한다. 운영에서는 DB와 사진 디렉터리 모두 영구 볼륨에 두고 함께 백업한다. 마이그레이션 전 DB 백업을 보관하고 이전 코드로 되돌릴 때는 해당 백업과 일치하는 사진 스냅샷을 복원한다. 이전 서버는 더 높은 DB 버전을 거부한다.

디코딩 후 파일·DB 저장 구간에는 await가 없다. 단일 서버 프로세스에서 마지막 성공한 DB 저장이 현재 사진이며 새 파일명은 서버 UUID이다. 새 파일 쓰기·DB 갱신·이전 파일 삭제 후 커밋한다. 오류 시 DB를 롤백하고 이전 파일을 복구하며 새 파일을 제거한다. 의류 삭제 및 세션 삭제/초기화도 파일 삭제 실패를 500으로 반환하고 행을 보존한다. 복구 자체가 디스크 장애로 실패하면 운영자 복구가 필요하다.

현재 구조는 단일 서버·로컬 SQLite 전제이며 동기 파일 I/O가 이벤트 루프를 점유한다. 40MP PNG 인코딩과 복구용 파일 버퍼에는 메모리가 필요하다. 대규모 동시 업로드 운영 전 메모리·요청량 제한을 검토한다. 갑작스러운 프로세스/호스트 중단에 대한 DB·파일 간 원자성은 보장하지 않는다. 일치하는 백업을 이용한 복구 및 잔존 파일 점검이 필요하다.

만료된 세션은 이미지 접근이 차단되지만 잔존 사진의 자동 정리 스케줄러는 없다. 영구 볼륨, 만료 데이터 및 고아 파일 정리 정책은 운영 연결 조건이다. 사진·DB를 Git에 추가하지 않는다.

추가 의존성: `@fastify/multipart`는 제한 있는 스트리밍 multipart 파싱, `sharp`는 실제 디코딩·픽셀 제한·EXIF 방향 보정·메타데이터 제거를 담당한다. sharp의 플랫폼별 네이티브 바이너리 설치 및 보안 업데이트 관리가 필요하다. 외부 유료 서비스는 추가하지 않는다.

## GAR-002 기준 의류 확장과 사용자 확인 속성 (2026-10-27)

### 호환 방안(비파괴)
- 계정당 한 벌 그대로. `garmentType`에 `top`(상의)·`outer`(아우터)를 추가(`pants`·`skirt` 유지). 기존 PUT의 strict metadata·multipart 형식, GET·DELETE·image 경로, 오류 코드는 그대로이며 기존 하의 요청은 같은 결과.
- GET·PUT 응답의 garment에 `attributes` 필드 추가(없으면 null). 기존 필드 불변.
- DB v8: SQLite는 CHECK를 바로 넓힐 수 없어 `garments`를 같은 열 순서로 다시 만들고 기존 행을 그대로 옮김. 사용자 확인 속성은 새 표 `garment_attributes`(의류 행 삭제 시 함께 삭제 → 의류 삭제·진행 삭제·탈퇴 삭제가 그대로 적용).
- AI 추정은 만들지 않음. 이 필드는 사용자가 직접 고른 값만 담고, 추정은 이후 ANL-001의 별도 필드로 분리.
- 나중에 '내 옷장'으로 넓힐 때 의류 식별자·소유자(진행 세션)·사진 파일·속성 연결을 그대로 재사용할 수 있게 속성을 의류 행에 1:1로만 연결함. 여러 벌 구조는 만들지 않음.

### PUT /api/onboarding/session/garment/attributes (JSON)
```json
{"garmentType":"pants","values":{"color":{"base":"navy","tone":"dark","pattern":"solid","denimWash":"raw_indigo"},"materialLook":"denim","construction":["five_pocket"],"silhouette":"straight","length":"full"},"rawText":"조드퍼즈 느낌"}
```
- `garmentType`은 현재 저장된 종류와 같아야 함(다르면 409 `GARMENT_TYPE_CHANGED`). 의류가 없으면 404 `GARMENT_NOT_FOUND`. 어휘 밖 값·다른 종류의 축·중복·알 수 없는 키는 400 `INVALID_INPUT`(issues 경로는 `values.…`).
- 축(어휘 `garment-vocab-0.2`): 공통 `color{base,tone,pattern,denimWash}`·`materialLook` / 바지 `construction[]`·`silhouette`·`length` / 치마 `skirtStructure[]`·`silhouette`·`length` / 상의 `topType`·`neckline`·`sleeve`·`topFit`·`topLength` / 아우터 `outerType`·`neckline`·`sleeve`·`topFit`·`topLength`. 섬유 혼용률 축은 없음(사진으로 확정 금지, 사용자가 `rawText`에 적을 수 있음, 200자).
- null·빈 배열은 "응답 안 함"으로 저장하지 않고, `unknown`·`other`는 답으로 저장. 응답 `attributes`: `{garmentType, vocabularyVersion, values, rawText, needsConfirmation, updatedAt}`.
- `needsConfirmation`: 사진을 바꾸거나 종류를 바꾼 뒤 아직 다시 저장하지 않음. 정보(브랜드 등)만 수정하면 유지.
- 종류 변경(기존 PUT): 공통 축(`color`·`materialLook`)과 `rawText`만 남기고 이전 종류의 축은 삭제.
- 미확정: 실루엣·길이 값은 어휘에서 바지·치마 공통 목록이라 그대로 허용(종류별 세분은 큐레이터 확인 필요). `rubber_synthetic`(신발 소재)은 신발이 범위 밖이라 제외.

### 화면·검증 (GAR-002, Lovable d0d0d58, 크레딧 9 사용·약 10.8 남음)
- 화면: 종류 4개(상의·바지·치마·아우터), 사진 저장 뒤 "옷 정보 확인"(종류별 축만, 칩 선택, "모름", 직접 적기 200자) → "옷 정보 저장". 재방문 복원, 확인 필요 안내, 종류 변경 시 전용 축 제거·공통 유지, 실패·401·409에도 입력 유지. "AI 분석" 표시 없음. 어휘는 `frontend/src/lib/garment-attributes.ts`(서버와 같은 `garment-vocab-0.2`).
- 로컬 수정: 섹션 등장 애니메이션(`animate-rise-late`, fill `both`)이 transform을 남겨 모바일 고정 저장 바가 섹션 맨 아래에 붙고 "옷 정보 저장" 버튼을 덮음(실제 화면에서 누를 수 없음 확인) → 바 앞에 모바일 전용 여백 추가. 고정 바가 화면 하단에 붙지 않는 것 자체는 기존 동작이라 그대로 둠.
- 검증: 백엔드 72개 중 71 통과(기존 Windows symlink 1), 새 테스트 7개(4종 저장·복원, 미응답·모름, 어휘 밖·다른 종류 축·중복·알 수 없는 키 400·종류 불일치 409, 종류 변경 공통 유지, 사진 교체 재확인·정보 수정 유지, 다른 계정 404·삭제·탈퇴 삭제, v7→v8 마이그레이션 보존). 종류 변경 처리를 끄면 해당 테스트 실패 확인. 프론트 vitest 145/145(연속 2회; 첫 실행 1회는 부하 중 시간 초과로 1건 실패, 단독·재실행 통과), tsc 통과, eslint 경고 6(줄바꿈 CRLF 제외). 화면 어휘 15개 축 값·종류별 허용이 서버 검증과 전부 일치(스크립트 대조).
- 실제 서버(격리 DB 사본 v7→v8)·375px: 상의 등록 → 칩 선택·직접 적기 저장 → 재방문 복원, 바지로 변경 → 공통만 유지·확인 필요 안내·바지 축 표시, 가로 스크롤 없음.
