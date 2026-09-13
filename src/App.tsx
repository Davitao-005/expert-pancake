import { type CSSProperties, type ChangeEvent, type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Code2,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Lock,
  Maximize2,
  Unlock,
  Palette,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { availableChannels, defaultVisibleChannelIds } from "./defaultChannels";
import { compareChannels } from "./channelOrdering";
import {
  deleteSavedExperimentRecord,
  loadOpenTabs,
  loadSavedExperiments,
  makeExperimentTab,
  saveExperimentRecord,
  saveOpenTabs
} from "./experimentStorage";
import {
  deleteSavedPackage,
  downloadParameterPackageLibrary,
  getPackagesByCategory,
  isBuiltInPackage,
  loadSavedPackages,
  packageCategoryDefinitions,
  savePackageFromModule
} from "./packageStorage";
import { getAvailablePlotDatasets, getCompatiblePlotYDatasets, isPlotValid } from "./plotDatasets";
import {
  formatTimeForUnit,
  fromCanonicalTime,
  resolveTaskTimeUnit,
  resolveTimelineTimeUnit,
  timeUnitOptions,
  toCanonicalTime
} from "./timeUnits";
import {
  findEnabledDdsSweeps,
  generateArtiqPython,
  getArtiqGenerationError,
  pythonFilename,
  sanitizePythonClassName
} from "./pythonGenerator";
import { generateSignalManifest } from "./signalManifest";
import { exportSignalDiagram } from "./signalDiagramExport";
import { exportTimelineDiagram } from "./timelineDiagramExport";
import { parseSequenceBuilderPythonImport } from "./pythonMetadataImport";
import type {
  ChannelConfig,
  ChannelType,
  DdsArgumentKey,
  DdsParameter,
  DdsParameterKey,
  DdsSweepParameters,
  ExperimentTab,
  ModuleType,
  ParameterPackageCategory,
  PlotPackage,
  SavedModulePackage,
  SavedExperimentRecord,
  SequenceModule,
  SequenceState,
  PhaseMode,
  SweepConfig,
  SweepField,
  TimeUnit
} from "./types";
import { findSameChannelOverlap } from "./validation";

const laneHeight = 74;
const minTimelineWidth = 1100;
const defaultPixelsPerMs = 60;
const minPixelsPerMs = 0.4;
const maxPixelsPerMs = 4000;
const internalSnapGridMs = 0.1;
const defaultDdsAttenuationDb = 10;
const maxDdsAttenuationDb = 31.5;
const defaultPhaseMode: PhaseMode = "absolute";
const defaultFetchBatchSize = 1;
const minFetchBatchSize = 1;
const maxFetchBatchSize = 100;
const tonePreferenceStorageKey = "artiq-sequence-builder-tone-preference";
const toneOptions = [
  { value: "system", label: "System" },
  { value: "soft", label: "Soft" },
  { value: "medium", label: "Medium" },
  { value: "dim", label: "Dim" },
  { value: "dark", label: "Dark" }
] as const;
type TonePreference = (typeof toneOptions)[number]["value"];
const draftModuleId = "__draft_module__";
const longPressMs = 200;
const longPressJitterPx = 5;
const minManifestPanePx = 38;

const moduleColors: Record<ModuleType, string> = {
  dds: "var(--dds)",
  measure: "var(--measure)",
  ttl_output: "var(--ttl)"
};

const ddsParameterMeta: Record<DdsParameterKey, { label: string; unit: "MHz" | "" | "deg" | "ms"; min?: number; max?: number; step: string }> = {
  frequency: { label: "Frequency", unit: "MHz", min: 0, step: "0.1" },
  amplitude: { label: "Amplitude", unit: "", min: 0, max: 1, step: "0.01" },
  phase: { label: "Phase", unit: "deg", step: "0.1" },
  duration: { label: "Duration", unit: "ms", min: 0, step: String(internalSnapGridMs) }
};

const argumentDefaultName = (module: SequenceModule, parameter: DdsArgumentKey | "ttlDuration") =>
  `${module.name || module.channel}_${parameter === "ttlDuration" ? "duration" : parameter}`
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]+/, "") || `${module.channel}_${parameter}`;

const makeSweepConfig = (value: number): SweepConfig => ({
  enabled: false,
  start: value,
  end: value,
  step: 0,
  points: 1,
  invalid: false,
  error: "",
  lastEditedFields: []
});

const cleanSweepNumber = (value: number) => Number((Math.abs(value) < 1e-9 ? 0 : value).toFixed(6));

const validateFetchBatchSizeText = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return "Fetch batch must be an integer from 1 to 100.";
  if (!/^\d+$/.test(trimmed)) return "Fetch batch must be a whole number.";
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < minFetchBatchSize || parsed > maxFetchBatchSize) {
    return "Fetch batch must be an integer from 1 to 100.";
  }
  return "";
};

const isTonePreference = (value: string | null): value is TonePreference =>
  toneOptions.some((option) => option.value === value);

const loadTonePreference = (): TonePreference => {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(tonePreferenceStorageKey);
  return isTonePreference(stored) ? stored : "system";
};

const parseFetchBatchSizeText = (value: string) => {
  const error = validateFetchBatchSizeText(value);
  return error ? null : Number(value.trim());
};

const sweepFields: SweepField[] = ["start", "end", "points", "step"];

const normalizeEditedFields = (fields: SweepConfig["lastEditedFields"] = []) =>
  fields.filter((field): field is SweepField => sweepFields.includes(field as SweepField));

const rememberEditedField = (fields: SweepConfig["lastEditedFields"], field: SweepField) => [
  ...normalizeEditedFields(fields).filter((item) => item !== field),
  field
];

const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const integerPointCountFromRange = (start: number, end: number, step: number) => {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(step)) {
    return { points: NaN, error: "Start, end, and step must be valid numbers." };
  }
  if (nearlyEqual(end, start)) return { points: 1, error: "" };
  if (nearlyEqual(step, 0)) {
    return { points: NaN, error: "Step can be 0 only when the sweep has one point or start equals end." };
  }
  if (Math.sign(end - start) !== Math.sign(step)) {
    return { points: NaN, error: "Step direction must match the direction from start to end." };
  }

  const rawPoints = (end - start) / step + 1;
  const roundedPoints = Math.round(rawPoints);
  if (!Number.isInteger(roundedPoints) || roundedPoints < 1 || Math.abs(rawPoints - roundedPoints) > 1e-6) {
    return { points: NaN, error: "End, start, and step do not produce an integer number of points." };
  }
  return { points: roundedPoints, error: "" };
};

const validateSweepShape = (sweep: SweepConfig) => {
  if (![sweep.start, sweep.end, sweep.step, sweep.points].every(Number.isFinite)) {
    return "Sweep values must be valid numbers.";
  }
  if (!Number.isInteger(sweep.points) || sweep.points < 1) {
    return "Sweep points must be an integer >= 1.";
  }
  if (sweep.points === 1) {
    return "";
  }
  if (nearlyEqual(sweep.step, 0) && !nearlyEqual(sweep.end, sweep.start)) {
    return "Step can be 0 only when the sweep has one point or start equals end.";
  }
  if (!nearlyEqual(sweep.step, 0) && !nearlyEqual(sweep.end, sweep.start) && Math.sign(sweep.end - sweep.start) !== Math.sign(sweep.step)) {
    return "Step direction must match the direction from start to end.";
  }
  const expectedEnd = sweep.start + sweep.step * (sweep.points - 1);
  if (!nearlyEqual(expectedEnd, sweep.end)) {
    return "Start, step, points, and end are inconsistent.";
  }
  return "";
};

const computedSweep = (sweep: SweepConfig, editedField?: SweepField): SweepConfig => {
  const lastEditedFields = editedField
    ? rememberEditedField(sweep.lastEditedFields, editedField)
    : normalizeEditedFields(sweep.lastEditedFields);
  let start = Number.isFinite(sweep.start) ? sweep.start : NaN;
  let end = Number.isFinite(sweep.end) ? sweep.end : NaN;
  let step = Number.isFinite(sweep.step) ? sweep.step : NaN;
  let points = Number.isFinite(sweep.points) ? sweep.points : NaN;
  let error = "";

  const usePoints = Number.isInteger(points) && points >= 1;
  const recentIndex = (field: SweepField) => lastEditedFields.lastIndexOf(field);
  const hasRecentPair = (a: SweepField, b: SweepField) => recentIndex(a) !== -1 && recentIndex(b) !== -1;

  if (editedField === "end") {
    if (usePoints) {
      step = points > 1 ? cleanSweepNumber((end - start) / (points - 1)) : 0;
      if (points === 1) end = start;
    }
  } else if (editedField === "step") {
    if (usePoints) {
      if (points === 1) {
        step = 0;
        end = start;
      } else {
        end = cleanSweepNumber(start + step * (points - 1));
      }
    }
  } else if (editedField === "points") {
    if (usePoints) {
      if (points === 1) {
        step = 0;
        end = start;
      } else if (recentIndex("end") > recentIndex("step")) {
        step = cleanSweepNumber((end - start) / (points - 1));
      } else {
        end = cleanSweepNumber(start + step * (points - 1));
      }
    }
  } else if (editedField === "start") {
    if (hasRecentPair("points", "step") || (!hasRecentPair("end", "points") && !hasRecentPair("end", "step"))) {
      if (usePoints) {
        end = points > 1 ? cleanSweepNumber(start + step * (points - 1)) : start;
        if (points === 1) step = 0;
      }
    } else if (hasRecentPair("end", "points") && usePoints) {
      step = points > 1 ? cleanSweepNumber((end - start) / (points - 1)) : 0;
      if (points === 1) end = start;
    } else if (hasRecentPair("end", "step")) {
      const computed = integerPointCountFromRange(start, end, step);
      if (computed.error) {
        error = computed.error;
      } else {
        points = computed.points;
      }
    }
  } else if (usePoints) {
    if (points === 1) {
      step = 0;
      end = start;
    } else if (!Number.isFinite(step) && Number.isFinite(end)) {
      step = cleanSweepNumber((end - start) / (points - 1));
    } else if (!Number.isFinite(end) && Number.isFinite(step)) {
      end = cleanSweepNumber(start + step * (points - 1));
    }
  }

  const nextSweep = {
    ...sweep,
    start,
    end,
    step,
    points,
    lastEditedFields
  };
  const shapeError = error || validateSweepShape(nextSweep);
  return {
    ...nextSweep,
    invalid: Boolean(shapeError),
    error: shapeError
  };
};

const makeDdsParameter = <Unit extends "MHz" | "" | "deg" | "ms">(value: number, unit: Unit): DdsParameter<Unit> => ({
  value,
  unit,
  sweep: makeSweepConfig(value)
});

const ddsParametersForModule = (module: SequenceModule): DdsSweepParameters => ({
  frequency: {
    ...makeDdsParameter(module.frequencyMHz ?? 80, "MHz"),
    ...module.ddsParameters?.frequency,
    sweep: module.ddsParameters?.frequency?.sweep ?? makeSweepConfig(module.frequencyMHz ?? 80)
  },
  amplitude: {
    ...makeDdsParameter(module.amplitude ?? 0.5, ""),
    ...module.ddsParameters?.amplitude,
    sweep: module.ddsParameters?.amplitude?.sweep ?? makeSweepConfig(module.amplitude ?? 0.5)
  },
  phase: {
    ...makeDdsParameter(module.phaseDeg ?? 0, "deg"),
    ...module.ddsParameters?.phase,
    sweep: module.ddsParameters?.phase?.sweep ?? makeSweepConfig(module.phaseDeg ?? 0)
  },
  duration: {
    ...makeDdsParameter(module.durationMs, "ms"),
    ...module.ddsParameters?.duration,
    sweep: module.ddsParameters?.duration?.sweep ?? makeSweepConfig(module.durationMs)
  }
});

const ttlDurationSweepForModule = (module: SequenceModule): SweepConfig =>
  module.ttlDurationSweep ?? makeSweepConfig(module.durationMs);

const syncDdsLegacyFields = (module: SequenceModule, ddsParameters: DdsSweepParameters): SequenceModule => ({
  ...module,
  ddsParameters,
  frequencyMHz: ddsParameters.frequency.value,
  amplitude: ddsParameters.amplitude.value,
  phaseDeg: ddsParameters.phase.value,
  durationMs: ddsParameters.duration.value
});

const ddsParameterKeys: DdsParameterKey[] = ["frequency", "amplitude", "phase", "duration"];

const isSweepValueValid = (key: DdsParameterKey, value: number) => {
  if (!Number.isFinite(value)) return false;
  if (key === "amplitude") return value >= 0 && value <= 1;
  if (key === "frequency" || key === "duration") return value > 0;
  return true;
};

const validateDdsSweepParameter = (key: DdsParameterKey, parameter: DdsSweepParameters[DdsParameterKey]) => {
  if (!parameter.sweep.enabled) return [];
  const messages: string[] = [];
  const meta = ddsParameterMeta[key];
  const sweep = computedSweep(parameter.sweep);

  if (sweep.invalid && sweep.error) {
    messages.push(`${meta.label} sweep: ${sweep.error}`);
  }

  const valuesToCheck = sweep.points === 1 ? [sweep.start] : [sweep.start, sweep.end];
  const hasInvalidValue = valuesToCheck.some((value) => !isSweepValueValid(key, value));

  if (hasInvalidValue) {
    if (key === "amplitude") messages.push("Amplitude sweep values must stay between 0 and 1.");
    if (key === "frequency") messages.push("Frequency sweep values must be positive.");
    if (key === "duration") messages.push("Duration sweep values must be positive.");
    if (key === "phase") messages.push("Phase sweep values must be valid numbers.");
  }

  return messages;
};

const validateDdsTaskSweepConsistency = (module: SequenceModule) => {
  if (module.type !== "dds") return [];
  const parameters = ddsParametersForModule(module);
  const enabledSweeps = ddsParameterKeys
    .map((key) => parameters[key].sweep)
    .filter((sweep) => sweep.enabled);
  if (enabledSweeps.length <= 1) return [];
  if (enabledSweeps.some((sweep) => sweep.invalid)) return [];
  if (new Set(enabledSweeps.map((sweep) => sweep.points)).size <= 1) return [];
  return [`${module.name || module.channel}: All enabled sweeps in the same task must have the same number of points.`];
};

const validateDdsAttenuation = (module: SequenceModule) => {
  if (module.type !== "dds") return [];
  const attenuationDb = module.attenuationDb ?? defaultDdsAttenuationDb;
  if (!Number.isFinite(attenuationDb)) return ["DDS attenuation must be a valid number."];
  if (attenuationDb > maxDdsAttenuationDb) return [`DDS attenuation must be ${maxDdsAttenuationDb} dB or less.`];
  return [];
};

