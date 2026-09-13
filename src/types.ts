export type ChannelType = "dds" | "ttl_output" | "ttl_input" | "ttl_counter";
export type TimeUnit = "s" | "ms" | "us";

export type ModuleType = "dds" | "measure" | "ttl_output";

export type ChannelConfig = {
  id: string;
  label: string;
  type: ChannelType;
};

export type LoopConfig = {
  count: number;
  interLoopDelayMs: number;
  interLoopDelayUnit: TimeUnit;
};

export type SweepField = "start" | "end" | "points" | "step";

export type SweepConfig = {
  enabled: boolean;
  start: number;
  end: number;
  step: number;
  points: number;
  invalid?: boolean;
  error?: string;
  lastEditedFields?: SweepField[];
};

export type DdsParameter<Unit extends string> = {
  value: number;
  unit: Unit;
  sweep: SweepConfig;
};

export type DdsSweepParameters = {
  frequency: DdsParameter<"MHz">;
  amplitude: DdsParameter<"">;
  phase: DdsParameter<"deg">;
  duration: DdsParameter<"ms">;
};

export type DdsParameterKey = keyof DdsSweepParameters;

export type PhaseMode = "absolute" | "tracking" | "continuous";

export type ArgumentConfig = {
  enabled: boolean;
  name: string;
};

export type DdsArgumentKey = DdsParameterKey | "attenuation";

export type ModuleArgumentConfig = {
  dds?: Partial<Record<DdsArgumentKey, ArgumentConfig>>;
  ttlDuration?: ArgumentConfig;
};

export type SequenceModule = {
  id: string;
  type: ModuleType;
  name: string;
  channel: string;
  startMs: number;
  durationMs: number;
  gapAfterPrevious: number;
  locked: boolean;
  frequencyMHz?: number;
  amplitude?: number;
  phaseDeg?: number;
  phaseMode?: PhaseMode;
  attenuationDb?: number;
  ddsParameters?: DdsSweepParameters;
  ttlDurationSweep?: SweepConfig;
  argumentConfig?: ModuleArgumentConfig;
  timeUnit: TimeUnit;
  laserPreset?: string;
  edge?: "rising" | "falling" | "both";
  datasetName?: string;
};

export type SequenceState = {
  sequenceName: string;
  className: string;
  fetchBatchSize: number;
  startSlackMs: number;
  startSlackUnit: TimeUnit;
  timelineTimeUnit?: TimeUnit | null;
  pixelsPerMs: number;
  snapGridMs: number;
  loop: LoopConfig;
  availableChannels: ChannelConfig[];
  visibleChannelIds: string[];
  modules: SequenceModule[];
};

export type ExperimentTab = {
  id: string;
  state: SequenceState;
  isDirty: boolean;
};

export type SavedExperimentRecord = {
  id: string;
  savedAt: string;
  state: SequenceState;
};

export type SavedModulePackageParams = {
  ddsParameters?: DdsSweepParameters;
  frequencyMHz?: number;
  amplitude?: number;
  phaseDeg?: number;
  phaseMode?: PhaseMode;
  attenuationDb?: number;
  ttlDurationSweep?: SweepConfig;
  laserPreset?: string;
  edge?: "rising" | "falling" | "both";
  datasetName?: string;
};

export type ParameterPackageCategory = "ddsSignal" | "ttlCounterMeasure" | "ttlPulse";

export type SavedModulePackage = {
  id: string;
  name: string;
  category: ParameterPackageCategory;
  type: ModuleType;
  durationMs: number;
  params: SavedModulePackageParams;
  metadata: {
    createdAt: string;
    updatedAt: string;
  };
};

export type ParameterPackageSchema = {
  schemaVersion: 1;
  packages: {
    ddsSignals: SavedModulePackage[];
    ttlCounterMeasures: SavedModulePackage[];
    ttlPulses: SavedModulePackage[];
  };
};

export type SignalManifestEntry = {
  moduleId: string;
  moduleName: string;
  channel: string;
  physicalName: string;
  startMs: number;
  durationMs: number;
  endMs: number;
  frequencyMHz: number;
  amplitude: number;
  phaseDeg?: number;
  phaseMode?: PhaseMode;
  attenuationDb?: number;
  laserPreset?: string;
};

export type SignalManifest = {
  sequenceName: string;
  generatedAt: string;
  ddsSignals: SignalManifestEntry[];
};

export type PlotPackage = {
  id: string;
  name: string;
  type: "plot_xy";
  x: string;
  y: string;
  group: string;
  enabled: boolean;
};
