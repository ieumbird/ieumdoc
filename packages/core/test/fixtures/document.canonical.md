# Converter Control

The converter regulates voltage.

:::{note}
The current controller parameters must be calibrated before operation.
:::

The converter regulates the **DC-link voltage** and *phase current*.

## Control Structure

The control system consists of:

*   DC-link voltage controller
*   AC current controller
*   PLL

## Current Reference

The current reference is calculated from the active power command.

```{math}
i^{\ast} = \frac{P^{\ast}}{V_{\mathrm{rms}}}
```
