/** An editable fenced code block. */
export type CodeBlockContent = {
  /** The fence info language, such as "python"; empty means none. */
  language: string;
  /** The literal code between the fences. */
  code: string;
};
