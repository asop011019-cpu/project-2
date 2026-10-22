# 온보딩 API v1

기본 접두사는 `/api/onboarding`입니다. 응답 타입은 `backend/src/modules/onboarding/types.ts`, 요청 타입은 `validation.ts`가 원본입니다. 현재 실 콘텐츠는 미준비이며, 예시의 `men_casual`에 응답하는 호출은 해당 스타일과 실제 이미지가 게시된 뒤에만 성공합니다.

## 전송과 인증

JSON 요청에는 `Content-Type: application/json`을 사용합니다. **모든 변경 요청(POST/PUT/DELETE)**에는 `X-Onboarding-Request: 1`도 필요합니다. 브라우저 `fetch`는 `credentials: "include"`를 사용합니다. 세션 쿠키는 서버가 설정하며 JavaScript에서 읽거나 직접 저장하지 않습니다. URL·본문·헤더에 세션 ID를 넣어 인증하지 않습니다.

브라우저는 동일 출처의 상대 경로로 호출합니다. CORS를 열지 않았으므로 개발 서버와 운영 프록시가 `/api`와 `/media`를 백엔드로 전달해야 합니다. `PUBLIC_ORIGIN`은 **사용자에게 보이는 프런트엔드 출처**와 일치시킵니다. HTTPS 운영에서는 Secure 쿠키를 사용합니다.

## 경로

| 메서드 | 경로 | 요청 | 응답 |
| --- | --- | --- | --- |
| GET | `/catalog` | 선택 query `categoryId=menswear` 또는 `womenswear` | `CatalogView`, 공개 가능한 스타일만 |
| GET | `/styles/:styleId` | 없음 | `StyleDetail`, 게시 불가/없는 스타일은 404 |
| POST | `/session` | `{}` | 신규 201 / 유효 쿠키 재호출 200, `SessionView` |
| GET | `/session` | 없음 | 쿠키로 복원한 `SessionView` |
| PUT | `/session/category` | `{ "categoryId": "menswear" }` | 해당 범주의 상태를 적용한 `SessionView` |
| PUT | `/session/styles/:styleId/response` | `response` 및 선택적 `nextStyleId` | 응답과 이동을 함께 저장한 `SessionView` |
| PUT | `/session/styles/:styleId/images/:imageId/preference` | `{ "selected": true }` 또는 false | 위치를 유지한 `SessionView` |
| PUT | `/session/position` | `{ "styleId": "men_casual" }` 또는 null | 위치만 바꾼 `SessionView` |
| GET | `/session/summary` | 없음 | `SessionSummary` |
| POST | `/session/complete` | `{}` | 완료 상태인 `SessionView` |
| POST | `/session/refresh-catalog` | `{}` | 명시적으로 현재 게시 목록을 다시 고정한 `SessionView` |
| POST | `/session/reset` | `{}` | 모든 범주 기록 삭제·토큰 교체, 새 `SessionView` |
| DELETE | `/session` | `{}` 또는 본문 없음 | 기록 삭제·쿠키 제거, 본문 없는 204 |

`/health`는 루트의 상태 확인 경로입니다. 로컬 등록 이미지는 `/media/실제-등록한-파일명`으로 제공하며 현재 게시 조건을 충족하는 참조에만 접근할 수 있습니다. 기존 이미지 주소를 알고 있어도 게시 중단 후 로컬 이미지 요청은 404입니다. 외부 이미지 원본 서버의 접근 제어·캐시까지 이 API가 회수할 수는 없습니다.

세션 경로는 쿠키 인증이 필요합니다. 예외적으로 `POST /session`은 쿠키가 없을 때 새 세션을 만들고, `DELETE /session`은 없는/만료된/잘못된 쿠키에도 204로 쿠키를 정리합니다. 유효하지 않은 쿠키를 가진 `POST /session`은 401이므로 UI가 조용히 새 세션으로 바꾸지 않습니다. 사용자에게 새로 시작을 안내한 뒤 DELETE → POST 순서로 처리합니다.

## 타입과 필드

