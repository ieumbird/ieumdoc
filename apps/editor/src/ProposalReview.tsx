// SPIKE: an AI edit proposal reviewed inside the rendered document as track changes.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import { i18n } from "./i18n.ts";
import { Button } from "@/components/ui/button.tsx";
import { Notice } from "./ui/primitives.tsx";
import { DocumentPathContext, editorExtensions } from "./editor-schema.tsx";
import { toTiptapDocument } from "./tiptap-document.ts";
import { applyProposal, type AiProposal } from "./ai.ts";
import { acceptedHunks, diffText, type Decision, type ProposalHunk } from "./ai-review.ts";

const review = new PluginKey<DecorationSet>("aiReview");
const ReviewDecorations = Extension.create({
  name: "aiReview",
  addProseMirrorPlugins: () => [new Plugin<DecorationSet>({
    key: review,
    state: { init: () => DecorationSet.empty, apply: (tr, set) => tr.getMeta(review) ?? set.map(tr.mapping, tr.doc) },
    props: { decorations: state => review.getState(state) },
  })],
});

type Top = { node: ProseMirrorNode; pos: number; block: number };
const topLevel = (doc: ProseMirrorNode): Top[] => {
  const nodes: Top[] = [];
  doc.forEach((node, pos) => { const block = Number(node.attrs.sourcePath); if (Number.isInteger(block)) nodes.push({ node, pos, block }); });
  return nodes;
};
const textblocks = (node: ProseMirrorNode, start: number) => {
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  if (node.isTextblock) return [{ node, pos: start }];
  node.descendants((child, offset) => { if (child.isTextblock) { found.push({ node: child, pos: start + 1 + offset }); return false; } return true; });
  return found;
};
/** Inline text with one placeholder per inline atom, so every character is one document position. */
const inlineText = (node: ProseMirrorNode) => { let text = ""; node.forEach(child => { text += child.isText ? child.text : "\uFFFC"; }); return text; };
const shape = (node: ProseMirrorNode): string => JSON.stringify([node.type.name, { ...node.attrs, sourcePath: null },
  ...(node.isTextblock ? [] : (() => { const kids: string[] = []; node.forEach(child => kids.push(shape(child))); return kids; })())]);

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function decorations(proposed: Editor, original: Editor, hunks: readonly ProposalHunk[], decisions: Record<number, Decision>,
  decide: (id: number, decision: Decision) => void): DecorationSet {
  const doc = proposed.state.doc;
  const after = topLevel(doc), before = topLevel(original.state.doc);
  const list: Decoration[] = [];
  const clone = (top: Top, className: string) => () => {
    const wrapper = element("div", className);
    const dom = original.view.nodeDOM(top.pos);
    if (dom instanceof HTMLElement) {
      const copy = dom.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("[contenteditable]").forEach(node => node.removeAttribute("contenteditable"));
      wrapper.append(copy);
    }
    return wrapper;
  };
  for (const hunk of hunks) {
    const state = decisions[hunk.id] ?? "pending";
    const olds = before.filter(top => top.block >= hunk.old[0] && top.block < hunk.old[1]);
    const news = after.filter(top => top.block >= hunk.new[0] && top.block < hunk.new[1]);
    const anchor = news[0]?.pos ?? after.find(top => top.block >= hunk.new[1])?.pos ?? doc.content.size;
    const key = `${hunk.id}-${state}`;
    list.push(Decoration.widget(anchor, () => {
      const bar = element("div", "ai-hunk-bar");
      bar.dataset.state = state;
      bar.dataset.testid = "ai-hunk-bar";
      bar.contentEditable = "false";
      bar.append(element("span", "ai-hunk-reason", hunk.reason || i18n.t("Proposed change")));
      if (state !== "pending") bar.append(element("span", "ai-hunk-state", state === "accepted" ? i18n.t("Accepted") : i18n.t("Rejected")));
      const button = (label: string, value: Decision, className: string) => {
        const node = element("button", `ai-hunk-button ${className}`, label) as HTMLButtonElement;
        node.type = "button";
        node.dataset.testid = `ai-hunk-${className}`;
        node.addEventListener("mousedown", event => event.preventDefault());
        node.addEventListener("click", () => decide(hunk.id, value));
        return node;
      };
      if (state === "pending") bar.append(button(i18n.t("Reject"), "rejected", "reject"), button(i18n.t("Accept"), "accepted", "accept"));
      else bar.append(button(i18n.t("Undo"), "pending", "undo"));
      return bar;
    }, { side: -3, key: `bar-${key}`, ignoreSelection: true, stopEvent: () => true }));
    if (state === "rejected") {
      olds.forEach((top, index) => list.push(Decoration.widget(anchor, clone(top, "ai-block ai-block--kept"), { side: -2, key: `kept-${key}-${index}` })));
      news.forEach(top => list.push(Decoration.node(top.pos, top.pos + top.node.nodeSize, { class: "ai-block--hidden" })));
      continue;
    }
    if (state === "accepted") {
      news.forEach(top => list.push(Decoration.node(top.pos, top.pos + top.node.nodeSize, { class: "ai-block ai-block--accepted" })));
      continue;
    }
    const paired = Math.min(olds.length, news.length);
    olds.forEach((top, index) => {
      const partner = news[index];
      const inline = index < paired && shape(top.node) === shape(partner.node);
      if (!inline) list.push(Decoration.widget(anchor, clone(top, "ai-block ai-block--deleted"), { side: -2, key: `del-${key}-${index}` }));
    });
    news.forEach((top, index) => {
      const partner = olds[index];
      const inline = index < paired && shape(partner.node) === shape(top.node);
      list.push(Decoration.node(top.pos, top.pos + top.node.nodeSize, { class: inline ? "ai-block ai-block--changed" : "ai-block ai-block--inserted" }));
      if (!inline) {
        textblocks(top.node, top.pos).forEach(block => { if (block.node.content.size) list.push(Decoration.inline(block.pos + 1, block.pos + 1 + block.node.content.size, { class: "ai-ins" })); });
        return;
      }
      const oldBlocks = textblocks(partner.node, partner.pos), newBlocks = textblocks(top.node, top.pos);
      newBlocks.forEach((block, at) => {
        let offset = 0;
        diffText(inlineText(oldBlocks[at].node), inlineText(block.node)).forEach((piece, part) => {
          const from = block.pos + 1 + offset;
          if (piece.kind === "same") offset += piece.text.length;
          else if (piece.kind === "ins") { offset += piece.text.length; list.push(Decoration.inline(from, from + piece.text.length, { class: "ai-ins" })); }
          else list.push(Decoration.widget(from, () => element("del", "ai-del", piece.text.replace(/\uFFFC/g, "…")), { side: -1, key: `d-${key}-${at}-${part}`, marks: [] }));
        });
      });
    });
  }
  return DecorationSet.create(doc, list);
}

