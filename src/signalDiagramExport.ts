import { defaultSignalOutputModel, type SignalOutputModel } from "./signalOutputModel";
import { formatTimeForUnit } from "./timeUnits";
import type { ChannelConfig, SequenceModule, SequenceState, TimeUnit } from "./types";

const colors = {
  dds: "#2f80ed",
  ttl_output: "#f2994a",
  measure: "#27ae60"
};

const sanitizeFilename = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "sequence";

const endMs = (module: SequenceModule) => module.startMs + module.durationMs;

const niceTimeStepMs = (rawStepMs: number) => {
  if (!Number.isFinite(rawStepMs) || rawStepMs <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStepMs));
  const magnitude = 10 ** exponent;
  const normalized = rawStepMs / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
};

const autoDiagramUnit = (sequenceEndMs: number, shortestDurationMs: number): TimeUnit => {
  if (sequenceEndMs >= 1000) return "s";
  if (sequenceEndMs <= 2 || shortestDurationMs < 0.1) return "us";
  return "ms";
};

const fitText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
};

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const valueToY = (value: number, min: number, max: number, top: number, bottom: number) => {
  if (Math.abs(max - min) < 1e-9) return (top + bottom) / 2;
  const ratio = (value - min) / (max - min);
  return bottom - ratio * (bottom - top);
};

const formatCompactNumber = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/\.?0+$/, "");
};

const usedSignalChannels = (state: SequenceState) => {
  const usedChannelIds = new Set(state.modules.map((module) => module.channel));
  return state.availableChannels.filter((channel) => usedChannelIds.has(channel.id));
};

const channelModules = (modules: SequenceModule[], channel: ChannelConfig) =>
  modules
    .filter((module) => module.channel === channel.id)
    .sort((a, b) => a.startMs - b.startMs);

const ddsLabel = (module: SequenceModule) =>
  [
    module.name || "DDS signal",
    module.frequencyMHz !== undefined ? `${module.frequencyMHz} MHz` : "",
    module.amplitude !== undefined ? `amp ${module.amplitude}` : "",
    module.attenuationDb !== undefined ? `att ${module.attenuationDb} dB` : "",
    module.phaseDeg !== undefined ? `phase ${module.phaseDeg} deg` : ""
  ].filter(Boolean).join(" · ");

const ttlLabel = (module: SequenceModule, model: SignalOutputModel) =>
  `${module.name || "TTL pulse"} · ${model.ttlOutput.lowVoltage}-${model.ttlOutput.highVoltage} ${model.ttlOutput.unit}`;

const measureLabel = (module: SequenceModule, model: SignalOutputModel) =>
  [module.name || "Measure TTL", model.measurementGate.label, module.datasetName || ""].filter(Boolean).join(" · ");

const ddsScaleLabel = (model: SignalOutputModel) =>
  model.ddsOutput.mode === "calibrated" && model.ddsOutput.maxVoltageVpp !== undefined
    ? `estimated ${model.ddsOutput.maxVoltageVpp} Vpp`
    : "normalized RF output";

const ddsAmplitudeScale = (module: SequenceModule, model: SignalOutputModel) => {
  const baseAmplitude = Math.max(0, module.amplitude ?? 0);
  const attenuationScale =
    model.ddsOutput.mode === "calibrated" && model.ddsOutput.applyAttenuationDb
      ? 10 ** (-(module.attenuationDb ?? 0) / 20)
      : 1;

  if (model.ddsOutput.mode === "calibrated" && model.ddsOutput.maxVoltageVpp !== undefined) {
    const peakVoltage = model.ddsOutput.maxVoltageVpp / 2;
    return {
      value: baseAmplitude * peakVoltage * attenuationScale,
      max: Math.max(peakVoltage, 0.000001)
    };
  }

  return {
    value: baseAmplitude,
    max: Math.max(model.ddsOutput.normalizedMax, 0.000001)
  };
};