`CatalogView`는 `version`, `contentStatus`, `categories`, `genreGroups`, `styles`를 반환합니다. 기본 데이터는 24개 초안이나 공개 API의 `styles`는 현재 탐색 가능한 목록뿐입니다. 빈 배열을 12개의 가짜 공개 항목으로 채우지 않습니다. 상위 장르 ID는 스타일의 `genreGroupId`와 연결합니다.

`StyleDetail`은 스타일 ID·범주 ID·상위 장르 ID·이름·설명·순서·게시 상태·`imageCount`와 `images`를 반환합니다. 이미지별 핵심 필드는 다음과 같습니다.

| 필드 | 의미 |
| --- | --- |
| `id` | 하트 저장에 사용할 안정적인 이미지 ID |
| `styleId`, `categoryId` | 소속 스타일과 의류 범주 |
| `originalUrl` | 확대용 원본 주소. 원본 URL로 선호를 저장하지 않음 |
| `thumbnailUrl` | 갤러리용 주소. 별도 썸네일이 없으면 같은 원본 참조 가능 |
| `alt`, `width`, `height` | 대체 텍스트·원본 크기 |
| `format` | `model_outfit`, `flat_lay`, `collage` 중 하나. 한 스타일 안에서 혼용 가능 |
| `isGenerated` | 생성 이미지 표시를 위한 신호 |
| `order` | 이미지 정렬 기준 |
| `sourceUrl`, `creator` | 출처와 제작자. 출처가 없는 자체 제작은 sourceUrl=null 가능 |
| `usageStatus`, `publicationStatus` | 공개 응답은 각각 `allowed`, `published` |

`SessionView`에는 다음이 있습니다.

- `id`: 공개 식별자. 권한이나 쿠키 값이 아닙니다.
- `selectedCategoryId`: 미선택이면 null, 아니면 menswear/womenswear.
- `startedAt`, `updatedAt`, `expiresAt`, `completedAt`: ISO 8601 UTC. completedAt은 미완료면 null.
- `status`: in_progress/completed. 현재 선택 범주를 기준으로 합니다.
- `contentStatus`: category_required/not_ready/ready.
- `catalogVersion`: 해당 범주를 처음 시작하거나 명시적으로 갱신한 버전. 미선택은 null.
- `currentCatalogVersion`, `catalogChanged`: 운영자 변경 감지. 변경되었다고 UI가 자동 새 목록으로 바꾸면 안 됩니다.
- `activeStyleOrder`: 세션에서 실제 탐색할 ID 순서. 순번이 아닌 이 ID로 저장합니다.
- `styles`: 고정 순서에 대응하는 공개 요약 목록. UI 고정 배열 대신 사용하며 `activeStyleOrder`가 순서의 기준입니다. 개별 style.order는 현재 카탈로그 메타데이터이므로 기존 세션 배열을 그 값으로 다시 정렬하지 않습니다.
- `currentStyleId`: 현재 스타일 ID, 결과 화면/준비 중이면 null.
- `progress.currentIndex`: 활성 목록 내 0부터 시작하는 위치, 위치가 없으면 null. 표시할 때만 +1 합니다.
- `progress.answeredCount`, `totalCount`: 명시적 응답 수와 현재 탐색 대상 수.
- `progress.originalTotalCount`, `withdrawnCount`: 원래 고정 목록 수와 게시 철회 수.
- `progress.allAnswered`, `canComplete`: 서버가 판단한 완료 가능 여부. totalCount=0이면 false.
- `navigation.previousStyleId`, `nextStyleId`: 현재 위치의 이웃 ID. 사진 하트 저장은 이 값을 바꾸지 않습니다.
- `responses`: 모든 활성 스타일의 `{styleId,response,updatedAt}`. 미응답은 response=null, updatedAt=null.
- `imagePreferences`: 현재 공개 이미지의 저장된 `{styleId,imageId,selected,updatedAt}`. 저장되지 않은 것은 미선택이며 싫어함이 아닙니다.

