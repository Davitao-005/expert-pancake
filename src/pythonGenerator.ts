import { getAppletCommandSpecs, getAvailablePlotDatasets, isPlotValid, measurementDatasetBase, sanitizeDatasetName } from "./plotDatasets";
import type { AvailablePlotDatasets } from "./plotDatasets";
import { compareChannelIds } from "./channelOrdering";
import type { ArgumentConfig, DdsArgumentKey, DdsParameterKey, PhaseMode, PlotPackage, SequenceModule, SequenceState, SweepConfig } from "./types";

const indent = (level: number) => "    ".repeat(level);

const sanitizeIdentifier = (value: string, fallback: string) => {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^[0-9]+/, "");
  return cleaned || fallback;
};

export const sanitizePythonClassName = (value: string) => {
  const cleaned = sanitizeIdentifier(value, "GeneratedSequence");
  return cleaned[0].toUpperCase() + cleaned.slice(1);
};

export const pythonFilename = (sequenceName: string) => {
  const cleaned = sequenceName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${cleaned || "generated_sequence"}.py`;
};

const formatNumber = (value: number | undefined, fallback = 0) => {
  const number = value ?? fallback;
  return Number.isInteger(number) ? `${number}.0` : `${Number(number.toFixed(6))}`;
};

const defaultDdsAttenuationDb = 10;
const maxDdsAttenuationDb = 31.5;
const defaultPhaseMode: PhaseMode = "absolute";
const minFetchBatchSize = 1;
const maxFetchBatchSize = 100;

const phaseModeConstant = (phaseMode: PhaseMode | undefined) => {
  if (phaseMode === "tracking") return "PHASE_MODE_TRACKING";
  if (phaseMode === "continuous") return "PHASE_MODE_CONTINUOUS";
  return "PHASE_MODE_ABSOLUTE";
};

const escapePythonString = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const argumentDefaultName = (module: SequenceModule, parameter: DdsArgumentKey | "ttlDuration") =>
  sanitizeIdentifier(
    `${module.name || module.channel}_${parameter === "ttlDuration" ? "duration" : parameter}`,
    `${module.channel}_${parameter}`
  );

const effectiveFetchBatchSize = (state: SequenceState, _totalSequences: number) => state.fetchBatchSize;

const appendKernelTimelineCompletionWait = (lines: string[]) => {
  lines.push("", `${indent(2)}self.core.wait_until_mu(now_mu())`);
};

const metadataStartMarker = "# --- SEQUENCE_BUILDER_METADATA_START ---";
const metadataEndMarker = "# --- SEQUENCE_BUILDER_METADATA_END ---";

const jsonSafeValue = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Metadata contains a non-finite number.");
    }
    return value;
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new Error(`Metadata contains unsupported value type: ${typeof value}.`);
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      const safeItem = jsonSafeValue(item, seen);
      return safeItem === undefined ? null : safeItem;
    });
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new Error("Metadata contains a circular reference.");
    }
    seen.add(value);
    const result: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, item]) => {
      const safeItem = jsonSafeValue(item, seen);
      if (safeItem !== undefined) {
        result[key] = safeItem;
      }
    });
    seen.delete(value);
    return result;
  }
  throw new Error("Metadata contains an unsupported value.");
};

export const buildSequenceBuilderMetadata = (state: SequenceState, selectedPlots: PlotPackage[] = []) => {
  const metadata = {
    schemaVersion: 1,
    format: "ARTIQ Sequence Builder",
    exportedAt: new Date().toISOString(),
    experiment: {
      fileName: pythonFilename(state.sequenceName),
      sequenceName: state.sequenceName,
      className: state.className,
      repetitionCount: state.loop.count,
      fetchBatchSize: state.fetchBatchSize,
      startSlackMs: state.startSlackMs ?? 0,
      startSlackUnit: state.startSlackUnit ?? "ms",
      interLoopDelayMs: state.loop.interLoopDelayMs,
      interLoopDelayUnit: state.loop.interLoopDelayUnit
    },
    editorState: {
      sequenceName: state.sequenceName,
      className: state.className,
      fetchBatchSize: state.fetchBatchSize,
      startSlackMs: state.startSlackMs ?? 0,
      startSlackUnit: state.startSlackUnit ?? "ms",
      timelineTimeUnit: state.timelineTimeUnit ?? null,
      pixelsPerMs: state.pixelsPerMs,
      snapGridMs: state.snapGridMs,
      loop: state.loop,
      availableChannels: state.availableChannels,
      visibleChannelIds: state.visibleChannelIds,
      modules: state.modules.map((module) => ({
        id: module.id,
        type: module.type,
        name: module.name,
        channel: module.channel,
        startMs: module.startMs,
        durationMs: module.durationMs,
        endMs: moduleEnd(module),
        gapAfterPrevious: module.gapAfterPrevious,
        locked: module.locked,
        timeUnit: module.timeUnit,
        frequencyMHz: module.frequencyMHz,
        amplitude: module.amplitude,
        attenuationDb: module.attenuationDb,
        phaseDeg: module.phaseDeg,
        phaseMode: module.phaseMode,
        ddsParameters: module.ddsParameters,
        ttlDurationSweep: module.ttlDurationSweep,
        argumentConfig: module.argumentConfig,
        laserPreset: module.laserPreset,
        edge: module.edge,
        datasetName: module.datasetName
      }))
    },
    plots: selectedPlots.map((plot) => ({ ...plot }))
  };

  return jsonSafeValue(metadata);
};

export const renderSequenceBuilderMetadataBlock = (metadata: unknown) => {
  const safeMetadata = jsonSafeValue(metadata);
  const json = JSON.stringify(safeMetadata, null, 2);
  if (!json) {
    throw new Error("Metadata could not be serialized.");
  }
  return [
    metadataStartMarker,
    ...json.split("\n").map((line) => `# ${line}`),
    metadataEndMarker
  ].join("\n");
};

const embedSequenceBuilderMetadata = (pythonCode: string, state: SequenceState, selectedPlots: PlotPackage[]) => {
  try {
    const metadata = buildSequenceBuilderMetadata(state, selectedPlots);
    return `${renderSequenceBuilderMetadataBlock(metadata)}\n\n${pythonCode}`;
  } catch (error) {
    console.warn("Sequence Builder metadata embedding failed; exporting Python without metadata.", error);
    return pythonCode;
  }
};

export type ArtiqPythonGenerationOptions = {
  includeSequenceBuilderMetadata?: boolean;
  includeRunBrief?: boolean;
};

const maybeEmbedSequenceBuilderMetadata = (
  pythonCode: string,
  state: SequenceState,
  selectedPlots: PlotPackage[],
  options: ArtiqPythonGenerationOptions
) => (options.includeSequenceBuilderMetadata ?? true ? embedSequenceBuilderMetadata(pythonCode, state, selectedPlots) : pythonCode);

const channelRoot = (channel: string) => {
  const match = channel.match(/^(urukul\d+)_ch\d+$/);
  return match ? `${match[1]}_cpld` : undefined;
};

const moduleEnd = (module: SequenceModule) => module.startMs + module.durationMs;

type EnabledSweep = {
  module: SequenceModule;
  parameter: DdsParameterKey | "ttl_duration";
  sweep: SweepConfig;
  unit: string;
};

type ArgumentSpec = {
  module: SequenceModule;
  key: DdsArgumentKey | "ttlDuration";
  name: string;
  defaultValue: number;
  min?: number;
  max?: number;
};

type ArgumentContext = {
  specs: ArgumentSpec[];
  names: Map<string, string>;
};

const ddsParameterKeys: DdsParameterKey[] = ["frequency", "amplitude", "phase", "duration"];

const ddsParameterUnit: Record<DdsParameterKey, string> = {
  frequency: "MHz",
  amplitude: "",
  phase: "deg",
  duration: "ms"
};

const ddsParametersForModule = (module: SequenceModule) => ({
  frequency: module.ddsParameters?.frequency ?? {
    value: module.frequencyMHz ?? 80,
    unit: "MHz" as const,
    sweep: defaultSweep(module.frequencyMHz ?? 80)
  },
  amplitude: module.ddsParameters?.amplitude ?? {
    value: module.amplitude ?? 0.5,
    unit: "" as const,
    sweep: defaultSweep(module.amplitude ?? 0.5)
  },
  phase: module.ddsParameters?.phase ?? {
    value: module.phaseDeg ?? 0,
    unit: "deg" as const,
    sweep: defaultSweep(module.phaseDeg ?? 0)
  },
  duration: module.ddsParameters?.duration ?? {
    value: module.durationMs,
    unit: "ms" as const,
    sweep: defaultSweep(module.durationMs)
  }
});

const argumentLookupKey = (module: SequenceModule, key: DdsArgumentKey | "ttlDuration") => `${module.id}:${key}`;

const activeArgumentConfig = (config: ArgumentConfig | undefined, fallbackName: string) =>
  config?.enabled
    ? {
        enabled: true,
        name: config.name.trim() || fallbackName
      }
    : undefined;

const uniquePythonArgumentName = (name: string, usedNames: Set<string>, fallback: string) => {
  const base = sanitizeIdentifier(name, fallback);
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
};

