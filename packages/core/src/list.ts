import type { InlineContent } from "./inline.ts";

export const LIST_STYLES = ["decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"] as const;
export type ListStyle = typeof LIST_STYLES[number];
export type ListDelimiter = "." | ")";

/** An editable bullet or numbered list. */
export type ListContent = {
  ordered: boolean;
  /** The first number of a numbered list; bullet lists have none. Defaults to 1 when inserting. */
  start?: number;
  /** Ordered marker style (default decimal); unavailable on bullet lists. */
  style?: ListStyle;
  /** Ordered marker delimiter (default .); unavailable on bullet lists. */
  delimiter?: ListDelimiter;
  items: ListItemContent[];
};

/** One list item: its inline text, optionally followed by one nested list. */
export type ListItemContent = {
  content: InlineContent[];
  list?: ListContent;
};
