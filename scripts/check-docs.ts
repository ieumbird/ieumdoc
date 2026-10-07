/**
 * Offline repository documentation checks; no product parser or new dependency.
 * Supports inline links/images (angle destinations, titles, escaped/balanced
 * parentheses), reference links, ATX/setext headings and explicit HTML anchors.
 * Fenced/indented code, inline code, comments and YAML front matter are examples,
 * not links. Slugs cover this repository's GitHub headings, including Korean and
 * duplicates; this is not a general Markdown/MDX renderer. HTML href/src, Liquid,
 * generated headings and GitHub's auto-generated footnote anchors are not parsed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Link = { target: string; original: string; line: number };
export type Failure = Link & { source: string; resolved: string; reason: string };

const ROOT_FILES = ["README.md", "AGENTS.md", "CONTRIBUTING.md"];
// Generated/cache directories are not maintained documentation.
const IGNORED_DIRECTORIES = new Set(["node_modules", "tmp", "dist", "build", ".git"]);
// Every exception must name a repository-relative file and explain why.
const INDEX_EXCLUSIONS: Record<string, string> = {
  "docs/README.md": "The index does not need to link to itself.",
};
const blank = (text: string) => text.replace(/[^\n]/g, " ");
const unescape = (text: string) => text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, "$1");

function prose(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let fence: string | undefined;
  let frontMatter = lines[0]?.replace(/^\uFEFF/, "") === "---";
  return lines.map((line, index) => {
    if (frontMatter) {
      if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontMatter = false;
      return blank(line);
    }
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      return blank(line);
    }
    if (marker) { fence = marker[1]; return blank(line); }
    if (/^( {4}|\t)/.test(line)) return blank(line);
    return line;
  }).join("\n").replace(/<!--[\s\S]*?-->/g, blank);
}

function destination(text: string, start: number): { target: string; end: number } | undefined {
  let index = start;
  while (/\s/.test(text[index] ?? "") && index < text.length) index++;
  if (text[index] === "<") {
    const end = text.indexOf(">", index + 1);
    if (end < 0 || text.slice(index, end).includes("\n")) return undefined;
    return { target: unescape(text.slice(index + 1, end)), end: end + 1 };
  }
  const from = index;
  let depth = 0;
  for (; index < text.length; index++) {
    const char = text[index];
    if (char === "\\" && index + 1 < text.length) { index++; continue; }
    if (char === "(") depth++;
    if (char === ")") { if (!depth) break; depth--; }
    if (/\s/.test(char)) break;
  }
  if (depth) return undefined;
  return { target: unescape(text.slice(from, index)), end: index };
}

function normalizeLabel(label: string) { return label.trim().replace(/\s+/g, " ").toLowerCase(); }

export function markdownLinks(source: string): Link[] {
  let text = prose(source).replace(/(`+)([\s\S]*?)\1(?!`)/g, blank);
  const links: Link[] = [];
  const definitions = new Map<string, string>();
  text = text.replace(/^ {0,3}\[([^\]\n]+)\]:[^\n]*(?:\n[ \t]+[^\n]+)?/gm, (original, label, offset) => {
    const value = destination(original, original.indexOf(":") + 1);
    if (value && !label.startsWith("^")) definitions.set(normalizeLabel(label), value.target);
    return blank(original);
  });
  const labels = /!?\[((?:\\.|[^\]\\]|\[[^\]\n]*\])*)\]/g;
  for (let match; (match = labels.exec(text));) {
    const offset = match.index;
    if (offset > 0 && text[offset - 1] === "\\") continue;
    let end = labels.lastIndex;
    let target: string | undefined;
    if (text[end] === "(") {
      const value = destination(text, end + 1);
      if (!value) continue;
      // An optional quoted/parenthesized title is not part of the target.
      const tail = /^\s*(?:(?:"[^"]*"|'[^']*'|\([^)]*\))\s*)?\)/.exec(text.slice(value.end));
      if (!tail) continue;
      target = value.target;
      end = value.end + tail[0].length;
    } else {
      const reference = /^\[([^\]\n]*)\]/.exec(text.slice(end));
      target = definitions.get(normalizeLabel(reference?.[1] || match[1]));
      if (reference) end += reference[0].length;
    }
    if (target !== undefined) {
      links.push({ target, original: source.replace(/\r\n?/g, "\n").slice(offset, end), line: text.slice(0, offset).split("\n").length });
      labels.lastIndex = end;
    }
  }
  return links;
}

function entities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, name: string) => {
    if (!name.startsWith("#")) return named[name.toLowerCase()];
    const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

export function headingAnchors(source: string): Set<string> {
  const text = prose(source);
  const anchors = new Set<string>();
  const headings = new Set<string>();
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const atx = /^ {0,3}#{1,6}(?:\s+|$)(.*)$/.exec(line);
    const setext = index > 0 && /^ {0,3}(?:=+|-+)\s*$/.test(line) && lines[index - 1].trim();
    if (!atx && !setext) continue;
    const heading = (atx ? atx[1].replace(/\s+#+\s*$/, "") : lines[index - 1]).trim();
    const plain = entities(unescape(heading.replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<[^>]*>/g, "")))
      .replace(/[`*~]/g, "").replace(/\b_([^_]+)_\b/g, "$1");
    const base = plain.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    let slug = base;
    for (let suffix = 1; headings.has(slug); suffix++) slug = `${base}-${suffix}`;
    headings.add(slug);
    anchors.add(slug);
  }
  for (const match of text.matchAll(/<(?:a|h[1-6])\b[^>]*\b(?:id|name)=["']([^"']+)["'][^>]*>/gi)) anchors.add(entities(match[1]));
  return anchors;
}

function markdownFiles(root: string, folder: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(path.join(root, folder), { withFileTypes: true })) {
    const relative = path.posix.join(folder, entry.name);
    if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) files.push(...markdownFiles(root, relative));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(relative);
  }
  return files.sort();
}

/** Check each actual directory entry, including on case-insensitive Windows. */
function exactPath(root: string, relative: string): string | undefined {
  let current = root;
  for (const segment of relative.split("/").filter(segment => segment && segment !== ".")) {
    if (!statSync(current).isDirectory()) return "parent is not a directory";
    const entries = readdirSync(current);
    if (!entries.includes(segment)) {
      const actual = entries.find(entry => entry.toLowerCase() === segment.toLowerCase());
      return actual ? `path case mismatch: ${segment} (on disk: ${actual})` : "local path does not exist";
    }
    current = path.join(current, segment);
  }
  return undefined;
}

