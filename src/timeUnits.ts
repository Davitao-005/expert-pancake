import type { SequenceModule, TimeUnit } from "./types";

export const timeUnitOptions: TimeUnit[] = ["s", "ms", "us"];
export const canonicalTimeUnit: TimeUnit = "ms";

export function normalizeTimeUnit(unit: unknown): TimeUnit | null {
  if (unit === "s" || unit === "ms" || unit === "us" || unit === "mus") {
    return unit === "mus" ? "us" : unit;
  }
  return null;
}

export function getTimeUnitFactor(unit: unknown) {
  const normalized = normalizeTimeUnit(unit) ?? canonicalTimeUnit;
  if (normalized === "s") return 1000;
  if (normalized === "us") return 0.001;
  return 1;
}

export function toCanonicalTime(value: number, unit: unknown) {
  return value * getTimeUnitFactor(unit);
}

export function fromCanonicalTime(canonicalValue: number, unit: unknown) {
  return canonicalValue / getTimeUnitFactor(unit);
}

export function resolveTaskTimeUnit(module: SequenceModule): TimeUnit {
  return normalizeTimeUnit(module.timeUnit) ?? canonicalTimeUnit;
}

export function resolveTimelineTimeUnit(timelineTimeUnit: unknown): TimeUnit {
  return normalizeTimeUnit(timelineTimeUnit) ?? canonicalTimeUnit;
}

export function formatTimeForUnit(canonicalValue: number, unit: unknown) {
  const value = fromCanonicalTime(canonicalValue, unit);
  if (!Number.isFinite(value)) return "";
  const cleaned = Math.abs(value) < 1e-12 ? 0 : value;
  return Number(cleaned.toFixed(6)).toString();
}
