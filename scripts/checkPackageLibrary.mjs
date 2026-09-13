import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const outDir = "/private/tmp/artiq-sequence-builder-package-test";

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
    "--resolveJsonModule",
    "true",
    "--esModuleInterop",
    "true",
    "--strict",
    "true",
    "--noEmit",
    "false",
    "--skipLibCheck",
    "src/packageStorage.ts"
  ],
  { stdio: "pipe" }
);

const storage = new Map();
global.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  }
};

const {
  deleteSavedPackage,
  exportParameterPackageLibrary,
  getPackagesByCategory,
  isBuiltInPackage,
  loadDefaultPackageSchema,
  loadSavedPackages,
  loadUserPackages,
  packageCategoryDefinitions,
  parameterPackagesStorageKey,
  savePackageFromModule
} = await import(pathToFileURL(`${outDir}/packageStorage.js`).href);

const defaultSchema = loadDefaultPackageSchema();
assert.equal(defaultSchema.schemaVersion, 1);
assert.deepEqual(Object.keys(defaultSchema.packages).sort(), ["ddsSignals", "ttlCounterMeasures", "ttlPulses"].sort());
assert.equal(packageCategoryDefinitions.length, 3);
assert.deepEqual(packageCategoryDefinitions.map((item) => item.category), ["ddsSignal", "ttlCounterMeasure", "ttlPulse"]);
assert.equal(loadSavedPackages().length, 0);
assert.equal(storage.has(parameterPackagesStorageKey), false);

const ddsModule = {
  id: "dds-1",
  type: "dds",
  name: "Cooling package",
  channel: "urukul0_ch0",
  startMs: 0,
  durationMs: 5,
  gapAfterPrevious: 0,
  locked: false,
  frequencyMHz: 80,
  amplitude: 0.5,
  phaseDeg: 0,
  phaseMode: "absolute",
  attenuationDb: 10,
  timeUnit: "ms",
  ddsParameters: {
    frequency: { value: 80, unit: "MHz", sweep: { enabled: false, start: 80, end: 80, step: 0, points: 1 } },
    amplitude: { value: 0.5, unit: "", sweep: { enabled: false, start: 0.5, end: 0.5, step: 0, points: 1 } },
    phase: { value: 0, unit: "deg", sweep: { enabled: false, start: 0, end: 0, step: 0, points: 1 } },
    duration: { value: 5, unit: "ms", sweep: { enabled: false, start: 5, end: 5, step: 0, points: 1 } }
  }
};

const counterModule = {
  id: "measure-1",
  type: "measure",
  name: "PMT package",
  channel: "ttl8_counter",
  startMs: 0,
  durationMs: 2,
  gapAfterPrevious: 0,
  locked: false,
  timeUnit: "ms",
  edge: "rising",
  datasetName: "pmt_counts"
};

const ttlModule = {
  id: "ttl-1",
  type: "ttl_output",
  name: "TTL package",
  channel: "ttl0",
  startMs: 0,
  durationMs: 1,
  gapAfterPrevious: 0,
  locked: false,
  timeUnit: "ms",
  ttlDurationSweep: { enabled: true, start: 1, end: 3, step: 1, points: 3 }
};

assert.throws(
  () => savePackageFromModule({ ...ttlModule, name: "   " }, loadSavedPackages()),
  /Package name cannot be empty/
);

let packages = savePackageFromModule(ddsModule, loadSavedPackages());
const legacyDdsPackages = savePackageFromModule(
  {
    ...ddsModule,
    id: "dds-without-dds-parameters",
    name: "DDS without ddsParameters",
    ddsParameters: undefined
  },
  packages
);
const legacyDdsPackage = legacyDdsPackages.find((item) => item.name === "DDS without ddsParameters");
assert.equal(legacyDdsPackage.params.ddsParameters.frequency.value, 80);
packages = deleteSavedPackage(legacyDdsPackage.id, legacyDdsPackages);
packages = savePackageFromModule(counterModule, packages);
packages = savePackageFromModule(ttlModule, packages);

assert.throws(
  () => savePackageFromModule({ ...ddsModule, id: "dds-duplicate", name: "Cooling package" }, packages),
  /DDS Signal package name already exists/
);
assert.throws(
  () => savePackageFromModule({ ...ddsModule, id: "dds-duplicate-case", name: "cooling PACKAGE" }, packages),
  /DDS Signal package name already exists/
);

