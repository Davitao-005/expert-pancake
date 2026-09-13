import { formatTimeForUnit } from "./timeUnits";
import type { ChannelConfig, ModuleType, SequenceModule, SequenceState, TimeUnit } from "./types";

const colors: Record<ModuleType, string> = {
  dds: "#2f80ed",
  measure: "#27ae60",
  ttl_output: "#f2994a"
};

const typeLabels: Record<ModuleType, string> = {
  dds: "DDS signal",
  measure: "Measure TTL",
  ttl_output: "TTL pulse"
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

const moduleSubtitle = (module: SequenceModule, unit: TimeUnit) => {
  const duration = `${formatTimeForUnit(module.durationMs, unit)} ${unit}`;
  if (module.type === "dds") {
    const details = [
      duration,
      module.frequencyMHz !== undefined ? `${module.frequencyMHz} MHz` : "",
      module.amplitude !== undefined ? `amp ${module.amplitude}` : "",
      module.attenuationDb !== undefined ? `att ${module.attenuationDb} dB` : "",
      module.phaseDeg !== undefined ? `phase ${module.phaseDeg} deg` : ""
    ].filter(Boolean);
    return details.join(" · ");
  }
  if (module.type === "measure") {
    return [duration, module.datasetName || "", module.edge ? `${module.edge} edges` : ""].filter(Boolean).join(" · ");
  }
  return duration;
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

const fitText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
};

const channelRowsForExport = (state: SequenceState) => {
  const usedChannelIds = new Set(state.modules.map((module) => module.channel));
  const visibleChannelIds = new Set(state.visibleChannelIds);
  return state.availableChannels.filter((channel) => usedChannelIds.has(channel.id) || visibleChannelIds.has(channel.id));
};

export function exportTimelineDiagram(state: SequenceState) {
  const channels = channelRowsForExport(state);
  const modules = [...state.modules].sort((a, b) => a.startMs - b.startMs);
  const usedEndMs = Math.max(0, ...modules.map(endMs));
  const baseDurationMs = Math.max(usedEndMs, 0.001);
  const shortestDurationMs = Math.min(...modules.map((module) => module.durationMs).filter((duration) => duration > 0), baseDurationMs);
  const unit = autoDiagramUnit(baseDurationMs, shortestDurationMs);

  const leftWidth = 190;
  const rightPaddingPx = 34;
  const topHeight = 68;
  const rowHeight = 76;
  const bottomPadding = 28;
  const targetContentWidth = 1120;
  const fitScale = targetContentWidth / baseDurationMs;
  const readableScale = shortestDurationMs > 0 ? 24 / shortestDurationMs : fitScale;
  const pxPerMs = Math.min(9000, Math.max(fitScale, readableScale));
  const preliminaryTickStepMs = niceTimeStepMs(96 / pxPerMs);
  const exportPaddingMs = modules.length === 0 ? preliminaryTickStepMs : Math.max(baseDurationMs * 0.05, preliminaryTickStepMs);
  const exportEndMs = Math.max(preliminaryTickStepMs, usedEndMs + exportPaddingMs);
  const tickStepMs = niceTimeStepMs(96 / pxPerMs);
  const tickCount = Math.ceil(exportEndMs / tickStepMs) + 1;
  const finalTickMs = (tickCount - 1) * tickStepMs;
  const contentWidth = Math.max(720, Math.ceil(finalTickMs * pxPerMs + rightPaddingPx));
  const width = leftWidth + contentWidth;
  const height = topHeight + Math.max(1, channels.length) * rowHeight + bottomPadding;

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
  const metadata = `${new Date().toLocaleString()} · ${channels.length} channels · 0-${formatTimeForUnit(finalTickMs, unit)} ${unit}`;
  ctx.font = "12px Inter, system-ui, sans-serif";
  const metadataWidth = Math.min(ctx.measureText(metadata).width, width * 0.48);
  const metadataX = Math.max(18, width - metadataWidth - 18);
  ctx.font = "700 18px Inter, system-ui, sans-serif";
  const fittedTitle = fitText(ctx, title, Math.max(80, metadataX - 34));
  ctx.fillText(fittedTitle, 18, 32);
  ctx.fillStyle = "#9caab4";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillText(fitText(ctx, metadata, metadataWidth), metadataX, 32);

  ctx.fillStyle = "#151a20";
  ctx.fillRect(0, topHeight - 30, width, 30);
  ctx.fillStyle = "#12171c";
  ctx.fillRect(0, topHeight - 30, leftWidth, 30);
  ctx.strokeStyle = "#333d46";
  ctx.beginPath();
  ctx.moveTo(leftWidth, topHeight - 30);
  ctx.lineTo(leftWidth, height - bottomPadding);
  ctx.stroke();

  ctx.font = "12px Inter, system-ui, sans-serif";
  for (let index = 0; index < tickCount; index += 1) {
    const timeMs = index * tickStepMs;
    const x = leftWidth + timeMs * pxPerMs;
    ctx.strokeStyle = index === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(x, topHeight - 30);
    ctx.lineTo(x, height - bottomPadding);
    ctx.stroke();
    ctx.fillStyle = "#9caab4";
    ctx.fillText(`${formatTimeForUnit(timeMs, unit)} ${unit}`, x + 4, topHeight - 10);
  }

  channels.forEach((channel: ChannelConfig, index: number) => {
    const y = topHeight + index * rowHeight;
    ctx.fillStyle = index % 2 === 0 ? "#171d23" : "#141a20";
    ctx.fillRect(0, y, width, rowHeight);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    ctx.fillStyle = "#12171c";
    ctx.fillRect(0, y, leftWidth, rowHeight);
    ctx.fillStyle = "#eef4f7";
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.fillText(fitText(ctx, channel.label, leftWidth - 28), 18, y + 30);
    ctx.fillStyle = "#9caab4";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.fillText(channel.type.replace("_", " ").toUpperCase(), 18, y + 50);
  });

  modules.forEach((module) => {
    const channelIndex = channels.findIndex((channel) => channel.id === module.channel);
    if (channelIndex < 0) return;
    const x = leftWidth + module.startMs * pxPerMs;
    const y = topHeight + channelIndex * rowHeight + 14;
    const blockWidth = Math.max(38, module.durationMs * pxPerMs);
    const blockHeight = 48;
    ctx.fillStyle = colors[module.type];
    drawRoundedRect(ctx, x, y, blockWidth, blockHeight, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    ctx.stroke();

    const labelPadding = 10;
    const maxTextWidth = Math.max(10, blockWidth - labelPadding * 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.fillText(fitText(ctx, module.name || typeLabels[module.type], maxTextWidth), x + labelPadding, y + 18);
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillText(fitText(ctx, moduleSubtitle(module, unit), maxTextWidth), x + labelPadding, y + 35);
  });

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${sanitizeFilename(state.sequenceName)}_timeline.png`;
  link.click();
}
