import mermaid from "mermaid";

// Mermaid has process-global configuration. Initialize and render in the same queue slot,
// including after a failure, so other Figures/themes cannot change an in-flight request.
let queue: Promise<unknown> = Promise.resolve();
let sequence = 0;

export function renderMermaid(source: string, dark: boolean): Promise<string> {
  const render = async () => {
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
    document.body.append(container);
    try {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true,
        secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "suppressErrorRendering", "maxEdges", "theme", "themeVariables"],
        theme: dark ? "dark" : "default" });
      const { svg } = await mermaid.render(`litzio-mermaid-${++sequence}`, source, container);
      // Mermaid's sanitizer returns HTML serialization (e.g. <br> inside foreignObject).
      // Image SVG is XML: serialize the sanitized tree with namespaces and closed void tags.
      // Keep this parsed document detached from the live Editor DOM.
      const diagram = new DOMParser().parseFromString(svg, "text/html").querySelector("svg");
      if (!diagram) throw new Error("Rendered diagram contains no SVG");
      const xml = new XMLSerializer().serializeToString(diagram);
      // SVG is displayed in an image context, never inserted as executable Editor DOM.
      // Do not call bindFunctions: authored links/callbacks are not Editor interactions.
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      const image = new Image();
      image.src = url;
      try { await image.decode(); }
      catch (cause) { throw new Error(`Rendered SVG image could not be decoded: ${cause instanceof Error ? cause.message : String(cause)}`); }
      return url;
    } finally {
      container.remove();
    }
  };
  const result = queue.then(render);
  queue = result.catch(() => undefined);
  return result;
}
