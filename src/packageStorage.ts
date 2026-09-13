import defaultParameterPackages from "./data/default_parameter_packages.json";
import type {
  DdsSweepParameters,
  DdsParameterKey,
  ModuleType,
  ParameterPackageCategory,
  ParameterPackageSchema,
  PhaseMode,
  SavedModulePackage,
  SavedModulePackageParams,
  SequenceModule
} from "./types";

export const parameterPackagesStorageKey = "artiq-sequence-builder.parameter-packages.v1";

const schemaVersion = 1 as const;
const defaultDdsAttenuationDb = 10;
const defaultPhaseMode: PhaseMode = "absolute";
const ddsParameterKeys: DdsParameterKey[] = ["frequency", "amplitude", "phase", "duration"];
const expectedDdsUnits: Record<DdsParameterKey, string> = {
  frequency: "MHz",
  amplitude: "",
  phase: "deg",
  duration: "ms"
};
const supportedPhaseModes: PhaseMode[] = ["absolute", "tracking", "continuous"];
const supportedEdges = ["rising", "falling", "both"];

export const packageCategoryDefinitions: Array<{ category: ParameterPackageCategory; title: string; moduleType: ModuleType }> = [
  { category: "ddsSignal", title: "DDS Signal", moduleType: "dds" },
  { category: "ttlCounterMeasure", title: "TTL Counter / Measure", moduleType: "measure" },
  { category: "ttlPulse", title: "TTL Pulses", moduleType: "ttl_output" }
];

const emptyPackageSchema = (): ParameterPackageSchema => ({
  schemaVersion,
  packages: {
    ddsSignals: [],
    ttlCounterMeasures: [],
    ttlPulses: []
  }
});

const categoryForModuleType = (type: ModuleType): ParameterPackageCategory => {
  if (type === "dds") return "ddsSignal";
  if (type === "measure") return "ttlCounterMeasure";
  return "ttlPulse";
};

const packageArrayKeyForCategory = (category: ParameterPackageCategory): keyof ParameterPackageSchema["packages"] => {
  if (category === "ddsSignal") return "ddsSignals";
  if (category === "ttlCounterMeasure") return "ttlCounterMeasures";
  return "ttlPulses";
};

const moduleTypeForCategory = (category: ParameterPackageCategory): ModuleType => {
  if (category === "ddsSignal") return "dds";
  if (category === "ttlCounterMeasure") return "measure";
  return "ttl_output";
};

const categoryDefinitionFor = (category: ParameterPackageCategory) =>
  packageCategoryDefinitions.find((definition) => definition.category === category);

const clonePackage = (modulePackage: SavedModulePackage): SavedModulePackage =>
  JSON.parse(JSON.stringify(modulePackage)) as SavedModulePackage;

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const defaultSweep = (value: number) => ({
  enabled: false,
  start: value,
  end: value,
  step: 0,
  points: 1,
  invalid: false,
  error: "",
  lastEditedFields: []
});

const ddsParametersFromModule = (module: SequenceModule): DdsSweepParameters => {
  if (module.ddsParameters) return cloneJson(module.ddsParameters);
  const frequency = module.frequencyMHz ?? 80;
  const amplitude = module.amplitude ?? 0.5;
  const phase = module.phaseDeg ?? 0;
  const duration = module.durationMs;
  return {
    frequency: { value: frequency, unit: "MHz", sweep: defaultSweep(frequency) },
    amplitude: { value: amplitude, unit: "", sweep: defaultSweep(amplitude) },
    phase: { value: phase, unit: "deg", sweep: defaultSweep(phase) },
    duration: { value: duration, unit: "ms", sweep: defaultSweep(duration) }
  };
};

const cloneSchema = (schema: ParameterPackageSchema): ParameterPackageSchema => ({
  schemaVersion,
  packages: {
    ddsSignals: schema.packages.ddsSignals.map(clonePackage),
    ttlCounterMeasures: schema.packages.ttlCounterMeasures.map(clonePackage),
    ttlPulses: schema.packages.ttlPulses.map(clonePackage)
  }
});

const packagesFromSchema = (schema: ParameterPackageSchema) => [
  ...schema.packages.ddsSignals,
  ...schema.packages.ttlCounterMeasures,
  ...schema.packages.ttlPulses
];

