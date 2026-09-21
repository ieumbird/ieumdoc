export type MystNode = {
  type: string;
  children?: MystNode[];
  value?: string;
  depth?: number;
  name?: string;
  kind?: string;
  ordered?: boolean;
  spread?: boolean;
  position?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  [key: string]: unknown;
};

export type ParsedDocument = {
  source: string;
  ast: MystNode;
};