export function checkDocs(root: string): { failures: Failure[]; files: number; links: number; documents: number } {
  const docs = markdownFiles(root, "docs");
  const files = [...ROOT_FILES, ...docs, ...markdownFiles(root, ".github")];
  const failures: Failure[] = [];
  const connections = new Map<string, Set<string>>();
  const anchors = new Map<string, Set<string>>();
  let linkCount = 0;
  for (const source of files) {
    connections.set(source, new Set());
    const missing = exactPath(root, source);
    if (missing) {
      failures.push({ source, line: 1, original: source, target: source, resolved: source, reason: missing });
      continue;
    }
    for (const link of markdownLinks(readFileSync(path.join(root, source), "utf8"))) {
      const raw = entities(link.target);
      if (/^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith("//")) continue;
      linkCount++;
      let resolved = raw;
      const fail = (reason: string) => failures.push({ ...link, source, resolved, reason });
      try {
        const hash = raw.indexOf("#");
        const fragment = hash < 0 ? "" : decodeURIComponent(raw.slice(hash + 1));
        const pathname = decodeURIComponent((hash < 0 ? raw : raw.slice(0, hash)).split("?", 1)[0]);
        resolved = pathname ? path.posix.normalize(pathname.startsWith("/") ? pathname.slice(1) : path.posix.join(path.posix.dirname(source), pathname)) : source;
        if (pathname.includes("\\") || pathname.includes("\0")) { fail("use portable forward-slash paths without NUL"); continue; }
        if (resolved === ".." || resolved.startsWith("../")) { fail("target escapes repository root"); continue; }
        const error = exactPath(root, resolved);
        if (error) { fail(error); continue; }
        connections.get(source)!.add(resolved.replace(/\/$/, ""));
        if (!fragment) continue;
        let headingFile = resolved;
        if (statSync(path.join(root, resolved)).isDirectory()) headingFile = path.posix.join(resolved, "README.md");
        if (!headingFile.endsWith(".md") || exactPath(root, headingFile)) {
          fail("heading anchor requires a Markdown file (or a directory with README.md)"); continue;
        }
        if (!anchors.has(headingFile)) anchors.set(headingFile, headingAnchors(readFileSync(path.join(root, headingFile), "utf8")));
        if (!anchors.get(headingFile)!.has(fragment)) { resolved = `${headingFile}#${fragment}`; fail("heading anchor does not exist"); }
      } catch (error) {
        fail(error instanceof URIError ? "invalid URL encoding" : `cannot inspect target: ${(error as Error).message}`);
      }
    }
  }
  const requireLink = (source: string, target: string, reason: string) => {
    if (!connections.get(source)?.has(target)) failures.push({ source, line: 1, original: "(required direct link)", target, resolved: target, reason });
  };
  for (const document of docs) {
    if (!(document in INDEX_EXCLUSIONS)) requireLink("docs/README.md", document, "maintained document is missing from the index");
  }
  for (const target of ["docs/README.md", "CONTRIBUTING.md", "LICENSE"]) requireLink("README.md", target, "missing root entrypoint connection");
  for (const target of ["AGENTS.md", "docs/README.md"]) requireLink("CONTRIBUTING.md", target, "missing contributor connection");
  return { failures, files: files.length, links: linkCount, documents: docs.length - Object.keys(INDEX_EXCLUSIONS).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkDocs(path.resolve(fileURLToPath(new URL("..", import.meta.url))));
    for (const failure of result.failures) {
      console.error(`${failure.source}:${failure.line}\n  link: ${failure.original}\n  resolved: ${failure.resolved}\n  reason: ${failure.reason}`);
    }
    if (result.failures.length) {
      console.error(`Documentation checks failed: ${result.failures.length} problem(s).`);
      process.exitCode = 1;
    } else console.log(`Documentation checks passed: ${result.files} files, ${result.links} local links, ${result.documents} indexed documents.`);
  } catch (error) {
    console.error(`Documentation checks could not run: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
