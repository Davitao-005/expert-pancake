import type { SignalManifest, SignalManifestEntry, SequenceState } from "./types";

const endMs = (startMs: number, durationMs: number) => Number((startMs + durationMs).toFixed(6));

export function generateSignalManifest(state: SequenceState): SignalManifest {
  const ddsSignals: SignalManifestEntry[] = state.modules
    .filter((module) => module.type === "dds")
    .map((module) => ({
      moduleId: module.id,
      moduleName: module.name,
      channel: module.channel,
      physicalName: module.laserPreset?.trim() || module.name || module.channel,
      startMs: module.startMs,
      durationMs: module.durationMs,
      endMs: endMs(module.startMs, module.durationMs),
      frequencyMHz: module.frequencyMHz ?? 0,
      amplitude: module.amplitude ?? 0,
      phaseDeg: module.phaseDeg,
      phaseMode: module.phaseMode,
      attenuationDb: module.attenuationDb,
      laserPreset: module.laserPreset
    }));

  return {
    sequenceName: state.sequenceName,
    generatedAt: new Date().toISOString(),
    ddsSignals
  };
}