const collectArgumentContext = (state: SequenceState, enabledSweeps: EnabledSweep[] = []): ArgumentContext => {
  const usedNames = new Set<string>();
  const specs: ArgumentSpec[] = [];
  const names = new Map<string, string>();

  const addSpec = (
    module: SequenceModule,
    key: DdsArgumentKey | "ttlDuration",
    config: ArgumentConfig | undefined,
    defaultValue: number,
    min?: number,
    max?: number
  ) => {
    const activeConfig = activeArgumentConfig(config, argumentDefaultName(module, key));
    if (!activeConfig) return;
    const name = uniquePythonArgumentName(activeConfig.name, usedNames, argumentDefaultName(module, key));
    specs.push({ module, key, name, defaultValue, min, max });
    names.set(argumentLookupKey(module, key), name);
  };

  state.modules.forEach((module) => {
    if (module.type === "dds") {
      const parameters = ddsParametersForModule(module);
      ddsParameterKeys.forEach((key) => {
        if (sweepForParameter(enabledSweeps, module, key)) return;
        const meta = key === "frequency"
          ? { min: 0 }
          : key === "amplitude"
            ? { min: 0, max: 1 }
            : key === "duration"
              ? { min: 0 }
              : {};
        addSpec(module, key, module.argumentConfig?.dds?.[key], parameters[key].value, meta.min, meta.max);
      });
      addSpec(module, "attenuation", module.argumentConfig?.dds?.attenuation, module.attenuationDb ?? defaultDdsAttenuationDb, 0, maxDdsAttenuationDb);
    }

    if (module.type === "ttl_output") {
      if (ttlDurationSweepForModule(enabledSweeps, module)) return;
      addSpec(module, "ttlDuration", module.argumentConfig?.ttlDuration, module.durationMs, 0);
    }
  });

  return { specs, names };
};

function defaultSweep(value: number): SweepConfig {
  return {
    enabled: false,
    start: value,
    end: value,
    step: 0,
    points: 1,
    invalid: false,
    error: "",
    lastEditedFields: []
  };
}

const normalizedSweep = (sweep: SweepConfig) => {
  const points = sweep.points;
  const start = sweep.start;
  const step = points === 1 ? 0 : sweep.step;
  const end = points === 1 ? start : sweep.end;
  return { ...sweep, points, start, step, end };
};

export const findEnabledDdsSweeps = (state: SequenceState): EnabledSweep[] =>
  [
    ...state.modules
    .filter((module) => module.type === "dds")
    .flatMap((module) => {
      const parameters = ddsParametersForModule(module);
      return ddsParameterKeys
        .filter((parameter) => parameters[parameter].sweep.enabled)
        .map((parameter) => ({
          module,
          parameter,
          sweep: normalizedSweep(parameters[parameter].sweep),
          unit: ddsParameterUnit[parameter]
        }));
    }),
    ...state.modules
      .filter((module) => module.type === "ttl_output" && module.ttlDurationSweep?.enabled)
      .map((module) => ({
        module,
        parameter: "ttl_duration" as const,
        sweep: normalizedSweep(module.ttlDurationSweep ?? defaultSweep(module.durationMs)),
        unit: "ms"
      }))
  ];

const isSweepValueValid = (parameter: EnabledSweep["parameter"], value: number) => {
  if (!Number.isFinite(value)) return false;
  if (parameter === "amplitude") return value >= 0 && value <= 1;
  if (parameter === "frequency" || parameter === "duration" || parameter === "ttl_duration") return value > 0;
  return true;
};

const scanValuesForSweep = (sweep: SweepConfig) =>
  Array.from({ length: Math.max(0, sweep.points) }, (_, index) => sweep.start + sweep.step * index);

const taskLabel = (module: SequenceModule) => module.name || `${module.channel} at ${formatNumber(module.startMs)} ms`;

const sweepLabel = (enabledSweep: EnabledSweep) =>
  enabledSweep.parameter === "ttl_duration"
    ? `TTL output duration sweep on ${enabledSweep.module.channel}`
    : `${enabledSweep.parameter} sweep on "${taskLabel(enabledSweep.module)}"`;

const sweepsForModule = (enabledSweeps: EnabledSweep[], module: SequenceModule) =>
  enabledSweeps.filter((sweep) => sweep.module.id === module.id);

const sweepForParameter = (enabledSweeps: EnabledSweep[], module: SequenceModule, parameter: DdsParameterKey) =>
  enabledSweeps.find((sweep) => sweep.module.id === module.id && sweep.parameter === parameter);

const ttlDurationSweepForModule = (enabledSweeps: EnabledSweep[], module: SequenceModule) =>
  enabledSweeps.find((sweep) => sweep.module.id === module.id && sweep.parameter === "ttl_duration");

const sweepVariableName = (enabledSweep: EnabledSweep, enabledSweeps: EnabledSweep[]) =>
  enabledSweeps.length === 1
    ? sanitizeIdentifier(`scan_value_${enabledSweep.parameter}`, "scan_value")
    : sanitizeIdentifier(`${enabledSweep.module.name || enabledSweep.module.id}_${enabledSweep.module.id}_${enabledSweep.parameter}_scan_value`, "scan_value");

const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const getSweepShapeError = (sweep: SweepConfig) => {
  if (![sweep.start, sweep.end, sweep.step].every(Number.isFinite)) {
    return "sweep values must be valid numbers.";
  }
  if (!Number.isInteger(sweep.points) || sweep.points < 1) {
    return "sweep points must be an integer >= 1.";
  }
  if (sweep.points === 1) return "";
  if (nearlyEqual(sweep.step, 0) && !nearlyEqual(sweep.end, sweep.start)) {
    return "sweep step can be 0 only when the sweep has one point or start equals end.";
  }
  if (!nearlyEqual(sweep.step, 0) && !nearlyEqual(sweep.end, sweep.start) && Math.sign(sweep.end - sweep.start) !== Math.sign(sweep.step)) {
    return "sweep step direction must match the direction from start to end.";
  }

  const expectedEnd = sweep.start + sweep.step * (sweep.points - 1);
  if (!nearlyEqual(expectedEnd, sweep.end)) {
    return "sweep start, step, points, and end are inconsistent.";
  }
  return "";
};

export const getArtiqGenerationError = (state: SequenceState) => {
  if (
    !Number.isInteger(state.fetchBatchSize) ||
    state.fetchBatchSize < minFetchBatchSize ||
    state.fetchBatchSize > maxFetchBatchSize
  ) {
    return `Cannot generate ARTIQ Python: Fetch batch must be an integer from ${minFetchBatchSize} to ${maxFetchBatchSize}.`;
  }

  if (!Number.isFinite(state.loop.interLoopDelayMs) || state.loop.interLoopDelayMs < 0) {
    return "Cannot generate ARTIQ Python: Sequence gap must be zero or a positive number.";
  }
  if (!Number.isFinite(state.startSlackMs ?? 0) || (state.startSlackMs ?? 0) < 0) {
    return "Cannot generate ARTIQ Python: Start slack must be zero or a positive number.";
  }

  const invalidAttenuationModule = state.modules.find((module) => {
    if (module.type !== "dds") return false;
    const attenuationDb = module.attenuationDb ?? defaultDdsAttenuationDb;
    return !Number.isFinite(attenuationDb) || attenuationDb > maxDdsAttenuationDb;
  });
  if (invalidAttenuationModule) {
    return `Cannot generate ARTIQ Python: DDS attenuation on "${taskLabel(invalidAttenuationModule)}" must be ${maxDdsAttenuationDb} dB or less.`;
  }

  const enabledSweeps = findEnabledDdsSweeps(state);
  if (enabledSweeps.length === 0) return "";

  for (const enabledSweep of enabledSweeps) {
    if (enabledSweep.sweep.invalid || enabledSweep.sweep.error) {
      return `Cannot generate ARTIQ Python: ${enabledSweep.sweep.error || "sweep settings are invalid."}`;
    }

    const sweepShapeError = getSweepShapeError(enabledSweep.sweep);
    if (sweepShapeError) {
      return `Cannot generate ARTIQ Python: ${sweepShapeError}`;
    }

    const values = scanValuesForSweep(enabledSweep.sweep);
    if (values.some((value) => !isSweepValueValid(enabledSweep.parameter, value))) {
      return `Cannot generate ARTIQ Python: invalid ${enabledSweep.parameter} sweep values.`;
    }

  }

  const taskWithMismatchedSweeps = state.modules
    .filter((module) => module.type === "dds")
    .find((module) => {
      const moduleSweeps = sweepsForModule(enabledSweeps, module);
      return moduleSweeps.length > 1 && new Set(moduleSweeps.map((item) => item.sweep.points)).size > 1;
    });
  if (taskWithMismatchedSweeps) {
    return `Cannot export: task "${taskLabel(taskWithMismatchedSweeps)}" has multiple enabled sweeps with different points counts.`;
  }

  const expectedPoints = enabledSweeps[0].sweep.points;
  const pointsMismatch = enabledSweeps.find((item) => item.sweep.points !== expectedPoints);
  if (pointsMismatch) {
    return `Cannot export: ${sweepLabel(pointsMismatch)} has ${pointsMismatch.sweep.points} points, but expected ${expectedPoints}.`;
  }

  return "";
};

const countVariableName = (module: SequenceModule) =>
  sanitizeIdentifier(sanitizeDatasetName(module.datasetName || module.name || module.channel), "counts");

const argumentExpression = (module: SequenceModule, key: DdsArgumentKey | "ttlDuration", argumentNames: Map<string, string>, fallback: string) => {
  const argumentName = argumentNames.get(argumentLookupKey(module, key));
  return argumentName ? `self.${argumentName}` : fallback;
};