const drawAxis = (
  ctx: CanvasRenderingContext2D,
  leftWidth: number,
  topHeight: number,
  height: number,
  pxPerMs: number,
  tickStepMs: number,
  tickCount: number,
  unit: TimeUnit
) => {
  ctx.fillStyle = "#151a20";
  ctx.fillRect(0, topHeight - 30, ctx.canvas.width, 30);
  ctx.fillStyle = "#12171c";
  ctx.fillRect(0, topHeight - 30, leftWidth, 30);
  ctx.font = "12px Inter, system-ui, sans-serif";

  for (let index = 0; index < tickCount; index += 1) {
    const timeMs = index * tickStepMs;
    const x = leftWidth + timeMs * pxPerMs;
    ctx.strokeStyle = index === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(x, topHeight - 30);
    ctx.lineTo(x, height - 54);
    ctx.stroke();
    ctx.fillStyle = "#9caab4";
    ctx.fillText(`${formatTimeForUnit(timeMs, unit)} ${unit}`, x + 4, topHeight - 10);
  }
};

export function exportSignalDiagram(state: SequenceState, model: SignalOutputModel = defaultSignalOutputModel) {
  const channels = usedSignalChannels(state);
  const modules = [...state.modules].sort((a, b) => a.startMs - b.startMs);
  const usedEndMs = Math.max(0, ...modules.map(endMs));
  const baseDurationMs = Math.max(usedEndMs, 0.001);
  const shortestDurationMs = Math.min(...modules.map((module) => module.durationMs).filter((duration) => duration > 0), baseDurationMs);
  const unit = autoDiagramUnit(baseDurationMs, shortestDurationMs);

  const leftWidth = 210;
  const topHeight = 76;
  const rowHeight = 94;
  const noteHeight = 50;
  const targetContentWidth = 1160;
  const fitScale = targetContentWidth / baseDurationMs;
  const readableScale = shortestDurationMs > 0 ? 30 / shortestDurationMs : fitScale;
  const pxPerMs = Math.min(9000, Math.max(fitScale, readableScale));
  const tickStepMs = niceTimeStepMs(96 / pxPerMs);
  const exportPaddingMs = modules.length === 0 ? tickStepMs : Math.max(baseDurationMs * 0.05, tickStepMs);
  const exportEndMs = Math.max(tickStepMs, usedEndMs + exportPaddingMs);
  const tickCount = Math.ceil(exportEndMs / tickStepMs) + 1;
  const finalTickMs = (tickCount - 1) * tickStepMs;
  const contentWidth = Math.max(760, Math.ceil(finalTickMs * pxPerMs + 36));
  const width = leftWidth + contentWidth;
  const height = topHeight + Math.max(1, channels.length) * rowHeight + noteHeight;

  const canvas = document.createElement("canvas");
  const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.ceil(width * ratio);
  canvas.height = Math.ceil(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(ratio, ratio);

  ctx.fillStyle = "#101316";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#eef4f7";
  ctx.font = "700 18px Inter, system-ui, sans-serif";
  const title = state.sequenceName || "Untitled sequence";
  const metadata = `${new Date().toLocaleString()} · ${channels.length} signal rows · 0-${formatTimeForUnit(finalTickMs, unit)} ${unit}`;
  ctx.font = "12px Inter, system-ui, sans-serif";
  const metadataWidth = Math.min(ctx.measureText(metadata).width, width * 0.48);
  const metadataX = Math.max(18, width - metadataWidth - 18);
  ctx.font = "700 18px Inter, system-ui, sans-serif";
  ctx.fillText(fitText(ctx, title, Math.max(80, metadataX - 34)), 18, 32);
  ctx.fillStyle = "#9caab4";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillText(fitText(ctx, metadata, metadataWidth), metadataX, 32);

  drawAxis(ctx, leftWidth, topHeight, height, pxPerMs, tickStepMs, tickCount, unit);

  channels.forEach((channel, index) => {
    const y = topHeight + index * rowHeight;
    const rowTop = y + 10;
    const rowBottom = y + rowHeight - 16;
    const signalTop = rowTop + 10;
    const signalBottom = rowBottom - 10;
    const signalMid = (signalTop + signalBottom) / 2;
    const modulesForChannel = channelModules(modules, channel);
    const plotLeft = leftWidth;
    const plotRight = width - 18;
    const xForTime = (timeMs: number) => leftWidth + timeMs * pxPerMs;

    ctx.fillStyle = index % 2 === 0 ? "#171d23" : "#141a20";
    ctx.fillRect(0, y, width, rowHeight);
    ctx.fillStyle = "#12171c";
    ctx.fillRect(0, y, leftWidth, rowHeight);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    ctx.fillStyle = "#eef4f7";
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.fillText(fitText(ctx, channel.label, leftWidth - 30), 18, y + 32);
    ctx.fillStyle = "#9caab4";
    ctx.font = "11px Inter, system-ui, sans-serif";
    const scaleLabel =
      channel.type === "ttl_output"
        ? `${model.ttlOutput.lowVoltage}-${model.ttlOutput.highVoltage} ${model.ttlOutput.unit}`
        : channel.type === "dds"
          ? ddsScaleLabel(model)
          : "measurement gate";
    ctx.fillText(scaleLabel, 18, y + 52);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(plotLeft, signalTop);
    ctx.lineTo(plotRight, signalTop);
    ctx.moveTo(plotLeft, signalMid);
    ctx.lineTo(plotRight, signalMid);
    ctx.moveTo(plotLeft, signalBottom);
    ctx.lineTo(plotRight, signalBottom);
    ctx.stroke();

    if (channel.type === "ttl_output") {
      const lowY = valueToY(model.ttlOutput.lowVoltage, model.ttlOutput.lowVoltage, model.ttlOutput.highVoltage, signalTop, signalBottom);
      const highY = valueToY(model.ttlOutput.highVoltage, model.ttlOutput.lowVoltage, model.ttlOutput.highVoltage, signalTop, signalBottom);

      ctx.fillStyle = "#8f9da8";
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.fillText(`${formatCompactNumber(model.ttlOutput.highVoltage)} ${model.ttlOutput.unit}`, leftWidth + 6, highY + 10);
      ctx.fillText(`${formatCompactNumber(model.ttlOutput.lowVoltage)} ${model.ttlOutput.unit}`, leftWidth + 6, lowY - 4);

      modulesForChannel.forEach((module) => {
        const x = xForTime(module.startMs);
        const xEnd = xForTime(endMs(module));
        const blockWidth = Math.max(2, xEnd - x);
        ctx.fillStyle = "rgba(242, 153, 74, 0.12)";
        ctx.fillRect(x, highY, blockWidth, lowY - highY);
      });

      ctx.strokeStyle = colors.ttl_output;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(plotLeft, lowY);
      modulesForChannel.forEach((module) => {
        const x = xForTime(module.startMs);
        const xEnd = xForTime(endMs(module));
        ctx.lineTo(x, lowY);
        ctx.lineTo(x, highY);
        ctx.lineTo(xEnd, highY);
        ctx.lineTo(xEnd, lowY);
      });
      ctx.lineTo(plotRight, lowY);
      ctx.stroke();
      ctx.lineWidth = 1;

      modulesForChannel.forEach((module) => {
        const x = xForTime(module.startMs);
        const xEnd = xForTime(endMs(module));
        const blockWidth = Math.max(2, xEnd - x);
        ctx.fillStyle = "#ffffff";
        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.fillText(fitText(ctx, ttlLabel(module, model), Math.max(20, blockWidth - 8)), x + 4, highY - 4);
      });
    } else if (channel.type === "dds") {
      ctx.fillStyle = "#8f9da8";
      ctx.font = "10px Inter, system-ui, sans-serif";
      const ddsMaxLabel =
        model.ddsOutput.mode === "calibrated" && model.ddsOutput.maxVoltageVpp !== undefined
          ? `+${formatCompactNumber(model.ddsOutput.maxVoltageVpp / 2)} V`
          : "+1";
      const ddsMinLabel =
        model.ddsOutput.mode === "calibrated" && model.ddsOutput.maxVoltageVpp !== undefined
          ? `-${formatCompactNumber(model.ddsOutput.maxVoltageVpp / 2)} V`
          : "-1";
      ctx.fillText(ddsMaxLabel, leftWidth + 6, signalTop + 10);
      ctx.fillText("0", leftWidth + 6, signalMid - 4);
      ctx.fillText(ddsMinLabel, leftWidth + 6, signalBottom - 4);

      ctx.strokeStyle = "rgba(47, 128, 237, 0.45)";
      ctx.beginPath();
      ctx.moveTo(plotLeft, signalMid);
      ctx.lineTo(plotRight, signalMid);
      ctx.stroke();

      modulesForChannel.forEach((module) => {
        const x = xForTime(module.startMs);
        const xEnd = xForTime(endMs(module));
        const blockWidth = Math.max(2, xEnd - x);
        const amplitudeScale = ddsAmplitudeScale(module, model);
        const amplitudeRatio = clamp(amplitudeScale.value / amplitudeScale.max, 0, 1);
        const peakPx = ((signalBottom - signalTop) / 2) * 0.86 * amplitudeRatio;
        const phaseRad = ((module.phaseDeg ?? 0) * Math.PI) / 180;
        const cycles = clamp(Math.round(blockWidth / 48), blockWidth < 60 ? 2 : 8, 20);
        const sampleCount = clamp(Math.ceil(blockWidth * 1.25), 32, 520);

        ctx.fillStyle = "rgba(47, 128, 237, 0.07)";
        ctx.fillRect(x, signalTop, blockWidth, signalBottom - signalTop);
        ctx.strokeStyle = colors.dds;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
          const progress = sampleIndex / sampleCount;
          const sx = x + progress * blockWidth;
          const theta = phaseRad + progress * cycles * Math.PI * 2;
          const sy = signalMid - Math.sin(theta) * peakPx;
          if (sampleIndex === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        ctx.lineWidth = 1;

        ctx.fillStyle = "#ffffff";
        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.fillText(fitText(ctx, ddsLabel(module), Math.max(20, blockWidth - 8)), x + 4, signalTop + 12);
      });
    } else {
      ctx.strokeStyle = "rgba(39, 174, 96, 0.38)";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(plotLeft, signalMid);
      ctx.lineTo(plotRight, signalMid);
      ctx.stroke();
      ctx.setLineDash([]);

      modulesForChannel.forEach((module) => {
        const x = xForTime(module.startMs);
        const xEnd = xForTime(endMs(module));
        const blockWidth = Math.max(2, xEnd - x);
        if (module.type === "measure") {
          ctx.fillStyle = "rgba(39, 174, 96, 0.22)";
          ctx.fillRect(x, signalTop, blockWidth, signalBottom - signalTop);
          ctx.strokeStyle = colors.measure;
          ctx.strokeRect(x, signalTop, blockWidth, signalBottom - signalTop);
        }
        ctx.fillStyle = "#ffffff";
        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.fillText(fitText(ctx, measureLabel(module, model), Math.max(20, blockWidth - 8)), x + 4, signalTop + 14);
      });
    }
  });

  const noteY = topHeight + Math.max(1, channels.length) * rowHeight + 26;
  ctx.fillStyle = "#9caab4";
  ctx.font = "12px Inter, system-ui, sans-serif";
  const note =
    model.ddsOutput.mode === "normalized"
      ? "Note: TTL outputs use the configured output model; DDS traces are normalized unless calibrated channel voltage models are provided; TTL counters are shown as measurement gates."
      : "Note: Signal traces use the configured output model; TTL counters are shown as measurement gates.";
  ctx.fillText(fitText(ctx, note, width - 36), 18, noteY);

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${sanitizeFilename(state.sequenceName)}_signals.png`;
  link.click();
}
