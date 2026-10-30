# 반복 UI 패턴 v1

역할: 반복 UI 동작의 확정 목표·현재 기준·불일치를 관리하며, 시각 표현은 [Visual Language](editor-visual-language-v1.md), 배치·치수는 [Layout Rules](editor-layout-rules-v1.md)를 따른다.

- Status: Draft
- P01 content-boundary verification: 2026-10-30 (#782; 실제 1440/640px·Outline 열림/닫힘·두 그룹 browser 검사와 [전후 캡처](editor-layout-rules-v1.md#form-content-viewport-782)).
- P02 verified: 2026-10-30 (#776; 다섯 폼·입력칸 오류·자동 표시와 저장/재열기를 브라우저에서 확인).
- P06 verified: 2026-10-30 (#786; title slot/typography, pending Figure entry/cancel/Apply/Undo/Save and existing caption/body/list patterns; [evidence](figure-authoring-v1.md#empty-authoring-entry-786)).
- Inventory baseline: 2026-10-30. master `2de4e857`의 코드·현재 계약과 #777 소유자 결정 대조. 인벤토리 문서 작업에서는 브라우저를 실행하지 않았다. 화면 근거는 [1단계 인벤토리][inventory]에 보존하며 후속 구현 검증은 해당 패턴에 기록한다.
- Scope: Editor 반복 UI의 **확정된 목표**, 현재 기준 구현과 알려진 불일치. Draft는 미구현 목표를 Implemented 계약으로 표시하지 않기 위한 상태이며 소유자 결정을 재논의한다는 뜻이 아니다.
- Authority: [AGENTS.md](../../AGENTS.md), [ADR-0001](../adr/0001-single-document-editor-architecture.md), [ADR-0010](../adr/0010-supported-viewport-and-input.md), [#777 소유자 결정][decision]. 현재 동작은 각 Implemented 계약을 따른다. 이 목표가 바꾸는 현재 동작은 아래 후속 이슈에서 구현하고 같은 PR에서 해당 계약을 갱신한다.

## 사용과 갱신

UI 작업 전에 해당 패턴과 **같은 패턴을 쓰는 다른 사용처**를 읽고 확인한다. 새 불일치를 발견하면 같은 PR에서 아래 목록에 ID·패턴·사용처·목표·후속 이슈를 등록한다. 일부 화면에만 먼저 적용하면 나머지 화면의 후속 이슈를 등록한다.

구현 PR은 해당 패턴 절의 현재 기준과 관련 Implemented 계약·검증 근거를 갱신한다. 불일치의 진행 상태는 연결된 GitHub 이슈의 열림·닫힘으로 관리하며 공유 표에 해결/미해결을 표시하거나 구현 진행에 따라 행을 수정·삭제하지 않는다. 목록은 고정된 추적 정보만 유지하고, 새 불일치나 목표·범위·이슈 연결이 바뀔 때 갱신한다([#806](https://github.com/ieumbird/ieumdoc/issues/806)).

U ID와 파일·화면·캡처의 대응은 [사용처 지도][usage]를 재사용한다. 아래 기준 구현은 **명시한 부분만** 목표에 맞는 현재 구현이며, 컴포넌트 전체가 모든 패턴을 충족한다는 뜻이 아니다. 알려진 불일치 없음은 이 조사 범위에서의 판단이며 전체 동작 재검증을 뜻하지 않는다. 목표의 대안과 과거 근거는 인벤토리에 남긴다.

치수·정렬은 [Layout Rules](editor-layout-rules-v1.md), 색·서체·상태는 [Visual Language](editor-visual-language-v1.md)를 함께 따른다. 지원 최소 폭은 640px이며 키보드·포인터 접근을 유지한다. 문서 의미·Save 허용 여부를 UI가 재해석하지 않는다.

## P01 속성 편집 표면과 위치

- **목적·사용/비사용:** 짧은 속성은 대상 문맥 안에서 고친다. 긴 원문, 미주 본문, 문서·앱 전체 설정을 작은 속성 팝오버에 넣지 않는다.
- **목표:** 짧은 metadata는 대상 전체에 붙는 팝오버, 긴 수식·Mermaid 원문은 본문 폭, 미주는 현재 자리. 문서 설정은 문서 상단, 앱 Settings는 전용 화면이다. 모든 작은 편집면은 Sidebar·Outline을 제외한 해당 문서 콘텐츠 viewport 안에 둔다. 자동 우측 inspector를 열지 않는다.
- **목표:** 블록 수식 label·번호의 작은 진입을 원문 편집과 분리하되 원문 폼에서 둘을 함께 고치는 경로도 유지한다.
- **현재 기준:** [MetadataProperties](../../apps/editor/src/metadata-properties.tsx)를 그림·표·절 label이 공유하며 대상 전체(절 label은 연결된 제목)에 붙인다(#791). `documentContentBounds`를 공유하는 작은 폼의 콘텐츠 경계(#782), Mermaid 원문의 본문 폭, 미주 in-place와 문서/앱 설정의 범위 분리.
- **사용처:** U01–U11 그림·수식·표·미주·inline/절 label, U12 제목, U13 문서 설정, U22 앱 설정.
- **결정·불일치:** [소유자 결정 P01][decision]. 표·절 label의 [D03](#알려진-불일치)은 #791에서 구현했다. 수식 진입은 D04, 작은 폼의 가용 영역·교차참조 가림 D02는 #782에서 해결했다. 단일/두 그룹 모두 Sidebar·Outline·스크롤바를 제외하며 겹쳐 열린 Outline도 제외한다. [검증·전후 캡처](editor-layout-rules-v1.md#form-content-viewport-782)를 따른다.

## P02 자동·고정 번호

- **목적·사용/비사용:** 그림·표·블록 수식의 번호 지정에 쓴다. 제목 번호 설정이나 새 Core 문서 모드를 만들지 않는다.
- **목표:** 이미지/pending·Mermaid 속성·표·수식·Mermaid 원문의 다섯 폼을 자동/고정 세그먼트로 통일한다. 고정일 때만 값 입력을 보이고 빈 값이면 완료를 막는다. 해제는 자동 선택으로만 한다. 자동 상태에는 자동으로 적용했을 때 받을 번호를 짧게 보여 준다.
- **현재 기준:** [NumberField][number]를 이미지/pending·Mermaid 속성·표·블록 수식·Mermaid 원문의 다섯 폼에서 공유한다(#776). 자동/고정 세그먼트, 고정일 때만 값 입력, 빈 고정의 완료 차단·입력칸 오류와 자동 선택으로만 해제를 동일하게 제공한다. 자동 상태는 해당 블록의 고정값을 제외하여 Core가 계산한 번호를 "자동 번호: N"으로 짧게 표시한다. 아직 적용하지 않은 선택의 결과와 이미 자동으로 적용된 번호에 같은 문구를 쓴다. Core/CLI의 빈 enumerator 제거와 비차단 혼합·중복 경고는 유지한다.
- **사용처:** U01–U05 그림·수식·표의 번호 폼, U14 번호 입력·집계.
- **결정·불일치:** [소유자 결정 P02][decision], [현재 번호 계약](heading-numbering-v1.md#fixed-numbers-720). D01은 #776에서 해소했다. 문서 경고 전달은 P07/D07.

## P03 편집 진입

- **목적·사용/비사용:** 선택·읽기와 편집 시작을 구별한다. 선택만으로 속성 폼을 열거나 더블클릭만을 유일한 진입으로 삼지 않는다.
- **목표:** 일반 블록은 hover·키보드 focus·선택에서 같은 위치의 Edit를 제공한다. 그림·수식·표의 위치는 P09로 맞춘다. 미주는 상시 Edit와 버튼 전용 진입을 유지한다. inline 콘텐츠 자체를 큰 UI 버튼으로 바꾸지 않는다.
- **현재 기준:** [그림][figure-view]·[수식][equation-view] NodeView와 [표](table-interaction-v1.md#whole-table-tools-793)의 상단 Edit 노출, [미주][footnote-view] 상시 버튼과 [미주 계약](footnotes-v1.md#editor)의 예외.
- **사용처:** U01–U12 그림·원문·표·미주·inline·절 label·직접 본문 입력, U17 선택 toolbar.
- **결정·불일치:** [소유자 결정 P03][decision]. 표는 #793에서 상단 Edit/metadata 행으로 맞췄으며 D08은 원래 목표의 추적 연결로 보존한다. 수식의 작은 metadata 진입은 D04. 미주 예외는 불일치가 아니다.

## P04 적용·취소·완료

- **목적·사용/비사용:** 편집을 언제 문서에 반영하는지 드러낸다. 파일 생성·삭제·복구에 metadata의 바깥 클릭 적용 규칙을 쓰지 않는다(P12).
- **목표:** 짧은 metadata는 Done·Esc 취소·유효한 바깥 pointer 클릭 적용이다. keyboard focus 이동만으로 적용하지 않고 오류면 초안을 유지한다. 원문·복합 inline은 Apply/Cancel·Esc 취소·바깥 클릭 초안 유지다. 링크·교차참조에도 Cancel을 보이고 명시적으로 마칠 때까지 초안을 유지한다. 인용은 [ADR-0008 동결](../adr/0008-citations-and-bibliography.md)에 따라 기존 동작을 유지한다. 직접 본문·제목·caption·문서 설정은 즉시 적용+Undo이며 디스크 저장은 Save다.
- **목표·예외:** 미주는 in-place·바깥 적용·취소와 Enter 적용/Shift+Enter 줄바꿈을 유지하고 버튼을 완료/취소(Done/Cancel)로 부른다.
- **현재 기준:** 그림·표·절 label이 공유하는 `MetadataProperties`의 Done·Esc 취소·유효한 바깥 pointer 적용(#791). 키보드 focus/Save만으로 적용하지 않으며 오류 때 폼·값을 유지하고, 바깥 적용은 클릭한 위치의 focus를 유지하며, 포인터 탭 전환으로 문서가 숨겨져도 해당 문서의 완료를 마친다. 별도 dialog 안의 Cancel·Keep editing·Settings 클릭은 바깥 완료에서 제외하고 폼·초안을 유지한다. 표의 번호 입력은 P02 그대로다. 기존 [FigureProperties][figure]의 image chooser·busy guard와 [PropertyForm][forms]을 쓰는 원문/인라인 수식의 명시적 적용·취소. [미주](footnotes-v1.md#editor)의 완료/취소(Done/Cancel)와 기존 in-place·바깥 적용·키보드 동작. 링크·교차참조는 Apply/Cancel·Esc 취소·바깥 클릭 유지이며, 변경된 초안은 같은 문서의 다른 폼과 독립적으로 기존 draft 안내·Save/Source의 적용 내용 구분·탭 전환 보존·close 보호에 참여한다([초안 계약](editing-session-save-v1.md#applied-content-and-drafts)). 인용은 보이는 Cancel 없이 blur로 닫히는 기존 동작을 유지한다.
- **사용처:** U01–U13 문서 안 편집·설정, U23–U24 파일 작업·미저장 확인과의 경계.
- **결정·불일치:** [소유자 결정 P04][decision]. 표·절 label D03은 #791에서 구현했다(`property-drafts`의 Done·오류 유지·바깥 클릭 뒤 본문 입력·키보드 Save 검사와 [1440px 표 Before](assets/label-popover-791/before/table-1440.png)/[After](assets/label-popover-791/after/table-1440.png)·[640px 절 label Before](assets/label-popover-791/before/section-640.png)/[After](assets/label-popover-791/after/section-640.png); Light/영어·Dark/한국어 [촬영 metadata](assets/label-popover-791/capture-metadata.json)). 수식 metadata D04는 별도 작업이며, 링크·교차참조 초안 D05는 #790에서 구현했다. 미주 명칭 D10은 #787에서 해결했다.
- **링크·교차참조 검증 #790:** `link-authoring`/`cross-reference`가 바깥 이동·재진입·독립 폼·미주·Save/Source·탭·close 보호와 실제 Save/Reload를 확인한다. [1440px 링크 Before](assets/inline-forms-790/before-1440-link.png) / [After](assets/inline-forms-790/after-1440-link.png), [640px 한국어 Dark 교차참조 Before](assets/inline-forms-790/before-640-reference.png) / [After](assets/inline-forms-790/after-640-reference.png)는 수동 시각 근거다. 두 폼의 두 폭 전체 캡처·해시는 [촬영 정보](assets/inline-forms-790/capture-metadata.json), 재현 절차는 [촬영 스크립트](assets/inline-forms-790/capture.browser.js)에 있다. 기존 draft 안내로 늘어난 높이는 실제 레이아웃 결과다.

## P05 입력칸·placeholder·위계

- **목적·사용/비사용:** 짧은 속성 입력을 찾기 쉽게 하되 중첩 경계를 줄인다. 문서 입력·원문·모달 전체에 경계 제거를 전파하지 않는다.
- **목표:** 짧은 text field는 subtle fill + hover/focus border, label은 항상 표시한다. 원문은 code surface, 경로·새 이름 같은 독립 모달 핵심 입력은 상시 경계를 유지한다. placeholder는 예시/빈 값 표시이며 label·필수 조건을 대신하지 않는다. 필요한 제약은 label 가까이, 오류는 P07을 따른다.
- **현재 기준:** [그림 속성 필드][figure-view]의 subtle fill·hover/focus border를 `PropertyForm`/`BlockProperties`의 표·절 label·수식/원문 metadata와 링크의 짧은 text field에 공유한다(#789). label은 상시 표시하며 기존 32px field·28px action·6px radius와 token을 사용한다. 원문 textarea(인라인 LaTeX 포함), 제목·caption과 독립 모달의 핵심 입력은 기존 경계를 유지한다. 교차참조의 target은 text field가 아닌 select로 기존 경계·후보 동작을 유지한다. 인용은 전용 변경 없이 공용 스타일만 따른다(ADR-0008 동결).
- **사용처:** U01–U14 문서 속성·inline·설정, U19 코드 언어·callout, U22–U23 앱 설정·파일 모달.
- **결정·불일치:** [소유자 결정 P05][decision]. D09의 구현·검증은 #789. `short-field-errors`가 1440px Light·영어 / 640px Dark·한국어에서 필드 rest·hover·focus, 오류 연결·위치와 값 보존을 검사한다. 같은 scratch 문서·잘못된 label로 비교한 [1440px 표 Before](assets/short-fields-789/before-1440-table.png) / [After](assets/short-fields-789/after-1440-table.png), [640px 그림 Before](assets/short-fields-789/before-640-figure.png) / [After](assets/short-fields-789/after-640-figure.png)는 [촬영 스크립트](assets/short-fields-789/capture.browser.js)와 [metadata·해시](assets/short-fields-789/capture-metadata.json)로 묶은 수동 시각 검토 근거다. 오류문 축소에 따른 폼 높이·위치 차이는 실제 배치 결과이며 이미지 재배치가 아니다.

## P06 빈 상태와 작성 시작

- **목적·사용/비사용:** 무엇이 비었는지와 다음 행동을 보여 준다. UI 안내를 실제 문서 콘텐츠로 저장하거나 빈 작성 자리를 모두 숨기지 않는다.
- **목표:** 빈 제목은 기존 slot 높이를 유지한 작은 ‘제목 추가(선택)’이며 입력하면 title typography를 쓴다. title과 H1은 분리한다. pending Figure에는 ‘이미지 선택 / Mermaid 작성’ 진입을 보이며 진입만으로 내용을 확정하지 않는다. 빈 caption의 muted italic hint·선택 시 숨김·번호/최소 클릭 영역은 유지한다. 빈 검색·자원 목록은 작성 빈칸과 구별한다.
- **현재 기준:** [DocumentTitle](../../apps/editor/src/document-title.tsx)은 기존 title slot 높이를 유지하며 작은 UI 서체의 `제목 추가(선택)` / `Add a title (optional)`을 보이고, 입력 즉시 제목 서체로 전환한다. [pending Figure][figure-view]는 `이미지 선택` / `Mermaid 작성` 버튼으로 기존 picker·원문 편집을 연다. 선택 진입·취소만으로 문서 내용을 확정하지 않는다. [빈 caption hint](editor-visual-language-v1.md#state-rules), 빈 본문의 작성 안내와 빈 목록의 항목 안내는 기존 규칙을 유지한다. 검색·자원 목록의 빈 결과와는 구별한다.
- **사용처:** U01/U03–U06 빈 그림·원문·표·미주, U12 제목·본문, U21 검색/탐색, U23/U25 파일·참고문헌 빈 상태.
- **결정·불일치:** [소유자 결정 P06][decision]. D06은 [#786](https://github.com/ieumbird/ieumdoc/issues/786)에서 해소했다. [제목 계약](document-editing-v1.md#document-title-255)·[그림 계약](figure-authoring-v1.md#editor-session-states)과 [전후 캡처](figure-authoring-v1.md#empty-authoring-entry-786)를 따른다. 기존 caption·선택·clipboard 규칙은 유지한다.

## P07 입력 오류와 알림 센터

- **목적·사용/비사용:** 고칠 입력과 문서·앱 문제를 구별하고 문제 위치로 이동시킨다. 입력칸 오류를 알림 센터만으로 대체하지 않으며 저장 거부/허용 정책을 바꾸지 않는다.
- **목표 — 입력칸:** 고칠 수 있는 오류는 입력 아래의 짧은 오류문, `aria-invalid`·설명 연결과 값 보존을 따른다. 색만으로 상태를 구별하지 않고 적용 불가·저장 가능을 문장으로 구분한다.
- **목표 — 창 단위:** 오른쪽 아래 둥근 아이콘 **하나**가 가장 높은 심각도(경고 주황·오류 빨강)와 개수를 나타내며 스크롤바와 겹치지 않는다. 문서·앱 알림(번호 경고, 저장 실패, 파일·Host 오류, Mermaid 렌더 실패, 앱 메시지)을 모으고 항목마다 ‘문제 위치로 이동’을 둔다. 번호 경고는 적용된 문서 기준임을 명시한다.
- **목표 — 생명주기:** 새 경고·오류가 생기면 포커스를 가져오지 않고 목록을 자동으로 펼치며 사용자가 접을 수 있다. 일회성 안내는 펼치지 않는다. 알림이 없으면 아이콘을 숨긴다. 해결된 항목은 자동 제거하고 사용자가 닫은 항목은 같은 원인이 다시 생길 때까지 숨긴다.
- **현재 기준:** [NotificationCenter](../../apps/editor/src/components/ui/notification-center.tsx)는 창의 App 인스턴스에 하나만 둔다(#792). 열린 모든 문서의 적용된 번호 경고·저장 실패·지속 파일/Host 오류·앱 메시지와 적용된 Mermaid 렌더 실패를 [Docling 대조](docling-compare-v1.md)의 낡은 대응표 경고(#769)·[Docling 변환](docling-conversion-v1.md#app-pdf-conversion-797)의 실행 오류(#797)와 함께 모은다. 문서 이름과 문제 위치 이동을 제공하며 위치 없는 앱 메시지는 이동 없이 표시한다. [MessageArea](../../apps/editor/src/shell/MessageArea.tsx)는 기존 메시지의 등록·일회 안내 만료를 맡는다. 미적용 초안의 Save/Source 범위 설명은 기존 상단 위치에 상시 표시한다. 문서 상단/번호 폼 경고는 센터로 옮겼으며 저장 실패의 기술적 상세·다중 위치 탐색과 문서 안 빨간 테두리는 유지한다.
- **현재 생명주기:** 새 경고·오류만 focus 없이 목록을 펼친다. 원인별 안정적인 ID를 쓰며 샘플 준비·복구 저장소 등 독립 원인을 합치지 않는다. 접힌 토글의 접근성 이름에 최고 심각도·개수를 포함하고, 새 항목은 펼침과 독립된 polite live region에서 한 번 알린다. 접은 목록은 항목 제거·안내 추가로 다시 펼쳐지지 않는다. 일회 안내는 기존 5초 수명과 Undo를 유지한다. 원인 제거 시 항목을 없애고, 닫은 원인은 탭 전환·무관한 편집에서 숨김을 유지하다가 제거 후 재발하면 다시 표시한다. 탭을 닫으면 그 탭의 원인도 제거한다. 알림·접힘·숨김은 창 메모리에만 두고 문서·복구 기록에 쓰지 않는다. 저장 실패는 기존 계약대로 다음 성공한 Save가 해소하며, 편집 후 위치가 낡으면 재저장을 안내한다. Core/Host의 저장 허용·거부를 재판정하지 않는다.
- **남기는 문맥 표시:** 미적용 초안의 Save/Source 범위 설명은 일회 안내가 아닌 상시 문맥 정보여서 기존 상단 위치에 유지한다. 입력칸 오류·Mermaid **초안** 미리보기 오류는 폼에 유지한다. 파일 picker의 경로/이름 오류·Settings 선택값 저장 오류는 해당 입력 피드백이다. 열린 Source/Recovery 비교 등의 읽기 실패는 그 화면 상태를 설명하는 P12 문맥 정보여서 화면 안에 둔다. 참고문헌 completeness는 ADR-0008 동결 범위를 유지한다. 블록의 짧은 미리보기 불가 표시는 위치 표식이며 상세 실패를 중복 출력하지 않는다. 폼 입력칸 연결은 기존 연결과 D09 범위를 따른다.
- **검증:** `notification-center`는 심각도·개수, 자동 펼침/접기, focus/selection 유지, 해결·닫기·재발, 비활성 탭 위치 이동, 창 격리와 일회 안내를 검증한다. 1440/640px·light/dark·한국어 [시각 근거](#notification-center-792)를 함께 확인한다.
- **현재 기준 — 입력칸 (#789):** `FieldError`의 짧은 오류문을 해당 입력 바로 아래에 두고, 입력의 `aria-invalid`와 고유한 `aria-describedby`로 연결하며 거절된 값을 보존한다. 그림의 label·이미지 경로·alt·파일 이름, Mermaid 원문의 빈 값·label, 수식·표·절 label, 인라인 LaTeX·링크 URL과 기존 NumberField 오류가 이 표현을 쓴다. label 중복은 Core 거절을 표시하고 번호 제출 규칙은 #776 그대로다. 특정 입력으로 귀속할 수 없는 폼 내부 Host/검증 실패 Notice는 폼 문맥에 유지하고, 적용 문서 경고는 위 창 단위 센터로 보낸다. 기존 인용 오류 동작은 동결 범위로 유지한다. `short-field-errors`에서 수정 전 오류 연결 검사 실패와 수정 후 통과를 확인했다(2026-10-30).
- **사용처:** U01–U16 문서 폼·번호·메시지·렌더 실패, U22–U25 설정·파일·복구·참고문헌 알림.
- **결정·불일치:** [소유자 결정 P07][decision]이 인벤토리의 scope별 요약 추천을 대체한다. 알림 센터의 추적은 D07, 입력칸 오류는 D09다.

<a id="notification-center-792"></a>

### 알림 센터 시각 근거 (#792)

동일한 `fixed.md`의 표 고정 번호를 해제한 적용 문서 상태, Windows Chrome의 checkout별 persistent profile,
Vite `http://127.0.0.1:5292`, DPR 1·100% 확대, Pretendard 로드 후 문서 scroll top 0이다.
Before는 이 브랜치의 시작 HEAD `644b2d7b3e5639b3be000bced5cf048a7ccb9532`에서 제품 소스만 복원해 새 회귀의 실패를 확인한 상태다.
After는 #792 작업 소스로 촬영했다. source/disk 쓰기 없이 번호 경고의 전달 위치만 비교한다.

| 폭 | Before | After light | After dark (한국어) |
| --- | --- | --- | --- |
| 1440 | [PNG](assets/notification-center-792/before-1440.png) | [PNG](assets/notification-center-792/after-1440-light-en.png) | [PNG](assets/notification-center-792/after-1440-dark-ko.png) |
| 640 | [PNG](assets/notification-center-792/before-640.png) | [PNG](assets/notification-center-792/after-640-light-en.png) | [PNG](assets/notification-center-792/after-640-dark-ko.png) |

같은 행의 정렬·패딩, 한국어 줄바꿈과 창/스크롤바 여유를 자기 캡처에서 확인했다.
접힌 센터의 투명 영역은 pointer를 통과시키며 활성 팝오버·모달은 센터 위에 둔다.
목록은 Explorer 오른쪽 경계를 넘지 않으며 이동 버튼 글자는 메시지 왼쪽 축에 맞춘다.
저장 실패 표식·초안 입력 오류·모달 문맥 정보는 위 분류대로 남긴다.


## P08 읽기 미리보기

- **목적·사용/비사용:** 미주·인용·상대 이미지 링크를 읽는 중 문맥을 보충한다. 편집 폼이나 일반 URL/교차참조 tooltip·이동을 같은 카드로 바꾸지 않는다.
- **목표·현재 기준:** [ReadingPreview](../../apps/editor/src/ReadingPreview.tsx)의 공통 폭 상한·간격·그룹 경계, Esc dismiss, 입력 중 억제와 focus/selection 비탈취를 유지한다. 오류도 읽기 정보다. 카드 안 Edit/Apply·재귀 preview를 넣지 않으며 긴 콘텐츠 생략은 이번 결정에 포함되지 않는다.
- **사용처:** U15 미주·인용·이미지 링크 읽기, U08–U10 링크·인용·교차참조의 읽기 진입 경계.
- **결정·불일치:** [소유자 결정 P08][decision], [현재 읽기 계약](editor-ux-shell-v1.md#endnote-and-citation-reading-previews-752). 채택 목표와 알려진 불일치 없음. 별도 미주 안내 문구 요청 [#773](https://github.com/ieumbird/ieumdoc/issues/773)은 읽기 표면 개편과 구분한다.

## P09 metadata와 블록 도구

- **목적·사용/비사용:** 짧은 속성과 구조 작업의 진입을 구분한다. 표의 행·열 선택 도구나 미주 복귀 번호를 일반 metadata 도구로 대체하지 않는다.
- **목표:** 그림·수식·표 속성 진입은 같은 위쪽 Edit/metadata 행에 둔다. 표 행·열·Append 도구는 grid에, 하단 독립 Delete는 More/actions에 둔다. 도구 표시로 본문 높이를 바꾸지 않고 번호/label을 폼 제목에 반복하지 않는다. 미주 우측 버튼과 복귀 번호는 예외다. 넓은 표에서도 가로 스크롤 전에 도구에 접근하고 caption을 가리지 않아야 한다.
- **현재 기준:** [그림][figure-view]·[수식][equation-view] NodeView의 상단 도구와 metadata. [표 #793](table-interaction-v1.md#whole-table-tools-793)은 가로 스크롤 밖 상단 행에 Edit/More·metadata를 두고, Delete는 More 메뉴에 둔다. 표는 앞 문단·열 핸들과 겹치지 않도록 상단 행의 공간을 항상 확보하며 도구 표시로 본문 높이를 바꾸지 않는다. 행·열·Append와 caption 간격은 유지한다. 수식의 속성/원문 진입 분리는 아직 없다.
- **사용처:** U01–U06 그림·수식·표·미주, U11 절 label, U18 블록/표 구조 도구.
- **결정·불일치:** [소유자 결정 P09][decision]은 #517/#721 배치를 바꾼다. 표 배치 D08의 현재 계약·1440/640px 캡처·키보드/가로 스크롤 검증은 [표 도구 기록](table-interaction-v1.md#whole-table-tools-793)에 연결한다. 수식 metadata D04와 미주 예외는 유지한다.

## P10 메뉴와 선택 도구

- **목적·사용/비사용:** 동작·값 선택·검색을 구별한다. combobox·tree·toolbar를 모양 때문에 하나의 menu로 합치지 않는다.
- **목표·현재 기준:** [CommandMenu](../../apps/editor/src/CommandMenu.tsx)와 [공용 메뉴 행](editor-ux-shell-v1.md#unified-action-menus-516)을 유지한다. 같은 action의 icon·문구·disabled 이유를 맞춘다. 값 선택에는 current check, 서식에는 pressed, 실행에는 동사를 쓴다. 검색 active와 선택된 값은 구별한다.
- **사용처:** U17 서식 toolbar, U18 블록·표 메뉴, U19 코드 언어/callout, U20 파일·탭 메뉴, U21 검색·탐색, U09–U10 인용·참조 후보.
- **결정·불일치:** [소유자 결정 P10][decision]. 메뉴 역할 자체의 알려진 불일치 없음. 표 Delete는 #793에서 상단 More의 기존 공용 danger 메뉴 항목으로 통합했다. 행·열의 명시적 대상, disabled 제한, 삭제·Undo 의미와 키보드 Enter/화살표/Esc 동작은 유지한다(P09/D08).

## P11 선택값·보기·탐색

- **목적·사용/비사용:** 값의 수와 의미에 맞는 선택 표현을 쓴다. 겉모양이 같아도 문서 값·보기 모드·탐색의 role과 저장 범위를 합치지 않는다.
- **목표:** 짧은 상호배타 값은 segment, 많은 값은 선택 메뉴, on/off는 checkbox를 기본으로 한다. 번호 field는 32px, shell view track은 28px이다. current와 keyboard focus의 단서는 독립적으로 유지한다.
- **현재 기준:** [DocumentActions](../../apps/editor/src/shell/DocumentActions.tsx)의 보기 segment, [DocumentSettings](../../apps/editor/src/shell/DocumentSettings.tsx)의 문서 값, Settings의 기기 설정. 보기·탐색의 toggle/tablist와 문서 draft는 서로 다른 의미다.
- **사용처:** U09–U10 인용·참조 값, U13–U14 문서 설정·번호, U19–U22 언어/종류·메뉴·보기/탐색·앱 설정.
- **추가 사용처:** [Docling 대조](docling-compare-v1.md)의 동기 스크롤 checkbox는 탭 안의 일시적 보기 상태이며 문서/기기 설정에 저장하지 않는다.
- **결정·불일치:** [소유자 결정 P11][decision]. 번호 세그먼트는 P02의 다섯 폼에 적용했다(#776). 알려진 불일치 없음.

## P12 모달·파일·복구·설정 범위

- **목적·사용/비사용:** 파일·복구·파괴 작업은 대상과 결과를 확인한다. metadata의 Done/바깥 적용을 이식하거나 기기 설정을 문서 Save에 묶지 않는다.
- **목표·현재 기준:** 기존 [UnsavedChangesDialog](../../apps/editor/src/shell/UnsavedChangesDialog.tsx), [DangerConfirmation](../../apps/editor/src/components/ui/danger-confirmation.tsx), 파일 dialog·비교 화면을 유지한다. 제목→대상→설명/문제→명시적 동사 action, 안전한 취소·focus 복귀, busy 중 중복 실행 방지가 기준이다. 앱 Settings는 즉시 반영하는 별도 화면, file preview·단축키는 읽기 dialog다.
- **사용처:** U22 앱 설정, U23 파일/폴더 picker·새 이름, U24 미저장·삭제·저장/복구 비교, U25 미리보기·단축키·참고문헌 연결.
- **추가 사용처:** #797 Docling 서버 Settings는 Host 기기 설정·field exit 저장, PDF 선택은 기존 FolderDialog, 실행은 명시적 변환 확인·진행·대기 중단 dialog다. 연결 확인 실패 뒤에도 서버 구성 안내 링크를 유지한다. 같은 Settings/파일 dialog 패턴을 재사용한다.
- **추가 사용처:** [Docling 대조](docling-compare-v1.md)는 기존 FolderDialog로 변환 폴더를 명시적으로 연다. 문서 쓰기·미저장 확인과 연결하지 않는다. bbox·연결선·변환 메모 띠는 비교 전용 새 표현이며 기존 편집 패턴을 바꾸지 않는다.
- **결정·불일치:** [소유자 결정 P12][decision], [현재 저장·복구 계약](editing-session-save-v1.md#switching-and-recovery). 이 작업·확정 경계의 알려진 불일치 없음. 메시지 표시는 P07/D07에서 별도 추적한다.

## 알려진 불일치

1단계 관찰에서 식별한 차이와 후속 목표의 추적 목록이다. 해결된 항목도 ID와 이슈 연결을 유지한다. 진행 상태는 후속 이슈의 열림·닫힘으로, 현재 구현·계약·검증은 해당 패턴 절에서 확인한다. #777은 이 문서와 추적 등록까지이며 첫 구현은 #776이다.

| ID · 패턴 | 사용처 · 목표 | 후속 이슈 |
| --- | --- | --- |
| D01 · P02/P11 | U01–U05 다섯 폼의 자동/고정 세그먼트·빈 고정 차단·자동 표시 번호를 공용 NumberField로 통일 | [#776](https://github.com/ieumbird/ieumdoc/issues/776) |
| D02 · P01 | U10 교차참조·U08 링크와 U05/U07/U11 폼의 경계를 가용 콘텐츠 viewport로 통일. U09 인용은 공용 훅 변경만 포함하며 동결 기능 전용 변경은 제외 | [#782](https://github.com/ieumbird/ieumdoc/issues/782) |
| D03 · P01/P04 | U05 표·U11 절 label의 대상 전체 팝오버·Done/바깥 pointer 적용·Esc 취소 ([현재 계약](#p04-적용취소완료)) | [#791](https://github.com/ieumbird/ieumdoc/issues/791) |
| D04 · P01/P03/P04/P09 | U04 수식의 작은 metadata 진입을 원문 폼 진입과 분리 | [#788](https://github.com/ieumbird/ieumdoc/issues/788) |
| D05 · P04 | U08 링크·U10 교차참조의 명시적 적용/취소와 초안 유지. U09 인용은 ADR-0008 동결로 제외 | [#790](https://github.com/ieumbird/ieumdoc/issues/790) |
| D06 · P06 | U12 빈 제목에 선택적 제목 추가 안내, U01 pending Figure에 이미지 선택 / Mermaid 작성 진입 제공. 기존 caption·본문·목록의 빈 상태와 선택·clipboard 의미 유지 | [#786](https://github.com/ieumbird/ieumdoc/issues/786) |
| D07 · P02/P07/P12 | U03/U14/U16의 적용 문서·지속 앱 문제를 Docling과 같은 창별 센터로 집계하고 위치 이동·해결/닫기/재발 처리. 입력·열린 비교 화면의 문맥 오류는 유지 | [#792](https://github.com/ieumbird/ieumdoc/issues/792) |
| D08 · P03/P09/P10 | U05 표의 상단 속성 진입·동작 메뉴 삭제 ([계약·검증](table-interaction-v1.md#whole-table-tools-793)) | [#793](https://github.com/ieumbird/ieumdoc/issues/793) |
| D09 · P05/P07 | U03–U05/U07–U11 짧은 속성 필드의 fill과 U01–U11 필드 오류 연결 통일(기존 연결은 보존) | [#789](https://github.com/ieumbird/ieumdoc/issues/789) |
| D10 · P04 | U06 완료/취소(Done/Cancel), 그림과 같은 번역 재사용·기존 동작 유지 | [#787](https://github.com/ieumbird/ieumdoc/issues/787) |

[decision]: https://github.com/ieumbird/ieumdoc/issues/777#issuecomment-6510554436
[inventory]: ../reviews/ui-pattern-inventory-777.md
[usage]: ../reviews/ui-pattern-inventory-777.md#사용처-지도
[figure-view]: ../../apps/editor/src/node-views/figure-view.tsx
[equation-view]: ../../apps/editor/src/node-views/equation-view.tsx
[footnote-view]: ../../apps/editor/src/node-views/footnote-definition-view.tsx
[figure]: ../../apps/editor/src/figure-properties.tsx
[forms]: ../../apps/editor/src/block-properties.tsx
[number]: ../../apps/editor/src/numbering-properties.tsx
