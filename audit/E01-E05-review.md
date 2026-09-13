# E01-E05 Static Review

Date: 2026-08-05

Hardware status: not run.

All ten generated files (default and core variants) pass Python syntax compilation. This does not yet prove that the ARTIQ compiler, device database, RTIO scheduler, or physical devices accept them.

## Size comparison

| ID | Default lines | Core lines | Initial interpretation |
| --- | ---: | ---: | --- |
| E01 | 131 | 30 | Most default-only content is optional metadata/run brief |
| E02 | 163 | 38 | Runtime growth follows the two extra pulses |
| E03 | 151 | 38 | Parallel nesting adds limited runtime code |
| E04 | 199 | 35 | DDS device setup adds five runtime lines over E01 |
| E05 | 302 | 51 | Metadata is large because it serializes a larger sequence |

Default-file size must not be used as a proxy for kernel complexity. The core files are the relevant comparison for runtime simplification.

## Classification

### ARTIQ required or safety-relevant

- `self.setattr_device("core")` and each used hardware device declaration.
- `@kernel` on the real-time method.
- `self.core.reset()` at the beginning of an independently submitted experiment. It clears uncertain prior RTIO state and establishes a usable timeline.
- `self.core.wait_until_mu(now_mu())` when experiment completion must mean the final submitted event has physically executed.
- TTL `on()`, timed delay, and `off()` calls representing the requested pulse.
- Urukul CPLD and AD9910 initialization when the experiment cannot assume that another experiment has already initialized the board.

### Experiment required

- `parallel` / `sequential` blocks in E03 and E05, where events overlap on different channels.
- DDS attenuation, frequency/amplitude programming, RF switch control, and duration in E04/E05.
- The outer sequence loop when repetition count is greater than one.

### Optional export content

- Sequence Builder metadata.
- Run brief and its invocation.
- Explanatory comments.

These are already removable with export options and should not be optimized by changing kernel scheduling.

### Generator redundancy candidates

- Resolved: E01 no longer emits a loop whose count is statically one.
- Resolved for a single sequence without measurement: `repetition`, `inter_loop_delay_ms`, and the unused repetition loop are omitted.
- No-counter sweep experiments use nested scan/repetition loops and do not generate a flattened total-shot variable.
- Repeated fixed experiments and fixed counter batching use `repetition` directly; they do not generate a redundant total-shot alias.
- The no-counter batching comment is useful for generated-code explanation but is not executable behavior.
- `core.reset()`, immediately followed by `core.break_realtime()` and then an additional 1 ms delay, may reserve overlapping slack. This must be checked against the installed ARTIQ version and real hardware before changing it.
- E04/E05 initialize DDS hardware for every experiment submission. This is safe and self-contained, but initialization policy could eventually be configurable for laboratories that guarantee persistent prior initialization. It should not be removed by default.

## Hardware checks for E01-E05

For every case, record the installed ARTIQ version, device database names, command used, result, and complete exception text.

1. Confirm experiment discovery/import.
2. Submit through the same path used by the laboratory (dashboard or `artiq_run`).
3. Confirm no compile-time type error.
4. Confirm no `RTIOUnderflow`, `RTIOSequenceError`, device identity error, or PLL lock error.
5. Observe TTL timing for E01-E03 and DDS frequency/amplitude/switch timing for E04-E05.
6. Only after the baseline passes, test one simplification at a time and compare behavior.
