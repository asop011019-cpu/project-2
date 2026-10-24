# GAR-001 기준 하의 API

GPT가 제품 방향, Codex가 백엔드·통합, Lovable이 화면을 담당한다. 사진 등록은 분석 완료가 아니다. AI 분석·상품 검색·추천·옷장·결제·UI는 구현하지 않는다.

## 연결과 인증

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
