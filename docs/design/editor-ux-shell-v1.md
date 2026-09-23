# Editor UX Shell v1

- Status: Draft
- Date: 2026-09-23
- Scope: `apps/editor` 한 화면의 UI/UX 구조. 구현 방식과 시각 디자인은 다루지 않는다.

## Design direction

- **문서가 화면의 주인공이다.** Chrome은 문서 주변에 얇게 두고, 편집 도구는 필요한 순간 필요한 위치에만 나타난다.
- **Outline의 shell**: 좌측 sidebar + 차분한 중앙 문서 column. 앱 기능은 sidebar와 top bar로 모으고 canvas에는 두지 않는다.
- **Notion의 작성 경험**: block handle, `+`, `/`, selection toolbar로 모든 작성 interaction을 해결한다. 고정 formatting toolbar는 두지 않는다.
- **OpenKnowledge의 밀도**: 가벼운 여백, 작은 chrome, typed block은 문서 흐름 안에서 in-place로 편집한다.
- ADR-0001의 Single Editor + Typed Blocks + Block-first UX를 그대로 따른다. 모든 UI는 하나의 Tiptap editor state 위의 overlay/NodeView이며, 블록마다 별도 편집기를 만들지 않는다.
- 새 기능은 toolbar 버튼이 아니라 **insert menu 항목, block menu 항목, typed block 내부 UI** 중 하나로 들어간다.

## Layout

화면은 세 영역으로 구성한다. 별도의 하단 status bar는 두지 않는다.

| 영역 | 역할 | v1 내용 |
| --- | --- | --- |
| Sidebar (좌) | 앱 수준 진입점 | 제품명, Open, 현재 열린 문서 항목. 접을 수 있다. Workspace tree는 두지 않는다. |
| Top bar (문서 상단) | 문서 정체성 + status/action | 좌: 현재 문서 위치(디렉터리 / 파일명). 우: save state 텍스트, Save 버튼. |
| Message slot (top bar 바로 아래) | 문서 단위 메시지 | error, conflict, notice. 없으면 높이 0. |
| Editor canvas (중앙) | 문서 본문 | 고정 폭 읽기 column. 좌측 gutter에 block handle. 문서 외 chrome 없음. |

- Top bar는 canvas와 함께 스크롤되지 않고 상단에 고정한다. Canvas 안에는 앱 버튼을 두지 않는다.
- Status와 action은 top bar 우측 한 곳에 모은다(“지금 문서 상태가 무엇이고, 무엇을 할 수 있는가”).
- Sidebar를 접으면 문서 column은 화면 중앙에 그대로 남는다.

## Writing interactions

모든 작성 interaction은 편집 위치 근처에 나타나고, 사라지면 문서만 남는다.

| Interaction | 위치 | 동작 |
| --- | --- | --- |
| Block handle `⠿` | 블록 좌측 gutter, hover/cursor 블록에만 표시 | Drag로 reorder(현재 동작 유지). Click하면 **block menu**를 연다. |
| Block 추가 `+` | handle 바로 왼쪽, 같은 조건으로 표시 | 현재 블록 아래에 삽입하는 **insert menu**를 연다. |
| Slash command `/` | 빈 paragraph 또는 paragraph 시작에서 입력 | caret 아래에 **insert menu**를 연다. `+`와 동일한 메뉴·항목·순서를 공유한다. |
| Selection toolbar | paragraph 안 text selection 위에 떠오름 | inline mark만(현재 Bold, Italic). 기존 고정 `format-bar`를 대체한다. 지원하지 않는 블록 selection에서는 나타나지 않는다. |
| Typed block 편집 | 해당 블록 내부(NodeView) | 블록을 클릭/선택하면 그 자리에서 편집 UI를 연다. 우측 inspector 패널은 두지 않는다. |

- **Insert menu**는 typed block 목록이다. Core가 생성·편집·저장을 모두 지원하는 타입만 노출하고, 지원 범위가 늘면 항목이 늘어난다(v1: Paragraph). 검색은 `/` 뒤 입력으로 필터한다.
- **Block menu**는 선택한 블록에 대한 동작만 담는다(v1: Delete. 타입 전환은 Core operation이 생기면 추가). Core operation으로 표현되지 않는 동작은 메뉴에 넣지 않는다.
- **Equation**: 블록 안에서 source 입력과 렌더 preview를 함께 보여주고, Apply/Cancel도 블록 안에 둔다. 미적용 draft 경고는 전역 notice가 아니라 해당 블록에 표시하고, Save는 disabled 상태 + 이유(tooltip)로 알린다.
- **Figure**: 블록은 이미지와 caption을 문서처럼 보여준다. 선택 시 블록에 붙은 작은 popover에서 속성(source, caption 등)을 다룬다. Figure 속성을 바꾸는 Core operation이 없으므로 v1 popover는 읽기 전용이다.
- Readonly/unsupported 블록은 handle은 보이되 편집 UI를 열지 않고, 편집 불가임을 블록 자체에 조용히 표시한다.

