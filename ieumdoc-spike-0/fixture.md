# Converter Control

The converter regulates the **DC-link voltage** and *phase current*.

See [](#fig-control) and {eq}`eq-current`.

## Control Structure

The control system consists of:

- DC-link voltage controller
- AC current controller
- PLL

:::{warning}
The current controller parameters must be calibrated before operation.
:::

## Control Diagram

:::{figure} ./diagram.svg
:label: fig-control
:alt: Control block diagram

Control block diagram of the grid-connected converter.
:::

## Current Reference

The current reference is calculated from the active power command.

```{math}
:label: eq-current
i^{\ast} = \frac{P^{\ast}}{V_{\mathrm{rms}}}
```

The rated current follows from [](#eq-current).

## Ratings

```{list-table} Converter ratings
:header-rows: 2
:label: tbl-ratings

* - Item
  - Rated values
  - Rated values
* -
  - Continuous
  - Peak
* - Voltage
  - 400 V
  - 450 V
* - Current
  - 12 A
  - 18 A
```

A compact GFM table is also used:

| Port | Type |
| --- | --- |
| U | AC |
| P | DC |

## Combined ratings

Merged cells describe grouped limits:

:::{table} Combined rating groups
:label: tbl-merged

<table>
  <tr>
    <th rowspan="2">Group</th>
    <th colspan="2">Limit</th>
  </tr>
  <tr>
    <th>Min</th>
    <th>Max</th>
  </tr>
  <tr>
    <td rowspan="2">DC-link</td>
    <td>650 V</td>
    <td>800 V</td>
  </tr>
  <tr>
    <td>10 A</td>
    <td>15 A</td>
  </tr>
</table>
:::

## Shared notes

:::{include} included.md
:::
