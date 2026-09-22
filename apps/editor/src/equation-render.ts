import katex from "katex";

export type EquationRenderResult =
  | { html: string; error?: undefined }
  | { html?: undefined; error: string };

export function renderEquation(latex: string): EquationRenderResult {
  try {
    return {
      html: katex.renderToString(latex, {
        displayMode: true,
        throwOnError: true,
        trust: false,
      }),
    };
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : "KaTeX could not render this equation.",
    };
  }
}
