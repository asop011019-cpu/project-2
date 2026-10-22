# Gemini UI 인계

## 작업 분담

Gemini는 화면·디자인·클라이언트 API 연결을 담당합니다. `backend/`의 인증·저장·검증은 구현되어 있습니다. UI 때문에 서버를 다시 만들거나 SQLite를 localStorage로 바꾸지 않습니다. 먼저 저장소 최신 코드와 `AGENTS.md`, `docs/API.md`, `docs/DATA.md`를 읽으세요. 기존 UI가 생겼다면 보존하고 해당 모듈만 수정합니다. 신규 UI는 `frontend/` 등 별도 디렉터리로 시작할 수 있습니다.

## 화면과 호출 순서

분류 조회는 [최신 계약](GENRE_CLASSIFICATION.md)을 사용합니다. 상위 장르는 범주별 5개이며 `genreGroups[].styleDefinitions`로 이름·준비 상태를 안내할 수 있습니다. 실제 탐색은 기존 세션 목록을 따릅니다. 상위 장르 복수 선택을 저장하거나 선택 장르로 세션을 필터링하는 API는 아직 없으며 다음 작업의 계약입니다. 화면에서 선호나 저장 성공을 추측해 구현하지 마세요.

1. 앱 시작 시 `POST /session {}`를 한 번만 호출하세요. 쿠키가 없으면 201로 생성하고 유효한 쿠키가 있으면 200으로 기존 상태를 반환합니다. 새로고침도 같은 흐름이며 별도 상태 재조회는 `GET /session`을 사용합니다. 앱 초기화가 겹치지 않도록 요청을 공유하세요. 만료/잘못된 쿠키는 POST도 401을 반환하므로 조용히 삭제하지 않습니다. 복원 실패를 안내하고 사용자가 새 시작을 선택한 경우에만 DELETE → POST 순서로 처리합니다.
2. 첫 화면은 남성복/여성복 두 선택지만 제시합니다. 선택 시 `PUT /session/category`를 보내고 저장 성공 후 응답 화면으로 이동합니다. 이 값은 추천 의류 범주이며 성별 정체성 질문이 아닙니다.
3. `genreGroups`, 세션 `styles`와 `activeStyleOrder`를 사용해 상위 장르를 안내합니다. 한 번에 `currentStyleId` 하나를 보여주고 `GET /styles/:styleId`로 실제 이미지를 받습니다. `styles.length`를 별도 상수로 복사하거나 12로 고정하지 않습니다.
4. 대표 이미지 4–6장을 모바일 2열/데스크톱 3열 등으로 표시합니다. format 3종을 모두 수용하고 isGenerated도 표시합니다. 하트 클릭과 확대 클릭은 분리합니다. 하트는 ID로 `PUT .../preference {selected}`를 보내며 위치를 이동하지 않습니다. 확대는 originalUrl, 갤러리는 thumbnailUrl과 alt/비율을 사용합니다. 하의·신발이 잘리지 않게 object-fit: contain을 기본으로 합니다.
5. 좋아요/취향 아님/건너뛰기는 각각 liked/disliked/skipped입니다. 응답 시 `{response,nextStyleId:session.navigation.nextStyleId}`를 함께 보내면 원자적으로 저장하고 다음으로 이동합니다. 시간에 따른 선택·이동은 없습니다. 건너뛰기를 싫어함으로 바꾸지 않습니다. 여러 좋아요를 허용하고 사진 좋아요와 스타일 응답은 독립적으로 표현합니다.
6. 이전 이동은 `PUT /session/position {styleId:previousStyleId}`입니다. 기존 responses와 imagePreferences를 그대로 복원합니다. 첫 스타일의 이전은 범주 선택 UI로 돌아가며 응답을 삭제하지 않습니다. 범주를 바꾸면 `PUT /session/category` 응답을 적용하고, 해당 범주의 과거 위치를 유지합니다.
7. 마지막은 `GET /session/summary`입니다. 범주, 좋아한 스타일, 좋아한 사진 썸네일, 전체 응답/미응답과 수정 기능을 표시합니다. 좋아한 스타일이 없으면 “아직 취향을 탐색 중이에요”라고 표시합니다. 사진 몇 장으로 취향이 확정되었다고 말하지 않습니다.
8. 완료 버튼은 progress.canComplete를 따릅니다. `POST /session/complete` 성공 후 완료 상태와 취향 수정 기능만 보여줍니다. 이후 추천·옷장 단계는 구현되지 않았으므로 존재하는 것처럼 연결하지 않습니다. 실제 선호 수정 시 서버가 in_progress로 다시 열고 completedAt을 비우므로 수정 결과와 재완료 버튼을 반영합니다.
9. 카탈로그가 바뀌었다고 자동 새 목록을 적용하지 않습니다. 철회된 항목과 진행 개수는 서버 응답을 따릅니다. 최신 목록을 새로 받는 동작은 사용자가 선택한 경우에만 `POST /session/refresh-catalog`를 호출합니다. 과거 선호는 보존됩니다.
10. 초기화는 `POST /session/reset`, 완전 삭제는 `DELETE /session`입니다. 모든 범주의 기록이 지워지므로 화면에 명확한 확인과 설명을 제공합니다. 세션 토큰을 UI에 노출하지 않습니다.

