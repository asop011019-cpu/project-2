# Gemini UI 인계

## 작업 분담

화면·디자인·클라이언트 API 연결은 `frontend/`에 구현되어 있습니다. 최신 사용자 지시는 밝은 중성색의 사진 중심 탐색입니다. `backend/` 인증·저장은 재사용하고 장르 진행만 최소 확장했습니다. 먼저 `AGENTS.md`, `DESIGN.md`, `frontend/README.md`, `docs/API.md`, `docs/DATA.md`를 읽고 기존 UI의 필요한 모듈만 수정하세요. localStorage로 서버 저장을 대체하지 않습니다.

## 화면과 호출 순서

분류 조회는 [분류표](GENRE_CLASSIFICATION.md)를, 장르 방문·위치·완료는 [사진 탐색 계약](API.md#사진-중심-장르-탐색-현재-ui)을 따릅니다. 별도 상위 장르 선택 화면이나 하위 스타일별 페이지는 없습니다. 장르 복수 선호나 필터링을 추측해 구현하지 마세요.

1. 앱 시작 시 `POST /session {}`를 한 번만 호출하세요. 쿠키가 없으면 201로 생성하고 유효한 쿠키가 있으면 200으로 기존 상태를 반환합니다. 새로고침도 같은 흐름이며 별도 상태 재조회는 `GET /session`을 사용합니다. 앱 초기화가 겹치지 않도록 요청을 공유하세요. 만료/잘못된 쿠키는 POST도 401을 반환하므로 조용히 삭제하지 않습니다. 복원 실패를 안내하고 사용자가 새 시작을 선택한 경우에만 DELETE → POST 순서로 처리합니다.
2. 첫 화면은 “어떤 옷의 코디를 찾아볼까요?”와 남성복/여성복 두 선택지입니다. `PUT /session/category` 성공 뒤 photoExploration=null이면 `POST /session/photo-exploration {}`를 호출하고 첫 장르로 이동합니다. 기존 photoExploration이 있으면 범주별 위치·결과/완료 상태를 복원합니다. 성별 정체성 질문이 아닙니다.
3. `photoExploration.genres`의 고정 순서대로 상위 장르 하나와 여러 하위 스타일 사진 묶음을 표시합니다. 장르 이름·설명·분류 안내는 catalog.genreGroups, 실제 사진은 activeStyleOrder의 해당 스타일 상세 GET을 사용합니다. 사진 탐색 위치를 currentStyleId에서 추측하지 않습니다. 전체 단계 수는 photoExploration.progress.totalCount입니다.
4. 목표 4–6장을 모바일 2열/데스크톱 그리드로 표시하되 1–3장만 준비되면 실제 사진만 보여줍니다. format 3종과 isGenerated를 지원합니다. 하트는 ID로 PUT preference {selected}, 확대는 originalUrl입니다. alt/크기/contain으로 옷과 신발을 보존하고 확대에는 장르·하위 스타일명을 표시합니다.
5. 사진 하트만 선호로 저장합니다. 스타일별 liked/disliked/skipped 조작은 이 UI에 없습니다. 하트 미선택은 싫어함이 아니고 스타일 응답을 자동 생성하지 않습니다. 빠른 반복 입력은 PreferenceQueue로 마지막 의도를 직렬 저장하며 실패 시 미저장 표시·재시도를 제공하고 이동을 막습니다.
6. 다음은 PUT /session/genres/:id/progress {status:"viewed",nextGenreGroupId:다음ID}, 건너뛰기는 status:"skipped"이며 마지막은 다음 ID=null입니다. 기록과 이동이 원자적이고 하트를 지우지 않습니다. 이전/수정은 PUT /session/genre-position으로 위치만 바꿉니다. 미준비 장르도 서버 위치를 저장합니다. 범주 변경은 과거 기록을 복원합니다.
7. GET /session/summary의 selectedExamples로 사진과 연결된 장르·하위 스타일명을 표시합니다. “선택한 스타일 예시”라고 표현하고 범주·선택 수정·완료를 제공합니다. 하트 0개는 “아직 취향을 탐색 중이에요”로 표시하며 스타일 전체 선호를 확정하지 않습니다.
8. 완료 버튼은 photoExploration.progress.canComplete와 POST /session/complete를 따릅니다. 실제 콘텐츠가 있고 모든 장르를 viewed/skipped로 기록하면 하트 0개도 완료할 수 있습니다. 실제 콘텐츠가 전혀 없으면 not_ready/완료 불가입니다. 완료 후 이동은 완료를 유지하고 실제 사진 선호·장르 기록 변경은 진행 중으로 엽니다. 다음 추천·옷장 단계는 없습니다.
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
      "X-Onboarding-Request": "1",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
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

등록된 54개 스타일은 모두 초안이고 실제 이미지 0장입니다. 목표는 스타일당 4–6장(전체 216–324장)이지만 승인된 부분 세트도 공개할 수 있습니다. 등록은 docs/CONTENT.md를 따릅니다. 이미지 생성·수집 API나 자동 fixture 대체는 없습니다. 테스트용 합성 패턴은 격리 API에서만 사용하며 실제 콘텐츠 완성으로 보고하지 않습니다.

실제 이미지가 등록되기 전에는 정상 빈 상태·오류·세션·범주 선택 UI를 실제 API로 연결할 수 있습니다. 사진 포함 흐름은 테스트 환경의 API fixture로만 검증하고 그 한계를 완료 보고에 명시합니다.
