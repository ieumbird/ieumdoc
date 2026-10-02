/**
 * External clipboard HTML (web pages, Notion, Word) rewritten into the HTML the editor's own
 * parse rules read, before ProseMirror parses it. Only structure IeumDoc already supports is
 * produced, and Core still validates it on Save. Presentation noise (wrappers, classes, data
 * attributes, layout styles) is dropped silently; lost visible formatting is reported in a
 * notice; structure that cannot be represented rejects the whole paste.
 */
export type ExternalHTML = { html: string; notice?: string; error?: string };

const BLOCKS = "address,article,aside,blockquote,dd,details,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,ul";
const REJECTED: [selector: string, reason: string][] = [
  ["iframe,frame,object,embed,applet,video,audio", "embedded media and objects are not supported"],
  ["input,select,textarea", "form controls and task lists are not supported"],
  ["math", "math formulas cannot be converted"],
  ["dl,details", "definition lists and collapsible sections are not supported"],
];
const NOTICES = {
  styles: "unsupported visual styles were removed",
  scripts: "superscript and subscript became plain text",
  images: "images were not pasted (paste a PNG file to add a Figure)",
  links: "unsupported links became plain text",
  header: "table headers now use the first row only",
  caption: "table captions became paragraphs",
};
type Notice = keyof typeof NOTICES;
/** Attributes the editor's parse rules read; everything else is presentation or vendor data. */
const KEEP: Record<string, string[]> = {
  A: ["href", "title"], OL: ["start"], PRE: ["language"], BLOCKQUOTE: ["data-quote"],
  DIV: ["data-divider", "data-table-block"], TH: ["data-table-cell", "align"], TD: ["data-table-cell", "align"],
};

class Rejected extends Error {}

export function normalizeExternalHTML(html: string): ExternalHTML {
  const document = new DOMParser().parseFromString(html, "text/html");
  const body = document.body;
  const notices = new Set<Notice>();
  try {
    for (const [selector, reason] of REJECTED) if (body.querySelector(selector)) throw new Rejected(reason);
    visualFormatting(body, notices);
    body.querySelectorAll("script,style,template,noscript").forEach(element => element.remove());
    const images = body.querySelectorAll("img,picture,svg,canvas");
    if (images.length) notices.add("images");
    images.forEach(element => element.remove());
    for (const link of body.querySelectorAll("a")) {
      if (link.querySelector(BLOCKS)) throw new Rejected("a link cannot contain paragraphs or other blocks");
    }
    wordLists(body);
    // Blank paragraphs are spacing, not content. Blank lines inside code are code.
    for (const block of [...body.querySelectorAll("p,div,blockquote,h1,h2,h3,h4,h5,h6")].reverse()) {
      if (!block.textContent?.trim() && !block.querySelector("hr,pre,table") && !block.closest("pre")) block.remove();
    }
    if (!body.textContent?.trim() && !body.querySelector("hr")) {
      throw new Rejected(notices.has("images") ? "images can be added only as PNG files" : "the clipboard holds no supported content");
    }
    lists(body);
    for (const heading of body.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
      if (!inlineOnly(heading) || lineBreaks(heading)) throw new Rejected("a heading holds one line of inline content");
    }
    for (const quote of body.querySelectorAll("blockquote")) {
      if (!inlineOnly(quote)) throw new Rejected("a quote holds one paragraph");
      const paragraph = document.createElement("p");
      paragraph.append(...quote.childNodes);
      quote.replaceChildren(paragraph);
      quote.setAttribute("data-quote", "");
    }
    for (const table of body.querySelectorAll("table")) tableBlock(table, notices);
    for (const pre of body.querySelectorAll("pre")) codeBlock(pre);
    for (const rule of body.querySelectorAll("hr")) {
      const divider = document.createElement("div");
      divider.setAttribute("data-divider", "");
      rule.replaceWith(divider);
    }
    for (const link of body.querySelectorAll("a")) {
      const href = link.getAttribute("href")?.trim() ?? "";
      // Only ordinary links: a relative or fragment target is kept as written, never as a cross-reference.
      const ordinary = href && !/\s/.test(href) && (!/^[a-z][a-z0-9+.-]*:/i.test(href) || /^(https?|mailto|tel|ftp):/i.test(href));
      if (href && !ordinary) notices.add("links");
      if (!ordinary) link.replaceWith(...link.childNodes);
      else link.setAttribute("href", href);
      if (link.title) link.title = link.title.replace(/\s+/g, " ").trim();
    }
    for (const element of body.querySelectorAll<HTMLElement>("*")) {
      const style = markStyle(element);
      for (const name of element.getAttributeNames()) if (!KEEP[element.tagName]?.includes(name)) element.removeAttribute(name);
      if (style) element.setAttribute("style", style);
    }
  } catch (error) {
    if (!(error instanceof Rejected)) throw error;
    return { html, error: `Nothing was pasted: ${error.message}. The clipboard and your selection are kept.` };
  }
  const notice = [...notices].map(key => NOTICES[key]).join("; ");
  return { html: body.innerHTML, ...(notice ? { notice: `Pasted with normalization: ${notice}.` } : {}) };
}

