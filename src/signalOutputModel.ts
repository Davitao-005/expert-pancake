export type SignalOutputModel = {
  ttlOutput: {
    lowVoltage: number;
    highVoltage: number;
    unit: "V";
  };
  ddsOutput: {
    mode: "normalized" | "calibrated";
    normalizedMax: number;
    maxVoltageVpp?: number;
    applyAttenuationDb: boolean;
  };
  measurementGate: {
    label: string;
  };
};

export const defaultSignalOutputModel: SignalOutputModel = {
  ttlOutput: {
    lowVoltage: 0,
    highVoltage: 5,
    unit: "V"
  },
  ddsOutput: {
    mode: "normalized",
    normalizedMax: 1,
    maxVoltageVpp: undefined,
    applyAttenuationDb: false
  },
  measurementGate: {
    label: "measurement gate"
  }
};

