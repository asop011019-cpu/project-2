# project-2 · 취향 온보딩

새 패션 코디 앱의 **최초 취향 수집 온보딩**입니다. 기존 `project` 앱의 코드·사진을 가져오지 않았습니다. 백엔드는 `backend/`, 쿠키 인증 API를 사용하는 모바일·PC 웹 화면은 `frontend/`에 있습니다. 현재는 사용자 지시에 따라 밝은 중성색 디자인과 사진 중심 장르 탐색을 사용합니다. [디자인 기준](DESIGN.md)과 [화면 실행 방법](frontend/README.md)을 참고하세요.

구현 범위는 범주별 스타일·이미지 조회, 익명 쿠키 세션, 응답·사진 선호·위치 저장/복원, 결과 확인/수정/완료, 초기화/삭제입니다. 의류 분석·상품 검색·추천·구매 링크·옷장은 구현하지 않았습니다.

## 실행

Node.js **24.19 이상인 24 LTS**를 사용하세요. 의존성은 잠금파일에 고정되어 있습니다. Windows에서도 `backend/package.json`이 있는 폴더의 터미널에서 아래 명령을 한 줄씩 실행합니다.

```sh
cd backend
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

기본 API 포트는 3001입니다. 터미널을 켜 두고 사용하며 종료는 `Ctrl+C`입니다. 이 서버는 API 서버이므로 주소만 열어도 온보딩 화면이 나오지는 않습니다. API 상태는 `/health`, 초기 공개 콘텐츠 상태는 `/api/onboarding/catalog`에서 확인합니다.

웹 화면은 별도 터미널의 `frontend/`에서 `npm ci`, `npm run dev`로 실행한 뒤 **http://localhost:5173/** 에서 확인합니다. 이때 `backend/.env`에 `PUBLIC_ORIGIN=http://localhost:5173`을 설정하고 백엔드를 실행하세요. `/api`와 `/media` 프록시·Windows 안내·검증 명령은 [프런트엔드 README](frontend/README.md)에 있습니다.

환경 변수 목록은 루트 `.env.example`에 있습니다. 필요한 항목만 실제 값을 채워 `backend/.env`에 설정하세요. 현재 실행 명령은 backend/의 .env를 읽으며, 기본 실행에는 .env 파일이 필요하지 않습니다. 세션·설정에 AI API 키는 필요하지 않습니다.

```sh
npm run check
npm run build
npm start
```

시작 시 마이그레이션과 **기존 행을 덮어쓰지 않는** 기본 데이터 등록도 실행합니다. CLI 명령은 자동 실행과 같은 안전한 작업을 명시적으로 수행합니다.

## 현재 콘텐츠 상태

- 의류 범주 2개, 상위 장르 10개(범주별 5개), 하위 스타일 54개(남성복 24개·여성복 30개)를 초안으로 등록합니다.
- **실제 이미지 0장, 실제 탐색 가능한 스타일 0개**입니다. 정상 API 응답은 `contentStatus: "not_ready"`입니다.
- 스타일이 공개되려면 게시 상태이고, 표시 권한이 확인된 게시 이미지가 1장 이상이어야 합니다. 목표는 4–6장이며 일부만 준비되면 그 사진만 표시합니다. 최대 6장만 노출합니다.
- 테스트 PNG는 임시 폴더에만 생성하며 실제 DB나 자산 폴더에 등록하지 않습니다.
- 54개 스타일의 목표 콘텐츠(각 4–6장)에는 서로 다른 의복 조합 이미지 **216–324장**이 필요합니다. `model_outfit`, `flat_lay`, `collage`를 섞어 등록할 수 있습니다.

## 협업 문서

- [전체 온보딩 디자인 기준](DESIGN.md)
- [프런트엔드 실행·구조·검증](frontend/README.md)
- [현재 사진 중심 온보딩 검증·실제 화면](docs/PHOTO_ONBOARDING_REVIEW.md)
- [Gemini에 복사해서 전달할 프롬프트](docs/GEMINI_PROMPT.md)
- [Gemini UI 인계와 호출 흐름](docs/GEMINI_HANDOFF.md)
- [정확한 API 경로·요청·응답·오류](docs/API.md)
- [데이터 구조·진행 규칙·저장소](docs/DATA.md)
- [이미지 등록·교체 방법](docs/CONTENT.md)
- [검증 결과와 제한](docs/VERIFICATION.md)
- [장르 분류 개편·ID 보존·조회 계약](docs/GENRE_CLASSIFICATION.md)

SQLite 파일은 기본 `backend/data/onboarding.sqlite`에 저장되고 Git에 포함하지 않습니다. **같은 영구 디스크의 파일을 유지한 서버 재시작**은 복원되지만, 일회성 파일시스템·컨테이너 교체·새 클라우드 작업·영구 볼륨 없는 호스팅에서 지속성을 보장하지 않습니다. 프로덕션은 영구 볼륨과 HTTPS/동일 출처 프록시를 준비해야 합니다. 여러 서버가 같은 SQLite 파일을 공유하는 구성은 이 단계의 운영 대상이 아닙니다.
