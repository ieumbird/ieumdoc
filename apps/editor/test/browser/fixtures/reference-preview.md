---
ieumdoc: 1
bibliography: [refs.bib]
---

# Reading references

Read this note[^detail] without leaving the paragraph.

Evidence {cite:p}`article,standard` supports this claim.

Missing {cite}`missing` and incomplete {cite}`unsupported` keep their status.

- The repeated note[^detail] and citation {cite}`article` work in lists.

| Context | Detail |
| --- | --- |
| Table | Note[^detail] and {cite}`standard` |

```{math}
:label: eq-example
x=1
```

[^detail]: **Formatted** *endnote* with `code`, $x^2$, {eq}`eq-example`, {cite}`article` and [local diagram](diagram.svg).
