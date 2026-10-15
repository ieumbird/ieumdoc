import { createContext, useContext } from "react";

/** Presentation only. Hidden editors keep their state but suspend overlays and geometry. */
export const EditorVisibility = createContext(true);
export const useEditorVisible = () => useContext(EditorVisibility);
