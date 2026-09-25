# Converter Control · 제어 설계

문서를 읽는 흐름을 먼저 생각합니다. This document describes a converter control example, with **clear structure**, *measured emphasis*, and a [design resource](https://example.com/design). 수식과 그림은 본문의 일부입니다.

:::{warning}
이 문서는 화면 검토용 예제입니다. Control parameters and diagrams are illustrative; hardware operation requires independent validation.
:::

## Control architecture · 제어 구조

The outer loop follows the voltage reference $V_{dc}^{*}$ while the inner loop shapes the current. See {eq}`eq-current` and {numref}`fig-control` for the expressions and local diagram used in this example.

```{math}
:label: eq-current
G(s) = K_p + \frac{K_i}{s} + K_d s
```

:::{figure} ./diagram.svg
:label: fig-control
:alt: Control block diagram with command, controller, and converter

제어 신호의 흐름 — command, controller, and converter.
:::

| Parameter · 항목 | Symbol | Value | Description |
| --- | --- | --- | --- |
| Input voltage | Vin | 230 V | Example input condition |
| Rated power | P | 3.3 kW | Illustrative operating point |
| DC bus voltage | Vdc | 400 V | Example regulated voltage |

짧은 문단도 같은 정렬축을 따릅니다. Each block belongs to one continuous document.

:::{note}
Note와 Warning은 의미가 있는 영역입니다. Their visual distinction remains visible while editing tools recede.
:::

### Reading details · 세부 내용

Longer prose tests the rhythm of the page. 한글과 English가 함께 있어도 줄 간격과 문단 폭은 일정해야 합니다. A reader should find the heading, follow the explanation, and understand the caption without mistaking the document for a collection of form inputs.

#### Implementation notes · 구현 기록

Existing document semantics remain in Core.

##### Review scope · 검토 범위

Visual styling belongs to the editor.

###### Supporting detail · 보충 설명

Labels remain real document data; this example adds no automatic numbering.