/** Records visible formatting that has no IeumDoc meaning. Classes, ids and layout styles are not reported. */
function visualFormatting(body: HTMLElement, notices: Set<Notice>): void {
  if (body.querySelector("sub,sup")) notices.add("scripts");
  if (body.querySelector("u,ins,mark,font,small,big,center,ol[type]:not([type='1']),[align]:not(td,th)")) notices.add("styles");
  for (const { style } of body.querySelectorAll<HTMLElement>("[style]")) {
    if (/super|sub/.test(style.verticalAlign)) notices.add("scripts");
    if (["color", "background-color", "font-family", "font-size"].some(name =>
        !/^(|inherit|initial|unset|transparent|currentcolor|normal|medium)$/i.test(style.getPropertyValue(name).trim())) ||
        /underline|overline/.test(style.textDecorationLine) || /center|right|justify|end/.test(style.textAlign)) notices.add("styles");
  }
}

/** The style declarations the engine's bold, italic and strikethrough parse rules read. */
function markStyle({ style }: HTMLElement): string {
  return [style.fontWeight && `font-weight: ${style.fontWeight}`, style.fontStyle && `font-style: ${style.fontStyle}`,
    style.textDecorationLine?.includes("line-through") && "text-decoration: line-through"].filter(Boolean).join("; ");
}

/**
 * Word writes list items as paragraphs styled `mso-list:lN levelM` whose generated marker is a
 * `mso-list:Ignore` span, not as HTML lists. This is the one vendor rule: without it a Word list
 * would silently become paragraphs starting with "·". Deeper levels nest one level at a time.
 */
