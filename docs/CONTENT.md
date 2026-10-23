# 스타일·이미지 등록과 교체

## 초기 데이터

`backend/src/modules/onboarding/data/catalog.ts`가 두 의류 범주, 상위 장르 10개(범주별 5개), 하위 스타일 54개(남성복 24개·여성복 30개)의 초기 이름·설명·순서를 정의합니다. 기존 스타일 ID와 이미지·응답 참조는 유지합니다. 전체 분류표는 [분류 갱신 문서](GENRE_CLASSIFICATION.md)에 있습니다.

`db:seed`와 서버 시작은 없는 행만 추가하고 기존 설명·순서·게시 상태를 덮어쓰지 않습니다. **초기 데이터 파일을 수정했다고 이미 운영 중인 DB가 자동 변경되지는 않습니다.** 기존 DB 변경은 아래 CLI로 적용합니다.

이번 분류 개편은 별도의 스키마 v2 마이그레이션으로 기존 DB에도 한 번 적용됩니다. 기존 이미지·응답·게시 상태·설명·세션 순서는 보존합니다. `Style.order`는 장르 내 분류 순서이며 `explorationOrder`와 분리되어 있습니다. 이전 JSON에 explorationOrder가 없으면 기존 값을 보존하고, 새 스타일은 뒤에 붙입니다.

## 운영자 CLI

모든 명령은 `backend/`에서 실행합니다. UI/클라이언트용 공개 이미지 등록 API는 없습니다.

```sh
npm run db:migrate
npm run db:seed
npm run catalog:export -- new-content-manifest.json
```

export는 등록된 범주·상위 장르·스타일·이미지의 실제 메타데이터를 JSON으로 저장합니다. 기존 파일은 덮어쓰지 않으므로 새로운 파일명을 사용하세요. 초기 export의 images는 빈 배열입니다. 파일에는 익명 세션이나 토큰이 없습니다.

원하는 스타일의 설명·순서·게시 상태를 편집하고 실제 이미지 메타데이터를 추가한 뒤 적용합니다. 부분 JSON도 가능하며 없는 항목을 삭제하지 않습니다.

```sh
npm run catalog:import -- new-content-manifest.json
```

전체 입력 검증과 DB 갱신은 원자적으로 처리합니다. 중간 오류가 있으면 해당 import를 롤백합니다. 동일 메타데이터 import는 불필요한 카탈로그 버전 증가를 만들지 않습니다. 순서·설명 변경은 API 핸들러나 저장 로직 변경 없이 적용됩니다.

## 이미지 필드

`images` 항목은 다음 모든 필드를 사용합니다. 구체적인 이미지 URL 예시는 제공하지 않습니다. 아직 실제 이미지가 없으므로 아래는 **타입 설명**이며, 자리표시자 URL을 등록하거나 사진 수를 채우는 파일이 아닙니다.

```ts
interface ImageRegistration {
  id: string;                // 새 원본마다 새로운 고유 ID
  styleId: string;           // 등록된 해당 범주의 스타일 ID
  categoryId: "menswear" | "womenswear";
  originalRef: string;       // 실제 /media/ 경로 또는 실제 HTTPS 이미지 주소
  thumbnailRef: string;      // 같은 조합의 실제 썸네일, 또는 originalRef와 동일한 참조
  alt: string;               // 실제 내용을 설명. 미확인 모델/소재를 단정하지 않음
  width: number; height: number; // 양의 정수, 실제 원본 픽셀 크기
  format: "model_outfit" | "flat_lay" | "collage";
  isGenerated: boolean;
  order: number;             // 0 이상 정수
  sourceUrl: string | null;
  creator: string | null;
  usageStatus: "pending" | "allowed" | "revoked";
  publicationStatus: "draft" | "published";
  contentHash?: string | null; // 로컬 원본은 import 때 SHA-256 자동 계산
}
```

