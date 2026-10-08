import {
  Asterisk,
  Code,
  Hash,
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
  table: Table,
  footnote: Asterisk,
};

/** The icon the insert menu shows for an insert command or a reference item. */
export function insertCommandIcon(id: string): LucideIcon | undefined {
  return id.startsWith("reference:") ? Hash : INSERT_ICONS[id];
}