const packageSchemaFromPackages = (packages: SavedModulePackage[]): ParameterPackageSchema => {
  const schema = emptyPackageSchema();
  packages.forEach((modulePackage) => {
    const key = packageArrayKeyForCategory(modulePackage.category);
    schema.packages[key].push(clonePackage(modulePackage));
  });
  return schema;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const assertSweepConfig = (value: unknown, fallbackLabel: string) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fallbackLabel} sweep is invalid.`);
  }
  const sweep = value as Record<string, unknown>;
  if (
    typeof sweep.enabled !== "boolean" ||
    !isFiniteNumber(sweep.start) ||
    !isFiniteNumber(sweep.end) ||
    !isFiniteNumber(sweep.step) ||
    !isFiniteNumber(sweep.points) ||
    !Number.isInteger(sweep.points) ||
    sweep.points < 1
  ) {
    throw new Error(`${fallbackLabel} sweep is invalid.`);
  }
  const start = sweep.start;
  const end = sweep.end;
  const step = sweep.step;
  const points = sweep.points;
  if (points === 1) return;
  const expectedEnd = start + step * (points - 1);
  if (!nearlyEqual(expectedEnd, end)) {
    throw new Error(`${fallbackLabel} sweep values are inconsistent.`);
  }
};

const assertDdsParameters = (params: SavedModulePackageParams) => {
  if (!params.ddsParameters) {
    throw new Error("DDS package is missing DDS parameters.");
  }

  ddsParameterKeys.forEach((key) => {
    const parameter = params.ddsParameters?.[key];
    if (!parameter || !isFiniteNumber(parameter.value) || parameter.unit !== expectedDdsUnits[key]) {
      throw new Error(`DDS ${key} parameter is invalid.`);
    }
    assertSweepConfig(parameter.sweep, `DDS ${key}`);
  });

  if (!supportedPhaseModes.includes(params.phaseMode ?? defaultPhaseMode)) {
    throw new Error("DDS phase mode is invalid.");
  }
  if (!isFiniteNumber(params.attenuationDb)) {
    throw new Error("DDS attenuation is invalid.");
  }
};

const assertPackagePayload = (modulePackage: SavedModulePackage) => {
  if (!isFiniteNumber(modulePackage.durationMs) || modulePackage.durationMs <= 0) {
    throw new Error("Package duration is invalid.");
  }

  if (modulePackage.category === "ddsSignal") {
    assertDdsParameters(modulePackage.params);
    return;
  }

  if (modulePackage.category === "ttlCounterMeasure") {
    if (!supportedEdges.includes(modulePackage.params.edge ?? "")) {
      throw new Error("TTL counter edge is invalid.");
    }
    if (typeof modulePackage.params.datasetName !== "string" || modulePackage.params.datasetName.trim() === "") {
      throw new Error("TTL counter dataset name is invalid.");
    }
    return;
  }

  if (modulePackage.category === "ttlPulse" && modulePackage.params.ttlDurationSweep) {
    assertSweepConfig(modulePackage.params.ttlDurationSweep, "TTL pulse duration");
  }
};

const assertPackageShape = (modulePackage: unknown, category: ParameterPackageCategory): SavedModulePackage => {
  if (typeof modulePackage !== "object" || modulePackage === null || Array.isArray(modulePackage)) {
    throw new Error("Invalid package object.");
  }
  const value = modulePackage as Partial<SavedModulePackage>;
  if (
    typeof value.id !== "string" ||
    value.id.trim() === "" ||
    typeof value.name !== "string" ||
    value.name.trim() === "" ||
    value.category !== category ||
    value.type !== moduleTypeForCategory(category) ||
    typeof value.durationMs !== "number" ||
    !Number.isFinite(value.durationMs) ||
    typeof value.params !== "object" ||
    value.params === null ||
    typeof value.metadata !== "object" ||
    value.metadata === null
  ) {
    throw new Error("Invalid package object.");
  }
  const normalized = clonePackage({
    ...(value as SavedModulePackage),
    id: value.id.trim(),
    name: value.name.trim()
  });
  assertPackagePayload(normalized);
  return normalized;
};

const assertUniquePackageIds = (packages: SavedModulePackage[]) => {
  const ids = new Set<string>();
  packages.forEach((modulePackage) => {
    if (ids.has(modulePackage.id)) {
      throw new Error(`Duplicate package id: ${modulePackage.id}`);
    }
    ids.add(modulePackage.id);
  });
};

const assertUniqueNamesByCategory = (packages: SavedModulePackage[]) => {
  packageCategoryDefinitions.forEach((definition) => {
    const names = new Set<string>();
    packages
      .filter((modulePackage) => modulePackage.category === definition.category)
      .forEach((modulePackage) => {
        const key = modulePackage.name.trim().toLowerCase();
        if (names.has(key)) {
          throw new Error(`Duplicate ${definition.title} package name: ${modulePackage.name}`);
        }
        names.add(key);
      });
  });
};

const assertPackageSchema = (value: unknown): ParameterPackageSchema => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid package schema.");
  }
  const schema = value as Partial<ParameterPackageSchema>;
  if (schema.schemaVersion !== schemaVersion || typeof schema.packages !== "object" || schema.packages === null) {
    throw new Error("Invalid package schema.");
  }
  const packages = schema.packages as Partial<ParameterPackageSchema["packages"]>;
  if (!Array.isArray(packages.ddsSignals) || !Array.isArray(packages.ttlCounterMeasures) || !Array.isArray(packages.ttlPulses)) {
    throw new Error("Invalid package schema.");
  }
  const normalized: ParameterPackageSchema = {
    schemaVersion,
    packages: {
      ddsSignals: packages.ddsSignals.map((item) => assertPackageShape(item, "ddsSignal")),
      ttlCounterMeasures: packages.ttlCounterMeasures.map((item) => assertPackageShape(item, "ttlCounterMeasure")),
      ttlPulses: packages.ttlPulses.map((item) => assertPackageShape(item, "ttlPulse"))
    }
  };
  const allPackages = packagesFromSchema(normalized);
  assertUniquePackageIds(allPackages);
  assertUniqueNamesByCategory(allPackages);
  return normalized;
};

const packageId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `package-${crypto.randomUUID()}`
    : `package-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const validateNewPackageName = (baseName: string, packages: SavedModulePackage[], category: ParameterPackageCategory) => {
  const cleaned = baseName.trim();
  if (!cleaned) {
    throw new Error("Package name cannot be empty.");
  }
  const normalizedName = cleaned.toLowerCase();
  const duplicate = packages.find(
    (modulePackage) => modulePackage.category === category && modulePackage.name.trim().toLowerCase() === normalizedName
  );
  if (duplicate) {
    const title = categoryDefinitionFor(category)?.title ?? "package";
    throw new Error(`${title} package name already exists: ${cleaned}`);
  }
  return cleaned;
};

