import { normalizeSequenceState } from "./experimentStorage";
import type { PlotPackage, SequenceModule, SequenceState } from "./types";

export const metadataStartMarker = "# --- SEQUENCE_BUILDER_METADATA_START ---";
export const metadataEndMarker = "# --- SEQUENCE_BUILDER_METADATA_END ---";

export type SequenceBuilderImportMetadata = {
  schemaVersion: number;
  format?: string;
  experiment?: {
    fileName?: string;
    sequenceName?: string;
    className?: string;
    repetitionCount?: number;
    fetchBatchSize?: number;
    startSlackMs?: number;
    startSlackUnit?: string;
  };
  editorState?: SequenceState;
  plots?: PlotPackage[];
};

export type MetadataValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export type ParsedSequenceBuilderImport = {
  metadata: SequenceBuilderImportMetadata;
  state: SequenceState;
  plots: PlotPackage[];
};

export const missingMetadataError =
  "This Python file does not contain Sequence Builder metadata. Only Python files exported by this app can be imported.";

export const parseMetadataError =
  "Sequence Builder metadata was found, but it could not be parsed as valid JSON.";

export const incompatibleMetadataError =
  "Sequence Builder metadata was found, but it is incompatible with the current editor version.";

export function extractSequenceBuilderMetadataBlock(fileText: string): string | null {
  const startIndex = fileText.indexOf(metadataStartMarker);
  const endIndex = fileText.indexOf(metadataEndMarker);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) return null;
  return fileText.slice(startIndex + metadataStartMarker.length, endIndex).trim();
}

export function cleanPythonCommentedJson(commentedText: string): string {
  return commentedText
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*# ?/, ""))
    .join("\n")
    .trim();
}

export function parseSequenceBuilderMetadata(fileText: string): SequenceBuilderImportMetadata {
  const block = extractSequenceBuilderMetadataBlock(fileText);
  if (!block) {
    throw new Error(missingMetadataError);
  }

  try {
    return JSON.parse(cleanPythonCommentedJson(block)) as SequenceBuilderImportMetadata;
  } catch {
    throw new Error(parseMetadataError);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidTask = (task: unknown): task is SequenceModule => {
  if (!isRecord(task)) return false;
  return (
    typeof task.id === "string" &&
    typeof task.type === "string" &&
    typeof task.channel === "string" &&
    typeof task.startMs === "number" &&
    Number.isFinite(task.startMs) &&
    typeof task.durationMs === "number" &&
    Number.isFinite(task.durationMs)
  );
};

const isValidPlot = (plot: unknown): plot is PlotPackage => {
  if (!isRecord(plot)) return false;
  return (
    typeof plot.id === "string" &&
    typeof plot.name === "string" &&
    plot.type === "plot_xy" &&
    typeof plot.x === "string" &&
    typeof plot.y === "string" &&
    typeof plot.group === "string" &&
    typeof plot.enabled === "boolean"
  );
};

export function validateSequenceBuilderMetadata(metadata: unknown): MetadataValidationResult {
  if (!isRecord(metadata)) {
    return { ok: false, error: incompatibleMetadataError };
  }
  if (typeof metadata.schemaVersion !== "number") {
    return { ok: false, error: incompatibleMetadataError };
  }
  if ("format" in metadata && metadata.format !== "ARTIQ Sequence Builder") {
    return { ok: false, error: incompatibleMetadataError };
  }
  if (!isRecord(metadata.editorState)) {
    return { ok: false, error: incompatibleMetadataError };
  }
  if (
    typeof metadata.editorState.fetchBatchSize !== "number" ||
    !Number.isInteger(metadata.editorState.fetchBatchSize) ||
    metadata.editorState.fetchBatchSize < 1 ||
    metadata.editorState.fetchBatchSize > 100
  ) {
    return { ok: false, error: incompatibleMetadataError };
  }
  if (
    "startSlackMs" in metadata.editorState &&
    (typeof metadata.editorState.startSlackMs !== "number" ||
      !Number.isFinite(metadata.editorState.startSlackMs) ||
      metadata.editorState.startSlackMs < 0)
  ) {
    return { ok: false, error: incompatibleMetadataError };
  }
  if (!Array.isArray(metadata.editorState.modules)) {
    return { ok: false, error: incompatibleMetadataError };
  }
  if (!metadata.editorState.modules.every(isValidTask)) {
    return { ok: false, error: incompatibleMetadataError };
  }
  if ("plots" in metadata && (!Array.isArray(metadata.plots) || !metadata.plots.every(isValidPlot))) {
    return { ok: false, error: incompatibleMetadataError };
  }
  return { ok: true };
}

export function applySequenceBuilderMetadataToEditor(
  metadata: SequenceBuilderImportMetadata,
  defaults: SequenceState
): ParsedSequenceBuilderImport {
  const validation = validateSequenceBuilderMetadata(metadata);
  if (validation.ok === false) {
    throw new Error(validation.error);
  }

  const importedState = normalizeSequenceState(metadata.editorState as SequenceState, defaults);
  const importedPlots = (metadata.plots ?? []).map((plot) => {
    if (plot.x !== "scan_index") return plot;
    if (plot.y.endsWith(".counts") && !plot.y.endsWith(".raw_counts") && !plot.y.endsWith(".average_counts")) {
      return { ...plot, y: plot.y.replace(/\.counts$/, ".average_counts") };
    }
    if (plot.y.endsWith(".count_rate") && !plot.y.endsWith(".raw_count_rate") && !plot.y.endsWith(".average_count_rate")) {
      return { ...plot, y: plot.y.replace(/\.count_rate$/, ".average_count_rate") };
    }
    return plot;
  });
  return {
    metadata,
    state: importedState,
    plots: importedPlots
  };
}

export function parseSequenceBuilderPythonImport(fileText: string, defaults: SequenceState): ParsedSequenceBuilderImport {
  const metadata = parseSequenceBuilderMetadata(fileText);
  return applySequenceBuilderMetadataToEditor(metadata, defaults);
}