const sameNameDifferentCategory = savePackageFromModule({ ...ttlModule, id: "ttl-same-name", name: "Cooling package" }, packages);
assert.equal(getPackagesByCategory(sameNameDifferentCategory, "ttlPulse").some((item) => item.name === "Cooling package"), true);
packages = deleteSavedPackage(
  sameNameDifferentCategory.find((item) => item.category === "ttlPulse" && item.name === "Cooling package").id,
  sameNameDifferentCategory
);

assert.equal(packages.length, 3);
assert.equal(loadUserPackages().length, 3);
assert.equal(getPackagesByCategory(packages, "ddsSignal").length, 1);
assert.equal(getPackagesByCategory(packages, "ttlCounterMeasure").length, 1);
assert.equal(getPackagesByCategory(packages, "ttlPulse").length, 1);
assert.equal(packages.some(isBuiltInPackage), false);
assert.equal(storage.has(parameterPackagesStorageKey), true);

const storedSchema = JSON.parse(storage.get(parameterPackagesStorageKey));
assert.equal(storedSchema.schemaVersion, 1);
assert.equal(storedSchema.packages.ddsSignals.length, 1);
assert.equal(storedSchema.packages.ttlCounterMeasures.length, 1);
assert.equal(storedSchema.packages.ttlPulses.length, 1);

const exported = JSON.parse(exportParameterPackageLibrary());
assert.equal(exported.schemaVersion, 1);
assert.equal(exported.packages.ddsSignals.length, 1);
assert.equal(exported.packages.ttlCounterMeasures.length, 1);
assert.equal(exported.packages.ttlPulses.length, 1);
assert.equal(JSON.stringify(exported).includes("source"), false);
assert.equal(JSON.stringify(exported).includes("isBuiltIn"), false);
assert.equal(JSON.stringify(exported).includes("selectedPackageIds"), false);
assert.equal(JSON.stringify(exported).includes("draftModule"), false);

const remaining = deleteSavedPackage(packages[0].id, packages);
assert.equal(remaining.length, 2);
assert.equal(loadUserPackages().length, 2);
assert.equal(JSON.parse(storage.get(parameterPackagesStorageKey)).packages.ddsSignals.length, 0);

const persistedAfterReload = loadUserPackages();
assert.equal(persistedAfterReload.length, 2);
deleteSavedPackage(packages[1].id, persistedAfterReload);
assert.equal(loadUserPackages().some((item) => item.id === packages[1].id), false);

storage.set(parameterPackagesStorageKey, "{malformed json");
assert.deepEqual(loadUserPackages(), []);
assert.equal(loadDefaultPackageSchema().schemaVersion, 1);

storage.set(parameterPackagesStorageKey, JSON.stringify({
  schemaVersion: 1,
  packages: {
    ddsSignals: [
      { ...packages[0], id: "duplicate-id", name: "One" },
      { ...packages[0], id: "duplicate-id", name: "Two" }
    ],
    ttlCounterMeasures: [],
    ttlPulses: []
  }
}));
assert.deepEqual(loadUserPackages(), []);

storage.set(parameterPackagesStorageKey, JSON.stringify({
  schemaVersion: 1,
  packages: {
    ddsSignals: [{ ...packages[0], category: "ttlPulse" }],
    ttlCounterMeasures: [],
    ttlPulses: []
  }
}));
assert.deepEqual(loadUserPackages(), []);

storage.set(parameterPackagesStorageKey, JSON.stringify({
  schemaVersion: 1,
  packages: {
    ddsSignals: [{ ...packages[0], params: { ...packages[0].params, attenuationDb: Number.NaN } }],
    ttlCounterMeasures: [],
    ttlPulses: []
  }
}));
assert.deepEqual(loadUserPackages(), []);

const replacement = savePackageFromModule({ ...ttlModule, id: "ttl-replacement", name: "Replacement package" }, []);
assert.equal(replacement.length, 1);
assert.equal(JSON.parse(storage.get(parameterPackagesStorageKey)).packages.ttlPulses.length, 1);

console.log("Package library checks passed.");
