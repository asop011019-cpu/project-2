# 온보딩 프런트엔드

기준 main `b58ebf6`의 백엔드를 사용하는 `frontend/`의 기존 온보딩을 부분 수정했습니다. 최신 지시에 따라 밝은 중성색 디자인과 사진 중심 흐름을 사용합니다. 사진 선호와 별도로 장르 진행을 저장하기 위한 최소 API·DB 계약만 확장했습니다.

## 실행

Node.js **24.19 이상 LTS**를 사용합니다. 두 터미널을 엽니다.

첫 번째 터미널에서 백엔드를 실행합니다.

```sh
cd backend
npm ci
```

`backend/.env`에 다음 값을 설정합니다. 기존 파일이 있다면 필요한 값만 수정하고 다른 설정을 보존하세요.

```dotenv
PUBLIC_ORIGIN=http://localhost:5173
```

```sh
npm run dev
```

두 번째 터미널에서는 다음을 실행합니다.

```sh
cd frontend
npm ci
npm run dev
```

브라우저에서 **http://localhost:5173/** 을 엽니다. 개발 서버는 `/api`와 `/media`를 포트 3001의 백엔드로 프록시합니다. 이 작업 환경에서는 두 서버를 실제로 실행하고 브라우저로 확인했습니다. 이 환경의 localhost가 사용자의 PC localhost와 같은 서버라는 의미는 아닙니다.

백엔드 주소를 바꿀 때만 `frontend/.env.example`을 참고해 `frontend/.env`의 `ONBOARDING_API_TARGET`을 설정합니다. 브라우저에는 서버 키를 넣지 않습니다. 접속 호스트·포트가 달라지면 백엔드 `PUBLIC_ORIGIN`도 실제 브라우저 주소에 맞춰야 합니다. 운영에서는 빌드한 정적 파일과 `/api`, `/media`를 같은 출처로 제공하고 기존 백엔드의 영구 저장소 조건을 유지합니다.

## 화면과 저장

- 의류 범주 → 상위 장르 하나씩 → 장르 안의 하위 스타일 사진 묶음 → 선택 확인·수정 → 완료.
- 범주·장르·하위 스타일 이름과 설명, 준비 상태는 API에서 읽습니다. 탐색 가능한 스타일 ID와 순서·진행·완료 판정은 서버 세션이 원본입니다.
- 장르 탐색은 단일 장르를 보여주는 화면 이동입니다. 복수 장르 선호나 선택 필터를 새로 저장하지 않습니다. 고정된 서버 세션 목록을 재정렬하거나 새 스타일을 자동 추가하지 않습니다.
- 사진 하트와 스타일 응답은 독립적입니다. 하트는 최종 `selected` 값을 보내며 사진 URL을 선호로 저장하지 않습니다. 확대는 원본 주소로 열고 저장 요청을 만들지 않습니다.
- 이 UI는 스타일 전체 응답을 만들지 않습니다. ‘다음 장르’는 viewed, ‘이 장르 건너뛰기’는 skipped를 장르 위치와 같은 트랜잭션으로 저장하며 사진 하트를 유지합니다. 이전 이동은 기록을 바꾸지 않습니다.
- 새로고침은 쿠키로 서버 세션과 photoExploration을 복원합니다. 범주별 상태를 섞지 않습니다. 사진이 없는 장르 위치도 서버에 저장하고 localStorage/sessionStorage를 쓰지 않습니다. 서버가 고정한 genres 순서·진행률·완료 조건을 따릅니다.
- PreferenceQueue는 연속 입력의 마지막 사진 선택을 직렬 저장합니다. 저장 중 이동을 막고, 실패 시 미저장 선택과 재시도를 유지합니다. 큐는 메모리에만 있으며 미저장 상태에서 페이지를 떠나면 경고합니다. 여러 탭 간 충돌 해결은 이번 범위가 아닙니다.
- 정상 앱에는 실제 사진이 없습니다. 현재 `not_ready`가 정상이며 사진·하트·완료 기능이 준비된 것처럼 표시하지 않습니다. 일부 스타일만 게시되면 그 활성 목록만 저장합니다.
- 완료 뒤 실제 선호 수정은 서버의 `in_progress` 전환과 재완료 조건을 따릅니다. 추천·의류 분석·상품·구매·옷장 기능은 없습니다.

