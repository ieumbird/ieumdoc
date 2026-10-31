import { brand } from "../../../brand.ts";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SampleAvailability, SampleDocuments } from "../shared/document-protocol.ts";

const OWNER_FILE = `.${brand.appName}-sample`;
const OWNER = `${brand.appName} managed sample 1\n`;
const FILES = ["converter-control.md", "references.bib", "assets/current-loop.svg"];
const ENTRIES = [OWNER_FILE, "version", ...["ko", "en"].flatMap(language =>
  [`${language}/`, `${language}/assets/`, ...FILES.map(file => `${language}/${file}`)])].sort();
class SampleConflict extends Error {}

/** Never traverse a junction, including in the parent path of the destination. */
function realDirectories(folder: string): void {
  const parent = path.dirname(folder);
  if (parent !== folder) realDirectories(parent);
  const stat = lstatSync(folder, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new SampleConflict(`Sample folder is not a real directory: ${folder}`);
}

/** Names and entry types, without following any links. Unexpected empty folders also count. */
function entries(folder: string, relative = ""): string[] {
  return readdirSync(folder).flatMap(name => {
    const file = path.join(folder, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile()) throw new SampleConflict(`Sample contains a linked or unsupported entry: ${file}`);
    const key = relative ? `${relative}/${name}` : name;
    return stat.isDirectory() ? [`${key}/`, ...entries(file, key)] : [key];
  }).sort();
}

/** Old v1 copies had exactly these two regular files. Contents may have been edited. */
function managedSample(folder: string): boolean {
  realDirectories(folder);
  if (!lstatSync(folder, { throwIfNoEntry: false })) return false;
  const names = entries(folder);
  const matches = (expected: string[]) => names.length === expected.length && names.every((name, index) => name === expected[index]);
  if (matches(["diagram.svg", "technical-document.md"]) &&
    names.every(name => lstatSync(path.join(folder, name)).isFile())) return true;
  if (matches(ENTRIES) && readFileSync(path.join(folder, OWNER_FILE), "utf8") === OWNER) return true;
  throw new SampleConflict(`Sample folder ownership or file set could not be confirmed; kept ${folder}`);
}

function copySamples(source: string, destination: string): SampleDocuments {
  destination = path.resolve(destination);
  const version = readFileSync(path.join(source, "version"), "utf8");
  const paths = { ko: path.join(destination, "ko", "converter-control.md"), en: path.join(destination, "en", "converter-control.md") };
  if (managedSample(destination) && lstatSync(path.join(destination, "version"), { throwIfNoEntry: false }) &&
    readFileSync(path.join(destination, "version"), "utf8") === version) return paths;

  const parent = path.dirname(destination);
  mkdirSync(parent, { recursive: true });
  const staged = mkdtempSync(path.join(parent, `.${brand.appName}-sample-stage-`));
  try {
    // Keep ASAR reads on Electron's established single-file copy path.
    for (const language of ["ko", "en"]) {
      mkdirSync(path.join(staged, language, "assets"), { recursive: true });
      for (const file of FILES) copyFileSync(path.join(source, language, file), path.join(staged, language, file));
    }
    writeFileSync(path.join(staged, "version"), version);
    writeFileSync(path.join(staged, OWNER_FILE), OWNER);
    let backup: string | undefined;
    // Recheck after copying, before moving or deleting anything at the old path.
    if (managedSample(destination)) {
      backup = `${staged}-previous`;
      if (lstatSync(backup, { throwIfNoEntry: false })) throw new SampleConflict(`Sample backup path already exists: ${backup}`);
      renameSync(destination, backup);
    }
    try { renameSync(staged, destination); }
    catch (cause) {
      if (backup) {
        try { renameSync(backup, destination); }
        catch { throw new Error(`Sample installation failed; the previous copy is kept at ${backup}`, { cause }); }
      }
      throw cause;
    }
    if (backup && managedSample(backup)) rmSync(backup, { recursive: true });
    return paths;
  } finally {
    if (lstatSync(staged, { throwIfNoEntry: false })) {
      // Only this call's generated sibling is cleaned; never traverse a substituted junction.
      realDirectories(staged);
      if (entries(staged).some(name => !ENTRIES.includes(name))) throw new SampleConflict(`Sample staging folder changed; kept ${staged}`);
      rmSync(staged, { recursive: true });
    }
  }
}

/** A sample failure is an optional Host capability failure, never a document-start failure. */
export function prepareSampleDocuments(source: string, destination: string, onWarning: (message: string) => void = console.error): SampleAvailability {
  try { return { samples: copySamples(source, destination) }; }
  catch (cause) {
    onWarning(`Sample documents unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    return { sampleProblem: cause instanceof SampleConflict ? "conflict" : "unavailable" };
  }
}
