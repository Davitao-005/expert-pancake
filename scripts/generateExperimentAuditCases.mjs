import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const compileDir = "/private/tmp/artiq-sequence-builder-audit";
const outputDir = "audit/generated";

rmSync(compileDir, { force: true, recursive: true });
mkdirSync(compileDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });
writeFileSync(`${compileDir}/package.json`, JSON.stringify({ type: "commonjs" }));

execFileSync(
  "./node_modules/.bin/tsc",
  [
    "--outDir", compileDir,
    "--module", "CommonJS",
    "--moduleResolution", "Node",
    "--target", "ES2022",
    "--jsx", "react-jsx",
    "--strict", "true",
    "--esModuleInterop", "true",
    "--noEmit", "false",
    "--skipLibCheck",
    "src/pythonGenerator.ts"
  ],
  { stdio: "pipe" }
);

const { generateArtiqPython } = await import(pathToFileURL(`${compileDir}/pythonGenerator.js`).href);

const channels = [
  { id: "ttl0", label: "ttl0", type: "ttl_output" },
  { id: "ttl1", label: "ttl1", type: "ttl_output" },
  { id: "urukul0_ch0", label: "urukul0_ch0", type: "dds" },
  { id: "urukul0_ch1", label: "urukul0_ch1", type: "dds" }
];

const sweepOff = (value) => ({
  enabled: false,
  start: value,
  end: value,
  step: 0,
  points: 1,
  invalid: false,
  error: "",
  lastEditedFields: []
});

const ttl = (id, channel, startMs, durationMs, name = id) => ({
  id,
  type: "ttl_output",
  name,
  channel,
  startMs,
  durationMs,
  gapAfterPrevious: startMs,
  locked: false,
  timeUnit: "ms"
});

const dds = (id, channel, startMs, durationMs, frequencyMHz, amplitude, name = id) => ({
  id,
  type: "dds",
  name,
  channel,
  startMs,
  durationMs,
  gapAfterPrevious: startMs,
  locked: false,
  timeUnit: "ms",
  frequencyMHz,
  amplitude,
  phaseDeg: 0,
  phaseMode: "absolute",
  attenuationDb: 10,
  ddsParameters: {
    frequency: { value: frequencyMHz, unit: "MHz", sweep: sweepOff(frequencyMHz) },
    amplitude: { value: amplitude, unit: "", sweep: sweepOff(amplitude) },
    phase: { value: 0, unit: "deg", sweep: sweepOff(0) },
    duration: { value: durationMs, unit: "ms", sweep: sweepOff(durationMs) }
  }
});

const state = (id, title, modules, loopCount = 1) => ({
  sequenceName: title,
  className: id,
  fetchBatchSize: 100,
  pixelsPerMs: 70,
  snapGridMs: 0.1,
  loop: { count: loopCount, interLoopDelayMs: 0, interLoopDelayUnit: "ms" },
  availableChannels: channels,
  visibleChannelIds: channels.map((channel) => channel.id),
  modules
});

const cases = [
  state("E01SingleTtl", "E01 single TTL pulse", [ttl("ttl-pulse", "ttl0", 0, 1)]),
  state("E02SerialTtl", "E02 serial TTL pulses", [
    ttl("ttl-first", "ttl0", 0, 1),
    { ...ttl("ttl-second", "ttl0", 2, 0.5), gapAfterPrevious: 1 },
    { ...ttl("ttl-third", "ttl0", 3, 1), gapAfterPrevious: 0.5 }
  ]),
  state("E03ParallelTtl", "E03 parallel TTL pulses", [
    ttl("ttl-long", "ttl0", 0, 3),
    ttl("ttl-delayed", "ttl1", 1, 1)
  ]),
  state("E04SingleDds", "E04 single DDS pulse", [
    dds("cooling-dds", "urukul0_ch0", 0, 2, 80, 0.5, "Cooling DDS")
  ]),
  state("E05MixedDdsTtl", "E05 mixed DDS and TTL", [
    dds("cooling-dds", "urukul0_ch0", 0, 3, 80, 0.5, "Cooling DDS"),
    ttl("camera-trigger", "ttl0", 1, 0.2, "Camera trigger"),
    dds("repump-dds", "urukul0_ch1", 3.5, 1, 120, 0.3, "Repump DDS")
  ])
];

const manifest = [];
for (const experiment of cases) {
  const id = experiment.className.slice(0, 3).toLowerCase();
  const defaultPython = generateArtiqPython(experiment);
  const corePython = generateArtiqPython(experiment, [], {
    includeSequenceBuilderMetadata: false,
    includeRunBrief: false
  });
  writeFileSync(`${outputDir}/${id}_default.py`, defaultPython);
  writeFileSync(`${outputDir}/${id}_core.py`, corePython);
  manifest.push({
    id: id.toUpperCase(),
    title: experiment.sequenceName,
    defaultLines: defaultPython.trimEnd().split("\n").length,
    coreLines: corePython.trimEnd().split("\n").length
  });
}

writeFileSync(`${outputDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${cases.length} experiment audit cases in ${outputDir}.`);
