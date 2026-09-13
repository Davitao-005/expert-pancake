import type { SequenceModule } from "./types";

const overlaps = (a: SequenceModule, b: SequenceModule) =>
  a.startMs < b.startMs + b.durationMs && b.startMs < a.startMs + a.durationMs;

export function findSameChannelOverlap(
  candidateModule: SequenceModule,
  existingModules: SequenceModule[],
  ignoreModuleId = candidateModule.id
) {
  if (!candidateModule.channel || candidateModule.startMs < 0 || candidateModule.durationMs <= 0) {
    return undefined;
  }

  return existingModules.find(
    (module) =>
      module.id !== ignoreModuleId &&
      module.channel === candidateModule.channel &&
      overlaps(candidateModule, module)
  );
}
