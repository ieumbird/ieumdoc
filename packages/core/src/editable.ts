import { toText } from "myst-common";
import type { Document, DocumentNode, NodePath } from "./document.ts";

export type EditableCaption = {
  path: NodePath;
  text: string;
  editable: boolean;
};

export type EditableTableCell = {
  path: NodePath;
  text: string;
  header: boolean;
  editable: boolean;
};

export type EditableTableRow = {
  cells: EditableTableCell[];
};

export type EditableBlock =
  | {
      block: "heading";
      path: NodePath;
      level: number;
      text: string;
    }
  | {
      block: "paragraph";
      path: NodePath;
      text: string;
      editable: boolean;
    }
  | {
      block: "admonition";
      path: NodePath;
      variant: string;
      text: string;
    }
  | {
      block: "figure";
      path: NodePath;
      label: string;
      imageUrl: string;
      imageAlt: string;
      caption: EditableCaption;
    }
  | {
      block: "table";
      path: NodePath;
      rows: EditableTableRow[];
    }
  | {
      block: "equation";
      path: NodePath;
      latex: string;
      label: string;
    }
  | {
      block: "unsupported";
      path: NodePath;
      text: string;
    };

export type EditableDocument = {
  blocks: EditableBlock[];
};

export function getEditableDocument(document: Document): EditableDocument {
  const blocks = (document.children ?? []).map((node, index) => toBlock(node, [index]));
  return { blocks };
}

function toBlock(node: DocumentNode, path: NodePath): EditableBlock {
  if (node.type === "heading") {
    return {
      block: "heading",
      path,
      level: Number(node.depth ?? 1),
      text: toText(node),
    };
  }
  if (node.type === "paragraph") {
    return {
      block: "paragraph",
      path,
      text: paragraphText(node),
      editable: isTextOnly(node),
    };
  }
  if (node.type === "admonition") {
    return {
      block: "admonition",
      path,
      variant: typeof node.kind === "string" && node.kind.length > 0 ? node.kind : "note",
      text: toText(node),
    };
  }
  if (node.type === "container" && node.kind === "figure") {
    return figureBlock(node, path);
  }
  if (node.type === "math") {
    return {
      block: "equation",
      path,
      latex: typeof node.value === "string" ? node.value : "",
      label: nodeLabel(node),
    };
  }
  if (node.type === "table") {
    return tableBlock(node, path);
  }
  return {
    block: "unsupported",
    path,
    text: toText(node),
  };
}

function figureBlock(node: DocumentNode, path: NodePath): EditableBlock {
  const children = node.children ?? [];
  const imageIndex = children.findIndex((child) => child.type === "image");
  const captionIndex = children.findIndex((child) => child.type === "caption");
  const image = imageIndex >= 0 ? children[imageIndex] : undefined;
  const caption = captionIndex >= 0 ? children[captionIndex] : undefined;
  return {
    block: "figure",
    path,
    label: nodeLabel(node),
    imageUrl: typeof image?.url === "string" ? image.url : "",
    imageAlt: typeof image?.alt === "string" ? image.alt : "",
    caption: {
      path: captionIndex >= 0 ? [...path, captionIndex] : path,
      text: caption ? toText(caption) : "",
      editable: caption ? isTextOnly(caption) : false,
    },
  };
}

function tableBlock(node: DocumentNode, path: NodePath): EditableBlock {
  const rows = (node.children ?? []).map((row, rowIndex) => ({
    cells: (row.children ?? []).map((cell, cellIndex) => ({
      path: [...path, rowIndex, cellIndex] as NodePath,
      text: toText(cell),
      header: rowIndex === 0,
      editable: isTextOnly(cell),
    })),
  }));
  return {
    block: "table",
    path,
    rows,
  };
}

function paragraphText(node: DocumentNode): string {
  if (node.type === "text") {
    return typeof node.value === "string" ? node.value : "";
  }
  if (node.type === "link") {
    const inner = (node.children ?? []).map(paragraphText).join("");
    if (inner.length > 0) return inner;
    const url = typeof node.url === "string" ? node.url : "";
    return url.startsWith("#") ? url.slice(1) : url;
  }
  if (node.type === "crossReference") {
    return nodeLabel(node);
  }
  return (node.children ?? []).map(paragraphText).join("");
}

function isTextOnly(node: DocumentNode): boolean {
  if (node.type === "text") {
    return true;
  }
  const children = node.children ?? [];
  if (children.length === 0) {
    return false;
  }
  return children.every(
    (child) => child.type === "text" || (child.type === "paragraph" && isTextOnly(child)),
  );
}

function nodeLabel(node: DocumentNode): string {
  if (typeof node.label === "string" && node.label.length > 0) return node.label;
  if (typeof node.identifier === "string" && node.identifier.length > 0) return node.identifier;
  return "";
}
