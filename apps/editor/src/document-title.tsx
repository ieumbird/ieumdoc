import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { useTranslation } from "react-i18next";

/** Plain metadata input; the shared ProseMirror document owns its value and history. */
export function DocumentTitle({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const title = useEditorState({ editor, selector: ({ editor }) => editor.state.doc.attrs.title as string | null });
  const boundary = () => editor.view.dispatch(closeHistory(editor.state.tr));
  return <textarea className="document-title-input" data-document-title="true" rows={1}
    aria-label={t("Title")} placeholder={t("Add a title (optional)")} value={title ?? ""}
    readOnly={!editor.isEditable} spellCheck={false}
    onFocus={boundary} onBlur={boundary}
    onChange={event => editor.view.dispatch(editor.state.tr.setDocAttribute("title", event.target.value.replace(/[\r\n\v\f\u0085\u2028\u2029]+/gu, " ")))}
    onKeyDown={event => {
      if (!editor.isEditable || event.nativeEvent.isComposing) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          if (key === "y" || event.shiftKey) editor.commands.redo();
          else editor.commands.undo();
          return;
        }
      }
      if (event.key === "Enter") {
        event.preventDefault();
        boundary();
        const selection = TextSelection.findFrom(editor.state.doc.resolve(0), 1, true);
        if (selection) editor.view.dispatch(editor.state.tr.setSelection(selection));
        editor.view.focus();
      }
    }} />;
}
