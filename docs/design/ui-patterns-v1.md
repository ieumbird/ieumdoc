# 반복 UI 패턴 v1

역할: 반복 UI 동작의 확정 목표·현재 기준·불일치를 관리하며, 시각 표현은 [Visual Language](editor-visual-language-v1.md), 배치·치수는 [Layout Rules](editor-layout-rules-v1.md)를 따른다.

- Status: Draft
- Last verified: 2026-10-30. master `2de4e857`의 코드·현재 계약과 #777 소유자 결정 대조. 초기 #777 문서 작업에서는 브라우저를 실행하지 않았다. 화면 근거는 [1단계 인벤토리][inventory]에 보존한다.
- P01 content-boundary verification: 2026-10-30 (#782; 실제 1440/640px·Outline 열림/닫힘·두 그룹 browser 검사와 [전후 캡처](editor-layout-rules-v1.md#form-content-viewport-782)).
- Scope: Editor 반복 UI의 **확정된 목표**, 현재 기준 구현과 알려진 불일치. Draft는 미구현 목표를 Implemented 계약으로 표시하지 않기 위한 상태이며 소유자 결정을 재논의한다는 뜻이 아니다.
- Authority: [AGENTS.md](../../AGENTS.md), [ADR-0001](../adr/0001-single-document-editor-architecture.md), [ADR-0010](../adr/0010-supported-viewport-and-input.md), [#777 소유자 결정][decision]. 현재 동작은 각 Implemented 계약을 따른다. 이 목표가 바꾸는 현재 동작은 아래 후속 이슈에서 구현하고 같은 PR에서 해당 계약을 갱신한다.

## 사용과 갱신

UI 작업 전에 해당 패턴과 **같은 패턴을 쓰는 다른 사용처**를 읽고 확인한다. 패턴에서 벗어나면 같은 PR에서 이 문서를 고치거나 알려진 불일치에 사용처·이유·후속 이슈를 올린다. 일부 화면에만 먼저 적용하면 나머지 화면의 후속 이슈를 등록한다. 구현한 항목은 기준 구현·현재 계약·불일치 목록을 함께 갱신한다.

U ID와 파일·화면·캡처의 대응은 [사용처 지도][usage]를 재사용한다. 아래 기준 구현은 **명시한 부분만** 목표에 맞는 현재 구현이며, 컴포넌트 전체가 모든 패턴을 충족한다는 뜻이 아니다. 알려진 불일치 없음은 이 조사 범위에서의 판단이며 전체 동작 재검증을 뜻하지 않는다. 목표의 대안과 과거 근거는 인벤토리에 남긴다.

치수·정렬은 [Layout Rules](editor-layout-rules-v1.md), 색·서체·상태는 [Visual Language](editor-visual-language-v1.md)를 함께 따른다. 지원 최소 폭은 640px이며 키보드·포인터 접근을 유지한다. 문서 의미·Save 허용 여부를 UI가 재해석하지 않는다.

## P01 속성 편집 표면과 위치

- **목적·사용/비사용:** 짧은 속성은 대상 문맥 안에서 고친다. 긴 원문, 미주 본문, 문서·앱 전체 설정을 작은 속성 팝오버에 넣지 않는다.
- **목표:** 짧은 metadata는 대상 전체에 붙는 팝오버, 긴 수식·Mermaid 원문은 본문 폭, 미주는 현재 자리. 문서 설정은 문서 상단, 앱 Settings는 전용 화면이다. 모든 작은 편집면은 Sidebar·Outline을 제외한 해당 문서 콘텐츠 viewport 안에 둔다. 자동 우측 inspector를 열지 않는다.
- **목표:** 블록 수식 label·번호의 작은 진입을 원문 편집과 분리하되 원문 폼에서 둘을 함께 고치는 경로도 유지한다.
- **현재 기준:** [FigureProperties][figure]의 대상 anchor와 `documentContentBounds`를 공유하는 작은 폼의 콘텐츠 경계(#782), Mermaid 원문의 본문 폭, 미주 in-place와 문서/앱 설정의 범위 분리.
- **사용처:** U01–U11 그림·수식·표·미주·inline/절 label, U12 제목, U13 문서 설정, U22 앱 설정.
- **결정·불일치:** [소유자 결정 P01][decision]. 표·절 label 표면은 [D03](#알려진-불일치), 수식 진입은 D04, 작은 폼의 가용 영역·교차참조 가림 D02는 #782에서 해결했다. 단일/두 그룹 모두 Sidebar·Outline·스크롤바를 제외하며 겹쳐 열린 Outline도 제외한다. [검증·전후 캡처](editor-layout-rules-v1.md#form-content-viewport-782)를 따른다.

## P02 자동·고정 번호

- **목적·사용/비사용:** 그림·표·블록 수식의 번호 지정에 쓴다. 제목 번호 설정이나 새 Core 문서 모드를 만들지 않는다.
- **목표:** 이미지/pending·Mermaid 속성·표·수식·Mermaid 원문의 다섯 폼을 자동/고정 세그먼트로 통일한다. 고정일 때만 값 입력을 보이고 빈 값이면 완료를 막는다. 해제는 자동 선택으로만 한다. 자동 상태에는 실제 표시 번호를 짧게 보여 준다.
- **현재 기준:** [NumberField][number]의 그림 두 폼 세그먼트 표현만 기준이다. 현재는 빈 고정 제출을 막지 않고, 나머지 세 폼은 빈 입력을 자동으로 해석한다. Core/CLI의 빈 enumerator 제거와 비차단 혼합·중복 경고는 유지한다.
- **사용처:** U01–U05 그림·수식·표의 번호 폼, U14 번호 입력·집계.
- **결정·불일치:** [소유자 결정 P02][decision], [현재 번호 계약](heading-numbering-v1.md#fixed-numbers-720). 다섯 폼과 자동 번호 표시는 D01, 문서 경고 전달은 P07/D07.

## P03 편집 진입

- **목적·사용/비사용:** 선택·읽기와 편집 시작을 구별한다. 선택만으로 속성 폼을 열거나 더블클릭만을 유일한 진입으로 삼지 않는다.
- **목표:** 일반 블록은 hover·키보드 focus·선택에서 같은 위치의 Edit를 제공한다. 그림·수식·표의 위치는 P09로 맞춘다. 미주는 상시 Edit와 버튼 전용 진입을 유지한다. inline 콘텐츠 자체를 큰 UI 버튼으로 바꾸지 않는다.
- **현재 기준:** [NodeView][schema]의 그림·수식 Edit 노출, 미주 상시 버튼과 [미주 계약](footnotes-v1.md#editor)의 예외.
- **사용처:** U01–U12 그림·원문·표·미주·inline·절 label·직접 본문 입력, U17 선택 toolbar.
- **결정·불일치:** [소유자 결정 P03][decision]. 표 하단 진입은 D08, 수식의 작은 metadata 진입은 D04. 미주 예외는 불일치가 아니다.

## P04 적용·취소·완료

- **목적·사용/비사용:** 편집을 언제 문서에 반영하는지 드러낸다. 파일 생성·삭제·복구에 metadata의 바깥 클릭 적용 규칙을 쓰지 않는다(P12).
- **목표:** 짧은 metadata는 Done·Esc 취소·유효한 바깥 pointer 클릭 적용이다. keyboard focus 이동만으로 적용하지 않고 오류면 초안을 유지한다. 원문·복합 inline은 Apply/Cancel·Esc 취소·바깥 클릭 초안 유지다. 링크·인용·교차참조에도 Cancel을 보이고 명시적으로 마칠 때까지 초안을 유지한다. 직접 본문·제목·caption·문서 설정은 즉시 적용+Undo이며 디스크 저장은 Save다.
- **목표·예외:** 미주는 in-place·바깥 적용·취소와 Enter 적용/Shift+Enter 줄바꿈을 유지하고 버튼을 완료/취소(Done/Cancel)로 부른다.
- **현재 기준:** [FigureProperties][figure]의 metadata 완료 방식, [PropertyForm][forms]을 쓰는 원문/인라인 수식의 명시적 적용·취소. 미주는 현재 Apply/Cancel이고 링크·인용·교차참조는 보이는 Cancel 없이 blur로 미적용 폼이 닫힌다.
- **사용처:** U01–U13 문서 안 편집·설정, U23–U24 파일 작업·미저장 확인과의 경계.
- **결정·불일치:** [소유자 결정 P04][decision]. 표·절 label D03, 수식 metadata D04, inline 초안 D05, 미주 명칭 D10.

## P05 입력칸·placeholder·위계

- **목적·사용/비사용:** 짧은 속성 입력을 찾기 쉽게 하되 중첩 경계를 줄인다. 문서 입력·원문·모달 전체에 경계 제거를 전파하지 않는다.
- **목표:** 짧은 text field는 subtle fill + hover/focus border, label은 항상 표시한다. 원문은 code surface, 경로·새 이름 같은 독립 모달 핵심 입력은 상시 경계를 유지한다. placeholder는 예시/빈 값 표시이며 label·필수 조건을 대신하지 않는다. 필요한 제약은 label 가까이, 오류는 P07을 따른다.
- **현재 기준:** [그림 속성 필드][schema]와 FigureProperties의 표면, 모달의 공용 Input. 기존 32px field·28px action·6px radius와 token을 사용한다.
- **사용처:** U01–U14 문서 속성·inline·설정, U19 코드 언어·callout, U22–U23 앱 설정·파일 모달.
- **결정·불일치:** [소유자 결정 P05][decision]. 표·절 label·inline·원문 metadata의 상시 경계와 hint 차이는 D09.

## P06 빈 상태와 작성 시작

- **목적·사용/비사용:** 무엇이 비었는지와 다음 행동을 보여 준다. UI 안내를 실제 문서 콘텐츠로 저장하거나 빈 작성 자리를 모두 숨기지 않는다.
- **목표:** 빈 제목은 기존 slot 높이를 유지한 작은 ‘제목 추가(선택)’이며 입력하면 title typography를 쓴다. title과 H1은 분리한다. pending Figure에는 ‘이미지 선택 / Mermaid 작성’ 진입을 보이며 진입만으로 내용을 확정하지 않는다. 빈 caption의 muted italic hint·선택 시 숨김·번호/최소 클릭 영역은 유지한다. 빈 검색·자원 목록은 작성 빈칸과 구별한다.
- **현재 기준:** [빈 caption hint](editor-visual-language-v1.md#state-rules). [DocumentTitle](../../apps/editor/src/document-title.tsx)은 현재 큰 Add a title, pending Figure는 No content yet다.
- **사용처:** U01/U03–U06 빈 그림·원문·표·미주, U12 제목·본문, U21 검색/탐색, U23/U25 파일·참고문헌 빈 상태.
- **결정·불일치:** [소유자 결정 P06][decision]. 제목·pending 진입은 D06. 기존 caption 규칙은 유지한다.

## P07 입력 오류와 알림 센터

- **목적·사용/비사용:** 고칠 입력과 문서·앱 문제를 구별하고 문제 위치로 이동시킨다. 입력칸 오류를 알림 센터만으로 대체하지 않으며 저장 거부/허용 정책을 바꾸지 않는다.
- **목표 — 입력칸:** 고칠 수 있는 오류는 입력 아래의 짧은 오류문, `aria-invalid`·설명 연결과 값 보존을 따른다. 색만으로 상태를 구별하지 않고 적용 불가·저장 가능을 문장으로 구분한다.
- **목표 — 창 단위:** 오른쪽 아래 둥근 아이콘 **하나**가 가장 높은 심각도(경고 주황·오류 빨강)와 개수를 나타내며 스크롤바와 겹치지 않는다. 문서·앱 알림(번호 경고, 저장 실패, 파일·Host 오류, Mermaid 렌더 실패, 앱 메시지)을 모으고 항목마다 ‘문제 위치로 이동’을 둔다. 번호 경고는 적용된 문서 기준임을 명시한다.
- **목표 — 생명주기:** 새 경고·오류가 생기면 포커스를 가져오지 않고 목록을 자동으로 펼치며 사용자가 접을 수 있다. 일회성 안내는 펼치지 않는다. 알림이 없으면 아이콘을 숨긴다. 해결된 항목은 자동 제거하고 사용자가 닫은 항목은 같은 원인이 다시 생길 때까지 숨긴다.
- **현재 기준:** 알림 센터 구현은 **없다**. [MessageArea](../../apps/editor/src/shell/MessageArea.tsx)의 저장 실패 위치 이동과 [링크 폼](../../apps/editor/src/SelectionToolbar.tsx)의 필드 오류 연결은 해당 기능만 재사용할 기준이다. 현재 문서/블록 NumberingNotice, shell 메시지, Mermaid 오류는 분산되어 있다.
- **사용처:** U01–U16 문서 폼·번호·메시지·렌더 실패, U22–U25 설정·파일·복구·참고문헌 알림.
- **결정·불일치:** [소유자 결정 P07][decision]이 인벤토리의 scope별 요약 추천을 대체한다. 알림 센터 D07, 입력칸 오류 D09. 기존 표시를 새 센터가 구현된 것으로 해석하지 않는다.

## P08 읽기 미리보기

- **목적·사용/비사용:** 미주·인용·상대 이미지 링크를 읽는 중 문맥을 보충한다. 편집 폼이나 일반 URL/교차참조 tooltip·이동을 같은 카드로 바꾸지 않는다.
- **목표·현재 기준:** [ReadingPreview](../../apps/editor/src/ReadingPreview.tsx)의 공통 폭 상한·간격·그룹 경계, Esc dismiss, 입력 중 억제와 focus/selection 비탈취를 유지한다. 오류도 읽기 정보다. 카드 안 Edit/Apply·재귀 preview를 넣지 않으며 긴 콘텐츠 생략은 이번 결정에 포함되지 않는다.
- **사용처:** U15 미주·인용·이미지 링크 읽기, U08–U10 링크·인용·교차참조의 읽기 진입 경계.
- **결정·불일치:** [소유자 결정 P08][decision], [현재 읽기 계약](editor-ux-shell-v1.md#endnote-and-citation-reading-previews-752). 채택 목표와 알려진 불일치 없음. 별도 미주 안내 문구 요청 [#773](https://github.com/ieumbird/ieumdoc/issues/773)은 읽기 표면 개편과 구분한다.

## P09 metadata와 블록 도구

- **목적·사용/비사용:** 짧은 속성과 구조 작업의 진입을 구분한다. 표의 행·열 선택 도구나 미주 복귀 번호를 일반 metadata 도구로 대체하지 않는다.
- **목표:** 그림·수식·표 속성 진입은 같은 위쪽 Edit/metadata 행에 둔다. 표 행·열·Append 도구는 grid에, 하단 독립 Delete는 More/actions에 둔다. 도구 표시로 본문 높이를 바꾸지 않고 번호/label을 폼 제목에 반복하지 않는다. 미주 우측 버튼과 복귀 번호는 예외다. 넓은 표에서도 가로 스크롤 전에 도구에 접근하고 caption을 가리지 않아야 한다.
- **현재 기준:** [NodeView][schema]의 그림·수식 상단 도구와 높이를 차지하지 않는 metadata. 수식의 속성/원문 진입 분리는 아직 없다.
- **사용처:** U01–U06 그림·수식·표·미주, U11 절 label, U18 블록/표 구조 도구.
- **결정·불일치:** [소유자 결정 P09][decision]은 #517/#721 배치를 바꾼다. 표 배치 D08, 수식 metadata D04. 미주 예외는 유지한다.

## P10 메뉴와 선택 도구

- **목적·사용/비사용:** 동작·값 선택·검색을 구별한다. combobox·tree·toolbar를 모양 때문에 하나의 menu로 합치지 않는다.
- **목표·현재 기준:** [CommandMenu](../../apps/editor/src/CommandMenu.tsx)와 [공용 메뉴 행](editor-ux-shell-v1.md#unified-action-menus-516)을 유지한다. 같은 action의 icon·문구·disabled 이유를 맞춘다. 값 선택에는 current check, 서식에는 pressed, 실행에는 동사를 쓴다. 검색 active와 선택된 값은 구별한다.
- **사용처:** U17 서식 toolbar, U18 블록·표 메뉴, U19 코드 언어/callout, U20 파일·탭 메뉴, U21 검색·탐색, U09–U10 인용·참조 후보.
- **결정·불일치:** [소유자 결정 P10][decision]. 메뉴 역할 자체의 알려진 불일치 없음. 표 Delete 위치는 P09/D08에서 추적한다.

## P11 선택값·보기·탐색

- **목적·사용/비사용:** 값의 수와 의미에 맞는 선택 표현을 쓴다. 겉모양이 같아도 문서 값·보기 모드·탐색의 role과 저장 범위를 합치지 않는다.
- **목표:** 짧은 상호배타 값은 segment, 많은 값은 선택 메뉴, on/off는 checkbox를 기본으로 한다. 번호 field는 32px, shell view track은 28px이다. current와 keyboard focus의 단서는 독립적으로 유지한다.
- **현재 기준:** [DocumentActions](../../apps/editor/src/shell/DocumentActions.tsx)의 보기 segment, [DocumentSettings](../../apps/editor/src/shell/DocumentSettings.tsx)의 문서 값, Settings의 기기 설정. 보기·탐색의 toggle/tablist와 문서 draft는 서로 다른 의미다.
- **사용처:** U09–U10 인용·참조 값, U13–U14 문서 설정·번호, U19–U22 언어/종류·메뉴·보기/탐색·앱 설정.
- **결정·불일치:** [소유자 결정 P11][decision]. 번호 세그먼트의 미적용 세 폼은 P02/D01. 그 밖의 알려진 불일치 없음.

## P12 모달·파일·복구·설정 범위

- **목적·사용/비사용:** 파일·복구·파괴 작업은 대상과 결과를 확인한다. metadata의 Done/바깥 적용을 이식하거나 기기 설정을 문서 Save에 묶지 않는다.
- **목표·현재 기준:** 기존 [UnsavedChangesDialog](../../apps/editor/src/shell/UnsavedChangesDialog.tsx), [DangerConfirmation](../../apps/editor/src/components/ui/danger-confirmation.tsx), 파일 dialog·비교 화면을 유지한다. 제목→대상→설명/문제→명시적 동사 action, 안전한 취소·focus 복귀, busy 중 중복 실행 방지가 기준이다. 앱 Settings는 즉시 반영하는 별도 화면, file preview·단축키는 읽기 dialog다.
- **사용처:** U22 앱 설정, U23 파일/폴더 picker·새 이름, U24 미저장·삭제·저장/복구 비교, U25 미리보기·단축키·참고문헌 연결.
- **결정·불일치:** [소유자 결정 P12][decision], [현재 저장·복구 계약](editing-session-save-v1.md#switching-and-recovery). 이 작업·확정 경계의 알려진 불일치 없음. 메시지 표시는 P07/D07에서 별도 추적한다.

## 알려진 불일치

현재 코드·1단계 관찰과 확정 목표 사이의 차이다. 해결 항목은 상태와 현재 계약을 명시한다. 아래 이슈의 등록은 구현 완료가 아니다. #777은 이 문서와 추적 등록까지이며 첫 구현은 #776이다.

| ID · 패턴 | 현재 다른 사용처 → 목표 | 후속 이슈 |
| --- | --- | --- |
| D01 · P02/P11 | U01/U02 세그먼트도 빈 고정을 허용; U03/U04/U05는 빈 입력=자동 → 다섯 폼 세그먼트·빈 고정 차단·자동 표시 번호 | [#776](https://github.com/ieumbird/ieumdoc/issues/776) |
| D02 · P01 · 해결 | U10 교차참조·U08 링크의 창 경계와 U05/U07/U11의 전체 scroll 요소 경계를 가용 콘텐츠 viewport로 통일. U09 인용은 공용 훅 변경만 함께 적용; 동결 기능 전용 변경 없음 | [#782](https://github.com/ieumbird/ieumdoc/issues/782), [현재 검증](editor-layout-rules-v1.md#form-content-viewport-782) |
| D03 · P01/P04 | U05 표·U11 절 label의 anchor 끝 정렬·Apply/Cancel·밖에서 유지 → 대상 팝오버·Done/밖에서 적용 | [#791](https://github.com/ieumbird/ieumdoc/issues/791) |
| D04 · P01/P03/P04/P09 | U04 수식은 원문 폼 진입만 있음 → 작은 metadata 진입 분리 | [#788](https://github.com/ieumbird/ieumdoc/issues/788) |
| D05 · P04 | U08–U10 링크·인용·교차참조는 Cancel 없음·blur dismissal → 명시적 적용/취소와 초안 유지 | [#790](https://github.com/ieumbird/ieumdoc/issues/790) |
| D06 · P06 | U12 큰 빈 제목·U01 pending 상태 문구 → 작은 선택 제목·보이는 그림 작성 진입 | [#786](https://github.com/ieumbird/ieumdoc/issues/786) |
| D07 · P02/P07/P12 | U14/U16 등의 문서·블록·shell 메시지 분산 → 창별 알림 센터·위치 이동·해결/닫기/재발 | [#792](https://github.com/ieumbird/ieumdoc/issues/792) |
| D08 · P03/P09/P10 | U05 하단 Edit·독립 Delete → 상단 속성 진입·동작 메뉴 삭제 | [#793](https://github.com/ieumbird/ieumdoc/issues/793) |
| D09 · P05/P07 | U03–U05/U07–U11 짧은 필드의 상시 경계, U01–U11의 폼 Notice/필드 오류 차이 → 속성 fill·필드 오류 연결(기존 연결은 보존) | [#789](https://github.com/ieumbird/ieumdoc/issues/789) |
| D10 · P04 | U06 Apply/Cancel → 완료/취소 명칭, 기존 동작 유지 | [#787](https://github.com/ieumbird/ieumdoc/issues/787) |

[decision]: https://github.com/ieumbird/ieumdoc/issues/777#issuecomment-6510554436
[inventory]: ../reviews/ui-pattern-inventory-777.md
[usage]: ../reviews/ui-pattern-inventory-777.md#사용처-지도
[schema]: ../../apps/editor/src/editor-schema.tsx
[figure]: ../../apps/editor/src/figure-properties.tsx
[forms]: ../../apps/editor/src/block-properties.tsx
[number]: ../../apps/editor/src/numbering-properties.tsx
