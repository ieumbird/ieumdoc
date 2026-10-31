import type { ComponentProps } from "react";
import { MetadataProperties } from "./metadata-properties.tsx";

/** Figure metadata anchors to the complete image/diagram and caption. */
export function FigureProperties(props: Omit<ComponentProps<typeof MetadataProperties>, "target">) {
  return <MetadataProperties {...props} target={() => props.anchor.current?.closest("figure") ?? null} />;
}
