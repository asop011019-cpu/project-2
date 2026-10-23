# 프로젝트 디자인 스킬 설치 기록

설치·검증일: 2026-10-23. 대상 저장소: `asop011019-cpu/project-2`.
설치 전 브랜치는 `feature/onboarding-backend`, 커밋은 `b58ebf6`이며 작업 트리는 깨끗했다.
이번 작업에서는 앱 화면, 백엔드, 앱 의존성을 변경하지 않았다. 커밋하거나 push하지 않았다.

## 설치 경로와 호출

프로젝트 루트 `/workspace/project-2`를 작업 경로로 연 Codex 세션에서 사용한다.
전역 설치나 임시 폴더에 의존하는 심볼릭 링크 없이 실제 파일을 프로젝트에 복사했다.

| 스킬 | 프로젝트 상대 경로 | 원본과 고정 버전 | 명시적 호출 |
| --- | --- | --- | --- |
| frontend-design | `.agents/skills/frontend-design/` | [anthropics/skills](https://github.com/anthropics/skills), `dbd4588f9e1033efb41dad4bef2f7947c8993d44` | `$frontend-design`와 작업 요청 |
| ui-ux-pro-max | `.agents/skills/ui-ux-pro-max/` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), 공식 npm CLI `2.15.0`; README·참조 파일은 `28327f2f214d31bbd7555ed0c012a5df6484ed96` | `$ui-ux-pro-max`와 작업 요청 |
| hallmark | `.agents/skills/hallmark/` | [Nutlope/hallmark](https://github.com/Nutlope/hallmark), `7ec868225c6caa040558c321ee0fefa0e73f83a8`, 스킬 `2.0.0` | `$hallmark`와 작업 요청 |
| emil-design-eng | `.agents/skills/emil-design-eng/` | [emilkowalski/skills](https://github.com/emilkowalski/skills), `2d228630ba1446365f614a108cb8252f1feda202` | `$emil-design-eng`와 작업 요청 |
| web-design-guidelines | `.agents/skills/web-design-guidelines/` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), `063bee94c3f4df8453406c830b0a7df0f2860278`, 스킬 `1.0.0` | `$web-design-guidelines`와 검토할 파일 경로 |

위 경로의 `SKILL.md`뿐 아니라 함께 배포된 이미지·참조 문서·데이터·스크립트를 보존했다.
직접 복사한 네 스킬은 원본의 모든 파일이 누락·변경 없이 일치함을 SHA-256으로 확인했다.
UI/UX Pro Max는 공식 CLI의 Codex용 템플릿으로 생성했으며 원본의 두 참조 문서도 보존했다.

## 도구와 설치 방식

- Codex CLI `0.163.0`, Linux x86_64, Node.js `24.19.0`, npm `11.9.0`, Python `3.12.14`, Chromium `154.0.8037.57`.
- `npx skills@1.7.4 --help`에서 프로젝트 기본 설치, `--skill`, `--agent codex`, `--copy`, `--yes`, `list --json` 지원을 확인했다.
- `npx ui-ux-pro-max-cli@2.15.0 init --help`에서 `--ai codex` 지원을 확인했다. 전역 설치와 `--force`는 사용하지 않았다.
- Git smart HTTP 다운로드가 실패해, 지정된 원본 저장소의 GitHub codeload 압축본을 사용했다. 압축본의 Git 커밋과 SHA-256을 기록했다. 비공식 포크는 사용하지 않았다.
- 네 스킬은 검토한 원본 폴더에서 `skills add <폴더> --skill <이름> --agent codex --yes --copy`로 개별 설치했다.
- UI/UX Pro Max CLI는 다른 스킬 여섯 개도 함께 생성하는 구현이다. 따라서 프로젝트 밖의 격리된 임시 폴더에서 `init --ai codex`를 실행하고, `ui-ux-pro-max` 폴더만 프로젝트에 개별 설치했다. 프로젝트에는 요청한 스킬 다섯 개만 존재한다.
- npm 도구 캐시와 소스 다운로드는 `/tmp`에 두었다. 앱의 `package.json`, lockfile, `node_modules`는 수정하지 않았다.
- 임시 다운로드 경로를 가리키는 CLI 자동 `skills-lock.json`은 프로젝트에 남기지 않았다. 설치 파일 자체는 독립적으로 존재하며, 영구적인 출처·버전·파일 해시는 아래 manifest가 담당한다. 자동 갱신은 설정하지 않았다.

출처·라이선스·파일 해시: [manifest.json](skill-provenance/manifest.json).
원본 README와 라이선스, UI/UX Pro Max 템플릿: `skill-provenance/upstream/`.
UI/UX Pro Max npm 패키지의 `gitHead`는 `a38d04c3d5c298c851dbe5e6ee1965ee3de42cb5`이며, 패키지 무결성 값도 manifest에 기록했다. 이 npm 릴리스와 README를 읽은 GitHub main 커밋을 구분했다.

라이선스는 frontend-design의 Apache-2.0 원문과 Hallmark·Emil·UI/UX Pro Max의 MIT 원문을 보존했다. Vercel 원본 저장소에는 독립 LICENSE 파일이 없어, MIT라고 명시된 원본 README를 보존했다. 원본에 없는 라이선스 문서를 만들어 넣지 않았다.

## Codex 검색 경로와 인식 확인

현재 버전은 프로젝트 루트부터 현재 작업 디렉터리까지의 `.agents/skills/`를 프로젝트 스킬로 탐색한다. 사용자 범위 `~/.agents/skills/`, 이전 사용자 경로 `$CODEX_HOME/skills`, 구성 계층의 `.codex/skills` 및 시스템·관리자 경로도 별도로 처리한다.

설치 전 프로젝트 스킬과 요청한 다섯 스킬은 없었다. 사용자 홈에는 documents, pdf, presentations, spreadsheets 내장 스킬 파일이 별도로 있었다. 기존 파일은 덮어쓰지 않았다.

공식 문서 `https://developers.openai.com/codex/skills`는 권한 확장 재시도에서도 HTTP 403으로 열리지 않았다. 대신 공식 OpenAI 저장소의 설치 버전과 동일한 `rust-v0.163.0` 태그(`83086188ae0614bd882818ff1aa23f3194962012`)의 문서 및 `codex-rs/ext/skills/src/host_roots.rs`를 확인했다.

설치 후 실제 Codex `app-server`의 `skills/list`를 `cwds: ["/workspace/project-2"]`, `forceReload: true`로 호출했다. 다섯 스킬 모두 `scope: repo`, `enabled: true`, 파싱 오류 없음으로 반환되었다.

기본 sandbox에서는 `/run/codex-environment/codex-home`의 상태 DB 초기화가 읽기 전용 오류로 실패했다. 권한 확장된 검증 실행에서는 정상 응답을 확인했다. 모델 실행이나 디자인 생성은 하지 않았다.

인식 증거: [codex-recognition.json](skill-provenance/codex-recognition.json).
`skills list --agent codex --json`에서도 다섯 개의 프로젝트 설치를 확인했다. 이는 설치 CLI의 목록이며, 위 Codex 자체 인식 결과와 구분된다.

새 CLI 프로세스에서는 이미 인식되었다. 현재 대화의 스킬 목록이 자동 갱신되는지는 보장하지 않으므로, 이 프로젝트를 작업 경로로 연 새 Codex 세션에서 사용하는 것을 권장한다. OS 재부팅은 필요 없다.

## 실행 검증과 제한

- frontend-design, emil-design-eng: 원본 파일 일치와 실제 Codex 파싱을 확인했다. 별도 보조 실행 스크립트가 없는 문서형 스킬이다.
- UI/UX Pro Max: Python 검색 도움말, UX 검색 결과, 다른 작업 경로(`/tmp`)에서 절대 경로 호출을 확인했다. `validate_data.py`가 12개 도메인, 22개 스택, `ui-reasoning.csv` 검증을 통과했다. 외부 Python 패키지는 필요 없다. `--persist`로 디자인 파일을 생성하지 않았다.
- Hallmark: `refcheck.mjs --errors`가 99개 참조 파일 검사에 통과했고, 48개 테마 정의가 검증되었다. 정적 검사기가 원본의 의도적인 실패 fixture에서 gate 54 위반을 검출했다. 이 fixture의 종료 코드 1은 예상 결과이며 앱 검사 실패를 뜻하지 않는다.
- Hallmark 브라우저 검사·캡처: Chromium은 있으나 `puppeteer-core` 또는 `puppeteer` Node 패키지가 없어 미검증이다. 정적 검사와 테마 도구는 사용 가능하다. 앱 의존성을 추가하지 않았다. 필요하면 향후 별도 도구 환경의 `puppeteer-core`를 `HALLMARK_PUPPETEER`로 연결할 수 있다.
- Hallmark 이미지 생성 도구는 선택 기능이며 API 키와 외부 서비스가 필요하다. 이번에는 호출하거나 키를 구성하지 않았다. Claude 전용 `install-hook.mjs`도 실행하지 않았다. Codex에는 Claude의 PostToolUse 훅이나 슬래시 명령을 설치했다고 가정하지 않는다.
- web-design-guidelines: 원본의 최신 규칙 URL을 HTTP 200으로 읽을 수 있음을 확인했다. Claude의 `WebFetch` 도구명이 Codex에 그대로 존재한다고 가정하지 않으며, 사용 시 이용 가능한 HTTP 읽기 도구로 최신 원문을 조회한다. 실제 앱 접근성 검토는 이번 범위가 아니므로 수행하지 않았다.
- 기존 추적 파일의 설치 전후 SHA-256 비교에서 `AGENTS.md`의 사용 규칙 추가만 변경되었다. 앱·백엔드·의존성 파일은 동일했다. 새 파일은 `.agents/` 아래에만 추가되었고 Git의 미추적 변경으로 나타난다.

## 사용 규칙

프로젝트 요구사항과 사용자의 명시적 지시가 스킬보다 우선한다.
디자인 방향은 frontend-design 또는 hallmark 중 하나를 중심으로 정한다.
ui-ux-pro-max는 UX·디자인 시스템 자료, emil-design-eng는 인터랙션·모션·마감, web-design-guidelines는 구현 후 접근성·사용성 검토에 사용한다.
설치를 이유로 앱 전체를 다시 디자인하지 않는다. 요청받은 화면과 컴포넌트에만 변경을 한정하고 기존 기능·데이터 연결을 보존하며 최종 diff를 검토한다.

이 규칙은 프로젝트 루트 `AGENTS.md`에도 추가했다. 원본 스킬의 지침 파일은 수정하지 않았다.
