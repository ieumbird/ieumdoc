import { DoclingCompareView } from "./CompareView.tsx";
import type { UiContribution, UiHost } from "./ui-plugin-api.ts";

/** Instantiated on registration, with the renderer's React and only explicit UI capabilities. */
export function activate(host: UiHost): UiContribution {
  if (host.apiVersion !== 1) throw new Error("Docling UI requires Host API 1.");
  return {
    commands: [{ id: "docling-compare", label: "Docling comparison", keywords: ["Docling", "도클링", "대조"], run: host.chooseComparison }],
    tab: { kind: "docling-comparison", View: ({ snapshot }) => <DoclingCompareView snapshot={snapshot}
      ReadingSurface={host.ReadingSurface} Button={host.Button} text={host.text}
      imageUrl={uri => host.mediaUrl(snapshot.path, uri)} /> },
  };
}
