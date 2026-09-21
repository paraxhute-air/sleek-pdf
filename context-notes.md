# Context Notes — 캔버스/PDF 위치·사이즈 일치 작업

## 배경
사용자가 스탬프/워터마크/텍스트 오버레이 추가 시 캔버스 미리보기와 다운로드한 PDF의
위치·사이즈가 다르다고 보고. 진단 결과 5가지 원인을 찾았고(다른 리뷰어 의견까지 교차검증),
사용자는 이 중 1번(위치 프리셋 미반영)과 2번(baseline 근사 오차)만 고치고,
3번(스탬프 볼드/대문자/자간)·4번(테두리·패딩 공식 차이)은 무시하기로 확정.

## 결정 사항

### 1. 위치 프리셋 수정 범위
`OverlaySettings.jsx`에 9방향 위치를 고르는 UI가 없다 (grep으로 확인, 매치 없음).
`position`/`imagePosition`은 항상 기본값 `middle-center`로 고정, 유일하게 `stampPosition`만
기본값이 `bottom-right`. 즉 이번 수정이 실제로 화면에 보이는 효과는 "스탬프가 드래그 전에도
우측 하단에 뜨는 것" 하나뿐이다. 하지만 코드는 `position` 값 전체(9방향)에 대해 일반적으로
동작하도록 구현 — 특정 타입만 하드코딩하는 것보다 코드가 더 단순하고, 추후 위치 선택 UI가
추가되면 자동으로 맞게 동작한다.

### 2. CSS 클래스 대신 JS 인라인 계산 선택
`OverlayPreviewLayer.css`에 이미 `.position-top-left` 등 9방향 클래스가 정의돼 있었지만 사용된
적 없는 죽은 코드였다. 이걸 재사용하지 않고 JS에서 직접 left/right/top/bottom + translate를
계산하는 방식을 택함. 이유:
- 기존 CSS 클래스는 stamp/image 전용만 9방향 다 있고, 일반 텍스트/워터마크용은 코너 4개만
  있어서(top-center, middle-left 등 누락) 그대로 쓰면 구멍이 생김.
- 클래스를 붙이더라도 기존 코드가 `style={finalStyle}`로 `left/top/transform`을 인라인으로
  강제하고 있어서, 인라인 스타일이 항상 CSS 클래스보다 우선순위가 높아 클래스가 무시됨.
  (className만 추가하는 방식은 작동하지 않았을 것)
- 기존 CSS 파일(`OverlayPreviewLayer.css`)은 건드리지 않음 — 죽은 코드지만 사용자가
  "본인 것만 정리, 기존 코드는 남겨둔다" 원칙에 따라 그대로 둠.

### 3. baseline 계산에 pdf-lib 실제 폰트 메트릭 사용
`font.heightAtSize(size, { descender: true|false })` API가 pdf-lib에 이미 존재함을
node_modules 소스 코드로 직접 확인 (`CustomFontEmbedder.js`, `StandardFontEmbedder.js` 둘 다
동일한 `descender` 옵션 계약을 구현). 이걸로 실제 ascent/descent를 구해서
`baseline = vCy - (ascent - descent) / 2` 로 계산 — 기존의 `vCy - fontSize/2` 근사보다 정확.
이 API는 커스텀 폰트(맑은고딕)와 Standard 14 폰트(Courier/Helvetica/Times 등) 양쪽 다 지원해서
폰트 종류에 상관없이 일반적으로 적용 가능.

### 4. 건드리지 않은 부분 (의도적으로)
- 스탬프의 볼드/대문자/자간 스타일 (3번) — PDF 쪽에 추가 안 함
- 텍스트/워터마크/스탬프의 테두리·패딩 공식 (4번) — CSS와 PDF 계수 안 맞춘 채로 둠
  (단, `heightOfText`가 `fontSize`에서 실제 폰트 높이로 바뀌면서 테두리 박스 크기가
  약간 달라지는 건 자연스러운 부수효과 — 별도로 고친 건 아님)
- 머리말/꼬리말(headfoot)의 동일한 baseline 근사 — 이번 요청 범위 밖이라 미변경
- `vToPdf` 미정의 변수 크래시 버그 (`pdfHelpers.js:433`) — 발견했지만 별도 이슈라 이번엔 미포함,
  사용자에게 별도로 안내 예정
