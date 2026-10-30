import { useTranslation } from "react-i18next";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { isAdmonitionVariant } from "@ieumdoc/core";
import { i18n } from "../i18n.ts";
import { ADMONITION_LABELS, admonitionTone } from "../block-commands.ts";

export function AdmonitionView({ node, editor, getPos }: ReactNodeViewProps) {
  useTranslation();
  const variant = String(node.attrs.variant ?? "note");
  const label = isAdmonitionVariant(variant) ? ADMONITION_LABELS[variant] : variant;
  return (
    <NodeViewWrapper
      as="aside"
      className={`admonition admonition-${admonitionTone(variant)}`}
      data-block="admonition"
      data-variant={variant}
      data-source-path={String(node.attrs.sourcePath ?? "")}
    >
      <p className="admonition-label" contentEditable={false}>{label}</p>
      <NodeViewContent className="admonition-body" data-testid="admonition-body" data-empty-prompt={node.content.size === 0 ? i18n.t("Enter admonition text") : undefined} />
    </NodeViewWrapper>
  );
}