const ddsConfigurationIdentity = (module: SequenceModule, enabledSweeps: EnabledSweep[] = [], argumentNames = new Map<string, string>()) => {
  const parameters = ddsParametersForModule(module);
  const parameterIdentity = (key: DdsParameterKey) => {
    const sweep = sweepForParameter(enabledSweeps, module, key);
    if (sweep) return `sweep:${sweepVariableName(sweep, enabledSweeps)}`;
    const argumentName = argumentNames.get(argumentLookupKey(module, key));
    return argumentName ? `argument:${argumentName}` : `value:${formatNumber(parameters[key].value)}`;
  };
  const attenuationArgument = argumentNames.get(argumentLookupKey(module, "attenuation"));

  return {
    waveform: ["frequency", "amplitude", "phase"].map((key) => parameterIdentity(key as DdsParameterKey)).join("|"),
    attenuation: attenuationArgument
      ? `argument:${attenuationArgument}`
      : `value:${formatNumber(module.attenuationDb, defaultDdsAttenuationDb)}`
  };
};

const renderDdsSet = (
  module: SequenceModule,
  level: number,
  enabledSweeps: EnabledSweep[] = [],
  argumentNames = new Map<string, string>(),
  options: { includeAttenuation?: boolean; includeWaveform?: boolean } = {}
) => {
  const pad = indent(level);
  const parameters = ddsParametersForModule(module);
  const includeAttenuation = options.includeAttenuation ?? true;
  const includeWaveform = options.includeWaveform ?? true;
  const frequencySweep = sweepForParameter(enabledSweeps, module, "frequency");
  const amplitudeSweep = sweepForParameter(enabledSweeps, module, "amplitude");
  const phaseSweep = sweepForParameter(enabledSweeps, module, "phase");
  const frequencyExpression = frequencySweep
    ? `${sweepVariableName(frequencySweep, enabledSweeps)} * MHz`
    : `${argumentExpression(module, "frequency", argumentNames, formatNumber(parameters.frequency.value, 80))} * MHz`;
  const amplitudeExpression = amplitudeSweep
    ? sweepVariableName(amplitudeSweep, enabledSweeps)
    : argumentExpression(module, "amplitude", argumentNames, formatNumber(parameters.amplitude.value, 0.5));
  const attenuationExpression = argumentExpression(module, "attenuation", argumentNames, formatNumber(module.attenuationDb, defaultDdsAttenuationDb));

  const lines = includeAttenuation
    ? [`${pad}self.${module.channel}.set_att(${attenuationExpression} * dB)`]
    : [];

  if (!includeWaveform) return lines;

  if (phaseSweep) {
    const phaseVariable = `${sweepVariableName(phaseSweep, enabledSweeps)}_turns`;
    return [...lines,
      `${pad}${phaseVariable} = ${sweepVariableName(phaseSweep, enabledSweeps)} / 360.0`,
      `${pad}self.${module.channel}.set(${frequencyExpression}, amplitude=${amplitudeExpression}, phase=${phaseVariable}, phase_mode=${phaseModeConstant(module.phaseMode ?? defaultPhaseMode)})`
    ];
  }

  const phaseArgumentName = argumentNames.get(argumentLookupKey(module, "phase"));
  const phaseExpression = phaseArgumentName
    ? [
        `${pad}${phaseArgumentName}_turns = self.${phaseArgumentName} / 360.0`,
        `${pad}self.${module.channel}.set(${frequencyExpression}, amplitude=${amplitudeExpression}, phase=${phaseArgumentName}_turns, phase_mode=${phaseModeConstant(module.phaseMode ?? defaultPhaseMode)})`
      ]
    : [
        `${pad}self.${module.channel}.set(${frequencyExpression}, amplitude=${amplitudeExpression}, phase=${formatNumber(parameters.phase.value)} / 360.0, phase_mode=${phaseModeConstant(module.phaseMode ?? defaultPhaseMode)})`
      ];

  return [...lines, ...phaseExpression];
};

const renderTaskTiming = (module: SequenceModule, level: number, options: {
  skipDdsSet?: boolean;
  enabledSweeps?: EnabledSweep[];
  argumentNames?: Map<string, string>;
  ddsSetOptions?: { includeAttenuation?: boolean; includeWaveform?: boolean };
} = {}) => {
  const lines: string[] = [];
  const pad = indent(level);
  const enabledSweeps = options.enabledSweeps ?? [];
  const argumentNames = options.argumentNames ?? new Map<string, string>();
  const durationSweep = sweepForParameter(enabledSweeps, module, "duration");
  const ttlDurationSweep = ttlDurationSweepForModule(enabledSweeps, module);
  const duration = durationSweep
    ? sweepVariableName(durationSweep, enabledSweeps)
    : ttlDurationSweep
      ? sweepVariableName(ttlDurationSweep, enabledSweeps)
      : module.type === "ttl_output"
        ? argumentExpression(module, "ttlDuration", argumentNames, formatNumber(module.durationMs))
        : argumentExpression(module, "duration", argumentNames, formatNumber(module.durationMs));

  if (module.type === "dds") {
    if (!options.skipDdsSet) {
      lines.push(...renderDdsSet(module, level, enabledSweeps, argumentNames, options.ddsSetOptions));
    }
    lines.push(`${pad}self.${module.channel}.sw.on()`);
    lines.push(`${pad}delay(${duration} * ms)`);
    lines.push(`${pad}self.${module.channel}.sw.off()`);
  }

  if (module.type === "ttl_output") {
    lines.push(`${pad}self.${module.channel}.on()`);
    lines.push(`${pad}delay(${duration} * ms)`);
    lines.push(`${pad}self.${module.channel}.off()`);
  }

  if (module.type === "measure") {
    if (module.edge === "falling") {
      lines.push(`${pad}self.${module.channel}.gate_falling(${duration} * ms)`);
    } else if (module.edge === "both") {
      lines.push(`${pad}self.${module.channel}.gate_both(${duration} * ms)`);
    } else {
      lines.push(`${pad}self.${module.channel}.gate_rising(${duration} * ms)`);
    }
  }

  return lines;
};

const measurementModulesInScheduleOrder = (modules: SequenceModule[]) =>
  [...modules]
    .filter((module) => module.type === "measure")
    .sort((a, b) => a.startMs - b.startMs);

export const getRequiredDatasetsFromPlots = (selectedPlots: PlotPackage[], availableDatasets: AvailablePlotDatasets) => [
  ...new Set(
    selectedPlots
      .filter((plot) => plot.enabled && isPlotValid(plot, availableDatasets))
      .flatMap((plot) => [plot.x, plot.y])
  )
];

type MeasurementDatasetPlan = {
  scanIndex: boolean;
  shotIndex: boolean;
  averageCountRateBases: Set<string>;
  rawCountRateBases: Set<string>;
};

const buildMeasurementDatasetPlan = (
  selectedPlots: PlotPackage[],
  availableDatasets: AvailablePlotDatasets
): MeasurementDatasetPlan => {
  const requiredDatasets = getRequiredDatasetsFromPlots(selectedPlots, availableDatasets);
  return {
    scanIndex: requiredDatasets.includes("scan_index"),
    shotIndex: requiredDatasets.includes("shot_index"),
    averageCountRateBases: new Set(
      requiredDatasets
        .filter(
          (dataset) =>
            dataset.endsWith(".average_count_rate") ||
            (dataset.endsWith(".count_rate") && !dataset.endsWith(".raw_count_rate"))
        )
        .map((dataset) => dataset.replace(/\.(?:average_count_rate|count_rate)$/, ""))
    ),
    rawCountRateBases: new Set(
      requiredDatasets
        .filter((dataset) => dataset.endsWith(".raw_count_rate"))
        .map((dataset) => dataset.replace(/\.raw_count_rate$/, ""))
    )
  };
};

const numericDatasetComment = (level: number, includeRawCounts = false) => [
  `${indent(level)}# Numeric result datasets are fixed-size NumPy arrays so the ARTIQ dashboard`,
  `${indent(level)}# can display them more clearly and their shapes are explicit.`,
  ...(includeRawCounts
    ? [
        `${indent(level)}# raw_counts is one-dimensional in scan-major shot order:`,
        `${indent(level)}# shot_index = scan_index * repetitions + repetition_index.`
      ]
    : [])
];

const counterBufferName = (module: SequenceModule) => `${countVariableName(module)}_raw_buffer`;

const generateCounterBufferInitializationCode = (inputCountingBlocks: SequenceModule[], totalExpression: string, level: number) =>
  measurementModulesInScheduleOrder(inputCountingBlocks).map(
    (module) => `${indent(level)}${counterBufferName(module)} = [0] * ${totalExpression}`
  );

const generateCounterFetchToBufferCode = (inputCountingBlocks: SequenceModule[], level: number, indexExpression = "shot_index") => {
  const orderedInputBlocks = measurementModulesInScheduleOrder(inputCountingBlocks);
  if (orderedInputBlocks.length === 0) return [];
  return orderedInputBlocks.flatMap((module) => {
    const countVariable = countVariableName(module);
    return [
      `${indent(level)}${countVariable} = self.${module.channel}.fetch_count()`,
      `${indent(level)}${counterBufferName(module)}[${indexExpression}] = ${countVariable}`
    ];
  });
};

const generateCounterFetchCode = (inputCountingBlocks: SequenceModule[], level: number) =>
  measurementModulesInScheduleOrder(inputCountingBlocks).map(
    (module) => `${indent(level)}${countVariableName(module)} = self.${module.channel}.fetch_count()`
  );

const generateSweepRawDatasetMutationCode = (
  module: SequenceModule,
  datasetPlan: MeasurementDatasetPlan,
  level: number,
  prefix = "measurement"
) => {
  const base = measurementDatasetBase(module, prefix);
  const countVariable = countVariableName(module);
  const rawRateVariable = `${countVariable}_raw_rate`;
  const countDurationSeconds = formatNumber(Math.max(module.durationMs / 1000, 0.000001));
  return [
    `${indent(level)}self.mutate_dataset("${escapePythonString(`${base}.raw_counts`)}", shot_index, ${countVariable})`,
    ...(datasetPlan.rawCountRateBases.has(base)
      ? [
          `${indent(level)}${rawRateVariable} = ${countVariable} / ${countDurationSeconds}`,
          `${indent(level)}self.mutate_dataset("${escapePythonString(`${base}.raw_count_rate`)}", shot_index, ${rawRateVariable})`
        ]
      : [])
  ];
};

