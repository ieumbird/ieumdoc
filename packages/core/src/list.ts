import type { InlineContent } from "./inline.ts";

/** An editable bullet or numbered list. */
export type ListContent = {
  ordered: boolean;
  /** The first number of a numbered list; bullet lists have none. Defaults to 1 when inserting. */
  start?: number;
  items: ListItemContent[];
};

/** One list item: its inline text, optionally followed by one nested list. */
export type ListItemContent = {
  content: InlineContent[];
  list?: ListContent;
};
