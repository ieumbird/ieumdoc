import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { BLOCK_COMMANDS, type TableCellAddress } from "./block-commands.ts";
import { CommandMenu } from "./CommandMenu.tsx";

/** A presentation-only decoration; the engine selection remains the native caret. */
export const TableCellFocus = Extension.create({
  name: "tableCellFocus",
  addProseMirrorPlugins() {
    return [new Plugin({ props: { decorations(state) {
      const { $from, $to } = state.selection;
      if ($from.parent.type.name !== "tableCell" || !$from.sameParent($to)) return null;
      return DecorationSet.create(state.doc, [Decoration.node($from.before(), $from.after(), { "data-current-cell": "true" })]);
    } } })];
  },
});

function columnName(index: number): string {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
  return name;
}

type Geometry = { columns: { left: number; width: number }[]; rows: { top: number; height: number }[]; right: number; bottom: number };
type Menu = { kind: "row" | "column" | "table"; target: TableCellAddress };

/** Handles reuse explicit-target table commands. Geometry and menu state never enter the document. */
export function TableTools({ editor, node, getPos, grid, onEdit, hidden }: Pick<ReactNodeViewProps, "editor" | "node" | "getPos"> & {
  grid: RefObject<HTMLDivElement | null>; onEdit(): void; hidden: boolean;
}) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const current = useEditorState({ editor, selector: ({ editor: instance }) => {
    const { $from } = instance.state.selection;
    return $from.depth >= 3 && $from.node(1).type.name === "table" && $from.before(1) === getPos()
      ? { row: $from.index(1), column: $from.index(2) } : null;
  } });
  useEffect(() => {
    const closeOnEdit = ({ transaction }: { transaction: { docChanged: boolean } }) => { if (transaction.docChanged) setMenu(null); };
    editor.on("transaction", closeOnEdit);
    return () => { editor.off("transaction", closeOnEdit); };
  }, [editor]);
  useEffect(() => { if (hidden) setMenu(null); }, [hidden]);
  useEffect(() => {
    const canvas = grid.current;
    const table = canvas?.querySelector("table");
    if (!canvas || !table) return;
    const measure = () => {
      const origin = canvas.getBoundingClientRect();
      const bounds = table.getBoundingClientRect();
      const columns = [...(table.rows[0]?.cells ?? [])].map(cell => {
        const rect = cell.getBoundingClientRect();
        return { left: rect.left - origin.left, width: rect.width };
      });
      const rows = [...table.rows].map(row => {
        const rect = row.getBoundingClientRect();
        return { top: rect.top - origin.top, height: rect.height };
      });
      const next = { columns, rows, right: bounds.right - origin.left, bottom: bounds.bottom - origin.top };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    [...table.rows].forEach(row => observer.observe(row));
    const frame = requestAnimationFrame(measure);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [grid, node]);

  if (!editor.isEditable || hidden || !geometry) return null;
  const position = getPos();
  if (typeof position !== "number") return null;
  const index = editor.state.doc.resolve(position).index();
  const run = (id: string, target: TableCellAddress) => {
    setMenu(null);
    const at = getPos();
    if (typeof at !== "number" || !editor.isEditable) return;
    const block = editor.state.doc.resolve(at).index();
    const command = BLOCK_COMMANDS.find(item => item.id === id);
    if (!command?.enabled(editor.state, block, target)) return;
    editor.view.dispatch(command.run(editor.state, block, target));
    editor.view.focus();
  };
  const open = (button: HTMLButtonElement, kind: Menu["kind"], target: TableCellAddress) => {
    anchor.current = button;
    setMenu({ kind, target });
  };
  const target = menu?.target ?? current ?? { row: 0, column: 0 };
  const row = menu?.kind === "row" ? target.row : current?.row;
  const column = menu?.kind === "column" ? target.column : current?.column;
  const actions = BLOCK_COMMANDS.filter(command => menu?.kind === "row" ? command.id.startsWith("table-row")
    : menu?.kind === "column" ? command.id.startsWith("table-column") || command.id.startsWith("table-align") : command.id === "delete");
  const items = actions.map(command => ({ id: command.id, label: command.id === "delete" ? "Delete table" : command.label,
    disabled: !command.enabled(editor.state, index, target) }));
  if (menu?.kind === "table") items.unshift({ id: "properties", label: "Edit caption and label", disabled: false });
  return <div className="table-tools" data-active={current ? "true" : "false"} data-menu-open={menu ? "true" : "false"} contentEditable={false}>
    {geometry.columns.map((cell, i) => <button key={i} type="button" className="table-column-handle"
      aria-label={`Column ${columnName(i)} actions`} aria-pressed={column === i} aria-haspopup="menu"
      aria-expanded={menu?.kind === "column" && target.column === i}
      style={{ left: cell.left, width: cell.width }} onClick={event => open(event.currentTarget, "column", { row: current?.row ?? 0, column: i })}>{columnName(i)}</button>)}
    {geometry.rows.map((cell, i) => <button key={i} type="button" className="table-row-handle"
      aria-label={`Row ${i + 1} actions${i === 0 ? " (header)" : ""}`} aria-pressed={row === i} aria-haspopup="menu"
      aria-expanded={menu?.kind === "row" && target.row === i}
      style={{ top: cell.top + (cell.height - 28) / 2 }} onClick={event => open(event.currentTarget, "row", { row: i, column: current?.column ?? 0 })}>{i + 1}</button>)}
    <button type="button" className="table-extend" aria-label="Append column" style={{ left: geometry.right + 4, top: 0 }}
      onClick={() => run("table-column", { row: current?.row ?? 0, column: node.child(0).childCount - 1 })}><Plus size={16} /></button>
    <button type="button" className="table-extend" aria-label="Append row" style={{ left: 0, top: geometry.bottom + 8 }}
      onClick={() => run("table-row", { row: node.childCount - 1, column: current?.column ?? 0 })}><Plus size={16} /></button>
    <div className="table-action-bar" style={{ top: geometry.bottom + 8, left: 32, width: geometry.right - 32 }}>
      <button type="button" aria-label="Table actions" aria-haspopup="menu" aria-expanded={menu?.kind === "table"}
        onClick={event => open(event.currentTarget, "table", current ?? { row: 0, column: 0 })}><MoreHorizontal size={16} /></button>
      <button type="button" aria-label="Delete table" disabled={!BLOCK_COMMANDS.find(command => command.id === "delete")?.enabled(editor.state, index)}
        onClick={() => run("delete", target)}><Trash2 size={16} /></button>
    </div>
    <Popover open={menu !== null} onOpenChange={open => { if (!open) setMenu(null); }}>
      <PopoverContent anchor={anchor} side="bottom" align="start" sideOffset={4} initialFocus={false} finalFocus={false} className="table-command-popover">
        <CommandMenu label={menu?.kind === "row" ? `Row ${target.row + 1} actions` : menu?.kind === "column" ? `Column ${columnName(target.column)} actions` : "Table actions"}
          items={items} style={{ position: "relative" }} focusOnOpen onClose={() => setMenu(null)}
          onSelect={id => { if (id === "properties") { setMenu(null); onEdit(); } else run(id, target); }} />
      </PopoverContent>
    </Popover>
  </div>;
}
