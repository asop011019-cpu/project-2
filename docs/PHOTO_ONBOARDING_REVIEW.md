# 사진 중심 온보딩 구현·검증

2026-10-23. 브랜치 `feature/onboarding-backend`, 기준 HEAD `b58ebf6a25bae3cdeee240304d93ef9872b65797`. 기존 미반영 UI·디자인 스킬·문서를 보존하고 필요한 구간을 수정했습니다. 커밋·push는 하지 않았습니다.

## 화면과 책임

의류 범주 → 상위 장르 하나와 여러 하위 스타일 사진 묶음 → 선택 확인·수정 → 완료입니다. 별도의 상위 장르 선택 화면과 스타일별 응답 페이지는 없습니다. 목록·설명·순서는 카탈로그/세션 응답을 사용합니다. 기존 인증·쿠키·SQLite·프록시를 재사용하며 의존성과 잠금파일을 변경하지 않았습니다.

- `frontend/src/screens/`: 범주 질문, 장르별 사진 탐색, 선택 사진의 장르·하위 스타일명, 완료·수정.
- `components/PhotoGallery.tsx`: 하트와 확대 분리, 원본 비율, 실패·재시도, 확대 제목·포커스 복원.
- `onboarding/useOnboarding.ts`, `navigation.ts`: 범주·장르 위치 복원과 API 저장 성공 후 이동.
- `onboarding/PreferenceQueue.ts`: 마지막 사진 선택 의도 유지, 직렬 저장, 실패한 선택 보존·재시도와 이동 차단. 브라우저 영구 저장소를 추가하지 않았습니다.
- `api/onboarding.ts`: 타입 전용 공유, 쿠키와 요청 헤더, 실제 API 연결.
- `styles/tokens.css`, `app.css`, `components/AppShell.tsx`: 밝은 중성색·한글 위계·여백·반응형·상태 디자인. PC 비교 그리드, 모바일 2열과 세로 스크롤, 하단 버튼 공간 예약.

## 직접 필요한 백엔드 변경

