declare module "katex" {
  export type KatexOptions = {
    displayMode?: boolean;
    throwOnError?: boolean;
    trust?: boolean;
  };

  const katex: {
    renderToString(expression: string, options?: KatexOptions): string;
  };

  export default katex;
}
