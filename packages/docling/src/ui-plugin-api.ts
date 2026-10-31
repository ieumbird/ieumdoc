// Branch-only UI Host API 1. Type-only contract: no Editor modules, DOM or engine types.
import type * as React from "react";
import type * as JSXRuntime from "react/jsx-runtime";
import type { ComparisonSnapshot, ReadingSurfaceProps } from "./compare.ts";

export type UiHost = {
  apiVersion: 1;
  React: typeof React;
  jsxRuntime: typeof JSXRuntime;
  ReadingSurface: React.ComponentType<ReadingSurfaceProps>;
  Button: React.ComponentType<{ children?: React.ReactNode; onClick(): void; disabled?: boolean }>;
  text(key: string): string;
  mediaUrl(path: string, uri: string): string;
  chooseComparison(): void;
};
export type UiContribution = {
  commands: { id: string; label: string; keywords: string[]; run(): void }[];
  tab: { kind: "docling-comparison"; View: React.ComponentType<{ snapshot: ComparisonSnapshot }> };
};
