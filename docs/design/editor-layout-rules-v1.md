# Editor Layout Rules v1

- Status: Draft
- Date: 2026-09-23
- Scope: `apps/editor`의 기존 shell, document canvas, block controls 및 control sizing.

## Purpose

이 문서는 새 UI나 디자인 시스템을 추가하지 않고, 현재 Editor 화면의 정렬축, 간격, control 치수를 일관되게 유지하기 위한 기준이다. 색상, 브랜드, 폰트 계열과 UX 구조는 유지한다.

## Alignment rules

- Sidebar의 icon slot은 16px로 고정하고, 아이콘과 라벨 사이에는 8px을 둔다. Sidebar의 header, action, current document는 같은 텍스트 시작선을 사용한다.
- Sidebar header와 TopBar는 기본 48px header row와 수직 중심을 공유한다. 좁은 화면에서 TopBar가 줄바꿈하면 `height: auto`로 확장할 수 있다.
- TopBar와 MessageArea는 같은 outer inline inset을 사용한다.
- Document column은 Sidebar를 제외한 가용 영역을 기준으로 가운데 정렬한다.
- Heading, paragraph, table, figure, equation의 outer start는 document content axis에 맞춘다. 블록 내부 padding과 equation의 수평 중앙 정렬은 유지한다.
- Block tool gutter는 compact control 폭, gutter gap, document padding으로 계산한다. controls는 absolute overlay이며 표시되거나 hover되어도 본문 x축을 이동시키지 않는다.

## Size and spacing rules

- 기존 spacing scale(`--space-*`)을 유지한다. 형제 간격은 가능한 한 부모 `gap`이 책임지고, 문서 block은 중복 margin/padding을 만들지 않는다.
- 일반 control은 32px, compact control은 28px, icon slot은 16px을 기준으로 한다.
- UI label은 14/20px, 보조 정보는 12/16px, 일반 본문은 16/24px을 사용한다.
- icon/label과 button 내부 간격은 8px, 동작 그룹 간격은 16px, 일반 block 간격은 16px이다.
- 소제목의 앞/뒤 간격은 24/12px, figure와 caption 사이 간격은 8px이다.
- shadcn `Button`/`Input`과 legacy `ui/primitives`는 같은 역할의 control에 같은 token 치수를 사용한다. 두 체계를 전면 교체하지 않는다.
- `min-height`만 맞추지 않고 실제 rendered height를 기준으로 검증한다.

## Application scope

현재 `apps/editor/src/styles.css`와 `styles/tokens.css`를 기준 구현으로 삼는다. Sidebar/TopBar/MessageArea, document block wrappers, block controls, selection toolbar, equation action controls, dialog controls에 위 규칙을 적용한다.

## Exceptions

- 1px border와 focus ring은 실제 경계와 접근 가능한 focus 표시를 위해 허용한다.
- Equation은 수식 가독성을 위해 내부 preview를 중앙 정렬하고, 편집 input/action은 블록 내부에 둔다.
- 긴 파일명은 layout을 깨지 않도록 ellipsis와 title을 사용한다.
- 좁은 화면에서는 header row가 콘텐츠에 맞춰 높이를 늘릴 수 있다. 이 경우에도 inline inset과 control height 기준은 유지한다.
- 모든 숫자를 별도 token으로 만들지는 않는다. 기존 shadcn의 내부 보정이나 광학 정렬처럼 역할과 이유가 명확한 1px 단위 값은 국소적으로 허용한다.

## Non-goals

- 색상, 브랜드, 폰트 계열 또는 UX 구조 변경
- Core, CLI, document semantics, serialization, save API 변경
- Tiptap state 구조 변경
- 수식 renderer 내부 스타일의 일괄 재정의
- 새 library, Storybook, theme engine 또는 범용 layout framework 추가