const generateFixedMeasurementDatasetMutateCode = (
  inputCountingBlocks: SequenceModule[],
  datasetPlan: MeasurementDatasetPlan,
  level: number,
  indexExpression: string,
  prefix = "measurement"
) => measurementModulesInScheduleOrder(inputCountingBlocks).flatMap((module) => {
  const base = measurementDatasetBase(module, prefix);
  const countVariable = countVariableName(module);
  const rateVariable = `${countVariable}_rate`;
  const countDurationSeconds = formatNumber(Math.max(module.durationMs / 1000, 0.000001));
  return [
    `${indent(level)}self.mutate_dataset("${escapePythonString(`${base}.counts`)}", ${indexExpression}, ${countVariable})`,
    ...(datasetPlan.averageCountRateBases.has(base)
      ? [
          `${indent(level)}${rateVariable} = ${countVariable} / ${countDurationSeconds}`,
          `${indent(level)}self.mutate_dataset("${escapePythonString(`${base}.count_rate`)}", ${indexExpression}, ${rateVariable})`
        ]
      : [])
  ];
});

const generateFixedMeasurementDatasetInitializationCode = (
  inputCountingBlocks: SequenceModule[],
  datasetPlan: MeasurementDatasetPlan,
  level: number,
  prefix = "measurement"
) => {
  const orderedInputBlocks = measurementModulesInScheduleOrder(inputCountingBlocks);
  const datasetLines: string[] = [
    ...(datasetPlan.shotIndex ? [`${indent(level)}self.set_dataset("shot_index", np.arange(self.repetition, dtype=np.int32), broadcast=True, archive=True)`] : [])
  ];

  orderedInputBlocks.forEach((module) => {
    const base = measurementDatasetBase(module, prefix);
    datasetLines.push(
      `${indent(level)}self.set_dataset("${escapePythonString(`${base}.counts`)}", np.full(self.repetition, -1, dtype=np.int32), broadcast=True, archive=True)`,
      ...(datasetPlan.averageCountRateBases.has(base)
        ? [`${indent(level)}self.set_dataset("${escapePythonString(`${base}.count_rate`)}", np.full(self.repetition, np.nan, dtype=float), broadcast=True, archive=True)`]
        : [])
    );
  });

  return datasetLines.length > 0 ? [...numericDatasetComment(level, false), ...datasetLines] : [];
};

const generateFixedMeasurementDatasetPublishCode = (
  inputCountingBlocks: SequenceModule[],
  datasetPlan: MeasurementDatasetPlan,
  level: number,
  prefix = "measurement"
) => {
  const orderedInputBlocks = measurementModulesInScheduleOrder(inputCountingBlocks);
  if (orderedInputBlocks.length === 0) return [];
  const lines = [`${indent(level)}for shot_index in range(self.repetition):`];

  orderedInputBlocks.forEach((module) => {
    const base = measurementDatasetBase(module, prefix);
    const countVariable = countVariableName(module);
    const valueVariable = `${countVariable}_value`;
    const rateVariable = `${countVariable}_rate`;
    const countDurationSeconds = formatNumber(Math.max(module.durationMs / 1000, 0.000001));
    if (datasetPlan.averageCountRateBases.has(base)) {
      lines.push(
        `${indent(level + 1)}${valueVariable} = ${counterBufferName(module)}[shot_index]`,
        `${indent(level + 1)}self.mutate_dataset("${escapePythonString(`${base}.counts`)}", shot_index, ${valueVariable})`,
        `${indent(level + 1)}${rateVariable} = ${valueVariable} / ${countDurationSeconds}`,
        `${indent(level + 1)}self.mutate_dataset("${escapePythonString(`${base}.count_rate`)}", shot_index, ${rateVariable})`
      );
    } else {
      lines.push(
        `${indent(level + 1)}self.mutate_dataset("${escapePythonString(`${base}.counts`)}", shot_index, ${counterBufferName(module)}[shot_index])`
      );
    }
  });

  return lines;
};

const makeChannelLanes = (modules: SequenceModule[]) =>
  [...new Set(modules.map((module) => module.channel))]
    .sort(compareChannelIds)
    .map((channel) => modules
      .filter((module) => module.channel === channel)
      .sort((a, b) => a.startMs - b.startMs));

const renderSequenceBody = (state: SequenceState, level: number, argumentNames = new Map<string, string>()) => {
  const lines: string[] = [];
  const channelLanes = makeChannelLanes(state.modules);
  const renderLane = (modules: SequenceModule[], laneLevel: number) => {
    const laneLines: string[] = [];
    let previousEndMs = 0;
    let previousDdsIdentity: ReturnType<typeof ddsConfigurationIdentity> | undefined;
    modules.forEach((module) => {
      const gapMs = Math.max(0, module.startMs - previousEndMs);
      if (gapMs > 0) {
        laneLines.push(`${indent(laneLevel)}delay(${formatNumber(gapMs)} * ms)`);
      }
      if (module.type === "dds") {
        const currentIdentity = ddsConfigurationIdentity(module, [], argumentNames);
        const canReuseWaveform = module.phaseMode === "continuous"
          && previousDdsIdentity?.waveform === currentIdentity.waveform;
        laneLines.push(...renderTaskTiming(module, laneLevel, {
          argumentNames,
          ddsSetOptions: {
            includeAttenuation: previousDdsIdentity?.attenuation !== currentIdentity.attenuation,
            includeWaveform: !canReuseWaveform
          }
        }));
        previousDdsIdentity = currentIdentity;
      } else {
        laneLines.push(...renderTaskTiming(module, laneLevel, { argumentNames }));
      }
      previousEndMs = moduleEnd(module);
    });
    return laneLines;
  };

  if (channelLanes.length === 0) {
    lines.push(`${indent(level)}pass`);
  } else if (channelLanes.length === 1) {
    lines.push(...renderLane(channelLanes[0], level));
  } else {
    lines.push(`${indent(level)}with parallel:`);
    channelLanes.forEach((modules) => {
      lines.push(`${indent(level + 1)}# Channel: ${modules[0].channel}`);
      lines.push(`${indent(level + 1)}with sequential:`);
      lines.push(...renderLane(modules, level + 2));
    });
  }

  return lines;
};

const renderSequenceBodyForSweep = (state: SequenceState, enabledSweeps: EnabledSweep[], level: number, argumentNames = new Map<string, string>()) => {
  const lines: string[] = [];
  const channelLanes = makeChannelLanes(state.modules);

  const renderLane = (modules: SequenceModule[], laneLevel: number) => {
    const laneLines: string[] = [];
    let previousStaticEnd = 0;
    let previousDdsIdentity: ReturnType<typeof ddsConfigurationIdentity> | undefined;
    modules.forEach((module, index) => {
      const staticGap = index === 0
        ? module.startMs
        : Math.max(0, module.gapAfterPrevious ?? module.startMs - previousStaticEnd);
      if (staticGap > 0) {
        laneLines.push(`${indent(laneLevel)}delay(${formatNumber(staticGap)} * ms)`);
      }
      if (module.type === "dds") {
        const currentIdentity = ddsConfigurationIdentity(module, enabledSweeps, argumentNames);
        const canReuseWaveform = module.phaseMode === "continuous"
          && previousDdsIdentity?.waveform === currentIdentity.waveform;
        laneLines.push(...renderTaskTiming(module, laneLevel, {
          enabledSweeps,
          argumentNames,
          ddsSetOptions: {
            includeAttenuation: previousDdsIdentity?.attenuation !== currentIdentity.attenuation,
            includeWaveform: !canReuseWaveform
          }
        }));
        previousDdsIdentity = currentIdentity;
      } else {
        laneLines.push(...renderTaskTiming(module, laneLevel, { enabledSweeps, argumentNames }));
      }
      previousStaticEnd = moduleEnd(module);
    });
    return laneLines;
  };

  if (channelLanes.length === 0) {
    lines.push(`${indent(level)}pass`);
    return lines;
  }

  if (channelLanes.length === 1) {
    lines.push(...renderLane(channelLanes[0], level));
  } else {
    lines.push(`${indent(level)}with parallel:`);
    channelLanes.forEach((modules) => {
      lines.push(`${indent(level + 1)}# Channel: ${modules[0].channel}`);
      lines.push(`${indent(level + 1)}with sequential:`);
      lines.push(...renderLane(modules, level + 2));
    });
  }

  return lines;
};

