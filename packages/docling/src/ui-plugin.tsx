import type { UiHost, UiContributions } from "@litzio/plugin-api/ui";
import { DoclingCompareView } from "./CompareView.tsx";
import type { ComparisonSnapshot } from "./compare.ts";

export function activate(host: UiHost): UiContributions {
  const comparison = (returnFocus: HTMLElement | null) => host.pickFolder({
    title: host.text("Docling comparison"),
    description: host.text("Choose a conversion folder containing document.md and document.docling-map.json."),
    open: folder => host.openTab("comparison", folder),
  }, returnFocus);
  return {
    commands: [{ id: "convert", label: "Convert with Docling", keywords: ["PDF", "Docling", "도클링", "변환"], run: host.showPdfConversion }],
    sidebar: [{ id: "comparison", label: "Docling comparison", run: comparison }],
    tabs: [{ id: "comparison", label: "Docling comparison", className: "docling-tab",
      open: async folder => {
        const path = folder.replace(/[\\/]+$/, "") + (folder.includes("\\") ? "\\" : "/") + "document.md";
        const snapshot = await host.readJson<ComparisonSnapshot>("api/docling-compare", { path });
        return { path: snapshot.path, data: snapshot };
      },
      View: ({ data }: { data: ComparisonSnapshot }) => <DoclingCompareView snapshot={data} ReadingSurface={host.ReadingSurface}
        Button={host.Button} text={host.text} imageUrl={uri => host.imageUrl(data.path, uri)} />,
      notices: (snapshot: ComparisonSnapshot) => snapshot.stale ? [{ id: "stale", severity: "warning",
        message: `${snapshot.map.source.name}: ${host.text("The correspondence map does not match this document. Connections and sync scrolling are disabled. Reconvert to compare.")}` }] : [],
    }],
    dispose() {}, // CompareView releases observers/frames in React's unmount cleanup.
  };
}
