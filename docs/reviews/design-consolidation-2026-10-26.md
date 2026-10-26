# Design consolidation: evidence and owner decisions

- Status: Historical
- Last verified: 2026-10-26; actual Windows Chrome computed-style audit and disposable same-state mockups on `48aabb312a0c8cb71c620747d5d25f370f2b7817`.
- Scope: review / proposal for [#507](https://github.com/ieumbird/ieumdoc/issues/507), following [Discussion #318](https://github.com/ieumbird/ieumdoc/discussions/318). No product behavior or current contract is adopted by this record.
- Authority: [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-single-document-editor-architecture.md), [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md), [Visual Language](../design/editor-visual-language-v1.md), [Layout Rules](../design/editor-layout-rules-v1.md), [UX Shell](../design/editor-ux-shell-v1.md), [Table interaction](../design/table-interaction-v1.md). Lifecycle follows [documentation governance](../contributing/documentation-governance.md).

## 소유자 검토 요약

현재의 조용한 종이 느낌, 사이드바·탭·개요 구조를 유지합니다. 새 디자인을 도입하기보다 공통 Button과 기존 토큰으로 크기·색·상태·메뉴 표현을 정리하는 제안입니다. 이 문서와 시안은 승인된 제품 계약이 아닙니다.

먼저 구분할 점이 있습니다. 그림의 편집 버튼은 이번 실제 hover 가능한 환경에서 평소 숨겨지고, 선택·hover 때 나타났습니다. 코드에는 hover가 없는 환경에서 계속 표시하는 규칙도 있습니다. 그림의 회색 hover 테두리와 파란 선택 테두리의 병존, 탭의 밑줄, 개요의 배경·세로 막대는 현재 계약에 들어 있습니다. 불편하다는 의견은 유효하지만, 모두 구현 오류로 분류해서는 안 됩니다.

반면 표 도구의 4px 반경과 별도 native button, 작은 코드 언어 입력칸, 글자 기호 핸들, 메뉴 사이의 아이콘·위험 동작 표현 차이는 통일 후보입니다. 우선순위는 공용 부품 적용 → 메뉴 표현 통일 → 승인한 선택 표시·표 도구·본문 크기 반영 → 작은 자동 검사 추가입니다.

권고안은 **A1(탭 세그먼트·목록 배경·블록 외곽선), B2(가벼운 hover/focus 핸들), C1(17px 유지), D2(통일된 메뉴)**입니다. D2의 복제·목록 변환은 의미 규칙이 정해진 뒤 별도 구현해야 합니다. 아래 같은 상태 시안을 보고 소유자가 네 항목을 결정합니다.

## Measurement protocol and limits

The audit uses the real Editor and real native Markdown files through its Vite Host, at **1440×900 and 390×844 in both English and Korean**. The checkout-owned server is `http://127.0.0.1:5307`; only `pnpm browser:test` and its existing persistent Chrome profile were used, with one runner at a time. Fonts/images settle before measurement; DPR and visual viewport scale are 1. The document is a synthetic Korean engineering review, not an engineering result. Its diagram is the existing local sample.

Measurements are `getComputedStyle` plus actual element bounds, including pseudo-element markers. Every encountered interactive element is collected, with names grouped only when the implementation/style/state family is identical. Height, radius, padding, font size/weight, icon kind, shared-Button use and state values are retained in the machine-readable inventory. Elements from hidden/inert document tabs and closed panels are excluded. Offscreen document controls can be measured; an opacity-zero Edit control is retained explicitly as hidden/inert at rest, not called a visible button.

Recovery-dialog styling uses a separate stored identity cloned from a real recorded dirty snapshot. This isolates the control review from an earlier session's clean acknowledgements; it is fixture setup, not a recovery-persistence regression assertion. Review/Copy/Delete-confirmation controls are real product components; no Restore/Delete is submitted. The actual no-document and disabled states are also visited.

`observed` is the real visited state; `hover`, `pressed` and `focus` additionally use Chrome CDP pseudo-state forcing on that same DOM element, without executing its command. These are CSS-state measurements, not proofs of keyboard navigation or action correctness. Selected/current, menu-open and disabled states come from actual application states, never injected attributes. A control with no observed disabled state has no such measurement; it must not be read as a disabled-state pass. Native select popup/checkmark rendering is OS-owned and is not a screenshot or pixel-level assertion here.

Installed headless Chrome reports `(hover: hover)` and `(any-hover: hover)` in this run; the untouched Figure rest measurement is opacity 0 / pointer-events none. The repository's existing `withBlockHover` helper temporarily removes only the actual product `(hover: none)` overrides, then restores them in `finally`. Those overrides are inactive for this run's reported capability, so the helper introduces no replacement display declarations or different visible desktop behavior. The 390px audit is a narrow responsive viewport with a hover-capable pointer, not a real touchscreen or Korean IME test. The no-hover fallback is source-confirmed separately and is not claimed as a real-device result.

The temporary collector and all in-page CSS/DOM mockup patches are removed before commit. Mockup action rows are inert illustrations: they neither register new shortcuts nor implement semantic operations. The [capture manifest](assets/design-consolidation-2026-10-26/manifest.json) fixes the base, environment, file hashes, option patches and comparison states. The raw [computed inventory](assets/design-consolidation-2026-10-26/inventory.json) preserves the measurement detail.

The completed collection contains **842 control/state-family observations, 212 surface visits and 384 distinct computed-style signatures**. Twelve PNGs total about 1.84 MiB, including the two full-page typography comparisons and two baseline viewport references. Only decision captures are retained; the audit does not commit a screenshot for every visited surface.

## Inventory and contract comparison

The controls and state tables below are read together with the computed inventory. **Match** means the measured expression agrees with the relevant current contract. **Contradiction** identifies an implementation/contract mismatch requiring a later correction. **Proposal** is a requested preference or consistency improvement that current contracts do not yet require. **Exception** is deliberate and has a reason. No contradiction is silently repaired in this review-only PR.

Heights/padding below are CSS pixels; font notation is size/weight. These rows group repeated controls, not a claim that every control is a shared Button. Full action names, locale/viewport cases and observed/hover/pressed/focus/disabled styles are retained in the inventory. Two-line results, wrapped paths and text-content affordances are deliberate variable-height contexts.

| Control family (all repeated actions in inventory) | Height; radius; padding | Font; icon | Shared Button? | Current contract / proposal mapping |
| --- | --- | --- | --- | --- |
| Sidebar Open/Collapse, folder New file/New folder/More/disclosure; Outline hide/toggle; File actions | 28; 6; 0 | 14/500; line SVG 16px | Yes, including Button rendered through menu trigger | Match B1; expanded-sidebar face exception above. |
| Files / Display tool | 28; 6; expanded `0 4`, collapsed rail `0` | 14/500; line SVG + label (rail: icon only) | Yes | Match; S1 owner decision. |
| Settings footer / compact labeled actions | 28; 6; `0 12` | 14/500; line SVG/text | Yes | Match B1. |
| Command trigger / Save | 32; 6; `0 12` | 14/500; search SVG/text | Yes | Match B1/C1; Save clean/dirty/disabled differ in face, not geometry. |
| Visual / Source inner segment | 24; 6; `0 12` | 14/500; text | Yes | Match explicit 28px-track exception, S1. |
| Document tab activation | 37 inside 40px row; 0; 8 | 14/400; text | No | Match specific tab geometry; exception to generic action geometry. Native action boundary needs explicit allowlist/migration under B1. |
| Document tab close | 28; 0; 0 | 14/400; line SVG | No | Specific tab slot matches; 0px control radius/native Button bypass differs from broad control rule. B1 exception or migrate without changing row layout. |
| File tree / Outline current and alternatives | 28; 6; `4 12` (Outline nested left 24) | 14/400; file line SVG / Outline text | No, treeitem/list primitive | Match S2; independent focus and out-of-flow marker. |
| Command-center action / file result | 36 / 56; 4; 8 | 14/400; line SVG | No, Base UI Combobox option | Specific result geometry; 4px radius differs from broad 6px rule. S2/M1; file result includes a second detail line. |
| Native Display checkboxes | 16; 0; 0 inside ≥28px label | 14/400; native | No | Match deliberate native exception; checked/accent/focus remain native. |
| Settings/Display/New location select | 32; 6; `0 40 0 12` | 14/400; encoded line-chevron | No, native select | Match P1; source literal exception in color table. |
| Standard New/property/link/math/citation inputs | 32; 6; `4 12` | 14/400; text field | No, shared Input | Match P1; native field is not a missing Button. |
| Figure Choose / Cancel / Apply; table/section/Equation actions | 28; 6; `0 12` | 14/500; text | Yes | Match P1/B1; primary vs outlined face retains state. |
| Figure / Equation Edit access | 28; 6; `0 12` | 14/500; text | Yes | Match: hidden at hover-capable rest, visible on hover/selection/focus. |
| Equation LaTeX textarea | 80 minimum; 6; 12 | 14/400; monospace field | No, textarea | Match multiline exception P1. |
| Gutter insert / block handle (including endnote action handle) | 28×28; 6; 0 | 14/700; text glyph `+` / `⠿` | Yes (nominal icon size overridden by gutter tokens) | Current contract matches dimensions; line-icon replacement is B1 proposal. Endnote has no `+` and is not draggable. |
| Table row / column targets | 28; 4; 0; width follows row/column geometry | 12/400; row numbers / A/B/C | No, native button | 4px radius and native-action bypass contradict broad control rule. B1/S4; target labels remain data text. |
| Table Append row/column, caption edit, actions, delete | 28×28; 4; 0 | 12/400; line SVG 16px | No, native button | Same contradiction B1; existing table behavior retained. |
| Custom block / insert / slash / table menu rows | 28 minimum; 6; `4 12` | 14/400; plain text or line SVG + optional hint | No, `CommandMenu` row primitive | Match specific menu geometry; metadata/icon/danger parity proposal M1. |
| File/folder Base UI menu row | 28; 6; `0 8` | 14/400; line SVG + text | No, `DropdownMenuItem` | Match primitive; different padding/highlight needs M1 decision. |
| Selection-formatting buttons | 28×28; 6; 0 | 14/700; B/I glyphs, other line SVGs | Yes | Match size/state; B/I line-icon replacement is proposal B1. |
| Folder/image picker path input | 20 inner line box, 0 radius/padding, inside 32px/6px wrapper | 14/400; shared wrapper's line SVG | No, native combobox input | Match wrapper-field exception P1; do not flag inner 20px line box as a new control height. |
| Picker breadcrumb | 28 (may wrap); 4; 4 | 14/400, current 600; text | No, native button | 4px radius/native action deviation B1/S2; preserve location semantics. |
| Picker folder/place/recent/image option | 32 minimum; 6; `4 12` | 14/400; line SVG | No, list option primitive | Match S2; selected marker and keyboard ring. |
| Picker Up/New folder/Cancel/Open; Figure Choose | Picker 28 / Figure Choose 32; 6; icon 0 / text `0 12` | 14/500; line SVG/text | Yes | Match existing compact vs field-adjacent standard role, B1/P1. |
| Dialog close / work-loss / recovery / preview / shortcut actions | 28; 6; icon 0 / text `0 12` | 14/500; line SVG/text | Yes | Match P1/B1; real destructive confirmation and real disabled states measured. |
| Start Open folder / recent folder | Compact shared action or ≥32px list row; 6; text `0 12` / row `4 8` | 14/500 action, 14/400 list; line SVG | Action yes; recent list no | Match start/list exceptions; translated text may wrap. |
| Code language | 16; 0; 0 | 12/400; field | No, native input | Contradicts standard recognizable-field geometry. P1/B1; no new language parser. |
| Add a title / 문서 제목 추가 | 45.89; 4; 0 | 34/700; document text | No, native button | Deliberate document-typography exception; do not shrink to generic action dimensions. |
| Section-label edit text | 16; 4; `0 4` | 12/400; monospace text | No, native button | Metadata/content-sized exception needs explicit allowlist; property form already matches P1. |
| Reference/citation edit icon | 18; 4; 2 | inherited 17/400; line SVG 12px | No, native button | Small hit area/radius/native-action deviation B1; zero line box is intentionally isolated from UI line-height. |
| Citation key remove | 16; 4; 2 | 14/400; line SVG | No, native button | B1 explicit inline exception/enlargement decision; preserve chip layout. |
| Reference/citation role/target selects | 32; 6; `0 8` | 14/400; native field | No | Geometry matches P1; horizontal padding and native-arrow format differ from `form-select`: consolidation proposal, not a second selector engine. |
| Inline math / reference chip / document link | About 20px body inline box; radius 4 / 4 / 0; math `0 2`, others 0 | 17/400; rendered math/text | No, document-content interaction | Deliberate content-sized exception S3; content notation does not become a 32px button. |
| Endnote reference / return number | 15px superscript / 24px definition box; 4 / 0; 0 | 12.75/400 / 16/400; text | No, content backlink | Match document typography exception. |
| Recovery text copy | 128 minimum; 4px radius; 8px padding | 14/400; text | No, textarea; Copy action uses Button | Multiline exception P1; native text selection remains available. |

State evidence includes neutral hover/open/pressed faces, selected/pressed attributes, actual disabled menu restrictions and no-document actions, primary hover, opaque 2px keyboard rings and inline/block selected outlines. A transient `:active` alone generally adds no new style to shared Button; persistent formatting/table/open states are driven by ARIA/application state instead. This distinction is preserved in the inventory. Base UI's hidden 1px focus/form bookkeeping input is retained in raw data but excluded from the human control inventory; it is not a visible authoring target.

### Selected / current indicators

| Context | Current expression and contract judgment | Proposed rule / decision |
| --- | --- | --- |
| Sidebar Files / Display | Selected text + 3px horizontal blue marker; no persistent face/border; neutral face on hover. Match. A hovered Display is not a third persistent selection state. | S1; owner A. |
| Document tabs | 3px inset horizontal blue marker, dark text; independent neutral hover and keyboard focus. Match; tab row is a navigation container, not a 32px action button. | S1; owner A. |
| Files current / Outline current | Selected surface + selected text + 3px left marker, selected-hover surface, inset keyboard ring. Match; redundancy is explicitly current policy. | S2; owner A. |
| Visual / Source | 28px track containing 24px raised white segment, structural edge/shadow, dark current text. Match; 24px segment is an explicit Layout exception, not an accidental undersized compact button. | S1; retain outer 28px target or revise the exception only with approval. |
| Outline TopBar toggle | Selected surface/icon color when on; no marker or boundary. Match; boolean toggle differs from a current navigation location. | S1 toggle variant. |
| Table current cell | 2px inset blue cell outline; matching row and column handles use pressed neutral faces/boundaries. Match with Table interaction; caret is still the engine caret. No spreadsheet formula bar was found. | S4; owner B, preserve target clarity. |
| Figure / Equation selected or editing | 1px blue outline with 4px offset; element radius 4px and painted outer radius 9px. Neutral hover extent can coexist at a different rectangle. Match after #469, not an unexplained duplicate-border defect. | S3; owner A; avoid adding a third selected cue. |
| Command center highlight | Blue-tinted background only, 4px radius; different from custom command-menu active choice. Match with the specific command-center contract; unification is a proposal. | S2; retain Base UI Combobox navigation and IME behavior. |
| `+` / slash active choice | Selected surface/text + inset 3px marker; independent 2px keyboard ring. Match with current list/menu rules. | M1/S2, retain non-color keyboard cue until owner approval. |
| File/folder Base UI menus | Neutral highlighted row rather than the custom command menu's blue active expression; 28px row, inset focus. Specific primitive behavior matches; cross-menu parity is a proposal. | M1; share visual row metrics, preserve menu focus ownership. |
| Inline math / cross-reference / citation | Inline math uses muted face + blue ring when selected/hovered; selected reference uses light blue face + 1px blue ring; complete references/citations use content-link blue. Contextual exceptions for inline document content, not navigation. | S3 inline exception; preserve content vs interaction meaning. |

### Menus, popovers and forms

| Surface | Actual format / states / authority judgment | Mapping |
| --- | --- | --- |
| Block `⠿` menu | Same `CommandMenu` component as `+`, but plain labels, grouped conversions and neutral Delete. Paragraph has H2–H6 conversion + Delete on this base; H1 is reserved for the title (#472). No duplicate/move/list conversion entries. Shared surface matches; command metadata differs. Explicit danger rows are a proposal: the current contract reserves red for danger but does not explicitly require every Delete row to be red. | M1, D2; reuse the existing component and metadata, not a new menu engine. |
| `+` insert menu | Line SVG icon, label, optional Markdown-input hint in a key chip, group separators. No citation/endnote because these are inline insertions rather than block insertions. Match; omission is a scope choice. | M1; retain these hints as Markdown input syntax, not pretend action shortcuts. |
| Slash menu | Same row/surface, controlled current item while focus stays in the editor; inline insertion/reference choices are context-dependent. Match. | M1/S2; do not move focus out of the editor. |
| File actions | Base UI portal menu; Reload and Copy path have line icons, no shortcut column or separators needed for two actions. Match. Export/history buttons are separate feature requests, not missing layout compliance. | M1; empty shortcut column need not be painted. |
| Folder menu | Close folder only, Base UI row and line icon. Match with ADR-0009 amendment; do not add another Open folder. | M1. |
| Table row / column / whole-table actions | Portaled `PopoverContent` wrapper with zero padding/edge/shadow and inner `CommandMenu`; plain labels, real disabled restrictions; table menu offers caption/label and Delete table. Delete is neutral. Geometry/action scope matches; danger-row unification is a proposal. | M1/S4; preserve fixed header, last-column guard and explicit target. |
| Selection toolbar | Compact shared Buttons; Bold/Italic are B/I text glyphs, remaining actions line SVGs including Sigma/Bookmark; neutral pressed formatting face with border; accessible names/tooltips exist. Match to current contract, with a line-icon proposal. | B1/M1; plain formatting toggles remain a toolbar, not a menu. |
| Figure / Equation / Table / section-label properties | Shared white bordered/shadowed property surface; labeled 32px fields, compact Cancel/Apply; Equation textarea is intentionally multi-line. Match. Figure Choose opens the existing bounded image picker. | P1; keep explicit Apply/Cancel and draft/history preservation. |
| Inline math / reference / citation / link forms | Existing selection-toolbar surface; 32px input/select fields and 28px actions; contextual Remove and citation-key removal controls. Match for ordinary form geometry; tiny inline edit/remove affordances need explicit exceptions or enlargement. | P1/B1 exceptions; preserve selected text, anchors, labels and native transactions. |
| Folder / New file / New folder / Settings / preview / work-loss / recovery confirmation / shortcuts | Existing shared dialogs and field/action primitives; phone footer wrapping/scrolling, native select with custom field/chevron, 12px dialog radius rather than button radius. Match; dialog radius is a surface role. Breadcrumbs remain separate native buttons. | P1/B1. No app-settings relocation is authorized by #507. |

### #318 claim recheck

| Claim in the 2026-10-26 section | Recheck on this base | Contract judgment / disposition |
| --- | --- | --- |
| Files/Display stacks marker, text and permanent gray face | Marker/text confirmed; rest face is transparent. Hover adds neutral gray. | Persistent third layer not reproduced; current contract permits hover. A changes taste. |
| Figure Edit always visible | Untouched hover-capable rest: opacity 0, pointer-events none; hover/selection: visible. No-hover fallback is source-confirmed. | Desktop claim contradicted by this run; current conditional behavior matches contract. |
| Figure double border | Neutral hover extent plus blue selection can coexist; #469 aligns painted corner radii, not rectangles. | Reproduced, matches current contract. A is an owner decision. |
| Block menu H1–H6 and Delete, no icons/duplicate/move | H2–H6 + Delete for body paragraph after #472. H1 no longer offered there. Missing icons/extra actions confirmed. | H1 claim stale. Icon/danger unification and extra operations are proposals, not pre-existing menu requirements. |
| Code language looks like faint free text | Small borderless 12px text field with no persistent field boundary; name exists in accessibility tree. | Contradicts recognizable-field / standard-field geometry; B1/P1. No copy/autocomplete feature is implied. |
| Settings scattered; no About in web | Display is document semantics/local width, Settings is app preference/recovery, Outline is navigation; About/update requires Desktop bridge. | Matches current ownership/Host scope. Subtitle mentioning app information is a wording candidate, not a new settings architecture. |
| TopBar 32 / 24 / 28 / 32 / 28 heights | Reproduced; 24px view segment lives in its explicit 28px track. | Match including documented exception; arbitrary new heights remain undesirable. |
| Save/status separated | Status has a separate fixed cell to avoid horizontal control movement; Save takes blue only when dirty. | Match; preserve 0px status-triggered control movement. |
| File actions only two; no Undo/Redo/export | Two file actions confirmed; Undo/Redo and shortcuts are now available through command center. Export is absent. | Earlier observation partly stale; no new feature scope. |
| Phone sidebar has no scrim; Outline has no shadow | Sidebar is full-screen, no exposed backdrop by design; Outline overlay has `--shadow-overlay`. | Sidebar matches; missing Outline shadow not reproduced. |
| Korean mixed with Figure/Equation/technical reasons | UI language and document reference templates are separate. Default reference style still uses Figure; Core/Host exact technical reasons remain literal by policy. | Not by itself a localization defect. Any untranslated UI label must be evaluated separately from content notation. |
| Table A/B/C, numbers, gray tools and multiple cues | Confirmed in interaction, hidden at hover-capable rest; touch fallback retains tools. | Handle/cell rules match; 4px radius/native implementation are consolidation deviations. B is taste. |
| `+`/`⠿` bold gray text glyphs | Confirmed; these use shared Button with CSS size overrides, unlike the native table tools. B/I are additional text glyph icon affordances. | Current implementation, line-icon proposal B1. |
| Folder path button semibold / 4px | Confirmed for current breadcrumb; ordinary breadcrumb regular. | Contradicts the broad 6px control rule; preserve current-location meaning while sharing geometry. |
| Empty sidebar lacks Open button / empty Outline | Single Open folder remains in sidebar header and start; no duplicate empty-panel action by current contract. | Matches deliberate entry placement. Empty-outline policy is not redesigned here. |
| Collapse sidebar always gray | Reproduced while expanded, including pointer-away rest: `aria-expanded=true` activates the generic neutral pressed face (`#e3e7ee`). | Expanded/pressed primitive behavior is consistent, but the header's quiet rest policy has no specific sidebar exception. Proposal B1: explicitly decide/record this exception or remove the persistent face; do not misreport it as hover only. |
| Display native OS controls | Checkbox is native by contract, inside a ≥28px label target; select is a styled 32px field with custom line chevron. | Checkbox deliberate exception; unstyled-dropdown claim stale. |
| Source long lines clipped | This base includes #476 soft wrapping. | Claim stale against current contract; no Source patch proposed. |

### Rendered color inventory and sources

The observed UI states do **not** reproduce an interaction `rgb(47,111,237)` / `#2f6fed`. Figure/Equation outlines, table cell, navigation markers, primary actions and keyboard focus resolve to `rgb(49,95,212)` / `#315fd4`. Derived hover/text/tint values are one palette, not independent interaction roles. Default `outline-color` on `outline-style:none`, zero-width borders and transparent/zero-spread ring bookkeeping are not visible extra colors.

| Computed color / paint | Token or literal source | Meaning / judgment |
| --- | --- | --- |
| `#315fd4` / `rgb(49,95,212)` | `tokens.css`: `--id-color-interaction`; `accent`, `border-focus` aliases; `index.css` primary/ring adapters | Actual interaction boundary/face/current marker; matches one-role contract. |
| `#2449a6` / `rgb(36,73,166)` | `--id-color-text-selected`, `--id-color-accent-hover` | Selected text and primary hover, not a second unrelated blue. |
| `#e9f0ff`, `#e1eaff` | `--id-color-surface-selected`, `-selected-hover`; `interaction-soft` alias | Selected and selected-hover tints; text selection/drag share this role. |
| `#365f85` | `--id-color-info` | Links/references and informational syntax/callout meaning; intentional content blue exception. |
| `#ffffff`, `#f6f7f9`, `#eef0f4`, `#eceef2` | `surface`, `surface-subtle`, `surface-muted`, `canvas` | Paper/field, panels, muted UI/code, canvas. |
| `#eaedf2`, `#e3e7ee` | `surface-hover`, `surface-pressed` | Neutral hover and expanded/pressed faces; collapse-sidebar rest is explained above. |
| `#20242c`, `#545c68`, `#606874` | `text`, `text-muted`, `text-subtle` | Main, secondary and metadata text; UI glyphs inherit these. |
| `#d9dde4`, `#e7eaf0`, `#bbc2cd`, `#7b8390` | `border`, `border-subtle`, `border-strong`, `border-control` | Structural/paper/hover/field boundaries. |
| `#a12b32`, `#fff1f0` | `danger`, `surface-danger` | Real destructive recovery confirmation and its hover; error meaning; also code numeric-token presentation. |
| `#875717`, `#fff8ed` | `warning`, `surface-warning` | Warning callout and draft guidance; not selection. |
| `#f5f7fa` | `surface-info` | Informational notice/callout surface. |
| `rgb(32 36 44 / 10%)`, `/6%`, `/8%` | `--shadow-overlay`, `--shadow-paper`, `--shadow-segment` | Literal alpha shadows in `tokens.css`, shared surface roles. |
| Black at 10%, translucent muted footer | `dialog.tsx` `bg-black/10`, `bg-muted/50` | Composited dialog backdrop/footer, not an extra status or interaction palette. |
| Encoded `#545c68` | `styles.css` `.form-select` SVG data URL, `stroke='%23545c68'` | Duplicates `text-muted` as a literal; C1 guard exception or field-icon cleanup candidate. |
| Black/transparent mask and `#0000` ring reset | `styles.css` overflow mask / `--tw-ring-shadow` reset; `index.css` base `outline-ring/50` | Rendering mechanics; a computed half-opacity outline with style `none` is not a painted focus ring. Keep real focus opaque. |

Sources: [product tokens](../../apps/editor/src/styles/tokens.css), [Tailwind adapters](../../apps/editor/src/index.css), [consumer styles](../../apps/editor/src/styles.css), [UI primitives](../../apps/editor/src/components/ui/button.tsx). The external SVG diagram has its own blue/green/tan content colors; they are document artwork, not UI primitives. KaTeX internals and syntax content retain their distinct ownership. No token values are changed by this review.

## Proposed shared rules

These rules are **proposals**, pending the owner decisions. Color and geometry reuse existing tokens; adoption would update current contracts in the later implementation PR.

| ID | Primitive / rule | Existing implementation to reuse |
| --- | --- | --- |
| B1 | Standard action/input 32px; compact action 28px; one 6px control radius; 14/20px UI text; 16px line SVG icons. Use 12px inline padding for text buttons, center icon-only controls. Never derive UI metrics from body typography. | `components/ui/button.tsx`, `input.tsx`; `--size-control`, `--size-control-compact`, `--id-radius-md`, `--size-icon-slot`, UI typography/spacing tokens. Replace native action buttons incrementally; retain engine event/ref handling. |
| S1 | One tab-group pattern for Sidebar tools, document tabs and Visual/Source; distinguish boolean toggles using a neutral/selected face. Focus remains an independent 2px ring. A decides the visual pattern. | Existing Button states, view track, document-tabs, `--shadow-segment`. Document tab row and labels can retain their current layout height. |
| S2 | One current-list pattern for Files, Outline, command results and menu choices; one owner-approved current cue plus independent keyboard focus. Keep ARIA current/selected/highlight semantics and active-hover distinction. | `.sidebar-tree-item`, `.document-outline-item`, `.command-center-result`, `.command-menu-item`; selected/hover/interaction tokens. |
| S3 | One block-selection expression for Figure, Equation and table block selection; separate optional neutral hover extent. Inline atoms remain an explicit content-sized exception. | Existing NodeSelection, block hover overlay and selection outlines; no change to Tiptap document state. |
| S4 | Current table cell has one inset blue boundary. Row/column targets are supporting navigation handles with neutral rest; do not add another blue active palette. B decides discoverability and density. | `TableTools`, `TableCellFocus`, existing table commands / target handling. |
| M1 | One menu row format: optional 16px line-icon slot, label, optional trailing shortcut/hint, grouping separators, danger-colored destructive action. 28px minimum row; allow wrapping when needed. Keep shortcut text accurate and omit absent shortcuts. | Existing `CommandMenu`, `command-icons`, `DropdownMenuItem` and separators; shared row tokens/metadata. Preserve Base UI menu ownership and slash-menu editor focus rather than replacing either engine. |
| C1 | One interaction-blue role (`#315fd4`) with existing derived hover/selected tints; existing neutral scale and info/warning/danger roles. Content-link blue stays a separate meaning. No one-off UI hex/RGB literals. | `tokens.css` → one-way `index.css` adapters; `accent` aliases interaction. Do not turn content links, warnings or diagram art into interaction blue. |
| P1 | One existing property/dialog surface family; white controls, readable label, 32px field, 28px explicit action, neutral border and shared overlay shadow. Retain meaningful surface radii, multiline editor fields and viewport bounds. | `PopoverContent`, `DialogContent`, `Input`, `Button`, `BlockProperties`, existing inline forms. No new overlay framework. |

### Deviation map and deliberate exceptions

| Finding | Proposed remedy | Exception / reason |
| --- | --- | --- |
| Native table action/append/row/column buttons, 4px radius, repeated literal 28px | B1/S4, use Button or shared token-backed table-handle variant while preserving explicit targets/refs. | Column handle width follows its column; row/column labels are data, not pictogram icons. Address labels may retain 12px metadata type in the same 28px target; ordinary action labels follow B1's 14px type. |
| Breadcrumb native button, 4px radius / semibold current path | B1/S2, shared geometry with existing location semantics. | Breadcrumb may wrap and exceed 28px in height; do not truncate actionable paths. |
| Code language borderless 16px line box | P1, existing compact/standard field treatment; reuse current language update path. | Code body remains monospace; language field stays UI font. Autocomplete/copy is a separate feature. |
| Gutter `+`/`⠿`, toolbar B/I text glyph icons | B1, existing lucide Plus/GripVertical/Bold/Italic or equivalent pinned line icons. | Literal row numbers, column letters, labels and shortcut keys remain text. |
| Inline reference edit / citation remove tiny controls | B1, enlarge actionable hit area without changing inline line height; document and test any retained exception. | An invisible enlarged hit area must not cover neighboring text; a line-height-preserving exception may be safer. |
| Section-label / title-slot / endnote-number text interactions | Keep as explicitly listed content/metadata affordances; P1 applies to their editing form. | A title slot is document typography; an endnote backlink is text, not a toolbar button. Do not force them to 14px/32px. |
| Neutral Delete rows in block/table menus | M1/C1, existing `--id-color-danger`; destructive hover surface only for destructive rows. | Table deletion remains immediate and undoable under its current contract; red styling does not introduce confirmation. |
| Custom vs Base UI menu row padding/radius/current treatment | M1/S2; reuse shared metrics and metadata, retain each interaction owner. | Command center results contain two text lines and may be taller than 28px. |
| Multiple current styles across tabs/lists/block/cell | S1–S4, owner A/B; consolidate per context rather than impose one shape on every semantic type. | Existing multiple cues are currently contractual; approve/update contracts before removal. |
| Native checkbox 16px | Keep native checkbox with interaction accent and ≥28px associated label target. | Deliberate accessibility/platform exception; no custom checkbox engine. |
| 24px view segment within 28px track | Retain explicit exception or enlarge together if A chooses a common segment system. | Do not silently flag the current documented 24px inner segment as a regression. |
| 4px content radii, 8px popover / 12px dialog / 6px paper radius | Keep surface/content roles. B1 means **control radius**, not one radius for every rectangle. | Geometry and elevation express surface hierarchy; paper look stays intact. |
| Encoded select-chevron neutral color literal | C1: tiny documented literal exception tied to `text-muted`, or reuse an existing line-icon wrapper during field consolidation. | Masks' black/transparent and shadow alpha are rendering mechanisms, not extra interaction colors; diagram art is document content. |

### Minimal guard proposal

Extend the existing [visual-tokens test](../../apps/editor/test/visual-tokens.test.ts), which currently checks unique/acyclic definitions and adapters but does not scan consumers. Add a narrow consumer check for new literal UI colors/control sizes outside tokens, and native action `<button>` uses outside an explicit, reasoned allowlist. Use the existing TypeScript tooling if syntax-aware JSX inspection is necessary; do not write a new JSX parser. Existing exceptions are named by source and role, not a blanket allowance for every file. The shared primitive internals, menu rows, text-content affordances, native checkbox, view inner segment, content masks and encoded chevron need explicit handling. A new allowlist entry must explain its public behavior.

Extend the existing `layout-rules` browser scenario with a small computed-style assertion over the real controls its existing navigation already exposes: 32/28px token geometry, 6px control radius, UI font isolation, and token-resolved selected/focus colors. Reuse `visual-states` for independent hover/current/focus and `quiet-document` for hidden-at-rest tools/zero content movement. Measure actual disabled and selected states rather than only inspecting CSS. Assert that required controls exist; never substitute zero for a missing element. Check both locales and desktop/phone widths in one serial persistent session. Screenshots remain manual decision evidence; do not add exhaustive snapshot dumps or a parallel browser runner.

Protection should demonstrably fail for three mutations: a 30px table action, a new literal interaction blue, and a newly introduced native action button outside the allowlist. These are unique guard values; Core/CLI do not need duplicate UI-size tests. The guard itself is a follow-up after approval, not code silently added by this review.

## Four owner decisions

Sizes below are implementation estimates, not measured effort. **Small** means existing Editor styles/metadata and targeted checks; **medium** means component/event/geometry changes; **large** includes new Core semantics, thin CLI surface and preservation tests. No option changes paper color, sidebar/tab/outline layout ownership or the single-editor architecture.

### A — selected / current expression

All three use the same selected Figure, two tabs, Files tool/current file and current Outline state at 1440×900. The pointer is away. Only appearance patches differ.

| Option | Capture | Pros / cons | Size and contract/test risk |
| --- | --- | --- | --- |
| **A1 — segmented tabs, background list, block outline (recommended)** | [A1](assets/design-consolidation-2026-10-26/a-segmented.png) | Clear group boundaries and familiar view choice; quieter list current. Retains precise figure boundary. Adds some neutral tab faces. | Small–medium. Updates explicit marker policies for Sidebar/document tabs and lists; retain independent focus and 0px geometry. Update visual-states/layout checks deliberately. |
| A2 — marker only | [A2](assets/design-consolidation-2026-10-26/a-marker.png) | Most paper remains white; sparse, consistent markers. List/figure association is less obvious, especially for wide/tall blocks; relies heavily on color and the marker shape. | Small CSS, medium accessibility risk. Replaces current fill/selected-outline contract; current/hover/focus and block boundaries need renewed review. |
| A3 — background only | [A3](assets/design-consolidation-2026-10-26/a-background.png) | Simple and coherent for navigation. Tint over a whole figure can feel like content emphasis and has a weaker non-color cue. | Small CSS, medium contrast/meaning risk. Removes contractual markers and selected outline; requires explicit approval and accessible current/focus validation. |

Recommendation: A1 preserves the strongest distinction between navigation and selected document content while reducing stacked current cues. Approving it does not authorize changing keyboard selection, opening properties on selection or hiding Edit access.

### B — table editing tools

Same table, same current cell, same scroll at 1440×900. Current tools are already conditional on hover/focus/selection; the alternative changes their visual weight/discovery, not the Markdown table.

| Option | Capture | Pros / cons | Size and contract/test risk |
| --- | --- | --- | --- |
| B1 — current A/B/C and row numbers | [B1](assets/design-consolidation-2026-10-26/b-current.png) | Explicit row/column addressing and familiar access. Spreadsheet-like chrome competes with a document. | Small for B1 button/radius cleanup; preserves interaction contract and targeting tests. |
| **B2 — light hover/focus handles (recommended)** | [B2](assets/design-consolidation-2026-10-26/b-handles.png) | Reduces visual weight while preserving per-row/per-column entry points. Less self-explanatory; labels/tooltips and touch-visible fallback remain necessary. | Medium. Preserve 28px hit targets, portal anchoring, explicit targets, header/last-column restrictions and engine caret/history. Test keyboard discovery and horizontal-scroll geometry. |
| B3 — minimal table toolbar | [B3](assets/design-consolidation-2026-10-26/b-toolbar.png) | Clean, one place for table actions. A row/column action now needs a clearly explained caret/target model; append is less direct. | Medium–large Editor interaction change. Current contract requires row/column handles. Must decide accessibility, menu targets and offscreen-column behavior before implementation; no cell-merging/formula feature is implied. |

Recommendation: B2, keeping existing target geometry and touch affordances. The mock toolbar's row/column buttons are inert layout placeholders and do not demonstrate a completed interaction model.

### C — Korean body size

Both captures show the **complete same Korean technical document at 1440px width** (full-page PNG; browser viewport 1440×900), scroll top, blurred focus and pointer away. Heading sizes, column width, paragraph gaps, captions, tables and UI remain unchanged; only `--font-size-document` differs. Current line-height multiplier stays 1.7, so body line-height is 28.9px / 27.2px.

| Option | Capture | Pros / cons | Size and contract/test risk |
| --- | --- | --- | --- |
| **C1 — 17px current (recommended)** | [17px full page](assets/design-consolidation-2026-10-26/c-17.png) | Current readable rhythm and existing approval; fewer words per screen. Korean technical prose remains comfortable. | No product change. Maintain the current 17/28.9px contract. |
| C2 — 16px | [16px full page](assets/design-consolidation-2026-10-26/c-16.png) | Denser technical reading, shorter paragraphs/page. Smaller Korean glyphs; H1/body contrast increases because headings are unchanged. | Small token change. Update body contract/layout expectations and inspect wrapping, inline math and scroll geometry; UI font-isolation must remain unchanged. No semantic/CLI operation. |

Recommendation: retain 17px until the owner prefers the denser full-page comparison. Do not shrink the shell or table text as a side effect.

### D — block menu content and format

Both captures use the same first body paragraph and menu anchor, with first-row focus, at 1440×900. D2 is a visual content proposal; added commands are not live implementations.

| Option | Capture | Pros / cons | Size and contract/test risk |
| --- | --- | --- | --- |
| D1 — current menu | [D1](assets/design-consolidation-2026-10-26/d-current.png) | Short and already implemented. Less recognizable than insert menu; no direct duplicate/move/list conversion; Delete lacks danger styling. | No behavior change; the proposed menu consistency improvement would remain pending. |
| **D2 — unified icon/label groups, convert, duplicate, move, red Delete (recommended direction)** | [D2](assets/design-consolidation-2026-10-26/d-unified.png) | Consistent scanning, visible destructive meaning and discoverable actions. Longer menu and more semantic edge cases. Show unavailable/current actions truthfully; do not invent shortcuts. | Small for row/icon/danger format; medium for existing move commands; large for general duplicate/list conversion. Update menu/geometry contracts and action-specific preservation/Undo tests after semantics are decided. |

Recommendation: approve D2's format first, implement existing safe actions in a later scoped PR, then add duplicate/list conversion only after their Core policies are specified. The illustration uses a generic line-icon slot to compare format; final action-specific icons should reuse the pinned lucide set. No shortcut is shown for actions without a verified context-specific binding.

#### Semantic ownership of proposed menu actions

| Action | Existing Core / CLI evidence | Required follow-up |
| --- | --- | --- |
| Paragraph ↔ heading; heading level | `convertBlock` and `updateHeadingLevel`; CLI `convert-block --path … --to paragraph` or `--to heading --level …`. `convertBlock` handles only supported top-level paragraph/heading content and rejects loss; title restrictions apply. | Reuse semantics. Do not offer body H1 after #472 or strip labels/inline structure. Preserve editor-native one-step history through its existing adapter. |
| Paragraph ↔ bullet/numbered list | Core has `insertList` / `updateList`; CLI `insert-list` / `update-list`. These are not a general text-block conversion operation; `convertBlock` does not accept list. | Specify preservation of marks, inline atoms, heading labels/title, nesting and empty content. Express new major conversion in Core with a thin CLI command/extension; implement one editor transaction. |
| Duplicate block | No general `duplicateBlock` export or `duplicate-block` CLI command on this base. Typed insert operations exist; that does not define copying a labeled figure/equation/section or its references. | Define allowed blocks, fresh labels/identity, references/endnotes, title and draft restrictions. Add Core operation + thin CLI surface for a major general duplicate action; no Editor-only AST clone. A limited text-only first scope must be explicit. |
| Move up / down | Core `moveBlock`, CLI `move-block --from … --to …`; Core/CLI also have section move. Editor already has reorder support. | Reuse operation intent and editor history bridge. Decide block vs whole-section semantics; enforce title/endnote/draft and boundary restrictions. A disabled move at a boundary is not an absent action. |
| Delete | Core `removeBlock`, CLI `remove-block --at …`; section removal is separate. Existing Editor block/table Delete paths and warning/Undo behavior. | Reuse; red menu styling only. Preserve table notice/Undo, referenced-target warnings, label consequences and native one-step history. Do not add a new confirmation policy. |

Sources: [Core exports](../../packages/core/src/index.ts), [Core operations](../../packages/core/src/operations.ts), [CLI command surface](../../packages/cli/src/cli.ts), [Editor block commands](../../apps/editor/src/block-commands.ts), [reordering](../../apps/editor/src/block-reorder.ts). Cursor/focus/tool display has no CLI parity requirement; semantic duplication/conversion does.

## Verification and delivery boundary

Only this Historical review, its evidence assets and the central index are committed. Product source, existing tests and Implemented contracts remain byte-for-byte at the capture base. Temporary browser collector/fixtures and mockup styles are not feature implementations. `pnpm docs:check` and `git diff --check` are the documentation-only required local checks; browser collection additionally provides the requested live evidence. Required CI runs on the final PR head. No merge, issue closure, rebase or force push is performed.

Final complete `design-consolidation-507` and `design-consolidation-507-extra` collection runs passed serially, as did both documentation-only checks. The temporary collector files were removed and product/current-contract diffs checked empty. The task-owned server tree (root PID 10992, Vite PID 22116) was stopped; port 5307 has no listener and the runner's exact checkout profile `a36b33237f3e19ea` has no remaining browser process. Earlier collector-setup attempts are excluded from the final inventory; this is a visual audit, not an assertion that every existing behavioral regression suite was rerun.

The inventory is a bounded Web/Vite review of the existing surfaces and states described above. Native Desktop update/install controls, operating-system popup pixels and real-device/IME behavior are outside this host's evidence; no Desktop or OS claim follows from a browser field measurement. Future adopted changes must retain the applicable current contracts until explicitly updated and verified.
