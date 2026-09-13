import type { PlotPackage, SequenceModule } from "./types";

export type AvailablePlotDatasets = {
  x: string[];
  y: string[];
  pairs: Array<{ x: string; y: string }>;
};

export type AppletCommandSpec = {
  name: string;
  group: string;
  command: string;
  args: string[];
};

export const defaultPlotDatasetPrefix = "measurement";

export function sanitizeDatasetName(name: string) {
  return (
    name
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "counts"
  );
}

export function measurementDatasetBase(module: SequenceModule, prefix = defaultPlotDatasetPrefix) {
  return `${sanitizeDatasetName(prefix)}.${sanitizeDatasetName(module.channel)}`;
}

export function getAvailablePlotDatasets(
  inputCountingBlocks: SequenceModule[],
  prefix = defaultPlotDatasetPrefix,
  hasSweep = false,
  hasRepeatedSweepPoints = false
): AvailablePlotDatasets {
  const bases = [
    ...new Set(
      inputCountingBlocks
        .filter((module) => module.type === "measure")
        .map((module) => measurementDatasetBase(module, prefix))
    )
  ];
  const pairs = hasSweep
    ? [
        ...bases.flatMap((base) => [
          { x: "scan_index", y: `${base}.average_counts` },
          { x: "scan_index", y: `${base}.average_count_rate` }
        ]),
        ...(hasRepeatedSweepPoints
          ? bases.flatMap((base) => [
              { x: "shot_index", y: `${base}.raw_counts` },
              { x: "shot_index", y: `${base}.raw_count_rate` }
            ])
          : [])
      ]
    : bases.flatMap((base) => [
        { x: "shot_index", y: `${base}.counts` },
        { x: "shot_index", y: `${base}.count_rate` }
      ]);

  return {
    x: [...new Set(pairs.map((pair) => pair.x))],
    y: [...new Set(pairs.map((pair) => pair.y))],
    pairs
  };
}

export function isPlotValid(plot: PlotPackage, availableDatasets: AvailablePlotDatasets) {
  return availableDatasets.pairs.some((pair) => pair.x === plot.x && pair.y === plot.y);
}

export function getCompatiblePlotYDatasets(x: string, availableDatasets: AvailablePlotDatasets) {
  return [...new Set(availableDatasets.pairs.filter((pair) => pair.x === x).map((pair) => pair.y))];
}

export function getAppletCommandSpecs(selectedPlots: PlotPackage[], availableDatasets: AvailablePlotDatasets): AppletCommandSpec[] {
  const seenCommands = new Set<string>();
  const usedNames = new Set<string>();
  const specs: AppletCommandSpec[] = [];

  selectedPlots
    .filter((plot) => plot.enabled && isPlotValid(plot, availableDatasets))
    .forEach((plot) => {
      const args = ["artiq_applet", "plot_xy", plot.y, "--x", plot.x];
      const commandKey = args.join("\u0000");
      if (seenCommands.has(commandKey)) return;
      seenCommands.add(commandKey);

      const group = plot.group.trim();
      const baseName = plot.name.trim() || `plot_${specs.length + 1}`;
      let name = baseName;
      let suffix = 2;
      while (usedNames.has(`${group}\u0000${name}`)) {
        name = `${baseName} (${suffix})`;
        suffix += 1;
      }
      usedNames.add(`${group}\u0000${name}`);

      specs.push({
        name,
        group,
        command: `\${artiq_applet}plot_xy ${plot.y} --x ${plot.x}`,
        args
      });
    });

  return specs;
}

export function generateAppletCommands(selectedPlots: PlotPackage[], availableDatasets: AvailablePlotDatasets) {
  return [
    ...new Set(getAppletCommandSpecs(selectedPlots, availableDatasets).map((spec) => spec.command))
  ];
}
