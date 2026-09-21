# 캔버스 미리보기 ↔ PDF 결과물 위치/사이즈 일치 작업

범위: 사용자가 확정한 1번(위치 프리셋 미반영), 2번(baseline 근사 오차)만 수정.
3번(스탬프 볼드/대문자/자간), 4번(테두리·패딩 공식 차이)은 이번 작업에서 제외.

## 체크리스트

- [x] 1번: `OverlayPreviewLayer.jsx` — 드래그 전 기본 상태일 때 `position` 프리셋(top-left 등)을
      실제로 반영하도록 앵커 기반 좌표 계산 추가 (PDF의 `calculatePosition()`과 동일 규칙, margin 24)
- [x] 2번: `pdfHelpers.js` `drawTextOverlay` — `heightOfText = fontSize` 근사를 pdf-lib의
      실제 폰트 메트릭(`font.heightAtSize`)으로 교체, baseline을 ascent/descent 기준으로 정확히 계산
- [x] 2번: `pdfHelpers.js` `drawStampOverlay` — 동일한 baseline 계산 방식 적용 (스탬프 스타일/테두리는 미변경)
- [x] 회전(rotation)이 걸린 경우도 정상 동작하는지 로직 확인 (getFinalCoords 재사용 구조라 자동 반영됨)
- [x] 브라우저에서 실제 동작 확인 (스탬프 기본 위치가 우측 하단에 뜨는지, 드래그한 텍스트 위치가 PDF와 맞는지)
- [x] 콘솔 에러 없는지 확인
- [x] `npm run build` 통과 확인
- [x] git commit & push

## 후속 작업: 스탬프 폰트 차이 + 텍스트 볼드 쏠림 (2026-09-22)

사용자가 캔버스/PDF 스크린샷을 비교하며 남은 차이를 지적: 스탬프 폰트가 완전히 달라 보임,
텍스트/워터마크가 아주 살짝 우측·상단으로 밀림. 실측 결과 폰트 파일 자체는 100% 동일함을
확인(원인 아님). 진짜 원인은 스탬프의 볼드/자간이 PDF에 미반영, 볼드 시뮬레이션이 좌우
비대칭인 것.

- [x] 폰트 파일 동일성 실측 검증 (브라우저에서 malgun.ttf 직접 로드해 폭 비교 → 차이 0)
- [x] `getFinalCoords`를 `localToFinal`(임의 로컬 오프셋 지원) 기반으로 리팩토링 — 글자별 회전 좌표 계산에 재사용하기 위함, 기존 호출부 동작은 변경 없음
- [x] `drawTextOverlay`: 볼드 시뮬레이션을 좌우 대칭 오프셋으로 수정
- [x] `drawStampOverlay`: 글자 단위로 나눠서 자간(0.1em) + 좌우 대칭 볼드 적용
- [x] `npm run build` / `npm run lint` — 기존과 동일한 문제만 있음, 새 이슈 없음
- [x] 브라우저에서 스탬프+테두리 실제로 PDF 생성해서 확인 — 자간/볼드/테두리 박스 모두 캔버스와 일치
- [x] CHANGELOG.md에 기록 추가
- [x] git commit & push
