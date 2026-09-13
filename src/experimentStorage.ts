import { availableChannels } from "./defaultChannels";
import { normalizeTimeUnit } from "./timeUnits";
import type {
  ChannelType,
  DdsParameter,
  DdsSweepParameters,
  ExperimentTab,
  ModuleArgumentConfig,
  ModuleType,
  PhaseMode,
  SavedExperimentRecord,
  SequenceModule,
  SequenceState
} from "./types";

const savedExperimentLibraryKey = "artiq-sequence-builder-saved-experiments";
const openExperimentTabsKey = "artiq-sequence-builder-open-tabs";
const legacySavedExperimentKey = "artiq-sequence-builder-current-experiment";

const availableChannelIds = new Set(availableChannels.map((channel) => channel.id));
const defaultDdsAttenuationDb = 10;
const defaultPhaseMode: PhaseMode = "absolute";

const normalizePhaseMode = (value: unknown): PhaseMode =>
  value === "tracking" || value === "continuous" || value === "absolute" ? value : defaultPhaseMode;

const compatibleTypes = (moduleType: ModuleType): ChannelType[] => {
  if (moduleType === "dds") return ["dds"];
  if (moduleType === "measure") return ["ttl_counter"];
  if (moduleType === "ttl_output") return ["ttl_output"];
  return [];
};

const defaultChannelForType = (moduleType: ModuleType) => {
  const types = compatibleTypes(moduleType);
  return availableChannels.find((channel) => types.includes(channel.type))?.id ?? availableChannels[0]?.id ?? "";
};

const migrateModuleChannel = (module: SequenceState["modules"][number]) => {
  const migratedChannel =
    module.type === "measure" && /^ttl(8|9|10|11)$/.test(module.channel)
      ? `${module.channel}_counter`
      : module.channel;
  const channel = availableChannels.find((item) => item.id === migratedChannel);
  if (!channel || !compatibleTypes(module.type).includes(channel.type)) {
    return defaultChannelForType(module.type);
  }
  return migratedChannel;
};

const endMs = (module: SequenceState["modules"][number]) => module.startMs + module.durationMs;

const defaultSweep = (value: number) => ({
  enabled: false,
  start: value,
  end: value,
  step: 0,
  points: 1,
  invalid: false,
  error: "",
  lastEditedFields: [] as Array<"start" | "end" | "points" | "step">
});

const cleanSweepNumber = (value: number) => Number((Math.abs(value) < 1e-9 ? 0 : value).toFixed(6));

type LegacySweepConfig = ReturnType<typeof defaultSweep> & {
  mode?: "end_points" | "step_points";
};

const normalizeConstraintSweep = (rawSweep: Partial<LegacySweepConfig>, fallbackValue: number) => {
  const enabled = Boolean(rawSweep.enabled);
  const points = Number.isInteger(rawSweep.points) && Number(rawSweep.points) >= 1 ? Number(rawSweep.points) : 1;
  const start = typeof rawSweep.start === "number" && Number.isFinite(rawSweep.start) ? rawSweep.start : fallbackValue;
  const rawEnd = typeof rawSweep.end === "number" && Number.isFinite(rawSweep.end) ? rawSweep.end : fallbackValue;
  const rawStep = typeof rawSweep.step === "number" && Number.isFinite(rawSweep.step) ? rawSweep.step : 0;
  const legacyMode = rawSweep.mode === "step_points" ? "step_points" : "end_points";

  const end = points === 1
    ? start
    : legacyMode === "step_points"
      ? cleanSweepNumber(start + rawStep * (points - 1))
      : rawEnd;
  const step = points === 1
    ? 0
    : legacyMode === "end_points"
      ? cleanSweepNumber((end - start) / (points - 1))
      : rawStep;

  return {
    enabled,
    start,
    end,
    step,
    points,
    invalid: false,
    error: "",
    lastEditedFields: (rawSweep.lastEditedFields ?? []).filter((field) =>
      ["start", "end", "points", "step"].includes(field)
    )
  };
};

const normalizeDdsParameter = <Unit extends string>(
  parameter: DdsParameter<Unit> | undefined,
  value: number,
  unit: Unit
): DdsParameter<Unit> => {
  const parameterValue = parameter?.value;
  const normalizedValue = typeof parameterValue === "number" && Number.isFinite(parameterValue) ? parameterValue : value;
  const sweep = normalizeConstraintSweep(parameter?.sweep ?? defaultSweep(value), value);

  return {
    value: normalizedValue,
    unit,
    sweep
  };
};