const generateSweepDatasetInitializationCode = (
  enabledSweeps: EnabledSweep[],
  inputCountingBlocks: SequenceModule[],
  datasetPlan: MeasurementDatasetPlan,
  level: number,
  repetitionNumPerPoint: number
) => {
  const hasRepeatedPoints = repetitionNumPerPoint > 1;
  const datasetLines = [
    ...(datasetPlan.scanIndex
      ? [`${indent(level)}self.set_dataset("scan_index", np.arange(self.scan_points, dtype=np.int32), broadcast=True, archive=True)`]
      : []),
    ...(datasetPlan.shotIndex && hasRepeatedPoints
      ? [`${indent(level)}self.set_dataset("shot_index", np.arange(self.scan_points * self.repetition_num_per_point, dtype=np.int32), broadcast=True, archive=True)`]
      : [])
  ];

  measurementModulesInScheduleOrder(inputCountingBlocks).forEach((module) => {
    const base = measurementDatasetBase(module);
    datasetLines.push(
      `${indent(level)}self.set_dataset("${escapePythonString(`${base}.average_counts`)}", np.full(self.scan_points, np.nan, dtype=float), broadcast=True, archive=True)`,
      ...(datasetPlan.averageCountRateBases.has(base)
        ? [`${indent(level)}self.set_dataset("${escapePythonString(`${base}.average_count_rate`)}", np.full(self.scan_points, np.nan, dtype=float), broadcast=True, archive=True)`]
        : []),
      ...(hasRepeatedPoints
        ? [
            `${indent(level)}self.set_dataset("${escapePythonString(`${base}.raw_counts`)}", np.full(self.scan_points * self.repetition_num_per_point, -1, dtype=np.int32), broadcast=True, archive=True)`,
            ...(datasetPlan.rawCountRateBases.has(base)
              ? [`${indent(level)}self.set_dataset("${escapePythonString(`${base}.raw_count_rate`)}", np.full(self.scan_points * self.repetition_num_per_point, np.nan, dtype=float), broadcast=True, archive=True)`]
              : [])
          ]
        : [])
    );
  });

  return datasetLines.length > 0 ? [...numericDatasetComment(level, inputCountingBlocks.length > 0 && hasRepeatedPoints), ...datasetLines] : [];
};

const generateSweepDatasetAppendCode = (
  inputCountingBlocks: SequenceModule[],
  datasetPlan: MeasurementDatasetPlan,
  level: number,
  repetitionNumPerPoint: number,
  prefix = "measurement"
) => {
  const lines: string[] = [];
  const hasRepeatedPoints = repetitionNumPerPoint > 1;

  inputCountingBlocks.forEach((module) => {
    const base = measurementDatasetBase(module, prefix);
    const countVariable = countVariableName(module);
    const averageVariable = `${countVariable}_average`;
    const rateVariable = `${countVariable}_average_rate`;
    const countDurationSeconds = formatNumber(Math.max(module.durationMs / 1000, 0.000001));
    const needsCountRate = datasetPlan.averageCountRateBases.has(base);
    if (hasRepeatedPoints && needsCountRate) {
      lines.push(
        `${indent(level)}${averageVariable} = ${countVariable}_sum / self.repetition_num_per_point`,
        `${indent(level)}self.mutate_dataset("${escapePythonString(`${base}.average_counts`)}", scan_index, ${averageVariable})`
      );
    } else if (hasRepeatedPoints) {
      lines.push(
        `${indent(level)}self.mutate_dataset("${escapePythonString(`${base}.average_counts`)}", scan_index, ${countVariable}_sum / self.repetition_num_per_point)`
      );
    } else {
      lines.push(`${indent(level)}self.mutate_dataset("${escapePythonString(`${base}.average_counts`)}", scan_index, ${countVariable})`);
    }
    if (needsCountRate) {
      const rateSource = hasRepeatedPoints ? averageVariable : countVariable;
      lines.push(
        `${indent(level)}${rateVariable} = ${rateSource} / ${countDurationSeconds}`,
        `${indent(level)}self.mutate_dataset("${escapePythonString(`${base}.average_count_rate`)}", scan_index, ${rateVariable})`
      );
    }
  });

  return lines;
};

const generateSweepValueAssignments = (enabledSweeps: EnabledSweep[], level: number) =>
  enabledSweeps.map(
    (enabledSweep) =>
      `${indent(level)}${sweepVariableName(enabledSweep, enabledSweeps)} = ${formatNumber(enabledSweep.sweep.start)} + ${formatNumber(enabledSweep.sweep.step)} * scan_index`
  );

const generateSweepDatasetPublishFromBufferCode = (
  inputCountingBlocks: SequenceModule[],
  datasetPlan: MeasurementDatasetPlan,
  level: number,
  repetitionNumPerPoint: number,
  prefix = "measurement"
) => {
  const orderedInputBlocks = measurementModulesInScheduleOrder(inputCountingBlocks);
  const hasRepeatedPoints = repetitionNumPerPoint > 1;
  const lines = [
    `${indent(level)}for scan_index in range(self.scan_points):`
  ];

  orderedInputBlocks.forEach((module) => {
    lines.push(`${indent(level + 1)}${countVariableName(module)}_sum = 0`);
  });

  if (orderedInputBlocks.length > 0 && hasRepeatedPoints) {
    lines.push(`${indent(level + 1)}for repetition_index in range(self.repetition_num_per_point):`);
    lines.push(`${indent(level + 2)}shot_index = scan_index * self.repetition_num_per_point + repetition_index`);
    orderedInputBlocks.forEach((module) => {
      const countVariable = countVariableName(module);
      lines.push(
        `${indent(level + 2)}${countVariable} = ${counterBufferName(module)}[shot_index]`,
        ...generateSweepRawDatasetMutationCode(module, datasetPlan, level + 2, prefix),
        `${indent(level + 2)}${countVariable}_sum += ${countVariable}`
      );
    });
  } else if (orderedInputBlocks.length > 0) {
    orderedInputBlocks.forEach((module) => {
      const countVariable = countVariableName(module);
      lines.push(`${indent(level + 1)}${countVariable} = ${counterBufferName(module)}[scan_index]`);
    });
  }

  lines.push(...generateSweepDatasetAppendCode(orderedInputBlocks, datasetPlan, level + 1, repetitionNumPerPoint));
  return lines;
};

const generateAppletLaunchCode = (selectedPlots: PlotPackage[], availableDatasets: AvailablePlotDatasets, level: number) => {
  const specs = getAppletCommandSpecs(selectedPlots, availableDatasets);
  if (specs.length === 0) return [];
  return [
    `${indent(level)}def launch_applets(self):`,
    `${indent(level + 1)}# Dashboard expands the applet template and manages the process on every supported OS.`,
    ...specs.flatMap((spec) => [
      `${indent(level + 1)}self.ccb.issue(`,
      `${indent(level + 2)}"create_applet",`,
      `${indent(level + 2)}"${escapePythonString(spec.name)}",`,
      `${indent(level + 2)}"${escapePythonString(spec.command)}"${spec.group ? "," : ""}`,
      ...(spec.group
        ? [`${indent(level + 2)}group="${escapePythonString(spec.group)}"`]
        : []),
      `${indent(level + 1)})`
    ])
  ];
};

const generateArgumentBuildCode = (argumentContext: ArgumentContext, level: number) =>
  argumentContext.specs.map((spec) => {
    const options = [
      `default=${formatNumber(spec.defaultValue)}`,
      ...(spec.min !== undefined ? [`min=${formatNumber(spec.min)}`] : []),
      ...(spec.max !== undefined ? [`max=${formatNumber(spec.max)}`] : [])
    ].join(", ");
    return `${indent(level)}self.setattr_argument("${escapePythonString(spec.name)}", NumberValue(${options}))`;
  });

const terminalAppletCommands = (selectedPlots: PlotPackage[], availableDatasets: AvailablePlotDatasets) =>
  getAppletCommandSpecs(selectedPlots, availableDatasets).map((spec) => spec.command);

const pythonPrintLine = (level: number, text: string) =>
  `${indent(level)}print("${escapePythonString(text)}")`;

const pythonPrintExpression = (level: number, prefix: string, expression: string) =>
  `${indent(level)}print("${escapePythonString(prefix)}" + str(${expression}))`;

const compactChannelList = (channels: string[]) => channels.length ? channels.join(", ") : "none";

const sweepBriefLine = (enabledSweep: EnabledSweep) =>
  `${enabledSweep.module.channel}.${enabledSweep.parameter}: ${formatNumber(enabledSweep.sweep.start)} -> ${formatNumber(enabledSweep.sweep.end)} ${enabledSweep.unit}, points=${enabledSweep.sweep.points}`;