## Temporary UI migration

현재 `App.tsx`의 임시 UI는 다음 위치로 옮긴다. 동작(무엇을 여는지, 어떻게 저장하는지)은 이 문서에서 바꾸지 않는다.

| 현재 | 이동 방향 |
| --- | --- |
| 상단 `h1` IeumDoc + 파일 경로 텍스트 | 제품명 → sidebar 상단. 파일 경로 → top bar 좌측(디렉터리는 흐리게, 파일명은 강조, 전체 경로는 hover). |
| 파일 경로 입력창 (`file-picker` form) | 본문 영역에서 제거. Sidebar의 **Open** 진입점을 누르면 열리는 작은 dialog/popover 안으로 이동. 경로 직접 입력은 Workspace/파일 선택 방식이 정해질 때까지 임시로 유지한다. |
| Open 버튼 | 위 Open 진입점 안의 확인 버튼. 미저장 변경 안내도 같은 위치에서 보여준다. |
| Save 버튼 | Top bar 우측 고정. |
| `status` 텍스트 (Loading…, Saving…, Saved, …) | Top bar 우측 Save 옆의 조용한 save state 텍스트. 미저장 변경 여부도 여기서 보여준다. |
| `error` Notice (load/save 실패, conflict) | Top bar 아래 message slot. 해결 또는 닫기 전까지 유지한다. |
| `notice` (structural reject, 파일 전환 차단) | 같은 message slot, 자동으로 사라지는 짧은 메시지. |
| `equation-draft-notice` | 해당 Equation 블록 내부 표시 + Save disabled 이유로 이동. 전역 배너에서 제거. |
| 고정 `format-bar` (B / I) | Selection toolbar로 대체. |

## Wireframe

```
+------------------+---------------------------------------------------------------+
| IeumDoc      [<] |  docs / guide.md                        Unsaved changes [Save] |  <- top bar
|                  +---------------------------------------------------------------+
|  [ Open… ]       |  ! Document changed outside the editor. Reload before saving. |  <- message slot
|                  +---------------------------------------------------------------+
|  ● guide.md      |                                                               |
|                  |          # Getting started                                    |
|                  |                                                               |
|                  |   + ⠿    Paragraph text with a selected phrase here.          |
|                  |                                      +-------+                |
|                  |                                      | B | I |  <- selection  |
|                  |                                      +-------+     toolbar    |
|                  |          /                                                    |
|                  |          +----------------------+                             |
|                  |          | Paragraph            |  <- insert menu             |
|                  |          | Heading              |     (shared by + and /)     |
|                  |          | Equation             |                             |
|                  |          | Figure               |                             |
|                  |          +----------------------+                             |
|                  |                                                               |
|                  |          +--------------------------------------------+       |
|                  |          |  E = mc^2                  (rendered)      |       |
|                  |          |  [ E = mc^2              ] [Apply][Cancel] |       |  <- Equation
|                  |          |  Apply or Cancel before saving.            |       |     in-place
|                  |          +--------------------------------------------+       |
|                  |                                                               |
|   sidebar        |          <--------- document column --------->                |
+------------------+---------------------------------------------------------------+
```

## Non-goals

- Workspace 기능(파일 tree, 검색, 다중 문서, 최근 문서, 새 문서 생성 흐름).
- New/Open/Save의 실제 구현 방식, 파일 선택 방식, persistence/backend 구조.
- Pixel-perfect 레이아웃, 색상 팔레트, 아이콘, 애니메이션, dark mode.
- 새 design system 또는 UI framework 도입. 기존 `ui/primitives.tsx`와 `styles/tokens.css`를 사용한다.
- 우측 inspector/properties 패널, 댓글, 협업, AI UI.
- 새 block type이나 Core operation 정의. 메뉴는 Core가 지원하는 범위만 노출한다.
- ADR 추가 또는 기존 ADR 변경.
