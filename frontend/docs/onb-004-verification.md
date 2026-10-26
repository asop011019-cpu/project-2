# ONB-004 검증 기록

원인: 장르 목록의 하위 스타일 카드(`EditorialFrame`)에 선택 동작이 없었음 → 상세는 서버 currentStyleId에 머묾.

변경: 카드 = 버튼(`{스타일명} 스타일 보기`, aria-current, aria-busy, 44px+, focus ring, 눌림 피드백, reduced-motion) → `PUT /session/position {styleId}`만 호출. 서버 응답 후에만 상세 전환, 마지막 요청 응답만 반영. 현재 스타일 장르 자동 펼침. 실패 시 위치 유지 + "다시 시도", 401은 기존 만료 안내(자동 초기화 없음). 하단 "건너뛰기" 버튼 제거(별로·스와이프·더블탭·확대 유지). API 계약 변경 없음.

검증(mock):
- `bunx vitest run` 101/101, `bun run lint` 오류 0(기존 경고 6), `bunx tsgo --noEmit` 오류 0.
- Playwright(라우트 가로채기 시험 응답, 실제 정적 분류 데이터): 남/여 × 390×844, 1440×900에서 다른 장르 카드 클릭·같은 장르 카드 Space 키 → 정확한 상세 제목, aria-current=true, position 요청만 전송, response/preference 요청 0, 건너뛰기 버튼 0. 카드 높이 199/252px.
- 실API 미실행(서버 미연결).

## ONB-004-R1
- 모든 장르 카드 선택 가능. `activeStyleOrder` 밖/서버 미연결 카드는 카탈로그 기반 읽기 전용 상세(제목·장르 설명·"사진 준비 중"·연결 안내) — position/response/preference 요청 0, 진행률·저장 위치 불변. 준비된 카드로 돌아오면 정상 상세(현재 위치와 같으면 요청 없음).
- 위치 쓰기 직렬화: 진행 중 1건 + 최신 의도 1개 대기. 성공 후 서버 currentStyleId와 다르면 다음 PUT, 같으면 종료(B→C→B는 B 1회). 실패/401은 대기 폐기·자동 재시도 없음, "다시 시도"만 제공.
- 테스트(mock 서버 상태 모사, 지연 응답): B→C·B→C→B 최대 동시 1건·서버 최종=화면, 대기 중 실패, order 밖 Enter, 사진 0장, offline. `bunx vitest run` 106/106, lint 오류 0, tsgo 0.
- Playwright(시험 응답): 남/여 × 390·1440, order 밖 카드 읽기 전용·요청 0 확인. 실API 미실행.
