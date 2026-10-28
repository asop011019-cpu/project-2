# 데이터와 저장 규칙

## 구성과 의존 방향

기존 저장소가 빈 상태임을 확인하고 `feature/onboarding-backend`에서 신규 구현했습니다. UI 및 루트 프런트엔드 설정은 만들지 않았습니다.

```text
Fastify routes → Zod 요청 검증 → OnboardingService → domain + OnboardingRepository 포트
                                                   ↓ 서버 조합(app.ts)
                                          SqliteOnboardingRepository
카탈로그 CLI → 운영자 입력 검증 / 로컬 파일 확인 → SQLite 트랜잭션
```

- `backend/src/modules/onboarding/types.ts`: 도메인·응답 타입.
- `validation.ts`: 요청 스키마와 요청 타입. 핸들러에 스타일 이름 목록을 넣지 않습니다.
- `domain.ts`: 게시 조건·진행/완료 규칙. Fastify/SQLite/저장소와 독립입니다.
- `service.ts`: 인증·응답·하트·진행·결과 유스케이스. DB 접근은 포트로만 합니다.
- `ports.ts`, `repository.ts`: 저장 포트와 SQLite 구현.
- `routes.ts`, `backend/src/app.ts`: HTTP 변환, 쿠키, 오류, 서버 의존성 조합.
- `data/catalog.ts`: 목록·설명·순서의 초기 데이터. `catalog-management.ts`: 검증·비파괴 등록.
- `backend/src/db/`: 파일 연결과 버전별 마이그레이션.