const validateTtlDurationSweepParameter = (module: SequenceModule) => {
  if (module.type !== "ttl_output") return [];
  const sweep = computedSweep(ttlDurationSweepForModule(module));
  if (!sweep.enabled) return [];
  const messages: string[] = [];

  if (sweep.invalid && sweep.error) {
    messages.push(`${module.name || module.channel}: TTL output duration sweep: ${sweep.error}`);
  }

  const valuesToCheck = sweep.points === 1 ? [sweep.start] : [sweep.start, sweep.end];
  if (valuesToCheck.some((value) => !Number.isFinite(value) || value <= 0)) {
    messages.push(`${module.name || module.channel}: TTL output duration sweep values must be positive.`);
  }

  return messages;
};

const validateSequenceSweepConsistency = (modules: SequenceModule[]) => {
  const ddsSweeps = modules
    .filter((module) => module.type === "dds")
    .flatMap((module) => {
      const parameters = ddsParametersForModule(module);
      return ddsParameterKeys
        .map((key) => parameters[key].sweep)
        .filter((sweep) => sweep.enabled && !sweep.invalid)
        .map((sweep) => ({ label: `${module.name || module.channel} on ${module.channel}`, sweep }));
    });
  const ttlSweeps = modules
    .filter((module) => module.type === "ttl_output")
    .map((module) => ({ label: `TTL output duration sweep on ${module.channel}`, sweep: ttlDurationSweepForModule(module) }))
    .filter(({ sweep }) => sweep.enabled && !sweep.invalid);
  const enabledSweeps = [...ddsSweeps, ...ttlSweeps];
  if (enabledSweeps.length <= 1) return [];
  const expectedPoints = enabledSweeps[0].sweep.points;
  const mismatch = enabledSweeps.find(({ sweep }) => sweep.points !== expectedPoints);
  if (!mismatch) return [];
  return [`${mismatch.label} has ${mismatch.sweep.points} points, but expected ${expectedPoints}.`];
};

const ddsSweepValidationMessages = (modules: SequenceModule[], draftModule: SequenceModule | null) => {
  const modulesToCheck =
    draftModule?.type === "dds"
      ? [...modules.filter((module) => module.id !== draftModule.id), draftModule]
      : modules;
  const messages: string[] = [];

  modulesToCheck
    .forEach((module) => {
      if (module.type === "ttl_output") {
        messages.push(...validateTtlDurationSweepParameter(module));
        return;
      }
      if (module.type !== "dds") return;
      const parameters = ddsParametersForModule(module);
      ddsParameterKeys.forEach((key) => {
        messages.push(...validateDdsSweepParameter(key, parameters[key]));
      });
      messages.push(...validateDdsTaskSweepConsistency(module));
      messages.push(...validateDdsAttenuation(module));
    });
  messages.push(...validateSequenceSweepConsistency(modulesToCheck));

  return [...new Set(messages)];
};

const channelGroups: { title: string; type: ChannelType }[] = [
  { title: "DDS output channels", type: "dds" },
  { title: "TTL output channels", type: "ttl_output" },
  { title: "TTL input channels", type: "ttl_input" },
  { title: "TTL counter channels", type: "ttl_counter" }
];

const initialModules: SequenceModule[] = [
  {
    id: "mod-dds-cooling",
    type: "dds",
    name: "Cooling beam",
    channel: "urukul0_ch0",
    startMs: 0,
    durationMs: 5,
    gapAfterPrevious: 0,
    locked: false,
    frequencyMHz: 80,
    amplitude: 0.45,
    phaseDeg: 0,
    phaseMode: defaultPhaseMode,
    attenuationDb: defaultDdsAttenuationDb,
    timeUnit: "ms",
    ddsParameters: {
      frequency: makeDdsParameter(80, "MHz"),
      amplitude: makeDdsParameter(0.45, ""),
      phase: makeDdsParameter(0, "deg"),
      duration: makeDdsParameter(5, "ms")
    }
  },
  {
    id: "mod-dds-repump",
    type: "dds",
    name: "Repump beam",
    channel: "urukul0_ch1",
    startMs: 0,
    durationMs: 8,
    gapAfterPrevious: 0,
    locked: false,
    frequencyMHz: 120,
    amplitude: 0.35,
    phaseDeg: 0,
    phaseMode: defaultPhaseMode,
    attenuationDb: defaultDdsAttenuationDb,
    timeUnit: "ms",
    ddsParameters: {
      frequency: makeDdsParameter(120, "MHz"),
      amplitude: makeDdsParameter(0.35, ""),
      phase: makeDdsParameter(0, "deg"),
      duration: makeDdsParameter(8, "ms")
    }
  },
  {
    id: "mod-measure",
    type: "measure",
    name: "PMT gate",
    channel: "ttl8_counter",
    startMs: 8,
    durationMs: 2,
    gapAfterPrevious: 8,
    locked: false,
    timeUnit: "ms",
    edge: "rising",
    datasetName: "pmt_counts"
  }
];

const initialState: SequenceState = {
  sequenceName: "mot_loading_sequence",
  className: "GeneratedSequence",
  fetchBatchSize: defaultFetchBatchSize,
  startSlackMs: 0,
  startSlackUnit: "ms",
  timelineTimeUnit: "ms",
  pixelsPerMs: defaultPixelsPerMs,
  snapGridMs: internalSnapGridMs,
  loop: {
    count: 1,
    interLoopDelayMs: 0,
    interLoopDelayUnit: "ms"
  },
  availableChannels,
  visibleChannelIds: defaultVisibleChannelIds,
  modules: initialModules
};

const blankExperimentState: SequenceState = {
  ...initialState,
  sequenceName: "new_experiment",
  className: "NewExperiment",
  fetchBatchSize: defaultFetchBatchSize,
  startSlackMs: 0,
  startSlackUnit: "ms",
  loop: {
    count: 1,
    interLoopDelayMs: 0,
    interLoopDelayUnit: "ms"
  },
  modules: []
};

const uid = () => `mod-${Math.random().toString(36).slice(2, 9)}`;

const compatibleTypes = (moduleType: ModuleType): ChannelType[] => {
  if (moduleType === "dds") return ["dds"];
  if (moduleType === "measure") return ["ttl_counter"];
  if (moduleType === "ttl_output") return ["ttl_output"];
  return [];
};

const defaultChannelForType = (state: SequenceState, type: ModuleType) => {
  const types = compatibleTypes(type);
  return state.availableChannels.find((channel) => types.includes(channel.type))?.id ?? state.availableChannels[0]?.id ?? "";
};

const endMs = (module: SequenceModule) => module.startMs + module.durationMs;
const timingEpsilon = 1e-9;

const cleanTime = (value: number) => Number((Math.abs(value) < timingEpsilon ? 0 : value).toFixed(6));

const sortTasksOnChannel = (modules: SequenceModule[], channelId: string) =>
  modules
    .filter((module) => module.channel === channelId)
    .sort((a, b) => a.startMs - b.startMs);

const gapForAbsoluteStart = (module: SequenceModule, modules: SequenceModule[]) => {
  const previous = [...sortTasksOnChannel(modules, module.channel)]
    .filter((item) => item.id !== module.id)
    .reverse()
    .find((item) => endMs(item) <= module.startMs + timingEpsilon);
  const previousEnd = previous ? endMs(previous) : 0;
  return cleanTime(Math.max(0, module.startMs - previousEnd));
};

const recalculateChannelTiming = (modules: SequenceModule[], channelId: string) => {
  const ordered = sortTasksOnChannel(modules, channelId);
  if (ordered.length === 0) return modules;

  const updates = new Map<string, SequenceModule>();
  let cursor = 0;
  ordered.forEach((module) => {
    const durationMs = Math.max(0, module.durationMs);
    if (module.locked) {
      const gapAfterPrevious = cleanTime(module.startMs - cursor);
      updates.set(module.id, { ...module, gapAfterPrevious, durationMs });
      cursor = endMs({ ...module, durationMs });
      return;
    }

    const gapAfterPrevious = cleanTime(Math.max(0, module.gapAfterPrevious ?? module.startMs - cursor));
    const startMs = cleanTime(cursor + gapAfterPrevious);
    const nextModule = { ...module, startMs, durationMs, gapAfterPrevious };
    updates.set(module.id, nextModule);
    cursor = endMs(nextModule);
  });

  return modules.map((module) => updates.get(module.id) ?? module);
};

const createModule = (state: SequenceState, type: ModuleType, id = uid()): SequenceModule => {
  const startMs = Math.max(0, ...state.modules.map(endMs));
  const channel = defaultChannelForType(state, type);
  const base = {
    id,
    type,
    channel,
    startMs: Number(startMs.toFixed(3)),
    durationMs: 2,
    gapAfterPrevious: 0,
    locked: false,
    timeUnit: "ms" as TimeUnit,
    name: ""
  };
  base.gapAfterPrevious = gapForAbsoluteStart(base, state.modules);

  if (type === "dds") {
    const ddsParameters: DdsSweepParameters = {
      frequency: makeDdsParameter(80, "MHz"),
      amplitude: makeDdsParameter(0.5, ""),
      phase: makeDdsParameter(0, "deg"),
      duration: makeDdsParameter(5, "ms")
    };
    return {
      ...base,
      name: "DDS signal",
      durationMs: 5,
      ddsParameters,
      frequencyMHz: 80,
      amplitude: 0.5,
      phaseDeg: 0,
      phaseMode: defaultPhaseMode,
      attenuationDb: defaultDdsAttenuationDb
    };
  }

  if (type === "measure") {
    return {
      ...base,
      name: "TTL counter",
      edge: "rising",
      datasetName: "pmt_counts"
    };
  }

  if (type === "ttl_output") {
    return {
      ...base,
      name: "TTL pulse",
      durationMs: 1,
      ttlDurationSweep: makeSweepConfig(1)
    };
  }

  throw new Error(`Unsupported module type: ${type}`);
};

const snapToMeaningfulTimingPoint = (rawStartMs: number, movingModule: SequenceModule, modules: SequenceModule[], pixelsPerMs: number) => {
  const snapThresholdMs = Math.min(0.2, 8 / pixelsPerMs);
  const boundaries = [
    0,
    ...modules
    .filter((module) => module.id !== movingModule.id)
    .flatMap((module) => [module.startMs, endMs(module)])
  ];
  const nearest = boundaries.reduce<{ value: number; distance: number } | null>((best, boundary) => {
    const distance = Math.abs(rawStartMs - boundary);
    if (distance > snapThresholdMs) return best;
    if (!best || distance < best.distance) return { value: boundary, distance };
    return best;
  }, null);
  const snapped = nearest ? nearest.value : rawStartMs;
  return Number(Math.max(0, snapped).toFixed(6));
};

const overlapMessage = (module: SequenceModule) => `Overlaps with ${module.name} on ${module.channel}.`;

const pairOverlapMessage = (first: SequenceModule, second: SequenceModule) =>
  `${first.name} overlaps ${second.name} on ${first.channel}.`;

const modulesOverlap = (first: SequenceModule, second: SequenceModule) =>
  first.startMs < endMs(second) && second.startMs < endMs(first);

const sameChannelNeighbors = (module: SequenceModule, modules: SequenceModule[]) => {
  const sameChannel = modules
    .filter((item) => item.id !== module.id && item.channel === module.channel)
    .sort((a, b) => a.startMs - b.startMs);
  const previous = [...sameChannel].reverse().find((item) => endMs(item) <= module.startMs);
  const next = sameChannel.find((item) => item.startMs >= endMs(module));
  return { previous, next };
};

const gapAfterPreviousMs = (module: SequenceModule, modules: SequenceModule[]) => {
  if (module.gapAfterPrevious !== undefined) {
    return module.locked ? cleanTime(module.gapAfterPrevious) : cleanTime(Math.max(0, module.gapAfterPrevious));
  }
  const { previous } = sameChannelNeighbors(module, modules);
  const previousEnd = previous ? endMs(previous) : 0;
  const gap = module.startMs - previousEnd;
  return module.locked ? cleanTime(gap) : cleanTime(Math.max(0, gap));
};

const findFirstSameChannelCollision = (modules: SequenceModule[], channelId: string): ChannelCollision | null => {
  const ordered = sortTasksOnChannel(modules, channelId);
  let firstLockedCollision: ChannelCollision | null = null;
  for (let index = 0; index < ordered.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < ordered.length; nextIndex += 1) {
      if (ordered[nextIndex].startMs >= endMs(ordered[index])) break;
      if (!modulesOverlap(ordered[index], ordered[nextIndex])) continue;
      const involvesLocked = ordered[index].locked || ordered[nextIndex].locked;
      const collision = {
        message: involvesLocked
          ? `Locked collision: ${pairOverlapMessage(ordered[index], ordered[nextIndex])}`
          : overlapMessage(ordered[nextIndex]),
        blocked: !involvesLocked
      };
      if (collision.blocked) return collision;
      firstLockedCollision = firstLockedCollision ?? collision;
    }
  }
  return firstLockedCollision;
};

const collisionResultForChannel = (modules: SequenceModule[], channelId: string): ModuleUpdateResult => {
  const collision = findFirstSameChannelCollision(modules, channelId);
  return {
    modules,
    error: collision?.message ?? "",
    blocked: collision?.blocked ?? false
  };
};

const collisionIdsForModules = (modules: SequenceModule[]) => {
  const ids = new Set<string>();
  const channelIds = new Set(modules.map((module) => module.channel));
  channelIds.forEach((channelId) => {
    const ordered = sortTasksOnChannel(modules, channelId);
    for (let index = 0; index < ordered.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < ordered.length; nextIndex += 1) {
        if (ordered[nextIndex].startMs >= endMs(ordered[index])) break;
        if (modulesOverlap(ordered[index], ordered[nextIndex])) {
          ids.add(ordered[index].id);
          ids.add(ordered[nextIndex].id);
        }
      }
    }
  });
  return ids;
};

const clampStartBetweenCurrentNeighbors = (ordered: SequenceModule[], index: number, desiredStart: number, durationMs: number) => {
  const previous = ordered[index - 1];
  const next = ordered[index + 1];
  const minStart = previous ? endMs(previous) : 0;
  const maxStart = next ? Math.max(minStart, next.startMs - durationMs) : Number.POSITIVE_INFINITY;
  return cleanTime(Math.min(Math.max(0, desiredStart, minStart), maxStart));
};

