import type { BibliographyEvaluation } from "@litzio/core";
import { bibliographyState } from "./citation.tsx";

/** Shared by the derived References list and the read-only citation preview. */
export function BibliographyReferenceText({ reference }: { reference: BibliographyEvaluation["references"][number] }) {
  return <div><span>{reference.parts.map((part, index) => part.emphasis ? <em key={index}>{part.text}</em> : part.text)}</span>
    {reference.status !== "complete" ? <span className="bibliography-status">{bibliographyState(reference.status)} · {reference.key}</span> : null}
  </div>;
}
