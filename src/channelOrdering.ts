import type { ChannelConfig } from "./types";

type ChannelOrderKey = [group: number, primary: number, secondary: number, fallback: string];

const channelOrderKey = (channelId: string): ChannelOrderKey => {
  const urukulMatch = /^urukul(\d+)_ch(\d+)$/.exec(channelId);
  if (urukulMatch) {
    return [0, Number(urukulMatch[1]), Number(urukulMatch[2]), channelId];
  }

  const ttlMatch = /^ttl(\d+)$/.exec(channelId);
  if (ttlMatch) {
    return [1, Number(ttlMatch[1]), 0, channelId];
  }

  const counterMatch = /^ttl(\d+)_counter$/.exec(channelId);
  if (counterMatch) {
    return [2, Number(counterMatch[1]), 0, channelId];
  }

  return [3, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, channelId];
};

export const compareChannelIds = (left: string, right: string) => {
  const leftKey = channelOrderKey(left);
  const rightKey = channelOrderKey(right);

  for (let index = 0; index < 3; index += 1) {
    const difference = leftKey[index] as number - (rightKey[index] as number);
    if (difference !== 0) return difference;
  }

  return leftKey[3].localeCompare(rightKey[3]);
};

export const compareChannels = (left: ChannelConfig, right: ChannelConfig) =>
  compareChannelIds(left.id, right.id);
