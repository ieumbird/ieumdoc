# Converter Control

The converter regulates the **DC-link voltage** and controls the AC current.

## Control Structure

The control system consists of:

- DC-link voltage controller
- AC current controller
- PLL

:::{note}
The current controller parameters must be calibrated before operation.
:::

## Current Reference

The current reference is calculated from the active power command.

$$
i^\ast = \frac{P^\ast}{V_{\mathrm{rms}}}
$$