로컬 파일은 `ASSET_ROOT`(기본 `backend/assets/`) 아래에 저장합니다. ASCII 파일명을 사용하고 `/media/` 뒤의 상대 경로가 실제 파일과 대응해야 합니다. PNG/JPEG/WebP/AVIF를 지원하고 SVG·경로 이동·허용 폴더 밖 심볼릭 링크는 거절합니다. 원본은 20 MiB 이하입니다. 별도 썸네일도 실제 파일이어야 합니다. CLI는 파일 존재·폴더 경계·원본 내용 해시를 확인합니다. 크기·format·대체 텍스트와 실제 이미지의 의미 일치는 운영자가 검수해야 합니다.

외부 원본은 HTTPS만 허용합니다. 서버가 외부 주소를 자동 수집하거나 존재·사용 권한을 검증하지 않습니다. 운영자가 실존·표시 가능·안정적 주소인지 확인해야 합니다. 출처 페이지 URL은 이미지 원본 주소와 별개이며, API 접근 권한이 상업적 이미지 재사용 권한을 뜻하지 않습니다. 생성 이미지인지와 사람의 착장/플랫레이/콜라주 중 실제 형식을 정확히 기록하세요. 초안부터 allowed로 지정하지 말고 표시 권한과 제작자 확인 후 변경합니다. 자체 제작 이미지라면 sourceUrl=null이 가능하지만 제작자는 식별해야 합니다.

## 게시 조건과 교체

스타일 자체가 published이고, 그 스타일·범주에 속하는 **usageStatus=allowed + publicationStatus=published + 제작자 확인** 이미지가 1장 이상이면 탐색 대상이 됩니다. 목표 수량은 4–6장이며 일부만 준비되면 그 사진만 표시합니다. 정렬상 앞의 최대 6장만 공개합니다. 사진 0장이면 준비 중입니다. 같은 파일의 복제나 크롭으로 수량을 채우지 않습니다.

원본 참조와 로컬 원본의 SHA-256 해시는 DB에서 중복을 차단합니다. 원본이 바뀌면 **새 이미지 ID와 새 파일명/원본 참조**로 등록하세요. 기존 이미지 ID에 다른 원본을 덮어쓰면 과거 하트가 다른 조합으로 해석되므로 금지합니다. 같은 원본의 설명·순서·권한·게시 상태 등 메타데이터는 수정할 수 있습니다.

게시 중단은 파일/행 삭제 대신 스타일 또는 이미지의 publicationStatus를 draft로 바꾸거나 사용 권한을 revoked로 바꿉니다. 유효 이미지가 0장이 되면 스타일도 탐색에서 빠집니다. DB는 과거 응답 이력을 보존하지만 API 결과와 로컬 파일 제공은 즉시 제외합니다. 이미지를 외부 서버에 보관했다면 해당 서버의 철회도 별도로 처리해야 합니다.

기존 세션에는 새 스타일/순서를 자동 적용하지 않습니다. UI에서 사용자가 최신 목록을 선택하면 refresh-catalog를 호출합니다. 전체 삭제로 억지 갱신하지 않습니다.

## 필요한 실제 콘텐츠

현재 모든 스타일에 실제 이미지가 0장입니다. 남성복 24개·여성복 30개의 이름과 배치는 [전체 분류표](GENRE_CLASSIFICATION.md)를 따릅니다.

| 범주 | 스타일 | 목표 이미지 |
| --- | --- | --- |
| 남성복 | 상위 장르 5개에 속한 24개 하위 스타일 | 각 4–6장, 총 96–144장 |
| 여성복 | 상위 장르 5개에 속한 30개 하위 스타일 | 각 4–6장, 총 120–180장 |

합계 목표 216–324장입니다. 일부만 준비되면 승인된 사진만 먼저 표시할 수 있습니다. 각 스타일 안에서도 서로 다른 조합을 보여줘야 합니다. 이번 단계는 이미지 생성·Instagram/Pinterest 수집·이미지 학습 API를 구현하지 않았습니다.