const generateRunBriefCode = (
  state: SequenceState,
  enabledSweeps: EnabledSweep[],
  usedChannels: string[],
  inputCountingBlocks: SequenceModule[],
  datasetPlan: MeasurementDatasetPlan,
  appletCommands: string[],
  level: number
) => {
  const runMode = enabledSweeps.length === 0 ? "no sweep" : enabledSweeps.length === 1 ? "single sweep" : "multi sweep";
  const ddsChannels = usedChannels.filter((channel) => /^urukul\d+_ch\d+$/.test(channel));
  const ttlOutputChannels = state.modules
    .filter((module) => module.type === "ttl_output")
    .map((module) => module.channel);
  const counterChannels = measurementModulesInScheduleOrder(inputCountingBlocks).map((module) => module.channel);
  const hasSweep = enabledSweeps.length > 0;
  const hasRepeatedSweepPoints = hasSweep && Math.max(1, Math.round(state.loop.count)) > 1;
  const fixedRepetitionCount = Math.max(1, Math.round(state.loop.count));
  const scanPointsExpression = hasSweep ? "self.scan_points" : "1";
  const repetitionsExpression = hasSweep
    ? (hasRepeatedSweepPoints ? "self.repetition_num_per_point" : "1")
    : fixedRepetitionCount === 1 ? "1" : "self.repetition";
  const totalMeasurementShotsExpression = `${scanPointsExpression} * ${repetitionsExpression} * ${counterChannels.length}`;
  const lines = [
    `${indent(level)}# Print a compact host-side summary for quick inspection in the ARTIQ log.`,
    `${indent(level)}# This method must stay outside the kernel and must not affect RTIO timing.`,
    `${indent(level)}def print_run_brief(self):`,
    pythonPrintLine(level + 1, "========== Experiment Run Brief =========="),
    pythonPrintLine(level + 1, `Experiment: ${state.sequenceName || "Untitled sequence"}`),
    pythonPrintLine(level + 1, "Generated by: ARTIQ Sequence Builder"),
    pythonPrintLine(level + 1, `Run mode: ${runMode}`),
    pythonPrintLine(level + 1, ""),
    pythonPrintLine(level + 1, "Sweep:")
  ];

  if (enabledSweeps.length === 0) {
    lines.push(pythonPrintLine(level + 1, "- none"));
  } else {
    enabledSweeps.forEach((enabledSweep) => {
      lines.push(pythonPrintLine(level + 1, `- ${sweepBriefLine(enabledSweep)}`));
    });
  }

  lines.push(
    pythonPrintLine(level + 1, ""),
    pythonPrintLine(level + 1, "Repetition:"),
    ...(hasSweep && !hasRepeatedSweepPoints
      ? [pythonPrintLine(level + 1, "- one sequence per scan point")]
      : [pythonPrintExpression(level + 1, hasSweep ? "- repetitions per scan point: " : "- repetitions: ", repetitionsExpression)]),
    pythonPrintExpression(level + 1, "- scan points: ", scanPointsExpression),
    pythonPrintExpression(level + 1, "- total measurement shots: ", totalMeasurementShotsExpression),
    pythonPrintLine(level + 1, ""),
    pythonPrintLine(level + 1, "Channels:"),
    pythonPrintLine(level + 1, `- DDS: ${compactChannelList([...new Set(ddsChannels)])}`),
    pythonPrintLine(level + 1, `- TTL out: ${compactChannelList([...new Set(ttlOutputChannels)])}`),
    pythonPrintLine(level + 1, `- Counters: ${compactChannelList([...new Set(counterChannels)])}`),
    pythonPrintLine(level + 1, ""),
    pythonPrintLine(level + 1, "Datasets:")
  );

  if (hasSweep && datasetPlan.scanIndex) {
    lines.push(`${indent(level + 1)}print("- scan_index: shape=(" + str(self.scan_points) + ",)")`);
  }
  if (hasSweep && hasRepeatedSweepPoints && datasetPlan.shotIndex) {
    lines.push(`${indent(level + 1)}print("- shot_index: shape=(" + str(self.scan_points * self.repetition_num_per_point) + ",)")`);
  } else if (!hasSweep && datasetPlan.shotIndex) {
    lines.push(`${indent(level + 1)}print("- shot_index: shape=(" + str(self.repetition) + ",)")`);
  }

  measurementModulesInScheduleOrder(inputCountingBlocks).forEach((module) => {
    const base = measurementDatasetBase(module);
    const escapedBase = escapePythonString(base);
    if (hasSweep) {
      if (hasRepeatedSweepPoints) {
        lines.push(
          `${indent(level + 1)}print("- ${escapedBase}.raw_counts: shape=(" + str(self.scan_points * self.repetition_num_per_point) + ",), meaning=scan-major raw shots")`,
          `${indent(level + 1)}print("- ${escapedBase}.average_counts: shape=(" + str(self.scan_points) + ",), meaning=average counts per scan point")`
        );
      } else {
        lines.push(
          `${indent(level + 1)}print("- ${escapedBase}.average_counts: shape=(" + str(self.scan_points) + ",), meaning=one count result per scan point")`
        );
      }
    } else {
      lines.push(
        `${indent(level + 1)}print("- ${escapedBase}.counts: shape=(" + str(self.repetition) + ",), meaning=counts per repetition")`
      );
    }
    if (datasetPlan.averageCountRateBases.has(base)) {
      lines.push(
        hasSweep
          ? `${indent(level + 1)}print("- ${escapedBase}.average_count_rate: shape=(" + str(self.scan_points) + ",), meaning=average count rate per scan point requested by plot")`
          : `${indent(level + 1)}print("- ${escapedBase}.count_rate: shape=(" + str(self.repetition) + ",), meaning=count rate requested by plot")`
      );
    }
    if (hasSweep && hasRepeatedSweepPoints && datasetPlan.rawCountRateBases.has(base)) {
      lines.push(
        `${indent(level + 1)}print("- ${escapedBase}.raw_count_rate: shape=(" + str(self.scan_points * self.repetition_num_per_point) + ",), meaning=raw shot count rate requested by plot")`
      );
    }
  });

  if (inputCountingBlocks.length === 0) {
    lines.push(pythonPrintLine(level + 1, "- no counter result datasets"));
  }

  lines.push(
    pythonPrintLine(level + 1, ""),
    pythonPrintLine(level + 1, "Applets:")
  );

  if (appletCommands.length === 0) {
    lines.push(pythonPrintLine(level + 1, "- none"));
  } else {
    appletCommands.forEach((command) => lines.push(pythonPrintLine(level + 1, `- ${command}`)));
  }

  lines.push(pythonPrintLine(level + 1, "=========================================="));
  return lines;
};

