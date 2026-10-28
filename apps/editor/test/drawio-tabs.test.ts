// SPIKE: the Draw.io diagram-tab store.
import assert from "node:assert/strict";
import test from "node:test";
import { diagramFilePath, diagramSaved, diagramTabName, diagramTabs, openDiagramTab, removeDiagramTab, setDiagramActivator, setDiagramDirty, watchDiagram } from "../src/drawio-tabs.ts";

test("diagram tabs open once per file, place a new diagram on its first save and refresh viewers", () => {
  const activated: string[] = [];
  setDiagramActivator(id => activated.push(id));
  const doc = "/docs/obc-design.md";
  const edit = openDiagramTab(doc, "./assets/diagram-1.drawio.svg");
  assert.equal(openDiagramTab(doc, "./assets/diagram-1.drawio.svg"), edit, "the same file focuses its tab");
  assert.deepEqual(activated, [edit, edit]);
  assert.notEqual(openDiagramTab("/docs/other.md", "./assets/diagram-1.drawio.svg"), edit, "another document's file is another tab");

  const placed: string[] = [];
  const created = openDiagramTab(doc, undefined, path => { placed.push(path); return true; });
  assert.notEqual(openDiagramTab(doc), created, "new diagrams never share a tab");
  const tab = diagramTabs().find(item => item.id === created)!;
  assert.equal(diagramTabName(tab, "새 다이어그램"), "새 다이어그램");

  let refreshed = 0;
  const stop = watchDiagram(doc, "./assets/diagram-2.drawio.svg", () => refreshed++);
  setDiagramDirty(created, true);
  assert.equal(diagramTabs().find(item => item.id === created)!.dirty, true);
  assert.deepEqual(diagramSaved(created, "./assets/diagram-2.drawio.svg"), { placed: true });
  assert.deepEqual(placed, ["./assets/diagram-2.drawio.svg"]);
  const saved = diagramTabs().find(item => item.id === created)!;
  assert.equal(saved.dirty, false);
  assert.equal(diagramTabName(saved, "새 다이어그램"), "diagram-2.drawio.svg");
  assert.equal(diagramFilePath(saved), "/docs/assets/diagram-2.drawio.svg");
  assert.equal(refreshed, 1);
  // Later saves only refresh; the Figure already has the file.
  diagramSaved(created, "./assets/diagram-2.drawio.svg");
  assert.deepEqual(placed, ["./assets/diagram-2.drawio.svg"]);
  assert.equal(refreshed, 2);
  stop();
  diagramSaved(created, "./assets/diagram-2.drawio.svg");
  assert.equal(refreshed, 2);
  assert.equal(openDiagramTab(doc, "./assets/diagram-2.drawio.svg"), created, "a saved new diagram is found by its file");

  const orphan = openDiagramTab(doc, undefined, () => false);
  assert.deepEqual(diagramSaved(orphan, "./assets/diagram-3.drawio.svg"), { placed: false });

  for (const item of diagramTabs()) removeDiagramTab(item.id);
  assert.deepEqual(diagramTabs(), []);
});
