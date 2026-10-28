---
ieumdoc: 1
numbering:
  headings: true
  title: false
  figure:
    template: 'Fig. %s'
  table:
    template: 'Table %s'
  equation:
    template: 'Eq. (%s)'
bibliography:
  - ./references.bib
---

# Current control for a 48 V converter

This design note develops a **current-loop baseline** for a laboratory buck converter. The values are illustrative design inputs, not measurements or a released hardware design. You can edit this sample copy; its figures and bibliography travel with the document folder.

(sec-requirements)=

## Design envelope

The converter supplies a resistive load from a nominal $48\,\mathrm{V}$ DC source. We choose a *500 Hz target bandwidth* to leave room for sampling delay at a 20 kHz control rate. The voltage command is expressed in volts before PWM normalization; `kp` therefore has units of volts per ampere.

:::{table} Nominal inputs for the current-loop calculation
:name: tbl-ratings

| Quantity          | Symbol            | Nominal value |
| ----------------- | ----------------- | ------------: |
| DC input          | $V_{\mathrm{dc}}$ |          48 V |
| Filter inductance | $L$               |          2 mH |
| Series resistance | $R$               |        0.10 Ω |
| Control rate      | $f_s$             |        20 kHz |
| Target bandwidth  | $f_c$             |        500 Hz |
:::

The values in {numref}`tbl-ratings` define one nominal operating point. Averaged converter models provide the starting framework {cite:p}`erickson2020`; this note derives its own simplified tuning below. The [publisher's book page](https://link.springer.com/book/10.1007/978-3-030-43881-4) gives the reference details.

*   Keep the voltage command within the available duty-cycle range.
*   Record the conditions that can invalidate the nominal model.

    *   Inductance changes with current and temperature.
    *   ADC filtering and computation add delay.
*   Separate analytical predictions from later bench measurements.

(sec-model)=

## Plant and control law

For the incremental current, treat the load-side voltage as a disturbance and approximate the command-to-current plant as $G(s)=1/(Ls+R)$. This excludes switching ripple, saturation and delay.[^model]

:::{figure} ./assets/current-loop.svg
:name: fig-loop
:alt: Current reference enters a PI controller and a limited voltage command drives the RL plant; measured current returns to the error summing point.

Current loop in physical voltage units, before PWM normalization.
:::

The PI zero cancels the nominal plant pole in this idealized model. With $\omega_c=2\pi f_c$, the resulting open loop is $\omega_c/s$ when

```{math}
:label: eq-gains

K_p=L\omega_c,\qquad K_i=R\omega_c.
```

Using {eq}`eq-gains` and {numref}`tbl-ratings` gives $K_p\approx6.28$ and $K_i\approx314.16$. These are continuous-time coefficients: multiply the integral term by the sample period in software. The nominal cancellation does not establish stability for the actual delayed plant.

> A calculated bandwidth is a tuning target; only the measured loop response can establish the achieved bandwidth.

:::{warning}
Keep the power stage disabled while checking polarity and sensor scaling. A sign error in the feedback path of {numref}`fig-loop` creates positive feedback.
:::

### Discrete implementation

For a sample period $T_s=50\,\mu\mathrm{s}$, the following pseudocode freezes integration when the candidate command would saturate. A separate start-up ramp and hardware protection are required before energized testing.

```python
error = reference - measured_current
candidate = integral + ki * sample_period * error
voltage = kp * error + candidate
if 0.0 <= voltage <= dc_voltage:
    integral = candidate
command = min(dc_voltage, max(0.0, voltage))
```

(sec-verification)=

## Verification sequence

The state flow in {numref}`fig-sequence` keeps the checks in {ref}`sec-requirements` separate from energized testing. Apply the model assumptions in {ref}`sec-model` before interpreting a response.

:::{figure}
:name: fig-sequence

```{mermaid}
flowchart LR
  A[Power stage disabled] --> B[Check sensing and polarity]
  B --> C[Low current test]
  C --> D[Record step response]
```

Proposed bench sequence; no test result is implied.
:::

1.  Verify the sensor offset with the power stage disabled.
2.  Use a current-limited supply and a low current reference.

    1.  Check that positive error raises the commanded voltage.
    2.  Confirm that saturation does not accumulate integral state.
3.  Record the current step response together with bus voltage and load.
4.  Compare the measured response with the nominal target and revise the model before retuning.

:::{note}
Use the same sampling rate, sensor filter and PWM update timing for every comparison. Keep the raw capture beside the design revision.
:::

## Review disposition

The nominal coefficients are ready for simulation review. Hardware approval remains open until delay, component variation and current limiting have been checked. In the next revision, attach measured evidence to {ref}`sec-verification` rather than replacing the design assumptions with unqualified performance claims.

[^model]: The RL approximation describes the incremental inductor-current path for this example. It does not model the output capacitor or close an outer voltage loop.
