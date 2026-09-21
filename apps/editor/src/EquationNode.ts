import { mergeAttributes, Node } from "@tiptap/core";

/**
 * The only non-prose node in this spike. It is an atomic, selectable block;
 * editing the LaTeX itself is intentionally outside the experiment.
 */
export const EquationNode = Node.create({
  name: "equation",
  group: "block",
  atom: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      latex: { default: "" },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-equation]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-equation": "true",
        contenteditable: "false",
        class: "equation-node",
      }),
      ["span", { class: "equation-node-kind" }, "Equation"],
      ["code", { class: "equation-node-latex" }, node.attrs.latex],
      ...(node.attrs.label ? [["span", { class: "equation-node-label" }, node.attrs.label]] : []),
    ];
  },
});
