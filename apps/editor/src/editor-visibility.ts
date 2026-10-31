import { createContext, useContext } from "react";

/** Presentation only. Hidden editors keep their state but suspend overlays and geometry. */
export const EditorVisibility = createContext(true);
export const useEditorVisible = () => useContext(EditorVisibility);

/** Reading keeps document previews active while suspending retained authoring forms. */
export const EditorAuthoring = createContext(true);
export const useEditorAuthoring = () => {
  const visible = useEditorVisible();
  return useContext(EditorAuthoring) && visible;
};