const updateModuleStartPreservingGaps = (modules: SequenceModule[], moduleId: string, desiredStart: number) => {
  const current = modules.find((module) => module.id === moduleId);
  if (!current) return { modules, error: "Module not found." };
  if (current.locked) return { modules, error: "" };

  const ordered = sortTasksOnChannel(modules, current.channel);
  const index = ordered.findIndex((module) => module.id === moduleId);
  const previous = ordered[index - 1];
  const previousEnd = previous ? endMs(previous) : 0;
  const startMs = clampStartBetweenCurrentNeighbors(ordered, index, desiredStart, current.durationMs);
  const gapAfterPrevious = cleanTime(Math.max(0, startMs - previousEnd));
  const patched = modules.map((module) => (module.id === moduleId ? { ...module, gapAfterPrevious, startMs } : module));
  const recalculated = recalculateChannelTiming(patched, current.channel);
  return collisionResultForChannel(recalculated, current.channel);
};

const updateModuleEndPreservingGaps = (modules: SequenceModule[], moduleId: string, desiredEnd: number) => {
  const current = modules.find((module) => module.id === moduleId);
  if (!current) return { modules, error: "Module not found." };
  return updateModuleStartPreservingGaps(modules, moduleId, desiredEnd - current.durationMs);
};

const updateModuleGapPreservingGaps = (modules: SequenceModule[], moduleId: string, desiredGap: number) => {
  const current = modules.find((module) => module.id === moduleId);
  if (!current) return { modules, error: "Module not found." };
  if (current.locked) return { modules, error: "" };

  const ordered = sortTasksOnChannel(modules, current.channel);
  const index = ordered.findIndex((module) => module.id === moduleId);
  const previous = ordered[index - 1];
  const next = ordered[index + 1];
  const previousEnd = previous ? endMs(previous) : 0;
  const maxGap = next ? Math.max(0, next.startMs - previousEnd - current.durationMs) : Number.POSITIVE_INFINITY;
  const gapAfterPrevious = cleanTime(Math.min(Math.max(0, desiredGap), maxGap));
  const patched = modules.map((module) => (module.id === moduleId ? { ...module, gapAfterPrevious } : module));
  const recalculated = recalculateChannelTiming(patched, current.channel);
  return collisionResultForChannel(recalculated, current.channel);
};

const updateModuleDurationPreservingGaps = (modules: SequenceModule[], moduleId: string, durationMs: number) => {
  const current = modules.find((module) => module.id === moduleId);
  if (!current) return { modules, error: "Module not found." };
  if (current.locked) return { modules, error: "" };
  if (durationMs <= 0) return { modules, error: "Duration must be greater than 0." };

  const patched = modules.map((module) => (module.id === moduleId ? { ...module, durationMs } : module));
  const recalculated = recalculateChannelTiming(patched, current.channel);
  return collisionResultForChannel(recalculated, current.channel);
};

const removeModulePreservingNextStart = (modules: SequenceModule[], moduleId: string) => {
  const removed = modules.find((module) => module.id === moduleId);
  if (!removed) return modules;
  const ordered = sortTasksOnChannel(modules, removed.channel);
  const index = ordered.findIndex((module) => module.id === moduleId);
  const next = ordered[index + 1];
  let filtered = modules.filter((module) => module.id !== moduleId);

  if (next) {
    const previous = [...sortTasksOnChannel(filtered, removed.channel)]
      .filter((module) => module.id !== next.id)
      .reverse()
      .find((module) => endMs(module) <= next.startMs + timingEpsilon);
    const previousEnd = previous ? endMs(previous) : 0;
    const gapAfterPrevious = cleanTime(Math.max(0, next.startMs - previousEnd));
    filtered = filtered.map((module) => (module.id === next.id ? { ...module, gapAfterPrevious } : module));
  }

  return recalculateChannelTiming(filtered, removed.channel);
};

const updateModuleChannelPreservingStart = (modules: SequenceModule[], moduleId: string, channel: string) => {
  const current = modules.find((module) => module.id === moduleId);
  if (!current) return { modules, error: "Module not found." };
  if (current.locked) return { modules, error: "" };
  const candidate = { ...current, channel };
  const conflict = findSameChannelOverlap(candidate, modules, current.id);
  if (conflict) return { modules, error: overlapMessage(conflict), blocked: true };

  const withoutCurrent = removeModulePreservingNextStart(modules, moduleId);
  const withMoved = [...withoutCurrent, { ...candidate, gapAfterPrevious: gapForAbsoluteStart(candidate, withoutCurrent) }];
  const recalculated = recalculateChannelTiming(withMoved, channel);
  return collisionResultForChannel(recalculated, channel);
};

const updateModuleChannelAndStartPreservingGaps = (
  modules: SequenceModule[],
  moduleId: string,
  channel: string,
  startMs: number
) => {
  const current = modules.find((module) => module.id === moduleId);
  if (!current) return { modules, error: "Module not found." };
  if (current.locked) return { modules, error: "" };

  const candidate = { ...current, channel, startMs: Math.max(0, startMs) };
  const conflict = findSameChannelOverlap(candidate, modules, current.id);
  if (conflict) return { modules, error: overlapMessage(conflict), blocked: true };

  const withoutCurrent = removeModulePreservingNextStart(modules, moduleId);
  const withMoved = [...withoutCurrent, { ...candidate, gapAfterPrevious: gapForAbsoluteStart(candidate, withoutCurrent) }];
  const recalculated = recalculateChannelTiming(withMoved, channel);
  return collisionResultForChannel(recalculated, channel);
};

const updateModuleLockState = (modules: SequenceModule[], moduleId: string, locked: boolean) => {
  const current = modules.find((module) => module.id === moduleId);
  if (!current) return { modules, error: "Module not found.", blocked: true };
  const patched = modules.map((module) => (module.id === moduleId ? { ...module, locked } : module));
  const recalculated = recalculateChannelTiming(patched, current.channel);
  return collisionResultForChannel(recalculated, current.channel);
};

type DragPreview = {
  moduleId: string;
  channel: string;
  startMs: number;
};

type PendingDrag = {
  moduleId: string;
  pointerId: number;
  startX: number;
  startY: number;
  pointerOffsetPx: number;
  timerId: number;
};

type ModuleUpdateResult = {
  modules: SequenceModule[];
  error: string;
  blocked?: boolean;
};

type ChannelCollision = {
  message: string;
  blocked: boolean;
};

type TimingField = "startMs" | "endMs" | "durationMs" | "gapAfterPrevious";

type TimingDrafts = Partial<Record<TimingField, string>>;

type GapRegion = {
  id: string;
  channelId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  leftPx: number;
  widthPx: number;
};

const formatTimeValue = (valueMs: number, unit: TimeUnit) => `${formatTimeForUnit(valueMs, unit)} ${unit}`;

const clampTimelineScale = (pixelsPerMs: number) =>
  Math.min(maxPixelsPerMs, Math.max(minPixelsPerMs, Number(pixelsPerMs.toFixed(6))));

const niceTimeStepMs = (rawStepMs: number) => {
  if (!Number.isFinite(rawStepMs) || rawStepMs <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStepMs));
  const magnitude = 10 ** exponent;
  const normalized = rawStepMs / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
};

const timelineTicksFor = (timelineEndMs: number, pixelsPerMs: number) => {
  const tickStepMs = niceTimeStepMs(72 / pixelsPerMs);
  const endMsValue = Math.max(timelineEndMs, tickStepMs);
  const count = Math.ceil(endMsValue / tickStepMs) + 1;
  return Array.from({ length: count }, (_, index) => cleanTime(index * tickStepMs));
};

const visibleTaskDurations = (modules: SequenceModule[]) =>
  modules
    .map((module) => module.durationMs)
    .filter((duration) => Number.isFinite(duration) && duration > timingEpsilon);

const timingFieldLabel: Record<TimingField, string> = {
  startMs: "Start time",
  endMs: "End time",
  durationMs: "Duration",
  gapAfterPrevious: "Gap after previous"
};

const timingFieldValue = (field: TimingField, module: SequenceModule, modules: SequenceModule[]) => {
  if (field === "endMs") return cleanTime(endMs(module));
  if (field === "gapAfterPrevious") return gapAfterPreviousMs(module, modules);
  return cleanTime(module[field]);
};

const timingFieldText = (field: TimingField, module: SequenceModule, modules: SequenceModule[], unit: TimeUnit) =>
  formatTimeForUnit(timingFieldValue(field, module, modules), unit);

