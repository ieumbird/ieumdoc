# Converter Control

The converter regulates the **DC-link voltage** and *phase current*.

See [Figure](#fig-control) and {eq}`eq-current`.

## Control Structure

:::{warning}
The current controller parameters must be calibrated before operation.
:::

## Control Diagram

:::{figure} ./diagram.svg
:name: fig-control
:alt: Control block diagram

Control block diagram of the grid-connected converter.
:::

## Current Reference

The current reference is calculated from the active power command.

```{math}
:label: eq-current

i^{\ast} = \frac{P^{\ast}}{V_{\mathrm{rms}}}
```

The rated current follows from [Equation](#eq-current).

## Ratings

:::{table}

| Port | Type |
| ---- | ---- |
| U    | AC   |
| P    | DC   |
:::