const generateSweepArtiqPython = (
  state: SequenceState,
  enabledSweeps: EnabledSweep[],
  className: string,
  usedChannels: string[],
  cplds: string[],
  ddsChannels: string[],
  inputCountingBlocks: SequenceModule[],
  selectedPlots: PlotPackage[],
  options: ArtiqPythonGenerationOptions
) => {
  const firstSweep = enabledSweeps[0];
  const repetitionNumPerPoint = Math.max(1, Math.round(state.loop.count));
  const hasRepeatedPoints = repetitionNumPerPoint > 1;
  const totalSweepSequences = firstSweep.sweep.points * repetitionNumPerPoint;
  const sweepFetchBatchSize = effectiveFetchBatchSize(state, totalSweepSequences);
  const needsSweepBatching = inputCountingBlocks.length > 0
    && sweepFetchBatchSize > 1
    && totalSweepSequences > sweepFetchBatchSize;
  const sweepSequenceCountExpression = hasRepeatedPoints ? "self.total_shoot" : "self.scan_points";
  const loopDelayMs = Math.max(0, state.loop.interLoopDelayMs);
  const startSlackMs = Math.max(0, state.startSlackMs ?? 0);
  const availablePlotDatasets = getAvailablePlotDatasets(inputCountingBlocks, undefined, true, hasRepeatedPoints);
  const datasetPlan = buildMeasurementDatasetPlan(selectedPlots, availablePlotDatasets);
  const argumentContext = collectArgumentContext(state, enabledSweeps);
  const appletLaunchCode = generateAppletLaunchCode(selectedPlots, availablePlotDatasets, 1);
  const appletCommands = terminalAppletCommands(selectedPlots, availablePlotDatasets);
  const includeRunBrief = options.includeRunBrief ?? true;
  const sweepDatasetInitializationCode = generateSweepDatasetInitializationCode(enabledSweeps, inputCountingBlocks, datasetPlan, 2, repetitionNumPerPoint);
  const lines: string[] = [
    "from artiq.experiment import *",
    ...(ddsChannels.length > 0 ? ["from artiq.coredevice.ad9910 import PHASE_MODE_ABSOLUTE, PHASE_MODE_CONTINUOUS, PHASE_MODE_TRACKING"] : []),
    ...(sweepDatasetInitializationCode.length > 0 ? ["import numpy as np"] : []),
    "",
    "",
    `class ${className}(EnvExperiment):`,
    `${indent(1)}def build(self):`,
    `${indent(2)}self.setattr_device("core")`,
    ...(appletLaunchCode.length > 0 ? [`${indent(2)}self.setattr_device("ccb")`] : [])
  ];

  [...cplds, ...usedChannels].forEach((device) => {
    lines.push(`${indent(2)}self.setattr_device("${device}")`);
  });
  lines.push(...generateArgumentBuildCode(argumentContext, 2));

  lines.push(
    "",
    `${indent(1)}def prepare(self):`,
    `${indent(2)}self.scan_points = ${firstSweep.sweep.points}`,
    ...(hasRepeatedPoints
      ? [
          `${indent(2)}self.repetition_num_per_point = ${repetitionNumPerPoint}`,
          ...(needsSweepBatching
            ? [`${indent(2)}self.total_shoot = self.scan_points * self.repetition_num_per_point`]
            : [])
        ]
      : []),
    ...(loopDelayMs > 0 ? [`${indent(2)}self.inter_loop_delay_ms = ${formatNumber(loopDelayMs)}`] : []),
    ...(startSlackMs > 0 ? [`${indent(2)}self.start_slack_ms = ${formatNumber(startSlackMs)}`] : []),
    ...(needsSweepBatching
      ? [`${indent(2)}self.sequence_batch_size = ${sweepFetchBatchSize}`]
      : []),
    ...(sweepDatasetInitializationCode.length > 0
      ? [
          "",
          `${indent(1)}def setup_datasets(self):`,
          ...sweepDatasetInitializationCode
        ]
      : []),
    ...(appletLaunchCode.length > 0 ? ["", ...appletLaunchCode] : []),
    ...(includeRunBrief ? ["", ...generateRunBriefCode(state, enabledSweeps, usedChannels, inputCountingBlocks, datasetPlan, appletCommands, 1)] : []),
    "",
    `${indent(1)}@kernel`,
    `${indent(1)}def run_kernel(self):`,
    `${indent(2)}self.core.reset()`,
    `${indent(2)}self.core.break_realtime()`,
    ...(startSlackMs > 0
      ? [
          `${indent(2)}# Extra initial RTIO scheduling slack before the first sequence.`,
          `${indent(2)}delay(self.start_slack_ms * ms)`
        ]
      : [])
  );

  cplds.forEach((cpld) => lines.push(`${indent(2)}self.${cpld}.init()`));
  ddsChannels.forEach((channel) => lines.push(`${indent(2)}self.${channel}.init()`));

  if (inputCountingBlocks.length > 0) {
    if (sweepFetchBatchSize === 1) {
      const orderedCounters = measurementModulesInScheduleOrder(inputCountingBlocks);
      lines.push(
        "",
        `${indent(2)}# Fetch batch is one, so each shot is read and published immediately.`,
        `${indent(2)}for scan_index in range(self.scan_points):`,
        ...generateSweepValueAssignments(enabledSweeps, 3)
      );
      if (hasRepeatedPoints) {
        orderedCounters.forEach((module) => {
          lines.push(`${indent(3)}${countVariableName(module)}_sum = 0`);
        });
        lines.push(
          `${indent(3)}for repetition_index in range(self.repetition_num_per_point):`,
          `${indent(4)}shot_index = scan_index * self.repetition_num_per_point + repetition_index`,
          ...renderSequenceBodyForSweep(state, enabledSweeps, 4, argumentContext.names),
          ...generateCounterFetchCode(inputCountingBlocks, 4)
        );
        orderedCounters.forEach((module) => {
          const countVariable = countVariableName(module);
          lines.push(
            ...generateSweepRawDatasetMutationCode(module, datasetPlan, 4),
            `${indent(4)}${countVariable}_sum += ${countVariable}`
          );
        });
        lines.push(
          ...(loopDelayMs > 0
            ? [
                `${indent(4)}if scan_index != self.scan_points - 1 or repetition_index != self.repetition_num_per_point - 1:`,
                `${indent(5)}delay(self.inter_loop_delay_ms * ms)`
              ]
            : []),
          `${indent(4)}if scan_index != self.scan_points - 1 or repetition_index != self.repetition_num_per_point - 1:`,
          `${indent(5)}self.core.break_realtime()`,
          ...generateSweepDatasetAppendCode(inputCountingBlocks, datasetPlan, 3, repetitionNumPerPoint)
        );
      } else {
        lines.push(
          ...renderSequenceBodyForSweep(state, enabledSweeps, 3, argumentContext.names),
          ...generateCounterFetchCode(inputCountingBlocks, 3),
          ...generateSweepDatasetAppendCode(inputCountingBlocks, datasetPlan, 3, repetitionNumPerPoint),
          ...(loopDelayMs > 0
            ? [
                `${indent(3)}if scan_index != self.scan_points - 1:`,
                `${indent(4)}delay(self.inter_loop_delay_ms * ms)`
              ]
            : []),
          `${indent(3)}if scan_index != self.scan_points - 1:`,
          `${indent(4)}self.core.break_realtime()`
        );
      }
    } else if (!needsSweepBatching) {
      const orderedCounters = measurementModulesInScheduleOrder(inputCountingBlocks);
      lines.push(
        "",
        `${indent(2)}# All shots fit in one fetch batch: schedule them first, then read them in order.`,
        `${indent(2)}for scan_index in range(self.scan_points):`,
        ...generateSweepValueAssignments(enabledSweeps, 3)
      );
      if (hasRepeatedPoints) {
        lines.push(
          `${indent(3)}for repetition_index in range(self.repetition_num_per_point):`,
          ...renderSequenceBodyForSweep(state, enabledSweeps, 4, argumentContext.names),
          ...(loopDelayMs > 0
            ? [
                `${indent(4)}if scan_index != self.scan_points - 1 or repetition_index != self.repetition_num_per_point - 1:`,
                `${indent(5)}delay(self.inter_loop_delay_ms * ms)`
              ]
            : [])
        );
      } else {
        lines.push(
          ...renderSequenceBodyForSweep(state, enabledSweeps, 3, argumentContext.names),
          ...(loopDelayMs > 0
            ? [
                `${indent(3)}if scan_index != self.scan_points - 1:`,
                `${indent(4)}delay(self.inter_loop_delay_ms * ms)`
              ]
            : [])
        );
      }

      lines.push(
        "",
        `${indent(2)}for scan_index in range(self.scan_points):`
      );
      if (hasRepeatedPoints) {
        orderedCounters.forEach((module) => {
          lines.push(`${indent(3)}${countVariableName(module)}_sum = 0`);
        });
        lines.push(
          `${indent(3)}for repetition_index in range(self.repetition_num_per_point):`,
          `${indent(4)}shot_index = scan_index * self.repetition_num_per_point + repetition_index`
        );
        lines.push(...generateCounterFetchCode(inputCountingBlocks, 4));
        orderedCounters.forEach((module) => {
          const countVariable = countVariableName(module);
          lines.push(
            ...generateSweepRawDatasetMutationCode(module, datasetPlan, 4),
            `${indent(4)}${countVariable}_sum += ${countVariable}`
          );
        });
        lines.push(...generateSweepDatasetAppendCode(inputCountingBlocks, datasetPlan, 3, repetitionNumPerPoint));
      } else {
        lines.push(
          ...generateCounterFetchCode(inputCountingBlocks, 3),
          ...generateSweepDatasetAppendCode(inputCountingBlocks, datasetPlan, 3, repetitionNumPerPoint)
        );
      }
    } else {
      lines.push(
        "",
        ...generateCounterBufferInitializationCode(inputCountingBlocks, sweepSequenceCountExpression, 2),
        "",
        ...(hasRepeatedPoints ? [`${indent(2)}# Each logical sequence maps to a scan point by integer division.`] : []),
        `${indent(2)}# Phase A/B: schedule complete sequences in batches, then fetch counter results in the same order.`,
        `${indent(2)}for batch_start in range(0, ${sweepSequenceCountExpression}, self.sequence_batch_size):`,
        `${indent(3)}batch_end = min(batch_start + self.sequence_batch_size, ${sweepSequenceCountExpression})`,
        `${indent(3)}# Phase A: schedule timing for this batch only; no readout or dataset updates here.`,
        `${indent(3)}for ${hasRepeatedPoints ? "shot_index" : "scan_index"} in range(batch_start, batch_end):`,
        ...(hasRepeatedPoints ? [`${indent(4)}scan_index = shot_index // self.repetition_num_per_point`] : []),
        ...generateSweepValueAssignments(enabledSweeps, 4),
        ...renderSequenceBodyForSweep(state, enabledSweeps, 4, argumentContext.names),
        ...(loopDelayMs > 0
          ? [
              `${indent(4)}if ${hasRepeatedPoints ? "shot_index" : "scan_index"} != batch_end - 1:`,
              `${indent(5)}delay(self.inter_loop_delay_ms * ms)`
            ]
          : []),
        "",
        `${indent(3)}# Phase B: fetch deferred counter results for this batch, preserving schedule order.`,
        `${indent(3)}for ${hasRepeatedPoints ? "shot_index" : "scan_index"} in range(batch_start, batch_end):`,
        ...generateCounterFetchToBufferCode(inputCountingBlocks, 4, hasRepeatedPoints ? "shot_index" : "scan_index"),
        `${indent(3)}if batch_end < ${sweepSequenceCountExpression}:`,
        `${indent(4)}# Batch boundary only: this recovers RTIO slack and is not a physical sequence gap.`,
        `${indent(4)}self.core.break_realtime()`
      );
    }
  } else {
    lines.push(
      "",
      `${indent(2)}# No counter measurements are scheduled, so no fetch batching is needed.`,
      `${indent(2)}for scan_index in range(self.scan_points):`,
      ...generateSweepValueAssignments(enabledSweeps, 3)
    );
    if (hasRepeatedPoints) {
      lines.push(
        `${indent(3)}for repetition_index in range(self.repetition_num_per_point):`,
        ...renderSequenceBodyForSweep(state, enabledSweeps, 4, argumentContext.names),
        ...(loopDelayMs > 0
          ? [
              `${indent(4)}if scan_index != self.scan_points - 1 or repetition_index != self.repetition_num_per_point - 1:`,
              `${indent(5)}delay(self.inter_loop_delay_ms * ms)`
            ]
          : [])
      );
    } else {
      lines.push(
        ...renderSequenceBodyForSweep(state, enabledSweeps, 3, argumentContext.names),
        ...(loopDelayMs > 0
          ? [
              `${indent(3)}if scan_index != self.scan_points - 1:`,
              `${indent(4)}delay(self.inter_loop_delay_ms * ms)`
            ]
          : [])
      );
    }
  }
  lines.push(
    ...(sweepDatasetInitializationCode.length > 0 && needsSweepBatching
      ? [
          "",
          `${indent(2)}# Phase C: after timing is complete, publish raw shots in scan-major order and averages per scan point.`,
          ...generateSweepDatasetPublishFromBufferCode(inputCountingBlocks, datasetPlan, 2, repetitionNumPerPoint)
        ]
      : [])
  );
  appendKernelTimelineCompletionWait(lines);

  lines.push(
    "",
    `${indent(1)}def run(self):`,
    ...(sweepDatasetInitializationCode.length > 0 ? [`${indent(2)}self.setup_datasets()`] : []),
    ...(includeRunBrief ? [`${indent(2)}self.print_run_brief()`] : []),
    ...(appletLaunchCode.length > 0 ? [`${indent(2)}self.launch_applets()`] : []),
    `${indent(2)}self.run_kernel()`
  );

  return `${lines.join("\n")}\n`;
};

