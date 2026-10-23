# Gemini에 붙여 넣을 프롬프트

아래 본문을 Google AI Studio의 Gemini에 전달하세요. 먼저 이 GitHub 저장소의 최신 변경을 가져와야 합니다.

---

너는 `https://github.com/asop011019-cpu/project-2`의 프런트엔드 개발자이자 제품 디자이너다. Codex가 `backend/`에 최초 취향 수집용 API·DB·인증·검증을 구현했다. 너는 **온보딩 UI와 API 연결만** 담당한다.

먼저 최신 GitHub 코드와 현재 커밋·미반영 변경을 확인하고 `AGENTS.md`, `DESIGN.md`, `frontend/README.md`, `docs/API.md`, `docs/GEMINI_HANDOFF.md`, `docs/DATA.md`, `docs/CONTENT.md`를 읽어라. 현재 frontend/의 밝은 중성색 온보딩 UI를 보존하고 필요한 모듈만 수정한다. localStorage로 저장을 대체하지 않는다. 최신 코드를 받지 못했다면 오래된 코드로 시작하지 않는다.

사용자 흐름은 다음과 같다.

1. 첫 화면은 추천받을 의류 범주 남성복/여성복 두 카드만 제공한다. 성별 정체성을 묻지 않는다. 선택을 서버에 저장한 뒤 자연스럽게 다음 화면으로 이동한다.
2. 서버 photoExploration.genres의 상위 장르를 한 번에 하나씩 표시하고 해당 장르의 여러 하위 스타일 사진을 묶어 보여준다. 별도의 장르 선택 화면이나 하위 스타일별 페이지를 만들지 않는다. 이름·설명·순서·진행률은 서버 응답으로 정한다.
3. 실제 대표 이미지 목표는 4–6장이며 일부만 준비되면 그 사진만 보여준다. model_outfit/flat_lay/collage를 지원하고 생성 여부를 표시한다. 모바일 2열, PC 여러 열로 배치하며 contain으로 옷과 신발을 보존한다. 하트와 확대를 분리하고 확대에 하위 스타일명을 표시한다. 닫으면 포커스·스크롤·선택을 유지한다.
4. 이 UI는 사진별 하트만 선호로 저장한다. 스타일 liked/disliked/skipped 응답을 자동 생성하거나 별도 버튼을 만들지 않는다. 다음 장르는 viewed, 이 장르 건너뛰기는 skipped로 기록하며 하트를 유지한다. 이전은 위치만 바꾼다. 시간에 따른 이동은 없다.
5. 이전·범주 변경·새로고침은 서버 photoExploration과 imagePreferences를 복원한다. 결과에는 범주, 선택한 사진과 연결된 장르·하위 스타일명, 수정 기능을 표시한다. “선택한 스타일 예시”라고 표현하고 사진 0개도 허용한다. 사진 몇 장으로 취향을 확정하지 않는다.
6. 완료는 photoExploration.progress.canComplete를 따르며 하트가 없어도 모든 장르를 살펴보거나 건너뛰면 가능하다. 실제 콘텐츠가 전혀 없으면 완료할 수 없다. 완료 후 실제 선호 변경은 서버의 진행 중 전환과 재완료를 반영한다. 삭제·초기화는 사용자가 명시적으로 요청한 경우에만 처리한다.

API 연결 시 반드시 지킬 사항:

- 앱 시작은 POST `/api/onboarding/session` `{}`를 한 번만 호출한다. 쿠키가 없으면 생성(201), 유효한 쿠키가 있으면 기존 상태(200)다. 이후 GET으로 복원/재조회할 수 있다. 동시에 여러 초기화 요청을 보내지 않는다.
- fetch는 상대 경로와 credentials: include를 사용한다. POST/PUT/DELETE에는 X-Onboarding-Request: 1을 보내고 JSON 본문이 있을 때만 Content-Type: application/json을 보낸다. HttpOnly 쿠키나 토큰을 JavaScript/localStorage에서 읽고 저장하지 않는다.
- 프런트엔드 개발 서버는 `/api`와 `/media`를 백엔드 포트 3001로 프록시한다. 백엔드 PUBLIC_ORIGIN을 실제 프런트엔드 출처와 맞춘다. 운영은 동일 출처 HTTPS를 사용한다. 인증 검사를 제거하거나 CORS를 임의 개방하지 않는다.
- 범주 저장 뒤 photoExploration=null이면 POST /session/photo-exploration {}로 사진 탐색을 시작한다. 다음/건너뛰기는 PUT /session/genres/:genreGroupId/progress {status:"viewed"|"skipped",nextGenreGroupId:다음ID|null}, 이전/수정은 PUT /session/genre-position {genreGroupId:대상ID|null}이다. 기존 response/position API에 의미를 끼워 넣지 않는다.
- 하트는 이미지 ID 경로에 `{selected:true}` 또는 `{selected:false}`를 보낸다. toggle 요청이나 이미지 URL 저장을 만들지 않는다. 하트 저장으로 다음 스타일로 이동하지 않는다.
- 사진 하트는 연속 클릭의 마지막 의도를 큐에 유지해 직렬 저장한다. 저장 중 이동을 막고 실패한 의도를 성공처럼 표시하지 않는다. 재시도를 제공하며 오래된 조회 응답이 새 선택을 덮어쓰지 않게 한다. 로딩·저장 실패·이미지 실패·세션 만료를 구분한다.
- photoExploration.genres/progress/currentGenreGroupId와 activeStyleOrder/styles/imagePreferences가 서버 원본이다. 같은 이름의 다른 범주를 합치지 않는다. summary.selectedExamples의 사진·장르·하위 스타일명을 사용한다. catalogChanged는 자동 교체하지 않고 명시적 refresh-catalog로 갱신한다.
- 401 복원 실패 때 기록을 조용히 초기화하지 않는다. 새 시작을 명시적으로 선택한 경우에만 DELETE session → POST session 순서로 처리한다.

현재 **54개 스타일 정의(남성복 24·여성복 30)는 있지만 실제 이미지 0장, 탐색 가능한 스타일 0개**다. 정상 응답의 contentStatus=not_ready는 오류가 아니다. 콘텐츠 준비 중 화면을 정식 상태로 구현하고 가짜 URL·무관한 사진·중복 이미지·무단 수집·런타임 mock 대체로 채우지 않는다. 사진 포함 UI는 격리된 테스트 fixture로 검증할 수 있으나, 실제 콘텐츠까지 완성했다고 보고하지 않는다. 이미지 제작·등록은 별도 작업이다.

의류 분석·상품 검색·코디 추천·구매 링크·옷장 기능은 아직 없다. 구현된 것처럼 버튼이나 결과를 만들지 말고 온보딩 완료·취향 수정까지만 연결한다.

짧은 수정 계획을 먼저 제시한 뒤 실제 UI를 구현하고 확인하라. 완료 시 변경 파일, API 연결, 실행·프록시 설정, 확인한 동작, 실제 이미지 부족, 미구현 기능, 커밋/브랜치를 보고하라.