export function ProposalReview({ proposal, documentPath, onDone }: { proposal: AiProposal; documentPath: string; onDone(written: boolean): Promise<void> }) {
  useTranslation();
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const original = useEditor({ extensions: editorExtensions(undefined, documentPath), content: toTiptapDocument(proposal.original), editable: false, immediatelyRender: true });
  const proposed = useEditor({ extensions: [...editorExtensions(undefined, documentPath), ReviewDecorations], content: toTiptapDocument(proposal.proposed), editable: false, immediatelyRender: true });
  const decide = (id: number, decision: Decision) => setDecisions(all => ({ ...all, [id]: decision }));
  useEffect(() => {
    if (!proposed || !original) return;
    // Node views (math, figures) render after mount; clone the original blocks once they have.
    const frame = requestAnimationFrame(() => {
      if (proposed.isDestroyed || original.isDestroyed) return;
      proposed.view.dispatch(proposed.state.tr.setMeta(review, decorations(proposed, original, proposal.hunks, decisions, decide)));
    });
    return () => cancelAnimationFrame(frame);
  }, [proposed, original, decisions, proposal]);
  const counts = useMemo(() => {
    const values = proposal.hunks.map(hunk => decisions[hunk.id] ?? "pending");
    return { accepted: values.filter(value => value === "accepted").length, rejected: values.filter(value => value === "rejected").length,
      pending: values.filter(value => value === "pending").length };
  }, [decisions, proposal]);
  const all = (decision: Decision) => setDecisions(Object.fromEntries(proposal.hunks.map(hunk => [hunk.id, decision])));
  const finish = async (accepted: number[]) => {
    setApplying(true);
    setError("");
    try {
      const result = await applyProposal(proposal.id, accepted);
      await onDone(result.written);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setApplying(false);
    }
  };
  const accepted = acceptedHunks(proposal.hunks, decisions);
  return (
    <div className="ai-review" data-testid="ai-review">
      <div className="ai-review-bar" role="toolbar" aria-label={i18n.t("AI edit proposal")}>
        <div className="ai-review-summary">
          <strong>{i18n.t("AI edit proposal")}</strong>
          <span>{proposal.summary}</span>
          <span className="ai-review-counts" data-testid="ai-review-counts">{i18n.t("{{total}} changes · {{accepted}} accepted · {{rejected}} rejected · {{pending}} left",
            { total: proposal.hunks.length, ...counts })}</span>
        </div>
        <div className="ai-review-actions">
          <span className="ai-review-legend"><ins className="ai-ins">{i18n.t("Inserted")}</ins><del className="ai-del">{i18n.t("Deleted")}</del></span>
          <Button type="button" size="sm" variant="secondary" disabled={applying} onClick={() => all("rejected")} data-testid="ai-reject-all">{i18n.t("Reject all")}</Button>
          <Button type="button" size="sm" variant="secondary" disabled={applying} onClick={() => all("accepted")} data-testid="ai-accept-all">{i18n.t("Accept all")}</Button>
          <Button type="button" size="sm" disabled={applying || accepted === null} onClick={() => accepted && void finish(accepted)} data-testid="ai-apply"
            title={accepted === null ? i18n.t("Accept or reject every change first.") : undefined}>
            {accepted?.length === 0 ? i18n.t("Discard proposal") : i18n.t("Apply and save")}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={applying} onClick={() => void finish([])}>{i18n.t("Cancel")}</Button>
        </div>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <DocumentPathContext.Provider value={documentPath}>
        <article className="document ai-review-document" data-testid="ai-review-document"><EditorContent editor={proposed} /></article>
        <div className="ai-review-original" aria-hidden="true"><article className="document"><EditorContent editor={original} /></article></div>
      </DocumentPathContext.Provider>
    </div>
  );
}
