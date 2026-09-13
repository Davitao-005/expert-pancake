# ARTIQ Sequence Builder

A browser-based visual editor that turns laboratory timing sequences into readable ARTIQ `EnvExperiment` Python files.

This project was developed during a summer research project at HKU. Its central design rule is simple: **the visual timeline is the source of truth**. Hardware configuration describes the available channels, while Python code, measurement datasets, plots, and signal manifests are derived from the same sequence.

![ARTIQ Sequence Builder interface](docs/sequence-builder-ui.png)

## What it does

- Edits multiple experiments in tabs using a channel-based timing diagram.
- Supports Urukul/AD9910 DDS, TTL output, TTL input, and TTL counter channels.
- Prevents overlaps on the same channel while allowing cross-channel parallel timing.
- Configures DDS frequency, amplitude, phase, phase mode, attenuation, and duration.
- Supports fixed values, linear sweeps, repetitions, and selected ARTIQ dashboard arguments.
- Generates ARTIQ Python continuously beside the timeline.
- Creates fixed-size datasets for counter results and optional Dashboard plots.
- Exports timeline diagrams, signal diagrams, Python, and parameter packages.
- Re-imports a generated Python file when Sequence Builder metadata was included, restoring the editable timeline and plot configuration.

## Quick start

Requirements: Node.js 18 or newer and npm.

```bash
git clone https://github.com/Davitao-005/expert-pancake.git
cd artiq-sequence-builder
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173/`.

To create a production build:

```bash
npm run build
```

The generated experiment imports ARTIQ APIs but the web editor itself does not require ARTIQ. Running exported Python on hardware requires a working ARTIQ installation and device names matching the laboratory's `device_db.py`.

## Typical workflow

1. Select the hardware channels used by the experiment.
2. Add DDS signals, TTL pulses, and counter gates to the timeline.
3. Edit timing and parameters in the module-properties panel.
4. Configure repetitions, inter-sequence delay, start slack, sweeps, arguments, and plots as needed.
5. Review the generated Python and signal manifest.
6. Turn **Metadata** on if the Python should remain importable by this editor.
7. Export the `.py` file and run it through the laboratory's normal ARTIQ workflow.

To continue editing an earlier export, click **Import Python**. Import is intentionally limited to files containing the delimited Sequence Builder metadata block; arbitrary Python is not reverse-engineered into a timeline.

## Generated-code formats

The generator chooses the smallest runtime structure that preserves the requested timing. Full reproducible files are in [`audit/generated`](audit/generated); the compact patterns below show the important forms.

### 1. One fixed TTL pulse

No unnecessary outer loop is emitted when the sequence runs once.

```python
@kernel
def run_kernel(self):
    self.core.reset()
    self.core.break_realtime()
    self.ttl0.on()
    delay(1.0 * ms)
    self.ttl0.off()
    self.core.wait_until_mu(now_mu())
```

See [`e01_core.py`](audit/generated/e01_core.py).

### 2. Serial tasks on one channel

Tasks are ordered by start time. Delays represent real gaps between neighbouring tasks, rather than absolute timestamps repeated throughout the file.

```python
self.ttl0.on()
delay(1.0 * ms)
self.ttl0.off()
delay(1.0 * ms)
self.ttl0.on()
delay(0.5 * ms)
self.ttl0.off()
```

See [`e02_core.py`](audit/generated/e02_core.py).

### 3. Parallel tasks on different channels

Each physical channel becomes a `sequential` lane inside one `parallel` block. This mirrors the visual timeline and keeps delays local to each channel.

```python
with parallel:
    # Channel: ttl0
    with sequential:
        self.ttl0.on()
        delay(3.0 * ms)
        self.ttl0.off()
    # Channel: ttl1
    with sequential:
        delay(1.0 * ms)
        self.ttl1.on()
        delay(1.0 * ms)
        self.ttl1.off()
```

See [`e03_core.py`](audit/generated/e03_core.py) and the mixed DDS/TTL example [`e05_core.py`](audit/generated/e05_core.py).

### 4. DDS pulse

DDS hardware is initialized explicitly. Frequency, amplitude, phase, phase mode, and attenuation are applied before switching RF on.

```python
self.urukul0_cpld.init()
self.urukul0_ch0.init()
self.urukul0_ch0.set_att(10.0 * dB)
self.urukul0_ch0.set(
    80.0 * MHz,
    amplitude=0.5,
    phase=0.0 / 360.0,
    phase_mode=PHASE_MODE_ABSOLUTE,
)
self.urukul0_ch0.sw.on()
delay(2.0 * ms)
self.urukul0_ch0.sw.off()
```

See [`e04_core.py`](audit/generated/e04_core.py).

For consecutive tasks on the same DDS channel, `CONTINUOUS` can reuse an unchanged frequency/amplitude/phase configuration across an RF-off gap. A changed waveform, `ABSOLUTE`, or `TRACKING` causes a new `set()` call. Attenuation is compared independently.

### 5. Repetitions without a sweep

Fixed sequences use `self.repetition`. Counter experiments fetch in configurable batches so a long acquisition does not leave all results queued until the end.

```python
for batch_start in range(0, self.repetition, self.sequence_batch_size):
    batch_end = min(batch_start + self.sequence_batch_size, self.repetition)
    for shot_index in range(batch_start, batch_end):
        # run the sequence and gate counters
        pass
    self.core.break_realtime()
    # fetch and publish this batch
```

