import type { ChannelConfig } from "./types";
import { compareChannels } from "./channelOrdering";

export const availableChannels: ChannelConfig[] = ([
  { id: "urukul0_ch0", label: "urukul0_ch0", type: "dds" },
  { id: "urukul0_ch1", label: "urukul0_ch1", type: "dds" },
  { id: "urukul0_ch2", label: "urukul0_ch2", type: "dds" },
  { id: "urukul0_ch3", label: "urukul0_ch3", type: "dds" },
  { id: "urukul1_ch0", label: "urukul1_ch0", type: "dds" },
  { id: "urukul1_ch1", label: "urukul1_ch1", type: "dds" },
  { id: "urukul1_ch2", label: "urukul1_ch2", type: "dds" },
  { id: "urukul1_ch3", label: "urukul1_ch3", type: "dds" },
  { id: "ttl0", label: "ttl0", type: "ttl_output" },
  { id: "ttl1", label: "ttl1", type: "ttl_output" },
  { id: "ttl2", label: "ttl2", type: "ttl_output" },
  { id: "ttl3", label: "ttl3", type: "ttl_output" },
  { id: "ttl4", label: "ttl4", type: "ttl_output" },
  { id: "ttl5", label: "ttl5", type: "ttl_output" },
  { id: "ttl6", label: "ttl6", type: "ttl_output" },
  { id: "ttl7", label: "ttl7", type: "ttl_output" },
  { id: "ttl12", label: "ttl12", type: "ttl_output" },
  { id: "ttl13", label: "ttl13", type: "ttl_output" },
  { id: "ttl14", label: "ttl14", type: "ttl_output" },
  { id: "ttl15", label: "ttl15", type: "ttl_output" },
  { id: "ttl8", label: "ttl8", type: "ttl_input" },
  { id: "ttl9", label: "ttl9", type: "ttl_input" },
  { id: "ttl10", label: "ttl10", type: "ttl_input" },
  { id: "ttl11", label: "ttl11", type: "ttl_input" },
  { id: "ttl8_counter", label: "ttl8_counter", type: "ttl_counter" },
  { id: "ttl9_counter", label: "ttl9_counter", type: "ttl_counter" },
  { id: "ttl10_counter", label: "ttl10_counter", type: "ttl_counter" },
  { id: "ttl11_counter", label: "ttl11_counter", type: "ttl_counter" }
] satisfies ChannelConfig[]).sort(compareChannels);

export const defaultVisibleChannelIds = ["urukul0_ch0", "urukul0_ch1", "ttl0", "ttl8_counter"];
