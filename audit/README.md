# ARTIQ Generated-Code Audit

This folder tracks whether generated experiment code is valid, understandable, and no more complex than ARTIQ requires.

## Method

Each experiment has two generated files:

- `*_default.py`: normal user-facing export.
- `*_core.py`: Sequence Builder metadata and the optional run brief disabled, exposing the runtime structure for review.

Regenerate the cases with:

```bash
npm run audit:generate
```

## Test order

| ID | Experiment | Primary concern |
| --- | --- | --- |
| E01 | Single TTL pulse | Minimum runtime structure |
| E02 | Serial TTL pulses | Delays and ordering |
| E03 | Parallel TTL pulses | `parallel` / `sequential` nesting |
| E04 | Single DDS pulse | CPLD/DDS initialization and pulse setup |
| E05 | Mixed DDS and TTL | Cross-channel scheduling |
| E06 | Single counter measurement | Gate, fetch, and dataset |
| E07 | Multiple counters | Buffer/result ordering |
| E08 | Repeated experiment | Loop and batching |
| E09 | DDS sweep | Scan values and per-point execution |
| E10 | Sweep, repetitions, and counter | Complete high-complexity experiment |
| E11 | Dashboard arguments | `NumberValue` and kernel values |
| E12 | Plot-enabled experiment | Plot-only datasets and applet launch |

## Review labels

- **ARTIQ required**: removing it would break device setup, kernel timing, RTIO safety, or host/kernel separation.
- **Experiment required**: needed for the selected sequence or requested output, but not by every ARTIQ experiment.
- **Optional export content**: useful documentation or convenience that can already be disabled.
- **Generator redundancy**: removable without changing sequence timing, results, or safety.

Hardware outcomes should be recorded separately as `not run`, `passed`, or with the exact ARTIQ error and device configuration used.