`SessionSummary`는 `session`, `likedStyles`, `dislikedStyles`, `skippedStyles`, `unansweredStyleIds`, `likedImages`, `isExploringOnly`를 반환합니다. 다른 범주의 응답이나 철회된 자료를 섞지 않습니다. `isExploringOnly`는 좋아한 스타일이 없다는 뜻이며 사진 좋아요 여부와 별개입니다.

## 요청 예시

응답 저장만 하고 위치를 유지합니다.

```json
{ "response": "liked" }
```

명시적 건너뛰기와 다음 위치를 함께 저장합니다. `nextStyleId`는 반드시 응답의 `activeStyleOrder` 또는 `navigation`에서 가져옵니다.

```json
{ "response": "skipped", "nextStyleId": "men_gorpcore" }
```

응답 후 결과 화면으로 이동합니다.

```json
{ "response": "disliked", "nextStyleId": null }
```

사진 선택은 이미지 ID가 들어간 경로에 아래 최종 값만 보냅니다. `toggle`, 외부 URL, 다른 범주 ID 등 추가 필드는 거절됩니다.

```json
{ "selected": true }
```

## 정상 빈 상태 예시

초기 데이터만 등록한 뒤 `GET /api/onboarding/catalog?categoryId=menswear`는 다음 구조입니다. 생략 표시는 설명용이며 실제 JSON에는 없습니다.

```ts
{
  version: 1,
  contentStatus: "not_ready",
  categories: [{ id: "menswear", name: "남성복", order: 10 }],
  genreGroups: [/* 등록된 남성복 상위 장르 3개 */],
  styles: []
}
```

범주를 선택했지만 공개 이미지가 없으면 세션 응답에 아래 값이 포함됩니다. 이 상태는 정상 200 응답이며 네트워크 실패와 구분합니다.

```json
{
  "selectedCategoryId": "menswear",
  "status": "in_progress",
  "completedAt": null,
  "contentStatus": "not_ready",
  "activeStyleOrder": [],
  "currentStyleId": null,
  "progress": {
    "currentIndex": null,
    "answeredCount": 0,
    "totalCount": 0,
    "originalTotalCount": 0,
    "withdrawnCount": 0,
    "allAnswered": false,
    "canComplete": false
  }
}
```

위는 전체 SessionView 중 일부 필드만 발췌했습니다.

## 오류

```json
{
  "error": { "code": "CONTENT_NOT_READY", "message": "탐색할 게시 스타일이 아직 준비되지 않았어요." },
  "requestId": "서버가 발급한 요청 추적 ID"
}
```

| HTTP | code | UI 처리 |
| --- | --- | --- |
| 400 | INVALID_INPUT | 필드/요청 수정. issues가 있으면 항목별 안내 |
| 401 | SESSION_REQUIRED | 자동 초기화 금지. 복원 실패 안내와 새 시작 선택 제공 |
| 403 | REQUEST_HEADER_REQUIRED / ORIGIN_NOT_ALLOWED | 헤더·프록시·PUBLIC_ORIGIN 확인 |
| 404 | STYLE_UNAVAILABLE / IMAGE_UNAVAILABLE / NOT_FOUND | 오래된 자료·실패 표시 후 상태 재조회 |
| 409 | CATEGORY_REQUIRED | 의류 범주 선택으로 안내 |
| 409 | CONTENT_NOT_READY | 콘텐츠 준비 중, 완료 버튼 비활성화 |
| 409 | RESPONSES_REQUIRED | 미응답 확인·수정 또는 명시적 건너뛰기 |
| 413 / 415 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE | JSON 형식·16 KiB 본문 한도 확인 |
| 422 | CATEGORY_UNAVAILABLE / STYLE_NOT_IN_SESSION / IMAGE_NOT_IN_STYLE | 선택 범주의 최신 상태 재조회, 임의 보정 금지 |
| 500 | INTERNAL_ERROR | 저장 실패 안내·재시도. 성공 표시나 데모 대체 금지 |

공개 응답에는 SQL·파일 경로·쿠키·스택을 넣지 않습니다. 실패한 응답은 화면의 저장 성공 상태로 적용하지 않습니다.