기존 서버는 스타일별 liked/disliked/skipped 응답만으로 완료를 판단했습니다. 이를 장르 방문으로 재해석하지 않고 별도 계약을 추가했습니다. 자세한 요청·응답은 [API.md](API.md#사진-중심-장르-탐색-현재-ui)를 따릅니다.

- 마이그레이션 v3: `photo_explorations`, `session_genres` 추가. 기존 ID·응답·이미지·스냅샷·카탈로그 데이터는 변환하지 않습니다.
- `POST /session/photo-exploration`: 범주별 장르 순서 고정·사진 탐색 시작/복원.
- `PUT /session/genre-position`: 이전·수정의 위치만 저장.
- `PUT /session/genres/:genreGroupId/progress`: viewed/skipped와 다음 위치를 원자적으로 저장. 하트·스타일 응답을 변경하지 않습니다.
- `SessionView.photoExploration`의 진행률·완료 가능 조건, `SessionSummary.selectedExamples`의 사진/장르/하위 스타일 연결 추가.
- 기존 catalog/style/detail/preference/summary/complete/refresh/session API 재사용. 구형 스타일 응답 클라이언트의 계약과 기록도 보존했습니다.
- 사진 1–3장만 준비되어도 실제 승인된 사진만 공개하도록 최소 게시 조건을 1장으로 조정했습니다. 목표 4–6장, 최대 6장이며 가짜 사진을 추가하지 않습니다.

모든 장르를 살펴봤거나 건너뛰고 활성 콘텐츠가 있으면 하트 0개도 완료 가능합니다. 실제 사진이 전혀 없으면 콘텐츠 준비 중이며 완료 불가입니다. 완료 후 실제 선호 변경은 완료를 해제하고 이동/같은 값 재전송은 완료를 유지합니다.

## 사용한 스킬과 디자인

설치된 `frontend-design`을 주 방향으로 사용했습니다. `ui-ux-pro-max`의 키보드·터치·피드백 자료, `emil-design-eng`의 짧은 인터랙션·동작 줄이기·화면 마감 규칙을 참고했습니다. `web-design-guidelines`는 최신 원문을 다시 가져와 접근성·포커스·이미지·오류·상태를 검토했습니다. `hallmark`는 이번 구현에 사용하지 않았습니다.

이전 [어두운 디자인 원문](design-references/onboarding-dark-v1.DESIGN.md)과 Spotify 참고 원문을 보존하고 [현재 DESIGN.md](../DESIGN.md)를 갱신했습니다. 밝은 면, 짙은 텍스트, 절제된 녹색만 기능 강조에 사용합니다. 사진의 색·밝기를 바꾸는 필터나 과도한 크롭은 없습니다.

## 검증 결과

- 백엔드 `npm run check` 및 `npm run build` 통과: 포맷·타입 검사, 통합 테스트 **33개 통과**.
- 프런트엔드 `npm run build` 통과: TypeScript·Vite 프로덕션 빌드.
- Chromium의 정상 API(5173/3001)와 별도 fixture API(5174/3101)에서 **14개 시나리오 그룹 통과**. 브라우저 page error 0개.
- 장르별 viewed/skipped 분리, 스타일 미응답 유지, 하트 멱등성·연속 입력의 최종 상태, 저장 실패/재시도, 원자적 진행 저장, 범주별 복원, 깨끗한 URL/새로고침 복원, 이전·수정, 하트 0개 완료·재완료, 인증 실패의 명시적 복구를 확인했습니다.
- 별도 실제 HTTP 서버 프로세스를 종료·재시작한 후 장르 진행·쿠키 상태가 동일함을 통합 테스트로 확인했습니다. DB 오류 시 방문/위치가 일부만 저장되지 않는 테스트도 포함합니다.
- 320·390·768·1440·1920px에서 가로 넘침과 하단 버튼/본문 겹침이 없음을 확인했습니다. 모델 착장·플랫레이·콜라주 메타데이터와 contain 렌더링을 fixture로 검증했습니다.
- 키보드 하트·확대, Escape 닫기 후 포커스/스크롤 유지, 대체 텍스트, 동작 줄이기 설정을 확인했습니다. 실물 휴대폰·전체 보조공학 인증은 수행하지 않았습니다.
- 추가 키보드 확인에서 본문 바로가기·main 포커스·Enter 범주 선택·미준비 장르 서버 복원을 확인했습니다. 단색 대비는 본문/흰 면 15.30:1, 보조 글/흰 면 6.11:1, 흰 버튼 글/강조색 7.33:1, 자리표시자 글/받침면 5.65:1입니다. [추가 접근성 결과](design-review/photo-exploration/accessibility-checks.json)를 보존했습니다.

화면·결과는 [photo-exploration 증빙 폴더](design-review/photo-exploration/)에 보존합니다. fixture 캡처는 검증용 패턴임을 표시하며 실제 패션 사진이 아닙니다.

| 정상 API 화면 | PC | 모바일 |
| --- | --- | --- |
| 의류 범주 | [PC](design-review/photo-exploration/category-desktop.png) | [모바일](design-review/photo-exploration/category-mobile.png) |
| 남성복 → 포멀 준비 중 | [PC](design-review/photo-exploration/formal-desktop.png) | [모바일](design-review/photo-exploration/formal-mobile.png) |

## 실행·미완료 사항

실행은 [frontend/README.md](../frontend/README.md)를 따릅니다. 백엔드 `PUBLIC_ORIGIN=http://localhost:5173`, API 3001, UI 5173이며 `/api`, `/media` 프록시를 유지했습니다. 서버 시작 시 v3 마이그레이션이 적용되고 초기 데이터 등록은 비파괴적입니다. 영구 디스크 없는 호스팅에서 SQLite 지속성을 보장하지 않습니다.

실제 사진은 **0장**입니다. 54개 스타일의 목표 4–6장에는 총 **216–324장**과 제작자·권한·형식·크기 메타데이터가 필요합니다. [CONTENT.md](CONTENT.md)의 등록 CLI로 추가합니다. 실제 사진의 옷·소재·색상 식별성과 이미지별 적합성은 등록 후 검토해야 합니다. fixture는 정상 앱에 넣거나 API 실패 시 대체하지 않았습니다.

Gemini는 새 API 계약과 기존 컴포넌트를 유지하며 실제 콘텐츠 등록 후 사진 구도·모바일 가독성을 검토하면 됩니다. 추천·의류 분석·구매·결제·옷장은 구현하지 않았으며 온보딩 완료 뒤 연결할 다음 기능도 없습니다. 여러 탭의 동시 선호 변경 충돌 조정은 이번 범위에 포함하지 않았습니다.