## 파일 책임

| 위치 | 책임 |
| --- | --- |
| `src/styles/tokens.css`, `app.css` | 공통 색·서체·간격·반응형·선택·상태 디자인 |
| `src/api/onboarding.ts` | 쿠키·요청 헤더·오류 처리와 API 호출, 백엔드 타입의 type-only 재사용 |
| `src/onboarding/useOnboarding.ts` | 서버 상태 복원, 직렬 저장, 응답과 위치 관리 |
| `src/onboarding/PreferenceQueue.ts` | 사진별 마지막 입력 병합·직렬 저장·실패 재시도 |
| `src/onboarding/navigation.ts` | URL 화면 상태, 서버 목록을 사용한 장르 안내 |
| `src/screens/` | 범주·탐색·선택 확인·완료 화면 |
| `src/components/PhotoGallery.tsx` | 사진·하트, 실패 처리, native dialog 확대 |
| `src/components/AppShell.tsx`, `Feedback.tsx` | 공통 레이아웃·단계 안내·로딩·오류 |
| `vite.config.ts` | `/api`, `/media` 개발 프록시 |

디자인 원문·적용 기준은 루트 [DESIGN.md](../DESIGN.md), 사진 등록은 [CONTENT.md](../docs/CONTENT.md), API는 [API.md](../docs/API.md)를 참고하세요. 스타일 운영 데이터를 화면에 복제하지 않았으므로 데이터 변경 때문에 화면 목록을 다시 작성할 필요가 없습니다.

## 검증

```sh
cd frontend
npm run build
```

기존 백엔드 확인 명령은 `backend/`에서 `npm run check`입니다.

브라우저 통합 검증에는 Python Playwright와 Chromium이 필요합니다. 앱 실행용 npm 의존성과는 별도인 검증 도구입니다. 현재 Codex 환경에는 이미 설치되어 있습니다.

게시 사진을 요구하는 상호작용은 정상 앱의 DB가 아닌 **별도 임시 fixture API**로 검증합니다. 이미지들은 작은 합성 테스트 패턴이며 패션 예시가 아닙니다. 다음 두 테스트 서버를 별도 터미널에서 실행합니다.

```sh
cd frontend
node test/fixture-server.ts
```

또 다른 터미널에서 `ONBOARDING_API_TARGET=http://127.0.0.1:3101` 환경 변수를 설정하고 실행합니다.

```sh
npm run dev -- --port 5174
```

macOS/Linux에서는 `ONBOARDING_API_TARGET=http://127.0.0.1:3101 npm run dev -- --port 5174`로 실행할 수 있습니다. Windows PowerShell에서는 먼저 `$env:ONBOARDING_API_TARGET="http://127.0.0.1:3101"`을 설정합니다. 정상 서버 5173의 프록시 설정이나 실제 DB를 바꾸지 않습니다.

그다음 프로젝트 루트에서 실행합니다.

```sh
python3 frontend/test/onboarding.e2e.py --output-dir /tmp/project2-ui-checks
```

Windows에서는 설치된 Python 명령을 사용하고 출력 디렉터리를 쓰기 가능한 로컬 경로로 바꿉니다. Chromium 실행 파일 경로는 테스트 스크립트의 해당 환경 경로를 조정해야 할 수 있습니다.

검증 결과와 실제 앱 스크린샷: [사진 중심 온보딩 검증 기록](../docs/PHOTO_ONBOARDING_REVIEW.md).

## 기술 버전

React·React DOM `19.3.1`, Vite `8.3.5`, TypeScript `7.0.2`를 새 프런트엔드에만 고정 설치했습니다. React와 Vite의 공식 저장소 README 및 npm 배포 버전·Node 요구사항을 확인했습니다. Vite 8.3.5는 Node 20.19 또는 22.12 이상을 지원하고, 프로젝트 전체 실행에는 기존 백엔드 기준 Node 24.19 이상을 사용합니다. 백엔드 의존성과 lockfile은 변경하지 않았습니다.