const paramsFromModule = (module: SequenceModule): SavedModulePackageParams => {
  if (module.type === "dds") {
    const ddsParameters = ddsParametersFromModule(module);
    return {
      ddsParameters,
      frequencyMHz: ddsParameters.frequency.value,
      amplitude: ddsParameters.amplitude.value,
      phaseDeg: ddsParameters.phase.value,
      phaseMode: module.phaseMode ?? defaultPhaseMode,
      attenuationDb: module.attenuationDb ?? defaultDdsAttenuationDb,
      laserPreset: module.laserPreset
    };
  }

  if (module.type === "measure") {
    return {
      edge: module.edge,
      datasetName: module.datasetName
    };
  }

  if (module.type === "ttl_output") {
    return {
      ttlDurationSweep: module.ttlDurationSweep
    };
  }

  return {};
};

export const loadDefaultPackageSchema = () => assertPackageSchema(defaultParameterPackages);

export const loadUserPackageSchema = () => {
  try {
    const raw = window.localStorage.getItem(parameterPackagesStorageKey);
    if (!raw) return emptyPackageSchema();
    return assertPackageSchema(JSON.parse(raw));
  } catch (error) {
    console.warn("Saved parameter packages are invalid; using an empty user package library for this session.", error);
    return emptyPackageSchema();
  }
};

const saveUserPackageSchema = (schema: ParameterPackageSchema) => {
  window.localStorage.setItem(parameterPackagesStorageKey, JSON.stringify(assertPackageSchema(cloneSchema(schema))));
};

export const loadDefaultPackages = () => packagesFromSchema(loadDefaultPackageSchema());

export const loadUserPackages = () => packagesFromSchema(loadUserPackageSchema());

export const getCombinedPackageLibrary = () => [
  ...loadDefaultPackages(),
  ...loadUserPackages()
];

export const loadSavedPackages = () => getCombinedPackageLibrary();

export const getPackagesByCategory = (packages: SavedModulePackage[], category: ParameterPackageCategory) =>
  packages.filter((modulePackage) => modulePackage.category === category);

export const isBuiltInPackage = (modulePackage: SavedModulePackage) =>
  loadDefaultPackages().some((builtInPackage) => builtInPackage.id === modulePackage.id);

export const savePackageFromModule = (module: SequenceModule, mergedPackages: SavedModulePackage[]) => {
  const userSchema = loadUserPackageSchema();
  const userPackages = packagesFromSchema(userSchema);
  const now = new Date().toISOString();
  const category = categoryForModuleType(module.type);
  const packageName = validateNewPackageName(module.name, mergedPackages, category);
  const nextPackage: SavedModulePackage = {
    id: packageId(),
    name: packageName,
    category,
    type: module.type,
    durationMs: module.durationMs,
    params: paramsFromModule(module),
    metadata: {
      createdAt: now,
      updatedAt: now
    }
  };
  const nextUserSchema = assertPackageSchema(packageSchemaFromPackages([...userPackages, nextPackage]));
  saveUserPackageSchema(nextUserSchema);
  return [...loadDefaultPackages(), ...packagesFromSchema(nextUserSchema)];
};

export const deleteSavedPackage = (packageIdToDelete: string, _mergedPackages: SavedModulePackage[]) => {
  const builtInIds = new Set(loadDefaultPackages().map((modulePackage) => modulePackage.id));
  if (builtInIds.has(packageIdToDelete)) {
    return getCombinedPackageLibrary();
  }

  const nextUserPackages = loadUserPackages().filter((modulePackage) => modulePackage.id !== packageIdToDelete);
  saveUserPackageSchema(assertPackageSchema(packageSchemaFromPackages(nextUserPackages)));
  return getCombinedPackageLibrary();
};

export const exportParameterPackageLibrary = () => {
  const mergedSchema = assertPackageSchema(packageSchemaFromPackages(getCombinedPackageLibrary()));
  return JSON.stringify(mergedSchema, null, 2);
};

export const downloadParameterPackageLibrary = () => {
  const blob = new Blob([exportParameterPackageLibrary()], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ARTIQ_parameter_packages.json";
  link.click();
  URL.revokeObjectURL(url);
};