function App() {
  const [experimentTabs, setExperimentTabs] = useState<ExperimentTab[]>(() => loadOpenTabs(initialState));
  const [savedExperiments, setSavedExperiments] = useState<SavedExperimentRecord[]>(() => loadSavedExperiments(initialState));
  const [savedPackages, setSavedPackages] = useState<SavedModulePackage[]>(() => loadSavedPackages());
  const [activeTabId, setActiveTabId] = useState("");
  const [selectedSavedExperimentId, setSelectedSavedExperimentId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [draftModule, setDraftModule] = useState<SequenceModule | null>(null);
  const [isChannelMenuOpen, setIsChannelMenuOpen] = useState(false);
  const [isSavedExperimentMenuOpen, setIsSavedExperimentMenuOpen] = useState(false);
  const [isToneMenuOpen, setIsToneMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isRunSettingsOpen, setIsRunSettingsOpen] = useState(false);
  const [isCodeOpen, setIsCodeOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState("");
  const [editingTabName, setEditingTabName] = useState("");
  const [saveStatus, setSaveStatus] = useState("Not saved");
  const [moduleMessage, setModuleMessage] = useState("");
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [selectedPlots, setSelectedPlots] = useState<PlotPackage[]>([]);
  const [plotDraft, setPlotDraft] = useState<PlotPackage | null>(null);
  const [plotMessage, setPlotMessage] = useState("");
  const [selectedPackageIds, setSelectedPackageIds] = useState<Record<ParameterPackageCategory, string>>({
    ddsSignal: "",
    ttlCounterMeasure: "",
    ttlPulse: ""
  });
  const [openPackageCategory, setOpenPackageCategory] = useState<ParameterPackageCategory | "">("");
  const [visibleGapTooltipId, setVisibleGapTooltipId] = useState("");
  const [timingDrafts, setTimingDrafts] = useState<TimingDrafts>({});
  const [timingDraftError, setTimingDraftError] = useState("");
  const [codePaneRatio, setCodePaneRatio] = useState(0.72);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(minTimelineWidth);
  const [fetchBatchDraft, setFetchBatchDraft] = useState(String(defaultFetchBatchSize));
  const [includeSequenceBuilderMetadata, setIncludeSequenceBuilderMetadata] = useState(false);
  const [includeRunBrief, setIncludeRunBrief] = useState(false);
  const [showModuleIds, setShowModuleIds] = useState(false);
  const [tonePreference, setTonePreference] = useState<TonePreference>(() => loadTonePreference());
  const pendingDragRef = useRef<PendingDrag | null>(null);
  const gapHoverTimerRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const codePreviewRef = useRef<HTMLDivElement | null>(null);
  const timelineWrapRef = useRef<HTMLDivElement | null>(null);
  const pythonImportInputRef = useRef<HTMLInputElement | null>(null);
  const tabNameInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = experimentTabs.find((tab) => tab.id === activeTabId) ?? experimentTabs[0];
  const activeExperimentTabId = activeTab?.id ?? "";
  const state = activeTab?.state ?? initialState;
  const selectedModule = state.modules.find((module) => module.id === selectedId);
  const panelModule = draftModule ?? selectedModule;
  const isCreatingDraft = Boolean(draftModule);
  const isPlacementLocked = Boolean(panelModule?.locked);
  const collisionModuleIds = useMemo(() => collisionIdsForModules(state.modules), [state.modules]);
  const visibleChannels = state.visibleChannelIds
    .map((id) => state.availableChannels.find((channel) => channel.id === id))
    .filter((channel): channel is ChannelConfig => Boolean(channel))
    .sort(compareChannels);
  const timelineTimeUnit = resolveTimelineTimeUnit(state.timelineTimeUnit);
  const panelTimeUnit = panelModule ? resolveTaskTimeUnit(panelModule) : "ms";
  const loopDelayUnit = state.loop.interLoopDelayUnit ?? "ms";
  const startSlackUnit = state.startSlackUnit ?? "ms";
  const fetchBatchDraftError = useMemo(() => validateFetchBatchSizeText(fetchBatchDraft), [fetchBatchDraft]);
  const generatorError = useMemo(() => getArtiqGenerationError(state), [state]);
  const generationError = fetchBatchDraftError ? `Cannot generate ARTIQ Python: ${fetchBatchDraftError}` : generatorError;
  const python = useMemo(
    () =>
      fetchBatchDraftError
        ? `# Cannot generate ARTIQ Python: ${fetchBatchDraftError}\n`
        : generateArtiqPython(state, selectedPlots, { includeSequenceBuilderMetadata, includeRunBrief }),
    [fetchBatchDraftError, includeRunBrief, includeSequenceBuilderMetadata, state, selectedPlots]
  );
  const signalManifest = useMemo(() => JSON.stringify(generateSignalManifest(state), null, 2), [state]);
  const hasSweep = useMemo(() => findEnabledDdsSweeps(state).length > 0, [state]);
  const hasRepeatedSweepPoints = hasSweep && Math.max(1, Math.round(state.loop.count)) > 1;
  const plotDatasets = useMemo(
    () => getAvailablePlotDatasets(state.modules, undefined, hasSweep, hasRepeatedSweepPoints),
    [hasRepeatedSweepPoints, hasSweep, state.modules]
  );
  const packageLibraryByCategory = useMemo(
    () => ({
      ddsSignal: getPackagesByCategory(savedPackages, "ddsSignal"),
      ttlCounterMeasure: getPackagesByCategory(savedPackages, "ttlCounterMeasure"),
      ttlPulse: getPackagesByCategory(savedPackages, "ttlPulse")
    }),
    [savedPackages]
  );
  const areAllChannelsSelected =
    state.availableChannels.length > 0 &&
    state.availableChannels.every((channel) => state.visibleChannelIds.includes(channel.id));
  const canCreatePlot = plotDatasets.y.length > 0;
  const timelineEnd = Math.max(15, ...state.modules.map(endMs));
  const timelineWidth = Math.max(timelineViewportWidth, minTimelineWidth, timelineEnd * state.pixelsPerMs + 220);
  const ticks = timelineTicksFor(timelineEnd, state.pixelsPerMs);
  const gridStepPx = niceTimeStepMs(72 / state.pixelsPerMs) * state.pixelsPerMs;
  const minorGridStepPx = Math.max(6, gridStepPx / 5);
  const panelDdsParameters = panelModule?.type === "dds" ? ddsParametersForModule(panelModule) : null;
  const sweepValidationMessages = useMemo(
    () => (panelModule?.type === "dds" || panelModule?.type === "ttl_output" ? ddsSweepValidationMessages(state.modules, draftModule) : []),
    [draftModule, panelModule?.type, state.modules]
  );

  const gapRegionsByChannel = useMemo(() => {
    const regions = new Map<string, GapRegion[]>();
    visibleChannels.forEach((channel) => {
      const modules = state.modules
        .filter((module) => module.channel === channel.id)
        .sort((a, b) => a.startMs - b.startMs);
      const channelRegions: GapRegion[] = [];
      for (let index = 0; index < modules.length - 1; index += 1) {
        const previous = modules[index];
        const next = modules[index + 1];
        const startMs = endMs(previous);
        const endMsValue = next.startMs;
        const durationMs = endMsValue - startMs;
        if (durationMs <= 0) continue;
        channelRegions.push({
          id: `${channel.id}-${previous.id}-${next.id}-${startMs}-${endMsValue}`,
          channelId: channel.id,
          startMs,
          endMs: endMsValue,
          durationMs,
          leftPx: startMs * state.pixelsPerMs,
          widthPx: durationMs * state.pixelsPerMs
        });
      }
      regions.set(channel.id, channelRegions);
    });
    return regions;
  }, [state.modules, state.pixelsPerMs, visibleChannels]);

  useEffect(() => {
    saveOpenTabs(experimentTabs);
  }, [experimentTabs]);

  useEffect(() => {
    setFetchBatchDraft(String(state.fetchBatchSize));
  }, [activeExperimentTabId, state.fetchBatchSize]);

  useEffect(() => {
    if (!editingTabId) return;
    tabNameInputRef.current?.focus();
    tabNameInputRef.current?.select();
  }, [editingTabId]);

  useEffect(() => {
    document.documentElement.dataset.tone = tonePreference;
    window.localStorage.setItem(tonePreferenceStorageKey, tonePreference);
  }, [tonePreference]);

  useEffect(() => {
    const closeMenusOnOutsidePointer = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (isSavedExperimentMenuOpen && !target.closest(".saved-experiment-picker")) {
        setIsSavedExperimentMenuOpen(false);
      }
      if (isToneMenuOpen && !target.closest(".tone-picker")) {
        setIsToneMenuOpen(false);
      }
      if (isRunSettingsOpen && !target.closest(".run-settings-menu")) {
        setIsRunSettingsOpen(false);
      }
      if (isExportMenuOpen && !target.closest(".export-menu")) {
        setIsExportMenuOpen(false);
      }
      if (isChannelMenuOpen && !target.closest(".channel-menu") && !target.closest(".channel-menu-trigger")) {
        setIsChannelMenuOpen(false);
      }
      if (openPackageCategory && !target.closest(".package-dropdown")) {
        setOpenPackageCategory("");
      }
    };

    document.addEventListener("click", closeMenusOnOutsidePointer);
    return () => document.removeEventListener("click", closeMenusOnOutsidePointer);
  }, [isChannelMenuOpen, isExportMenuOpen, isRunSettingsOpen, isSavedExperimentMenuOpen, isToneMenuOpen, openPackageCategory]);

  useEffect(() => {
    const element = timelineWrapRef.current;
    if (!element) return;
    const updateWidth = () => setTimelineViewportWidth(element.clientWidth || minTimelineWidth);
    updateWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setTimingDrafts({});
    setTimingDraftError("");
  }, [panelModule?.id, isCreatingDraft, panelTimeUnit]);

  useEffect(() => () => {
    if (gapHoverTimerRef.current !== null) {
      window.clearTimeout(gapHoverTimerRef.current);
    }
  }, []);

  const clearGapHover = () => {
    if (gapHoverTimerRef.current !== null) {
      window.clearTimeout(gapHoverTimerRef.current);
      gapHoverTimerRef.current = null;
    }
    setVisibleGapTooltipId("");
  };

  const startGapHover = (gapId: string) => {
    if (gapHoverTimerRef.current !== null) {
      window.clearTimeout(gapHoverTimerRef.current);
    }
    setVisibleGapTooltipId("");
    gapHoverTimerRef.current = window.setTimeout(() => {
      setVisibleGapTooltipId(gapId);
      gapHoverTimerRef.current = null;
    }, 100);
  };

  const updateActiveTabState = (updater: (current: SequenceState) => SequenceState) => {
    const targetId = activeTab?.id;
    if (!targetId) return;
    setExperimentTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === targetId ? { ...tab, state: updater(tab.state), isDirty: true } : tab))
    );
    setSaveStatus("Unsaved changes");
  };

  const updateState = (patch: Partial<SequenceState>) => updateActiveTabState((current) => ({ ...current, ...patch }));

  const startEditingExperimentTabName = (tab: ExperimentTab) => {
    setActiveTabId(tab.id);
    setEditingTabId(tab.id);
    setEditingTabName(tab.state.sequenceName || "Untitled");
    setSelectedSavedExperimentId("");
  };

  const cancelEditingExperimentTabName = () => {
    setEditingTabId("");
    setEditingTabName("");
  };

  const commitEditingExperimentTabName = () => {
    if (!editingTabId) return;
    const nextName = editingTabName.trim() || "untitled_experiment";
    setExperimentTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === editingTabId ? { ...tab, state: { ...tab.state, sequenceName: nextName }, isDirty: true } : tab
      )
    );
    setSaveStatus("Unsaved changes");
    cancelEditingExperimentTabName();
  };

  const updateTimelineTimeUnit = (timelineTimeUnit: TimeUnit) => {
    updateState({ timelineTimeUnit });
  };

  const updateTimelineScale = (pixelsPerMs: number) => {
    updateState({ pixelsPerMs: clampTimelineScale(pixelsPerMs) });
  };

  const zoomTimeline = (factor: number) => {
    updateTimelineScale(state.pixelsPerMs * factor);
  };

  const resetTimelineZoom = () => {
    updateTimelineScale(defaultPixelsPerMs);
  };

  const fitTimelineZoom = () => {
    const sequenceEnd = Math.max(...state.modules.map(endMs), 1);
    const sequenceStart = Math.min(...state.modules.map((module) => module.startMs), 0);
    const sequenceDuration = Math.max(sequenceEnd - sequenceStart, 0.001);
    const availableWidth = Math.max(240, timelineViewportWidth - 190);
    const paddedDuration = Math.max(sequenceEnd + Math.max(sequenceDuration * 0.08, 0.02), 0.001);
    const fitScale = availableWidth / paddedDuration;
    const durations = visibleTaskDurations(state.modules);
    const shortestDuration = durations.length ? Math.min(...durations) : sequenceDuration;
    const readableScale = shortestDuration > 0 ? 12 / shortestDuration : fitScale;
    const shouldPrioritizeReadability = sequenceDuration <= 10 || readableScale <= fitScale * 2.5;
    updateTimelineScale(shouldPrioritizeReadability ? Math.max(fitScale, readableScale) : fitScale);
  };

  const updateModule = (id: string, patch: Partial<SequenceModule>) => {
    let result: ModuleUpdateResult;
    if (patch.channel !== undefined) {
      result = updateModuleChannelPreservingStart(state.modules, id, patch.channel);
    } else if (patch.startMs !== undefined) {
      result = updateModuleStartPreservingGaps(state.modules, id, patch.startMs);
    } else if (patch.durationMs !== undefined) {
      const modulesForDuration = state.modules.map((module) => {
        if (module.id !== id || patch.durationMs === undefined) return module;
        if (module.type === "ttl_output") {
          const ttlDurationSweep = module.ttlDurationSweep?.enabled
            ? module.ttlDurationSweep
            : makeSweepConfig(patch.durationMs);
          return { ...module, durationMs: patch.durationMs, ttlDurationSweep };
        }
        if (module.type !== "dds") return module;
        const ddsParameters = ddsParametersForModule({ ...module, durationMs: patch.durationMs });
        const durationSweep = ddsParameters.duration.sweep.enabled
          ? ddsParameters.duration.sweep
          : makeSweepConfig(patch.durationMs);
        return syncDdsLegacyFields(
          { ...module, durationMs: patch.durationMs },
          {
            ...ddsParameters,
            duration: {
              ...ddsParameters.duration,
              value: patch.durationMs,
              sweep: durationSweep
            }
          }
        );
      });
      result = updateModuleDurationPreservingGaps(modulesForDuration, id, patch.durationMs);
    } else if (patch.gapAfterPrevious !== undefined) {
      result = updateModuleGapPreservingGaps(state.modules, id, patch.gapAfterPrevious);
    } else if (patch.locked !== undefined) {
      result = updateModuleLockState(state.modules, id, patch.locked);
    } else {
      result = { modules: state.modules.map((module) => (module.id === id ? { ...module, ...patch } : module)), error: "" };
    }

    setModuleMessage(result.error ?? "");
    if (result.blocked) return;
    updateActiveTabState((current) => ({ ...current, modules: result.modules }));
  };

  const updatePanelModule = (patch: Partial<SequenceModule>) => {
    if (draftModule) {
      setDraftModule((current) => {
        if (!current) return current;
        const next = { ...current, ...patch };
        if (next.type === "dds" && patch.durationMs !== undefined) {
          const ddsParameters = ddsParametersForModule(next);
          return syncDdsLegacyFields(next, {
            ...ddsParameters,
            duration: {
              ...ddsParameters.duration,
              value: patch.durationMs,
              sweep: ddsParameters.duration.sweep.enabled ? ddsParameters.duration.sweep : makeSweepConfig(patch.durationMs)
            }
          });
        }
        if (next.type === "ttl_output" && patch.durationMs !== undefined) {
          return {
            ...next,
            ttlDurationSweep: next.ttlDurationSweep?.enabled ? next.ttlDurationSweep : makeSweepConfig(patch.durationMs)
          };
        }
        if (patch.startMs !== undefined || patch.channel !== undefined) {
          return { ...next, gapAfterPrevious: gapForAbsoluteStart(next, state.modules) };
        }
        if (patch.gapAfterPrevious !== undefined) {
          return { ...next, gapAfterPrevious: Math.max(0, patch.gapAfterPrevious) };
        }
        return next;
      });
      return;
    }

    if (selectedModule) {
      updateModule(selectedModule.id, patch);
    }
  };

  const updatePanelEndTime = (endTimeMs: number) => {
    if (!panelModule) return;
    const startMs = endTimeMs - panelModule.durationMs;
    if (draftModule) {
      const nextDraft = {
        ...draftModule,
        startMs: cleanTime(Math.max(0, startMs))
      };
      setDraftModule({
        ...nextDraft,
        gapAfterPrevious: gapForAbsoluteStart(nextDraft, state.modules)
      });
      return;
    }

    if (selectedModule) {
      const result = updateModuleEndPreservingGaps(state.modules, selectedModule.id, endTimeMs);
      setModuleMessage(result.error ?? "");
      if (!result.blocked) {
        updateActiveTabState((current) => ({ ...current, modules: result.modules }));
      }
    }
  };

  const commitTimingDraft = (field: TimingField, options: { revertOnInvalid: boolean }) => {
    if (!panelModule) return false;
    const rawValue = timingDrafts[field] ?? timingFieldText(field, panelModule, state.modules, panelTimeUnit);
    const trimmed = rawValue.trim();
    const parsedDisplayValue = Number(trimmed);
    const parsedCanonicalValue = toCanonicalTime(parsedDisplayValue, panelTimeUnit);
    const isInvalidNumber = trimmed === "" || Number.isNaN(parsedDisplayValue) || !Number.isFinite(parsedDisplayValue);
    const isInvalidRange = parsedCanonicalValue < 0 || (field === "durationMs" && parsedCanonicalValue <= 0);

    if (isInvalidNumber || isInvalidRange) {
      const message =
        field === "durationMs"
          ? `${timingFieldLabel[field]} must be greater than 0.`
          : `${timingFieldLabel[field]} must be 0 or greater.`;
      setTimingDraftError(message);
      setModuleMessage(message);
      if (options.revertOnInvalid) {
        setTimingDrafts((current) => {
          const next = { ...current };
          delete next[field];
          return next;
        });
      }
      return false;
    }

    setTimingDraftError("");
    setModuleMessage("");
    setTimingDrafts((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });

    if (field === "endMs") {
      updatePanelEndTime(parsedCanonicalValue);
      return true;
    }

    updatePanelModule({ [field]: parsedCanonicalValue });
    return true;
  };

  const timingInputProps = (field: TimingField) => {
    if (!panelModule) {
      return {
        value: "",
        onFocus: () => {},
        onChange: () => {},
        onBlur: () => {},
        onKeyDown: () => {}
      };
    }

    return {
      value: timingDrafts[field] ?? timingFieldText(field, panelModule, state.modules, panelTimeUnit),
      onFocus: () => {
        setTimingDraftError("");
        setTimingDrafts((current) => ({
          ...current,
          [field]: current[field] ?? timingFieldText(field, panelModule, state.modules, panelTimeUnit)
        }));
      },
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        setTimingDrafts((current) => ({ ...current, [field]: event.target.value }));
      },
      onBlur: () => commitTimingDraft(field, { revertOnInvalid: true }),
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const committed = commitTimingDraft(field, { revertOnInvalid: false });
          if (committed) {
            event.currentTarget.blur();
          }
        }
        if (event.key === "Escape") {
          setTimingDraftError("");
          setTimingDrafts((current) => {
            const next = { ...current };
            delete next[field];
            return next;
          });
          event.currentTarget.blur();
        }
      }
    };
  };

  const applyDdsParametersToPanel = (ddsParameters: DdsSweepParameters) => {
    updatePanelModule({
      ddsParameters,
      frequencyMHz: ddsParameters.frequency.value,
      amplitude: ddsParameters.amplitude.value,
      phaseDeg: ddsParameters.phase.value
    });
  };

  const updateDdsAttenuation = (value: number) => {
    if (!panelModule || panelModule.type !== "dds") return;
    const attenuationDb = Number.isFinite(value) ? value : panelModule.attenuationDb ?? defaultDdsAttenuationDb;
    updatePanelModule({ attenuationDb });
    setModuleMessage(
      attenuationDb > maxDdsAttenuationDb
        ? `DDS attenuation must be ${maxDdsAttenuationDb} dB or less.`
        : ""
    );
  };

  const updateDdsPhaseMode = (phaseMode: PhaseMode) => {
    if (!panelModule || panelModule.type !== "dds") return;
    updatePanelModule({ phaseMode });
  };

  const updateDdsParameterValue = (key: Exclude<DdsParameterKey, "duration">, value: number) => {
    if (!panelModule || panelModule.type !== "dds") return;
    const parameters = ddsParametersForModule(panelModule);
    const currentParameter = parameters[key];
    const sweep = currentParameter.sweep.enabled ? currentParameter.sweep : makeSweepConfig(value);
    applyDdsParametersToPanel({
      ...parameters,
      [key]: {
        ...currentParameter,
        value,
        sweep
      }
    });
  };

  const updateDdsSweep = (key: DdsParameterKey, patch: Partial<SweepConfig>, editedField?: SweepField) => {
    if (!panelModule || panelModule.type !== "dds") return;
    const parameters = ddsParametersForModule(panelModule);
    const currentParameter = parameters[key];
    const mergedSweep = {
      ...currentParameter.sweep,
      ...patch
    };
    const normalizedSweep = editedField ? computedSweep(mergedSweep, editedField) : computedSweep(mergedSweep);
    applyDdsParametersToPanel({
      ...parameters,
      [key]: {
        ...currentParameter,
        sweep: normalizedSweep
      }
    });
  };

  const toggleDdsSweep = (key: DdsParameterKey) => {
    if (!panelModule || panelModule.type !== "dds") return;
    const parameters = ddsParametersForModule(panelModule);
    const currentParameter = parameters[key];
    updateDdsSweep(key, {
      enabled: !currentParameter.sweep.enabled,
      start: Number.isFinite(currentParameter.sweep.start) ? currentParameter.sweep.start : currentParameter.value,
      end: Number.isFinite(currentParameter.sweep.end) ? currentParameter.sweep.end : currentParameter.value,
      points: Math.max(1, currentParameter.sweep.points || 1),
      lastEditedFields: currentParameter.sweep.lastEditedFields ?? []
    });
  };

  const sweepInputValue = (value: number) => (Number.isFinite(value) ? value : "");

  const updateSweepNumber = (key: DdsParameterKey, field: SweepField, value: number) => {
    updateDdsSweep(key, { [field]: value }, field);
  };

  const updateTtlDurationSweep = (patch: Partial<SweepConfig>, editedField?: SweepField) => {
    if (!panelModule || panelModule.type !== "ttl_output") return;
    const mergedSweep = {
      ...ttlDurationSweepForModule(panelModule),
      ...patch
    };
    updatePanelModule({
      ttlDurationSweep: editedField ? computedSweep(mergedSweep, editedField) : computedSweep(mergedSweep)
    });
  };

  const toggleTtlDurationSweep = () => {
    if (!panelModule || panelModule.type !== "ttl_output") return;
    const currentSweep = ttlDurationSweepForModule(panelModule);
    updateTtlDurationSweep({
      enabled: !currentSweep.enabled,
      start: Number.isFinite(currentSweep.start) ? currentSweep.start : panelModule.durationMs,
      end: Number.isFinite(currentSweep.end) ? currentSweep.end : panelModule.durationMs,
      points: Math.max(1, currentSweep.points || 1),
      lastEditedFields: currentSweep.lastEditedFields ?? []
    });
  };

  const updateTtlDurationSweepNumber = (field: SweepField, value: number) => {
    updateTtlDurationSweep({ [field]: value }, field);
  };

  const sweepForTimeUnitDisplay = (sweep: SweepConfig, unit: TimeUnit): SweepConfig => ({
    ...sweep,
    start: fromCanonicalTime(sweep.start, unit),
    end: fromCanonicalTime(sweep.end, unit),
    step: fromCanonicalTime(sweep.step, unit)
  });

  const updateDdsDurationSweepNumber = (field: SweepField, value: number) => {
    const canonicalValue = field === "points" ? value : toCanonicalTime(value, panelTimeUnit);
    updateSweepNumber("duration", field, canonicalValue);
  };

  const updateTtlDurationSweepNumberFromDisplay = (field: SweepField, value: number) => {
    const canonicalValue = field === "points" ? value : toCanonicalTime(value, panelTimeUnit);
    updateTtlDurationSweepNumber(field, canonicalValue);
  };

  const argumentConfigForPanel = (key: DdsArgumentKey | "ttlDuration") => {
    if (!panelModule) return { enabled: false, name: "" };
    if (key === "ttlDuration") {
      return panelModule.argumentConfig?.ttlDuration ?? { enabled: false, name: argumentDefaultName(panelModule, key) };
    }
    return panelModule.argumentConfig?.dds?.[key] ?? { enabled: false, name: argumentDefaultName(panelModule, key) };
  };

  const updateDdsArgumentConfig = (key: DdsArgumentKey, patch: Partial<{ enabled: boolean; name: string }>) => {
    if (!panelModule || panelModule.type !== "dds") return;
    const current = argumentConfigForPanel(key);
    updatePanelModule({
      argumentConfig: {
        ...panelModule.argumentConfig,
        dds: {
          ...panelModule.argumentConfig?.dds,
          [key]: {
            ...current,
            ...patch
          }
        }
      }
    });
  };

  const updateTtlDurationArgumentConfig = (patch: Partial<{ enabled: boolean; name: string }>) => {
    if (!panelModule || panelModule.type !== "ttl_output") return;
    const current = argumentConfigForPanel("ttlDuration");
    updatePanelModule({
      argumentConfig: {
        ...panelModule.argumentConfig,
        ttlDuration: {
          ...current,
          ...patch
        }
      }
    });
  };

  const renderDdsArgumentControl = (key: DdsArgumentKey, disabled = false) => {
    if (!panelModule || panelModule.type !== "dds") return null;
    const config = argumentConfigForPanel(key);
    return (
      <div className={`argument-control ${config.enabled && !disabled ? "expanded" : ""}`}>
        <button
          type="button"
          className={`argument-toggle ${config.enabled ? "active" : ""}`}
          disabled={disabled}
          title={disabled ? "Sweep controls this parameter, so it cannot also be an argument." : "Expose this value as an ARTIQ dashboard argument"}
          onClick={() => updateDdsArgumentConfig(key, { enabled: !config.enabled, name: config.name || argumentDefaultName(panelModule, key) })}
        >
          Arg: {config.enabled ? "ON" : "OFF"}
        </button>
        {config.enabled && !disabled && (
          <input
            className="argument-name-input"
            value={config.name}
            placeholder={argumentDefaultName(panelModule, key)}
            onChange={(event) => updateDdsArgumentConfig(key, { name: event.target.value })}
          />
        )}
      </div>
    );
  };

  const renderTtlDurationArgumentControl = (disabled = false) => {
    if (!panelModule || panelModule.type !== "ttl_output") return null;
    const config = argumentConfigForPanel("ttlDuration");
    return (
      <div className={`argument-control ${config.enabled && !disabled ? "expanded" : ""}`}>
        <button
          type="button"
          className={`argument-toggle ${config.enabled ? "active" : ""}`}
          disabled={disabled}
          title={disabled ? "Sweep controls this duration, so it cannot also be an argument." : "Expose this duration as an ARTIQ dashboard argument"}
          onClick={() => updateTtlDurationArgumentConfig({ enabled: !config.enabled, name: config.name || argumentDefaultName(panelModule, "ttlDuration") })}
        >
          Arg: {config.enabled ? "ON" : "OFF"}
        </button>
        {config.enabled && !disabled && (
          <input
            className="argument-name-input"
            value={config.name}
            placeholder={argumentDefaultName(panelModule, "ttlDuration")}
            onChange={(event) => updateTtlDurationArgumentConfig({ name: event.target.value })}
          />
        )}
      </div>
    );
  };

  const renderSweepFields = (
    sweep: SweepConfig,
    unitText: string,
    step: string,
    onChange: (field: SweepField, value: number) => void
  ) => (
    <div className="sweep-grid">
      <label>
        Start{unitText}
        <input
          type="number"
          step={step}
          value={sweepInputValue(sweep.start)}
          onChange={(event) => onChange("start", event.target.valueAsNumber)}
        />
      </label>
      <label>
        End{unitText}
        <input
          type="number"
          step={step}
          value={sweepInputValue(sweep.end)}
          onChange={(event) => onChange("end", event.target.valueAsNumber)}
        />
      </label>
      <label>
        Points
        <input
          type="number"
          min="1"
          step="1"
          value={sweepInputValue(sweep.points)}
          onChange={(event) => onChange("points", event.target.valueAsNumber)}
        />
      </label>
      <label>
        Step{unitText}
        <input
          type="number"
          step={step}
          value={sweepInputValue(sweep.step)}
          onChange={(event) => onChange("step", event.target.valueAsNumber)}
        />
      </label>
    </div>
  );

  const renderDdsSweepEditor = (key: DdsParameterKey) => {
    if (!panelDdsParameters) return null;
    const parameter = panelDdsParameters[key];
    if (!parameter.sweep.enabled) return null;
    const meta = ddsParameterMeta[key];
    const sweep = computedSweep(parameter.sweep);
    const rawPoints = parameter.sweep.points;
    const unitText = key === "duration" ? ` ${panelTimeUnit}` : meta.unit ? ` ${meta.unit}` : "";
    const displayedSweep = key === "duration" ? sweepForTimeUnitDisplay(sweep, panelTimeUnit) : sweep;
    const sweepStep = key === "duration" ? String(fromCanonicalTime(internalSnapGridMs, panelTimeUnit)) : meta.step;
    const onSweepChange = key === "duration"
      ? updateDdsDurationSweepNumber
      : (field: SweepField, value: number) => updateSweepNumber(key, field, value);

    return (
      <div className="sweep-card">
        {renderSweepFields({ ...displayedSweep, points: rawPoints }, unitText, sweepStep, onSweepChange)}
        {sweep.invalid && sweep.error ? <p className="sweep-error">{sweep.error}</p> : null}
      </div>
    );
  };

  const renderTtlDurationEditor = () => {
    if (!panelModule || panelModule.type !== "ttl_output") return null;
    const sweep = computedSweep(ttlDurationSweepForModule(panelModule));
    const displayedSweep = sweepForTimeUnitDisplay(sweep, panelTimeUnit);
    const enabled = sweep.enabled;

    return (
      <div className="parameter-field">
        <div className="parameter-header">
          <span>Duration {panelTimeUnit}</span>
          <div className="parameter-actions-inline">
            {renderTtlDurationArgumentControl(enabled)}
            <button type="button" className={`sweep-toggle ${enabled ? "active" : ""}`} onClick={toggleTtlDurationSweep}>
              Sweep: {enabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>
        {enabled ? (
          <div className="sweep-card">
            {renderSweepFields(displayedSweep, ` ${panelTimeUnit}`, String(fromCanonicalTime(internalSnapGridMs, panelTimeUnit)), updateTtlDurationSweepNumberFromDisplay)}
            {sweep.invalid && sweep.error ? <p className="sweep-error">{sweep.error}</p> : null}
          </div>
        ) : (
          <input
            type="number"
            min="0"
            step={internalSnapGridMs}
            disabled={isPlacementLocked}
            {...timingInputProps("durationMs")}
          />
        )}
      </div>
    );
  };

  const renderSweepToggle = (key: DdsParameterKey) => {
    if (!panelDdsParameters) return null;
    const enabled = panelDdsParameters[key].sweep.enabled;
    return (
      <button type="button" className={`sweep-toggle ${enabled ? "active" : ""}`} onClick={() => toggleDdsSweep(key)}>
        Sweep: {enabled ? "ON" : "OFF"}
      </button>
    );
  };

  const renderDdsParameterEditor = (key: DdsParameterKey) => {
    if (!panelDdsParameters) return null;
    const parameter = panelDdsParameters[key];
    const meta = ddsParameterMeta[key];
    const unitText = key === "duration" ? ` ${panelTimeUnit}` : meta.unit ? ` ${meta.unit}` : "";

    return (
      <div className="parameter-field">
        <div className="parameter-header">
          <span>{meta.label}{unitText}</span>
          <div className="parameter-actions-inline">
            {renderDdsArgumentControl(key, parameter.sweep.enabled)}
            {renderSweepToggle(key)}
          </div>
        </div>
        {key === "phase" && (
          <label>
            Phase mode
            <select
              value={panelModule?.type === "dds" ? panelModule.phaseMode ?? defaultPhaseMode : defaultPhaseMode}
              onChange={(event) => updateDdsPhaseMode(event.target.value as PhaseMode)}
            >
              <option value="absolute">ABSOLUTE</option>
              <option value="continuous">CONTINUOUS</option>
              <option value="tracking">TRACKING</option>
            </select>
          </label>
        )}
        {parameter.sweep.enabled ? (
          renderDdsSweepEditor(key)
        ) : key === "duration" ? (
          <input
            type="number"
            min={meta.min}
            step={fromCanonicalTime(internalSnapGridMs, panelTimeUnit)}
            disabled={isPlacementLocked}
            {...timingInputProps("durationMs")}
          />
        ) : (
          <input
            type="number"
            min={meta.min}
            max={meta.max}
            step={meta.step}
            value={parameter.value}
            onChange={(event) => updateDdsParameterValue(key, Number(event.target.value))}
          />
        )}
      </div>
    );
  };

  const renderDdsAttenuationEditor = () => {
    if (!panelModule || panelModule.type !== "dds") return null;
    return (
      <div className="parameter-field">
        <div className="parameter-header">
          <span>Attenuation dB</span>
          {renderDdsArgumentControl("attenuation")}
        </div>
        <input
          type="number"
          min="0"
          max={maxDdsAttenuationDb}
          step="0.1"
          value={panelModule.attenuationDb ?? defaultDdsAttenuationDb}
          onChange={(event) => updateDdsAttenuation(event.target.valueAsNumber)}
        />
      </div>
    );
  };

  const startDraftModule = (type: ModuleType) => {
    setDraftModule(createModule(state, type, draftModuleId));
    setSelectedId("");
    setModuleMessage("");
  };

  const deleteSelected = () => {
    if (!selectedModule) return;
    updateActiveTabState((current) => ({ ...current, modules: removeModulePreservingNextStart(current.modules, selectedModule.id) }));
    setSelectedId("");
    setModuleMessage("");
  };

  const closePropertiesPanel = () => {
    setDraftModule(null);
    setSelectedId("");
    setModuleMessage("");
  };

  const createDraftModule = () => {
    if (!draftModule) return;
    const realModule = { ...draftModule, id: uid(), gapAfterPrevious: gapForAbsoluteStart(draftModule, state.modules) };
    const channel = state.availableChannels.find((item) => item.id === realModule.channel);
    if (!channel || !compatibleTypes(realModule.type).includes(channel.type) || realModule.durationMs <= 0 || realModule.startMs < 0) {
      setSaveStatus("Draft module has invalid timing or channel");
      setModuleMessage("Draft module has invalid timing or channel.");
      return;
    }

    const conflict = findSameChannelOverlap(realModule, state.modules);
    if (conflict) {
      setSaveStatus("Draft module overlaps another task on the same channel");
      setModuleMessage(overlapMessage(conflict));
      return;
    }

    updateActiveTabState((current) => ({
      ...current,
      modules: recalculateChannelTiming([...current.modules, realModule], realModule.channel)
    }));
    setDraftModule(null);
    setSelectedId(realModule.id);
    setModuleMessage("");
  };

  const savePanelModuleAsPackage = () => {
    if (!panelModule) return;
    if (!panelModule.name.trim()) {
      setModuleMessage("Package name cannot be empty.");
      setSaveStatus("Package save failed");
      return;
    }

    try {
      const next = savePackageFromModule(panelModule, savedPackages);
      const savedPackage = next[next.length - 1];
      setSavedPackages(next);
      setSelectedPackageIds((selection) => ({
        ...selection,
        [savedPackage.category]: savedPackage.id
      }));
      setSaveStatus(`Saved package ${savedPackage.name}`);
      setModuleMessage("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Package could not be saved.";
      setModuleMessage(message);
      setSaveStatus("Package save failed");
    }
  };

  const startDraftFromPackage = (modulePackage: SavedModulePackage) => {
    const packageCopy = JSON.parse(JSON.stringify(modulePackage)) as SavedModulePackage;
    const packageParams = packageCopy.params;
    const draft = createModule(state, modulePackage.type, draftModuleId);
    const nextDraft = {
      ...draft,
      name: packageCopy.name,
      durationMs: packageCopy.durationMs,
      frequencyMHz: packageParams.ddsParameters?.frequency.value ?? packageParams.frequencyMHz,
      amplitude: packageParams.ddsParameters?.amplitude.value ?? packageParams.amplitude,
      phaseDeg: packageParams.ddsParameters?.phase.value ?? packageParams.phaseDeg,
      phaseMode: packageParams.phaseMode ?? defaultPhaseMode,
      attenuationDb: packageParams.attenuationDb ?? defaultDdsAttenuationDb,
      ttlDurationSweep: packageParams.ttlDurationSweep ?? makeSweepConfig(packageCopy.durationMs),
      laserPreset: packageParams.laserPreset,
      edge: packageParams.edge,
      datasetName: packageParams.datasetName
    };
    setDraftModule(
      nextDraft.type === "dds"
        ? syncDdsLegacyFields(nextDraft, {
            frequency: packageParams.ddsParameters?.frequency ?? makeDdsParameter(nextDraft.frequencyMHz ?? 80, "MHz"),
            amplitude: packageParams.ddsParameters?.amplitude ?? makeDdsParameter(nextDraft.amplitude ?? 0.5, ""),
            phase: packageParams.ddsParameters?.phase ?? makeDdsParameter(nextDraft.phaseDeg ?? 0, "deg"),
            duration: packageParams.ddsParameters?.duration ?? makeDdsParameter(nextDraft.durationMs, "ms")
          })
        : nextDraft
    );
    setSelectedId("");
    setModuleMessage("");
  };

  const removeSavedPackage = (packageId: string) => {
    const packageToDelete = savedPackages.find((modulePackage) => modulePackage.id === packageId);
    if (!packageToDelete) return;
    const confirmed = window.confirm(`Delete saved package "${packageToDelete.name}"? This cannot be undone.`);
    if (!confirmed) return;
    setSavedPackages((current) => deleteSavedPackage(packageId, current));
    setSelectedPackageIds((selection) => ({
      ...selection,
      [packageToDelete.category]: selection[packageToDelete.category] === packageId ? "" : selection[packageToDelete.category]
    }));
    setSaveStatus("Package deleted");
  };

  const selectSavedPackage = (category: ParameterPackageCategory, packageId: string) => {
    setSelectedPackageIds((current) => ({ ...current, [category]: packageId }));
    const modulePackage = savedPackages.find((item) => item.id === packageId);
    if (modulePackage) {
      startDraftFromPackage(modulePackage);
    }
  };

  const toggleChannel = (id: string) => {
    updateActiveTabState((current) => {
      const visible = current.visibleChannelIds.includes(id);
      return {
        ...current,
        visibleChannelIds: visible
          ? current.visibleChannelIds.filter((channelId) => channelId !== id)
          : [...current.visibleChannelIds, id]
      };
    });
  };

  const toggleAllChannels = () => {
    updateActiveTabState((current) => {
      const allChannelIds = current.availableChannels.map((channel) => channel.id);
      const allSelected = allChannelIds.length > 0 && allChannelIds.every((id) => current.visibleChannelIds.includes(id));
      return {
        ...current,
        visibleChannelIds: allSelected ? [] : allChannelIds
      };
    });
  };

  const channelFromPoint = (clientX: number, clientY: number, module: SequenceModule, fallbackChannel: string) => {
    const target = document.elementFromPoint(clientX, clientY);
    const lane = target instanceof HTMLElement ? target.closest<HTMLElement>(".lane[data-channel-id]") : null;
    const channelId = lane?.dataset.channelId;
    const channel = state.availableChannels.find((item) => item.id === channelId);
    if (!channel || !compatibleTypes(module.type).includes(channel.type)) return fallbackChannel;
    return channel.id;
  };

  const dragStartForPointer = (module: SequenceModule, clientX: number, clientY: number, pointerOffsetPx: number) => {
    const channel = channelFromPoint(clientX, clientY, module, module.channel);
    const lane = document.querySelector<HTMLElement>(`.lane[data-channel-id="${channel}"]`);
    if (!lane) return { channel: module.channel, startMs: module.startMs };

    const laneRect = lane.getBoundingClientRect();
    const rawStartMs = (clientX - laneRect.left - pointerOffsetPx) / state.pixelsPerMs;
    return {
      channel,
      startMs: snapToMeaningfulTimingPoint(rawStartMs, module, state.modules, state.pixelsPerMs)
    };
  };

  const onBlockPointerDown = (event: PointerEvent<HTMLDivElement>, module: SequenceModule) => {
    setDraftModule(null);
    setSelectedId(module.id);
    setModuleMessage("");

    if (module.locked || event.button !== 0) return;

    const blockRect = event.currentTarget.getBoundingClientRect();
    const timerId = window.setTimeout(() => {
      const pending = pendingDragRef.current;
      if (!pending || pending.moduleId !== module.id) return;
      isDraggingRef.current = true;
      setDragPreview({
        moduleId: module.id,
        channel: module.channel,
        startMs: module.startMs
      });
    }, longPressMs);

    pendingDragRef.current = {
      moduleId: module.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pointerOffsetPx: event.clientX - blockRect.left,
      timerId
    };
  };

  useEffect(() => {
    const clearPendingDrag = () => {
      if (pendingDragRef.current) {
        window.clearTimeout(pendingDragRef.current.timerId);
      }
      pendingDragRef.current = null;
      isDraggingRef.current = false;
    };

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const pending = pendingDragRef.current;
      if (!pending) return;
      const module = state.modules.find((item) => item.id === pending.moduleId);
      if (!module || module.locked) {
        clearPendingDrag();
        setDragPreview(null);
        return;
      }

      const movedPx = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
      if (!isDraggingRef.current && movedPx > longPressJitterPx) {
        clearPendingDrag();
        setDragPreview(null);
        return;
      }

      if (!isDraggingRef.current) return;

      const next = dragStartForPointer(module, event.clientX, event.clientY, pending.pointerOffsetPx);
      setDragPreview({ moduleId: module.id, ...next });
    };

    const onPointerUp = () => {
      const pending = pendingDragRef.current;
      if (!pending) return;
      window.clearTimeout(pending.timerId);

      const module = state.modules.find((item) => item.id === pending.moduleId);
      if (isDraggingRef.current && dragPreview && module && !module.locked) {
        const channelResult =
          dragPreview.channel === module.channel
            ? { modules: state.modules, error: "" }
            : updateModuleChannelAndStartPreservingGaps(state.modules, module.id, dragPreview.channel, dragPreview.startMs);
        const result = channelResult.error
          ? channelResult
          : dragPreview.channel === module.channel
            ? updateModuleStartPreservingGaps(channelResult.modules, module.id, dragPreview.startMs)
            : channelResult;
        setModuleMessage(result.error ?? "");
        if (!result.blocked) {
          updateActiveTabState((current) => ({ ...current, modules: result.modules }));
        }
      }

      pendingDragRef.current = null;
      isDraggingRef.current = false;
      setDragPreview(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [dragPreview, state, activeTab?.id]);

  const downloadPython = () => {
    if (generationError) {
      setModuleMessage(generationError);
      return;
    }
    const blob = new Blob([python], { type: "text/x-python;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = pythonFilename(state.sequenceName);
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadTimelineDiagram = () => {
    exportTimelineDiagram(state);
  };

  const exportPythonFromMenu = () => {
    setIsExportMenuOpen(false);
    downloadPython();
  };

  const exportTimelineDiagramFromMenu = () => {
    setIsExportMenuOpen(false);
    downloadTimelineDiagram();
  };

  const exportSignalDiagramFromMenu = () => {
    setIsExportMenuOpen(false);
    exportSignalDiagram(state);
  };

  const copyPython = async () => {
    if (generationError) {
      setModuleMessage(generationError);
      return;
    }
    await navigator.clipboard.writeText(python);
  };

  const startCodePaneResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = codePreviewRef.current;
    if (!container) return;

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const rawPythonHeight = moveEvent.clientY - rect.top;
      const maxPythonHeight = Math.max(rect.height - minManifestPanePx, minManifestPanePx);
      const clampedPythonHeight = Math.min(Math.max(rawPythonHeight, minManifestPanePx), maxPythonHeight);
      setCodePaneRatio(clampedPythonHeight / rect.height);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const saveExperiment = () => {
    if (generationError) {
      setModuleMessage(generationError);
      setSaveStatus("Save failed");
      return;
    }

    try {
      setSavedExperiments((current) => saveExperimentRecord(state, current));
      if (activeExperimentTabId) {
        setExperimentTabs((current) =>
          current.map((tab) => (tab.id === activeExperimentTabId ? { ...tab, isDirty: false } : tab))
        );
      }
      setSaveStatus(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    } catch {
      setSaveStatus("Save failed");
    }
  };

  const importPythonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const fileText = await file.text();
      const imported = parseSequenceBuilderPythonImport(fileText, initialState);
      const nextTabId = activeTab?.id;
      if (nextTabId) {
        setExperimentTabs((current) =>
          current.map((tab) => (tab.id === nextTabId ? { ...tab, state: imported.state, isDirty: true } : tab))
        );
      } else {
        const nextTab = makeExperimentTab(imported.state, true);
        setExperimentTabs([nextTab]);
        setActiveTabId(nextTab.id);
      }
      setSelectedPlots(imported.plots);
      setSelectedSavedExperimentId("");
      setSelectedId("");
      setDraftModule(null);
      setModuleMessage("");
      setPlotMessage("");
      setIsSavedExperimentMenuOpen(false);
      setIsExportMenuOpen(false);
      setSaveStatus("Imported but unsaved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      setModuleMessage(message);
      setSaveStatus("Import failed");
    }
  };

  const clearExperiment = () => {
    updateActiveTabState((current) => ({ ...current, modules: [] }));
    setSelectedSavedExperimentId("");
    setSelectedId("");
    setDraftModule(null);
    setModuleMessage("");
    setSaveStatus("Unsaved changes");
  };

  const createNewExperiment = () => {
    const nextTab = makeExperimentTab({
      ...blankExperimentState,
      sequenceName: `new_experiment_${experimentTabs.length + 1}`,
      className: `NewExperiment${experimentTabs.length + 1}`
    }, true);
    setExperimentTabs((current) => [...current, nextTab]);
    setActiveTabId(nextTab.id);
    setSelectedSavedExperimentId("");
    setSelectedId("");
    setDraftModule(null);
    setIsCodeOpen(false);
    setModuleMessage("");
    setSaveStatus("New experiment, not saved");
  };

  const closeExperimentTab = (tabId: string) => {
    const tabToClose = experimentTabs.find((tab) => tab.id === tabId);
    if (!tabToClose) return;

    if (tabToClose.isDirty) {
      const experimentName = tabToClose.state.sequenceName || "Untitled";
      const confirmed = window.confirm(
        `Experiment "${experimentName}" has unsaved changes. Close it and discard those changes?`
      );
      if (!confirmed) return;
    }

    setExperimentTabs((current) => {
      if (current.length === 1) {
        const fallback = makeExperimentTab(blankExperimentState, true);
        setActiveTabId(fallback.id);
        return [fallback];
      }

      const closingIndex = current.findIndex((tab) => tab.id === tabId);
      const next = current.filter((tab) => tab.id !== tabId);
      if ((activeTab?.id ?? current[0]?.id) === tabId) {
        setActiveTabId(next[Math.max(0, closingIndex - 1)]?.id ?? next[0].id);
      }
      return next;
    });
    setSelectedId("");
    setDraftModule(null);
    setModuleMessage("");
  };

  const openSavedExperiment = (recordId: string) => {
    const record = savedExperiments.find((item) => item.id === recordId);
    if (!record) return;
    const nextTab = makeExperimentTab(record.state, false);
    setExperimentTabs((current) => [...current, nextTab]);
    setActiveTabId(nextTab.id);
    setSelectedSavedExperimentId(record.id);
    setIsSavedExperimentMenuOpen(false);
    setSelectedId("");
    setDraftModule(null);
    setModuleMessage("");
    setSaveStatus(`Opened ${record.state.sequenceName}`);
  };

  const resetActiveExperimentToBlank = () => {
    const blankState = {
      ...blankExperimentState,
      sequenceName: `new_experiment_${experimentTabs.length + 1}`,
      className: `NewExperiment${experimentTabs.length + 1}`
    };
    const targetId = activeTab?.id;
    if (targetId) {
      setExperimentTabs((current) =>
        current.map((tab) => (tab.id === targetId ? { ...tab, state: blankState, isDirty: true } : tab))
      );
    } else {
      const nextTab = makeExperimentTab(blankState, true);
      setExperimentTabs([nextTab]);
      setActiveTabId(nextTab.id);
    }
    setSelectedSavedExperimentId("");
    setSelectedId("");
    setDraftModule(null);
    setModuleMessage("");
    setSaveStatus("New experiment, not saved");
  };

  const deleteSavedExperiment = (record: SavedExperimentRecord) => {
    const experimentName = record.state.sequenceName || "Untitled";
    const confirmed = window.confirm(`Delete saved experiment "${experimentName}"? This cannot be undone.`);
    if (!confirmed) return;

    setSavedExperiments((current) => deleteSavedExperimentRecord(record.id, current));
    setIsSavedExperimentMenuOpen(false);

    if (record.id === selectedSavedExperimentId) {
      resetActiveExperimentToBlank();
    } else {
      setSaveStatus(`Deleted ${experimentName}`);
    }
  };

  const createDefaultPlot = (): PlotPackage => ({
    id: `plot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `plot_${selectedPlots.length + 1}`,
    type: "plot_xy",
    x: plotDatasets.x[0],
    y: plotDatasets.y[0],
    group: "Measurement",
    enabled: true
  });

  const compatiblePlotYDatasets = plotDraft
    ? getCompatiblePlotYDatasets(plotDraft.x, plotDatasets)
    : [];

  const startNewPlot = () => {
    if (!canCreatePlot) {
      setPlotMessage("Add a TTL input counting block before creating count plots.");
      return;
    }
    setPlotMessage("");
    setPlotDraft(createDefaultPlot());
  };

  const confirmPlot = () => {
    if (!plotDraft) return;
    if (!plotDraft.x || !plotDraft.y || !isPlotValid(plotDraft, plotDatasets)) {
      setPlotMessage("Select a matching X and Y dataset pair.");
      return;
    }
    setSelectedPlots((current) => {
      const exists = current.some((plot) => plot.id === plotDraft.id);
      return exists ? current.map((plot) => (plot.id === plotDraft.id ? plotDraft : plot)) : [...current, plotDraft];
    });
    setPlotDraft(null);
    setPlotMessage("");
  };

  const editPlot = (plot: PlotPackage) => {
    setPlotMessage("");
    setPlotDraft({ ...plot });
  };

  const togglePlotEnabled = (plotId: string) => {
    setSelectedPlots((current) =>
      current.map((plot) => (plot.id === plotId ? { ...plot, enabled: !plot.enabled } : plot))
    );
  };

  const deletePlot = (plotId: string) => {
    setSelectedPlots((current) => current.filter((plot) => plot.id !== plotId));
    setPlotDraft((current) => (current?.id === plotId ? null : current));
  };

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div className="toolbar-top-row">
          <div className="brand">
            <FileCode2 size={22} />
            <div>
              <h1>ARTIQ Sequence Builder</h1>
              <span>Visual timing editor to Python experiment</span>
            </div>
          </div>

          <section className="experiment-tabs">
            {experimentTabs.map((tab) => (
              <div className={`experiment-tab ${tab.id === activeExperimentTabId ? "active" : ""}`} key={tab.id}>
                {editingTabId === tab.id ? (
                  <input
                    ref={tabNameInputRef}
                    className="experiment-tab-rename"
                    value={editingTabName}
                    aria-label="Experiment file name"
                    onChange={(event) => setEditingTabName(event.target.value)}
                    onBlur={commitEditingExperimentTabName}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitEditingExperimentTabName();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelEditingExperimentTabName();
                      }
                    }}
                  />
                ) : (
                  <button
                    className="experiment-tab-main"
                    title="Click to switch. Double-click to rename the experiment file name."
                    onClick={() => {
                      setActiveTabId(tab.id);
                      setSelectedSavedExperimentId("");
                      setSelectedId("");
                      setDraftModule(null);
                      setModuleMessage("");
                    }}
                    onDoubleClick={() => startEditingExperimentTabName(tab)}
                  >
                    {tab.state.sequenceName || "Untitled"}
                  </button>
                )}
                <button className="experiment-tab-close" title="Close experiment tab" onClick={() => closeExperimentTab(tab.id)}>
                  <X size={13} />
                </button>
              </div>
            ))}
            <button className="experiment-tab-add" title="New experiment" onClick={createNewExperiment}>
              <Plus size={15} />
            </button>
          </section>

          <section className="experiment-status">
            <div className="saved-experiment-picker">
              <button
                className="icon-text saved-experiment-trigger"
                onClick={() => setIsSavedExperimentMenuOpen((open) => !open)}
              >
                <ChevronDown size={15} />
                Open
              </button>
              {isSavedExperimentMenuOpen && (
                <div className="saved-experiment-menu">
                  {savedExperiments.length === 0 ? (
                    <div className="saved-experiment-empty">No saved experiments.</div>
                  ) : (
                    savedExperiments.map((record) => (
                      <div
                        className="saved-experiment-row"
                        key={record.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openSavedExperiment(record.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openSavedExperiment(record.id);
                          }
                        }}
                      >
                        <span>
                          <strong>{record.state.sequenceName || "Untitled"}</strong>
                          <small>{new Date(record.savedAt).toLocaleString()}</small>
                        </span>
                        <button
                          className="saved-experiment-delete"
                          title={`Delete ${record.state.sequenceName || "saved experiment"}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteSavedExperiment(record);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="tone-picker">
              <button
                type="button"
                className="icon-button tone-trigger"
                title="Tone"
                aria-label="Tone"
                onClick={() => setIsToneMenuOpen((open) => !open)}
              >
                <Palette size={16} />
              </button>
              {isToneMenuOpen && (
                <div className="tone-menu">
                  <div className="tone-menu-header">
                    <span>Tone</span>
                    <strong>{toneOptions.find((option) => option.value === tonePreference)?.label ?? "System"}</strong>
                  </div>
                  <input
                    className="tone-slider"
                    type="range"
                    min="0"
                    max={toneOptions.length - 1}
                    step="1"
                    value={toneOptions.findIndex((option) => option.value === tonePreference)}
                    aria-label="Interface tone"
                    onChange={(event) => {
                      const nextOption = toneOptions[Number(event.target.value)] ?? toneOptions[0];
                      setTonePreference(nextOption.value);
                    }}
                  />
                  <div className="tone-labels">
                    {toneOptions.map((option) => (
                      <span key={option.value}>{option.label}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="toolbar-controls-row">
          <label className="inline-experiment-name">
            <span>Experiment name:</span>
            <input value={state.className} onChange={(event) => updateState({ className: sanitizePythonClassName(event.target.value) })} />
          </label>

          <div className="run-settings-menu">
            <button
              type="button"
              className="icon-button run-settings-trigger"
              title="Run settings"
              aria-label="Run settings"
              onClick={() => setIsRunSettingsOpen((open) => !open)}
            >
              <SlidersHorizontal size={17} />
            </button>
            {isRunSettingsOpen && (
              <div className="run-settings-panel">
                <label className="run-setting-row">
                  <span>Fetch batch</span>
                  <input
                    type="number"
                    min={minFetchBatchSize}
                    max={maxFetchBatchSize}
                    step="1"
                    value={fetchBatchDraft}
                    aria-invalid={Boolean(fetchBatchDraftError)}
                    title={fetchBatchDraftError || "Number of shots scheduled before counter readout"}
                    onChange={(event) => {
                      const nextDraft = event.target.value;
                      setFetchBatchDraft(nextDraft);
                      const parsed = parseFetchBatchSizeText(nextDraft);
                      if (parsed !== null) {
                        updateState({ fetchBatchSize: parsed });
                      }
                    }}
                  />
                </label>
                {fetchBatchDraftError ? <span className="run-settings-error">{fetchBatchDraftError}</span> : null}
                <label className="run-setting-row">
                  <span>Repetition</span>
                  <input
                    type="number"
                    min="1"
                    value={state.loop.count}
                    onChange={(event) => updateState({ loop: { ...state.loop, count: Number(event.target.value) || 1 } })}
                  />
                </label>
                <label className="run-setting-row">
                  <span>Sequence gap</span>
                  <div className="unit-input run-setting-unit-input">
                    <input
                      type="number"
                      min="0"
                      step={fromCanonicalTime(internalSnapGridMs, loopDelayUnit)}
                      value={formatTimeForUnit(state.loop.interLoopDelayMs, loopDelayUnit)}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        const nextGapMs = Number.isFinite(nextValue)
                          ? Math.max(0, toCanonicalTime(nextValue, loopDelayUnit))
                          : 0;
                        updateState({ loop: { ...state.loop, interLoopDelayMs: nextGapMs } });
                      }}
                    />
                    <select
                      aria-label="Sequence gap unit"
                      value={loopDelayUnit}
                      onChange={(event) => updateState({ loop: { ...state.loop, interLoopDelayUnit: event.target.value as TimeUnit } })}
                    >
                      {timeUnitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="run-setting-row">
                  <span>Start slack</span>
                  <div className="unit-input run-setting-unit-input">
                    <input
                      type="number"
                      min="0"
                      step={fromCanonicalTime(internalSnapGridMs, startSlackUnit)}
                      value={formatTimeForUnit(state.startSlackMs, startSlackUnit)}
                      title="Extra RTIO scheduling slack before the first sequence; 0 disables it"
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        const nextSlackMs = Number.isFinite(nextValue)
                          ? Math.max(0, toCanonicalTime(nextValue, startSlackUnit))
                          : 0;
                        updateState({ startSlackMs: nextSlackMs });
                      }}
                    />
                    <select
                      aria-label="Start slack unit"
                      value={startSlackUnit}
                      onChange={(event) => updateState({ startSlackUnit: event.target.value as TimeUnit })}
                    >
                      {timeUnitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>
            )}
          </div>

          <button className="icon-button" title="Clear timeline" onClick={clearExperiment}>
            <Trash2 size={18} />
          </button>
          <button className="icon-button" title="Save experiment" onClick={saveExperiment}>
            <Save size={18} />
          </button>
          <button className="icon-button" title="Import Python" onClick={() => pythonImportInputRef.current?.click()}>
            <Upload size={18} />
          </button>
          <input
            ref={pythonImportInputRef}
            className="file-input-hidden"
            type="file"
            accept=".py,text/x-python,text/plain"
            onChange={importPythonFile}
          />
          <div className="export-menu">
            <button className="icon-text primary export-trigger" onClick={() => setIsExportMenuOpen((open) => !open)}>
              <Download size={17} />
              Export
            </button>
            {isExportMenuOpen && (
              <div className="export-menu-panel">
                <button type="button" onClick={exportPythonFromMenu}>
                  Export Python
                </button>
                <button type="button" onClick={exportTimelineDiagramFromMenu}>
                  Export timeline diagram
                </button>
                <button type="button" onClick={exportSignalDiagramFromMenu}>
                  Export signal diagram
                </button>
              </div>
            )}
          </div>
          <button className="icon-button" title="Toggle code preview" onClick={() => setIsCodeOpen((open) => !open)}>
            <Code2 size={18} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="channel-selector">
          <button className="icon-text channel-menu-trigger" onClick={() => setIsChannelMenuOpen((open) => !open)}>
            {isChannelMenuOpen ? <EyeOff size={17} /> : <Eye size={17} />}
            Select channels
          </button>
          <label className="compact-select">
            Timeline unit
            <select value={timelineTimeUnit} onChange={(event) => updateTimelineTimeUnit(event.target.value as TimeUnit)}>
              {timeUnitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
          <div className="timeline-zoom-controls">
            <button type="button" className="icon-button" title="Zoom out" onClick={() => zoomTimeline(0.75)}>
              <ZoomOut size={16} />
            </button>
            <button type="button" className="icon-button" title="Zoom in" onClick={() => zoomTimeline(1.35)}>
              <ZoomIn size={16} />
            </button>
            <button type="button" className="icon-button" title="Fit timeline" onClick={fitTimelineZoom}>
              <Maximize2 size={16} />
            </button>
            <button type="button" className="icon-button" title="Reset timeline zoom" onClick={resetTimelineZoom}>
              <RotateCcw size={16} />
            </button>
          </div>
          <span>{visibleChannels.length} visible lanes</span>
          <span className="timeline-save-status">{saveStatus}</span>
          <button
            type="button"
            className={`metadata-toggle ${includeSequenceBuilderMetadata ? "active" : ""}`}
            onClick={() => setIncludeSequenceBuilderMetadata((enabled) => !enabled)}
            title="Toggle Sequence Builder metadata in exported Python"
          >
            <FileCode2 size={15} />
            Metadata: {includeSequenceBuilderMetadata ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            className={`metadata-toggle run-brief-toggle ${includeRunBrief ? "active" : ""}`}
            onClick={() => setIncludeRunBrief((enabled) => !enabled)}
            title="Toggle compact run brief prints in exported Python"
          >
            <Clipboard size={15} />
            Run brief: {includeRunBrief ? "ON" : "OFF"}
          </button>
          {isChannelMenuOpen && (
            <div className="channel-menu">
              <div className="channel-menu-actions">
                <button className="icon-text" onClick={toggleAllChannels}>
                  {areAllChannelsSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
              {channelGroups.map((group) => (
                <div key={group.type} className="channel-group">
                  <h3>{group.title}</h3>
                  {state.availableChannels
                    .filter((channel) => channel.type === group.type)
                    .map((channel) => {
                      const hiddenCount = state.visibleChannelIds.includes(channel.id)
                        ? 0
                        : state.modules.filter((module) => module.channel === channel.id).length;
                      return (
                        <label key={channel.id} className="checkbox-row">
                          <input type="checkbox" checked={state.visibleChannelIds.includes(channel.id)} onChange={() => toggleChannel(channel.id)} />
                          <span>{channel.label}</span>
                          {hiddenCount > 0 && <em>({hiddenCount} modules hidden)</em>}
                        </label>
                      );
                    })}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="editor-grid">
          <div className="left-main-column">
            <div className="timeline-wrap" ref={timelineWrapRef}>
            <div
              className="timeline"
              style={{
                width: timelineWidth,
                "--major-grid-px": `${gridStepPx}px`,
                "--minor-grid-px": `${minorGridStepPx}px`
              } as CSSProperties}
            >
              <div className="time-axis">
                <div className="axis-spacer" />
                <div className="axis-track">
                  {ticks.map((tick) => (
                    <span key={tick} style={{ left: tick * state.pixelsPerMs }}>
                      {formatTimeValue(tick, timelineTimeUnit)}
                    </span>
                  ))}
                </div>
              </div>

              {visibleChannels.map((channel) => (
                <div className="lane-row" key={channel.id} style={{ height: laneHeight }}>
                  <div className="lane-label">
                    <strong>{channel.label}</strong>
                    <span>{channel.type.replace("_", " ")}</span>
                  </div>
                  <div
                    className="lane"
                    data-channel-id={channel.id}
                    onMouseLeave={clearGapHover}
                  >
                    {(gapRegionsByChannel.get(channel.id) ?? []).map((gap) => (
                      <div
                        className="gap-region"
                        key={gap.id}
                        onMouseEnter={() => startGapHover(gap.id)}
                        onMouseLeave={clearGapHover}
                        style={{
                          left: gap.leftPx,
                          width: gap.widthPx
                      }}
                      />
                    ))}
                    {state.modules
                      .filter((module) => (dragPreview?.moduleId === module.id ? dragPreview.channel : module.channel) === channel.id)
                      .map((module) => {
                        const preview = dragPreview?.moduleId === module.id ? dragPreview : null;
                        return (
                          <div
                            key={module.id}
                            className={`module-block ${showModuleIds ? "show-module-id" : ""} ${selectedId === module.id ? "selected" : ""} ${module.locked ? "locked" : ""} ${collisionModuleIds.has(module.id) ? "collision" : ""} ${preview ? "dragging" : ""}`}
                            onPointerDown={(event) => onBlockPointerDown(event, module)}
                            onClick={() => {
                              setDraftModule(null);
                              setSelectedId(module.id);
                              setModuleMessage("");
                            }}
                            style={{
                              left: (preview?.startMs ?? module.startMs) * state.pixelsPerMs,
                              width: Math.max(34, module.durationMs * state.pixelsPerMs),
                              background: moduleColors[module.type]
                            }}
                          >
                            {module.locked && (
                              <span className="module-lock-badge" title="Locked position">
                                <Lock size={11} />
                              </span>
                            )}
                            <strong>{module.name}</strong>
                            {showModuleIds && <small className="module-id">ID: {module.id}</small>}
                            <span>{formatTimeValue(module.durationMs, timelineTimeUnit)}</span>
                            {module.type === "dds" && (
                              <small>
                            {module.frequencyMHz} MHz · amp {module.amplitude} · att {module.attenuationDb ?? defaultDdsAttenuationDb} dB
                          </small>
                        )}
                            {module.type === "measure" && <small>{module.datasetName}</small>}
                          </div>
                        );
                      })}
                    {(gapRegionsByChannel.get(channel.id) ?? [])
                      .filter((gap) => gap.id === visibleGapTooltipId)
                      .map((gap) => (
                        <div
                          className="gap-tooltip"
                          key={`tooltip-${gap.id}`}
                          style={{ left: gap.leftPx + gap.widthPx / 2 }}
                        >
                          Gap: {formatTimeValue(gap.durationMs, timelineTimeUnit)}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <section className="bottom-area">
            <div className="palette">
              <button onClick={() => startDraftModule("dds")}>
                <Plus size={17} />
                DDS Signal
              </button>
              <button onClick={() => startDraftModule("measure")}>
                <Plus size={17} />
                TTL Counter Measure
              </button>
              <button onClick={() => startDraftModule("ttl_output")}>
                <Plus size={17} />
                TTL Output Pulse
              </button>
            </div>

            <div className="saved-packages">
              <div className="saved-packages-header">
                <h2>Saved packages</h2>
                <span>{savedPackages.length} saved</span>
              </div>
              <div className="package-category-list">
                {packageCategoryDefinitions.map((section) => {
                  const categoryPackages = packageLibraryByCategory[section.category];
                  const selectedPackage = categoryPackages.find((modulePackage) => modulePackage.id === selectedPackageIds[section.category]);
                  const isOpen = openPackageCategory === section.category;
                  return (
                    <div className="package-category" key={section.category}>
                      <span className="package-category-label">{section.title}</span>
                      <div className="package-dropdown">
                        <button
                          type="button"
                          className="package-trigger"
                          disabled={categoryPackages.length === 0}
                          aria-expanded={isOpen}
                          onClick={() => setOpenPackageCategory((current) => (current === section.category ? "" : section.category))}
                        >
                          <span>{categoryPackages.length === 0 ? "No saved packages" : selectedPackage?.name ?? "Select a package"}</span>
                          <ChevronDown size={15} />
                        </button>
                        {isOpen && categoryPackages.length > 0 && (
                          <div className="package-menu">
                            <button
                              type="button"
                              className="package-option muted"
                              onClick={() => {
                                setSelectedPackageIds((current) => ({ ...current, [section.category]: "" }));
                                setOpenPackageCategory("");
                              }}
                            >
                              Select a package
                            </button>
                            {categoryPackages.map((modulePackage) => {
                              const canDeletePackage = !isBuiltInPackage(modulePackage);
                              return (
                                <div className={`package-option-row ${selectedPackage?.id === modulePackage.id ? "selected" : ""}`} key={modulePackage.id}>
                                  <button
                                    type="button"
                                    className="package-option-main"
                                    onClick={() => {
                                      selectSavedPackage(section.category, modulePackage.id);
                                      setOpenPackageCategory("");
                                    }}
                                  >
                                    {modulePackage.name}
                                  </button>
                                  <button
                                    type="button"
                                    className="package-option-delete"
                                    title={canDeletePackage ? "Delete saved package" : "Built-in packages cannot be deleted"}
                                    disabled={!canDeletePackage}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (canDeletePackage) {
                                        removeSavedPackage(modulePackage.id);
                                      }
                                    }}
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button className="icon-text package-export" onClick={downloadParameterPackageLibrary}>
                <Download size={15} />
                Export Packages
              </button>
            </div>

            <div className="plot-panel">
              <div className="plot-panel-header">
                <h2>Plots</h2>
                <button className="icon-text" onClick={startNewPlot} disabled={!canCreatePlot}>
                  <Plus size={17} />
                  New plot
                </button>
              </div>

              {!canCreatePlot && (
                <p className="plot-message">Add a TTL input counting block before creating count plots.</p>
              )}
              {canCreatePlot && (
                <p className="plot-message">
                  Auto-open requires Dashboard Applets → Global CCB policy → Create and enable/disable applets.
                </p>
              )}
              {plotMessage && <p className="plot-message">{plotMessage}</p>}

              {plotDraft && (
                <div className="plot-form">
                  <label>
                    Plot name
                    <input
                      value={plotDraft.name}
                      onChange={(event) => setPlotDraft({ ...plotDraft, name: event.target.value })}
                    />
                  </label>
                  <label>
                    X dataset
                    <select
                      value={plotDraft.x}
                      onChange={(event) => {
                        const nextX = event.target.value;
                        const compatibleY = getCompatiblePlotYDatasets(nextX, plotDatasets);
                        setPlotDraft({
                          ...plotDraft,
                          x: nextX,
                          y: compatibleY.includes(plotDraft.y) ? plotDraft.y : compatibleY[0] ?? ""
                        });
                      }}
                    >
                      {!plotDatasets.x.includes(plotDraft.x) && (
                        <option value={plotDraft.x}>{plotDraft.x} (missing)</option>
                      )}
                      {plotDatasets.x.map((dataset) => (
                        <option key={dataset} value={dataset}>
                          {dataset}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Y dataset
                    <select value={plotDraft.y} onChange={(event) => setPlotDraft({ ...plotDraft, y: event.target.value })}>
                      {!compatiblePlotYDatasets.includes(plotDraft.y) && (
                        <option value={plotDraft.y}>{plotDraft.y} (missing)</option>
                      )}
                      {compatiblePlotYDatasets.map((dataset) => (
                        <option key={dataset} value={dataset}>
                          {dataset}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Group
                    <input
                      value={plotDraft.group}
                      onChange={(event) => setPlotDraft({ ...plotDraft, group: event.target.value })}
                    />
                  </label>
                  <div className="plot-actions">
                    <button className="icon-text primary" onClick={confirmPlot}>
                      <CheckCircle2 size={17} />
                      Confirm plot
                    </button>
                    <button className="icon-text" onClick={() => setPlotDraft(null)}>
                      <X size={17} />
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {selectedPlots.length === 0 ? (
                <p className="empty-state">No plots selected yet.</p>
              ) : (
                <div className="plot-list">
                  {selectedPlots.map((plot) => {
                    const plotValid = isPlotValid(plot, plotDatasets);
                    return (
                      <div
                        className={`plot-card ${plot.enabled ? "" : "disabled"} ${plotValid ? "" : "invalid"}`}
                        key={plot.id}
                      >
                        <div>
                          <strong>{plot.name}</strong>
                          <span>{plot.type} · {plot.group}</span>
                          <small>X: {plot.x}</small>
                          <small>Y: {plot.y}</small>
                          <em>{plotValid ? (plot.enabled ? "Enabled" : "Disabled") : "Invalid dataset"}</em>
                        </div>
                        <div className="plot-card-actions">
                          <button onClick={() => editPlot(plot)}>Edit</button>
                          <button onClick={() => togglePlotEnabled(plot.id)}>{plot.enabled ? "Disable" : "Enable"}</button>
                          <button className="danger-action" onClick={() => deletePlot(plot.id)}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
          </div>

          <aside className="property-panel">
            <div className="panel-title">
              <h2>{isCreatingDraft ? "Create module" : "Module properties"}</h2>
              {panelModule && (
                <button className="icon-button" title="Close properties" onClick={closePropertiesPanel}>
                  <X size={17} />
                </button>
              )}
            </div>

            {panelModule ? (
              <div className="property-fields">
                <div className="module-name-field">
                  <div className="module-name-header">
                    <label htmlFor="module-name-input">Name</label>
                    <button
                      type="button"
                      className={`module-id-toggle ${showModuleIds ? "active" : ""}`}
                      aria-pressed={showModuleIds}
                      title="Show module IDs in properties and timeline task blocks"
                      onClick={() => setShowModuleIds((visible) => !visible)}
                    >
                      Module ID: {showModuleIds ? "ON" : "OFF"}
                    </button>
                  </div>
                  <input
                    id="module-name-input"
                    value={panelModule.name}
                    onChange={(event) => updatePanelModule({ name: event.target.value })}
                  />
                  {showModuleIds && (
                    <div className="module-id-readout">
                      <span>Module ID</span>
                      <code>{panelModule.id}</code>
                    </div>
                  )}
                </div>
                <button
                  className={`icon-text lock-toggle ${isPlacementLocked ? "locked" : ""}`}
                  onClick={() => updatePanelModule({ locked: !isPlacementLocked })}
                >
                  {isPlacementLocked ? <Lock size={17} /> : <Unlock size={17} />}
                  {isPlacementLocked ? "Locked position" : "Lock position"}
                </button>
                {moduleMessage && moduleMessage !== timingDraftError && <div className="module-message error">{moduleMessage}</div>}
                {timingDraftError && <div className="module-message error">{timingDraftError}</div>}
                <label>
                  Channel
                  <select
                    value={panelModule.channel}
                    disabled={isPlacementLocked}
                    onChange={(event) => updatePanelModule({ channel: event.target.value })}
                  >
                    {state.availableChannels
                      .filter((channel) => compatibleTypes(panelModule.type).includes(channel.type))
                      .map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Time unit
                  <select value={panelTimeUnit} onChange={(event) => updatePanelModule({ timeUnit: event.target.value as TimeUnit })}>
                    {timeUnitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="two-col">
                  <label>
                    Start time {panelTimeUnit}
                    <input
                      type="number"
                      step={fromCanonicalTime(internalSnapGridMs, panelTimeUnit)}
                      disabled={isPlacementLocked}
                      {...timingInputProps("startMs")}
                    />
                  </label>
                  <label>
                    End time {panelTimeUnit}
                    <input
                      type="number"
                      step={fromCanonicalTime(internalSnapGridMs, panelTimeUnit)}
                      disabled={isPlacementLocked}
                      {...timingInputProps("endMs")}
                    />
                  </label>
                  {panelModule.type !== "dds" && panelModule.type !== "ttl_output" && (
                    <label>
                      Duration {panelTimeUnit}
                      <input
                        type="number"
                        min="0"
                        step={fromCanonicalTime(internalSnapGridMs, panelTimeUnit)}
                        disabled={isPlacementLocked}
                        {...timingInputProps("durationMs")}
                      />
                    </label>
                  )}
                  <label>
                    Gap after previous {panelTimeUnit}
                    <input
                      type="number"
                      min="0"
                      step={fromCanonicalTime(internalSnapGridMs, panelTimeUnit)}
                      disabled={isPlacementLocked}
                      {...timingInputProps("gapAfterPrevious")}
                    />
                  </label>
                </div>

                {panelModule.type === "ttl_output" && (
                  <>
                    {renderTtlDurationEditor()}
                    {sweepValidationMessages.length > 0 && (
                      <div className="sweep-messages">
                        {sweepValidationMessages.map((message) => (
                          <div className="module-message error" key={message}>
                            {message}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {panelModule.type === "dds" && (
                  <>
                    {renderDdsParameterEditor("duration")}
                    {renderDdsParameterEditor("frequency")}
                    {renderDdsParameterEditor("amplitude")}
                    {renderDdsParameterEditor("phase")}
                    {renderDdsAttenuationEditor()}
                    {sweepValidationMessages.length > 0 && (
                      <div className="sweep-messages">
                        {sweepValidationMessages.map((message) => (
                          <div className="module-message error" key={message}>
                            {message}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {panelModule.type === "measure" && (
                  <>
                    <label>
                      Edge
                      <select value={panelModule.edge ?? "rising"} onChange={(event) => updatePanelModule({ edge: event.target.value as SequenceModule["edge"] })}>
                        <option value="rising">Rising</option>
                        <option value="falling">Falling</option>
                        <option value="both">Both</option>
                      </select>
                    </label>
                    <label>
                      Dataset
                      <input value={panelModule.datasetName ?? ""} onChange={(event) => updatePanelModule({ datasetName: event.target.value })} />
                    </label>
                  </>
                )}

                <div className="property-actions">
                  {isCreatingDraft ? (
                    <button className="icon-text primary" onClick={createDraftModule}>
                      <Plus size={17} />
                      Create
                    </button>
                  ) : (
                    <button className="icon-text danger-action" onClick={deleteSelected}>
                      <Trash2 size={17} />
                      Delete
                    </button>
                  )}
                  <button className="icon-text" onClick={savePanelModuleAsPackage}>
                    <Save size={17} />
                    Save as package
                  </button>
                </div>
              </div>
            ) : (
              <p className="empty-state">Select a block on the timeline or choose a module type below.</p>
            )}
          </aside>
        </section>

      </main>

      <aside className={`code-drawer ${isCodeOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <div>
            <h2>Generated ARTIQ Python</h2>
            <span>{pythonFilename(state.sequenceName)}</span>
          </div>
          <button className="icon-button" title="Copy" onClick={copyPython}>
            <Clipboard size={17} />
          </button>
          <button className="icon-button" title="Download" onClick={downloadPython}>
            <Download size={17} />
          </button>
          <button className="icon-button" title="Close" onClick={() => setIsCodeOpen(false)}>
            <X size={17} />
          </button>
        </div>
        <div
          className="code-preview-stack"
          ref={codePreviewRef}
          style={{
            gridTemplateRows: `minmax(120px, ${codePaneRatio}fr) 8px minmax(${minManifestPanePx}px, ${1 - codePaneRatio}fr)`
          }}
        >
          <pre className="python-preview">
            <code>{python}</code>
          </pre>
          <div
            className="drawer-resize-handle"
            role="separator"
            aria-label="Resize Python preview and signal manifest"
            aria-orientation="horizontal"
            onPointerDown={startCodePaneResize}
          />
          <div className="manifest-panel">
            <h3>Signal manifest</h3>
            <pre>
              <code>{signalManifest}</code>
            </pre>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default App;