const normalizeDdsParameters = (module: SequenceModule): DdsSweepParameters => {
  const frequencyValue = module.frequencyMHz ?? module.ddsParameters?.frequency?.value ?? 80;
  const amplitudeValue = module.amplitude ?? module.ddsParameters?.amplitude?.value ?? 0.5;
  const phaseValue = module.phaseDeg ?? module.ddsParameters?.phase?.value ?? 0;
  const durationValue = module.durationMs ?? module.ddsParameters?.duration?.value ?? 1;

  return {
    frequency: normalizeDdsParameter(module.ddsParameters?.frequency, frequencyValue, "MHz"),
    amplitude: normalizeDdsParameter(module.ddsParameters?.amplitude, amplitudeValue, ""),
    phase: normalizeDdsParameter(module.ddsParameters?.phase, phaseValue, "deg"),
    duration: normalizeDdsParameter(module.ddsParameters?.duration, durationValue, "ms")
  };
};

const normalizeArgumentConfig = (config: ModuleArgumentConfig | undefined): ModuleArgumentConfig | undefined => {
  if (!config || typeof config !== "object") return undefined;
  const normalizeArgument = (argument: unknown) => {
    if (!argument || typeof argument !== "object") return undefined;
    const value = argument as { enabled?: unknown; name?: unknown };
    return {
      enabled: Boolean(value.enabled),
      name: typeof value.name === "string" ? value.name : ""
    };
  };
  const dds = config.dds && typeof config.dds === "object"
    ? Object.fromEntries(
        Object.entries(config.dds)
          .map(([key, value]) => [key, normalizeArgument(value)])
          .filter(([, value]) => Boolean(value))
      )
    : undefined;
  const ttlDuration = normalizeArgument(config.ttlDuration);
  if ((!dds || Object.keys(dds).length === 0) && !ttlDuration) return undefined;
  return {
    ...(dds && Object.keys(dds).length > 0 ? { dds } : {}),
    ...(ttlDuration ? { ttlDuration } : {})
  };
};

const normalizeModule = (module: SequenceModule): SequenceModule => {
  const normalized = {
    ...module,
    channel: migrateModuleChannel(module),
    locked: Boolean(module.locked),
    argumentConfig: normalizeArgumentConfig(module.argumentConfig),
    timeUnit: normalizeTimeUnit(module.timeUnit) ?? "ms"
  };

  if (normalized.type === "ttl_output") {
    return {
      ...normalized,
      ttlDurationSweep: normalizeConstraintSweep(normalized.ttlDurationSweep ?? defaultSweep(normalized.durationMs), normalized.durationMs)
    };
  }

  if (normalized.type !== "dds") return normalized;

  const ddsParameters = normalizeDdsParameters(normalized);
  return {
    ...normalized,
    ddsParameters,
    frequencyMHz: ddsParameters.frequency.value,
    amplitude: ddsParameters.amplitude.value,
    phaseDeg: ddsParameters.phase.value,
    phaseMode: normalizePhaseMode(normalized.phaseMode),
    attenuationDb: typeof normalized.attenuationDb === "number" && Number.isFinite(normalized.attenuationDb)
      ? normalized.attenuationDb
      : defaultDdsAttenuationDb,
    durationMs: ddsParameters.duration.value
  };
};

const normalizeGapAfterPrevious = (modules: SequenceState["modules"]) => {
  const normalized = modules.map((module) => ({ ...module }));
  const byChannel = new Map<string, typeof normalized>();

  normalized.forEach((module) => {
    byChannel.set(module.channel, [...(byChannel.get(module.channel) ?? []), module]);
  });

  byChannel.forEach((channelModules) => {
    const ordered = [...channelModules].sort((a, b) => a.startMs - b.startMs);
    ordered.forEach((module, index) => {
      const previous = ordered[index - 1];
      const previousEnd = previous ? endMs(previous) : 0;
      const gap = module.gapAfterPrevious ?? module.startMs - previousEnd;
      module.gapAfterPrevious = Math.max(0, Math.abs(gap) < 1e-9 ? 0 : gap);
    });
  });

  return normalized;
};

