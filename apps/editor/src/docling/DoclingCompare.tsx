// SPIKE (docling-compare-1030): Docling conversion comparison view.
import "./docling-compare.css";
// Left: the source PDF pages with every Docling item's prov bbox. Right: the converted document in a
// read-only IeumDoc editor. Bezier wires connect each converted region to the block it became; furniture
// and excluded items are dashed gray boxes without a wire. Scrolling is synchronized through anchors.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { DocumentEditor } from "../DocumentEditor.tsx";
import { EditorVisibility } from "../editor-visibility.ts";
import { requestDocument } from "../document-session.ts";
import { resolveFigureSource } from "../editor-schema.tsx";
import type { DocumentFileResponse } from "../../shared/document-protocol.ts";
import { categoryOf, CATEGORY_COLOR, CATEGORY_LABEL, interpolate, monotonicAnchors, targetKey, type Category, type DoclingItem, type DoclingMap } from "./docling-map.ts";

type Props = { roots: readonly string[]; activePath: string; onClose(): void };
type Wire = { key: string; d: string; color: string; ends: [number, number, number, number] };
type Mark = { key: string; top: number; height: number; left: number; color: string; number: number };

const base = () => import.meta.env?.BASE_URL ?? "/";

async function fetchMap(query: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${base()}api/docling-map?${query}`);
  return { status: response.status, body: await response.json().catch(() => null) };
}

export function DoclingCompare({ roots, activePath, onClose }: Props) {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [path, setPath] = useState("");
  const [map, setMap] = useState<DoclingMap | null>(null);
  const [file, setFile] = useState<DocumentFileResponse | null>(null);
  const [problem, setProblem] = useState("");
  const [sync, setSync] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [strip, setStrip] = useState<{ label: string; text: string; number: number; color: string }[]>([]);
  const [pageLabel, setPageLabel] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const lead = useRef<"left" | "right">("left");
  const anchors = useRef<[number, number][]>([]);
  const frame = useRef(0);

  // Pick the document: the active one when it has a sidecar, otherwise the first discovered.
  useEffect(() => {
    let live = true;
    void (async () => {
      const found = new Set<string>();
      for (const root of roots) {
        const result = await fetchMap(`root=${encodeURIComponent(root)}`);
        if (result.status === 200) for (const document of (result.body as { documents: string[] }).documents) found.add(document);
      }
      if (activePath && !found.has(activePath)) {
        const result = await fetchMap(`path=${encodeURIComponent(activePath)}`);
        if (result.status === 200) found.add(activePath);
      }
      if (!live) return;
      const list = [...found];
      setCandidates(list);
      setPath(current => current || (list.includes(activePath) ? activePath : list[0] ?? ""));
      setProblem(list.length ? "" : "열린 폴더에서 Docling 변환 지도(*.docling-map.json)가 있는 문서를 찾지 못했습니다.");
    })();
    return () => { live = false; };
  }, [roots.join("\n"), activePath]);

  useEffect(() => {
    if (!path) return;
    let live = true;
    setMap(null); setFile(null); setProblem("");
    void (async () => {
      try {
        const [result, opened] = await Promise.all([fetchMap(`path=${encodeURIComponent(path)}`), requestDocument("GET", path)]);
        if (!live) return;
        if (result.status !== 200) throw new Error((result.body as { error?: string } | null)?.error ?? "Docling 변환 지도를 읽지 못했습니다.");
        setMap(result.body as DoclingMap);
        setFile(opened as DocumentFileResponse);
      } catch (error) {
        if (live) setProblem(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => { live = false; };
  }, [path]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  // Wire numbering follows reading order; a table and its caption share their block's number.
  const numbering = useMemo(() => {
    const numbers = new Map<string, number>();
    for (const item of map?.items ?? []) {
      const key = targetKey(item);
      if (key && !numbers.has(key)) numbers.set(key, numbers.size + 1);
    }
    return numbers;
  }, [map]);
  const categories = useMemo(() => {
    const byBlock = new Map<number, Category>();
    for (const item of map?.items ?? []) {
      const category = categoryOf(item);
      if (item.block != null && (category === "table" || category === "picture")) byBlock.set(item.block, category);
    }
    return new Map((map?.items ?? []).map(item => [item.ref + "@" + item.page,
      item.label === "caption" && item.block != null ? byBlock.get(item.block) ?? "text" : categoryOf(item)]));
  }, [map]);
  const categoryFor = (item: DoclingItem) => categories.get(item.ref + "@" + item.page) ?? categoryOf(item);
  const stats = useMemo(() => {
    const items = (map?.items ?? []).filter(item => item.kind !== "figure-text");
    return { mapped: items.filter(item => item.block != null || item.footnote).length,
      furniture: items.filter(item => item.reason === "furniture").length,
      outside: items.filter(item => item.reason === "outside-chapter").length };
  }, [map]);

  const targetOf = useCallback((item: DoclingItem): HTMLElement | null => {
    const root = right.current;
    if (!root) return null;
    if (item.footnote) {
      const definition = root.querySelector<HTMLElement>(`.footnote-definition[data-label="${CSS.escape(item.footnote)}"]`);
      const view = root.getBoundingClientRect();
      const box = definition?.getBoundingClientRect();
      if (definition && box && box.bottom > view.top && box.top < view.bottom) return definition;
      return stripRef.current?.querySelector<HTMLElement>(`[data-strip="${CSS.escape(item.footnote)}"]`) ?? null;
    }
    if (item.block == null) return null;
    const block = blockElement(root, item.block);
    if (block && item.item != null) {
      const list = block.matches("ul,ol") ? block : block.querySelector("ul,ol");
      return (list?.querySelectorAll<HTMLElement>(":scope > li")[item.item]) ?? block;
    }
    return block;
  }, []);

  const layout = useCallback(() => {
    frame.current = 0;
    const host = body.current, l = left.current, r = right.current;
    if (!host || !l || !r || !map) return;
    const origin = host.getBoundingClientRect(), lv = l.getBoundingClientRect(), rv = r.getBoundingClientRect();
    const nextWires: Wire[] = [], nextAnchors: [number, number][] = [], nextMarks = new Map<string, Mark>();
    const visibleNotes = new Map<string, { label: string; text: string; number: number; color: string }>();
    let topPage = "";
    for (const page of l.querySelectorAll<HTMLElement>("[data-page]")) {
      const box = page.getBoundingClientRect();
      if (box.bottom > lv.top + lv.height * 0.35) { topPage = page.dataset.page ?? ""; break; }
    }
    const content = r.firstElementChild as HTMLElement | null;
    for (const node of l.querySelectorAll<HTMLElement>("[data-item]")) {
      const item = map.items[Number(node.dataset.item)]!;
      const key = targetKey(item);
      if (!key) continue;
      const color = CATEGORY_COLOR[categoryFor(item)];
      const number = numbering.get(key)!;
      const source = node.getBoundingClientRect();
      const sourceVisible = source.bottom > lv.top && source.top < lv.bottom;
      if (item.footnote && sourceVisible) {
        const definition = r.querySelector<HTMLElement>(`.footnote-definition[data-label="${CSS.escape(item.footnote)}"]`);
        const text = definition?.querySelector(".footnote-definition-content, p")?.textContent ?? definition?.textContent ?? item.text ?? "";
        visibleNotes.set(item.footnote, { label: item.footnote, text: text.replace(/^\s*source-\d+\s*/, ""), number, color });
      }
      const target = targetOf(item);
      if (!target) continue;
      const box = target.getBoundingClientRect();
      if (!item.footnote && content) {
        const top = box.top - rv.top + r.scrollTop;
        nextAnchors.push([source.top - lv.top + l.scrollTop, top]);
        if (!nextMarks.has(key)) nextMarks.set(key, { key, top, height: box.height, left: box.left - rv.left, color, number });
      }
      const targetVisible = box.bottom > rv.top && box.top < rv.bottom;
      if (!sourceVisible || !targetVisible) continue;
      const clampL = (y: number) => Math.min(Math.max(y, lv.top + 4), lv.bottom - 4);
      const clampR = (y: number) => Math.min(Math.max(y, rv.top + 4), rv.bottom - 4);
      const x1 = source.right - origin.left, y1 = clampL(source.top + Math.min(source.height / 2, 9)) - origin.top;
      const x2 = Math.max(box.left - origin.left - 8, rv.left - origin.left + 4), y2 = clampR(box.top + Math.min(box.height / 2, 11)) - origin.top;
      const bend = Math.max(40, (x2 - x1) * 0.5);
      nextWires.push({ key, color, ends: [x1, y1, x2, y2], d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` });
    }
    anchors.current = monotonicAnchors(nextAnchors, l.scrollHeight, r.scrollHeight);
    setWires(nextWires);
    setMarks(current => {
      const next = [...nextMarks.values()];
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
    setStrip(current => {
      const next = [...visibleNotes.values()];
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
    setPageLabel(topPage);
  }, [map, numbering, targetOf, categories]);

  const schedule = useCallback(() => { if (!frame.current) frame.current = requestAnimationFrame(layout); }, [layout]);

  const follow = useCallback((from: "left" | "right") => {
    const l = left.current, r = right.current;
    if (!l || !r) return;
    if (sync && lead.current === from) {
      const [source, target] = from === "left" ? [l, r] : [r, l];
      const points = from === "left" ? anchors.current : anchors.current.map(([a, b]) => [b, a] as [number, number]);
      const focus = source.scrollTop + source.clientHeight * 0.3;
      const next = interpolate(points, focus) - target.clientHeight * 0.3;
      if (Math.abs(target.scrollTop - next) > 1) target.scrollTop = next;
    }
    schedule();
  }, [sync, schedule]);

  useLayoutEffect(() => {
    if (!map || !file) return;
    const observer = new ResizeObserver(schedule);
    for (const element of [body.current, left.current, right.current?.firstElementChild]) if (element) observer.observe(element);
    const mutations = new MutationObserver(schedule);
    if (right.current) mutations.observe(right.current, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    schedule();
    const settle = window.setTimeout(schedule, 600);
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener("resize", schedule); window.clearTimeout(settle); };
  }, [map, file, schedule]);
  useEffect(() => { schedule(); }, [strip.length, schedule]);

  const reveal = (item: DoclingItem) => {
    const target = targetOf(item), r = right.current;
    if (!target || !r) return;
    lead.current = "right";
    const top = target.getBoundingClientRect().top - r.getBoundingClientRect().top + r.scrollTop;
    r.scrollTo({ top: top - r.clientHeight * 0.3, behavior: "smooth" });
  };

  const pages = map ? Object.entries(map.pages).sort(([a], [b]) => Number(a) - Number(b)) : [];
  const name = path.split(/[\\/]/).at(-1) ?? "";
  const claim = (pane: "left" | "right") => () => { lead.current = pane; };

  return (
    <section className="docling-compare" aria-label="Docling 변환 대조" data-testid="docling-compare">
      <header className="dc-header">
        <div className="dc-tab" role="tab" aria-selected="true">
          <ArrowLeftRight aria-hidden="true" />
          <span>Docling 대조 · {name || "문서 없음"}</span>
          <button type="button" className="dc-close" aria-label="대조 보기 닫기" title="닫기 (Esc)" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
        {candidates.length > 1 ? (
          <select className="dc-select" value={path} onChange={event => setPath(event.target.value)} aria-label="대조할 문서">
            {candidates.map(candidate => <option key={candidate} value={candidate}>{candidate}</option>)}
          </select>
        ) : null}
        <span className="dc-meta">{map ? `${map.source?.name ?? "DoclingDocument"} · ${pages.length}쪽 (${pages[0]?.[0]}–${pages.at(-1)?.[0]}) · 블록 ${map.blockCount}개` : ""}</span>
        <span className="dc-grow" />
        <label className="dc-sync"><input type="checkbox" checked={sync} onChange={event => setSync(event.target.checked)} /> 동기 스크롤</label>
      </header>
      {problem ? <p className="dc-problem" role="alert">{problem}</p> : null}
      <div className="dc-body" ref={body}>
        <div className="dc-pane dc-pane--source">
          <div className="dc-pane-head"><b>원본 PDF</b><span>Docling 인식 영역</span><span className="dc-chip">{pageLabel ? `p.${pageLabel}` : ""}</span></div>
          <div className="dc-scroll" ref={left} onScroll={() => follow("left")} onWheel={claim("left")} onPointerDown={claim("left")}
            onTouchStart={claim("left")} onKeyDown={claim("left")} tabIndex={0} aria-label="원본 페이지">
            {pages.map(([number, page]) => (
              <div key={number} className="dc-page-wrap">
                <div className="dc-page" data-page={number} style={{ aspectRatio: `${page.size.width} / ${page.size.height}` }}>
                  {page.image ? <img src={resolveFigureSource(page.image.uri, path)} alt={`${number}쪽 원본`} onLoad={schedule} draggable={false} /> : null}
                  {map!.items.map((item, index) => item.page !== Number(number) || item.kind === "figure-text" ? null : (
                    <SourceBox key={index} index={index} item={item} page={page.size} category={categoryFor(item)}
                      number={numbering.get(targetKey(item) ?? "")} hover={hover} onHover={setHover} onReveal={reveal} />
                  ))}
                </div>
                <div className="dc-page-label">{number}쪽</div>
              </div>
            ))}
          </div>
        </div>
        <div className="dc-gutter" aria-hidden="true" />
        <div className="dc-pane dc-pane--document">
          <div className="dc-pane-head"><b>이음독 문서</b><span>변환 결과 · 읽기 전용</span></div>
          <div className="dc-doc-frame">
            <div className="dc-scroll dc-scroll--document" ref={right} onScroll={() => follow("right")} onWheel={claim("right")}
              onPointerDown={claim("right")} onTouchStart={claim("right")} onKeyDown={claim("right")}>
              <div className="dc-doc-content">
                {file && map ? (
                  <EditorVisibility value={true}>
                    <DocumentEditor key={path} document={file.document} bibliography={file.bibliography} documentPath={file.path}
                      onStructuralReject={() => undefined} readOnly />
                  </EditorVisibility>
                ) : <p className="dc-loading">{problem ? "" : "불러오는 중…"}</p>}
                {marks.map(mark => (
                  <span key={mark.key} className={`dc-mark${hover === mark.key ? " dc-mark--hover" : ""}`}
                    style={{ top: mark.top, height: mark.height, left: Math.max(mark.left - 14, 2), "--dc-color": mark.color } as CSSProperties}>
                    <i>{mark.number}</i>
                  </span>
                ))}
              </div>
            </div>
            <div className="dc-strip" ref={stripRef} aria-label="이 화면의 각주">
              <div className="dc-strip-head">각주 · 왼쪽 화면에 보이는 원본 각주 <span>(본문 끝 각주 정의로 변환)</span></div>
              {strip.length ? strip.map(note => (
                <p key={note.label} data-strip={note.label} style={{ "--dc-color": note.color } as CSSProperties}>
                  <i>{note.number}</i><b>[^{note.label}]</b>{note.text}
                </p>
              )) : <p className="dc-strip-empty">이 화면에는 각주가 없습니다.</p>}
            </div>
          </div>
        </div>
        <svg className="dc-wires" aria-hidden="true">
          {wires.map((wire, index) => (
            <g key={index} className={hover && hover !== wire.key ? "dc-wire dc-wire--dim" : hover === wire.key ? "dc-wire dc-wire--hover" : "dc-wire"}>
              <path d={wire.d} stroke={wire.color} />
              <circle cx={wire.ends[0]} cy={wire.ends[1]} r={2.4} fill={wire.color} />
              <path d={`M${wire.ends[2] - 5},${wire.ends[3] - 3.5} L${wire.ends[2] + 0.5},${wire.ends[3]} L${wire.ends[2] - 5},${wire.ends[3] + 3.5}`} stroke={wire.color} fill="none" />
            </g>
          ))}
        </svg>
      </div>
      <footer className="dc-legend">
        {(["heading", "text", "list", "table", "picture", "formula", "footnote"] as Category[]).map(category => (
          <span key={category} className="dc-swatch" style={{ "--dc-color": CATEGORY_COLOR[category] } as CSSProperties}><i />{CATEGORY_LABEL[category]}</span>
        ))}
        <span className="dc-swatch dc-swatch--none"><i />변환 안 됨 (머리글·바닥글·범위 밖)</span>
        <span className="dc-swatch dc-swatch--wire"><svg width="26" height="10"><path d="M1,5 C9,5 15,5 24,5" /></svg>변환 연결</span>
        <span className="dc-count">변환 <b>{stats.mapped}</b> · 변환 안 됨 <b>{stats.furniture}</b> · 범위 밖 <b>{stats.outside}</b></span>
      </footer>
    </section>
  );
}

/** The editor element of a top-level block. Lists carry no data-source-path, so fall back to the
 * top-level sibling right after the previous block. */
function blockElement(root: HTMLElement, index: number): HTMLElement | null {
  const direct = root.querySelector<HTMLElement>(`[data-source-path="${index}"]`);
  if (direct) return direct;
  const editor = root.querySelector<HTMLElement>(".ProseMirror");
  if (!editor || index < 1) return null;
  const previous = blockElement(root, index - 1);
  let top: HTMLElement | null = previous;
  while (top && top.parentElement !== editor) top = top.parentElement;
  const next = top?.nextElementSibling as HTMLElement | null | undefined;
  return next && !next.hasAttribute("data-source-path") ? next : null;
}

function SourceBox({ index, item, page, category, number, hover, onHover, onReveal }: {
  index: number; item: DoclingItem; page: { width: number; height: number }; category: Category; number?: number;
  hover: string | null; onHover(key: string | null): void; onReveal(item: DoclingItem): void;
}) {
  const { l, r, t, b, coord_origin } = item.bbox;
  const top = coord_origin === "BOTTOMLEFT" ? page.height - t : t;
  const height = Math.abs(t - b);
  const style = { left: `${(l / page.width) * 100}%`, top: `${(top / page.height) * 100}%`, width: `${((r - l) / page.width) * 100}%`,
    height: `${(height / page.height) * 100}%`, "--dc-color": CATEGORY_COLOR[category] } as CSSProperties;
  const key = targetKey(item);
  if (!key) {
    const outside = item.reason === "outside-chapter";
    return <div className={`dc-box dc-box--none${outside ? " dc-box--outside" : ""}`} style={style} title={item.text}>
      <span className="dc-tag">{outside ? "범위 밖" : "변환 안 됨"} · <code>{item.label}</code></span>
    </div>;
  }
  return <div className={`dc-box${hover === key ? " dc-box--hover" : ""}`} style={style} data-item={index} title={`${item.label} → ${key}\n${item.text ?? ""}`}
    onPointerEnter={() => onHover(key)} onPointerLeave={() => onHover(null)} onClick={() => onReveal(item)}>
    <i className="dc-badge">{number}</i>
  </div>;
}
