import type { MystNode, ParsedDocument } from "./types.ts";

const docEl = document.querySelector("#doc");
const statusEl = document.querySelector("#status");
const saveEl = document.querySelector("#save");
if (!(docEl instanceof HTMLElement) || !(statusEl instanceof HTMLElement) || !(saveEl instanceof HTMLButtonElement)) {
  throw new Error("Editor markup is missing.");
}

let documentState: ParsedDocument | undefined;

function setStatus(message: string) {
  statusEl.textContent = message;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function phrasingToHtml(nodes: MystNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "text") return escapeHtml(node.value ?? "");
      if (node.type === "strong") return `<strong>${phrasingToHtml(node.children)}</strong>`;
      if (node.type === "emphasis") return `<em>${phrasingToHtml(node.children)}</em>`;
      return phrasingToHtml(node.children);
    })
    .join("");
}

function htmlToPhrasing(el: Element): MystNode[] {
  const nodes: MystNode[] = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      nodes.push({ type: "text", value: child.textContent ?? "" });
      continue;
    }
    if (!(child instanceof Element)) continue;
    const name = child.nodeName;
    if (name === "STRONG" || name === "B") {
      nodes.push({ type: "strong", children: htmlToPhrasing(child) });
    } else if (name === "EM" || name === "I") {
      nodes.push({ type: "emphasis", children: htmlToPhrasing(child) });
    } else {
      nodes.push(...htmlToPhrasing(child));
    }
  }
  return nodes;
}

function markDirty(el: Element) {
  el.setAttribute("data-dirty", "true");
}

function bindEditable(el: HTMLElement) {
  el.addEventListener("input", () => markDirty(el.closest("[data-block]") ?? el));
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
}

function renderBlock(node: MystNode, index: number): string {
  if (node.type === "heading") {
    const tag = node.depth === 1 ? "h1" : "h2";
    return `<${tag} data-block="${index}" contenteditable="true">${phrasingToHtml(node.children)}</${tag}>`;
  }
  if (node.type === "paragraph") {
    return `<p data-block="${index}" contenteditable="true">${phrasingToHtml(node.children)}</p>`;
  }
  if (node.type === "list") {
    const items = (node.children ?? [])
      .map((item) => {
        const paragraph = item.children?.[0];
        return `<li contenteditable="true">${phrasingToHtml(paragraph?.children)}</li>`;
      })
      .join("");
    return `<ul data-block="${index}">${items}</ul>`;
  }
  if (node.type === "mystDirective") {
    const admonition = node.children?.[0];
    const body = admonition?.children?.[0];
    return `<aside class="note" data-block="${index}"><div class="note-label">${escapeHtml(node.name ?? "note")}</div><p data-note-body contenteditable="true">${phrasingToHtml(body?.children)}</p></aside>`;
  }
  if (node.type === "math") {
    return `<div class="math" data-block="${index}"><div class="math-label">Math, read-only</div>${escapeHtml(node.value ?? "")}</div>`;
  }
  return `<p data-block="${index}" contenteditable="true">${escapeHtml(node.type)}</p>`;
}

function updateNodeFromElement(node: MystNode, el: Element) {
  if (node.type === "heading" || node.type === "paragraph") {
    node.children = htmlToPhrasing(el);
    return;
  }
  if (node.type === "list") {
    node.children = [...el.querySelectorAll(":scope > li")].map((item) => ({
      type: "listItem",
      spread: false,
      children: [{ type: "paragraph", children: htmlToPhrasing(item) }],
    }));
    return;
  }
  if (node.type === "mystDirective") {
    const body = el.querySelector("[data-note-body]");
    if (!(body instanceof HTMLElement)) return;
    const children = htmlToPhrasing(body);
    node.value = body.innerText;
    const admonition = node.children?.[0];
    if (admonition) {
      admonition.children = [{ type: "paragraph", children }];
    }
  }
}

async function loadDocument() {
  const response = await fetch("/api/document");
  if (!response.ok) throw new Error(`Failed to load sample.md (${response.status})`);
  documentState = (await response.json()) as ParsedDocument;
  docEl.innerHTML = (documentState.ast.children ?? [])
    .map((node, index) => renderBlock(node, index))
    .join("");
  docEl.querySelectorAll("[contenteditable]").forEach((el) => {
    if (el instanceof HTMLElement) bindEditable(el);
  });
  setStatus("Editing sample.md. Save writes output.md.");
}

async function saveDocument() {
  if (!documentState) return;
  const ast = structuredClone(documentState.ast);
  for (const el of docEl.querySelectorAll("[data-block][data-dirty]")) {
    const index = Number(el.getAttribute("data-block"));
    const node = ast.children?.[index];
    if (node) updateNodeFromElement(node, el);
  }
  const response = await fetch("/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ast }),
  });
  const payload = (await response.json()) as { markdown?: string; error?: string };
  if (!response.ok) {
    setStatus(payload.error ?? "Save failed.");
    return;
  }
  setStatus("Wrote output.md.");
}

saveEl.addEventListener("click", () => {
  void saveDocument().catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : String(error));
  });
});

void loadDocument().catch((error: unknown) => {
  setStatus(error instanceof Error ? error.message : String(error));
});
