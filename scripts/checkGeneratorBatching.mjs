import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const outDir = "/private/tmp/artiq-sequence-builder-generator-test";

rmSync(outDir, { force: true, recursive: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/package.json`, JSON.stringify({ type: "commonjs" }));
execFileSync(
  "./node_modules/.bin/tsc",
  [
    "--outDir",
    outDir,
    "--module",
    "CommonJS",
    "--moduleResolution",
    "Node",
    "--target",
    "ES2022",
    "--jsx",
    "react-jsx",
    "--strict",
    "true",
    "--esModuleInterop",
    "true",
    "--noEmit",
    "false",
    "--skipLibCheck",
    "src/pythonGenerator.ts",
    "src/pythonMetadataImport.ts"
  ],
  { stdio: "pipe" }
);

const { generateArtiqPython, getArtiqGenerationError } = await import(pathToFileURL(`${outDir}/pythonGenerator.js`).href);
const { getAppletCommandSpecs, getAvailablePlotDatasets, getCompatiblePlotYDatasets, isPlotValid } = await import(pathToFileURL(`${outDir}/plotDatasets.js`).href);
const { applySequenceBuilderMetadataToEditor } = await import(pathToFileURL(`${outDir}/pythonMetadataImport.js`).href);

const availableChannels = [
  { id: "ttl0", label: "ttl0", type: "ttl_output" },
  { id: "ttl8_counter", label: "ttl8_counter", type: "ttl_counter" },
  { id: "ttl9_counter", label: "ttl9_counter", type: "ttl_counter" }
];

const baseState = {
  sequenceName: "batch_test",
  className: "BatchTest",
  fetchBatchSize: 100,
  pixelsPerMs: 70,
  snapGridMs: 0.1,
  loop: {
    count: 250,
    interLoopDelayMs: 0.25,
    interLoopDelayUnit: "ms"
  },
  availableChannels,
  visibleChannelIds: ["ttl0", "ttl8_counter", "ttl9_counter"],
  modules: [
    {
      id: "ttl-pulse",
      type: "ttl_output",
      name: "TTL pulse",
      channel: "ttl0",
      startMs: 0,
      durationMs: 1,
      gapAfterPrevious: 0,
      locked: false,
      timeUnit: "ms"
    },
    {
      id: "counter",
      type: "measure",
      name: "PMT gate",
      channel: "ttl8_counter",
      startMs: 2,
      durationMs: 3,
      gapAfterPrevious: 2,
      locked: false,
      timeUnit: "ms",
      datasetName: "pmt_counts",
      edge: "rising"
    },
    {
      id: "counter-2",
      type: "measure",
      name: "Camera gate",
      channel: "ttl9_counter",
      startMs: 6,
      durationMs: 2,
      gapAfterPrevious: 6,
      locked: false,
      timeUnit: "ms",
      datasetName: "camera_counts",
      edge: "rising"
    }
  ]
};

const fixedPython = generateArtiqPython(baseState, []);

const importedLegacyAveragePlots = applySequenceBuilderMetadataToEditor(
  {
    schemaVersion: 1,
    editorState: baseState,
    plots: [
      { id: "legacy-counts", name: "legacy counts", type: "plot_xy", x: "scan_index", y: "measurement.ttl8_counter.counts", group: "Measurement", enabled: true },
      { id: "legacy-rate", name: "legacy rate", type: "plot_xy", x: "scan_index", y: "measurement.ttl8_counter.count_rate", group: "Measurement", enabled: true },
      { id: "current-average", name: "current average", type: "plot_xy", x: "scan_index", y: "measurement.ttl8_counter.average_counts", group: "Measurement", enabled: true }
    ]
  },
  baseState
).plots;
assert.deepEqual(
  importedLegacyAveragePlots.map((plot) => plot.y),
  [
    "measurement.ttl8_counter.average_counts",
    "measurement.ttl8_counter.average_count_rate",
    "measurement.ttl8_counter.average_counts"
  ]
);

const repeatedSweepPlotDatasets = getAvailablePlotDatasets(baseState.modules, undefined, true, true);
assert.deepEqual(repeatedSweepPlotDatasets.x, ["scan_index", "shot_index"]);
assert.deepEqual(
  getCompatiblePlotYDatasets("scan_index", repeatedSweepPlotDatasets),
  [
    "measurement.ttl8_counter.average_counts",
    "measurement.ttl8_counter.average_count_rate",
    "measurement.ttl9_counter.average_counts",
    "measurement.ttl9_counter.average_count_rate"
  ]
);
assert.deepEqual(
  getCompatiblePlotYDatasets("shot_index", repeatedSweepPlotDatasets),
  [
    "measurement.ttl8_counter.raw_counts",
    "measurement.ttl8_counter.raw_count_rate",
    "measurement.ttl9_counter.raw_counts",
    "measurement.ttl9_counter.raw_count_rate"
  ]
);
assert.equal(
  isPlotValid(
    { id: "valid", name: "valid", type: "plot_xy", x: "shot_index", y: "measurement.ttl8_counter.raw_counts", group: "Measurement", enabled: true },
    repeatedSweepPlotDatasets
  ),
  true
);
assert.equal(
  isPlotValid(
    { id: "invalid", name: "invalid", type: "plot_xy", x: "scan_index", y: "measurement.ttl8_counter.raw_counts", group: "Measurement", enabled: true },
    repeatedSweepPlotDatasets
  ),
  false
);
assert.deepEqual(
  getAppletCommandSpecs(
    [
      { id: "same-name-1", name: "Counter plot", type: "plot_xy", x: "scan_index", y: "measurement.ttl8_counter.average_counts", group: "Measurement", enabled: true },
      { id: "same-name-2", name: "Counter plot", type: "plot_xy", x: "scan_index", y: "measurement.ttl9_counter.average_counts", group: "Measurement", enabled: true }
    ],
    repeatedSweepPlotDatasets
  ).map((spec) => spec.name),
  ["Counter plot", "Counter plot (2)"]
);
const singleRepetitionSweepPlotDatasets = getAvailablePlotDatasets(baseState.modules, undefined, true, false);
assert.deepEqual(singleRepetitionSweepPlotDatasets.x, ["scan_index"]);
assert.doesNotMatch(singleRepetitionSweepPlotDatasets.y.join("\n"), /raw_counts|raw_count_rate/);

const pythonRuntimeCode = (python) => {
  const marker = "# --- SEQUENCE_BUILDER_METADATA_END ---";
  const markerIndex = python.indexOf(marker);
  return markerIndex === -1 ? python : python.slice(markerIndex + marker.length);
};

const assertKernelEndsWithTimelineWait = (python) => {
  const waitNeedle = "self.core.wait_until_mu(now_mu())";
  assert.match(python, /self\.core\.wait_until_mu\(now_mu\(\)\)/);
  assert.ok(
    python.lastIndexOf(waitNeedle) < python.indexOf("\n    def run(self):"),
    "kernel timeline completion wait should appear before host-side run()"
  );
};

const assertUsesFlatRawCounts = (python) => {
  assert.match(
    python,
    /set_dataset\("measurement\.ttl8_counter\.raw_counts", np\.full\(self\.scan_points \* self\.repetition_num_per_point, -1, dtype=np\.int32\)/
  );
  assert.doesNotMatch(
    python,
    /raw_counts", \(/,
    "Sweep raw counts must use one-dimensional shot_index writes"
  );
};

assertKernelEndsWithTimelineWait(fixedPython);
assert.match(fixedPython, /SEQUENCE_BUILDER_METADATA_START/);
const fixedPythonWithoutMetadata = generateArtiqPython(baseState, [], { includeSequenceBuilderMetadata: false });
assert.doesNotMatch(fixedPythonWithoutMetadata, /SEQUENCE_BUILDER_METADATA_START/);
assert.doesNotMatch(fixedPythonWithoutMetadata, /SEQUENCE_BUILDER_METADATA_END/);
assert.match(fixedPythonWithoutMetadata, /from artiq\.experiment import \*/);
assert.match(fixedPython, /def print_run_brief\(self\):/);
assert.match(fixedPython, /self\.print_run_brief\(\)/);
const fixedPythonWithoutRunBrief = generateArtiqPython(baseState, [], { includeRunBrief: false });
assert.doesNotMatch(fixedPythonWithoutRunBrief, /def print_run_brief\(self\):/);
assert.doesNotMatch(fixedPythonWithoutRunBrief, /self\.print_run_brief\(\)/);

const fixedPythonWithArguments = generateArtiqPython(
  {
    ...baseState,
    modules: [
      {
        ...baseState.modules[0],
        argumentConfig: {
          ttlDuration: {
            enabled: true,
            name: "ttl_pulse_duration"
          }
        }
      },
      {
        id: "dds-argument",
        type: "dds",
        name: "Repump DDS",
        channel: "urukul0_ch0",
        startMs: 10,
        durationMs: 2,
        gapAfterPrevious: 10,
        locked: false,
        timeUnit: "ms",
        frequencyMHz: 120,
        amplitude: 0.35,
        phaseDeg: 0,
        phaseMode: "absolute",
        attenuationDb: 10,
        ddsParameters: {
          frequency: {
            value: 120,
            unit: "MHz",
            sweep: {
              enabled: false,
              start: 120,
              end: 120,
              step: 0,
              points: 1,
              invalid: false,
              error: "",
              lastEditedFields: []
            }
          },
          amplitude: {
            value: 0.35,
            unit: "",
            sweep: {
              enabled: false,
              start: 0.35,
              end: 0.35,
              step: 0,
              points: 1,
              invalid: false,
              error: "",
              lastEditedFields: []
            }
          },
          phase: {
            value: 0,
            unit: "deg",
            sweep: {
              enabled: false,
              start: 0,
              end: 0,
              step: 0,
              points: 1,
              invalid: false,
              error: "",
              lastEditedFields: []
            }
          },
          duration: {
            value: 2,
            unit: "ms",
            sweep: {
              enabled: false,
              start: 2,
              end: 2,
              step: 0,
              points: 1,
              invalid: false,
              error: "",
              lastEditedFields: []
            }
          }
        },
        argumentConfig: {
          dds: {
            amplitude: {
              enabled: true,
              name: "repump_amp"
            },
            attenuation: {
              enabled: true,
              name: "repump_att"
            }
          }
        }
      },
      baseState.modules[1],
      baseState.modules[2]
    ]
  },
  []
);
assert.match(fixedPythonWithArguments, /self\.setattr_argument\("ttl_pulse_duration", NumberValue\(default=1\.0, min=0\.0\)\)/);
assert.match(fixedPythonWithArguments, /self\.setattr_argument\("repump_amp", NumberValue\(default=0\.35, min=0\.0, max=1\.0\)\)/);
assert.match(fixedPythonWithArguments, /self\.setattr_argument\("repump_att", NumberValue\(default=10\.0, min=0\.0, max=31\.5\)\)/);
assert.match(fixedPythonWithArguments, /from artiq\.coredevice\.ad9910 import PHASE_MODE_ABSOLUTE, PHASE_MODE_CONTINUOUS, PHASE_MODE_TRACKING/);
assert.match(fixedPythonWithArguments, /delay\(self\.ttl_pulse_duration \* ms\)/);
assert.match(fixedPythonWithArguments, /self\.urukul0_ch0\.set_att\(self\.repump_att \* dB\)/);
assert.match(fixedPythonWithArguments, /self\.urukul0_ch0\.set\(120\.0 \* MHz, amplitude=self\.repump_amp, phase=0\.0 \/ 360\.0, phase_mode=PHASE_MODE_ABSOLUTE\)/);

assert.match(fixedPython, /self\.sequence_batch_size = 100/);
assert.doesNotMatch(fixedPython, /Warning: fetch batch size/);
assert.match(fixedPython, /for batch_start in range\(0, self\.repetition, self\.sequence_batch_size\):/);
assert.match(fixedPython, /for shot_index in range\(batch_start, batch_end\):/);
assert.match(fixedPython, /pmt_counts_raw_buffer = \[0\] \* self\.repetition/);
assert.match(fixedPython, /pmt_counts_raw_buffer\[shot_index\] = pmt_counts/);
assert.match(fixedPython, /camera_counts_raw_buffer = \[0\] \* self\.repetition/);
assert.match(fixedPython, /camera_counts_raw_buffer\[shot_index\] = camera_counts/);
assert.match(fixedPython, /for shot_index in range\(self\.repetition\):/);
assert.doesNotMatch(fixedPython, /logical_index/);
assert.doesNotMatch(fixedPython, /set_dataset\("shot_index"/);
assert.doesNotMatch(fixedPython, /count_rate/);
assert.doesNotMatch(fixedPython, /def launch_applets|self\.launch_applets\(\)/);
assert.doesNotMatch(fixedPython, /setattr_device\("ccb"\)/);
assert.doesNotMatch(fixedPython, /pmt_counts_value|camera_counts_value/);
assert.match(fixedPython, /mutate_dataset\("measurement\.ttl8_counter\.counts", shot_index, pmt_counts_raw_buffer\[shot_index\]\)/);
assert.doesNotMatch(fixedPython, /metadata\./);
assert.match(fixedPython, /Batch boundary only: this recovers RTIO slack and is not a physical sequence gap\./);
assert.match(fixedPython, /# Phase C: after all batches are complete, publish datasets in shot order\./);
assert.doesNotMatch(fixedPython, /while True:/);
assert.doesNotMatch(fixedPython, /loopMode/);
assert.ok(
  fixedPython.indexOf("# Phase A: schedule timing for this batch only") <
    fixedPython.indexOf("pmt_counts = self.ttl8_counter.fetch_count()"),
  "counter fetch should appear after timing phase"
);
assert.ok(
  fixedPython.indexOf("pmt_counts = self.ttl8_counter.fetch_count()") <
    fixedPython.indexOf('self.mutate_dataset("measurement.ttl8_counter.counts"'),
  "dataset writes should appear after batch readout"
);
assert.ok(
  fixedPython.indexOf("camera_counts = self.ttl9_counter.fetch_count()") <
    fixedPython.indexOf('self.mutate_dataset("measurement.ttl9_counter.counts"'),
  "second counter dataset writes should appear after batch readout"
);

const minBatchPython = generateArtiqPython({ ...baseState, fetchBatchSize: 1, loop: { ...baseState.loop, count: 1 } }, []);
assert.doesNotMatch(minBatchPython, /self\.sequence_batch_size/);
assert.doesNotMatch(minBatchPython, /for batch_start/);
assert.doesNotMatch(minBatchPython, /raw_buffer/);
assert.doesNotMatch(minBatchPython, /for logical_index/);
assert.match(minBatchPython, /pmt_counts = self\.ttl8_counter\.fetch_count\(\)/);
assert.match(minBatchPython, /self\.mutate_dataset\("measurement\.ttl8_counter\.counts", 0, pmt_counts\)/);

const repeatedMinBatchPython = generateArtiqPython({ ...baseState, fetchBatchSize: 1, loop: { ...baseState.loop, count: 3 } }, []);
assert.doesNotMatch(repeatedMinBatchPython, /self\.sequence_batch_size|for batch_start|raw_buffer/);
assert.match(repeatedMinBatchPython, /for repetition_index in range\(self\.repetition\):/);
assert.match(repeatedMinBatchPython, /pmt_counts = self\.ttl8_counter\.fetch_count\(\)/);
assert.match(repeatedMinBatchPython, /self\.mutate_dataset\("measurement\.ttl8_counter\.counts", repetition_index, pmt_counts\)/);

const maxBatchPython = generateArtiqPython({ ...baseState, fetchBatchSize: 100 }, []);
assert.match(maxBatchPython, /self\.sequence_batch_size = 100/);

assert.match(getArtiqGenerationError({ ...baseState, fetchBatchSize: 0 }), /Fetch batch must be an integer from 1 to 100/);
assert.match(getArtiqGenerationError({ ...baseState, fetchBatchSize: 101 }), /Fetch batch must be an integer from 1 to 100/);
assert.match(getArtiqGenerationError({ ...baseState, fetchBatchSize: 1.5 }), /Fetch batch must be an integer from 1 to 100/);

const divisibleBatchPython = generateArtiqPython({ ...baseState, fetchBatchSize: 25, loop: { ...baseState.loop, count: 100 } }, []);
assert.match(divisibleBatchPython, /self\.sequence_batch_size = 25/);
assert.match(divisibleBatchPython, /batch_end = min\(batch_start \+ self\.sequence_batch_size, self\.repetition\)/);

const partialBatchPython = generateArtiqPython({ ...baseState, fetchBatchSize: 40, loop: { ...baseState.loop, count: 150 } }, []);
assert.match(partialBatchPython, /self\.sequence_batch_size = 40/);
assert.match(partialBatchPython, /batch_end = min\(batch_start \+ self\.sequence_batch_size, self\.repetition\)/);

const smallTotalPython = generateArtiqPython({ ...baseState, fetchBatchSize: 100, loop: { ...baseState.loop, count: 10 } }, []);
assert.doesNotMatch(smallTotalPython, /self\.sequence_batch_size|batch_start|batch_end|raw_buffer|logical_index/);
assert.match(smallTotalPython, /All shots fit in one fetch batch/);
assert.equal((smallTotalPython.match(/for repetition_index in range\(self\.repetition\):/g) ?? []).length, 2);
assert.match(smallTotalPython, /self\.mutate_dataset\("measurement\.ttl8_counter\.counts", repetition_index, pmt_counts\)/);

const reportedThreeOfTenPython = generateArtiqPython(
  {
    ...baseState,
    className: "NewExperiment5",
    fetchBatchSize: 10,
    loop: { ...baseState.loop, count: 3, interLoopDelayMs: 0 },
    modules: [baseState.modules[1]],
    visibleChannelIds: ["ttl8_counter"]
  },
  [],
  { includeSequenceBuilderMetadata: false, includeRunBrief: false }
);
assert.match(reportedThreeOfTenPython, /self\.repetition = 3/);
assert.doesNotMatch(reportedThreeOfTenPython, /sequence_batch_size|batch_start|batch_end|logical_index|raw_buffer|Phase A\/B|Phase C/);
assert.equal((reportedThreeOfTenPython.match(/for repetition_index in range\(self\.repetition\):/g) ?? []).length, 2);
assert.match(reportedThreeOfTenPython, /self\.ttl8_counter\.gate_rising\(3\.0 \* ms\)/);
assert.match(reportedThreeOfTenPython, /pmt_counts = self\.ttl8_counter\.fetch_count\(\)/);
assert.match(reportedThreeOfTenPython, /self\.mutate_dataset\("measurement\.ttl8_counter\.counts", repetition_index, pmt_counts\)/);

const equalBatchPython = generateArtiqPython({ ...baseState, fetchBatchSize: 100, loop: { ...baseState.loop, count: 100 } }, []);
assert.doesNotMatch(equalBatchPython, /self\.sequence_batch_size|batch_start|batch_end|raw_buffer|logical_index/);
assert.match(equalBatchPython, /All shots fit in one fetch batch/);

const sweepState = {
  ...baseState,
  fetchBatchSize: 4,
  loop: {
    ...baseState.loop,
    count: 3
  },
  modules: [
    {
      ...baseState.modules[0],
      ttlDurationSweep: {
        enabled: true,
        start: 1,
        end: 3,
        step: 1,
        points: 3,
        invalid: false,
        error: "",
        lastEditedFields: ["end"]
      }
    },
    baseState.modules[1],
    baseState.modules[2]
  ]
};

const sweepPython = generateArtiqPython(sweepState, []);
const sweepPythonWithoutRunBrief = generateArtiqPython(sweepState, [], { includeRunBrief: false });
const sweepPythonWithSweptDurationArgument = generateArtiqPython(
  {
    ...sweepState,
    modules: [
      {
        ...sweepState.modules[0],
        argumentConfig: {
          ttlDuration: {
            enabled: true,
            name: "swept_ttl_duration"
          }
        }
      },
      sweepState.modules[1],
      sweepState.modules[2]
    ]
  },
  []
);

assertKernelEndsWithTimelineWait(sweepPython);
assert.doesNotMatch(sweepPython, /self\.repetitions\s*=/);
assert.doesNotMatch(sweepPythonWithoutRunBrief, /def print_run_brief\(self\):/);
assert.doesNotMatch(sweepPythonWithoutRunBrief, /self\.print_run_brief\(\)/);
assert.doesNotMatch(pythonRuntimeCode(sweepPythonWithSweptDurationArgument), /swept_ttl_duration/);
assert.match(sweepPython, /self\.total_shoot = self\.scan_points \* self\.repetition_num_per_point/);
assert.match(sweepPython, /self\.sequence_batch_size = 4/);
assert.doesNotMatch(sweepPython, /Warning: fetch batch size/);
assert.match(sweepPython, /scan_index = shot_index \/\/ self\.repetition_num_per_point/);
assert.doesNotMatch(sweepPython, /repetition_index = shot_index % self\.repetition_num_per_point/);
assert.match(sweepPython, /pmt_counts_raw_buffer = \[0\] \* self\.total_shoot/);
assert.match(sweepPython, /camera_counts_raw_buffer = \[0\] \* self\.total_shoot/);
assert.match(sweepPython, /shot_index = scan_index \* self\.repetition_num_per_point \+ repetition_index/);
assert.doesNotMatch(sweepPython, /logical_index/);
assert.match(sweepPython, /self\.mutate_dataset\("measurement\.ttl8_counter\.raw_counts", shot_index, pmt_counts\)/);
assert.match(sweepPython, /self\.mutate_dataset\("measurement\.ttl9_counter\.raw_counts", shot_index, camera_counts\)/);
assertUsesFlatRawCounts(sweepPython);
assert.doesNotMatch(sweepPython, /set_dataset\("scan_parameter"/);
assert.doesNotMatch(sweepPython, /set_dataset\("scan_unit"/);
assert.doesNotMatch(sweepPython, /set_dataset\("scan_channel"/);
assert.doesNotMatch(sweepPython, /set_dataset\("scan_start"/);
assert.doesNotMatch(sweepPython, /set_dataset\("scan_end"/);
assert.doesNotMatch(sweepPython, /set_dataset\("scan_step"/);
assert.doesNotMatch(sweepPython, /set_dataset\("scan_points"/);
assert.doesNotMatch(sweepPython, /set_dataset\("scan_x"|mutate_dataset\("scan_x"/);
assert.doesNotMatch(sweepPython, /raw_count_rate/);
assert.doesNotMatch(sweepPython, /def launch_applets|self\.launch_applets\(\)/);
assert.doesNotMatch(sweepPython, /setattr_device\("ccb"\)/);
assert.doesNotMatch(sweepPython, /metadata\./);
assert.equal((sweepPython.match(/scan_value_ttl_duration = 1\.0 \+ 1\.0 \* scan_index/g) ?? []).length, 1);

const sweepMinBatchPython = generateArtiqPython({ ...sweepState, fetchBatchSize: 1 }, []);
assert.doesNotMatch(sweepMinBatchPython, /self\.sequence_batch_size|for batch_start|raw_buffer|logical_index/);
assert.match(sweepMinBatchPython, /for scan_index in range\(self\.scan_points\):/);
assert.match(sweepMinBatchPython, /for repetition_index in range\(self\.repetition_num_per_point\):/);
assert.match(sweepMinBatchPython, /pmt_counts = self\.ttl8_counter\.fetch_count\(\)/);
assert.match(sweepMinBatchPython, /shot_index = scan_index \* self\.repetition_num_per_point \+ repetition_index/);
assert.match(sweepMinBatchPython, /self\.mutate_dataset\("measurement\.ttl8_counter\.raw_counts", shot_index, pmt_counts\)/);
assertUsesFlatRawCounts(sweepMinBatchPython);
assert.doesNotMatch(sweepMinBatchPython, /pmt_counts_average\s*=/);
assert.match(sweepMinBatchPython, /mutate_dataset\("measurement\.ttl8_counter\.average_counts", scan_index, pmt_counts_sum \/ self\.repetition_num_per_point\)/);

const sweepWholeBatchPython = generateArtiqPython({ ...sweepState, fetchBatchSize: 9 }, []);
assert.doesNotMatch(sweepWholeBatchPython, /self\.total_shoot|self\.sequence_batch_size|batch_start|batch_end|raw_buffer|logical_index/);
assert.match(sweepWholeBatchPython, /All shots fit in one fetch batch/);
assert.equal((sweepWholeBatchPython.match(/for scan_index in range\(self\.scan_points\):/g) ?? []).length, 2);
assert.equal((sweepWholeBatchPython.match(/for repetition_index in range\(self\.repetition_num_per_point\):/g) ?? []).length, 2);
assert.match(sweepWholeBatchPython, /shot_index = scan_index \* self\.repetition_num_per_point \+ repetition_index/);
assert.match(sweepWholeBatchPython, /self\.mutate_dataset\("measurement\.ttl8_counter\.raw_counts", shot_index, pmt_counts\)/);
assertUsesFlatRawCounts(sweepWholeBatchPython);
assert.doesNotMatch(sweepWholeBatchPython, /pmt_counts_average\s*=/);
assert.match(sweepWholeBatchPython, /mutate_dataset\("measurement\.ttl8_counter\.average_counts", scan_index, pmt_counts_sum \/ self\.repetition_num_per_point\)/);

const fixedPythonWithRatePlot = generateArtiqPython(baseState, [
  {
    id: "plot-rate",
    name: "PMT rate",
    type: "plot_xy",
    x: "shot_index",
    y: "measurement.ttl8_counter.count_rate",
    group: "Measurement",
    enabled: true
  }
]);
assert.match(fixedPythonWithRatePlot, /set_dataset\("shot_index", np\.arange\(self\.repetition, dtype=np\.int32\)/);
assert.match(fixedPythonWithRatePlot, /set_dataset\("measurement\.ttl8_counter\.count_rate"/);
assert.match(fixedPythonWithRatePlot, /mutate_dataset\("measurement\.ttl8_counter\.count_rate"/);
assert.match(fixedPythonWithRatePlot, /pmt_counts_value = pmt_counts_raw_buffer\[shot_index\]/);
assert.doesNotMatch(fixedPythonWithRatePlot, /set_dataset\("measurement\.ttl9_counter\.count_rate"/);
assert.doesNotMatch(fixedPythonWithRatePlot, /camera_counts_value/);
assert.match(fixedPythonWithRatePlot, /self\.setattr_device\("ccb"\)/);
assert.match(fixedPythonWithRatePlot, /self\.ccb\.issue\(/);
assert.match(fixedPythonWithRatePlot, /"create_applet"/);
assert.match(fixedPythonWithRatePlot, /"PMT rate"/);
assert.match(fixedPythonWithRatePlot, /"\$\{artiq_applet\}plot_xy measurement\.ttl8_counter\.count_rate --x shot_index"/);
assert.match(fixedPythonWithRatePlot, /group="Measurement"/);
assert.doesNotMatch(fixedPythonWithRatePlot, /subprocess|sys\.executable|shutil|Popen|commands_to_try/);

const sweepPythonWithCountsPlot = generateArtiqPython(sweepState, [
  {
    id: "plot-counts",
    name: "PMT counts",
    type: "plot_xy",
    x: "scan_index",
    y: "measurement.ttl8_counter.average_counts",
    group: "Measurement",
    enabled: true
  }
]);
assert.match(sweepPythonWithCountsPlot, /set_dataset\("scan_index", np\.arange\(self\.scan_points, dtype=np\.int32\)/);
assert.doesNotMatch(sweepPythonWithCountsPlot, /mutate_dataset\("scan_index"/);
assert.equal((sweepPythonWithCountsPlot.match(/scan_value_ttl_duration = 1\.0 \+ 1\.0 \* scan_index/g) ?? []).length, 1);
assert.doesNotMatch(sweepPythonWithCountsPlot, /set_dataset\("measurement\.ttl8_counter\.average_count_rate"/);
assert.doesNotMatch(sweepPythonWithCountsPlot, /pmt_counts_average\s*=/);
assert.match(sweepPythonWithCountsPlot, /"\$\{artiq_applet\}plot_xy measurement\.ttl8_counter\.average_counts --x scan_index"/);

const sweepPythonWithRatePlot = generateArtiqPython(sweepState, [
  {
    id: "plot-sweep-rate",
    name: "PMT rate",
    type: "plot_xy",
    x: "scan_index",
    y: "measurement.ttl8_counter.average_count_rate",
    group: "Measurement",
    enabled: true
  }
]);
assert.match(sweepPythonWithRatePlot, /set_dataset\("measurement\.ttl8_counter\.average_count_rate"/);
assert.match(sweepPythonWithRatePlot, /pmt_counts_average = pmt_counts_sum \/ self\.repetition_num_per_point/);
assert.match(sweepPythonWithRatePlot, /pmt_counts_average_rate = pmt_counts_average \/ 0\.003/);
assert.doesNotMatch(sweepPythonWithRatePlot, /camera_counts_average|camera_counts_average_rate/);
assert.match(sweepPythonWithRatePlot, /"\$\{artiq_applet\}plot_xy measurement\.ttl8_counter\.average_count_rate --x scan_index"/);

const sweepPythonWithRawCountsPlot = generateArtiqPython(sweepState, [
  {
    id: "plot-sweep-raw-counts",
    name: "PMT raw counts",
    type: "plot_xy",
    x: "shot_index",
    y: "measurement.ttl8_counter.raw_counts",
    group: "Measurement",
    enabled: true
  }
]);
assert.match(sweepPythonWithRawCountsPlot, /set_dataset\("shot_index", np\.arange\(self\.scan_points \* self\.repetition_num_per_point, dtype=np\.int32\)/);
assert.match(sweepPythonWithRawCountsPlot, /"\$\{artiq_applet\}plot_xy measurement\.ttl8_counter\.raw_counts --x shot_index"/);
assert.doesNotMatch(sweepPythonWithRawCountsPlot, /raw_count_rate|\.count_rate"/);

const sweepPythonWithRawRatePlot = generateArtiqPython(sweepState, [
  {
    id: "plot-sweep-raw-rate",
    name: "PMT raw count rate",
    type: "plot_xy",
    x: "shot_index",
    y: "measurement.ttl8_counter.raw_count_rate",
    group: "Measurement",
    enabled: true
  }
]);
assert.match(sweepPythonWithRawRatePlot, /set_dataset\("measurement\.ttl8_counter\.raw_count_rate", np\.full\(self\.scan_points \* self\.repetition_num_per_point, np\.nan, dtype=float\)/);
assert.match(sweepPythonWithRawRatePlot, /pmt_counts_raw_rate = pmt_counts \/ 0\.003/);
assert.match(sweepPythonWithRawRatePlot, /mutate_dataset\("measurement\.ttl8_counter\.raw_count_rate", shot_index, pmt_counts_raw_rate\)/);
assert.doesNotMatch(sweepPythonWithRawRatePlot, /set_dataset\("measurement\.ttl8_counter\.average_count_rate"/);
assert.doesNotMatch(sweepPythonWithRawRatePlot, /camera_counts_raw_rate|ttl9_counter\.raw_count_rate/);

const rawRatePlotPackage = [
  {
    id: "plot-sweep-raw-rate-all-paths",
    name: "PMT raw count rate",
    type: "plot_xy",
    x: "shot_index",
    y: "measurement.ttl8_counter.raw_count_rate",
    group: "Measurement",
    enabled: true
  }
];
const sweepMinBatchWithRawRatePlot = generateArtiqPython({ ...sweepState, fetchBatchSize: 1 }, rawRatePlotPackage);
const sweepWholeBatchWithRawRatePlot = generateArtiqPython({ ...sweepState, fetchBatchSize: 9 }, rawRatePlotPackage);
for (const rawRatePython of [sweepMinBatchWithRawRatePlot, sweepWholeBatchWithRawRatePlot]) {
  assert.match(rawRatePython, /pmt_counts_raw_rate = pmt_counts \/ 0\.003/);
  assert.match(rawRatePython, /mutate_dataset\("measurement\.ttl8_counter\.raw_count_rate", shot_index, pmt_counts_raw_rate\)/);
}

const invalidMixedLengthPlotPython = generateArtiqPython(sweepState, [
  {
    id: "plot-invalid-mixed-length",
    name: "Invalid mixed lengths",
    type: "plot_xy",
    x: "scan_index",
    y: "measurement.ttl8_counter.raw_counts",
    group: "Measurement",
    enabled: true
  }
]);
assert.doesNotMatch(invalidMixedLengthPlotPython, /set_dataset\("scan_index"|def launch_applets\(self\):/);
assert.doesNotMatch(invalidMixedLengthPlotPython, /setattr_device\("ccb"\)|self\.ccb\.issue/);

assert.doesNotMatch(divisibleBatchPython, /self\.repetitions\s*=/);

const noMeasurementSweepPython = generateArtiqPython(
  {
    ...sweepState,
    modules: [sweepState.modules[0]],
    visibleChannelIds: ["ttl0"]
  },
  []
);
assert.doesNotMatch(noMeasurementSweepPython, /self\.sequence_batch_size/);
assert.doesNotMatch(noMeasurementSweepPython, /batch_start|batch_end/);
assert.doesNotMatch(noMeasurementSweepPython, /total_shoot|logical_index/);
assert.match(noMeasurementSweepPython, /for scan_index in range\(self\.scan_points\):/);
assert.match(noMeasurementSweepPython, /scan_value_ttl_duration = 1\.0 \+ 1\.0 \* scan_index/);
assert.match(noMeasurementSweepPython, /for repetition_index in range\(self\.repetition_num_per_point\):/);
assert.match(noMeasurementSweepPython, /No counter measurements are scheduled, so no fetch batching is needed\./);
assert.doesNotMatch(noMeasurementSweepPython, /repetition_index = logical_index % self\.repetition_num_per_point/);
assert.doesNotMatch(noMeasurementSweepPython, /raw_counts/);

const singlePointRepetitionSweepPython = generateArtiqPython(
  {
    ...sweepState,
    loop: { ...sweepState.loop, count: 1 },
    modules: [sweepState.modules[0]],
    visibleChannelIds: ["ttl0"]
  },
  []
);
assert.doesNotMatch(singlePointRepetitionSweepPython, /repetition_num_per_point/);
assert.doesNotMatch(singlePointRepetitionSweepPython, /total_shoot/);
assert.doesNotMatch(singlePointRepetitionSweepPython, /logical_index/);
assert.match(singlePointRepetitionSweepPython, /for scan_index in range\(self\.scan_points\):/);
assert.match(singlePointRepetitionSweepPython, /if scan_index != self\.scan_points - 1:/);

const singlePointRepetitionSweepWithMeasurementPython = generateArtiqPython(
  {
    ...sweepState,
    loop: { ...sweepState.loop, count: 1 }
  },
  []
);
assert.doesNotMatch(singlePointRepetitionSweepWithMeasurementPython, /repetition_num_per_point/);
assert.doesNotMatch(singlePointRepetitionSweepWithMeasurementPython, /total_shoot/);
assert.doesNotMatch(singlePointRepetitionSweepWithMeasurementPython, /logical_index/);
assert.doesNotMatch(singlePointRepetitionSweepWithMeasurementPython, /raw_counts/);
assert.doesNotMatch(singlePointRepetitionSweepWithMeasurementPython, /sequence_batch_size|batch_start|batch_end|raw_buffer/);
assert.equal((singlePointRepetitionSweepWithMeasurementPython.match(/for scan_index in range\(self\.scan_points\):/g) ?? []).length, 2);
assert.match(singlePointRepetitionSweepWithMeasurementPython, /pmt_counts = self\.ttl8_counter\.fetch_count\(\)/);
assert.match(singlePointRepetitionSweepWithMeasurementPython, /self\.mutate_dataset\("measurement\.ttl8_counter\.average_counts", scan_index, pmt_counts\)/);

const noMeasurementFixedPython = generateArtiqPython(
  {
    ...baseState,
    modules: [baseState.modules[0]],
    visibleChannelIds: ["ttl0"]
  },
  []
);
assert.doesNotMatch(noMeasurementFixedPython, /self\.sequence_batch_size/);
assert.doesNotMatch(noMeasurementFixedPython, /batch_start|batch_end/);
assert.match(noMeasurementFixedPython, /self\.repetition = 250/);
assert.match(noMeasurementFixedPython, /for repetition_index in range\(self\.repetition\):/);
assert.doesNotMatch(noMeasurementFixedPython, /loop_count|total_shoot|sequence_index/);
assert.match(noMeasurementFixedPython, /No counter measurements are scheduled, so no fetch batching is needed\./);
assert.doesNotMatch(noMeasurementFixedPython, /Batch boundary only/);

const simpleRepeatedFixedPython = generateArtiqPython(
  {
    ...baseState,
    loop: { ...baseState.loop, count: 2, interLoopDelayMs: 0 },
    modules: [baseState.modules[0]],
    visibleChannelIds: ["ttl0"]
  },
  [],
  { includeSequenceBuilderMetadata: false, includeRunBrief: false }
);
assert.match(simpleRepeatedFixedPython, /def prepare\(self\):\n\s+self\.repetition = 2/);
assert.match(simpleRepeatedFixedPython, /for repetition_index in range\(self\.repetition\):/);
assert.doesNotMatch(simpleRepeatedFixedPython, /loop_count|total_shoot|sequence_index|inter_loop_delay_ms/);

const singleSequenceWithoutMeasurementPython = generateArtiqPython(
  {
    ...baseState,
    loop: { ...baseState.loop, count: 1, interLoopDelayMs: 0 },
    modules: [baseState.modules[0]],
    visibleChannelIds: ["ttl0"]
  },
  [],
  { includeSequenceBuilderMetadata: false, includeRunBrief: false }
);
assert.doesNotMatch(singleSequenceWithoutMeasurementPython, /self\.repetition|loop_count|total_shoot|inter_loop_delay_ms/);
assert.doesNotMatch(singleSequenceWithoutMeasurementPython, /start_slack_ms|Extra initial RTIO scheduling slack/);
assert.doesNotMatch(singleSequenceWithoutMeasurementPython, /for repetition_index|for sequence_index|No counter measurements/);
assert.match(singleSequenceWithoutMeasurementPython, /self\.ttl0\.on\(\)\n\s+delay\(1\.0 \* ms\)\n\s+self\.ttl0\.off\(\)/);

const singleSequenceWithStartSlackPython = generateArtiqPython(
  {
    ...baseState,
    startSlackMs: 0.25,
    startSlackUnit: "ms",
    loop: { ...baseState.loop, count: 1, interLoopDelayMs: 0 },
    modules: [baseState.modules[0]],
    visibleChannelIds: ["ttl0"]
  },
  [],
  { includeSequenceBuilderMetadata: false, includeRunBrief: false }
);
assert.match(singleSequenceWithStartSlackPython, /self\.start_slack_ms = 0\.25/);
assert.match(singleSequenceWithStartSlackPython, /# Extra initial RTIO scheduling slack before the first sequence\./);
assert.match(singleSequenceWithStartSlackPython, /delay\(self\.start_slack_ms \* ms\)/);

const fixedPhasePython = generateArtiqPython(
  {
    ...baseState,
    loop: { ...baseState.loop, count: 1, interLoopDelayMs: 0 },
    modules: [
      {
        id: "fixed-phase-dds",
        type: "dds",
        name: "Fixed phase DDS",
        channel: "urukul0_ch0",
        startMs: 0,
        durationMs: 5,
        gapAfterPrevious: 0,
        locked: false,
        timeUnit: "ms",
        frequencyMHz: 80,
        amplitude: 0.5,
        phaseDeg: 30,
        phaseMode: "absolute",
        attenuationDb: 9
      }
    ]
  },
  [],
  { includeSequenceBuilderMetadata: false, includeRunBrief: false }
);
assert.match(fixedPhasePython, /from artiq\.coredevice\.ad9910 import PHASE_MODE_ABSOLUTE, PHASE_MODE_CONTINUOUS, PHASE_MODE_TRACKING/);
assert.match(fixedPhasePython, /self\.urukul0_ch0\.set\(80\.0 \* MHz, amplitude=0\.5, phase=30\.0 \/ 360\.0, phase_mode=PHASE_MODE_ABSOLUTE\)/);

const channelLanePython = generateArtiqPython(
  {
    ...baseState,
    loop: { ...baseState.loop, count: 1, interLoopDelayMs: 0 },
    modules: [
      {
        id: "lane-ch0-first",
        type: "dds",
        name: "ch0 first",
        channel: "urukul0_ch0",
        startMs: 0,
        durationMs: 5,
        gapAfterPrevious: 0,
        locked: false,
        timeUnit: "ms",
        frequencyMHz: 80,
        amplitude: 0.5,
        phaseDeg: 0,
        phaseMode: "absolute",
        attenuationDb: 10
      },
      {
        id: "lane-ch1",
        type: "dds",
        name: "ch1",
        channel: "urukul0_ch1",
        startMs: 5.499632,
        durationMs: 5,
        gapAfterPrevious: 5.499632,
        locked: false,
        timeUnit: "ms",
        frequencyMHz: 80,
        amplitude: 0.5,
        phaseDeg: 0,
        phaseMode: "absolute",
        attenuationDb: 10
      },
      {
        id: "lane-ttl",
        type: "ttl_output",
        name: "TTL",
        channel: "ttl0",
        startMs: 6.315808,
        durationMs: 1,
        gapAfterPrevious: 6.315808,
        locked: false,
        timeUnit: "ms"
      },
      {
        id: "lane-ch0-second",
        type: "dds",
        name: "ch0 second",
        channel: "urukul0_ch0",
        startMs: 7.883272,
        durationMs: 5,
        gapAfterPrevious: 2.883272,
        locked: false,
        timeUnit: "ms",
        frequencyMHz: 80,
        amplitude: 0.5,
        phaseDeg: 0,
        phaseMode: "absolute",
        attenuationDb: 10
      }
    ]
  },
  [],
  { includeSequenceBuilderMetadata: false, includeRunBrief: false }
);
const channelLaneRuntime = pythonRuntimeCode(channelLanePython);
assert.equal((channelLaneRuntime.match(/with parallel:/g) ?? []).length, 1);
assert.equal((channelLaneRuntime.match(/with sequential:/g) ?? []).length, 3);
assert.match(channelLaneRuntime, /# Channel: urukul0_ch0\n\s+with sequential:/);
assert.match(channelLaneRuntime, /# Channel: urukul0_ch1\n\s+with sequential:/);
assert.match(channelLaneRuntime, /# Channel: ttl0\n\s+with sequential:/);
assert.match(channelLaneRuntime, /self\.urukul0_ch0\.sw\.off\(\)\n\s+delay\(2\.883272 \* ms\)\n\s+self\.urukul0_ch0\.set\(/);
assert.match(channelLaneRuntime, /# Channel: urukul0_ch1\n\s+with sequential:\n\s+delay\(5\.499632 \* ms\)\n\s+self\.urukul0_ch1\.set_att/);
assert.match(channelLaneRuntime, /# Channel: ttl0\n\s+with sequential:\n\s+delay\(6\.315808 \* ms\)\n\s+self\.ttl0\.on\(\)/);

const reusableDdsModule = {
  id: "reuse-first",
  type: "dds",
  name: "first DDS",
  channel: "urukul0_ch0",
  startMs: 0,
  durationMs: 5,
  gapAfterPrevious: 0,
  locked: false,
  timeUnit: "ms",
  frequencyMHz: 80,
  amplitude: 0.5,
  phaseDeg: 0,
  phaseMode: "absolute",
  attenuationDb: 10
};
const continuousReuseState = {
  ...baseState,
  loop: { ...baseState.loop, count: 1, interLoopDelayMs: 0 },
  modules: [
    reusableDdsModule,
    {
      ...reusableDdsModule,
      id: "reuse-second",
      name: "second DDS",
      startMs: 7,
      gapAfterPrevious: 2,
      phaseMode: "continuous"
    }
  ]
};
const continuousReuseRuntime = pythonRuntimeCode(generateArtiqPython(
  continuousReuseState,
  [],
  { includeSequenceBuilderMetadata: false, includeRunBrief: false }
));
assert.equal((continuousReuseRuntime.match(/self\.urukul0_ch0\.set\(/g) ?? []).length, 1);
assert.equal((continuousReuseRuntime.match(/self\.urukul0_ch0\.set_att\(/g) ?? []).length, 1);
assert.equal((continuousReuseRuntime.match(/self\.urukul0_ch0\.sw\.on\(\)/g) ?? []).length, 2);
assert.match(continuousReuseRuntime, /self\.urukul0_ch0\.sw\.off\(\)\n\s+delay\(2\.0 \* ms\)\n\s+self\.urukul0_ch0\.sw\.on\(\)/);

const continuousChangedRuntime = pythonRuntimeCode(generateArtiqPython(
  {
    ...continuousReuseState,
    modules: [
      continuousReuseState.modules[0],
      { ...continuousReuseState.modules[1], frequencyMHz: 81 }
    ]
  },
  [],
  { includeSequenceBuilderMetadata: false, includeRunBrief: false }
));
assert.equal((continuousChangedRuntime.match(/self\.urukul0_ch0\.set\(/g) ?? []).length, 2);
assert.equal((continuousChangedRuntime.match(/self\.urukul0_ch0\.set_att\(/g) ?? []).length, 1);
assert.match(continuousChangedRuntime, /self\.urukul0_ch0\.set\(81\.0 \* MHz, amplitude=0\.5, phase=0\.0 \/ 360\.0, phase_mode=PHASE_MODE_CONTINUOUS\)/);

const sameChannelDdsSweepRuntime = pythonRuntimeCode(generateArtiqPython(
  {
    ...continuousReuseState,
    modules: [
      {
        ...continuousReuseState.modules[0],
        ddsParameters: {
          frequency: {
            value: 80,
            unit: "MHz",
            sweep: {
              enabled: true,
              start: 80,
              end: 81,
              step: 1,
              points: 2,
              invalid: false,
              error: "",
              lastEditedFields: ["end"]
            }
          }
        }
      },
      { ...continuousReuseState.modules[1], frequencyMHz: 82 }
    ]
  },
  [],
  { includeSequenceBuilderMetadata: false, includeRunBrief: false }
));
assert.match(sameChannelDdsSweepRuntime, /self\.urukul0_ch0\.set\(scan_value_frequency \* MHz, amplitude=0\.5/);
assert.match(sameChannelDdsSweepRuntime, /self\.urukul0_ch0\.sw\.off\(\)\n\s+delay\(2\.0 \* ms\)\n\s+self\.urukul0_ch0\.set\(82\.0 \* MHz/);

const fixedChannelOrderRuntime = pythonRuntimeCode(generateArtiqPython(
  {
    ...baseState,
    loop: { ...baseState.loop, count: 1, interLoopDelayMs: 0 },
    modules: [
      {
        id: "order-counter",
        type: "measure",
        name: "counter first in input",
        channel: "ttl8_counter",
        startMs: 0,
        durationMs: 1,
        gapAfterPrevious: 0,
        locked: false,
        timeUnit: "ms",
        datasetName: "ordered_counter",
        edge: "rising"
      },
      {
        id: "order-ttl10",
        type: "ttl_output",
        name: "ttl10",
        channel: "ttl10",
        startMs: 0,
        durationMs: 1,
        gapAfterPrevious: 0,
        locked: false,
        timeUnit: "ms"
      },
      { ...reusableDdsModule, id: "order-urukul1", channel: "urukul1_ch0" },
      {
        id: "order-ttl1",
        type: "ttl_output",
        name: "ttl1",
        channel: "ttl1",
        startMs: 0,
        durationMs: 1,
        gapAfterPrevious: 0,
        locked: false,
        timeUnit: "ms"
      },
      { ...reusableDdsModule, id: "order-urukul0", channel: "urukul0_ch3" }
    ]
  },
  [],
  { includeSequenceBuilderMetadata: false, includeRunBrief: false }
));
const fixedChannelOrderMarkers = [
  "self.urukul0_ch3.set_att",
  "self.urukul1_ch0.set_att",
  "self.ttl1.on()",
  "self.ttl10.on()",
  "self.ttl8_counter.gate_rising"
];
fixedChannelOrderMarkers.forEach((marker, index) => {
  assert.ok(fixedChannelOrderRuntime.includes(marker), `missing ordered channel marker: ${marker}`);
  if (index > 0) {
    assert.ok(
      fixedChannelOrderRuntime.indexOf(fixedChannelOrderMarkers[index - 1]) < fixedChannelOrderRuntime.indexOf(marker),
      `channel marker should appear after ${fixedChannelOrderMarkers[index - 1]}: ${marker}`
    );
  }
});

console.log("Generator batching checks passed.");
