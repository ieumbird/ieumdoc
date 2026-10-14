import { writeIssueOf } from "@ieumdoc/core";
import type { OrderItem } from "./document-protocol.ts";

export type SaveFailure = {
  phase: "collect" | "replay" | "serialize" | "revision" | "file" | "request" | "transport";
  action: string;
  target?: OrderItem;
  /** Zero-based location in the submitted Editor snapshot, never the live edited document. */
  block?: { index: number; type: string };
  cell?: { row: number; column: number };
  line?: number;
};

/** Adds context; the original reason and cause remain intact. */
export class SaveContentError extends Error implements SaveFailure {
  readonly phase: SaveFailure["phase"];
  readonly action: string;
  readonly block?: SaveFailure["block"];
  readonly cell?: SaveFailure["cell"];
  readonly line?: number;
  constructor(readonly reason: string, readonly target?: OrderItem, options: ErrorOptions & Partial<SaveFailure> = {}) {
    super(options.block ? `Block ${options.block.index + 1} (${options.block.type}): ${reason}` : reason, options);
    this.phase = options.phase ?? "replay";
    this.action = options.action ?? writeIssueOf(options.cause ?? this).action;
    this.block = options.block;
    this.cell = options.cell;
    this.line = options.line;
  }
}
