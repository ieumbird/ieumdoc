import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { categories, categoryOf, itemsForTarget, pageRegion, scrollAnchors, scrollPosition, targetKey,
  type ComparisonSnapshot, type DocumentPosition, type ReadingSurfaceProps } from "./compare.ts";
import type { MapItem } from "./map.ts";
import "./compare.css";

type Props = {
  snapshot: ComparisonSnapshot;
  ReadingSurface: ComponentType<ReadingSurfaceProps>;
  Button: ComponentType<{ children?: ReactNode; onClick(): void; disabled?: boolean }>;
  /** All copy is translated by the shell; source labels/notes remain original evidence. */
  text(key: string): string;
  imageUrl(uri: string): string;
};
type Wire = { key: string; d: string; category: string; selected: boolean };

/** Owns only module DOM. Reading positions are supplied by the Editor's read-only surface. */
export function DoclingCompareView({ snapshot, ReadingSurface, Button, text, imageUrl }: Props) {
  const { map, stale } = snapshot;
  const left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null);
  const [{ width, inset, gap }, setGeometry] = useState({ width: 400, inset: 16, gap: 16 });
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [sync, setSync] = useState(true);
  const [selected, setSelected] = useState<MapItem[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [visibleNotes, setVisibleNotes] = useState<string[]>([]);
  const position = useRef<DocumentPosition>({ blocks: [], height: 0 });
  const geometryDirty = useRef(true);
  const blocksByKey = useRef(new Map<string, DocumentPosition["blocks"][number]>());
  const frame = useRef(0);
  const suppressed = useRef<Partial<Record<"left" | "right", number>>>({});
  const schedule = useRef(() => {});
  const onLayout = useCallback((value: DocumentPosition) => {
    position.current = value; blocksByKey.current = new Map(value.blocks.map(block => [block.key, block]));
    geometryDirty.current = true; schedule.current();
  }, []);
  const pages = useMemo(() => {
    let top = inset;
    return Object.values(map.pages).sort((a, b) => a.page_no - b.page_no).map(page => {
      const height = width * page.size.height / page.size.width;
      const entry = { ...page, top, height }; top += height + gap; return entry;
    });
  }, [map, width, inset, gap]);
  const itemsByPage = useMemo(() => {
    const result = new Map<number, { item: MapItem; region: ReturnType<typeof pageRegion>; key: string }[]>();
    for (const item of map.items) item.provenance.forEach((prov, index) => {
      const entries = result.get(prov.page_no) ?? [];
      entries.push({ item, region: pageRegion(prov.bbox, map.pages[String(prov.page_no)]!.size), key: `${item.self_ref}:${index}` });
      result.set(prov.page_no, entries);
    });
    return result;
  }, [map]);
  const counts = useMemo(() => map.items.reduce((result, item) => {
    result[item.status]++; return result;
  }, { converted: 0, decoration: 0, unsupported: 0 }), [map]);
  const anchors = useRef<[number, number][]>([]);
  const refresh = () => {
    const a = left.current, b = right.current, host = body.current;
    if (!a || !b || !host) return;
    const visible = pages.filter(page => page.top + page.height > a.scrollTop && page.top < a.scrollTop + a.clientHeight);
    const nextRange: [number, number] = [visible[0]?.page_no ?? 0, visible.at(-1)?.page_no ?? 0];
    setRange(previous => previous[0] === nextRange[0] && previous[1] === nextRange[1] ? previous : nextRange);
    const blocks = blocksByKey.current;
    const points: [number, number][] = [];
    const lines: Wire[] = [];
    const notes = new Set<string>();
    const hostRect = host.getBoundingClientRect(), ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
    if (!stale) for (const page of geometryDirty.current ? pages : visible) {
      for (const entry of itemsByPage.get(page.page_no) ?? []) {
        for (const target of entry.item.targets) {
          const block = blocks.get(targetKey(target));
          if (!block) continue;
          const sourceY = page.top + (entry.region.top + entry.region.height / 2) * page.height;
          const targetY = block.top + Math.min(block.height / 2, 24);
          if (geometryDirty.current && target.role !== "endnote" && target.role !== "group") points.push([sourceY, targetY]);
          // Picture pixels already represent these descendants. Keep every map entry/box,
          // but draw an individual correspondence only while that source item is selected.
          if (target.role === "image-content" && !selected.includes(entry.item)) continue;
          const y1 = sourceY - a.scrollTop, y2 = targetY - b.scrollTop;
          if (y1 < 0 || y1 > a.clientHeight || y2 < 0 || y2 > b.clientHeight) continue;
          const x1 = ar.left - hostRect.left + inset + (entry.region.left + entry.region.width) * width;
          const x2 = br.left - hostRect.left + block.left;
          const sy = ar.top - hostRect.top + y1, ty = br.top - hostRect.top + y2;
          lines.push({ key: `${entry.key}:${targetKey(target)}`, category: categoryOf(entry.item), selected: selected.includes(entry.item),
            d: `M${x1},${sy} C${x1 + 32},${sy} ${x2 - 32},${ty} ${x2},${ty}` });
          if (target.role === "endnote" && target.label) notes.add(target.label);
        }
      }
    }
    // Matching document endpoints cover the first/last region and blank scroll room.
    if (geometryDirty.current) {
      anchors.current = scrollAnchors([[0, 0], ...points, [a.scrollHeight, b.scrollHeight]]);
      geometryDirty.current = false;
    }
    setWires(lines);
    setVisibleNotes([...notes]);
  };
  schedule.current = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(refresh);
  };
  useLayoutEffect(() => {
    const element = left.current!;
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(element);
      const inset = parseFloat(style.paddingLeft);
      const gap = element.firstElementChild ? parseFloat(getComputedStyle(element.firstElementChild).marginBottom) : inset;
      setGeometry(previous => {
        const next = { width: Math.max(100, element.clientWidth - inset - parseFloat(style.paddingRight)), inset, gap };
        return previous.width === next.width && previous.inset === next.inset && previous.gap === next.gap ? previous : next;
      });
      geometryDirty.current = true; schedule.current();
    });
    observer.observe(element); observer.observe(right.current!);
    schedule.current();
    return () => { observer.disconnect(); cancelAnimationFrame(frame.current); };
  }, []);
  useLayoutEffect(() => { geometryDirty.current = true; schedule.current(); }, [pages, stale]);
  useLayoutEffect(() => { schedule.current(); }, [selected]);
  function scroll(side: "left" | "right") {
    const from = side === "left" ? left.current! : right.current!;
    const expected = suppressed.current[side];
    delete suppressed.current[side];
    if (expected !== undefined && Math.abs(expected - from.scrollTop) < 1) {
      schedule.current(); return;
    }
    if (sync && !stale) {
      const to = side === "left" ? right.current! : left.current!;
      to.scrollTop = scrollPosition(anchors.current, from.scrollTop, side === "right");
      suppressed.current[side === "left" ? "right" : "left"] = to.scrollTop;
    }
    schedule.current();
  }
  function reveal(item: MapItem) {
    setSelected([item]);
    if (stale) return;
    const target = item.targets[0];
    const block = target && position.current.blocks.find(block => block.key === targetKey(target));
    if (block && right.current) {
      right.current.scrollTop = Math.max(0, block.top - 24);
      suppressed.current.right = right.current.scrollTop;
      schedule.current();
    }
  }
  const selectTarget = useCallback((key: string | undefined) => {
    const items = key && !stale ? itemsForTarget(map.items, key) : [];
    setSelected(items);
    const prov = items.flatMap(item => item.provenance)[0];
    const page = prov && pages.find(page => page.page_no === prov.page_no);
    if (page && prov && left.current) {
      const region = pageRegion(prov.bbox, page.size);
      left.current.scrollTop = Math.max(0, page.top + region.top * page.height - 24);
      // Engine navigation may have scrolled the right pane before reporting the
      // selection. Neither that event nor this source reveal should sync back.
      suppressed.current = { left: left.current.scrollTop, right: right.current?.scrollTop };
    }
    schedule.current();
  }, [map, pages, stale]);
  function endnotes() {
    const block = snapshot.document.blocks.find(block => block.block === "footnote");
    const location = block && position.current.blocks.find(value => value.key === JSON.stringify(block.path));
    if (location && right.current) right.current.scrollTop = location.top;
  }
  return <section className="docling-compare" aria-label={text("Docling comparison")}>
    <div className="docling-toolbar">
      <span>{text("Read-only comparison")}</span>
      <label><input type="checkbox" checked={sync && !stale} disabled={stale} onChange={event => setSync(event.target.checked)} />{text("Sync scrolling")}</label>
      <Button onClick={endnotes} disabled={!snapshot.document.blocks.some(block => block.block === "footnote")}>{text("Endnotes")}</Button>
      <span>{text("converted")} {counts.converted} · {text("decoration")} {counts.decoration} · {text("unsupported")} {counts.unsupported}</span>
    </div>
    <div className="docling-legend" aria-label={text("Legend")}>{categories.map(category => <span key={category} data-category={category}>{text(category)}</span>)}</div>
    <div className="docling-column-labels"><span>{text("Source pages")} · {range[0]}–{range[1]} / {pages.length}</span><span>{text("Converted document")}</span></div>
    <div className="docling-body" ref={body}>
      <div className="docling-source" ref={left} onScroll={() => scroll("left")} tabIndex={0} aria-label={text("Source pages")}>
        {pages.map(page => <div key={page.page_no} className="docling-page" data-page={page.page_no} style={{ height: page.height }}>
          <span className="docling-page-number">{page.page_no}</span>
          {range[0] <= page.page_no && page.page_no <= range[1] ? <>
            {page.image?.uri ? <img alt={`${text("Source page")} ${page.page_no}`} src={imageUrl(page.image.uri)} /> : <span>{text("Page image unavailable")}</span>}
            {(itemsByPage.get(page.page_no) ?? []).map(({ item, region, key }) => <button key={key} type="button" className="docling-region"
              data-category={categoryOf(item)} data-status={item.status} data-source-ref={item.self_ref} aria-pressed={selected.includes(item)}
              aria-label={`${item.label} · ${item.self_ref} · ${text(item.status)}`}
              title={[item.self_ref, item.label, item.reason, ...item.notes].filter(Boolean).join("\n")}
              style={{ left: `${region.left * 100}%`, top: `${region.top * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}
              onClick={() => reveal(item)} />)}
          </> : null}
        </div>)}
      </div>
      <div className="docling-reading" ref={right} onScroll={() => scroll("right")} tabIndex={0} aria-label={text("Converted document")}>
        <ReadingSurface document={snapshot.document} path={snapshot.path} onLayout={onLayout} onSelection={selectTarget} />
      </div>
      <svg className="docling-wires" aria-label={text("Visible correspondences")} data-link-count={wires.length}>
        {wires.map(wire => <path key={wire.key} d={wire.d} data-category={wire.category} data-selected={wire.selected} />)}
      </svg>
    </div>
    <div className="docling-details" aria-live="polite">
      {selected.length ? selected.map(item => <div key={item.self_ref}><strong>{item.label} · {item.self_ref} · {text(item.status)}</strong> {item.reason}
        {item.notes.map((note, index) => <span key={index}> · {note}</span>)}</div>) : text("Select a source region to inspect conversion notes.")}
      {visibleNotes.length ? <span> · {text("Endnotes")}: {visibleNotes.join(", ")}</span> : null}
    </div>
  </section>;
}
