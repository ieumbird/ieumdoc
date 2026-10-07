# VS Code Host spike v1

- Date: 2026-10-07
- Baseline: `6b37465` (master). Spike code: branch `spike/vscode-custom-editor`, `spikes/vscode-host/`.
- Environment: VS Code 1.140.0, Windows 11, isolated reused profile (`spikes/vscode-host/.run/`).
- Question: VS Code 확장을 IeumDoc의 주 배포 Host로 삼을 때, IeumDoc의 저장 세션 모델이 VS Code 문서 모델과 맞물리는가. Markdown formatter/linter가 IeumDoc canonical 출력을 간섭하는가.
- Status: 판정 입력. 배포 Host 결정이나 ADR이 아니다.

## Result

- **실행 가능성: 높음.** 변경하지 않은 Editor bundle(`vite build --base ./`)이 webview에서 동작한다. `fetch` shim이 `/api/*` 호출을 `postMessage`로 바꾸고, extension host가 기존 Host 함수(`commitDocumentSave`, `saveDocumentFile`, `loadDocumentFile`, `previewDocumentFile`, `applyBlockSource`, `validateFigureRequest`)를 그대로 호출한다. Core와 저장 계약은 수정하지 않았다.
- **Provider 판정: `CustomEditorProvider`(IeumDoc이 문서를 소유)가 맞고, `CustomTextEditorProvider`(VS Code TextDocument가 buffer)는 IeumDoc 저장 모델과 충돌한다.** 아래 표는 같은 시나리오를 두 provider로 깨끗한 상태에서 실행한 결과다(CRLF fixture, Prettier식 format-on-save).

| Scenario | CustomTextEditor | CustomEditor |
| --- | --- | --- |
| B. IeumDoc에서 편집, 저장 전 | VS Code 탭이 dirty가 아님 | 탭 dirty 표시 |
| C. IeumDoc Save | 저장 후 format-on-save가 실행되어 디스크가 canonical과 다름(`*x*`→`_x_`), CRLF 유지 | 디스크 = IeumDoc canonical. formatter 미실행. CRLF가 LF로 바뀜 |
| D. 두 번째 Save (Ctrl+S) | **항상 Save conflict.** 디스크가 IeumDoc revision과 다름 | 정상 저장 |
| E. webview에서 Ctrl+Z | Tiptap Undo와 함께 **VS Code가 TextDocument도 Undo**(직전 IeumDoc 저장을 buffer에서 되돌림) | Tiptap Undo만 실행 |
| G. 미저장 상태로 탭 닫기 | **확인 없이 닫히고 편집 유실** | Save / Don't Save / Cancel 확인 |
| F. 같은 파일을 텍스트 편집기와 함께 열기 | 실시간 반영 없음. IeumDoc Save는 409로 거부되는데 같은 Ctrl+S로 VS Code가 텍스트 편집 내용을 저장 | 모델이 둘. IeumDoc Save가 디스크에 쓰고, 텍스트 편집기 저장은 VS Code가 "file is newer" 충돌로 막고 Compare/Overwrite 제시 |

## Findings

### 1. CustomTextEditorProvider는 IeumDoc 세션 모델과 소유권이 겹친다

- Dirty, Undo, Save, 최종 바이트를 VS Code TextDocument가 소유한다. IeumDoc은 opening snapshot, savedEdits replay, revision 검사로 같은 것을 소유한다.
- IeumDoc 편집은 Save 전까지 TextDocument에 없으므로 VS Code가 모르고(B), 닫을 때 보호되지 않는다(G).
- Save 결과가 TextDocument의 EOL 정규화(CRLF 문서는 LF canonical 출력을 CRLF로 저장)와 save participant(format-on-save)를 거친다. 디스크가 canonical과 달라져 다음 Save가 revision 검사에서 거부된다(D). 원인은 조건을 나눠 분리했다: LF + Markdown All in One(내용 변경 없음)은 충돌 없음, CRLF + formatter 해제는 충돌, LF + Prettier식 formatter는 충돌.
- webview의 Ctrl+Z가 VS Code `undo`로도 전달되어 TextDocument의 직전 편집을 되돌린다(E). 사용자는 보지 못한 상태로 buffer가 이전 내용이 된다.
- 해결하려면 IeumDoc 편집을 매번 TextDocument에 반영해야 한다. Core 저장 경로 측정(편집 한 개): 683자/13블록 약 11ms, 41KB/781블록 약 338ms. 입력마다 반영하기에는 긴 문서에서 느리고, 편집 중간의 비정상 상태(예: 빈 문단)는 canonical write가 거부한다. Undo 소유권 충돌도 남는다.

