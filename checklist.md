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