선택 기술은 Node.js 24 LTS + TypeScript 7.0.2 + Fastify 5.12.7 + Zod 4.6.7 + Node 내장 SQLite입니다. 작은 단일 API에서 ORM이나 별도 DB 서버 없이 SQL 제약과 트랜잭션을 사용할 수 있어 선택했습니다. 프레임워크·플러그인 호환성과 버전은 구현 시 공식 npm 레지스트리 및 [Fastify 문서](https://github.com/fastify/fastify/blob/main/docs/Guides/Getting-Started.md), [쿠키 플러그인 문서](https://github.com/fastify/fastify-cookie), [Node 24 SQLite 문서](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)로 확인했습니다. 내장 SQLite API는 Node 버전에 영향을 받으므로 다른 런타임을 적용할 때 재검증해야 합니다.

## DB 모델

| 모델 / 테이블 | 주요 정보·제약 |
| --- | --- |
| ClothingCategory / `clothing_categories` | `menswear`, `womenswear`, 이름·순서. 성별 정체성이 아님 |
| GenreGroup / `genre_groups` | 안정적인 ID, 범주 FK, 이름·설명·순서 |
| Style / `styles` | ID, 범주·상위 장르 FK, 이름·설명·장르 내 order, 독립적인 explorationOrder, draft/published |
| StyleImage / `style_images` | ID, 스타일·범주 FK, 원본·썸네일 참조, alt·크기·형식·생성 여부·순서·출처·제작자·사용 권한·게시 상태·원본 해시 |
| OnboardingSession / `onboarding_sessions` | 공개 ID, 토큰의 SHA-256 해시, 현재 선택 범주, 시작·갱신·만료 시각 |
| 범주별 세션 / `category_sessions` | 세션+범주 PK, 목록 버전, 현재 ID, 진행/완료 상태, 시작·갱신·완료 시각 |
| 고정 목록 / `session_styles` | 세션+범주+스타일 PK, 위치, 게시 중단 시각 |
| StyleResponse / `style_responses` | 세션+범주+스타일 PK, liked/disliked/skipped, 수정 시각 |
| ImagePreference / `image_preferences` | 세션+범주+이미지 PK, 해당 스타일 FK, selected, 수정 시각 |

SQLite `STRICT`, CHECK, UNIQUE, 복합 FK를 사용합니다. 스타일과 상위 장르의 범주, 이미지와 스타일의 범주, 선호 이미지의 스타일·범주가 DB에서도 일치해야 합니다. 같은 사용자의 이미지 선호가 중복 등록되지 않으며 원본 참조와 로컬 파일의 내용 해시는 중복 등록을 막습니다. 이미지 파일은 DB BLOB로 저장하지 않습니다.

완료 상태·시각은 범주별 행에 정규화해 저장하고 현재 선택 범주의 값을 세션 응답으로 제공합니다. 두 범주를 바꿔도 한 범주의 응답으로 다른 범주를 완료하지 않습니다.

## 진행과 카탈로그 버전

- 장르 분류 개편은 [분류 갱신 문서](GENRE_CLASSIFICATION.md)를 따릅니다. 스키마 v2는 기존 실제 탐색 순서를 explorationOrder에 보존한 뒤 장르·이름·분류 순서를 바꿉니다. 세션 진행·저장 규칙과 고정 목록은 바꾸지 않습니다.
- 범주를 **처음 선택할 때** 해당 범주의 현재 탐색 가능한 목록과 버전을 고정합니다. 다시 돌아오면 기존 목록·위치·응답을 복원합니다.
- 후속 운영자 등록으로 순서가 바뀌거나 스타일이 추가되어도 기존 탐색에 자동 삽입하지 않습니다.
- 현재 공개 조건을 잃은 스타일은 요청 시 고정 목록에서 철회 처리합니다. 한 번 철회한 항목은 재게시되어도 자동 복귀하지 않습니다. 원래 목록 수, 현재 목록 수, 철회 수를 별도로 반환합니다.
- 철회된 스타일의 응답·사진 선호 이력은 DB에 남기지만 현재 결과와 공개 이미지에는 넣지 않습니다. 현재 위치가 철회되면 첫 미응답 활성 스타일(없으면 첫 활성 스타일)로 보정합니다. 응답을 자동 생성하지 않습니다.
- `refresh-catalog`는 사용자가 명시적으로 최신 목록을 선택하는 기능입니다. 기존 응답과 사진 선호 이력은 보존하고 현재 게시 목록을 새 순서로 고정합니다. 새 미응답이 생기면 완료를 해제합니다.
- 처음 목록이 비어 있던 세션도 자동으로 콘텐츠를 채우지 않습니다. 게시 자료 준비 후 명시적으로 목록을 새로 받아 시작합니다.
- 위치는 탐색 중인 ID 또는 결과 화면을 뜻하는 `null`입니다. `currentIndex`는 활성 목록의 0부터 시작하는 순번이며, 응답 수와 다릅니다.

## 응답·완료·수정

미응답은 DB 행 없음/API `response: null`입니다. `skipped`는 명시적인 사용자 응답입니다. 하트가 없거나 `selected: false`인 것은 싫어함이 아닙니다. 스타일 응답과 사진 선호는 독립적입니다.

스타일 응답과 선택적 `nextStyleId` 이동은 같은 트랜잭션입니다. 이동을 생략하면 현재 위치를 유지합니다. 사진 선호는 위치와 스타일 응답을 변경하지 않습니다. 동일 최종 상태의 재저장은 중복 행을 만들거나 하트를 반전하지 않으며 동일 요청 직후 재호출은 시각도 불필요하게 바꾸지 않습니다. 여러 탭의 서로 다른 저장은 도착 순서대로 적용되므로 UI는 변경 요청을 직렬화하고 저장 중 버튼을 비활성화해야 합니다.

모든 활성 스타일에 응답한 경우만 완료할 수 있습니다. 좋아함이 0개여도 완료할 수 있고, 탐색 가능한 스타일이 0개면 완료할 수 없습니다. 완료 반복 호출은 완료 시각을 유지합니다. 완료 후 **실제 응답/사진 선호가 바뀌면** 진행 중으로 열고 완료 시각을 비웁니다. 다시 완료하려면 명시적 요청이 필요합니다. 화면 이동이나 값이 같은 저장은 완료를 해제하지 않습니다. `updatedAt`은 범주 전환·위치 변경에도 갱신될 수 있어, 완료 상태에서 갱신 시각이 완료 시각보다 늦을 수 있습니다.

## 보안·지속성

토큰은 암호학적 난수 32바이트이며 DB에는 해시만 저장합니다. 토큰 원문은 JSON·localStorage·로그에 넣지 않고 HttpOnly, SameSite=Strict, host-only 쿠키로 전달합니다. HTTPS 환경은 Secure 및 `__Host-` 접두사를 사용합니다. 세션 공개 ID는 인증 수단이 아닙니다. 토큰 만료는 생성 후 30일이며 단순 조회로 연장하지 않습니다. 만료된 행의 정기 정리는 아직 스케줄링하지 않았습니다. 유효 토큰의 명시적 삭제는 모든 범주의 기록을 DB에서 연쇄 삭제합니다.

브라우저 변경 요청에는 지정 헤더와 동일 출처 검증을 사용하고, CORS를 개방하지 않습니다. 영구 SQLite 파일·WAL·트랜잭션으로 서버 재시작을 지원합니다. 저장 실패는 500으로 반환하고 트랜잭션 전체를 롤백합니다. 복수 서버·일회성 디스크·호스팅 재배포의 디스크 보존은 보장하지 않습니다. 영구 볼륨이 없으면 SQL 저장 포트를 외부 영구 DB로 교체해야 합니다. 백업은 실행 중 DB 파일만 단순 복사하지 말고 SQLite 일관된 백업 절차를 사용합니다.

## GAR-001

스키마 v3의 garments는 onboarding_sessions에 FK로 연결된 세션당 한 행이다. 의류 종류·보완 정보·비공개 파일명·저장본 크기·시각을 보관한다. 파일 수명과 복구 조건은 [GARMENT_API.md](GARMENT_API.md)를 따른다.

## COND-001

스키마 v9: `recommendation_conditions(session_id PK → onboarding_sessions ON DELETE CASCADE, vocabulary_version, values_json, updated_at)` STRICT 1행. 기존 표는 바꾸지 않는 추가 전용 마이그레이션. 미입력은 행 없음 또는 해당 키 null, 상관없음은 `"any"`로 저장해 둘을 섞지 않는다. 어휘·검증은 `backend/src/modules/conditions/conditions.ts`(Fastify/SQLite 무관). 계약은 [API.md](API.md#추천-조건-cond-001).

## WARD-001

스키마 v10: `wardrobe_items`(계정 소유, 항목마다 사진 파일 1개)·`wardrobe_item_attributes`(항목별 확정 속성)·`reference_garments`(진행 1개 → 옷장 항목 1개). 계정에 붙은 `garments`·`garment_attributes` 행은 같은 ID·파일명으로 옮기고 원래 행은 지움. 계정 없는 예전 익명 진행의 `garments` 행은 그대로 둠. 진행 초기화·삭제는 기준 참조만 지우고 옷장은 유지, 탈퇴 삭제 실행 때 옷장과 사진을 모두 지움. 자세한 규칙은 [WARD-001.md](WARD-001.md#저장-스키마-v10-추가--이관).