function wordLists(body: HTMLElement): void {
  let stack: { list: Element; level: number }[] = [];
  for (const paragraph of body.querySelectorAll("p")) {
    const level = Number(/mso-list:\s*l\d+\s+level(\d+)/i.exec(paragraph.getAttribute("style") ?? "")?.[1] ?? 0);
    if (!level) continue;
    if (paragraph.previousElementSibling !== stack[0]?.list) stack = [];
    const marker = [...paragraph.querySelectorAll("span")].find(span => /mso-list:\s*ignore/i.test(span.getAttribute("style") ?? ""));
    const label = (marker?.textContent ?? "").replace(/\s/g, "");
    marker?.remove();
    const tag = /^\(?[0-9a-z]+[.)]$/i.test(label) ? "OL" : "UL";
    while (stack.length > 1 && stack.at(-1)!.level > level) stack.pop();
    let top = stack.at(-1);
    if (!top || top.level < level || top.list.tagName !== tag) {
      const list = body.ownerDocument.createElement(tag);
      if (tag === "OL" && /^\(?\d+/.test(label)) list.setAttribute("start", String(Number.parseInt(label.replace("(", ""), 10)));
      if (!top) paragraph.before(list);
      else if (top.level < level) top.list.lastElementChild!.append(list);
      else top.list.after(list);
      if (top && top.level >= level) stack.pop();
      stack.push(top = { list, level });
    }
    const item = body.ownerDocument.createElement("li");
    item.append(...paragraph.childNodes);
    top.list.append(item);
    paragraph.remove();
  }
}

/** List v1: an item holds one paragraph, optionally followed by one nested list. */
function lists(body: HTMLElement): void {
  const reject = () => { throw new Rejected("a list item holds one paragraph, optionally followed by one nested list"); };
  // A list directly inside a list (as browsers' own editing writes it) belongs to the item before it.
  for (const nested of body.querySelectorAll(":is(ul,ol) > :is(ul,ol)")) {
    const item = nested.previousElementSibling;
    if (item?.tagName !== "LI") reject();
    item!.append(nested);
  }
  for (const item of body.querySelectorAll("li")) {
    const nested = [...item.children].filter(child => child.matches("ul,ol"));
    if (nested.length > 1 || (nested[0] && !trailing(nested[0]))) reject();
    nested[0]?.remove();
    if (!inlineOnly(item)) reject();
    if (nested[0]) item.append(nested[0]);
  }
  for (const list of body.querySelectorAll("ol[start]")) {
    if (!/^\d+$/.test(list.getAttribute("start")!.trim())) list.removeAttribute("start");
  }
}

/**
 * Unwraps paragraph wrappers (`<p>`, `<div>`) so the element holds one run of inline content.
 * False if other blocks or several paragraphs remain.
 */
function inlineOnly(element: Element): boolean {
  const blocks = [...element.querySelectorAll(BLOCKS)];
  if (blocks.some((block, index) => !block.matches("p,div") || (index > 0 && !blocks[index - 1].contains(block)))) return false;
  if (blocks.length && blocks[0].textContent?.trim() !== element.textContent?.trim()) return false;
  blocks.forEach(block => block.replaceWith(...block.childNodes));
  return true;
}

/** Whether a line break precedes content; trailing breaks render nothing and are dropped. */
function lineBreaks(element: Element): boolean {
  let found = false;
  for (const lineBreak of element.querySelectorAll("br")) {
    const after = element.ownerDocument.createRange();
    after.setStartAfter(lineBreak);
    after.setEnd(element, element.childNodes.length);
    if (after.toString().trim()) found = true;
    else lineBreak.remove();
  }
  return found;
}

function trailing(element: Element): boolean {
  for (let next = element.nextSibling; next; next = next.nextSibling) {
    if (next.nodeType === Node.ELEMENT_NODE || next.textContent?.trim()) return false;
  }
  return true;
}

/** A rectangular grid of single-line cells, header cells in the first row only, as Core tables are. */
function tableBlock(table: HTMLTableElement, notices: Set<Notice>): void {
  const document = table.ownerDocument;
  if (table.querySelector("table")) throw new Rejected("nested tables are not supported");
  if (table.caption) {
    notices.add("caption");
    const paragraph = document.createElement("p");
    paragraph.append(...table.caption.childNodes);
    table.before(paragraph);
    table.caption.remove();
  }
  const rows = [...table.rows].map(row => [...row.cells]);
  if (rows.length === 0) return table.remove();
  for (const row of rows) {
    if (row.length !== rows[0].length) throw new Rejected("table rows must have the same number of cells");
    for (const cell of row) {
      if (cell.colSpan !== 1 || cell.rowSpan !== 1) throw new Rejected("merged table cells are not supported");
      if (!inlineOnly(cell) || lineBreaks(cell)) throw new Rejected("a table cell holds one line of inline content");
    }
  }
  if (rows.some((row, index) => row.some(cell => (cell.tagName === "TH") !== (index === 0)))) notices.add("header");
  // Only the HTML align attribute is column alignment; CSS is never read as it.
  const align = rows[0].map((_, column) => {
    const values = new Set(rows.map(row => row[column].getAttribute("align")?.trim().toLowerCase() ?? ""));
    const [value] = values;
    if (values.size > 1) notices.add("styles");
    return values.size === 1 && ["left", "center", "right"].includes(value) ? value : "";
  });
  const block = document.createElement("div");
  block.setAttribute("data-table-block", "");
  const body = block.appendChild(document.createElement("table")).appendChild(document.createElement("tbody"));
  rows.forEach((row, index) => {
    const line = body.appendChild(document.createElement("tr"));
    row.forEach((cell, column) => {
      const next = line.appendChild(document.createElement(index === 0 ? "th" : "td"));
      next.setAttribute("data-table-cell", "");
      if (align[column]) next.setAttribute("align", align[column]);
      next.append(...cell.childNodes);
    });
  });
  table.replaceWith(block);
}

/** Literal code text: line structure (breaks, one element per line) becomes newlines, highlighting is dropped. */
function codeBlock(pre: HTMLPreElement): void {
  const text = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeName === "BR") return "\n";
    const content = [...node.childNodes].map(text).join("");
    return node !== pre && (node as Element).matches?.("div,p,li") ? `${content}\n` : content;
  };
  // A recognizable `language-*` hint only; anything else is no language.
  const hint = [pre, pre.querySelector(":scope > code")].flatMap(element => [...element?.classList ?? []])
    .map(name => /^(?:language|lang)-([\w+#.-]+)$/.exec(name)?.[1]).find(Boolean);
  const code = pre.ownerDocument.createElement("pre");
  if (hint) code.setAttribute("language", hint);
  // HTML renderers end the code with the fence's newline; it is not part of the code.
  code.textContent = text(pre).replace(/\r\n?/g, "\n").replace(/\n$/, "");
  pre.replaceWith(code);
}