export function generateArtiqPython(
  state: SequenceState,
  selectedPlots: PlotPackage[] = [],
  options: ArtiqPythonGenerationOptions = {}
): string {
  const className = sanitizePythonClassName(state.className);
  const usedChannels = [...new Set(state.modules.map((module) => module.channel))].sort(compareChannelIds);
  const cplds = [...new Set(usedChannels.map(channelRoot).filter(Boolean))] as string[];
  const ddsChannels = usedChannels.filter((channel) => /^urukul\d+_ch\d+$/.test(channel));
  const inputCountingBlocks = state.modules.filter((module) => module.type === "measure");
  const generationError = getArtiqGenerationError(state);
  if (generationError) {
    return maybeEmbedSequenceBuilderMetadata(`# ${generationError}\n`, state, selectedPlots, options);
  }

  const enabledSweeps = findEnabledDdsSweeps(state);
  if (enabledSweeps.length > 0) {
    return maybeEmbedSequenceBuilderMetadata(
      generateSweepArtiqPython(state, enabledSweeps, className, usedChannels, cplds, ddsChannels, inputCountingBlocks, selectedPlots, options),
      state,
      selectedPlots,
      options
    );
  }

  const availablePlotDatasets = getAvailablePlotDatasets(inputCountingBlocks, undefined, false);
  const datasetPlan = buildMeasurementDatasetPlan(selectedPlots, availablePlotDatasets);
  const argumentContext = collectArgumentContext(state);
  const appletLaunchCode = generateAppletLaunchCode(selectedPlots, availablePlotDatasets, 1);
  const appletCommands = terminalAppletCommands(selectedPlots, availablePlotDatasets);
  const includeRunBrief = options.includeRunBrief ?? true;
  const measurementDatasetInitializationCode = generateFixedMeasurementDatasetInitializationCode(inputCountingBlocks, datasetPlan, 2);
  const loopDelayMs = Math.max(0, state.loop.interLoopDelayMs);
  const startSlackMs = Math.max(0, state.startSlackMs ?? 0);
  const repetitionCount = Math.max(1, Math.round(state.loop.count));
  const isSingleSequenceWithoutMeasurement = repetitionCount === 1 && inputCountingBlocks.length === 0;
  const fixedFetchBatchSize = effectiveFetchBatchSize(state, repetitionCount);
  const needsFixedBatching = inputCountingBlocks.length > 0
    && fixedFetchBatchSize > 1
    && repetitionCount > fixedFetchBatchSize;

  const lines: string[] = [
    "from artiq.experiment import *",
    ...(ddsChannels.length > 0 ? ["from artiq.coredevice.ad9910 import PHASE_MODE_ABSOLUTE, PHASE_MODE_CONTINUOUS, PHASE_MODE_TRACKING"] : []),
    ...(measurementDatasetInitializationCode.length > 0 ? ["import numpy as np"] : []),
    "",
    "",
    `class ${className}(EnvExperiment):`,
    `${indent(1)}def build(self):`,
    `${indent(2)}self.setattr_device("core")`,
    ...(appletLaunchCode.length > 0 ? [`${indent(2)}self.setattr_device("ccb")`] : [])
  ];

  [...cplds, ...usedChannels].forEach((device) => {
    lines.push(`${indent(2)}self.setattr_device("${device}")`);
  });
  lines.push(...generateArgumentBuildCode(argumentContext, 2));

  lines.push(
    "",
    `${indent(1)}def prepare(self):`,
    ...(!isSingleSequenceWithoutMeasurement
      ? [
          `${indent(2)}self.repetition = ${repetitionCount}`,
          ...(loopDelayMs > 0 ? [`${indent(2)}self.inter_loop_delay_ms = ${formatNumber(loopDelayMs)}`] : [])
        ]
      : []),
    ...(startSlackMs > 0 ? [`${indent(2)}self.start_slack_ms = ${formatNumber(startSlackMs)}`] : []),
    ...(needsFixedBatching
      ? [`${indent(2)}self.sequence_batch_size = ${fixedFetchBatchSize}`]
      : [])
  );

  if (measurementDatasetInitializationCode.length > 0) {
    lines.push(
      "",
      `${indent(1)}def setup_datasets(self):`,
      ...measurementDatasetInitializationCode
    );
  }

  if (appletLaunchCode.length > 0) {
    lines.push("", ...appletLaunchCode);
  }

  if (includeRunBrief) {
    lines.push("", ...generateRunBriefCode(state, [], usedChannels, inputCountingBlocks, datasetPlan, appletCommands, 1));
  }

  lines.push(
    "",
    `${indent(1)}@kernel`,
    `${indent(1)}def run_kernel(self):`,
    `${indent(2)}self.core.reset()`,
    `${indent(2)}self.core.break_realtime()`,
    ...(startSlackMs > 0
      ? [
          `${indent(2)}# Extra initial RTIO scheduling slack before the first sequence.`,
          `${indent(2)}delay(self.start_slack_ms * ms)`
        ]
      : [])
  );

  cplds.forEach((cpld) => lines.push(`${indent(2)}self.${cpld}.init()`));
  ddsChannels.forEach((channel) => lines.push(`${indent(2)}self.${channel}.init()`));

  lines.push("");

  if (inputCountingBlocks.length > 0) {
    if (repetitionCount === 1) {
      lines.push(
        `${indent(2)}# One shot: schedule the measurement, read it immediately, and publish it directly.`,
        ...renderSequenceBody(state, 2, argumentContext.names),
        ...generateCounterFetchCode(inputCountingBlocks, 2),
        ...generateFixedMeasurementDatasetMutateCode(inputCountingBlocks, datasetPlan, 2, "0")
      );
    } else if (fixedFetchBatchSize === 1) {
      lines.push(
        `${indent(2)}# Fetch batch is one, so each shot is read and published immediately.`,
        `${indent(2)}for repetition_index in range(self.repetition):`,
        ...renderSequenceBody(state, 3, argumentContext.names),
        ...generateCounterFetchCode(inputCountingBlocks, 3),
        ...generateFixedMeasurementDatasetMutateCode(inputCountingBlocks, datasetPlan, 3, "repetition_index"),
        ...(loopDelayMs > 0
          ? [
              `${indent(3)}if repetition_index != self.repetition - 1:`,
              `${indent(4)}delay(self.inter_loop_delay_ms * ms)`
            ]
          : []),
        `${indent(3)}if repetition_index != self.repetition - 1:`,
        `${indent(4)}self.core.break_realtime()`
      );
    } else if (!needsFixedBatching) {
      lines.push(
        `${indent(2)}# All shots fit in one fetch batch: schedule them first, then read them in order.`,
        `${indent(2)}for repetition_index in range(self.repetition):`,
        ...renderSequenceBody(state, 3, argumentContext.names),
        ...(loopDelayMs > 0
          ? [
              `${indent(3)}if repetition_index != self.repetition - 1:`,
              `${indent(4)}delay(self.inter_loop_delay_ms * ms)`
            ]
          : []),
        "",
        `${indent(2)}for repetition_index in range(self.repetition):`,
        ...generateCounterFetchCode(inputCountingBlocks, 3),
        ...generateFixedMeasurementDatasetMutateCode(inputCountingBlocks, datasetPlan, 3, "repetition_index")
      );
    } else {
      lines.push(
        ...generateCounterBufferInitializationCode(inputCountingBlocks, "self.repetition", 2),
        "",
        `${indent(2)}# Phase A/B: schedule complete sequences in batches, then fetch counter results in the same order.`,
        `${indent(2)}for batch_start in range(0, self.repetition, self.sequence_batch_size):`,
        `${indent(3)}batch_end = min(batch_start + self.sequence_batch_size, self.repetition)`,
        `${indent(3)}# Phase A: schedule timing for this batch only; no readout or dataset updates here.`,
        `${indent(3)}for shot_index in range(batch_start, batch_end):`,
        ...renderSequenceBody(state, 4, argumentContext.names),
        ...(loopDelayMs > 0
          ? [
              `${indent(4)}if shot_index != batch_end - 1:`,
              `${indent(5)}delay(self.inter_loop_delay_ms * ms)`
            ]
          : []),
        "",
        `${indent(3)}# Phase B: fetch deferred counter results for this batch, preserving schedule order.`,
        `${indent(3)}for shot_index in range(batch_start, batch_end):`,
        ...generateCounterFetchToBufferCode(inputCountingBlocks, 4),
        `${indent(3)}if batch_end < self.repetition:`,
        `${indent(4)}# Batch boundary only: this recovers RTIO slack and is not a physical sequence gap.`,
        `${indent(4)}self.core.break_realtime()`,
        "",
        `${indent(2)}# Phase C: after all batches are complete, publish datasets in shot order.`,
        ...generateFixedMeasurementDatasetPublishCode(inputCountingBlocks, datasetPlan, 2)
      );
    }
  } else {
    if (isSingleSequenceWithoutMeasurement) {
      lines.push(...renderSequenceBody(state, 2, argumentContext.names));
    } else {
      lines.push(
        `${indent(2)}# No counter measurements are scheduled, so no fetch batching is needed.`,
        `${indent(2)}for repetition_index in range(self.repetition):`,
        ...renderSequenceBody(state, 3, argumentContext.names),
        ...(loopDelayMs > 0
          ? [
              `${indent(3)}if repetition_index != self.repetition - 1:`,
              `${indent(4)}delay(self.inter_loop_delay_ms * ms)`
            ]
          : [])
      );
    }
  }
  appendKernelTimelineCompletionWait(lines);

  lines.push(
    "",
    `${indent(1)}def run(self):`
  );

  if (measurementDatasetInitializationCode.length > 0) {
    lines.push(`${indent(2)}self.setup_datasets()`);
  }
  if (includeRunBrief) {
    lines.push(`${indent(2)}self.print_run_brief()`);
  }
  if (appletLaunchCode.length > 0) {
    lines.push(`${indent(2)}self.launch_applets()`);
  }
  lines.push(`${indent(2)}self.run_kernel()`);

  return maybeEmbedSequenceBuilderMetadata(`${lines.join("\n")}\n`, state, selectedPlots, options);
}