Without a counter, the generator uses a direct repetition loop and omits batching state.

### 6. TTL counter measurements

Counter gates execute in the kernel and results are published into host-created, fixed-size NumPy datasets.

```python
# Host-side setup
self.set_dataset(
    "measurement.ttl8_counter.counts",
    np.full(self.repetition, -1, dtype=np.int32),
    broadcast=True,
    archive=True,
)

# Kernel-side measurement
gate_end_mu = self.ttl8_counter.gate_rising(2.0 * ms)
pmt_counts = self.ttl8_counter.count(gate_end_mu)
self.mutate_dataset(
    "measurement.ttl8_counter.counts", shot_index, pmt_counts
)
```

The exact gate/fetch form is selected for the supported counter path. Multiple counters keep separate result buffers and datasets.

### 7. Sweeps

Exactly one parameter may provide the scan axis for a generated experiment. The scan loop is outside the per-point repetition loop.

```python
for scan_index in range(self.scan_points):
    scan_value_frequency = 78.0 + 0.5 * scan_index
    for repetition_index in range(self.repetition_num_per_point):
        # use scan_value_frequency in the sequence
        pass
```

Sweep plus counter output uses:

- `measurement.<counter>.average_counts`, shape `(scan_points,)`;
- `measurement.<counter>.raw_counts`, shape `(scan_points * repetitions,)`, when repetitions per point are greater than one;
- `shot_index = scan_index * repetitions + repetition_index` for the flattened raw array.

Sweep metadata stays in the optional run brief and embedded builder metadata instead of filling the ARTIQ dataset table with descriptive values.

### 8. Dashboard arguments

Selected numeric values can be exposed without making the experiment structure mutable.

```python
def build(self):
    self.setattr_argument(
        "repump_amplitude",
        NumberValue(default=0.35, min=0.0, max=1.0),
    )

# Later in the kernel
self.urukul0_ch1.set(120.0 * MHz, amplitude=self.repump_amplitude)
```

Supported arguments are DDS frequency, amplitude, phase, duration, attenuation, and TTL-output duration. A swept parameter cannot simultaneously be an argument. Channel selection, task existence, enable state, and timing structure remain fixed by the timeline.

### 9. Plot-enabled experiments

Plots are optional and drive only the extra datasets they require. For example, a scan-average plot requests `scan_index`; a raw-shot plot requests `shot_index`; count-rate arrays are created only for count-rate plots.

```python
def launch_applets(self):
    self.ccb.issue(
        "create_applet",
        "PMT counts",
        "${artiq_applet}plot_xy measurement.ttl8_counter.average_counts "
        "--x scan_index",
        group="Sequence Builder",
    )
```

Automatic opening requires one Dashboard setting: **Applets → Global CCB policy → Create and enable/disable applets**.

### 10. Importable Python

When **Metadata** is enabled, the export contains commented JSON between stable markers:

```python
# --- SEQUENCE_BUILDER_METADATA_START ---
# {
#   "schemaVersion": 1,
#   "format": "ARTIQ Sequence Builder",
#   "editorState": { ... },
#   "plots": [ ... ]
# }
# --- SEQUENCE_BUILDER_METADATA_END ---
```

ARTIQ ignores the comments. The web UI validates this block and reconstructs the experiment. **Run brief** is independent: it adds concise human-readable runtime output and is not required for import.

## Result dataset rules

| Experiment | Always generated | Plot-driven additions |
| --- | --- | --- |
| Fixed, counter | `measurement.<counter>.counts` | `shot_index`, `count_rate` |
| Sweep, one repetition | `measurement.<counter>.average_counts` | `scan_index`, `average_count_rate` |
| Sweep, repeated | `average_counts` and flattened `raw_counts` | `scan_index`, `shot_index`, average/raw count rate |
| No counter | No measurement dataset | Only datasets required by a valid enabled plot |

Disabled or invalid plot definitions do not alter the generated experiment.

## Validation and audit

```bash
npm run test:generator
npm run test:packages
npm run test:package-ui
npm run audit:generate
npm run build
```

The audit directory contains metadata-on user exports and metadata/run-brief-off core exports, making generated-code complexity easy to compare. See [`audit/README.md`](audit/README.md) and [`audit/E01-E05-review.md`](audit/E01-E05-review.md).

The generator and UI have automated/static validation, but the repository does **not** claim universal hardware validation. Before laboratory use, check device names, installed ARTIQ version, RTIO slack, Urukul initialization policy, electrical routing, and observed timing on the target system.

## Project structure

```text
src/App.tsx                    main visual editor
src/pythonGenerator.ts        ARTIQ Python generation
src/pythonMetadataImport.ts   generated-Python metadata parser
src/validation.ts             timeline validation
src/plotDatasets.ts           dataset/plot compatibility rules
src/experimentStorage.ts      saved experiment normalization
scripts/                      regression and audit scripts
audit/                        generated examples and review notes
```

## Scope and future work

This version is a sequence authoring and code-generation tool, not a replacement for the ARTIQ Dashboard or a general Python-to-diagram decompiler. Possible future work includes laboratory-specific channel configuration import, richer static analysis of arbitrary ARTIQ files, and hardware-in-the-loop timing tests.

## Acknowledgements

This repository marks the completion of my summer research project at HKU. Thank you to the teachers and researchers who discussed experimental requirements, challenged edge cases, and helped turn the initial idea into a working visual-to-ARTIQ workflow.