export const normalizeSequenceState = (state: SequenceState, defaults: SequenceState): SequenceState => {
  const modules = normalizeGapAfterPrevious(
    (state.modules ?? []).map((module) => normalizeModule(module))
  );
  const visibleChannelIds = [
    ...(state.visibleChannelIds ?? defaults.visibleChannelIds).filter((id) => availableChannelIds.has(id)),
    ...modules.map((module) => module.channel).filter((id) => availableChannelIds.has(id))
  ];

  return {
    ...defaults,
    ...state,
    fetchBatchSize:
      typeof state.fetchBatchSize === "number" &&
      Number.isInteger(state.fetchBatchSize) &&
      state.fetchBatchSize >= 1 &&
      state.fetchBatchSize <= 100
        ? state.fetchBatchSize
        : defaults.fetchBatchSize,
    startSlackMs:
      typeof state.startSlackMs === "number" && Number.isFinite(state.startSlackMs)
        ? Math.max(0, state.startSlackMs)
        : defaults.startSlackMs ?? 0,
    startSlackUnit: normalizeTimeUnit(state.startSlackUnit) ?? normalizeTimeUnit(defaults.startSlackUnit) ?? "ms",
    timelineTimeUnit: normalizeTimeUnit(state.timelineTimeUnit) ?? normalizeTimeUnit(defaults.timelineTimeUnit) ?? "ms",
    loop: {
      count:
        typeof state.loop?.count === "number" && Number.isFinite(state.loop.count)
          ? Math.max(1, Math.round(state.loop.count))
          : defaults.loop.count,
      interLoopDelayMs:
        typeof state.loop?.interLoopDelayMs === "number" && Number.isFinite(state.loop.interLoopDelayMs)
          ? Math.max(0, state.loop.interLoopDelayMs)
          : defaults.loop.interLoopDelayMs,
      interLoopDelayUnit: normalizeTimeUnit(state.loop?.interLoopDelayUnit) ?? "ms"
    },
    availableChannels,
    visibleChannelIds: visibleChannelIds.length ? [...new Set(visibleChannelIds)] : defaults.visibleChannelIds,
    pixelsPerMs: defaults.pixelsPerMs,
    snapGridMs: defaults.snapGridMs,
    modules
  };
};

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown) => {
  window.localStorage.setItem(key, JSON.stringify(value));
};

export const makeExperimentTab = (state: SequenceState, isDirty = false): ExperimentTab => ({
  id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  state,
  isDirty
});

export const loadOpenTabs = (defaultState: SequenceState): ExperimentTab[] => {
  const savedTabs = readJson<ExperimentTab[]>(openExperimentTabsKey);
  if (savedTabs?.length) {
    return savedTabs.map((tab) => ({
      ...tab,
      isDirty: typeof tab.isDirty === "boolean" ? tab.isDirty : true,
      state: normalizeSequenceState(tab.state, defaultState)
    }));
  }

  const legacyState = readJson<SequenceState>(legacySavedExperimentKey);
  return [makeExperimentTab(normalizeSequenceState(legacyState ?? defaultState, defaultState), true)];
};

export const saveOpenTabs = (tabs: ExperimentTab[]) => {
  writeJson(openExperimentTabsKey, tabs);
};

export const loadSavedExperiments = (defaultState: SequenceState): SavedExperimentRecord[] => {
  const records = readJson<SavedExperimentRecord[]>(savedExperimentLibraryKey) ?? [];
  return records.map((record) => ({
    ...record,
    state: normalizeSequenceState(record.state, defaultState)
  }));
};

export const saveExperimentRecord = (state: SequenceState, existingRecords: SavedExperimentRecord[]) => {
  const savedAt = new Date().toISOString();
  const existingIndex = existingRecords.findIndex((record) => record.state.sequenceName === state.sequenceName);
  const record: SavedExperimentRecord = {
    id: existingIndex >= 0 ? existingRecords[existingIndex].id : `saved-${Date.now()}`,
    savedAt,
    state
  };
  const nextRecords =
    existingIndex >= 0
      ? existingRecords.map((item, index) => (index === existingIndex ? record : item))
      : [...existingRecords, record];

  writeJson(savedExperimentLibraryKey, nextRecords);
  writeJson(legacySavedExperimentKey, state);
  return nextRecords;
};

export const deleteSavedExperimentRecord = (recordId: string, existingRecords: SavedExperimentRecord[]) => {
  const nextRecords = existingRecords.filter((record) => record.id !== recordId);
  writeJson(savedExperimentLibraryKey, nextRecords);
  return nextRecords;
};
