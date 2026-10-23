# 전체 온보딩 디자인 적용·검증

> 이 문서는 이전 어두운 디자인 적용 당시의 기록입니다. 최신 지시에 따른 밝은 사진 중심 흐름·장르 진행 계약·검증은 [PHOTO_ONBOARDING_REVIEW.md](PHOTO_ONBOARDING_REVIEW.md)를 따릅니다. 아래 과거 테스트 수와 화면은 현재 결과로 해석하지 마세요.

검증일: 2026-10-23. 브랜치 `feature/onboarding-backend`, 기준 커밋 `b58ebf6a25bae3cdeee240304d93ef9872b65797`.

## 범위와 기존 코드 보존

사용자는 처음 요청한 ‘남성복 → 포멀’ 한 화면 범위를 **전체 온보딩 디자인 적용**으로 변경했습니다. 의류 범주 선택, 장르별 하위 스타일 사진 묶음, 갤러리·확대, 선택 결과·수정, 완료, 로딩·미준비·오류 상태 전체를 같은 디자인으로 구현했습니다.

Git fetch는 권한 확장 재시도에서도 인증 오류였으나 GitHub main의 소스 압축본을 내려받아 Git 커밋과 전체 파일을 확인했습니다. 최신 main은 로컬과 같은 `b58ebf6`이고 42개 파일의 백엔드·문서만 있으며 프런트엔드와 기존 `DESIGN.md`는 없었습니다. 따라서 기존 UI를 덮어쓰는 대신 `frontend/`를 별도로 추가했습니다. 이전 `project` 앱의 화면·사진은 가져오지 않았습니다. 이전 작업의 미반영 스킬 설치 파일과 `AGENTS.md` 변경은 보존했습니다.

백엔드의 추적된 소스·테스트·설정·의존성·lockfile을 최신 main 압축본과 바이트 단위로 비교해 모두 동일함을 확인했습니다. 새 API나 DB 모델, 서버 취향 계산은 추가하지 않았습니다. 커밋·push는 하지 않았습니다.

## 참고 문서와 디자인 판단

[Spotify 참고 문서 전문](design-references/spotify.DESIGN.md)은 `getdesign@0.6.26`의 실제 CLI 도움말·README·옵션을 확인한 뒤 `--out`으로 별도 확보했습니다. 원본 npm 템플릿과 바이트가 일치하며 [출처·SHA-256](design-references/spotify.source.json)을 남겼습니다. 배포처 웹 페이지는 HTTP 403이어서 npm 배포본을 사용했습니다. 이는 제3자의 영감용 문서로 Spotify 공식 자산이나 전용 서체를 가져오지 않았습니다.

구현에는 `frontend-design`, 검토에는 최신 `web-design-guidelines` 원문을 사용했습니다. 적용 규칙은 루트 [DESIGN.md](../DESIGN.md)에 정리했습니다.

- 검정·차콜의 단계별 표면, 굵은 한글 제목, 작은 보조 설명, pill 조작과 기능성 초록 강조.
- PC 장르 탐색 사이드바, 모바일 가로 장르 탐색. 메인에는 상위 장르 하나와 그 아래의 하위 스타일 묶음만 표시.
- 모바일 2열·중간 폭 3열·넓은 PC 4열 사진. 밝은 중성색 받침면, `contain`, 원본 확대, 사진 밖 하트.
- 하단 조작부와 메인 스크롤 영역을 분리해 사진·버튼의 중첩을 막음.
- 한글에는 시스템 sans-serif 폴백과 충분한 행간을 사용. 문서의 영문 대문자·넓은 자간·극소형 본문은 그대로 복제하지 않음.
- Spotify 로고·앨범·음악·재생바·음악 검색·추천 기능은 없음.

## 실제 화면

아래 캡처는 실행 중인 정상 API의 실제 화면입니다. 실제 사진이 없으므로 준비 중으로 표시합니다.

| 화면 | PC | 모바일 |
| --- | --- | --- |
| 의류 범주 | [PC](design-review/category-desktop.png) | [모바일](design-review/category-mobile.png) |
| 남성복 → 포멀 | [PC](design-review/formal-desktop.png) | [모바일](design-review/formal-mobile.png) |
| 선택 결과·미준비 | [PC](design-review/review-not-ready.png) | [모바일](design-review/review-mobile.png) |
| 여성복 → 클래식·시크 | — | [모바일](design-review/womenswear-mobile.png) |

[완료 화면 검증 캡처](design-review/completion-fixture-only.png)는 **격리된 테스트 fixture 세션**의 화면입니다. 캡처에도 검증용 데이터임을 표시했습니다. 정상 콘텐츠가 준비되었다는 뜻이 아닙니다.

## 실행과 변경 파일

실행 방법: [frontend/README.md](../frontend/README.md). 정상 프런트엔드 포트 5173, 백엔드 3001이며 `PUBLIC_ORIGIN=http://localhost:5173`으로 실제 실행했습니다. `/api`와 `/media` 프록시를 확인했습니다.

주요 구현:

- `frontend/src/styles/tokens.css`, `app.css`: 전체 디자인과 반응형·선택·오류·로딩 상태.
- `frontend/src/screens/CategoryScreen.tsx`, `ExploreScreen.tsx`, `ReviewScreen.tsx`, `CompleteScreen.tsx`: 화면별 책임.
- `frontend/src/components/PhotoGallery.tsx`: 갤러리, 하트, 실패·재시도, 원본 dialog.
- `frontend/src/components/AppShell.tsx`, `Feedback.tsx`, `Icon.tsx`: 공통 레이아웃과 접근 가능한 조작·안내.
- `frontend/src/api/onboarding.ts`: 쿠키·변경 헤더·오류·API 연결. 백엔드 타입은 type-only로 재사용.
- `frontend/src/onboarding/useOnboarding.ts`, `navigation.ts`: 저장 직렬화·복원·이동·결과·완료. 인증·선호의 localStorage 대체 없음.
- `frontend/test/fixture-server.ts`, `onboarding.e2e.py`: 정상 DB와 분리된 브라우저 통합 검증.
- `DESIGN.md`, `README.md`, `docs/GEMINI_HANDOFF.md`, `docs/GEMINI_PROMPT.md`, `AGENTS.md`: 새 디자인 기준·실행 방법·실제 UI 흐름에 맞춘 필요한 문서 수정.

## 검증 결과

`frontend/`의 TypeScript 검사·Vite 프로덕션 빌드가 통과했습니다. `backend/`의 기존 `npm run check`는 포맷·타입 검사 및 통합 테스트 **30개 전부 통과**했습니다. 백엔드 테스트에는 별도 프로세스 재시작 후 지속성·세션 접근 차단·범주 분리·게시 철회가 포함됩니다.

Chromium에서 정상 API 5173과 명시적으로 분리한 fixture API 3101/프런트엔드 5174를 사용해 다음 **15개 시나리오 그룹**을 확인했습니다. fixture 이미지는 작은 합성 검증 패턴이며 실제 착장 사진이 아닙니다. 일반 앱에서 fixture를 불러오는 분기나 자동 fallback은 없습니다.

1. 정상 `not_ready`, 가짜 사진·응답 없음, 콘텐츠가 없을 때 완료 차단.
2. 320·390·768·1440·1920px 가로 넘침 없음, 하단 조작부와 사진 영역 분리.
3. 정상 API 범주 선택과 장르 안내 URL의 새로고침 복원.
4. 하트와 스타일 응답·위치의 독립성, 같은 최종 선택 반복의 멱등성.
5. 복수 스타일 좋아요와 ‘싫어한 스타일의 특정 사진은 좋아함’ 동시 보존.
6. 저장 실패 시 선택·위치 유지, 사용자 재시도 성공.
7. 원본 확대·Escape 닫기 후 포커스·스크롤·하트 유지, 새로고침 서버 복원, 브라우저 선호 저장소 대체 없음.
8. 범주 변경 시 응답·이미지 분리, 원래 범주로 돌아오면 복원.
9. liked/disliked/skipped 구분, 이전 장르·수정 상태 보존, 이미지 형식과 비율 표시.
10. 실제 summary 연결, 완료 멱등성, 선호 수정 후 서버의 진행 중 전환.
11. 좋아한 스타일·사진이 없어도 명시적 건너뛰기 후 완료.
12. 일괄 건너뛰기 중간 실패 시 성공한 응답 보존·이동 중단·남은 응답만 재시도.
13. 첫 API 조회 실패 시 데모 데이터로 대체하지 않고 재연결 제공.
14. 이미지 404 시 레이아웃 유지와 다시 불러오기, 무관 이미지 대체 없음.
15. 잘못된 세션을 자동 삭제하지 않고 명시적 새 시작에서 DELETE → POST 복구.

[브라우저 결과 JSON](design-review/results.json), [추가 접근성 확인](design-review/accessibility-checks.json)을 보존했습니다. 브라우저 page error는 없었습니다. 별도 키보드 실행으로 본문 바로가기·main 포커스·Tab/Enter 범주 선택·3px 포커스·동작 줄이기 설정을 확인했습니다. 전체 보조공학·실기기 인증을 수행했다는 의미는 아닙니다.

## 어두운 의류와 미완료 사항

CSS에서 사진의 색·채도·밝기를 바꾸는 필터·혼합 효과·과도한 크롭을 사용하지 않습니다. 사진 받침면은 `#e8e6e1`입니다. 선택 표시와 하트는 이미지 바깥에 둡니다.

단색 기준 대비 계산:

| 전경 / 배경 | 대비 |
| --- | --- |
| 흰 본문 / `#181818` | 17.76:1 |
| 보조 글 `#b3b3b3` / `#181818` | 8.47:1 |
| 주 버튼 글 `#082412` / `#1ed760` | 8.61:1 |
| 자리표시자 글 `#625f59` / 사진 받침면 | 5.10:1 |
| 검정 `#101010` / 사진 받침면 | 15.26:1 |
| 네이비 `#151e2b` / 사진 받침면 | 13.44:1 |
| 차콜 `#343434` / 사진 받침면 | 9.98:1 |

마지막 세 값은 **합성 단색 경계의 계산**이며 실제 옷의 소재·색상·디테일 식별성을 검증한 결과가 아닙니다. 현재 실제 사진 0장으로, 실제 어두운 의류의 윤곽·원단 질감·원본 배경 대비 검토는 사진 등록 후 남아 있습니다. 원본 자체가 어두운 배경이면 CSS 받침면이 그 배경을 제거하지 않습니다.

54개 스타일 전체에 최소 4장씩 게시하려면 권한과 메타데이터가 확보된 **216장 이상**이 필요합니다. 그 전까지 정상 앱은 장르 안내와 준비 중 화면, 결과 확인을 제공하며 온보딩 완료를 거짓으로 열지 않습니다. 추천·의류 분석·구매·옷장·이미지 생성·수집 API는 구현하지 않았습니다.