### 2. CustomEditorProvider는 현재 Host 경계와 같은 모양이다

- Host가 파일을 직접 읽고 쓰므로 `filesystem-host-boundary-v1.md`의 현재 계약(원본 `.md`를 Host가 읽고 같은 파일에 canonical write, revision 충돌 검사)이 그대로 유지된다.
- format-on-save가 실행되지 않는다. TextDocument save participant를 거치지 않기 때문이다. 사용자가 같은 파일을 텍스트로 열어 저장하면 formatter는 그때만 적용되고, IeumDoc은 다음 Save에서 외부 변경으로 감지한다.
- VS Code가 dirty 표시와 닫기 확인을 제공한다(B, G). 이 spike는 dirty를 `CustomDocumentContentChangeEvent`로 알렸으므로 IeumDoc에서 Undo로 저장 상태로 돌아가도 탭의 dirty가 지워지지 않는다. `CustomDocumentEditEvent`(undo/redo callback)로 VS Code undo stack과 Tiptap history를 연결하는 방식은 확인하지 않았다.
- 같은 파일의 텍스트 편집기와는 모델이 분리된다(F). 데이터는 양쪽 충돌 검사로 보호되지만 실시간 반영은 없다.

### 3. Host와 무관한 발견: CRLF 파일은 첫 IeumDoc 저장에서 LF로 바뀐다

- CustomEditor와 현재 dev server 모두 Core canonical 출력(LF)을 그대로 쓴다. CRLF로 checkout된 Windows 작업 사본에서는 첫 저장이 모든 줄을 바꾼다. Git `core.autocrlf` 설정에 따라 commit diff에는 나타나지 않을 수 있다. EOL을 canonical 계약에 포함할지는 별도 결정이다.

### 4. Markdown 확장과의 공존

- `priority: "option"`으로 등록하면 기본 텍스트 편집기와 README 등의 열기 동작이 바뀌지 않는다. IeumDoc은 "Reopen Editor With…" 또는 명령으로 연다.
- Markdown All in One의 표 formatter는 IeumDoc canonical 표와 이미 같은 형식이라 변경이 없었다. Prettier식 규칙(예: 강조 `_x_`)은 canonical과 다르므로, 텍스트로 저장하면 다음 IeumDoc Save가 외부 변경으로 거부된다. 이는 Host와 무관하게 같은 `.md`를 다른 도구가 쓰는 경우의 계약이다.

## Product work identified (not done)

- Host 호출 경계: `App.tsx`의 fetch 7개, `image-assets.ts` 2개, media URL(`editor-schema.tsx`의 `/document/…`)을 Host client 하나로 모은다. webview media는 `asWebviewUri`와 문서 directory의 `localResourceRoots`가 필요하다. 이 spike에서 Figure 이미지는 표시되지 않았다.
- 저장 진입점 하나: VS Code에서는 Save가 VS Code save(`saveCustomDocument`)를 거쳐야 탭 상태가 맞는다. 현재 Editor는 Ctrl+S를 직접 처리하므로 VS Code의 Ctrl+S와 두 번 실행된다. spike는 status line 관찰과 버튼 클릭으로 연결했고 product protocol이 아니다.
- Revert: webview를 다시 렌더링해 새 세션으로 연다. `location.reload()`는 빈 webview가 되었다.
- VS Code 안에서 불필요한 shell: Open, Open folder, New와 folder sidebar는 VS Code Explorer와 겹친다. editor group을 둘로 나눈 좁은 폭에서는 sidebar가 본문 폭을 차지해 제목이 한 글자씩 줄바꿈되었다.
- Hot exit backup(`backupCustomDocument`), Save As, 여러 editor가 같은 문서를 여는 경우는 확인하지 않았다.

## Reproduce

```bash
cd spikes/vscode-host
node build.mjs
SPIKE_PROVIDER=custom SPIKE_EOL=crlf SPIKE_FORMATTER=emphasis node drive.mjs
SPIKE_PROVIDER=text   SPIKE_EOL=crlf SPIKE_FORMATTER=emphasis node drive.mjs
```

`drive.mjs`는 설치된 VS Code를 전용 프로필(`.run/user-data`, 재사용)로 한 번 실행하고, 실행 전에 이전 실행의 editor 복원 상태를 지운다. Markdown All in One은 사용자 설치본을 `.run/extensions`로 복사해야 한다(`SPIKE_FORMATTER`를 생략하면 사용). 결과는 `.run/results-*.json`, 이벤트는 `.run/events-*.jsonl`에 남는다.
