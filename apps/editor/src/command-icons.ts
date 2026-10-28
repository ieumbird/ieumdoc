import {
  Workflow,
  Asterisk,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  ArrowDownFromLine,
  BookmarkPlus,
  Columns3,
  Eraser,
  Rows3,
  Pencil,
  Trash2,
  BookOpen,
  Bookmark,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Image,
  Info,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Sigma,
  Table,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

const INSERT_ICONS: Record<string, LucideIcon> = {
  paragraph: Pilcrow,
  "heading-1": Heading1,
  "heading-2": Heading2,
  "heading-3": Heading3,
  "heading-4": Heading4,
  "heading-5": Heading5,
  "heading-6": Heading6,
  "bulleted-list": List,
  "numbered-list": ListOrdered,
  note: Info,
  warning: TriangleAlert,
  quote: Quote,
  divider: Minus,
  "code-block": Code,
  equation: Sigma,
  figure: Image,
  drawio: Workflow,
  table: Table,
  endnote: Asterisk,
};

/** The icon the insert menu shows for an insert command or a reference item. */
export function insertCommandIcon(id: string): LucideIcon | undefined {
  return id.startsWith("reference:") ? Bookmark : id === "citation" || id.startsWith("citation:") ? BookOpen : INSERT_ICONS[id];
}

const BLOCK_ICONS: Record<string, LucideIcon> = {
  "move-up": ArrowUp, "move-down": ArrowDown,
  "table-row": Rows3, "table-column": Columns3,
  "table-row-up": ArrowUp, "table-row-down": ArrowDown,
  "table-column-left": ArrowLeft, "table-column-right": ArrowRight,
  "table-align-left": AlignLeft, "table-align-center": AlignCenter,
  "table-align-right": AlignRight, "table-align-none": Eraser,
  "section-label": BookmarkPlus, "section-up": ArrowUpFromLine, "section-down": ArrowDownFromLine,
  properties: Pencil,
};

/** Action metadata shared by the block and explicit-target table menus. */
export function blockCommandAppearance(id: string): { icon: LucideIcon | undefined; danger: boolean } {
  const danger = id === "delete" || id.endsWith("-delete");
  const kind = id.replace(/^heading-level-/, "heading-").replace(/^admonition-/, "");
  const admonitionIcon = ["danger", "error", "attention", "caution"].includes(kind) ? TriangleAlert
    : ["tip", "hint", "important", "seealso"].includes(kind) ? Info : undefined;
  return { icon: danger ? Trash2 : BLOCK_ICONS[id] ?? insertCommandIcon(kind) ?? admonitionIcon, danger };
}