## API 클라이언트 예시

아래는 인계용 예시이며 구현된 프런트엔드 파일은 아닙니다. mutation 요청을 직렬화하고 이전 응답이 새 선택을 덮어쓰지 않게 하세요. 저장 중에는 해당 컨트롤을 비활성화하거나 큐를 사용합니다. 저장 성공 전에는 다음 화면이나 “저장됨”을 확정하지 않습니다.

```ts
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T | undefined> {
  const response = await fetch(`/api/onboarding${path}`, {
    method,
    credentials: "include",
    headers: method === "GET" ? {} : {
      "Content-Type": "application/json",
      "X-Onboarding-Request": "1",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return undefined;
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error.message), {
    status: response.status, code: result.error.code, issues: result.error.issues,
  });
  return result as T;
}
```

## 개발·운영 연결

백엔드는 Node 24 LTS에서 별도 서버 프로세스로 실행하며 브라우저 번들에 포함하지 않습니다. AI Studio 미리보기만 실행해도 API 서버가 자동 생기는 것은 아닙니다. 백엔드 기본 포트는 3001입니다. 프런트엔드 개발 서버가 `/api`, `/media`를 백엔드로 프록시하고 브라우저는 상대 경로만 호출하게 하세요. 예를 들어 Vite의 경우 현재 설정에 두 proxy 규칙만 추가합니다. `PUBLIC_ORIGIN`은 실제 프런트엔드 주소/포트로 설정합니다. `changeOrigin`만 켜서 Origin 검사를 우회하려 하지 마세요. 운영은 같은 출처의 HTTPS 프록시와 영구 DB 볼륨이 필요합니다. SQLite 파일이 사라지는 서버리스 배포만으로 저장 기능이 연결되었다고 보고하지 않습니다.

## 반드시 구분할 상태

| 상태 | 화면 |
| --- | --- |
| 요청 진행 중 | 로딩 표시, 중복 세션 생성/중복 변경 방지 |
| category_required | 의류 범주 선택 |
| not_ready + totalCount=0 | 콘텐츠 준비 중, 가짜 사진·완료 버튼 금지 |
| 일부 게시 철회 | 서버의 줄어든 totalCount·activeStyleOrder 반영 |
| 네트워크/500 | 실패 안내·재시도, 입력/선택 보존 |
| 이미지 파일 404/로딩 실패 | 분명한 실패 표시, 무관 이미지 대체 금지 |
| SESSION_REQUIRED | 기록 복원 실패 안내, 사용자 새 시작 선택 |
| 완료 | 저장된 상태·취향 수정. 추천 기능을 구현된 것으로 표시하지 않음 |

## 현재 실제 의존 사항

등록된 54개 스타일은 모두 초안이고 **실제 이미지가 없습니다**. 운영 이미지 생성·수집 기능은 없습니다. 모든 스타일을 최소 4장씩 게시하려면 216개 실제 의복 조합 이미지와 권한·출처·형식·크기 정보가 필요합니다. 등록 위치와 CLI는 `docs/CONTENT.md`를 따릅니다. API/DB 테스트는 격리된 테스트 fixture로 검증했습니다. 테스트 fixture를 실제 앱에서 자동 사용하거나 개발을 콘텐츠 완성으로 보고하지 마세요.

실제 이미지가 등록되기 전에는 정상 빈 상태·오류·세션·범주 선택 UI를 실제 API로 연결할 수 있습니다. 사진 포함 흐름은 테스트 환경의 API fixture로만 검증하고 그 한계를 완료 보고에 명시합니다.
